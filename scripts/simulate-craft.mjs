// scripts/simulate-craft.mjs
// Monte Carlo craft simulation using real data from data/processed/
// Usage: node scripts/simulate-craft.mjs [trials]

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load real game data ──────────────────────────────────────────────
const mods = JSON.parse(readFileSync(join(ROOT, 'data/processed/mods.json'), 'utf-8'));
const bases = JSON.parse(readFileSync(join(ROOT, 'data/processed/bases.json'), 'utf-8'));
const currency = JSON.parse(readFileSync(join(ROOT, 'data/processed/currency.json'), 'utf-8'));
const omens_ = JSON.parse(readFileSync(join(ROOT, 'data/processed/omens.json'), 'utf-8'));
const weights_ = JSON.parse(readFileSync(join(ROOT, 'data/processed/weights.json'), 'utf-8'));

// ── Helpers ──────────────────────────────────────────────────────────
function pickN(pool, n) {
  if (n <= 0 || pool.length === 0) return { picked: [], probability: 0 };
  const picked = [];
  const remaining = [...pool];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const totalW = remaining.reduce((s, e) => s + e.weight, 0);
    if (totalW <= 0) break;
    let roll = Math.random() * totalW;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      roll -= remaining[idx].weight;
      if (roll <= 0) break;
    }
    if (idx >= remaining.length) idx = remaining.length - 1;
    picked.push(remaining[idx].mod);
    remaining.splice(idx, 1);
  }
  return { picked };
}

function buildPool(mods, type, slot, ilvl, blocked = new Set(), minModLevel = 0) {
  return mods
    .filter(m => {
      if (m.type !== type && m.type !== 'any') return false;
      if (m.domain.length > 0 && !m.domain.includes(slot)) return false;
      if (m.level > ilvl) return false;
      if (m.level < minModLevel) return false;
      if (blocked.has(m.id)) return false;
      return true;
    })
    .map(m => ({
      mod: m,
      weight: (m.weight && m.weight > 0) ? m.weight : Math.max(1, Math.pow(2, 10 - m.tier) * 10),
    }));
}

function pickModFromPool(pool) {
  const { picked } = pickN(pool, 1);
  return picked.length > 0 ? picked[0] : null;
}

// Tag-based filtering for omens (flux) - filter pool to only mods with certain tags
function filterPoolByTags(pool, tags) {
  return pool.filter(p => tags.some(t => p.mod.tags.includes(t)));
}

// ── Pricing (divine orbs as base unit) ───────────────────────────────
const PRICES = {
  'orb_of_transmutation': 0.001,
  'orb_of_augmentation': 0.002,
  'regal_orb': 0.02,
  'orb_of_alchemy': 0.05,
  'exalted_orb': 0.15,
  'greater_exalted_orb': 0.5,
  'perfect_exalted_orb': 3.0,
  'chaos_orb': 0.01,
  'orb_of_annulment': 0.15,
  'fracturing_orb': 1.5,
  'vaal_orb': 0.02,
  'orb_of_chance': 0.01,
  'ancient_orb': 0.1,
  'divine_orb': 1.0,
  // Omens
  'omen_of_greater_exaltation': 2.0,
  'omen_of_dextral_exaltation': 0.5,
  'omen_of_sinistral_exaltation': 0.5,
  'omen_of_light_jail': 0.8,
  'omen_of_crystallisation': 1.0,
  // Flux (Liquid emotions that force mod tags)
  'liquid_of_desire': 0.3,   // fire/flask
  'liquid_of_envy': 0.3,     // chaos/attribute
  'liquid_of_contempt': 0.3, // physical/attack
  'liquid_of_anger': 0.3,    // cold/caster
  'liquid_of_wrath': 0.3,    // lightning/damage
  'liquid_of_sorrow': 0.3,   // elemental/defence
  'liquid_of_greed': 0.3,    // life/mana
  'liquid_of_fear': 0.3,     // speed/resistance
  // Desecrated bones
  'preserved_rib': 1.5,
  'ancient_rib': 1.0,
  'gnawed_rib': 0.5,
  // Bases
  'base_ilvl82': 1.0,
};

function cost(name) { return PRICES[name] || 0; }

// ── Item helpers ─────────────────────────────────────────────────────
function createItem(base, ilvl) {
  return {
    baseId: base.id,
    baseName: base.name,
    slot: base.slot,
    rarity: 'normal',
    itemLevel: ilvl,
    affixes: [],
    fractured: [],
    corrupted: false,
  };
}

function addAffix(item, affix) {
  item.affixes.push(affix);
}

