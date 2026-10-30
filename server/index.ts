import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { createApplication } from './app.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const port = Number(process.env.PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be an integer from 1024 to 65535.');
const service = createApplication({ port });
const production = process.env.NODE_ENV === 'production';
let vite: { close(): Promise<void> } | undefined;
if (production) {
  service.app.use(express.static(resolve('dist/client'), { index: false }));
  service.app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
} else {
  const { createServer } = await import('vite');
  const dev = await createServer({
    server: { middlewareMode: true, hmr: { port: port + 1 } },
    appType: 'spa',
  });
  vite = dev;
  service.app.use(dev.middlewares);
}
const handler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    const fields = [
      ...new Set(error.issues.map((issue) => issue.path.join('.')).filter(Boolean)),
    ].slice(0, 4);
    res.status(400).json({
      error: fields.length
        ? `Please check these fields: ${fields.join(', ')}.`
        : 'The request is missing required fields. Reload this form and try again.',
    });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }
  // Only known connection errors are shown, never request bodies or tokens.
  res.status(500).json({
    error:
      error instanceof Error && /Twitch|token|authorization|client ID/.test(error.message)
        ? error.message
        : 'The request could not be completed.',
  });
};
service.app.use(handler);
const server = service.app.listen(port, '127.0.0.1', () =>
  console.log(
    `\n  RAID//RELAY\n  Local: http://localhost:${port}\n  Rehearsal is ready. Connect Twitch when you are.\n`,
  ),
);
server.on('error', async (error) => {
  console.error(`Server could not start: ${error.message}`);
  service.close();
  await vite?.close();
  process.exit(1);
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => {
    service.close();
    server.close();
    void vite?.close().finally(() => process.exit(0));
    if (!vite) process.exit(0);
  });
