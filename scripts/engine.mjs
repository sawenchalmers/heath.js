// Start the old heath-engine (before the v1 API, #25) from heath.js (`npm run engine`), in its own terminal so it
// can be stopped and restarted without touching Vite. Expects heath-engine next to heath.js with a .venv inside.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = Number(process.env.HEATH_ENGINE_PORT ?? 8000);
const heathJsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const engineDir = path.resolve(heathJsDir, process.env.HEATH_ENGINE_DIR ?? '../heath-engine');
const python = path.join(engineDir, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

/** Stop with a message the user can act on. */
const fail = (message) => {
  console.error(`npm run engine: ${message}`);
  process.exit(1);
};

/** Whether something is already listening on the engine's port (e.g. an engine started earlier). */
const portInUse = () => new Promise(resolve => {
  const probe = net.createServer()
    .once('error', error => resolve(error.code === 'EADDRINUSE'))
    .once('listening', () => probe.close(() => resolve(false)))
    .listen(PORT, HOST);
});

if (!existsSync(engineDir)) fail(`heath-engine not found at ${engineDir}. Set HEATH_ENGINE_DIR to its folder.`);
if (!existsSync(python)) fail(`no virtual environment at ${path.join(engineDir, '.venv')}. Create it and install requirements.txt first (see the heath-engine README).`);
if (await portInUse()) fail(`port ${PORT} is already in use, probably by an engine that is still running. Stop it first, or set HEATH_ENGINE_PORT (and VITE_ENGINE_PROXY_TARGET to match).`);

console.log(`Starting heath-engine from ${engineDir} on http://${HOST}:${PORT} (restarts when its Python code changes)`);
const engine = spawn(python, ['-m', 'uvicorn', 'api.main:app', '--host', HOST, '--port', String(PORT), '--reload'], {
  cwd: engineDir,
  stdio: 'inherit',
});
engine.on('error', error => fail(`could not start Python: ${error.message}`));
engine.on('exit', code => process.exit(code ?? 0));