function removeRandomAffix(item, type) {
  const candidates = item.affixes
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.type === type && !item.fractured.some(f => f.modId === a.modId));
  if (candidates.length === 0) return null;
  const { i } = candidates[Math.floor(Math.random() * candidates.length)];
  const removed = item.affixes[i];
  item.affixes.splice(i, 1);
  return removed;
}

function makeAffix(mod, slot, ilvl) {
  return {
    modId: mod.id,
    type: mod.type,
    tier: mod.tier,
    name: mod.name,
    rolledText: mod.name,
    tags: mod.tags,
    weight: mod.weight || 1000,
  };
}

function countType(item, type) {
  return item.affixes.filter(a => a.type === type).length;
}

function hasFractured(item) {
  return item.fractured.length > 0;
}

// ── Craft simulation ────────────────────────────────────────────────
function simulateBootCraft() {
  const costs = { div: 0 };
  const log = [];

  const base = bases.find(b => b.name === 'Sekhema Sandals');
  if (!base) return { error: 'Base not found', costs, log };

  // Use ilvl 82
  const item = createItem(base, 82);
  costs.div += cost('base_ilvl82');
  log.push(`Base: Sekhema Sandals (ilvl 82) — ${cost('base_ilvl82').toFixed(1)} div`);

  // ── Step 1: Transmute + Augment → get T1 MS ──
  // Use transmute to make it magic, then augment for a second mod
  // We want T1 movement speed (35%, ilvl 82 required)
  item.rarity = 'magic';

  // Transmute: gives 1 random prefix
  costs.div += cost('orb_of_transmutation');
  const transPool = buildPool(mods, 'prefix', item.slot, item.itemLevel);
  const transMod = pickModFromPool(transPool);
  if (!transMod) return { error: 'No prefix available from transmute', costs, log };
  addAffix(item, makeAffix(transMod, item.slot, item.itemLevel));

  // Check if it's MS
  const isMS = item.affixes[0].name.toLowerCase().includes('movement speed');
  let msAffix;
  
  if (isMS) {
    msAffix = item.affixes[0];
    log.push(`Transmute → ${transMod.name} (T${transMod.tier}) — MS hit on first try`);
  } else {
    // Annul the bad mod and try again (up to 10 attempts)
    for (let attempt = 0; attempt < 10; attempt++) {
      costs.div += cost('orb_of_annulment');
      removeRandomAffix(item, 'prefix');
      costs.div += cost('orb_of_transmutation');
      const newTransPool = buildPool(mods, 'prefix', item.slot, item.itemLevel);
      const newMod = pickModFromPool(newTransPool);
      if (!newMod) break;
      addAffix(item, makeAffix(newMod, item.slot, item.itemLevel));
      if (newMod.name.toLowerCase().includes('movement speed')) {
        msAffix = item.affixes[0];
        log.push(`Transmute (attempt ${attempt + 2}) → ${newMod.name} (T${newMod.tier}) — MS hit`);
        break;
      }
      // Didn't hit MS, annul again
      costs.div += cost('orb_of_annulment');
      removeRandomAffix(item, 'prefix');
    }
    if (!msAffix) {
      // Failed to get MS, return failure
      log.push(`FAILED: Could not roll MS on magic item`);
      return { error: 'MS roll failed', costs, log, success: false };
    }
  }

  // Augment to get a second prefix (magic item has 1-2 mods)
  costs.div += cost('orb_of_augmentation');
  const augPool = buildPool(mods, 'prefix', item.slot, item.itemLevel, new Set([msAffix.modId]));
  const augMod = pickModFromPool(augPool);
  if (augMod) {
    addAffix(item, makeAffix(augMod, item.slot, item.itemLevel));
    log.push(`Augment → ${augMod.name} (T${augMod.tier})`);
  }

  // ── Step 2: Fracture the MS ──
  // Fracturing Orb: 50% chance to fracture MS (2 mods on magic, each has equal chance)
  costs.div += cost('fracturing_orb');
  const msCandidateIdx = item.affixes.findIndex(a => a.name.toLowerCase().includes('movement speed'));
  if (msCandidateIdx === -1) {
    log.push('MS affix not found for fracture');
    return { error: 'MS affix not found', costs, log, success: false };
  }

  // Fracture hits: 1/N where N is number of mods. With 2 mods, 50% each.
  const fracTargetIdx = Math.floor(Math.random() * item.affixes.length);
  const fractureMissed = fracTargetIdx !== msCandidateIdx;

  if (fractureMissed) {
    // The other mod was fractured instead. Item is bricked.
    log.push(`Fracture MISSED MS (hit ${item.affixes[fracTargetIdx].name.slice(0,40)} instead). Retrying...`);
    return simulateBootCraft(); // restart
  }

  item.fractured.push(item.affixes[msCandidateIdx]);
  item.affixes.splice(msCandidateIdx, 1);
  log.push(`Fracture → locked ${item.fractured[0].name.slice(0,40)} (50% success)`);

  // ── Step 3a: Regal to Rare ──
  costs.div += cost('regal_orb');
  item.rarity = 'rare';
  const regalPool = buildPool(mods, 'suffix', item.slot, item.itemLevel);
  const regalMod = pickModFromPool(regalPool);
  if (regalMod) {
    addAffix(item, makeAffix(regalMod, item.slot, item.itemLevel));
    log.push(`Regal → ${regalMod.name} (T${regalMod.tier})`);
  }

  // ── Step 3b: Chaos/Annul spam to hit T1 Cold Res + T1 Fire Res ──
  // Strategy: chaos orb to reroll, then annulment to remove unwanted mods
  // Use omens (flux) to influence tag weighting
  // Target: T1 Cold (+41-45%) and T1 Fire (+41-45%)
  
  let chaosSpend = 0;
  let chaosFound = false;
  const maxChaosDiv = 50; // Budget cap in div
  
  while (!chaosFound && costs.div < maxChaosDiv) {
    // Chaos orb the item (rerolls all non-fractured affixes)
    costs.div += cost('chaos_orb');
    chaosSpend++;
    
    item.affixes = [];
    item.rarity = 'rare';
    
    // Chaos orb gives 3-6 mods on a rare. Let's say 4-6 for boots.
    // Sekhema has 2 prefix + 2 suffix slots = 4 total
    // Chaos orb fills available slots
    
    // Roll prefixes (1 available after fracturing MS)
    const prefPool = buildPool(mods, 'prefix', item.slot, item.itemLevel, 
      new Set(item.fractured.map(f => f.modId)));
    
    for (let p = 0; p < base.affixSlots.prefix - item.fractured.length; p++) {
      const blocked = new Set(item.affixes.filter(a => a.type === 'prefix').map(a => a.modId));
      blocked.add(...item.fractured.map(f => f.modId));
      const pool = buildPool(mods, 'prefix', item.slot, item.itemLevel, blocked);
      const mod = pickModFromPool(pool);
      if (mod) addAffix(item, makeAffix(mod, item.slot, item.itemLevel));
    }
    
    // Roll suffixes (2 slots)
    for (let s = 0; s < base.affixSlots.suffix; s++) {
      const blocked = new Set(item.affixes.filter(a => a.type === 'suffix').map(a => a.modId));
      const pool = buildPool(mods, 'suffix', item.slot, item.itemLevel, blocked);
      const mod = pickModFromPool(pool);
      if (mod) addAffix(item, makeAffix(mod, item.slot, item.itemLevel));
    }
    
    // Check if we have T1 Cold Res AND T1 Fire Res
    const colds = item.affixes.filter(a => 
      a.tier === 1 && a.name.toLowerCase().includes('cold') && a.name.toLowerCase().includes('resistance'));
    const fires = item.affixes.filter(a => 
      a.tier === 1 && a.name.toLowerCase().includes('fire') && a.name.toLowerCase().includes('resistance'));
    
    if (colds.length > 0 && fires.length > 0) {
      chaosFound = true;
      log.push(`Chaos (${chaosSpend}×) → hit T1 Cold + T1 Fire`);
    }
  }
  
  if (!chaosFound) {
    log.push(`Chaos spam FAILED after ${chaosSpend} orbs (${costs.div.toFixed(1)} div spent)`);
    return { error: 'Chaos spam failed', costs, log, success: false };
  }

  // ── Step 4: Exalt prefixes (T1 ES + hybrid ES) ──
  // Use: Omen of Greater Exaltation (double exalt) + Omen of Dextral Exaltation (force prefix)
  // Combined with Perfect Exalted Orb for T1
  costs.div += cost('omen_of_greater_exaltation');
  costs.div += cost('omen_of_dextral_exaltation');
  costs.div += cost('perfect_exalted_orb');
  
  log.push(`Omens: Greater Exaltation + Dextral Exaltation + Perfect Exalt`);

  // Perfect Exalted Orb adds a T1 prefix (minModLevel high → only T1 rolls)
  const perfectPrefPool = buildPool(mods, 'prefix', item.slot, item.itemLevel, 
    new Set([...item.affixes.map(a => a.modId), ...item.fractured.map(f => f.modId)]));
  
  // Double exalt omen: add 2 prefixes
  for (let ex = 0; ex < 2; ex++) {
    const blocked = new Set([...item.affixes.map(a => a.modId), ...item.fractured.map(f => f.modId)]);
    const exPool = buildPool(mods, 'prefix', item.slot, item.itemLevel, blocked);
    // Perfect Exalt forces high tier: filter to T1-T2
    const highPool = exPool.filter(p => p.mod.tier <= 2);
    const chosen = highPool.length > 0 ? pickModFromPool(highPool) : pickModFromPool(exPool);
    if (chosen) {
      addAffix(item, makeAffix(chosen, item.slot, item.itemLevel));
      log.push(`Exalt ${ex + 1} → ${chosen.name.slice(0,60)} (T${chosen.tier})`);
    }
  }

  // ── Step 5: Preserved Rib → Hybrid ES prefix ──
  // Preserved Rib desecrates a prefix on armour. Since we already have 3 prefixes
  // (1 fractured MS + 2 exalt), we replace one.
  costs.div += cost('preserved_rib');
  
  // Find a hybrid ES prefix (ES + stun threshold)
  const hybridPool = buildPool(mods, 'prefix', item.slot, item.itemLevel)
    .filter(p => p.mod.name.toLowerCase().includes('energy shield') && 
                 p.mod.name.toLowerCase().includes('stun threshold'));
  const hybridMod = pickModFromPool(hybridPool);
  
  if (hybridMod) {
    // Replace a non-fractured prefix
    const replaceIdx = item.affixes.findIndex((a, i) => a.type === 'prefix');
    if (replaceIdx >= 0) {
      item.affixes[replaceIdx] = makeAffix(hybridMod, item.slot, item.itemLevel);
      log.push(`Preserved Rib → ${hybridMod.name.slice(0,60)} (replaced a prefix)`);
    }
  }

  // ── Results ──
  const totalDiv = costs.div;
  log.push(`\n═══════════════════════════════════════`);
  log.push(`CRAFT RESULT — ${totalDiv.toFixed(1)} div total`);
  log.push(`Prefixes:`);
  const allPrefs = [...item.fractured, ...item.affixes.filter(a => a.type === 'prefix')];
  allPrefs.forEach(a => {
    const f = item.fractured.some(f => f.modId === a.modId) ? ' ⚡FRACTURED' : '';
    log.push(`  T${a.tier} ${a.name.slice(0,70)}${f}`);
  });
  log.push(`Suffixes:`);
  item.affixes.filter(a => a.type === 'suffix').forEach(a => {
    log.push(`  T${a.tier} ${a.name.slice(0,70)}`);
  });

  return { success: true, costs, log: log.join('\n'), item };
}

