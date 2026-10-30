// Accept a copied value, quoted value, or a single .env assignment without persisting it.
export function normalizeGeminiKey(value: string) {
  let key = value
    .trim()
    .replace(/^(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*/i, '')
    .trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))
    key = key.slice(1, -1).trim();
  return key;
}
export function geminiKeyError(value: string) {
  const key = normalizeGeminiKey(value);
  if (!key) return 'Paste your Gemini API key from Google AI Studio.';
  if (key.length < 20)
    return 'This looks incomplete. Copy the full secret API key, not the key name or project ID.';
  if (key.length > 512)
    return 'This is longer than an API key. Paste only the key value from Google AI Studio.';
  if (!/^[!-~]+$/.test(key))
    return 'The key contains a space, line break or non-ASCII character. Copy the key value again.';
  return null;
}
