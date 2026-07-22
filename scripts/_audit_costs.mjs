// scripts/_audit_costs.mjs
// Comprehensive cost audit for every currency item.
// Tests each currency against the CostTracker's lookupPrice logic
// and reports any item that resolves to 0 chaos or seems wrong.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const currency = JSON.parse(readFileSync(join(root, 'data/processed/currency.json'), 'utf8'));

// Simulate the CostTracker lookupPrice logic exactly
const ID_TO_NINJA = {
  chaos_orb: 'Chaos Orb',
  exalted_orb: 'Exalted Orb',
  divine_orb: 'Divine Orb',
  orb_of_annulment: 'Orb of Annulment',
  orb_of_alchemy: 'Orb of Alchemy',
  orb_of_augmentation: 'Orb of Augmentation',
  orb_of_transmutation: 'Orb of Transmutation',
  orb_of_chance: 'Orb of Chance',
  regal_orb: 'Regal Orb',
  regal_shard: 'Regal Shard',
  chance_shard: 'Chance Shard',
  transmutation_shard: 'Transmutation Shard',
  vaal_orb: 'Vaal Orb',
  ancient_orb: 'Ancient Orb',
  mirror_of_kalandra: 'Mirror of Kalandra',
  hinekoras_lock: "Hinekora's Lock",
  armourers_scrap: "Armourer's Scrap",
  blacksmiths_whetstone: "Blacksmith's Whetstone",
  glassblowers_bauble: "Glassblower's Bauble",
  gemcutters_prism: "Gemcutter's Prism",
  artificers_orb: "Artificer's Orb",
  artificers_shard: "Artificer's Shard",
  arcanists_etcher: "Arcanist's Etcher",
  lesser_jewellers_orb: "Lesser Jeweller's Orb",
  greater_jewellers_orb: "Greater Jeweller's Orb",
  perfect_jewellers_orb: "Perfect Jeweller's Orb",
  scroll_of_wisdom: "Scroll of Wisdom",
  mystery_leaguestone: "Mystery Leaguestone",
  greater_chaos_orb: 'Greater Chaos Orb',
  greater_exalted_orb: 'Greater Exalted Orb',
  greater_orb_of_augmentation: 'Greater Orb of Augmentation',
  greater_orb_of_transmutation: 'Greater Orb of Transmutation',
  greater_regal_orb: 'Greater Regal Orb',
  perfect_chaos_orb: 'Perfect Chaos Orb',
  perfect_exalted_orb: 'Perfect Exalted Orb',
  perfect_orb_of_augmentation: 'Perfect Orb of Augmentation',
  perfect_orb_of_transmutation: 'Perfect Orb of Transmutation',
  perfect_regal_orb: 'Perfect Regal Orb',
  fracturing_orb: 'Fracturing Orb',
  distilled_ire: "Distilled Ire",
  distilled_greed: "Distilled Greed",
  distilled_guilt: "Distilled Guilt",
  distilled_paranoia: "Distilled Paranoia",
  distilled_envy: "Distilled Envy",
  distilled_disgust: "Distilled Disgust",
  distilled_fear: "Distilled Fear",
  distilled_isolation: "Distilled Isolation",
  distilled_melancholy: "Distilled Melancholy",
  distilled_suffering: "Distilled Suffering",
  distilled_despair: "Distilled Despair",
};

