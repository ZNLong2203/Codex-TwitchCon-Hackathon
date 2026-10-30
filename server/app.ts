import express, { type Response } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { MissionEngine, roles, roleInfo, settingsSchema } from './engine.js';
import { TwitchBridge } from './twitch.js';

export function createApplication(options: { port: number; persist?: boolean; dataDir?: string }) {
  const app = express();
  app.disable('x-powered-by');
  const engine = new MissionEngine();
  const cookie = randomBytes(32).toString('hex');
  const overlayKey = randomBytes(24).toString('hex');
  const clients = new Set<Response>();
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
  });
  function broadcast() {
    dirty = true;
    if (Date.now() - lastBroadcast < 200) return; // At most 5 state frames/s, even in a busy chat.
    const frame = `data: ${JSON.stringify(state())}\n\n`;
    for (const client of clients) {
      if (client.writableLength > 256_000) {
        client.end();
        clients.delete(client);
      } else client.write(frame);
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
    res.write(`data: ${JSON.stringify(state())}\n\n`);
    clients.add(res);
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
    broadcast();
  }, 1000);
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(': heartbeat\n\n');
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
    state,
    close() {
      stopDemo();
      clearInterval(ticker);
      clearInterval(heartbeat);
      clearInterval(saver);
      persist();
      bridge.disconnect();
      for (const client of clients) client.end();
      clients.clear();
    },
  };
}
