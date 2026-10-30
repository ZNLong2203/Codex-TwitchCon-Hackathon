import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MissionEngine } from '../server/engine.js';

function fixture() {
  let now = 1_000_000;
  const engine = new MissionEngine(() => now);
  engine.control('start');
  return {
    engine,
    advance(ms: number) {
      now += ms;
      engine.tick();
    },
    chat(id: string, userId: string, text: string) {
      return engine.chat({ id, userId, name: userId, text });
    },
  };
}
test('one unique person in each role creates a relay and advances all systems', () => {
  const { engine, chat } = fixture();
  chat('1', 'alice', '!scan');
  chat('2', 'bob', '!repair');
  chat('3', 'carol', '!boost');
  assert.deepEqual(engine.state.systems, { scout: 3, engineer: 3, pilot: 3 });
  assert.equal(engine.view().crewCount, 3);
  assert.equal(engine.state.combos, 1);
});
test('a person cannot create a three-role relay alone, even after cooldown', () => {
  const { engine, chat, advance } = fixture();
  chat('1', 'alice', '!scan');
  advance(6000);
  chat('2', 'alice', '!repair');
  advance(6000);
  chat('3', 'alice', '!boost');
  assert.equal(engine.state.combos, 0);
  assert.equal(engine.view().crewCount, 1);
});
test('cooldown applies across roles and exact boundary is accepted', () => {
  const { chat, advance, engine } = fixture();
  assert.equal(chat('1', 'a', '!scan').accepted, true);
  assert.equal(chat('2', 'a', '!repair').reason, 'cooldown');
  advance(6000);
  assert.equal(chat('3', 'a', '!repair').accepted, true);
  assert.equal(engine.state.actions, 2);
});
test('duplicate message IDs cannot score again, including after cooldown', () => {
  const { chat, advance, engine } = fixture();
  chat('event-1', 'a', '!scan');
  advance(6000);
  assert.equal(chat('event-1', 'a', '!scan').reason, 'duplicate');
  assert.equal(engine.state.actions, 1);
});
test('only exact recognized commands affect the mission; casing and whitespace are normalized', () => {
  const { chat, engine } = fixture();
  for (const cmd of ['hello !scan', '!scan now', '!scanner', '<script>alert(1)</script>'])
    assert.equal(chat(cmd, cmd, cmd).accepted, false);
  assert.equal(chat('1', 'a', '  !SCAN  ').accepted, true);
  assert.equal(engine.state.actions, 1);
});
test('relay windows expire and visible readiness also expires', () => {
  const { chat, advance, engine } = fixture();
  chat('1', 'a', '!scan');
  assert.deepEqual(engine.view().relay, ['scout']);
  advance(15_001);
  assert.deepEqual(engine.view().relay, []);
  chat('2', 'b', '!repair');
  chat('3', 'c', '!boost');
  assert.equal(engine.state.combos, 0);
});
test('boarding bonus is only a first mission action within 90 seconds and raid delivery is deduplicated', () => {
  const { engine, chat, advance } = fixture();
  chat('before', 'regular', '!scan');
  const raid = { id: 'raid-1', name: 'star', viewers: 42 };
  assert.equal(engine.raid(raid), true);
  assert.equal(engine.raid(raid), false);
  assert.equal(chat('1', 'newcomer', '!boost').points, 2);
  advance(6000);
  assert.equal(chat('2', 'regular', '!scan').points, 1);
  assert.equal(chat('3', 'newcomer', '!boost').points, 1);
  advance(90_001);
  assert.equal(chat('4', 'late', '!repair').points, 1);
  assert.equal(engine.state.welcomed, 1);
});
test('welcome bonus can be disabled while newcomer count still records first contributions', () => {
  const { engine, chat } = fixture();
  engine.reset({ ...engine.state.settings, welcomeBonus: false });
  engine.control('start');
  engine.raid({ id: 'r', name: 'n', viewers: 1 });
  assert.equal(chat('1', 'a', '!scan').points, 1);
  assert.equal(engine.state.welcomed, 1);
});
test('pause preserves remaining mission time, ignores chat, resumes without wall-clock penalty', () => {
  const { engine, advance, chat } = fixture();
  advance(10_000);
  engine.control('pause');
  const remaining = engine.state.remainingMs;
  advance(70_000);
  assert.equal(engine.state.remainingMs, remaining);
  assert.equal(chat('1', 'a', '!scan').accepted, false);
  engine.control('resume');
  advance(1000);
  assert.equal(engine.state.remainingMs, remaining - 1000);
});
test('timeout is authoritative even if a chat arrives before the ticker', () => {
  let now = 0;
  const engine = new MissionEngine(() => now);
  engine.control('start');
  now = 480_001;
  assert.equal(engine.chat({ id: 'late', userId: 'u', name: 'u', text: '!scan' }).accepted, false);
  assert.equal(engine.state.status, 'ended');
  assert.equal(engine.state.remainingMs, 0);
});
test('completion caps system values, blocks further scoring and writes an ending', () => {
  const { engine, chat } = fixture();
  engine.reset({ ...engine.state.settings, goal: 6 });
  engine.control('start');
  for (let i = 0; i < 6; i++) chat(`i${i}`, `user${i}`, ['!scan', '!repair', '!boost'][i % 3]!);
  assert.equal(engine.state.status, 'complete');
  assert.deepEqual(engine.state.systems, { scout: 6, engineer: 6, pilot: 6 });
  assert.equal(chat('x', 'x', '!scan').accepted, false);
  assert.equal(engine.state.feed[0]?.name, 'Signal delivered');
});
test('active snapshots restore paused, keep progress and reject malformed state', () => {
  const { engine, chat } = fixture();
  chat('a', 'a', '!scan');
  const restored = new MissionEngine();
  restored.restore(JSON.parse(JSON.stringify(engine.state)));
  assert.equal(restored.state.status, 'paused');
  assert.equal(restored.state.systems.scout, 1);
  assert.throws(() => restored.restore({ schemaVersion: 2 }));
});
test('untrusted user IDs cannot pollute prototypes and runtime collections remain bounded', () => {
  const { engine, chat } = fixture();
  chat('1', '__proto__', '!scan');
  assert.equal(engine.view().crewCount, 1);
  for (let i = 0; i < 100; i++) chat(`m${i}`, `p${i}`, '!scan');
  assert.ok(engine.state.feed.length <= 40);
  assert.ok(engine.view().crew.length <= 80);
});
