import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MissionEngine, roleInfo } from '../server/engine.js';
import { defaultExpedition, expeditionTargets } from '../shared/expedition.js';
import { MissionDirector } from '../server/director.js';

function setup() {
  let now = 1000;
  const engine = new MissionEngine(() => now, 'expedition');
  engine.control('start');
  const send = (userId: string, text: string, id = randomUUID()) =>
    engine.chat({ id, userId, name: userId, text });
  const scout = () => {
    for (let i = 0; i < 3; i++) send(`scout-${i}`, '!scan');
  };
  return {
    engine,
    send,
    scout,
    advance: (ms: number) => {
      now += ms;
      engine.tick();
    },
  };
}
test('expedition enforces sequential acts, distinct contributors and message deduplication', () => {
  const { engine, send } = setup();
  assert.equal(send('first', '!repair').reason, 'role-locked');
  assert.equal(send('first', '!boost').reason, 'role-locked');
  const id = randomUUID();
  assert.equal(send('first', '!scan', id).accepted, true);
  assert.equal(send('second', '!scan', id).reason, 'duplicate');
  assert.equal(send('first', '!scan').reason, 'already-contributed');
  assert.equal(engine.view().expedition?.contributors.scout, 1);
  assert.equal(engine.state.actions, 1);
  assert.equal(engine.state.systems.engineer, 0);
  assert.equal(engine.state.systems.pilot, 0);
});
test('editable one-account ballot has deterministic ties, authoritative timeout and locked targets', () => {
  const { engine, send, scout, advance } = setup();
  scout();
  assert.equal(engine.state.expedition?.phase, 'choice');
  assert.equal(send('voter', '!route drift').accepted, true);
  send('voter', '!route beacon');
  assert.deepEqual(engine.view().expedition?.votes, { beacon: 1, drift: 0 });
  send('other', '!route drift');
  advance(20000);
  assert.equal(engine.state.expedition?.route, 'beacon');
  assert.deepEqual(engine.view().expedition?.targets, { scout: 3, engineer: 4, pilot: 2 });
  assert.equal(send('late', '!route drift').reason, 'ballot-closed');
  assert.equal(engine.lockRoute(), false);
});
test('ballot pauses and survives recovery without spending wall-clock time', () => {
  const { engine, send, scout, advance } = setup();
  scout();
  send('voter', '!route drift');
  advance(5000);
  engine.control('pause');
  advance(60000);
  assert.equal(engine.view().expedition?.ballotMs, 15000);
  assert.equal(send('paused', '!route beacon').accepted, false);
  const restored = new MissionEngine();
  restored.restore(JSON.parse(JSON.stringify(engine.state)));
  assert.equal(restored.state.status, 'paused');
  assert.equal(restored.view().expedition?.ballotMs, 15000);
  assert.deepEqual(restored.view().expedition?.votes, { beacon: 0, drift: 1 });
  engine.control('resume');
  advance(15000);
  assert.equal(engine.view().expedition?.route, 'drift');
});
for (const route of ['beacon', 'drift'] as const) {
  test(`${route} route changes required coordination and reaches its own ending`, () => {
    const { engine, send, scout } = setup();
    scout();
    send('voter', `!route ${route}`);
    assert.equal(engine.lockRoute(), true);
    const targets = expeditionTargets(3, route);
    for (const role of ['engineer', 'pilot'] as const) {
      assert.equal(engine.view().expedition?.phase, role);
      for (let i = 0; i < targets[role]; i++) send(`${role}-${i}`, roleInfo[role].command);
    }
    assert.equal(engine.state.status, 'complete');
    assert.equal(engine.view().progress, 100);
    assert.equal(engine.view().catchup, defaultExpedition().routes[route].ending);
    assert.equal(send('late', '!boost').accepted, false);
  });
}
test('one small crew can change roles after cooldown but cannot solo an act', () => {
  const { engine, send, scout, advance } = setup();
  scout();
  send('vote', '!route drift');
  engine.lockRoute();
  assert.equal(send('scout-0', '!repair').reason, 'cooldown');
  advance(6000);
  assert.equal(send('scout-0', '!repair').accepted, true);
  assert.equal(send('scout-0', '!repair').reason, 'already-contributed');
  assert.equal(engine.state.expedition?.phase, 'engineer');
});
test('raid welcomes new participants without doubling unique people or changing route targets', () => {
  const { engine, send } = setup();
  engine.raid({ id: 'raid', name: 'incoming', viewers: 42 });
  send('newcomer', '!scan');
  assert.equal(engine.view().expedition?.contributors.scout, 1);
  assert.equal(engine.view().expedition?.targets.scout, 3);
  assert.equal(engine.state.welcomed, 1);
});
test('mission timeout wins over ballot and no role may act on an expired rescue', () => {
  const { engine, send, scout, advance } = setup();
  scout();
  advance(8 * 60000);
  assert.equal(engine.state.status, 'ended');
  assert.equal(engine.state.expedition?.route, null);
  assert.equal(engine.lockRoute(), false);
  assert.equal(send('late', '!repair').accepted, false);
});
test('public expedition view and recorder-shaped data exclude voter and contributor IDs', () => {
  const { engine, send, scout } = setup();
  scout();
  send('private-voter-id', '!route drift');
  const { crew: _, ...publicState } = engine.view();
  const serialized = JSON.stringify(publicState);
  assert.ok(!serialized.includes('u:scout-0'));
  assert.ok(!serialized.includes('private-voter-id'));
  assert.deepEqual(engine.view().expedition?.votes, { beacon: 0, drift: 1 });
});
test('legacy snapshots stay classic and expedition snapshots require valid bounded state', () => {
  const old = new MissionEngine();
  const snapshot = JSON.parse(JSON.stringify(old.state));
  delete snapshot.settings.mode;
  delete snapshot.settings.crewPerAct;
  delete snapshot.expedition;
  const restored = new MissionEngine(Date.now, 'expedition');
  restored.restore(snapshot);
  assert.equal(restored.state.settings.mode, 'classic');
  assert.equal(restored.state.expedition, null);
  const { engine } = setup();
  const invalid = structuredClone(engine.state);
  invalid.expedition!.contributors.scout = Array(7).fill('one');
  assert.throws(() => restored.restore(invalid));
});
test('AI script approval is explicit, validates all branches, and is locked after launch', () => {
  const engine = new MissionEngine(Date.now, 'expedition');
  const ai = new MissionDirector();
  ai.sample(engine.view());
  const candidate = ai.view(engine.state.id).pending!;
  assert.equal(engine.state.director, null);
  engine.approveDirector(candidate);
  assert.equal(engine.state.directive, null);
  assert.equal(engine.state.expedition?.script.routes.drift.name, 'The silent passage');
  engine.control('start');
  assert.throws(() => engine.approveDirector({ ...candidate, id: randomUUID() }), /before launch/);
});
test('new expedition model schema requires a complete script and falls back once on missing branches', async () => {
  const engine = new MissionEngine(Date.now, 'expedition');
  const sample = new MissionDirector();
  sample.sample(engine.view());
  const brief = sample.view(engine.state.id).pending!.brief;
  const bodies: any[] = [];
  const director = new MissionDirector({
    key: 'fixture-not-a-real-key',
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(init!.body as string));
      const partial = { ...brief };
      if (bodies.length === 1) delete partial.expedition;
      return Response.json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(partial) }] } },
        ],
      });
    },
  });
  const draft = await director.generate(engine.view(), 'A quiet nebula', 'en');
  assert.equal(bodies.length, 2);
  assert.ok(bodies[0].generationConfig.responseJsonSchema.required.includes('expedition'));
  assert.ok(draft.brief.expedition?.acts.scout);
  engine.control('start');
  await assert.rejects(director.generate(engine.view(), 'Another story', 'en'), /before launch/);
});
