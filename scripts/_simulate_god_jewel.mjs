/**
 * Simulate crafting a god-tier Time-Lost Sapphire from scratch.
 * Uses processed JSON data directly (avoids TypeScript import issues).
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const bases = require('../data/processed/bases.json');
const mods = require('../data/processed/mods.json');
const currency = require('../data/processed/currency.json');
const prices = require('../public/data/prices.json');

// ── Prices ──
const META = prices._meta || {};
const priceMap = {};
for (const [k, v] of Object.entries(prices)) {
  if (k === '_meta') continue;
  if (typeof v === 'number' && v > 0) priceMap[k] = v;
}

const chaosPerDivine = META.chaosPerDivine || 7.37;
const chaosPerExalt = META.chaosPerExalt || 0.01795;

function lookupPrice(id) {
  const d = priceMap[id];
  if (d != null && d > 0) return d;
  const s = id.replace(/^(greater_|perfect_|lesser_|corrupted_)/, '');
  if (s !== id) {
    const fb = priceMap[s];
    if (fb != null && fb > 0) return fb;
  }
  return 1;
}

// ── Emulator functions (mini inlined for reliability) ──

const RARITY = { normal: 'normal', magic: 'magic', rare: 'rare' };

function emptyItem(base, ilvl) {
  return {
    name: base.name,
    rarity: RARITY.normal,
    itemLevel: ilvl || base.level || 1,
    affixes: [],
    implicit: null,
    corrupted: false,
    slot: base.slot || '',
    affixSlots: base.affixSlots ? { ...base.affixSlots } : { prefix: 0, suffix: 0 },
    baseDefence: null,
    quality: 0,
  };
}

function effectiveSlots(item) {
  return { ...item.affixSlots };
}

function buildPool(item, ctx, typeFilter) {
  const slot = item.slot;
  const ilvl = item.itemLevel;
  const eligible = (ctx.mods || mods).filter(m => {
    if (typeFilter && m.type !== typeFilter) return false;
    if (m.level > ilvl) return false;
    if (m.domain && !m.domain.includes(slot)) return false;
    if (ctx.minModLevel && m.level < ctx.minModLevel) return false;
    return true;
  });
  return eligible;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(arr, weightFn) {
  const weights = arr.map(weightFn);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pickRandom(arr);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

// ── Custom applyOperation (simplified, matches emulator.ts logic) ──

function transmutation(item, ctx) {
  const item2 = structuredClone(item);
  if (item2.rarity !== 'normal') return { ok: false, message: 'Item must be normal', item: item2 };
  const slots = effectiveSlots(item2);
  const pool = buildPool(item2, ctx);
  if (pool.length === 0) return { ok: false, message: 'No mods available', item: item2 };

  // Add 1 prefix + 1 suffix (PoE2 transmutation behavior)
  const prefixPool = pool.filter(m => m.type === 'prefix');
  const suffixPool = pool.filter(m => m.type === 'suffix');

  let added = [];
  if (prefixPool.length > 0) {
    const mod = weightedPick(prefixPool, m => m.weight || 1);
    item2.affixes.push({ id: mod.id, name: mod.name, type: 'prefix', tier: mod.tier || 1, tags: mod.tags || [] });
    added.push(mod.name);
  }
  if (suffixPool.length > 0) {
    const mod = weightedPick(suffixPool, m => m.weight || 1);
    item2.affixes.push({ id: mod.id, name: mod.name, type: 'suffix', tier: mod.tier || 1, tags: mod.tags || [] });
    added.push(mod.name);
  }
  item2.rarity = 'magic';
  return { ok: true, message: `Added: ${added.join(', ')}`, item: item2 };
}

function augmentation(item, ctx) {
  const item2 = structuredClone(item);
  if (item2.rarity !== 'magic') return { ok: false, message: 'Item must be magic', item: item2 };

  const slots = effectiveSlots(item2);
  const usedP = item2.affixes.filter(a => a.type === 'prefix').length;
  const usedS = item2.affixes.filter(a => a.type === 'suffix').length;
  const pool = buildPool(item2, ctx);

  // Find the type with the most remaining capacity
  const remainingP = Math.max(0, (slots.prefix || 0) - usedP);
  const remainingS = Math.max(0, (slots.suffix || 0) - usedS);

  let typeToAdd = 'prefix';
  if (remainingP <= 0 && remainingS > 0) typeToAdd = 'suffix';
  else if (remainingS <= 0 && remainingP <= 0) return { ok: false, message: 'All slots full', item: item2 };
  else if (remainingS > remainingP) typeToAdd = 'suffix';

  const typePool = pool.filter(m => m.type === typeToAdd);
  if (typePool.length === 0) return { ok: false, message: `No ${typeToAdd} mods available`, item: item2 };

  const mod = weightedPick(typePool, m => m.weight || 1);
  item2.affixes.push({ id: mod.id, name: mod.name, type: typeToAdd, tier: mod.tier || 1, tags: mod.tags || [] });

  return { ok: true, message: `Added ${typeToAdd}: ${mod.name}`, item: item2 };
}

function regal(item, ctx) {
  const item2 = structuredClone(item);
  if (item2.rarity !== 'magic') return { ok: false, message: 'Item must be magic', item: item2 };
  if (item2.affixes.length < 2) return { ok: false, message: 'Need 2 affixes for Regal', item: item2 };

  const slots = effectiveSlots(item2);
  const usedP = item2.affixes.filter(a => a.type === 'prefix').length;
  const usedS = item2.affixes.filter(a => a.type === 'suffix').length;
  const pool = buildPool(item2, ctx);

  // Pick the type with fewer mods currently
  let typeToAdd = 'prefix';
  if (usedS < usedP) typeToAdd = 'suffix';
  else if (usedP < usedS) typeToAdd = 'prefix';
  else typeToAdd = Math.random() < 0.5 ? 'prefix' : 'suffix';

  const typePool = pool.filter(m => m.type === typeToAdd);
  if (typePool.length === 0) return { ok: false, message: `No ${typeToAdd} available`, item: item2 };

  const mod = weightedPick(typePool, m => m.weight || 1);
  item2.affixes.push({ id: mod.id, name: mod.name, type: typeToAdd, tier: mod.tier || 1, tags: mod.tags || [] });
  item2.rarity = 'rare';

  return { ok: true, message: `Added ${typeToAdd}: ${mod.name}`, item: item2 };
}

function exalted(item, ctx) {
  const item2 = structuredClone(item);
  if (item2.rarity !== 'rare') return { ok: false, message: 'Item must be rare', item: item2 };

  const slots = effectiveSlots(item2);
  const usedP = item2.affixes.filter(a => a.type === 'prefix').length;
  const usedS = item2.affixes.filter(a => a.type === 'suffix').length;
  if (usedP >= (slots.prefix || 0) && usedS >= (slots.suffix || 0)) {
    return { ok: false, message: 'All slots full', item: item2 };
  }

  const pool = buildPool(item2, ctx);
  const remainingP = Math.max(0, (slots.prefix || 0) - usedP);
  const remainingS = Math.max(0, (slots.suffix || 0) - usedS);

  let typeToAdd = 'prefix';
  if (remainingP <= 0 && remainingS > 0) typeToAdd = 'suffix';
  else if (remainingS <= 0 && remainingP <= 0) return { ok: false, message: 'No room', item: item2 };
  else if (remainingS > remainingP) typeToAdd = 'suffix';

  const typePool = pool.filter(m => m.type === typeToAdd);
  if (typePool.length === 0) return { ok: false, message: `No ${typeToAdd} available`, item: item2 };

  const mod = weightedPick(typePool, m => m.weight || 1);
  item2.affixes.push({ id: mod.id, name: mod.name, type: typeToAdd, tier: mod.tier || 1, tags: mod.tags || [] });

  return { ok: true, message: `Added ${typeToAdd}: ${mod.name}`, item: item2 };
}

function chaosOrb(item, ctx) {
  const item2 = structuredClone(item);
  if (item2.rarity !== 'rare') return { ok: false, message: 'Item must be rare', item: item2 };
  if (item2.corrupted) return { ok: false, message: 'Cannot chaos a corrupted item', item: item2 };

  const slots = effectiveSlots(item2);
  const usedP = item2.affixes.filter(a => a.type === 'prefix').length;
  const usedS = item2.affixes.filter(a => a.type === 'suffix').length;

  // Chaos removes all, then adds new affixes up to the same count
  const totalSlots = (slots.prefix || 0) + (slots.suffix || 0);
  const pool = buildPool(item2, ctx);
  if (pool.length < 2) return { ok: false, message: 'Not enough mods available', item: item2 };

  item2.affixes = [];

  // Add prefixes: roll 0-3 (weighted by remaining capacity)
  const prefixPool = pool.filter(m => m.type === 'prefix');
  const suffixPool = pool.filter(m => m.type === 'suffix');

  const existingCount = usedP + usedS;
  const pToAdd = Math.min(usedP, prefixPool.length > 0 ? usedP : 0);
  const sToAdd = Math.min(usedS, suffixPool.length > 0 ? usedS : 0);
  const targetP = Math.max(1, Math.min(pToAdd, slots.prefix || 3));
  const targetS = Math.max(1, Math.min(sToAdd, slots.suffix || 3));

  // Randomize chaos outcome
  const chaosP = Math.round(Math.random() * (slots.prefix || 3));
  const chaosS = Math.round(Math.random() * (slots.suffix || 3));

  const finalP = Math.max(0, Math.min(chaosP, prefixPool.length));
  const finalS = Math.max(0, Math.min(chaosS, suffixPool.length));

  // Always at least 2 affixes for a rare chaos result
  const minAffixes = Math.max(2, Math.min(totalSlots, pool.length));
  let added = [];

  for (let i = 0; i < finalP; i++) {
    const mod = weightedPick(prefixPool, m => m.weight || 1);
    item2.affixes.push({ id: mod.id, name: mod.name, type: 'prefix', tier: mod.tier || 1, tags: mod.tags || [] });
    added.push(`P:${mod.name}`);
  }
  for (let i = 0; i < finalS; i++) {
    const mod = weightedPick(suffixPool, m => m.weight || 1);
    item2.affixes.push({ id: mod.id, name: mod.name, type: 'suffix', tier: mod.tier || 1, tags: mod.tags || [] });
    added.push(`S:${mod.name}`);
  }

  // Ensure we have minimum, refill if needed
  while (item2.affixes.length < minAffixes && pool.length > 0) {
    const remainingP = Math.max(0, (slots.prefix || 0) - item2.affixes.filter(a => a.type === 'prefix').length);
    const remainingS = Math.max(0, (slots.suffix || 0) - item2.affixes.filter(a => a.type === 'suffix').length);
    const tgt = remainingP > remainingS ? prefixPool : suffixPool;
    if (tgt.length > 0) {
      const m = weightedPick(tgt, mm => mm.weight || 1);
      item2.affixes.push({ id: m.id, name: m.name, type: remainingP > remainingS ? 'prefix' : 'suffix', tier: m.tier || 1, tags: m.tags || [] });
      added.push(`${remainingP > remainingS ? 'P' : 'S'}:${m.name}`);
    } else break;
  }

  return { ok: true, message: `Rerolled: ${added.length} new affixes`, item: item2 };
}

function vaalOrb(item, ctx) {
  const item2 = structuredClone(item);
  if (item2.corrupted) return { ok: false, message: 'Already corrupted', item: item2 };
  if (item2.rarity === 'normal') return { ok: false, message: 'Normal item — no effect', item: item2 };

  // Vaal outcomes: 25% each
  const roll = Math.random();
  if (roll < 0.25) {
    // Upgrade implicit (best outcome for jewel craft)
    item2.implicit = 'Corruption Implicit (Upgrades Radius to Very Large)';
    item2.corrupted = true;
    return { ok: true, message: 'Implicit upgraded (Best outcome)', item: item2 };
  } else if (roll < 0.5) {
    // Reroll mods
    const pool = buildPool(item2, ctx);
    item2.affixes = [];
    const prefixPool = pool.filter(m => m.type === 'prefix');
    const suffixPool = pool.filter(m => m.type === 'suffix');
    const slots = effectiveSlots(item2);
    const pCount = Math.min(3, slots.prefix || 3, prefixPool.length);
    const sCount = Math.min(3, slots.suffix || 3, suffixPool.length);
    for (let i = 0; i < pCount; i++) {
      const m = weightedPick(prefixPool, mm => mm.weight || 1);
      item2.affixes.push({ id: m.id, name: m.name, type: 'prefix', tier: m.tier || 1, tags: m.tags || [] });
    }
    for (let i = 0; i < sCount; i++) {
      const m = weightedPick(suffixPool, mm => mm.weight || 1);
      item2.affixes.push({ id: m.id, name: m.name, type: 'suffix', tier: m.tier || 1, tags: m.tags || [] });
    }
    item2.implicit = 'Corruption Implicit (New implicit)';
    item2.corrupted = true;
    return { ok: true, message: 'Mods rerolled', item: item2 };
  } else if (roll < 0.75) {
    // No change
    item2.corrupted = true;
    return { ok: true, message: 'No change (just corrupted)', item: item2 };
  } else {
    // Destroy (brick)
    item2.corrupted = true;
    item2.affixes = [];
    item2.rarity = 'normal';
    return { ok: false, message: 'Item destroyed! All affixes lost.', item: item2 };
  }
}

// ── Main simulation ──

const SAPPHIRE = bases.find(b => b.name === 'Sapphire' || b.name === 'Time-Lost Sapphire');
console.log('=== GOD TIER TIME-LOST SAPPHIRE — CRAFT SIMULATION ===');
console.log('Base:', SAPPHIRE?.name);
console.log('Slots: 3P / 3S');
console.log('Prices:', META.source || 'poe2scout');
console.log('1 Div =', chaosPerDivine.toFixed(2), 'c, 1 Ex =', chaosPerExalt.toFixed(4), 'c');
console.log('');

let item = emptyItem(SAPPHIRE, 83);
let totalCost = 0;
let step = 0;

function apply(label, fn, ctx, costId) {
  const cost = lookupPrice(costId);
  totalCost += cost;
  step++;
  const result = fn(item, ctx);
  if (result.item) item = result.item;
  const p = item.affixes.filter(a => a.type === 'prefix').length;
  const s = item.affixes.filter(a => a.type === 'suffix').length;
  console.log(`${String(step).padStart(2)}. ${label.padEnd(38)} ${result.ok ? '✓' : '✗'}  ${cost.toFixed(4)}c  ${item.rarity} ${p}P/${s}S  Total: ${totalCost.toFixed(2)}c`);
  if (!result.ok) console.log(`   → ${result.message}`);
}

const ctx = { mods };

// Phase 1: Base → Rare full
console.log('── Phase 1: Base → Rare ──');
apply('Transmutation (Normal→Magic)', transmutation, ctx, 'orb_of_transmutation');
apply('Augmentation (fill to 2)', augmentation, ctx, 'orb_of_augmentation');
apply('Regal Orb (Magic→Rare)', regal, ctx, 'regal_orb');
apply('Exalted #1 (4th affix)', exalted, ctx, 'exalted_orb');
apply('Exalted #2 (5th affix)', exalted, ctx, 'exalted_orb');
apply('Exalted #3 (6th affix)', exalted, ctx, 'exalted_orb');

console.log('');
console.log('── Rolled baseline: ──');
item.affixes.forEach(a => console.log(`  T${a.tier} ${a.type}: ${a.name}`));

// Phase 2: Chaos spam
console.log('');
console.log('── Phase 2: Chaos spam ──');

// Count desirable mods for jewel prefixes
const jewelPrefixes = mods.filter(m => m.type === 'prefix' && m.domain.includes('jewel') && m.level <= 83 && m.level > 0);
const goodPrefixKeywords = [/effect/i, /radius/i, /passive/i, /notable/i, /small/i, /damage/i, /life/i, /minion/i, /critical/i, /speed/i, /attack/i, /cast/i];
const goodPrefixes = jewelPrefixes.filter(m => goodPrefixKeywords.some(r => r.test(m.name)));
console.log(`Jewel prefixes at ilvl 83: ${jewelPrefixes.length}, good ones: ${goodPrefixes.length}`);
const hitRate = goodPrefixes.length / jewelPrefixes.length;
console.log(`Good prefix per-roll chance: ${(hitRate * 100).toFixed(1)}%`);

// Expected chaos for decent prefixes
const chaosCost = lookupPrice('chaos_orb');
const expectedAttempts = Math.min(Math.ceil(Math.log(1 - 0.9) / Math.log(1 - hitRate)), 50);
console.log(`Expected chaos attempts (90% confidence): ${expectedAttempts}`);

const attempts = Math.min(expectedAttempts, 10);
for (let i = 0; i < attempts; i++) {
  apply(`Chaos reroll #${i + 1}`, chaosOrb, ctx, 'chaos_orb');
}

// Phase 3: Fill with Exalteds
console.log('');
console.log('── Phase 3: Fill with Exalteds ──');
const usedP = item.affixes.filter(a => a.type === 'prefix').length;
const usedS = item.affixes.filter(a => a.type === 'suffix').length;
const remaining = (3 - usedP) + (3 - usedS);
for (let i = 0; i < remaining; i++) {
  apply(`Exalted #${i + 1}`, exalted, ctx, 'exalted_orb');
}

// Phase 4: Vaal
console.log('');
console.log('── Phase 4: Vaal Orb ──');
apply('Vaal Orb (corruption)', vaalOrb, ctx, 'vaal_orb');

// ── Results ──
console.log('');
console.log('══════════════════════════════════════════════');
console.log('  FINAL ITEM');
console.log('══════════════════════════════════════════════');
console.log(`  ${item.name || 'Time-Lost Sapphire'} · ${item.rarity}`);
console.log(`  Item Level: ${item.itemLevel}`);
console.log(`  Corrupted: ${item.corrupted}`);
if (item.implicit) console.log(`  ${item.implicit}`);
console.log('');
item.affixes.forEach(a => console.log(`    T${a.tier} ${a.type === 'prefix' ? 'Prefix' : 'Suffix'}  ${a.name}`));

console.log('');
console.log('══════════════════════════════════════════════');
console.log('  COST BREAKDOWN');
console.log('══════════════════════════════════════════════');
console.log(`  Total cost this simulation: ${totalCost.toFixed(2)} Chaos`);
console.log(`  In Exalted Orbs: ${(totalCost / chaosPerExalt).toFixed(1)}`);
console.log(`  In Divine Orbs:  ${(totalCost / chaosPerDivine).toFixed(2)}`);
console.log('');
console.log('  Expected cost with ${expectedAttempts} chaos rerolls (90% CI):');
console.log(`  Phase 1 (base): ~0.08c`);
const expectedChaosTotal = chaosCost * expectedAttempts;
console.log(`  Phase 2 (chaos x${expectedAttempts}): ~${expectedChaosTotal.toFixed(1)}c`);
console.log(`  Phase 3 (fill x${remaining}): ~${(remaining * chaosPerExalt).toFixed(3)}c`);
console.log(`  Phase 4 (vaal): ~${lookupPrice('vaal_orb').toFixed(4)}c (repeat if bricked)`);
const grandTotal = 0.08 + expectedChaosTotal + remaining * chaosPerExalt + lookupPrice('vaal_orb');
console.log(`  ───────────────────────────────────────────`);
console.log(`  TOTAL: ${grandTotal.toFixed(1)}c`);
console.log(`  In Ex: ${(grandTotal / chaosPerExalt).toFixed(0)}`);
console.log(`  In Div: ${(grandTotal / chaosPerDivine).toFixed(2)}`);
