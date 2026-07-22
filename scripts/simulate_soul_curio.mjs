import { applyOperation, emptyItem, getCurrencyAvailability } from '../src/lib/emulator.ts';
import { bases, currency as currencyList, omens as omenList, mods } from '../src/lib/data.ts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load prices from build-time JSON
let prices = {};
let chaosPerExalt = 40;
let chaosPerDivine = 270;
try {
  const pricesPath = path.join(__dirname, '..', 'public', 'data', 'prices.json');
  if (fs.existsSync(pricesPath)) {
    const raw = JSON.parse(fs.readFileSync(pricesPath, 'utf-8'));
    prices = raw.prices || raw;
    if (raw.divineToChaos) chaosPerDivine = raw.divineToChaos;
    if (raw.exaltToChaos) chaosPerExalt = raw.exaltToChaos;
    console.log(`Loaded prices for ${Object.keys(prices).length} items`);
    console.log(`1 Ex = ${chaosPerExalt}c | 1 Div = ${chaosPerDivine}c`);
  } else {
    console.log('No prices file found, using defaults');
  }
} catch(e) {
  console.log('Price load failed:', e.message);
}

function getPrice(currencyId) {
  // Direct match
  if (prices[currencyId]) return prices[currencyId];
  // Try partial match
  for (const [key, val] of Object.entries(prices)) {
    if (currencyId.includes(key) || key.includes(currencyId)) return val;
  }
  return 1; // default 1 chaos
}

// Find the base
const sapphire = bases.find(b => b.name === 'Time-Lost Sapphire') || bases.find(b => b.name === 'Sapphire');
if (!sapphire) {
  console.error('Sapphire base not found!');
  process.exit(1);
}

console.log(`Base: ${sapphire.name} (${sapphire.slot}) | AffixSlots: ${JSON.stringify(sapphire.affixSlots)}`);

// Create the item at ilvl 83
let item = emptyItem(sapphire, 83);

const baseRecord = sapphire;

let totalChaos = 0;
const costSteps = [];

function makeCtx(currentItem, activeOmens = [], activeCurrencyId = null) {
  const cur = activeCurrencyId ? currencyList.find(c => c.id === activeCurrencyId) : null;
  return {
    base: baseRecord,
    mods,
    currency: currencyList,
    omens: omenList,
    weights: [],
    item: currentItem,
    activeOmens: activeOmens.map(id => {
      const o = omenList.find(x => x.id === id);
      return { id, effect: { kind: 'force_type', value: 'prefix' } };
    }),
    minModLevel: typeof cur?.minModifierLevel === 'number' ? cur.minModifierLevel : 0,
    activeCurrencyId: activeCurrencyId || '',
  };
}

function step(opId, currencyId, label, omens = []) {
  const ctx = makeCtx(item, omens, currencyId);
  const result = applyOperation(opId, ctx);
  item = result.item;
  const ok = result.ok ? '✓' : '✗';
  
  // Calculate cost
  const price = getPrice(currencyId);
  totalChaos += price;
  costSteps.push({ label, currencyId, price });
  
  console.log(`[${label}] ${ok} cost=${price.toFixed(2)}c ${result.message || ''}`);
  if (item?.affixes?.length) {
    const prefixCount = item.affixes.filter(a => a.type === 'prefix').length;
    const suffixCount = item.affixes.filter(a => a.type === 'suffix').length;
    console.log(`         ${prefixCount}P / ${suffixCount}S | ${item.rarity}`);
  }
  
  return result;
}

console.log('\n========================================');
console.log('SOUL CURIO CRAFT SIMULATION');
console.log('========================================\n');
console.log(`Start: ${sapphire.name}, ilvl 83, Normal`);

// Step 1: Transmutation → Magic (1P + 1S)
step('orb_of_transmutation', 'orb_of_transmutation', 'Transmutation');

// Step 2: Augmentation → fills to 2 affixes
step('orb_of_augmentation', 'orb_of_augmentation', 'Augmentation');

// Step 3: Regal → Rare (3 affixes)
step('regal_orb', 'regal_orb', 'Regal');

// Step 4: Exalted → 4 affixes
step('exalted_orb', 'exalted_orb', 'Exalted #1');

// Step 5-6: Chaos spam
step('chaos_orb', 'chaos_orb', 'Chaos #1');
step('chaos_orb', 'chaos_orb', 'Chaos #2');

// Step 7-9: Exalted to fill remaining slots
step('exalted_orb', 'exalted_orb', 'Exalted #2');
step('exalted_orb', 'exalted_orb', 'Exalted #3');
step('exalted_orb', 'exalted_orb', 'Exalted #4');

// Step 10: Vaal → Corrupt
step('vaal_orb', 'vaal_orb', 'Vaal/Corruption');

console.log('\n========================================');
console.log('FINAL ITEM STATE');
console.log('========================================');
console.log(`Name:      Soul Curio · ${sapphire.name}`);
console.log(`Rarity:    ${item.rarity}`);
console.log(`ilvl:      ${item.itemLevel}`);
console.log(`Corrupted: ${item.corrupted}`);
console.log(`Slot:      ${item.slot}`);
if (item.affixes) {
  const prefixes = item.affixes.filter(a => a.type === 'prefix');
  const suffixes = item.affixes.filter(a => a.type === 'suffix');
  console.log(`\nAffixes (${prefixes.length}P / ${suffixes.length}S):`);
  if (prefixes.length) {
    console.log(`  Prefixes:`);
    prefixes.forEach(a => console.log(`    T${a.tier}: ${a.name}`));
  }
  if (suffixes.length) {
    console.log(`  Suffixes:`);
    suffixes.forEach(a => console.log(`    T${a.tier}: ${a.name}`));
  }
}

console.log('\n========================================');
console.log('CRAFT COST BREAKDOWN');
console.log('========================================');
costSteps.forEach(s => {
  const pct = ((s.price / totalChaos) * 100).toFixed(1);
  console.log(`  ${s.label.padEnd(18)} ${s.price.toFixed(2).padStart(8)}c (${pct.padStart(4)}%)`);
});
console.log('  ' + '-'.repeat(38));
console.log(`  ${'Total'.padEnd(18)} ${totalChaos.toFixed(2).padStart(8)}c`);
console.log(`\n  ${totalChaos.toFixed(2)} Chaos`);
console.log(`  ${(totalChaos / chaosPerExalt).toFixed(2)} Exalted (1Ex = ${chaosPerExalt}c)`);
console.log(`  ${(totalChaos / chaosPerDivine).toFixed(2)} Divine (1Div = ${chaosPerDivine}c)`);
