// scripts/fetch-unique-images.mjs
// Scrapes poe2db for all unique item images and creates a mapping file.
// Run: node scripts/fetch-unique-images.mjs
//
// Output:
//   data/processed/unique-images.json  — maps uniqueName → { imageUrl, baseType, cdnUrl }
//   public/images/unique/<name>.webp   — downloaded images

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import https from 'https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'processed');
const IMAGE_DIR = path.join(ROOT, 'public', 'images', 'unique');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CraftClassBot/0.1 (+local)';
const REFERER = 'https://poe2db.tw/us/';

// Known unique items from poe2db Runes_of_Aldur_uniques page.
// slug = the poe2db page URL slug (case-sensitive!)
const UNIQUE_SLUGS = [
  'The_Taming',
  'Bereks_Grip', 'Bereks_Pass', 'Bereks_Respite',
  'Decree_of_Acuity', 'Decree_of_Flight', 'Decree_of_Loyalty',
  'The_Hollow_Mask', 'The_Auspex', 'Facebreaker',
  'Eyes_of_the_Runefather',
  'Geofris_Sanctuary', 'Twisted_Empyrean', 'Ironbound',
  'Eventide_Petals', 'Spiteful_Floret',
  'Horrors_Flight', 'Nightfall', 'Redemption',
  'Cat_O_Nine_Tails', 'Mageblood',
  'Sylvans_Effigy', 'The_Ordained', 'Serles_Grit',
  'Brutus_Lead_Sprinkler',
  'Reverie', 'Liminal_Coil', 'The_Unleashed', 'Voices',
  'Opportunity',
  'Loreweave', 'Mastered_Domain', 'Duality', 'Periphery',
  'Forgotten_Warden', 'Sadists_Mercy', 'The_Ravens_Flock',
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({
      hostname: u.hostname, path: u.pathname + (u.search || ''),
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      timeout: 15_000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchPage(new URL(res.headers.location, url).href).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('Timeout')); });
  });
}

function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({
      hostname: u.hostname, path: u.pathname + (u.search || ''),
      headers: { Referer: REFERER },
      timeout: 15_000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadImage(new URL(res.headers.location, url).href, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        mkdirSync(path.dirname(destPath), { recursive: true });
        writeFileSync(destPath, Buffer.concat(chunks));
        resolve();
      });
      res.on('error', reject);
    }).on('error', reject).on('timeout', function () { this.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * Extract the image URL from a poe2db unique item page HTML.
 * Uses the first <img> tag that points to a "Uniques/" image on cdn.poe2db.tw.
 */
function extractImageUrl(html, slug) {
  // Strategy 1: Find <img> tag with src containing "Uniques/" on cdn.poe2db.tw
  const imgRegex = /<img[^>]*src="(https:\/\/cdn\.poe2db\.tw\/image\/Art\/2DItems\/[^"]*Uniques\/[^"]+\.webp)"/i;
  const imgMatch = html.match(imgRegex);
  if (imgMatch) return imgMatch[1];

  // Strategy 2: og:image meta (might also work)
  const ogRegex = /<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*\/?>/i;
  const ogMatch = html.match(ogRegex);
  if (ogMatch && ogMatch[1].length > 10) return ogMatch[1];

  // Strategy 3: Icon table field
  const iconRegex = /Icon\s+(Art\/2DItems\/\S+)/i;
  const iconMatch = html.match(iconRegex);
  if (iconMatch) {
    const relativePath = iconMatch[1].replace(/\\/g, '/').trim();
    if (!relativePath.match(/\.\w+$/)) return `https://cdn.poe2db.tw/image/${relativePath}.webp`;
    return `https://cdn.poe2db.tw/image/${relativePath}`;
  }

  return null;
}

/**
 * Extract the baseType (e.g., "Prismatic Ring") from a poe2db unique item page.
 */
function extractBaseType(html) {
  // Look for BaseType in the attribute table
  const btMatch = html.match(/BaseType\s*\[?([^\]\n<]*?)\]?\s*(?:\n|<|$)/i);
  if (btMatch) return btMatch[1].trim();
  // Fallback: the item title line
  const titleMatch = html.match(/<b>\s*([^<]+?)\s*<\/b>\s*</i);
  if (titleMatch) return titleMatch[1].trim();
  return '';
}

/**
 * Normalize slug to a display name (e.g., "Bereks_Grip" → "Berek's Grip")
 */
function slugToDisplayName(slug) {
  const possessives = {
    bereks: "Berek's",
    geofris: "Geofri's",
    sylvans: "Sylvan's",
    serles: "Serle's",
    horrors: "Horror's",
    spiteful: "Spiteful",  // not possessive
    sadists: "Sadist's",
    eyes: "Eyes",
    brutus: "Brutus'",
    cat_o_nine_tails: "Cat O' Nine Tails",
  };
  const lower = slug.toLowerCase();
  if (possessives[lower]) return possessives[lower];
  // Default: replace underscores with spaces, capitalize words
  return slug
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function main() {
  mkdirSync(IMAGE_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const mapping = {};
  let downloaded = 0, failed = 0, skipped = 0;

  for (const slug of UNIQUE_SLUGS) {
    const displayName = slugToDisplayName(slug);
    console.log(`\n${displayName} (${slug})...`);

    // 1. Fetch poe2db page
    let html;
    try {
      html = await fetchPage(`https://poe2db.tw/us/${slug}`);
    } catch (err) {
      console.error(`  [SKIP] Page fetch: ${err.message}`);
      failed++;
      continue;
    }

    // 2. Extract image URL from the page
    const imageUrl = extractImageUrl(html, slug);
    if (!imageUrl) {
      console.error(`  [SKIP] Could not find image URL in page`);
      failed++;
      continue;
    }
    console.log(`  Image: ${imageUrl}`);

    // 3. Extract base type
    const baseType = extractBaseType(html);

    // 4. Download image if not already cached
    const localFilename = slug.replace(/[^a-zA-Z0-9_-]/g, '_') + '.webp';
    const localDest = path.join(IMAGE_DIR, localFilename);

    if (!existsSync(localDest)) {
      try {
        await downloadImage(imageUrl, localDest);
        console.log(`  ✓ Downloaded`);
        downloaded++;
      } catch (err) {
        console.error(`  [FAIL] Image download: ${err.message}`);
        failed++;
        continue;
      }
    } else {
      console.log(`  ✓ Already cached`);
      skipped++;
    }

    // 5. Build mapping entry
    mapping[displayName] = {
      slug,
      imageUrl: `/images/unique/${localFilename}`,
      baseType,
      cdnUrl: imageUrl,
    };
    mapping[slug] = mapping[displayName]; // also keyed by slug for reverse lookup
  }

  // 6. Write mapping JSON
  const outPath = path.join(OUT_DIR, 'unique-images.json');
  writeFileSync(outPath, JSON.stringify(mapping, null, 2), 'utf-8');
  console.log(`\n✓ Mapping written to ${outPath}`);
  console.log(`  ${Object.keys(mapping).length} entries (${downloaded} downloaded, ${skipped} cached, ${failed} failed)`);
}

main().catch(console.error);
