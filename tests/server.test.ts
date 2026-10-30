import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest, type Server } from 'node:http';
import { createApplication } from '../server/app.js';
const service = createApplication({ port: 4317, persist: false });
let server: Server;
let base: string;
let cookie = '';
before(async () => {
  service.app.get('/', (_req, res) => res.send('Dashboard'));
  await new Promise<void>((resolve) => {
    server = service.app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const response = await send('/', undefined, { Host: 'localhost:4317' });
  cookie = response.headers.get('set-cookie')!.split(';')[0]!;
});
after(async () => {
  service.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
function send(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Headers; json(): Promise<any> }>(
    (resolve, reject) => {
      const req = httpRequest(base + path, { method: body ? 'POST' : 'GET', headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (data) => chunks.push(data));
        res.on('end', () => {
          const h = new Headers();
          for (const [key, value] of Object.entries(res.headers))
            if (value) h.set(key, Array.isArray(value) ? value.join(';') : value);
          resolve({
            status: res.statusCode!,
            headers: h,
            json: async () => JSON.parse(Buffer.concat(chunks).toString()),
          });
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    },
  );
}
const request = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  send(path, body, {
    Host: 'localhost:4317',
    Cookie: cookie,
    Origin: 'http://localhost:4317',
    'Content-Type': 'application/json',
    ...headers,
  });
test('DNS rebinding and cross-origin operator requests are rejected', async () => {
  assert.equal((await request('/api/state', undefined, { Host: 'evil.example' })).status, 403);
  assert.equal(
    (await request('/api/control', { action: 'start' }, { Origin: 'https://evil.example' })).status,
    403,
  );
  assert.equal((await request('/api/state', undefined, { Cookie: '' })).status, 401);
  assert.equal((await request('/api/control', { action: 'start' }, { Origin: '' })).status, 403);
});
test('authorized operator can rehearse, raid, pause and export an honestly labeled recorder', async () => {
  assert.equal((await request('/api/control', { action: 'start' })).status, 200);
  assert.equal((await request('/api/rehearsal', { action: 'crew', role: 'scout' })).status, 200);
  const raid = await (await request('/api/rehearsal', { action: 'raid' })).json();
  assert.equal(raid.mission.raid.viewers, 42);
  const paused = await (await request('/api/control', { action: 'pause' })).json();
  assert.equal(paused.mission.status, 'paused');
  const recorder = await (await request('/api/recorder')).json();
  assert.equal(recorder.source, 'rehearsal');
  assert.match(recorder.note, /simulated/);
  assert.equal('players' in recorder, false);
  assert.equal('token' in recorder, false);
  await request('/api/control', { action: 'end' });
});
test('simulated events and live launches without Twitch are blocked in Twitch mode', async () => {
  const state = await (await request('/api/state')).json();
  assert.equal(
    (await request('/api/settings', { settings: state.mission.settings, source: 'twitch' })).status,
    200,
  );
  assert.equal((await request('/api/rehearsal', { action: 'raid' })).status, 409);
  assert.equal((await request('/api/control', { action: 'start' })).status, 409);
});
test('overlay is read-only and a fresh URL is required after server restart', async () => {
  const config = await (await request('/api/config')).json();
  const overlay = new URL(config.overlayUrl);
  assert.equal((await request('/overlay?key=wrong', undefined, { Cookie: '' })).status, 401);
  assert.equal(
    (
      await request(
        `/api/control?key=${overlay.searchParams.get('key')}`,
        { action: 'start' },
        { Cookie: '' },
      )
    ).status,
    401,
  );
});

test('operator expedition flow exposes route targets, rejects paused close, and exports private-ID-free counts', async () => {
  const state = await (await request('/api/state')).json();
  await request('/api/settings', {
    settings: { ...state.mission.settings, mode: 'expedition', crewPerAct: 2 },
    source: 'rehearsal',
  });
  await request('/api/control', { action: 'start' });
  await request('/api/rehearsal', { action: 'crew' });
  await request('/api/rehearsal', { action: 'crew' });
  const voted = await (await request('/api/rehearsal', { action: 'route', route: 'drift' })).json();
  assert.equal(voted.mission.expedition.phase, 'choice');
  assert.deepEqual(voted.mission.expedition.votes, { beacon: 0, drift: 1 });
  await request('/api/control', { action: 'pause' });
  assert.equal((await request('/api/control', { action: 'lock-route' })).status, 409);
  await request('/api/control', { action: 'resume' });
  const locked = await (await request('/api/control', { action: 'lock-route' })).json();
  assert.deepEqual(locked.mission.expedition.targets, { scout: 2, engineer: 2, pilot: 3 });
  for (let i = 0; i < 5; i++) await request('/api/rehearsal', { action: 'crew' });
  const recorder = await (await request('/api/recorder')).json();
  assert.equal(recorder.status, 'complete');
  assert.equal(recorder.expedition.route, 'drift');
  assert.equal(recorder.expedition.contributors.pilot, 3);
  assert.equal(JSON.stringify(recorder).includes('u:'), false);
  assert.equal(recorder.integration.acceptedCommands, 0);
  assert.match(recorder.integration.obsCompositing, /human verification/);
});
