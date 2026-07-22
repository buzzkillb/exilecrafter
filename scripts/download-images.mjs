/**
 * download-images.mjs
 *
 * Downloads all item/currency/omen/etc. images from poe2db's CDN
 * and saves them locally under public/images/ so the static site
 * isn't at the mercy of hotlink protection (CDN returns 403 without
 * a proper Referer header).
 *
 * Usage:  node scripts/download-images.mjs
 *
 * Reads every processed JSON file, finds imageUrl fields,
 * downloads the image with the correct Referer header,
 * writes it to public/images/<category>/<path>, and patches
 * the JSON in-place so the URL becomes a relative local path.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public', 'images');
const DATA = join(ROOT, 'data', 'processed');

const CATEGORIES = [
  { file: 'bases.json',    key: 'bases',    referer: 'https://poe2db.tw/us/' },
  { file: 'currency.json', key: 'currency', referer: 'https://poe2db.tw/us/' },
  { file: 'omens.json',    key: 'omens',    referer: 'https://poe2db.tw/us/' },
  // mods.json has no imageUrl fields — skip it
];

const MAX_CONCURRENT = 8;

function download(url, dest, referer) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname,
      headers: { Referer: referer },
      timeout: 15_000,
    };
    https.get(opts, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        const redirect = res.headers.location;
        if (!redirect) return reject(new Error(`Redirect with no Location: ${url}`));
        return download(redirect, dest, referer).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, Buffer.concat(chunks));
        resolve();
      });
      res.on('error', reject);
    }).on('error', reject).on('timeout', function () {
      this.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

function localDest(imageUrl, categoryKey) {
  if (!imageUrl) return null;
  try {
    const u = new URL(imageUrl);
    // Extract the path after "Art/2DItems/" — that's the logical filename path
    const match = u.pathname.match(/\/Art\/2DItems\/(.+)$/i);
    if (!match) {
      const parts = u.pathname.split('/');
      return { dest: join(PUBLIC, categoryKey, parts[parts.length - 1]), sub: parts[parts.length - 1] };
    }
    // Keep original case (matches poe2db's file naming) but join under categoryKey
    const sub = match[1].replace(/\\/g, '/');
    return { dest: join(PUBLIC, categoryKey, sub), sub };
  } catch {
    return null;
  }
}

function toRelative(localResult) {
  // The dest is like ...\public\images\currency\Currency\AncientOrb.webp
  // We want /images/currency/Currency/AncientOrb.webp
  const norm = localResult.dest.replace(/\\/g, '/');
  const idx = norm.indexOf('public/images/');
  if (idx !== -1) {
    // /public/images/currency/Currency/AncientOrb.webp → /images/currency/Currency/AncientOrb.webp
    return '/images/' + norm.slice(idx + 'public/images/'.length);
  }
  const idx2 = norm.indexOf('images/');
  if (idx2 !== -1) return '/' + norm.slice(idx2);
  return '/images/' + localResult.sub;
}

async function main() {
  let total = 0, skipped = 0, failed = 0;

  for (const cat of CATEGORIES) {
    const filePath = join(DATA, cat.file);
    if (!existsSync(filePath)) {
      console.warn(`  [SKIP] ${cat.file} not found`);
      continue;
    }

    const items = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(items)) {
      console.warn(`  [SKIP] ${cat.file} is not an array`);
      continue;
    }

    console.log(`\n  ${cat.file} (${items.length} items) …`);

    // Build a list of items that need downloading
    const needDownload = [];
    let changed = false;

    for (const item of items) {
      const orig = item.imageUrl;
      if (!orig || orig.startsWith('/images/') || orig.startsWith('./')) continue;

      const loc = localDest(orig, cat.key);
      if (!loc) continue;

      const destPath = loc.dest;
      item.imageUrl = toRelative(loc);
      changed = true;

      if (existsSync(destPath)) {
        skipped++;
      } else {
        needDownload.push({ item, orig, destPath, referer: cat.referer });
      }
    }

    // Download with concurrency limit
    if (needDownload.length > 0) {
      console.log(`  Downloading ${needDownload.length} images (concurrency: ${MAX_CONCURRENT}) …`);
      const queue = [...needDownload];
      async function worker() {
        while (queue.length > 0) {
          const job = queue.shift();
          try {
            await download(job.orig, job.destPath, job.referer);
            total++;
            if (total % 25 === 0) console.log(`  … ${total} downloaded`);
          } catch (err) {
            failed++;
            console.error(`  [FAIL] ${err.message}`);
            // Restore original CDN URL
            job.item.imageUrl = job.orig;
          }
        }
      }
      const workers = Array.from({ length: Math.min(MAX_CONCURRENT, needDownload.length) }, () => worker());
      await Promise.all(workers);
    }

    if (changed) {
      writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8');
      console.log(`  ✓ URLs localised` + (needDownload.length > 0 ? ` (${needDownload.length} new)` : ''));
    } else {
      console.log(`  (no changes)`);
    }
  }

  console.log(`\n  Done: ${total} downloaded, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) {
    console.error('  Some downloads failed — check the URLs or network');
  }
}

main();
