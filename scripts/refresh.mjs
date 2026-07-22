// scripts/refresh.mjs
// Full refresh: fetch from poe2db, then process into normalized JSON.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

console.log('==> Step 1/2: fetch-poe2db');
await run('node', ['scripts/fetch-poe2db.mjs']);

console.log('\n==> Step 2/2: process-data');
await run('node', ['scripts/process-data.mjs']);

console.log('\nRefresh complete. Run `npm run build` to bake JSON into the static site.');