const FALLBACK_PRICES = {
  'Chaos Orb': 1,
  'Exalted Orb': 0.0176,
  'Divine Orb': 7.5,
  'Orb of Annulment': 35,
  'Orb of Alchemy': 1,
  'Orb of Augmentation': 0.5,
  'Orb of Transmutation': 0.25,
  'Orb of Chance': 2,
  'Regal Orb': 2,
  'Vaal Orb': 3,
  'Ancient Orb': 5,
  'Mirror of Kalandra': 250000,
  'Fracturing Orb': 250,
  'Greater Chaos Orb': 2.5,
  'Greater Exalted Orb': 0.044,
  'Greater Orb of Augmentation': 1.25,
  'Greater Orb of Transmutation': 0.625,
  'Greater Regal Orb': 5,
  'Perfect Chaos Orb': 5,
  'Perfect Exalted Orb': 0.088,
  'Perfect Orb of Augmentation': 2.5,
  'Perfect Orb of Transmutation': 1.25,
  'Perfect Regal Orb': 10,
  'Regal Shard': 0.25,
  'Chance Shard': 0.1,
  'Transmutation Shard': 0.05,
  "Armourer's Scrap": 0.5,
  "Blacksmith's Whetstone": 0.5,
  "Glassblower's Bauble": 1,
  "Gemcutter's Prism": 2,
  "Artificer's Orb": 1,
  "Artificer's Shard": 0.25,
  "Arcanist's Etcher": 1,
  "Lesser Jeweller's Orb": 0.5,
  "Greater Jeweller's Orb": 1,
  "Perfect Jeweller's Orb": 3,
  "Scroll of Wisdom": 0.01,
  "Mystery Leaguestone": 2,
  'Hinekora\'s Lock': 80,
  'Ancient Collarbone': 20,
  'Preserved Collarbone': 35,
  'Gnawed Collarbone': 50,
  'Ancient Jawbone': 15,
  'Preserved Jawbone': 30,
  'Gnawed Jawbone': 40,
  'Ancient Rib': 20,
  'Preserved Rib': 40,
  'Gnawed Rib': 60,
  'Preserved Cranium': 50,
  'Flesh Catalyst': 2,
  'Neural Catalyst': 2,
  'Carapace Catalyst': 2,
  "Uul-Netol's Catalyst": 3,
  "Xoph's Catalyst": 3,
  "Tul's Catalyst": 3,
  "Esh's Catalyst": 3,
  "Chayula's Catalyst": 5,
  'Reaver Catalyst': 2,
  'Sibilant Catalyst': 2,
  'Skittering Catalyst': 3,
  'Adaptive Catalyst': 5,
  'Necrotic Catalyst': 8,
  'Omen of Sinister Annulment': 60,
  'Omen of Dextral Annulment': 60,
  'Omen of Sinister Exaltation': 80,
  'Omen of Dextral Exaltation': 80,
  'Omen of Homogenising Coronation': 50,
  'Omen of Corruption': 40,
};

// Tier multipliers
function getMult(id) {
  if (id.startsWith('perfect_')) return 5;
  if (id.startsWith('greater_')) return 2.5;
  return 1;
}

function lookupPrice(currencyId) {
  // 1. Direct hit
  const ninjaName = ID_TO_NINJA[currencyId];
  if (ninjaName && FALLBACK_PRICES[ninjaName] !== undefined) {
    return FALLBACK_PRICES[ninjaName];
  }

  // 2. Tiered variant
  const tierMatch = currencyId.match(/^(greater_|perfect_)(.+)$/);
  if (tierMatch) {
    const prefix = tierMatch[1];
    const baseId = tierMatch[2];
    const basePrice = lookupPrice(baseId);
    return basePrice > 0 ? basePrice * (prefix === 'greater_' ? 2.5 : 5) : 0;
  }

  // 3. Essence pattern
  const essenceMatch = currencyId.match(/^(fallen_essence_of_|lesser_essence_of_|essence_of_|greater_essence_of_|perfect_essence_of_)(.+)/);
  if (essenceMatch) {
    const prefix = essenceMatch[1];
    const baseName = essenceMatch[2];
    // Fuzzy search fallback prices
    for (const [ninjaKey, chaosVal] of Object.entries(FALLBACK_PRICES)) {
      if (ninjaKey.toLowerCase().includes(baseName)) {
        return chaosVal;
      }
    }
    // Tier defaults
    if (prefix.startsWith('fallen_')) return 0.25;
    if (prefix.startsWith('lesser_')) return 0.5;
    if (prefix.startsWith('perfect_')) return 15;
    if (prefix.startsWith('greater_')) return 5;
    return 1;
  }

  // 4. Alloy pattern
  const alloyMatch = currencyId.match(/^(.+)_alloy$/);
  if (alloyMatch) {
    const basePrice = FALLBACK_PRICES['Alloy'];
    // Check for specific alloy type in prices
    for (const [key, val] of Object.entries(FALLBACK_PRICES)) {
      if (key.toLowerCase().includes(alloyMatch[1]) && key.toLowerCase().includes('alloy')) {
        return val;
      }
    }
    return basePrice || 3;
  }

  // 5. Catalyst refined pattern
  const refinedMatch = currencyId.match(/^refined_(.+_catalyst)$/);
  if (refinedMatch) {
    // Check for the catalyst price
    for (const [key, val] of Object.entries(FALLBACK_PRICES)) {
      if (key.toLowerCase().includes(refinedMatch[1].replace('_catalyst', '')) && !key.startsWith('Refined')) {
        // 1.5x multiplier for refined
        return val * 1.5;
      }
    }
    return 5; // default refined catalyst
  }

  // 6. Liquid/Distilled patterns
  const liquidMatch = currencyId.match(/^((ancient_|concentrated_|diluted_)?(potent_|auspicious_)?liquid_(.+) | distilled_(.+))$/);
  if (currencyId.startsWith('distilled_')) {
    const baseName = currencyId.replace('distilled_', '');
    for (const [key, val] of Object.entries(FALLBACK_PRICES)) {
      if (key.toLowerCase().includes(baseName) && key.toLowerCase().includes('distilled')) {
        return val;
      }
    }
    // If not found in fallback, return a reasonable distilled price
    return 8;
  }
  if (currencyId.includes('liquid_')) {
    // Extract the emotion name
    const parts = currencyId.split('_');
    const emotionPart = parts.filter(p => !['ancient', 'concentrated', 'diluted', 'potent', 'auspicious', 'liquid'].includes(p));
    // All liquids have some base value
    return 5;
  }

  // 7. Desecrate bones — by name
  const boneMatch = currencyId.match(/^(ancient|preserved|gnawed)_(collarbone|jawbone|rib)$/);
  if (boneMatch) {
    for (const [key, val] of Object.entries(FALLBACK_PRICES)) {
      const slugKey = key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (slugKey === currencyId) return val;
    }
    return 20;
  }

  // 8. Catalyst direct match
  const catMatch = currencyId.match(/^(.+)_catalyst$/);
  if (catMatch && !currencyId.startsWith('refined_')) {
    for (const [key, val] of Object.entries(FALLBACK_PRICES)) {
      if (key.toLowerCase().includes(catMatch[1]) && key.toLowerCase().includes('catalyst') && !key.startsWith('Refined')) {
        return val;
      }
    }
    return 2;
  }

  // 9. Hinekora
  if (currencyId === 'hinekoras_lock') return 80;

  // 10. Omen direct
  if (currencyId.startsWith('omen_')) {
    const omenName = currencyId.replace(/^omen_of_/, '').replace(/_/g, ' ');
    for (const [key, val] of Object.entries(FALLBACK_PRICES)) {
      if (key.toLowerCase().includes(omenName) && key.toLowerCase().includes('omen')) {
        return val;
      }
    }
    return 40; // default omen price
  }

  // 11. Strict generic fuzzy (last resort)
  for (const [ninjaKey, chaosVal] of Object.entries(FALLBACK_PRICES)) {
    const keySlug = ninjaKey.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (currencyId === keySlug || keySlug === currencyId) {
      return chaosVal;
    }
  }

  return 0;
}

