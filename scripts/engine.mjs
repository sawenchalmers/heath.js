// Starts the local engine (heath-engine, with Docker) for development and keeps it in this terminal; Ctrl+C stops it.
// The engine's folder is HEATH_ENGINE_DIR (default ~/heath-engine). On Windows, Docker runs in WSL: the command runs
// there, and keeping it attached to this terminal also keeps WSL (and the engine) from stopping.
// Extra arguments go to `docker compose up`, e.g. `npm run engine -- --build`.
import { spawn } from 'node:child_process';

const folder = process.env.HEATH_ENGINE_DIR || '~/heath-engine';
const command = ['cd', folder, '&&', 'docker', 'compose', 'up', ...process.argv.slice(2)].join(' ');
const engine = process.platform === 'win32'
  ? spawn('wsl', ['-e', 'bash', '-c', command], { stdio: 'inherit' })
  : spawn('bash', ['-c', command], { stdio: 'inherit' });

engine.on('error', error => {
  console.error(`Could not start the engine: ${error.message}`);
  process.exit(1);
});
engine.on('exit', code => process.exit(code ?? 0));
