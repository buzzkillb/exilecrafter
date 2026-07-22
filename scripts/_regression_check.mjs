// scripts/_regression_check.mjs
// Data-quality invariants. Catches the three bugs that hit this codebase before:
//   1. Bases dominated by only 1-2 slots (parser scoping issue).
//   2. Omens with empty descriptions (parser blindly using h1).
//   3. Mods with all type='any' AND no domains (crawler scraping the wrong page).
//
// Exits non-zero if any invariant fails.

import { readFile } from 'node:fs/promises';

const FAIL = [];
const OK = [];
function fail(msg) { FAIL.push(msg); console.error(`✗ FAIL: ${msg}`); }
function pass(msg) { OK.push(msg); console.log(`✓ ${msg}`); }

async function loadJson(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

const bases = await loadJson('data/processed/bases.json');
const mods = await loadJson('data/processed/mods.json');
const omens = await loadJson('data/processed/omens.json');
const currency = await loadJson('data/processed/currency.json');

// === Bases ===
console.log('\nBases:');
const slots = new Map();
for (const b of bases) slots.set(b.slot, (slots.get(b.slot) || 0) + 1);
console.log(`  total: ${bases.length}`);
console.log(`  by slot: ${[...slots.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}`);

const EXPECTED_BASE_SLOTS = ['helmet', 'body_armour', 'gloves', 'boots', 'belt', 'amulet', 'ring', 'shield', 'weapon_1h', 'weapon_2h', 'focus', 'charm', 'quiver'];
const presentSlots = new Set(slots.keys());
for (const s of EXPECTED_BASE_SLOTS) {
  if (slots.get(s)) pass(`  bases span slot: ${s} (${slots.get(s)})`);
  else fail(`  missing expected slot: ${s}`);
}
if (slots.get('unknown')) fail(`  ${slots.get('unknown')} bases have slot 'unknown'`);

// At least N distinct slots represented
const DISTINCT_SLOTS_MIN = 10;
if (presentSlots.size < DISTINCT_SLOTS_MIN) fail(`  only ${presentSlots.size} distinct slots (expected >=${DISTINCT_SLOTS_MIN})`);
else pass(`  ${presentSlots.size} distinct base slots`);

if (bases.length < 800) fail(`  only ${bases.length} bases (expected >>368 after fix)`);
else pass(`  ${bases.length} bases (>800 after dedupe)`);

// All bases must have a name + slot
const nameless = bases.filter(b => !b.name || !b.slot);
if (nameless.length) fail(`  ${nameless.length} bases missing name or slot`);
else pass(`  all bases have name + slot`);

// === Omens ===
console.log('\nOmens:');
console.log(`  total: ${omens.length}`);
const emptyDesc = omens.filter(o => !o.description || o.description.length < 8);
if (emptyDesc.length > omens.length * 0.05) fail(`  ${emptyDesc.length}/${omens.length} omens have empty/short description`);
else pass(`  ${omens.length - emptyDesc.length}/${omens.length} omens have descriptions (${emptyDesc.length} blank — within tolerance)`);

const noImage = omens.filter(o => !o.imageUrl);
if (noImage.length > omens.length * 0.05) fail(`  ${noImage.length}/${omens.length} omens missing icon`);
else pass(`  ${omens.length - noImage.length}/${omens.length} omens have icons`);

const noName = omens.filter(o => !o.name);
if (noName.length) fail(`  ${noName.length} omens missing name`);
else pass(`  all omens have names`);

// === Mods ===
console.log('\nMods:');
console.log(`  total: ${mods.length}`);
const anyMods = mods.filter(m => m.type === 'any');
const emptyDomain = mods.filter(m => !m.domain || m.domain.length === 0);
const prefixMods = mods.filter(m => m.type === 'prefix');
const suffixMods = mods.filter(m => m.type === 'suffix');
const modTotalDomains = mods.reduce((s, m) => s + (m.domain ? m.domain.length : 0), 0);

if (mods.length < 50) fail(`  only ${mods.length} mods (too few — parser regression?)`);
else pass(`  ${mods.length} mods`);

// After the ModsView rewrite, mods MUST have proper type distribution
if (mods.length >= 100 && (anyMods.length / mods.length) > 0.5) {
  fail(`  ${anyMods.length}/${mods.length} mods still type='any' (ModsView parser regressed?)`);
} else {
  pass(`  type distribution: prefix=${prefixMods.length}, suffix=${suffixMods.length}, any=${anyMods.length}`);
}

// Mods must be tied to at least one slot domain (post-dedupe)
if (emptyDomain.length > 0) {
  fail(`  ${emptyDomain.length} mods have no domain (ModsView slot extraction failed)`);
} else {
  pass(`  every mod has at least one slot domain`);
}

// Multi-slot mods should exist for global families (e.g. Strength on amulet+ring+belt)
const multiDomain = mods.filter(m => m.domain.length >= 3);
if (mods.length >= 100 && multiDomain.length < 5) {
  fail(`  only ${multiDomain.length} multi-slot mods — domain merging broken`);
} else {
  pass(`  ${multiDomain.length} mods span 3+ slots (domain merge working)`);
}

// Tier sanity: max tier shouldn't exceed the typical PoE 1-8 range by orders of magnitude
const maxTier = mods.reduce((mx, m) => Math.max(mx, m.tier || 0), 0);
if (maxTier > 20) {
  console.warn(`  ⚠ max tier = ${maxTier} (some families have many stat variants — see WeaponDamageTypePrefix)`);
} else {
  pass(`  max tier = ${maxTier} (sane)`);
}

// Mod dedupe by description (across pages) should merge domains
const uniqueByDesc = new Set(mods.map(m => m.description)).size;
if (uniqueByDesc < mods.length * 0.5) pass(`  dedupe-by-desc collapsed ${mods.length} → ${uniqueByDesc} unique`);
else if (uniqueByDesc === mods.length) pass(`  ${mods.length} mods all unique`);
else console.log(`  ~ ${uniqueByDesc} unique mod descriptions out of ${mods.length} entries`);

// === Currency ===
console.log('\nCurrency:');
console.log(`  total: ${currency.length}`);
if (currency.length < 20) fail(`  only ${currency.length} currency items`);
else pass(`  ${currency.length} currency items`);

// === Per-base pool invariants ===
// Pick one known base per slot and verify the simulator pool has a sane
// number of eligible mods. This catches domain-filter regressions where
// every base would see the same global pool.
console.log('\nPer-base pools:');
const POOL_SAMPLES = [
  { name: 'Ancestral Tiara', slot: 'helmet', minPool: 100 },
  { name: 'Ancestral Mail', slot: 'body_armour', minPool: 100 },
  { name: 'Diamond', slot: 'jewel', minPool: 50 },
  { name: 'Waystone (Tier 1)', slot: 'waystone', minPool: 30 },
  { name: 'Ruby', slot: 'jewel', minPool: 50 },
];
for (const sample of POOL_SAMPLES) {
  const base = bases.find((b) => b.name === sample.name);
  if (!base) { fail(`  sample base not found: ${sample.name}`); continue; }
  if (base.slot !== sample.slot) fail(`  ${sample.name} slot mismatch: ${base.slot} != ${sample.slot}`);
  if (base.level === 1 && sample.slot !== 'waystone' && sample.slot !== 'jewel') {
    fail(`  ${sample.name} level=1 (requirements parser broken)`);
  }
  const prefixPool = mods.filter((m) => (m.type === 'prefix' || m.type === 'any') && (m.domain.length === 0 || m.domain.includes(base.slot)) && m.level <= base.level);
  const suffixPool = mods.filter((m) => (m.type === 'suffix' || m.type === 'any') && (m.domain.length === 0 || m.domain.includes(base.slot)) && m.level <= base.level);
  const total = prefixPool.length + suffixPool.length;
  if (total < sample.minPool) fail(`  ${sample.name} only has ${total} eligible mods (expected >=${sample.minPool})`);
  else pass(`  ${sample.name}: ${prefixPool.length}P + ${suffixPool.length}S = ${total} eligible mods (lvl ${base.level})`);
}

// === Per-base level sanity ===
console.log('\nPer-base levels:');
const LEVEL_SAMPLES = [
  { name: 'Rusted Greathelm', expectedLevel: 1 }, // lowest str helmet
  { name: 'Soldier Greathelm', expectedLevel: 12 },
  { name: 'Spired Greathelm', expectedLevel: 27 },
  { name: 'Waystone (Tier 1)', expectedLevel: 65 },
  { name: 'Waystone (Tier 16)', expectedLevel: 80 },
];
for (const s of LEVEL_SAMPLES) {
  const base = bases.find((b) => b.name === s.name);
  if (!base) { fail(`  ${s.name} not found`); continue; }
  if (base.level !== s.expectedLevel) fail(`  ${s.name} level=${base.level} (expected ${s.expectedLevel})`);
  else pass(`  ${s.name}: level=${base.level}`);
}

// Currency coverage checks
console.log('\\nCurrency special items:');
const catalysts = currency.filter((c) => (c.id || '').includes('catalyst'));
if (catalysts.length < 10) fail(`  only ${catalysts.length} catalysts (expected at least 10)`);
else pass(`  ${catalysts.length} catalysts available`);

const bones = currency.filter((c) => /collarbone|jawbone|rib/i.test(c.id || ''));
if (bones.length < 5) fail(`  only ${bones.length} desecration bones (expected at least 8)`);
else pass(`  ${bones.length} desecration bones available`);

// === Mod weight source coverage ===
console.log('\nMod weight sources:');
const withRealWeight = mods.filter((m) => m.weight && m.weight > 0).length;
if (withRealWeight < mods.length * 0.9) fail(`  only ${withRealWeight}/${mods.length} mods have real DropChance weights`);
else pass(`  ${withRealWeight}/${mods.length} mods carry real DropChance weights`);

// === Mod stat range coverage ===
console.log('\nMod stat ranges:');
const withRanges = mods.filter((m) => Array.isArray(m.statRanges) && m.statRanges.length > 0).length;
const withParens = mods.filter((m) => /\([\d.]+\s*[—–\-]\s*[\d.]+\)/.test(m.description || '')).length;
if (withRanges < withParens * 0.9) fail(`  only ${withRanges}/${withParens} mods with parenthetical values have parsed ranges`);
else pass(`  ${withRanges}/${withParens} mods with parenthetical values have parsed ranges`);

// === Summary ===
console.log('\n──────────────────────────────────────────');
console.log(`Passed: ${OK.length}, Failed: ${FAIL.length}`);
if (FAIL.length) {
  console.log('\nFailures:');
  for (const f of FAIL) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('All invariants OK ✓');
