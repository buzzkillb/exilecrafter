import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const root = join(import.meta.dirname, '..');

async function main() {
  const currency = JSON.parse(readFileSync(join(root, 'data/processed/currency.json'), 'utf-8'));
  const bases = JSON.parse(readFileSync(join(root, 'data/processed/bases.json'), 'utf-8'));
  const omens = JSON.parse(readFileSync(join(root, 'data/processed/omens.json'), 'utf-8'));

  let total = 0, updated = 0, failed = 0;

  async function downloadImage(url, destPath) {
    const fullPath = join(root, 'public', destPath);
    if (existsSync(fullPath)) return true;
    mkdirSync(dirname(fullPath), { recursive: true });
    try {
      const resp = await fetch(url, {
        headers: { 'Referer': 'https://poe2db.tw/', 'User-Agent': 'CraftClass/1.0' }
      });
      if (!resp.ok) { console.log(`  FAIL ${resp.status}: ${url}`); return false; }
      const buf = Buffer.from(await resp.arrayBuffer());
      writeFileSync(fullPath, buf);
      return true;
    } catch(e) {
      console.log(`  ERROR: ${e.message}`);
      return false;
    }
  }

  const categories = [
    { name: 'currency', items: currency, localPrefix: '/images/currency/' },
    { name: 'base', items: bases, localPrefix: '/images/base/' },
    { name: 'omen', items: omens, localPrefix: '/images/omen/' },
  ];

  for (const cat of categories) {
    console.log(`\n=== ${cat.name} (${cat.items.length} items) ===`);
    for (const item of cat.items) {
      const url = item.imageUrl;
      if (!url || !url.startsWith('http')) continue;
      total++;

      const safeId = item.id.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      const localPath = cat.localPrefix + safeId + '.webp';

      const ok = await downloadImage(url, localPath);
      if (ok) {
        item.imageUrl = localPath;
        updated++;
      } else {
        failed++;
      }
    }
  }

  writeFileSync(join(root, 'data/processed/currency.json'), JSON.stringify(currency, null, 2));
  writeFileSync(join(root, 'data/processed/bases.json'), JSON.stringify(bases, null, 2));
  writeFileSync(join(root, 'data/processed/omens.json'), JSON.stringify(omens, null, 2));

  console.log(`\n=== DONE ===`);
  console.log(`Total CDN URLs: ${total}`);
  console.log(`Updated to local: ${updated}`);
  console.log(`Failed downloads: ${failed}`);
}

main().catch(console.error);
