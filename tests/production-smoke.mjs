import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));

test(
  'compiled production launcher: assets, complete rehearsal, access isolation and restart recovery',
  { timeout: 20000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'raid-relay-production-'));
    await symlink(
      resolve(root, 'dist'),
      join(directory, 'dist'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const probe = createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    let child;
    let logs = '';
    let cookie = '';
    async function stop() {
      if (!child || child.exitCode !== null) return;
      const stopped = once(child, 'exit');
      child.kill('SIGTERM');
      const kill = setTimeout(() => child.kill('SIGKILL'), 3000);
      try {
        await stopped;
      } finally {
        clearTimeout(kill);
      }
    }
    t.after(async () => {
      await stop();
      await rm(directory, { recursive: true, force: true });
    });
    async function start() {
      logs = '';
      child = spawn(process.execPath, [resolve(root, 'scripts/start.mjs')], {
        cwd: directory,
        env: {
          ...process.env,
          PORT: String(port),
          NODE_ENV: 'production',
          GEMINI_API_KEY: '',
          TWITCH_CLIENT_ID: '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (chunk) => {
        logs += chunk;
      });
      child.stderr.on('data', (chunk) => {
        logs += chunk;
      });
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        if (child.exitCode !== null) throw new Error(`Production server exited: ${logs}`);
        try {
          const response = await fetch(base + '/api/health');
          if (response.ok) return;
        } catch {}
        await delay(25);
      }
      throw new Error(`Production server did not start: ${logs}`);
    }
    async function request(path, body, headers = {}) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(3000),
      });
      return { status: response.status, body: await response.json() };
    }
    async function dashboard() {
      const response = await fetch(base + '/');
      assert.equal(response.status, 200);
      cookie = response.headers.get('set-cookie').split(';')[0];
      return response.text();
    }
    await start();
    const html = await dashboard();
    assert.match(html, /id="root"/);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(
      (match) => match[1],
    );
    assert.ok(assets.some((path) => path.endsWith('.js')));
    assert.ok(assets.some((path) => path.endsWith('.css')));
    for (const path of assets) assert.equal((await fetch(base + path)).status, 200);
    const initial = (await request('/api/state')).body;
    assert.equal(initial.mission.settings.mode, 'expedition');
    assert.equal(initial.mission.status, 'ready');
    assert.equal(initial.ai.configured, false);
    assert.equal(initial.connection.status, 'offline');
    const config = (await request('/api/config')).body;
    const overlayPath = new URL(config.overlayUrl).pathname + new URL(config.overlayUrl).search;
    assert.equal((await request('/api/control', { action: 'start' }, { Cookie: '' })).status, 401);
    assert.equal(
      (await request('/api/control', { action: 'start' }, { Origin: 'https://example.invalid' }))
        .status,
      403,
    );
    assert.equal((await request('/api/control', { action: 'unknown' })).status, 400);
    await request('/api/control', { action: 'start' });
    for (let i = 0; i < 3; i++) await request('/api/rehearsal', { action: 'crew' });
    assert.equal((await request('/api/state')).body.mission.expedition.phase, 'choice');
    await request('/api/rehearsal', { action: 'route', route: 'drift' });
    await request('/api/control', { action: 'lock-route' });
    for (let i = 0; i < 6; i++) await request('/api/rehearsal', { action: 'crew' });
    const recorder = (await request('/api/recorder')).body;
    assert.equal(recorder.status, 'complete');
    assert.equal(recorder.source, 'rehearsal');
    assert.equal(recorder.expedition.route, 'drift');
    assert.equal(recorder.integration.acceptedCommands, 0);
    assert.equal(JSON.stringify(recorder).includes('u:'), false);
    // A display key allows only the spectator stream, even when an operator cookie exists.
    const stream = await fetch(base + '/api/events?' + new URL(config.overlayUrl).searchParams, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(3000),
    });
    const reader = stream.body.getReader();
    const frame = new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    assert.ok(frame.includes('data: '));
    assert.equal('ai' in JSON.parse(frame.split('data: ')[1].trim()), false);
    await request('/api/control', { action: 'reset' });
    await request('/api/control', { action: 'start' });
    await request('/api/rehearsal', { action: 'crew' });
    await request('/api/control', { action: 'pause' });
    const oldCookie = cookie;
    const paused = (await request('/api/state')).body.mission;
    await stop();
    const snapshot = JSON.parse(
      await readFile(join(directory, 'private/runtime/mission.json'), 'utf8'),
    );
    assert.equal(snapshot.status, 'paused');
    assert.equal(snapshot.expedition.contributors.scout.length, 1);
    await start();
    assert.equal((await request('/api/state', undefined, { Cookie: oldCookie })).status, 401);
    assert.equal((await fetch(base + overlayPath)).status, 401);
    await dashboard();
    const restored = (await request('/api/state')).body.mission;
    assert.equal(restored.id, paused.id);
    assert.equal(restored.status, 'paused');
    assert.equal(restored.remainingMs, paused.remainingMs);
    assert.equal(restored.expedition.contributors.scout, 1);
    assert.notEqual((await request('/api/config')).body.overlayUrl, config.overlayUrl);
  },
);
