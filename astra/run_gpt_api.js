'use strict';
// Narrow compatible API layer for the Supabase astra-tools gateway.
const http = require('http');
const { createHandler } = require('./src/integration/astra_api_handler');
const fs = require('fs');
const host = process.env.ASTRA_API_HOST || '0.0.0.0';
const port = Number(process.env.PORT || process.env.ASTRA_API_PORT || 3082);
if (!process.env.STRATEGY_F_PYTHON) {
  const candidates = process.platform === 'win32' ? ['python.exe', 'py.exe'] : ['/usr/local/bin/python3', '/usr/bin/python3'];
  process.env.STRATEGY_F_PYTHON = candidates.find(candidate => candidate.includes('/') ? fs.existsSync(candidate) : true) || 'python3';
}
if (!process.env.ASTRA_RUNTIME_API_KEY) {
  console.error('ASTRA GPT API failed: ASTRA_RUNTIME_API_KEY_REQUIRED');
  process.exit(1);
}
const server = http.createServer(createHandler());
server.listen(port, host, () => console.log(`ASTRA GPT API listening on http://${host}:${port}`));
server.on('error', err => { console.error('ASTRA GPT API failed:', err.code || 'SERVER_ERROR'); process.exitCode = 1; });
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; draining HTTP connections`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 25000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
