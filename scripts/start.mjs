// Keep the production command identical across macOS, Linux, and Windows.
process.env.NODE_ENV = 'production';
await import('../dist/server/server/index.js');
