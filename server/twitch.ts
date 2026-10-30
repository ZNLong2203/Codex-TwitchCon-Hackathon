import WebSocket from 'ws';
import { z } from 'zod';
import type { MissionEngine } from './engine.js';

export type Connection = {
  status: 'offline' | 'connecting' | 'live' | 'reconnecting' | 'error';
  channel: string;
  message: string;
  subscriptions: number;
  apiCalls: number;
  received: number;
  acceptedCommands: number;
  incomingRaids: number;
  lastAcceptedAt: number | null;
  recoveries: number;
};
const validationSchema = z.object({
  client_id: z.string(),
  login: z.string(),
  user_id: z.string(),
  scopes: z.array(z.string()),
  expires_in: z.number(),
});
const messageSchema = z.object({
  metadata: z.object({
    message_id: z.string(),
    message_type: z.string(),
    subscription_type: z.string().optional(),
  }),
  payload: z.object({
    session: z
      .object({
        id: z.string(),
        keepalive_timeout_seconds: z.number().nullable().optional(),
        reconnect_url: z.string().nullable().optional(),
      })
      .optional(),
    subscription: z
      .object({ type: z.string(), status: z.string().optional() })
      .passthrough()
      .optional(),
    event: z.unknown().optional(),
  }),
});
const chatSchema = z.object({
  broadcaster_user_id: z.string(),
  chatter_user_id: z.string(),
  chatter_user_name: z.string(),
  message_id: z.string(),
  message: z.object({ text: z.string() }),
  source_broadcaster_user_id: z.string().nullable().optional(),
});
const raidSchema = z.object({
  to_broadcaster_user_id: z.string(),
  from_broadcaster_user_name: z.string(),
  viewers: z.number().int().nonnegative(),
});

// The adapter accepts only the two supported, validated EventSub event types.
export function ingestNotification(engine: MissionEngine, raw: unknown, broadcasterId: string) {
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success || parsed.data.metadata.message_type !== 'notification') return false;
  const { metadata, payload } = parsed.data;
  if (
    payload.subscription?.type === 'channel.chat.message' &&
    metadata.subscription_type === 'channel.chat.message'
  ) {
    const event = chatSchema.safeParse(payload.event);
    if (!event.success || event.data.broadcaster_user_id !== broadcasterId) return false;
    // Avoid counting another channel's messages relayed by Shared Chat.
    if (
      event.data.source_broadcaster_user_id &&
      event.data.source_broadcaster_user_id !== broadcasterId
    )
      return false;
    return engine.chat({
      id: event.data.message_id,
      userId: event.data.chatter_user_id,
      name: event.data.chatter_user_name,
      text: event.data.message.text,
    }).accepted;
  }
  if (
    payload.subscription?.type === 'channel.raid' &&
    metadata.subscription_type === 'channel.raid'
  ) {
    const event = raidSchema.safeParse(payload.event);
    if (!event.success || event.data.to_broadcaster_user_id !== broadcasterId) return false;
    return engine.raid({
      id: metadata.message_id,
      name: event.data.from_broadcaster_user_name,
      viewers: event.data.viewers,
    });
  }
  return false;
}

