import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MissionEngine } from '../server/engine.js';
import {
  MissionDirector,
  directorContext,
  GEMINI_MODEL,
  GEMINI_FALLBACK,
} from '../server/director.js';
import type { DirectorBrief, DirectorCandidate } from '../shared/director.js';

const brief: DirectorBrief = {
  title: 'A lighthouse in the dark',
  location: 'VERDANT OUTPOST',
  briefing: 'A seed ark needs a guiding light. Rebuild the relay together.',
  welcome: 'Just arrived? Two different scouts can help map the rescue route. Type !scan.',
  conclusion: 'This rescue was a shared effort.',
  directive: {
    title: 'Map the safe passage',
    objective: 'Two different people must type !scan within 60 seconds.',
    focusRole: 'scout',
    targetContributors: 2,
    durationSeconds: 60,
    rewardPoints: 2,
  },
};
function fixture() {
  let now = 1_000_000;
  let calls = 0;
  let request: { url: string; init?: RequestInit } | undefined;
  const engine = new MissionEngine(() => now);
  const director = new MissionDirector({
    key: 'test-key-not-real',
    clock: () => now,
    fetch: async (url, init) => {
      calls++;
      request = { url: String(url), init };
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(brief) }] } },
        ],
        usageMetadata: {
          promptTokenCount: 1000,
          candidatesTokenCount: 500,
          thoughtsTokenCount: 20,
          totalTokenCount: 1520,
        },
      });
    },
  });
  return {
    engine,
    director,
    advance(ms: number) {
      now += ms;
      engine.tick();
    },
    get calls() {
      return calls;
    },
    get request() {
      return request;
    },
  };
}
function proposal(
  engine: MissionEngine,
  source: 'gemini' | 'sample' = 'gemini',
): DirectorCandidate {
  return {
    id: randomUUID(),
    missionId: engine.state.id,
    createdAt: Date.now(),
    source,
    model: GEMINI_MODEL,
    brief,
  };
}
test('Gemini REST request uses a header key, bounded structured output and aggregate-only input', async () => {
  const f = fixture();
  f.engine.control('start');
  f.engine.chat({ id: 'msg-secret', userId: 'user-secret', name: 'NameNeverSend', text: '!scan' });
  const result = await f.director.generate(f.engine.view(), 'A cozy lighthouse', 'en');
  assert.equal(result.source, 'gemini');
  assert.equal(f.calls, 1);
  assert.match(f.request!.url, /gemini-3\.8-flash:generateContent$/);
  assert.ok(!f.request!.url.includes('test-key'));
  assert.equal(
    (f.request!.init!.headers as Record<string, string>)['x-goog-api-key'],
    'test-key-not-real',
  );
  const body = JSON.parse(f.request!.init!.body as string);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.maxOutputTokens, 3072);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  const context = body.contents[0].parts[0].text;
  for (const secret of [
    'NameNeverSend',
    'user-secret',
    'msg-secret',
    'test-key-not-real',
    'rr_session',
  ])
    assert.ok(!context.includes(secret));
  assert.equal(JSON.parse(context).mission.crewCount, 1);
  assert.equal(f.director.view(f.engine.state.id).successfulCalls, 1);
  assert.ok(Math.abs(f.director.view(f.engine.state.id).estimatedUsd - 0.0027) < 1e-8);
  assert.equal(f.engine.state.director, null, 'generation must not silently publish');
});
test('identical ready-state requests are cached without another token reservation', async () => {
  const f = fixture();
  const a = await f.director.generate(f.engine.view(), 'A cozy lighthouse', 'en');
  const b = await f.director.generate(f.engine.view(), 'A cozy lighthouse', 'en');
  assert.equal(a.id, b.id);
  assert.equal(f.calls, 1);
  assert.equal(f.director.view(f.engine.state.id).reservedUsd, 0.03);
});
test('local budget and cooldown block a request before network I/O', async () => {
  const f = fixture();
  f.director.configure({ budgetUsd: 0.03, autoDraftOnRaid: false });
  await f.director.generate(f.engine.view(), 'First story', 'en');
  await assert.rejects(
    () => f.director.generate(f.engine.view(), 'Another story', 'en'),
    /cooldown/,
  );
  f.advance(20_000);
  await assert.rejects(() => f.director.generate(f.engine.view(), 'Another story', 'en'), /budget/);
  assert.equal(f.calls, 1);
});
test('eight-call mission ceiling is independent of a larger session budget', async () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) {
    await f.director.generate(f.engine.view(), `Story number ${i}`, 'en');
    f.advance(20_000);
  }
  await assert.rejects(
    () => f.director.generate(f.engine.view(), 'One more story', 'en'),
    /8-request/,
  );
  assert.equal(f.calls, 8);
  f.engine.reset();
  assert.equal(f.director.view(f.engine.state.id).missionCalls, 0);
  assert.equal(f.director.view(f.engine.state.id).reservedUsd, 0.24);
});
test('missing key does not call a provider; samples remain explicitly labeled and rehearsal-only', async () => {
  const engine = new MissionEngine();
  const ai = new MissionDirector();
  await assert.rejects(() => ai.generate(engine.view(), 'Story', 'en'), /API key/);
  ai.sample(engine.view());
  assert.equal(ai.view(engine.state.id).pending?.source, 'sample');
  assert.equal(ai.view(engine.state.id).calls, 0);
  engine.reset(engine.state.settings, 'twitch');
  assert.throws(() => ai.sample(engine.view()), /only in rehearsal/);
});
test('provider errors never echo keys or provider response bodies and keep the reservation', async () => {
  const engine = new MissionEngine();
  const ai = new MissionDirector({
    key: 'secret-do-not-return',
    fetch: async () =>
      new Response('secret-do-not-return private-provider-detail', { status: 429 }),
  });
  await assert.rejects(() => ai.generate(engine.view(), 'Story', 'en'), /quota/);
  const v = ai.view(engine.state.id);
  assert.equal(v.reservedUsd, 0.05);
  assert.equal(v.status, 'error');
  assert.ok(!JSON.stringify(v).includes('secret-do-not-return'));
  assert.ok(!JSON.stringify(v).includes('private-provider-detail'));
});
test('invalid or unfinished provider output never becomes a publishable draft', async () => {
  for (const candidate of [
    {
      finishReason: 'STOP',
      content: {
        parts: [
          {
            text: JSON.stringify({
              ...brief,
              directive: { ...brief.directive, rewardPoints: 999 },
            }),
          },
        ],
      },
    },
    { finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"title":' }] } },
  ]) {
    const engine = new MissionEngine();
    const ai = new MissionDirector({
      key: 'test',
      fetch: async () => Response.json({ candidates: [candidate] }),
    });
    await assert.rejects(() => ai.generate(engine.view(), 'Story', 'en'));
    assert.equal(ai.view(engine.state.id).pending, null);
  }
});
test('only one request can run at a time and an old mission response is discarded', async () => {
  const engine = new MissionEngine();
  let deliver: (response: Response) => void = () => {};
  const ai = new MissionDirector({
    key: 'test',
    fetch: () =>
      new Promise<Response>((resolve) => {
        deliver = resolve;
      }),
  });
  const pending = ai.generate(engine.view(), 'Story', 'en');
  await assert.rejects(() => ai.generate(engine.view(), 'Second story', 'en'), /already/);
  engine.reset();
  ai.view(engine.state.id);
  deliver(
    Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(brief) }] } }],
    }),
  );
  await assert.rejects(() => pending, /changed/);
  assert.equal(ai.view(engine.state.id).pending, null);
});
test('approved AI objective changes gameplay only after distinct accepted contributors act', () => {
  const f = fixture();
  f.engine.approveDirector(proposal(f.engine));
  assert.equal(f.engine.state.directive?.status, 'queued');
  f.engine.control('start');
  const send = (id: string, userId: string) =>
    f.engine.chat({ id, userId, name: userId, text: '!scan' });
  send('1', 'alice');
  assert.equal(f.engine.view().directive?.contributors, 1);
  f.advance(6000);
  send('2', 'alice');
  assert.equal(f.engine.view().directive?.contributors, 1);
  send('3', 'bob');
  assert.equal(f.engine.state.directive?.status, 'complete');
  assert.deepEqual(f.engine.state.systems, { scout: 5, engineer: 2, pilot: 2 });
  const before = f.engine.state.systems.engineer;
  send('4', 'carol');
  assert.equal(f.engine.state.systems.engineer, before, 'objective reward cannot repeat');
});
test('directive clock pauses with the mission, expires without penalty, and rejects stale drafts', () => {
  const f = fixture();
  const old = proposal(f.engine);
  f.engine.approveDirector(old);
  f.engine.control('start');
  f.advance(10_000);
  f.engine.control('pause');
  const left = f.engine.state.directive!.remainingMs;
  f.advance(60_000);
  assert.equal(f.engine.state.directive!.remainingMs, left);
  f.engine.control('resume');
  f.advance(left + 1);
  assert.equal(f.engine.state.directive!.status, 'expired');
  assert.deepEqual(f.engine.state.systems, { scout: 0, engineer: 0, pilot: 0 });
  f.engine.reset();
  assert.throws(() => f.engine.approveDirector(old), /previous mission/);
});
test('sample directives cannot contaminate Twitch; active directives cannot be silently replaced', () => {
  const f = fixture();
  f.engine.reset(f.engine.state.settings, 'twitch');
  assert.throws(
    () => f.engine.approveDirector(proposal(f.engine, 'sample')),
    /cannot be published/,
  );
  f.engine.approveDirector(proposal(f.engine));
  assert.throws(() => f.engine.approveDirector(proposal(f.engine)), /current directive/);
});
test('AI state restores safely and public views never contain objective contributor IDs', () => {
  const f = fixture();
  f.engine.approveDirector(proposal(f.engine));
  f.engine.control('start');
  f.engine.chat({ id: '1', userId: 'private-user', name: 'Pilot', text: '!scan' });
  assert.equal(typeof f.engine.view().directive?.contributors, 'number');
  assert.ok(!JSON.stringify(f.engine.view().directive).includes('private-user'));
  const restored = new MissionEngine();
  restored.restore(JSON.parse(JSON.stringify(f.engine.state)));
  assert.equal(restored.state.status, 'paused');
  assert.equal(restored.view().directive?.contributors, 1);
  assert.equal(restored.state.director?.brief.title, brief.title);
});
test('director context has no roster, feed or participant IDs', () => {
  const f = fixture();
  const context = directorContext(f.engine.view(), 'theme', 'vi');
  assert.equal(context.language, 'Vietnamese');
  assert.equal('crew' in context.mission, false);
  assert.equal('feed' in context.mission, false);
});
test('3.8 Flash is primary and a transient failure uses exactly one labeled Flash-Lite fallback', async () => {
  const engine = new MissionEngine();
  const models: string[] = [];
  const levels: string[] = [];
  const ai = new MissionDirector({
    key: 'test',
    fetch: async (url, init) => {
      const model = String(url).includes(GEMINI_MODEL) ? GEMINI_MODEL : GEMINI_FALLBACK;
      models.push(model);
      levels.push(JSON.parse(init!.body as string).generationConfig.thinkingConfig.thinkingLevel);
      return model === GEMINI_MODEL
        ? new Response('unavailable', { status: 503 })
        : Response.json({
            candidates: [
              { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(brief) }] } },
            ],
          });
    },
  });
  const draft = await ai.generate(engine.view(), 'A rescue', 'en');
  assert.deepEqual(models, [GEMINI_MODEL, GEMINI_FALLBACK]);
  assert.deepEqual(levels, ['low', 'minimal']);
  assert.equal(draft.model, GEMINI_FALLBACK);
  assert.equal(ai.view(engine.state.id).lastModel, GEMINI_FALLBACK);
  assert.equal(ai.view(engine.state.id).reservedUsd, 0.05);
  assert.equal(ai.view(engine.state.id).calls, 2);
});
test('bad credentials and safety refusals do not trigger fallback', async () => {
  for (const kind of ['credentials', 'safety']) {
    const engine = new MissionEngine();
    let calls = 0;
    const ai = new MissionDirector({
      key: 'test',
      fetch: async () => {
        calls++;
        return kind === 'credentials'
          ? new Response('private details', { status: 403 })
          : Response.json({ candidates: [{ finishReason: 'SAFETY' }] });
      },
    });
    await assert.rejects(() => ai.generate(engine.view(), 'Story', 'en'));
    assert.equal(calls, 1);
    assert.equal(ai.view(engine.state.id).pending, null);
  }
});
test('fallback respects the remaining budget before making its own network request', async () => {
  const engine = new MissionEngine();
  let calls = 0;
  const ai = new MissionDirector({
    key: 'test',
    fetch: async () => {
      calls++;
      return new Response('unavailable', { status: 503 });
    },
  });
  ai.configure({ budgetUsd: 0.03, autoDraftOnRaid: false });
  await assert.rejects(() => ai.generate(engine.view(), 'Story', 'en'), /budget/);
  assert.equal(calls, 1);
  assert.equal(ai.view(engine.state.id).reservedUsd, 0.03);
});
