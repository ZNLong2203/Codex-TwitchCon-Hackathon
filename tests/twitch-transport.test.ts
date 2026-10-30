import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type WebSocket from 'ws';
import { MissionEngine } from '../server/engine.js';
import { TwitchBridge } from '../server/twitch.js';

const secret = 'fixture-token-never-a-real-credential';
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
class Socket extends EventEmitter {
  closed = false;
  closes = 0;
  constructor(readonly url: string) {
    super();
  }
  open() {
    this.emit('open');
  }
  receive(message: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(message)));
  }
  finish(code = 1006) {
    if (this.closed) return;
    this.closed = true;
    this.emit('close', code);
  }
  close() {
    this.closes++;
    this.finish(1000);
  }
  terminate() {
    this.finish();
  }
}
function envelope(type: string, payload: object, subscriptionType?: string) {
  return {
    metadata: {
      message_type: type,
      message_id: crypto.randomUUID(),
      subscription_type: subscriptionType,
    },
    payload,
  };
}
const welcome = (id: string) =>
  envelope('session_welcome', { session: { id, keepalive_timeout_seconds: 10 } });
const reconnect = (url: string) =>
  envelope('session_reconnect', {
    session: { id: 'old', reconnect_url: url, keepalive_timeout_seconds: null },
  });
const keepalive = () => envelope('session_keepalive', {});
const chat = (id = 'one') =>
  envelope(
    'notification',
    {
      subscription: { type: 'channel.chat.message' },
      event: {
        broadcaster_user_id: 'broadcaster',
        chatter_user_id: id,
        chatter_user_name: 'Fixture crew',
        message_id: id,
        message: { text: '!scan' },
      },
    },
    'channel.chat.message',
  );
