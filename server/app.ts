import express, { type Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { MissionEngine, roles, roleInfo, settingsSchema } from './engine.js';
import { TwitchBridge } from './twitch.js';
import { DirectorError, MissionDirector } from './director.js';
import { normalizeGeminiKey, geminiKeyError } from '../shared/api-key.js';

export function createApplication(options: {
  port: number;
  persist?: boolean;
  dataDir?: string;
  director?: { key?: string; fetch?: typeof fetch; clock?: () => number };
}) {
  const app = express();
  app.disable('x-powered-by');
  const engine = new MissionEngine();
  const cookie = randomBytes(32).toString('hex');
  const overlayKey = randomBytes(24).toString('hex');
  const clients = new Map<Response, boolean>();
  const origins = new Set([`http://localhost:${options.port}`, `http://127.0.0.1:${options.port}`]);
  const hosts = new Set([`localhost:${options.port}`, `127.0.0.1:${options.port}`]);
  const dataDir = options.dataDir ?? resolve('private/runtime');
  const snapshot = resolve(dataDir, 'mission.json');
  if (options.persist !== false && existsSync(snapshot)) {
    try {
      engine.restore(JSON.parse(readFileSync(snapshot, 'utf8')));
    } catch {
      console.warn('Ignoring invalid mission snapshot; starting a new mission.');
    }
  }
  let dirty = false;
  let lastBroadcast = 0;
  const director = new MissionDirector({
    ...options.director,
    key: options.director?.key ?? process.env.GEMINI_API_KEY,
    changed: () => {
      dirty = true;
    },
  });
  let directorTheme = 'A hopeful rescue beyond the last lighthouse';
  let directorLanguage: 'en' | 'vi' = 'en';
  let lastRaid = '';
  const bridge = new TwitchBridge(engine, () => {
    dirty = true;
  });
  let demoTimer: ReturnType<typeof setInterval> | undefined;
  let demoIndex = 0;
  const state = () => ({
    mission: engine.view(),
    connection: bridge.connection,
    demoRunning: !!demoTimer,
    now: Date.now(),
    ai: director.view(engine.state.id),
  });
  function broadcast() {
    dirty = true;
    if (Date.now() - lastBroadcast < 200) return; // At most 5 state frames/s, even in a busy chat.
    const snapshot = state();
    const { ai: _, ...spectator } = snapshot;
    const frame = `data: ${JSON.stringify(snapshot)}\n\n`;
    const displayFrame = `data: ${JSON.stringify(spectator)}\n\n`;
    for (const [client, operator] of clients) {
      if (client.writableLength > 256_000) {
        client.end();
        clients.delete(client);
      } else client.write(operator ? frame : displayFrame);
    }
    lastBroadcast = Date.now();
  }
  function stopDemo() {
    clearInterval(demoTimer);
    demoTimer = undefined;
  }
  app.use((req, res, next) => {
    if (!hosts.has(req.headers.host ?? '')) {
      res.status(403).json({ error: 'This app accepts local connections only.' });
      return;
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.headers.origin && !origins.has(req.headers.origin)) {
      res.status(403).json({ error: 'Cross-origin access denied.' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, version: '0.1.0' }));
  app.get('/api/events', (req, res) => {
    const authorized = req.headers.cookie
      ?.split(';')
      .some((c) => c.trim() === `rr_session=${cookie}`);
    if (!authorized && req.query.key !== overlayKey) {
      res.status(401).end();
      return;
    }
    if (clients.size >= 12) {
      res.status(429).end();
      return;
    }
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    const snapshot = state();
    const { ai: _, ...spectator } = snapshot;
    const operator = authorized && req.query.key !== overlayKey;
    res.write(`data: ${JSON.stringify(operator ? snapshot : spectator)}\n\n`);
    clients.set(res, !!operator);
    req.on('close', () => clients.delete(res));
  });
  app.use('/api', (req, res, next) => {
    const authorized = req.headers.cookie
      ?.split(';')
      .some((c) => c.trim() === `rr_session=${cookie}`);
    if (!authorized) {
      res.status(401).json({ error: 'Open the dashboard on this computer first.' });
      return;
    }
    if (req.method !== 'GET' && !origins.has(req.headers.origin ?? '')) {
      res.status(403).json({ error: 'A local origin is required.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/state', (_req, res) => res.json(state()));
  app.get('/api/config', (_req, res) =>
    res.json({
      clientId: process.env.TWITCH_CLIENT_ID ?? '',
      overlayUrl: `http://localhost:${options.port}/overlay?key=${overlayKey}`,
    }),
  );
  app.post('/api/ai/configure', (req, res) => {
    const parsed = z
      .object({
        apiKey: z.string().max(1024).optional(),
        budgetUsd: z.number().min(0.01).max(10),
        autoDraftOnRaid: z.boolean(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      throw new DirectorError(
        field === 'budgetUsd'
          ? 'AI budget must be a number from $0.01 to $10. Use a decimal point, for example 0.25.'
          : field === 'autoDraftOnRaid'
            ? 'The automatic raid option is invalid. Reload the AI settings and try again.'
            : 'The API key field is invalid. Paste the key value from Google AI Studio.',
      );
    }
    const input = parsed.data;
    if (input.apiKey !== undefined) {
      const problem = geminiKeyError(input.apiKey);
      if (problem) throw new DirectorError(problem);
      input.apiKey = normalizeGeminiKey(input.apiKey);
    }
    director.configure(input);
    broadcast();
    res.json(state());
  });
  app.post('/api/ai/disconnect', (_req, res) => {
    director.disconnect();
    broadcast();
    res.json(state());
  });
  app.post('/api/ai/generate', async (req, res) => {
    const input = z
      .object({ theme: z.string().trim().min(3).max(240), language: z.enum(['en', 'vi']) })
      .parse(req.body);
    if (!['ready', 'active', 'paused'].includes(engine.state.status))
      throw new DirectorError('Load a fresh flight before requesting an AI mission.', 409);
    directorTheme = input.theme;
    directorLanguage = input.language;
    await director.generate(engine.view(), input.theme, input.language);
    broadcast();
    res.json(state());
  });
  app.post('/api/ai/sample', (_req, res) => {
    director.sample(engine.view());
    broadcast();
    res.json(state());
  });
  app.post('/api/ai/discard', (_req, res) => {
    director.discard();
    broadcast();
    res.json(state());
  });
  app.post('/api/ai/approve', (req, res) => {
    const { draftId } = z.object({ draftId: z.string().uuid() }).parse(req.body);
    const draft = director.view(engine.state.id).pending;
    if (!draft || draft.id !== draftId)
      throw new DirectorError('This draft is no longer available. Generate a new draft.', 409);
    try {
      engine.approveDirector(draft);
    } catch (error) {
      throw new DirectorError(
        error instanceof Error ? error.message : 'This draft cannot be approved.',
        409,
      );
    }
    director.discard();
    broadcast();
    res.json(state());
  });
  app.post('/api/control', (req, res) => {
    const { action } = z
      .object({ action: z.enum(['start', 'pause', 'resume', 'end', 'reset']) })
      .parse(req.body);
    if (
      action === 'start' &&
      engine.state.source === 'twitch' &&
      bridge.connection.status !== 'live'
    ) {
      res.status(409).json({ error: 'Connect Twitch before starting a live mission.' });
      return;
    }
    if (action === 'reset') {
      stopDemo();
      engine.reset();
    } else engine.control(action);
    if (['end', 'pause'].includes(action)) stopDemo();
    broadcast();
    res.json(state());
  });
  app.post('/api/settings', (req, res) => {
    const body = z
      .object({ settings: settingsSchema, source: z.enum(['twitch', 'rehearsal']) })
      .parse(req.body);
    if (['active', 'paused'].includes(engine.state.status)) {
      res.status(409).json({ error: 'End the current mission before changing its flight plan.' });
      return;
    }
    stopDemo();
    engine.reset(body.settings, body.source);
    broadcast();
    res.json(state());
  });
  app.post('/api/rehearsal', (req, res) => {
    if (engine.state.source !== 'rehearsal') {
      res.status(409).json({ error: 'Simulated events are disabled in Twitch mode.' });
      return;
    }
    const body = z
      .object({
        action: z.enum(['crew', 'raid', 'autoplay', 'stop']),
        role: z.enum(roles).optional(),
      })
      .parse(req.body);
    if (body.action === 'stop') stopDemo();
    else if (engine.state.status !== 'active') {
      res.status(409).json({ error: 'Start the mission to rehearse.' });
      return;
    } else if (body.action === 'raid')
      engine.raid({ id: randomUUID(), name: 'nebula_nova', viewers: 42 });
    else if (body.action === 'crew')
      engine.chat({
        id: randomUUID(),
        userId: randomUUID(),
        name: ['luna.exe', 'orbit_owl', 'cozycosmos', 'pixelpilot', 'stardust', 'nova'][
          demoIndex++ % 6
        ]!,
        text: roleInfo[body.role ?? roles[demoIndex % 3]!].command,
      });
    else if (body.action === 'autoplay' && !demoTimer) {
      demoTimer = setInterval(() => {
        if (engine.state.status !== 'active') {
          stopDemo();
          broadcast();
          return;
        }
        const index = demoIndex++;
        engine.chat({
          id: randomUUID(),
          userId: `demo-${index % 24}`,
          name: [
            'luna.exe',
            'orbit_owl',
            'cozycosmos',
            'pixelpilot',
            'stardust',
            'nova',
            'moonchild',
            'moss.jpg',
          ][index % 8]!,
          text: roleInfo[roles[index % 3]!].command,
        });
        broadcast();
      }, 1800);
    }
    broadcast();
    res.json(state());
  });
  app.post('/api/twitch/connect', async (req, res) => {
    const { clientId, token } = z
      .object({
        clientId: z.string().regex(/^[a-zA-Z0-9]{10,100}$/),
        token: z.string().regex(/^[a-zA-Z0-9]{10,500}$/),
      })
      .parse(req.body);
    if (['active', 'paused'].includes(engine.state.status)) {
      res.status(409).json({ error: 'End the current mission before connecting an account.' });
      return;
    }
    await bridge.connect(clientId, token);
    stopDemo();
    engine.reset(engine.state.settings, 'twitch');
    broadcast();
    res.json(state());
  });
  app.post('/api/twitch/disconnect', (_req, res) => {
    bridge.disconnect();
    engine.control('pause');
    stopDemo();
    broadcast();
    res.json(state());
  });
  app.get('/api/recorder', (_req, res) => {
    const mission = engine.view();
    const { crew: _, ...publicMission } = mission;
    res.setHeader('Content-Disposition', 'attachment; filename="raid-relay-flight-recorder.json"');
    res.json({
      format: 'raid-relay/1',
      exportedAt: new Date().toISOString(),
      ...publicMission,
      note: 'Local session evidence. Rehearsal data is simulated. First action means first action in this mission, not first visit to the Twitch channel.',
    });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use(((error, _req, res, next) => {
    if (error instanceof DirectorError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
  }) as express.ErrorRequestHandler);
  // Only a dashboard navigation issues an operator cookie; the overlay is read-only.
  app.use((req, res, next) => {
    if (req.path === '/overlay' && req.query.key !== overlayKey) {
      res.status(401).send('Copy a fresh overlay URL from the dashboard.');
      return;
    }
    if (['/', '/auth/callback'].includes(req.path))
      res.cookie('rr_session', cookie, { httpOnly: true, sameSite: 'strict', path: '/' });
    next();
  });
  const ticker = setInterval(() => {
    engine.tick();
    const raid = engine.state.raid;
    const raidKey = raid ? `${engine.state.id}:${raid.at}` : '';
    if (raidKey && raidKey !== lastRaid) {
      lastRaid = raidKey;
      const ai = director.view(engine.state.id);
      if (
        engine.state.status === 'active' &&
        ai.autoDraftOnRaid &&
        ai.configured &&
        ai.status !== 'generating' &&
        !ai.pending
      ) {
        void director.generate(engine.view(), directorTheme, directorLanguage).catch(() => {
          /* Safe provider status is available in AI controls; no automatic retry. */
        });
      }
    }
    broadcast();
  }, 1000);
  const heartbeat = setInterval(() => {
    for (const client of clients.keys()) client.write(': heartbeat\n\n');
  }, 15_000);
  function persist() {
    if (!dirty || options.persist === false) return;
    try {
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      writeFileSync(`${snapshot}.tmp`, JSON.stringify(engine.state), { mode: 0o600 });
      renameSync(`${snapshot}.tmp`, snapshot);
      dirty = false;
    } catch {
      console.warn('Mission snapshot could not be written. Check private/runtime permissions.');
    }
  }
  const saver = setInterval(persist, 5000);
  return {
    app,
    engine,
    bridge,
    director,
    state,
    close() {
      stopDemo();
      clearInterval(ticker);
      clearInterval(heartbeat);
      clearInterval(saver);
      persist();
      bridge.disconnect();
      director.disconnect();
      for (const client of clients.keys()) client.end();
      clients.clear();
    },
  };
}
