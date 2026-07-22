/**
 * Run the full 5-mod jewel crafting simulation end-to-end,
 * showing each step and final item state.
 */
import { readFileSync } from 'fs';
import { emptyItem, orbOfTransmutation, orbOfAugmentation, regalOrb, orbOfAlchemy, exaltedOrb, fracturingOrb, preservedCranium, liquidEmotion, type ItemState } from '../src/lib/emulator';

const bases = JSON.parse(readFileSync('./data/processed/bases.json', 'utf8'));
const mods = JSON.parse(readFileSync('./data/processed/mods.json', 'utf8'));
const currency = JSON.parse(readFileSync('./data/processed/currency.json', 'utf8'));
let weights: any[] = [];
try { weights = JSON.parse(readFileSync('./data/processed/weights.json', 'utf8')); } catch {}

const diamond = bases.find((b: any) => b.slot === 'jewel' && b.name === 'Diamond');
if (!diamond) { console.error('FATAL: Diamond not found'); process.exit(1); }

const ctx = (item: ItemState, activeCurrencyId?: string, minModLevel?: number) => ({
  base: diamond, mods, currency, omens: [], weights,
  item, activeOmens: [], activeCurrencyId, minModLevel,
});

function show(item: ItemState, label: string) {
  console.log(`\n── ${label} ──`);
  console.log(`  Type: ${item.rarity} | Slots: P=${item.affixes.filter(a => a.type==='prefix').length}/${diamond.affixSlots.prefix + item.bonusPrefixSlots}  S=${item.affixes.filter(a => a.type==='suffix').length}/${diamond.affixSlots.suffix + item.bonusSuffixSlots}`);
  item.affixes.forEach((a, i) => {
    console.log(`  ${i+1}. [${a.type === 'prefix' ? 'P' : 'S'}] T${a.tier} ${a.name}`);
  });
  console.log(`  Mods: ${item.affixes.length}/${diamond.affixSlots.prefix + item.bonusPrefixSlots + diamond.affixSlots.suffix + item.bonusSuffixSlots}`);
}

let item = emptyItem(diamond, 80);
show(item, 'Step 0: Start');

// Step 1: Transmutation → Magic
item = orbOfTransmutation(ctx(item)).item;
show(item, 'Step 1: Orb of Transmutation');

// Step 2: Augmentation → +1 mod
item = orbOfAugmentation(ctx(item)).item;
show(item, 'Step 2: Orb of Augmentation');

// Step 3: Regal → Rare (3 mods)
item = regalOrb(ctx(item)).item;
show(item, 'Step 3: Regal Orb');

// Step 4: Exalted ×3 to fill to 6 mods (3P/3S)
for (let i = 0; i < 3; i++) {
  item = exaltedOrb(ctx(item)).item;
}
show(item, 'Step 4: 3× Exalted Orb');

// Step 5: Potent Liquid Contempt → adds +1 suffix modifier allowed
// (removes a random mod, fills the slot)
const contemptResult = liquidEmotion(ctx(item, 'potent_liquid_contempt'));
item = contemptResult.item;
show(item, `Step 5: Potent Liquid Contempt — ${contemptResult.message}`);

// Step 6: Exalted into bonus suffix slot
item = exaltedOrb(ctx(item)).item;
show(item, 'Step 6: Exalted Orb (into bonus suffix slot)');

// Step 7: Fracturing Orb (needs ≥4 mods)
const fractureResult = fracturingOrb(ctx(item));
show(fractureResult.item || item, `Step 7: Fracturing Orb — ${fractureResult.message} (fractured: ${(fractureResult.item?.fractured||[]).length} mods)`);
if (fractureResult.ok) item = fractureResult.item;

// Step 8: Potent Liquid Ferocity → applies effect of suffixes/prefixes
const ferocityResult = liquidEmotion(ctx(item, 'potent_liquid_ferocity'));
item = ferocityResult.item;
show(item, `Step 8: Potent Liquid Ferocity — ${ferocityResult.message}`);

// Step 9: Preserved Cranium → desecrate with a faction mod
const craniumResult = preservedCranium(ctx(item));
if (craniumResult.ok) item = craniumResult.item;
show(item, `Step 9: Preserved Cranium — ${craniumResult.message}`);

console.log('\n══════════════════════════════════════');
console.log('FINAL ITEM STATE:');
console.log(`  Base: ${diamond.name}`);
console.log(`  Rarity: ${item.rarity}`);
console.log(`  Prefixes: ${item.affixes.filter(a => a.type === 'prefix').length}/${diamond.affixSlots.prefix + item.bonusPrefixSlots}`);
console.log(`  Suffixes: ${item.affixes.filter(a => a.type === 'suffix').length}/${diamond.affixSlots.suffix + item.bonusSuffixSlots}`);
console.log(`  Desecrated: ${item.desecrated ? 'Yes' : 'No'}`);
item.affixes.forEach((a, i) => {
  console.log(`  ${i+1}. [${a.type === 'prefix' ? 'PREFIX' : 'SUFFIX'}] T${a.tier} ${a.name}`);
});
console.log('══════════════════════════════════════\n');
