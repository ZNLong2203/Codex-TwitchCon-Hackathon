import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeminiKey, geminiKeyError } from '../shared/api-key.js';
const fake = 'test-key-for-normalization-not-a-real-key';
test('Gemini key paste accepts whitespace, matching quotes and .env assignments', () => {
  for (const input of [
    fake,
    `  ${fake}\n`,
    `"${fake}"`,
    `'${fake}'`,
    `GEMINI_API_KEY="${fake}"`,
    `GOOGLE_API_KEY = '${fake}'`,
  ]) {
    assert.equal(normalizeGeminiKey(input), fake);
    assert.equal(geminiKeyError(input), null);
  }
});
test('key validation returns actionable errors without reproducing submitted values', () => {
  assert.match(geminiKeyError('')!, /Paste/);
  assert.match(geminiKeyError('key-name')!, /full secret API key/);
  assert.match(geminiKeyError(fake + '\ntrailing')!, /space, line break/);
  assert.match(geminiKeyError('x'.repeat(513))!, /longer/);
  assert.ok(!geminiKeyError(fake + '\ntrailing')!.includes(fake));
});