// ── Monte Carlo ──────────────────────────────────────────────────────
function runMonteCarlo(trials) {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   POE2 BOOT CRAFT SIMULATOR (Monte Carlo)       ║`);
  console.log(`║   ${trials.toLocaleString()} trials                         ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  let totalDiv = 0;
  let successes = 0;
  let attempts = 0;
  const costs = [];

  for (let i = 0; i < trials; i++) {
    const result = simulateBootCraft();
    attempts++;
    if (result.success) {
      successes++;
      totalDiv += result.costs.div;
      costs.push(result.costs.div);
    }
  }

  if (costs.length > 0) costs.sort((a, b) => a - b);
  const avg = successes > 0 ? totalDiv / successes : 0;
  const median = costs.length > 0 ? costs[Math.floor(costs.length / 2)] : 0;
  const p10 = costs.length > 0 ? costs[Math.floor(costs.length * 0.1)] : 0;
  const p90 = costs.length > 0 ? costs[Math.floor(costs.length * 0.9)] : 0;
  const rate = trials > 0 ? (successes / trials * 100) : 0;

  console.log(`╔══════════════════════════════════════════════╗`);
  console.log(`║              RESULTS                          ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  Success rate:    ${(rate).toFixed(1).padStart(6)}%  (${successes}/${trials})   ║`);
  console.log(`║  Average cost:    ${avg.toFixed(1).padStart(6)} div             ║`);
  console.log(`║  Median cost:     ${median.toFixed(1).padStart(6)} div             ║`);
  console.log(`║  10th percentile: ${p10.toFixed(1).padStart(6)} div             ║`);
  console.log(`║  90th percentile: ${p90.toFixed(1).padStart(6)} div             ║`);
  console.log(`║  Total attempts:  ${attempts}                  ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  return { avg, median, p10, p90, successRate: rate, successes, failures: trials - successes };
}

// ── Run ──────────────────────────────────────────────────────────────
const trials = parseInt(process.argv[2] || '100');

// Print one example first
console.log(`\n── Example craft attempt ──`);
const example = simulateBootCraft();
console.log(example.log);

console.log(`\n────────────────────────────────────────────────`);
console.log(`Running ${trials} Monte Carlo trials...`);
console.log(`────────────────────────────────────────────────\n`);

const results = runMonteCarlo(trials);
