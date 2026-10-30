import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MissionEngine } from '../server/engine.js';
import { ingestNotification } from '../server/twitch.js';
const chat = (overrides = {}) => ({
  metadata: {
    message_id: 'envelope-id',
    message_type: 'notification',
    subscription_type: 'channel.chat.message',
  },
  payload: {
    subscription: { type: 'channel.chat.message' },
    event: {
      broadcaster_user_id: '123',
      chatter_user_id: '42',
      chatter_user_name: 'Orbit',
      message_id: 'chat-id',
      message: { text: '!scan' },
      ...overrides,
    },
  },
});
test('documented EventSub chat shape reaches the authoritative mission exactly once', () => {
  const engine = new MissionEngine();
  engine.control('start');
  assert.equal(ingestNotification(engine, chat(), '123'), true);
  assert.equal(ingestNotification(engine, chat(), '123'), false);
  assert.equal(engine.state.actions, 1);
});
test('wrong channel, shared-chat source, malformed and non-notification messages are ignored', () => {
  const engine = new MissionEngine();
  engine.control('start');
  for (const raw of [
    chat({ broadcaster_user_id: 'other' }),
    chat({ source_broadcaster_user_id: 'other' }),
    {},
    { metadata: { message_type: 'session_welcome' } },
    chat({ message: null }),
  ])
    assert.equal(ingestNotification(engine, raw, '123'), false);
  assert.equal(engine.state.actions, 0);
});
test('incoming raid opens onboarding, outgoing raid does not', () => {
  const engine = new MissionEngine();
  engine.control('start');
  const raid = {
    metadata: {
      message_id: 'raid',
      message_type: 'notification',
      subscription_type: 'channel.raid',
    },
    payload: {
      subscription: { type: 'channel.raid' },
      event: { to_broadcaster_user_id: '123', from_broadcaster_user_name: 'Nebula', viewers: 40 },
    },
  };
  assert.equal(ingestNotification(engine, raid, 'other'), false);
  assert.equal(ingestNotification(engine, raid, '123'), true);
  assert.equal(engine.state.raid?.viewers, 40);
});