async function setup(t: TestContext, overrides: { fetch?: typeof fetch } = {}) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 1000 });
  const sockets: Socket[] = [];
  const requests: { url: string; init?: RequestInit }[] = [];
  const engine = new MissionEngine();
  engine.reset({ ...engine.state.settings, mode: 'expedition' }, 'twitch');
  engine.control('start');
  const bridge = new TwitchBridge(engine, () => {}, {
    socket: (url) => {
      const socket = new Socket(url);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      if (overrides.fetch) return overrides.fetch(url, init);
      return String(url).endsWith('/validate') ? identity() : Response.json({}, { status: 202 });
    },
  });
  t.after(() => bridge.disconnect());
  await bridge.connect('fixture-client', secret);
  const first = sockets[0]!;
  first.open();
  return {
    engine,
    bridge,
    sockets,
    requests,
    first,
    live: async () => {
      first.receive(welcome('original-session'));
      await flush();
    },
  };
}
function identity(patch = {}) {
  return Response.json({
    client_id: 'fixture-client',
    login: 'fixture-channel',
    user_id: 'broadcaster',
    scopes: ['user:read:chat'],
    expires_in: 3600,
    ...patch,
  });
}
test('transport validates identity and creates exactly two authenticated subscriptions after welcome', async (t) => {
  const f = await setup(t);
  assert.equal(f.bridge.connection.status, 'connecting');
  assert.equal(f.requests.length, 1);
  await f.live();
  assert.equal(f.bridge.connection.status, 'live');
  assert.equal(f.bridge.connection.subscriptions, 2);
  assert.equal(f.bridge.connection.apiCalls, 3);
  assert.deepEqual(
    f.requests.slice(1).map((r) => JSON.parse(r.init!.body as string).type),
    ['channel.chat.message', 'channel.raid'],
  );
  for (const r of f.requests.slice(1)) {
    assert.equal((r.init!.headers as Record<string, string>).Authorization, `Bearer ${secret}`);
    assert.deepEqual(JSON.parse(r.init!.body as string).transport, {
      method: 'websocket',
      session_id: 'original-session',
    });
  }
  f.first.receive(welcome('duplicate-welcome'));
  await flush();
  assert.equal(f.requests.length, 3);
  assert.ok(!JSON.stringify(f.bridge.connection).includes(secret));
});
test('transport telemetry counts accepted commands and raids, not duplicate or ignored messages', async (t) => {
  const f = await setup(t);
  await f.live();
  f.first.receive(chat());
  f.first.receive(chat());
  const raid = envelope(
    'notification',
    {
      subscription: { type: 'channel.raid' },
      event: {
        to_broadcaster_user_id: 'broadcaster',
        from_broadcaster_user_name: 'Fixture raid',
        viewers: 20,
      },
    },
    'channel.raid',
  );
  f.first.receive(raid);
  f.first.receive(raid);
  assert.equal(f.bridge.connection.received, 4);
  assert.equal(f.bridge.connection.acceptedCommands, 1);
  assert.equal(f.bridge.connection.incomingRaids, 1);
  assert.equal(f.engine.state.actions, 1);
});
test('4006 transient network error reconnects with new subscriptions and records one recovery', async (t) => {
  const f = await setup(t);
  await f.live();
  f.first.finish(4006);
  assert.equal(f.bridge.connection.status, 'reconnecting');
  t.mock.timers.tick(1500);
  const next = f.sockets[1]!;
  next.open();
  next.receive(welcome('replacement-session'));
  await flush();
  assert.equal(f.bridge.connection.status, 'live');
  assert.equal(f.bridge.connection.recoveries, 1);
  assert.equal(f.requests.length, 5);
  assert.equal(
    JSON.parse(f.requests[4]!.init!.body as string).transport.session_id,
    'replacement-session',
  );
});
test('requested migration preserves the opaque URL and subscriptions, then ignores the retired socket', async (t) => {
  const f = await setup(t);
  await f.live();
  const url = 'wss://eventsub.wss.twitch.tv/ws?reconnect=opaque%2Bvalue';
  f.first.receive(reconnect(url));
  assert.equal(f.first.closed, false);
  assert.equal(f.sockets[1]!.url, url);
  f.first.receive(chat('before-handoff'));
  const next = f.sockets[1]!;
  next.open();
  next.receive(welcome('migrated-session'));
  await flush();
  assert.equal(f.first.closed, true);
  assert.equal(f.bridge.connection.status, 'live');
  assert.equal(f.requests.length, 3);
  f.first.receive(chat('after-retirement'));
  next.receive(chat('on-replacement'));
  assert.equal(f.bridge.connection.acceptedCommands, 2);
  assert.equal(f.bridge.connection.recoveries, 1);
});
test('old socket closing during migration does not discard a viable replacement', async (t) => {
  const f = await setup(t);
  await f.live();
  f.first.receive(reconnect('wss://eventsub.wss.twitch.tv/ws?reconnect=fixture'));
  f.first.finish(4004);
  const next = f.sockets[1]!;
  next.open();
  next.receive(welcome('migrated'));
  await flush();
  assert.equal(f.bridge.connection.status, 'live');
  assert.equal(f.requests.length, 3);
  assert.equal(f.bridge.connection.subscriptions, 2);
});
test('failed migration falls back to a fresh socket without duplicate reconnect timers', async (t) => {
  const f = await setup(t);
  await f.live();
  f.first.receive(reconnect('wss://eventsub.wss.twitch.tv/ws?reconnect=fixture'));
  f.sockets[1]!.finish();
  assert.equal(f.first.closed, true);
  t.mock.timers.tick(1500);
  assert.equal(f.sockets.length, 3);
  assert.equal(f.sockets[2]!.url, 'wss://eventsub.wss.twitch.tv/ws');
  f.sockets[2]!.open();
  f.sockets[2]!.receive(welcome('fresh'));
  await flush();
  assert.equal(f.bridge.connection.status, 'live');
  assert.equal(f.requests.length, 5);
});
for (const url of [
  'not a URL',
  'wss://eventsub.wss.twitch.tv/ws#fragment',
  'ws://eventsub.wss.twitch.tv/ws',
  'wss://evil.example/ws',
  'wss://user:password@eventsub.wss.twitch.tv/ws',
  'wss://eventsub.wss.twitch.tv:444/ws',
]) {
  test(`malformed or untrusted reconnect destination is rejected without throwing: ${url}`, async (t) => {
    const f = await setup(t);
    await f.live();
    assert.doesNotThrow(() => f.first.receive(reconnect(url)));
    assert.equal(f.bridge.connection.status, 'error');
    assert.equal(f.sockets.length, 1);
    assert.ok(!f.bridge.connection.message.includes('password'));
  });
}
test('socket without a welcome times out and reconnects; pre-welcome notifications cannot score', async (t) => {
  const f = await setup(t);
  f.first.receive(chat());
  assert.equal(f.engine.state.actions, 0);
  t.mock.timers.tick(10000);
  assert.equal(f.first.closed, true);
  assert.equal(f.bridge.connection.status, 'reconnecting');
  t.mock.timers.tick(1500);
  assert.equal(f.sockets.length, 2);
});
test('keepalives reset the watchdog; missing keepalives terminate and recover', async (t) => {
  const f = await setup(t);
  await f.live();
  t.mock.timers.tick(10000);
  f.first.receive(keepalive());
  t.mock.timers.tick(10000);
  assert.equal(f.first.closed, false);
  t.mock.timers.tick(10000);
  assert.equal(f.first.closed, true);
  assert.equal(f.bridge.connection.status, 'reconnecting');
});
test('revocation disconnects immediately and disconnect cancels pending recovery timers', async (t) => {
  const f = await setup(t);
  await f.live();
  f.first.receive(
    envelope('revocation', {
      subscription: { type: 'channel.chat.message', status: 'authorization_revoked' },
    }),
  );
  assert.equal(f.bridge.connection.status, 'error');
  assert.equal(f.first.closed, true);
  t.mock.timers.tick(3600000);
  await flush();
  assert.equal(f.requests.length, 3);
  assert.equal(f.sockets.length, 1);
});
test('late HTTP response from a retired session cannot fail the new live session', async (t) => {
  let finishOld!: (response: Response) => void;
  let subscriptions = 0;
  const f = await setup(t, {
    fetch: async (url) => {
      if (String(url).endsWith('/validate')) return identity();
      subscriptions++;
      if (subscriptions === 1)
        return new Promise<Response>((resolve) => {
          finishOld = resolve;
        });
      return Response.json({}, { status: 202 });
    },
  });
  f.first.receive(welcome('old'));
  await flush();
  f.first.finish(4006);
  t.mock.timers.tick(1500);
  const next = f.sockets[1]!;
  next.open();
  next.receive(welcome('new'));
  await flush();
  assert.equal(f.bridge.connection.status, 'live');
  finishOld(Response.json({}, { status: 401 }));
  await flush();
  assert.equal(f.bridge.connection.status, 'live');
  assert.equal(f.bridge.connection.subscriptions, 2);
});
test('reconnect attempts are bounded and explicit disconnect prevents delayed socket creation', async (t) => {
  const f = await setup(t);
  for (let i = 0; i < 7; i++) {
    f.sockets.at(-1)!.finish();
    t.mock.timers.tick(31000);
  }
  assert.equal(f.bridge.connection.status, 'error');
  assert.match(f.bridge.connection.message, /limit/);
  assert.equal(f.sockets.length, 7);
  f.bridge.disconnect();
  t.mock.timers.tick(60000);
  assert.equal(f.sockets.length, 7);
});
test('unexpected fetch errors never echo credentials or provider bodies', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'], now: 1000 });
  const bridge = new TwitchBridge(new MissionEngine(), () => {}, {
    fetch: async () => {
      throw new Error(secret);
    },
  });
  t.after(() => bridge.disconnect());
  await assert.rejects(bridge.connect('fixture-client', secret), /Could not reach Twitch/);
  assert.ok(!bridge.connection.message.includes(secret));
});