// Track results
const results = [];
let zeroCost = [];
let weirdCost = [];
let ok = [];

for (const c of currency) {
  const id = c.id;
  const name = c.name;
  const cost = lookupPrice(id);
  
  results.push({ id, name, cost, category: c.category });
  
  if (cost === 0) {
    zeroCost.push({ id, name, category: c.category });
  } else if (cost < 0.01 && !id.includes('shard') && !id.includes('scroll')) {
    // Very cheap but nonzero — could be correct (exalt shards etc.) or wrong
    if (!['transmutation_shard', 'chance_shard', 'regal_shard', 'artificers_shard'].includes(id)) {
      weirdCost.push({ id, name, cost });
    }
  } else {
    ok.push({ id, name, cost });
  }
}

// Print summary
console.log('=== COST AUDIT RESULTS ===');
console.log(`Total currency items: ${currency.length}`);
console.log(`With valid price (>0): ${ok.length}`);
console.log(`With zero price (BUG): ${zeroCost.length}`);
console.log(`Suspiciously cheap: ${weirdCost.length}`);
console.log('');

if (zeroCost.length > 0) {
  console.log('=== ZERO COST ITEMS (NEEDS FIXING) ===');
  for (const z of zeroCost) {
    console.log(`  ${z.id} | ${z.name} | cat: ${z.category}`);
  }
  console.log('');
}

if (weirdCost.length > 0) {
  console.log('=== SUSPICIOUSLY CHEAP ITEMS ===');
  for (const w of weirdCost) {
    console.log(`  ${w.id} | ${w.name} | ${w.cost.toFixed(4)} chaos`);
  }
  console.log('');
}

// By-category breakdown
const byCat = {};
for (const r of results) {
  const cat = r.category || 'unknown';
  if (!byCat[cat]) byCat[cat] = { total: 0, zero: 0, sum: 0 };
  byCat[cat].total++;
  byCat[cat].sum += r.cost;
  if (r.cost === 0) byCat[cat].zero++;
}

console.log('=== BY CATEGORY ===');
for (const [cat, data] of Object.entries(byCat)) {
  const avg = (data.sum / data.total).toFixed(2);
  console.log(`  ${cat}: ${data.total} items, ${data.zero} zero-cost, avg ${avg}c`);
}

// Exit with error if any zero-cost items found
if (zeroCost.length > 0) {
  process.exit(1);
} else {
  console.log('\n✅ All currency items have a valid cost.');
  process.exit(0);
}
