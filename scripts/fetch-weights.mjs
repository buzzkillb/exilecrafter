// scripts/fetch-weights.mjs
// Pulls mod weights for PoE2 base items. Weights are not in game files and must
// be sourced from community datasets. This script reads from a local CSV/JSON
// the maintainer drops into data/manual/weights.json, plus an optional remote
// CSV. Output: data/processed/weights.json
//
// To contribute weights, the maintainer should export Krakenbul's spreadsheets
// (https://discord.gg/3VxKY6gt7j) to CSV and drop here.
//
// Remote source stub: pull from a community-maintained URL if provided via
// env CRAFTCLASS_WEIGHTS_URL.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANUAL = path.join(ROOT, 'data', 'manual', 'weights.json');
const OUT = path.join(ROOT, 'data', 'processed', 'weights.json');

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function loadManual() {
  if (!(await exists(MANUAL))) return [];
  const raw = await readFile(MANUAL, 'utf8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : (data.entries || []);
}

async function loadRemote() {
  const url = process.env.CRAFTCLASS_WEIGHTS_URL;
  if (!url) return [];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : (data.entries || []);
  } catch (err) {
    console.warn(`Could not fetch remote weights: ${err.message}`);
    return [];
  }
}

function normalize(entries) {
  return entries
    .filter((e) => e && e.baseId && e.modId && typeof e.weight === 'number')
    .map((e) => ({
      baseId: String(e.baseId).toLowerCase(),
      modId: String(e.modId),
      weight: e.weight,
      source: e.source || 'manual',
      notes: e.notes,
    }));
}

async function main() {
  await mkdir(path.dirname(OUT), { recursive: true });
  const manual = await loadManual();
  const remote = await loadRemote();
  const merged = normalize([...manual, ...remote]);

  await writeFile(OUT, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`Wrote ${merged.length} weight entries to data/processed/weights.json`);
  if (merged.length === 0) {
    console.log('Tip: drop weight entries into data/manual/weights.json to enable probability math.');
    console.log('     See data/manual/README.md for schema.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
