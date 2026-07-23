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

console.log('==> Step 1/3: fetch-poe2db');
await run('node', ['scripts/fetch-poe2db.mjs']);

console.log('\n==> Step 2/3: process-data');
await run('node', ['scripts/process-data.mjs']);

console.log('\n==> Step 3/3: download-images');
await run('node', ['scripts/download-images.mjs']);

console.log('\nRefresh complete. Run `npm run check` to verify the static site.');
