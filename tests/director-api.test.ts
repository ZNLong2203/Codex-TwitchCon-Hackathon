import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest, type Server } from 'node:http';
import { createApplication } from '../server/app.js';

const secret = 'fake-key-for-tests-never-a-real-credential';
let providerCalls = 0;
const service = createApplication({
  port: 4317,
  persist: false,
  initialMode: 'classic',
  director: {
    fetch: async () => {
      providerCalls++;
      return Response.json({
        candidates: [
          {
            finishReason: 'STOP',
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: 'An ark beyond the fog',
                    location: 'OUTER ORBIT',
                    briefing: 'Your crew guides a seed ark through the fog.',
                    welcome: 'Help the scouts map a route with !scan.',
                    conclusion: 'Every signal helped.',
                    directive: {
                      title: 'Rebuild the map',
                      objective: 'Two different scouts must scan the route.',
                      focusRole: 'scout',
                      targetContributors: 2,
                      durationSeconds: 60,
                      rewardPoints: 2,
                    },
                  }),
                },
              ],
            },
          },
        ],
      });
    },
  },
});
let server: Server;
let base: string;
let cookie = '';
function request(path: string, body?: unknown, extra: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Headers; json(): any }>((resolve, reject) => {
    const req = httpRequest(
      base + path,
      {
        method: body ? 'POST' : 'GET',
        headers: {
          Host: 'localhost:4317',
          Cookie: cookie,
          Origin: 'http://localhost:4317',
          'Content-Type': 'application/json',
          ...extra,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const headers = new Headers();
          for (const [k, v] of Object.entries(res.headers))
            if (v) headers.set(k, Array.isArray(v) ? v.join(';') : v);
          resolve({
            status: res.statusCode!,
            headers,
            json: () => JSON.parse(Buffer.concat(chunks).toString()),
          });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}
before(async () => {
  service.app.get('/', (_req, res) => res.send('Dashboard'));
  await new Promise<void>((resolve) => {
    server = service.app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  cookie = (await request('/')).headers.get('set-cookie')!.split(';')[0]!;
});
after(async () => {
  service.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('AI settings require operator authentication and never echo the key', async () => {
  assert.equal(
    (
      await request(
        '/api/ai/configure',
        { apiKey: secret, budgetUsd: 0.25, autoDraftOnRaid: false },
        { Cookie: '' },
      )
    ).status,
    401,
  );
  const response = await request('/api/ai/configure', {
    apiKey: secret,
    budgetUsd: 0.25,
    autoDraftOnRaid: false,
  });
  assert.equal(response.status, 200);
  const state = response.json();
  assert.equal(state.ai.configured, true);
  assert.ok(!JSON.stringify(state).includes(secret));
});
test('generate creates a real-provider-labeled draft but does not change the published mission', async () => {
  const response = await request('/api/ai/generate', { theme: 'A cozy rescue', language: 'en' });
  assert.equal(response.status, 200);
  const state = response.json();
  assert.equal(providerCalls, 1);
  assert.equal(state.ai.pending.source, 'gemini');
  assert.equal(state.mission.director, null);
  assert.equal(state.mission.directive, null);
});
test('read-only overlay SSE excludes private drafts, provider settings and keys', async () => {
  const config = (await request('/api/config')).json();
  const key = new URL(config.overlayUrl).searchParams.get('key')!;
  const frame = await new Promise<string>((resolve, reject) => {
    const req = httpRequest(
      base + `/api/events?key=${key}`,
      { headers: { Host: 'localhost:4317' } },
      (res) => {
        res.once('data', (chunk) => {
          resolve(chunk.toString());
          res.destroy();
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
  const state = JSON.parse(frame.split('data: ')[1]!.trim());
  assert.equal('ai' in state, false);
  assert.equal(state.mission.director, null);
  assert.ok(!frame.includes(secret));
  assert.ok(!frame.includes('An ark beyond the fog'));
});
test('explicit approval publishes the draft and starts a queued gameplay objective', async () => {
  const draft = (await request('/api/state')).json().ai.pending;
  assert.equal((await request('/api/ai/approve', { draftId: crypto.randomUUID() })).status, 409);
  const response = await request('/api/ai/approve', { draftId: draft.id });
  assert.equal(response.status, 200);
  const state = response.json();
  assert.equal(state.ai.pending, null);
  assert.equal(state.mission.director.brief.title, 'An ark beyond the fog');
  assert.equal(state.mission.directive.status, 'queued');
  await request('/api/control', { action: 'start' });
  assert.equal(service.engine.state.directive?.status, 'active');
});
test('disconnect removes the key without erasing the approved story or mission progress', async () => {
  const result = (await request('/api/ai/disconnect', {})).json();
  assert.equal(result.ai.configured, false);
  assert.equal(result.mission.director.source, 'gemini');
  assert.equal(result.mission.status, 'active');
});
test('AI settings report the rejected field without exposing its value', async () => {
  const keyResponse = await request('/api/ai/configure', {
    apiKey: 'short-name',
    budgetUsd: 0.25,
    autoDraftOnRaid: false,
  });
  assert.equal(keyResponse.status, 400);
  assert.match(keyResponse.json().error, /full secret API key/);
  assert.ok(!keyResponse.json().error.includes('short-name'));
  const budgetResponse = await request('/api/ai/configure', {
    budgetUsd: null,
    autoDraftOnRaid: false,
  });
  assert.equal(budgetResponse.status, 400);
  assert.match(budgetResponse.json().error, /budget.*number/);
});