export class TwitchBridge {
  connection: Connection = {
    status: 'offline',
    channel: '',
    message: 'Rehearsal mode · no Twitch account needed',
    subscriptions: 0,
    apiCalls: 0,
    received: 0,
    acceptedCommands: 0,
    incomingRaids: 0,
    lastAcceptedAt: null,
    recoveries: 0,
  };
  private socket?: WebSocket;
  private candidate?: WebSocket;
  private token = '';
  private clientId = '';
  private userId = '';
  private generation = 0;
  private retries = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private validationTimer?: ReturnType<typeof setInterval>;
  private watchdog?: ReturnType<typeof setInterval>;
  private lastMessage = 0;
  private timeoutMs = 30_000;
  constructor(
    private engine: MissionEngine,
    private changed: () => void,
  ) {}
  private update(patch: Partial<Connection>) {
    this.connection = { ...this.connection, ...patch };
    this.changed();
  }
  private async request(url: string, init: RequestInit = {}) {
    this.connection.apiCalls++;
    return fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  }
  private async validate() {
    const response = await this.request('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${this.token}` },
    });
    if (!response.ok)
      throw new Error('Twitch authorization expired or was revoked. Connect again.');
    const result = validationSchema.parse(await response.json());
    if (result.client_id !== this.clientId || !result.scopes.includes('user:read:chat'))
      throw new Error('The token must belong to this client ID and grant user:read:chat.');
    if (this.userId && this.userId !== result.user_id)
      throw new Error('The authorized account changed. Connect again.');
    return result;
  }
  async connect(clientId: string, token: string) {
    this.disconnect();
    const generation = this.generation;
    this.token = token;
    this.clientId = clientId;
    this.update({
      status: 'connecting',
      channel: '',
      message: 'Validating broadcaster authorization…',
      subscriptions: 0,
      apiCalls: 0,
      received: 0,
      acceptedCommands: 0,
      incomingRaids: 0,
      lastAcceptedAt: null,
      recoveries: 0,
    });
    try {
      const identity = await this.validate();
      if (generation !== this.generation) return;
      this.userId = identity.user_id;
      this.update({ channel: identity.login, message: 'Opening EventSub connection…' });
      this.open('wss://eventsub.wss.twitch.tv/ws', false, generation);
      this.validationTimer = setInterval(() => {
        void this.validate().catch((e) => {
          if (generation === this.generation) this.fail(e);
        });
      }, 3_600_000);
      this.watchdog = setInterval(() => {
        if (this.socket && Date.now() - this.lastMessage > this.timeoutMs + 5000)
          this.socket.terminate();
      }, 5000);
    } catch (e) {
      if (generation === this.generation) this.fail(e);
      throw e;
    }
  }
  private open(url: string, migrating: boolean, generation: number) {
    if (generation !== this.generation) return;
    const socket = new WebSocket(url, { handshakeTimeout: 12_000, maxPayload: 128 * 1024 });
    if (migrating) this.candidate = socket;
    else {
      this.socket = socket;
      this.lastMessage = Date.now();
    }
    socket.on('error', () => {
      /* close schedules bounded reconnect; never log credentials or URLs */
    });
    socket.on('message', (data) => {
      if (generation !== this.generation) return;
      let parsed: ReturnType<typeof messageSchema.safeParse>;
      try {
        parsed = messageSchema.safeParse(JSON.parse(data.toString()));
      } catch {
        return;
      }
      if (!parsed.success) return;
      this.lastMessage = Date.now();
      const { metadata, payload } = parsed.data;
      if (metadata.message_type === 'session_welcome' && payload.session) {
        this.timeoutMs = (payload.session.keepalive_timeout_seconds ?? 30) * 1000;
        if (migrating) {
          const old = this.socket;
          this.socket = socket;
          this.candidate = undefined;
          old?.close();
          this.retries = 0;
          this.connection.recoveries++;
          this.update({
            status: 'live',
            message: 'EventSub session migrated · subscriptions preserved',
          });
        } else {
          void this.subscribe(payload.session.id, generation).catch((e) => {
            if (generation === this.generation) this.fail(e);
          });
        }
      } else if (metadata.message_type === 'session_reconnect' && payload.session?.reconnect_url) {
        const target = new URL(payload.session.reconnect_url);
        if (target.protocol !== 'wss:' || target.hostname !== 'eventsub.wss.twitch.tv') {
          this.fail(new Error('Unexpected Twitch reconnect host.'));
          return;
        }
        if (!this.candidate) {
          this.update({ status: 'reconnecting', message: 'Twitch requested a session handoff…' });
          this.open(target.href, true, generation);
        }
      } else if (metadata.message_type === 'revocation') {
        this.fail(new Error('Twitch revoked an EventSub subscription. Reconnect your account.'));
      } else if (metadata.message_type === 'notification') {
        this.connection.received++;
        if (
          this.engine.state.source === 'twitch' &&
          ingestNotification(this.engine, parsed.data, this.userId)
        ) {
          if (payload.subscription?.type === 'channel.raid') this.connection.incomingRaids++;
          else this.connection.acceptedCommands++;
          this.connection.lastAcceptedAt = Date.now();
        }
        this.changed();
      }
    });
    socket.on('close', (code) => {
      if (generation !== this.generation) return;
      if (socket === this.candidate) {
        this.candidate = undefined;
        this.socket?.terminate();
        return;
      }
      if (socket !== this.socket) return;
      this.socket = undefined;
      if ([4004, 4006, 4007].includes(code)) {
        this.fail(new Error(`Twitch closed the session (${code}). Reconnect your account.`));
        return;
      }
      this.update({
        status: 'reconnecting',
        subscriptions: 0,
        message: 'Connection interrupted. Events during disconnection cannot be replayed.',
      });
      const delay = Math.min(30_000, 1000 * 2 ** this.retries++) + Math.random() * 500;
      this.reconnectTimer = setTimeout(
        () => this.open('wss://eventsub.wss.twitch.tv/ws', false, generation),
        delay,
      );
    });
  }
  private async subscribe(sessionId: string, generation: number) {
    const definitions = [
      {
        type: 'channel.chat.message',
        condition: { broadcaster_user_id: this.userId, user_id: this.userId },
      },
      { type: 'channel.raid', condition: { to_broadcaster_user_id: this.userId } },
    ];
    let count = 0;
    for (const definition of definitions) {
      if (generation !== this.generation) return;
      const response = await this.request('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Client-Id': this.clientId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...definition,
          version: '1',
          transport: { method: 'websocket', session_id: sessionId },
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'Twitch API limit reached. Wait before reconnecting.'
            : `Twitch subscription failed (${response.status}). Verify broadcaster login and chat permission.`,
        );
      count++;
    }
    if (generation !== this.generation) return;
    if (this.retries > 0) this.connection.recoveries++;
    this.retries = 0;
    this.update({
      status: 'live',
      subscriptions: count,
      message: 'Listening to your channel · chat + incoming raids',
    });
  }
  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : 'Twitch connection failed.';
    this.disconnect();
    this.update({ status: 'error', message });
  }
  disconnect() {
    this.generation++;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.validationTimer);
    clearInterval(this.watchdog);
    this.socket?.close();
    this.candidate?.close();
    this.socket = undefined;
    this.candidate = undefined;
    this.token = '';
    this.clientId = '';
    this.userId = '';
    this.retries = 0;
    this.update({
      status: 'offline',
      channel: '',
      subscriptions: 0,
      message: 'Rehearsal mode · no Twitch account needed',
    });
  }
}