test('disconnect during a pending reconnect cancels timers and ignores retired messages', async (t) => {
  const f = await setup(t);
  await f.live();
  f.first.finish(4006);
  f.bridge.disconnect();
  t.mock.timers.tick(60000);
  f.first.receive(chat('retired'));
  assert.equal(f.sockets.length, 1);
  assert.equal(f.bridge.connection.status, 'offline');
  assert.equal(f.engine.state.actions, 0);
});
for (const patch of [{ client_id: 'another-client' }, { scopes: [] }, { expires_in: 0 }]) {
  test(`invalid authorization creates no sockets: ${JSON.stringify(patch)}`, async (t) => {
    const sockets: unknown[] = [];
    const bridge = new TwitchBridge(new MissionEngine(), () => {}, {
      fetch: async () => identity(patch),
      socket: () => {
        sockets.push(1);
        throw new Error('Must not open');
      },
    });
    t.after(() => bridge.disconnect());
    await assert.rejects(bridge.connect('fixture-client', secret));
    assert.equal(sockets.length, 0);
    assert.equal(bridge.connection.status, 'error');
  });
}
for (const status of [401, 429]) {
  test(`subscription rejection ${status} stops instead of retrying indefinitely`, async (t) => {
    const f = await setup(t, {
      fetch: async (url) =>
        String(url).endsWith('/validate')
          ? identity()
          : Response.json({ error: secret }, { status }),
    });
    await f.live();
    assert.equal(f.bridge.connection.status, 'error');
    t.mock.timers.tick(60000);
    assert.equal(f.requests.length, 2);
    assert.equal(f.sockets.length, 1);
    assert.ok(!f.bridge.connection.message.includes(secret));
  });
}
test('hourly authorization revocation stops an otherwise healthy keepalive stream', async (t) => {
  let validations = 0;
  const f = await setup(t, {
    fetch: async (url) =>
      String(url).endsWith('/validate')
        ? ++validations === 1
          ? identity()
          : Response.json({}, { status: 401 })
        : Response.json({}, { status: 202 }),
  });
  await f.live();
  const pulse = setInterval(() => f.first.receive(keepalive()), 5000);
  t.after(() => clearInterval(pulse));
  t.mock.timers.tick(3600000);
  await flush();
  assert.equal(validations, 2);
  assert.equal(f.bridge.connection.status, 'error');
  assert.equal(f.first.closed, true);
});

test('a WebSocket construction failure is safe and starts no periodic validation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let calls = 0;
  const bridge = new TwitchBridge(new MissionEngine(), () => {}, {
    fetch: async () => {
      calls++;
      return identity();
    },
    socket: () => {
      throw new Error(secret);
    },
  });
  t.after(() => bridge.disconnect());
  await bridge.connect('fixture-client', secret);
  assert.equal(bridge.connection.status, 'error');
  assert.ok(!bridge.connection.message.includes(secret));
  t.mock.timers.tick(3600000);
  await flush();
  assert.equal(calls, 1);
});
