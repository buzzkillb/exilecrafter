// scripts/compress-raw.mjs
// Compresses data/raw/ HTML files to .gz to save disk space.
// The process-data.mjs script will read .gz files transparently.
// Run: node scripts/compress-raw.mjs
// To decompress: node scripts/compress-raw.mjs --decompress

import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { createGzip, createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.resolve(__dirname, '..', 'data', 'raw');

const decompress = process.argv.includes('--decompress');

async function main() {
  const files = await readdir(RAW);
  const htmlFiles = files.filter((f) => f.endsWith('.html') && !f.endsWith('.gz'));

  if (decompress) {
    // Decompress: find .gz files and decompress them to .html
    const gzFiles = files.filter((f) => f.endsWith('.html.gz'));
    for (const gz of gzFiles) {
      const htmlPath = path.join(RAW, gz.replace(/\.gz$/, ''));
      if (existsSync(htmlPath)) continue; // Don't overwrite
      console.log(`Decompressing: ${gz} → ${gz.replace(/\.gz$/, '')}`);
      await pipeline(
        createReadStream(path.join(RAW, gz)),
        createGunzip(),
        createWriteStream(htmlPath)
      );
      await unlink(path.join(RAW, gz));
    }
    console.log(`Decompressed ${gzFiles.length} files.`);
  } else {
    // Compress: .html → .html.gz, remove original
    for (const f of htmlFiles) {
      const gzPath = path.join(RAW, f + '.gz');
      if (existsSync(gzPath)) continue; // Already compressed
      const htmlPath = path.join(RAW, f);
      console.log(`Compressing: ${f} → ${f}.gz`);
      await pipeline(
        createReadStream(htmlPath),
        createGzip({ level: 9 }),
        createWriteStream(gzPath)
      );
      await unlink(htmlPath);
    }
    console.log(`Compressed ${htmlFiles.length} files.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
