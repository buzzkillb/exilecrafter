// scripts/_e2e_orbs.mts
// E2E tests for newly-wired orb functions in emulator.ts.
// Uses tsx to load the .ts emulator directly.

import {
  ancientOrb, mirrorOfKalandra, fracturingOrb, preservedCranium, essenceOrb,
  emptyItem, getCurrencyAvailability,
} from '../src/lib/emulator.ts';
import { bases, mods, currency, omens } from '../src/lib/data.ts';

const helmet = bases.find((b: any) => b.slot === 'helmet' && b.level >= 70);
if (!helmet) throw new Error('No test base');
const jewel = bases.find((b: any) => b.slot === 'jewel');

function makeRare(b: any = helmet) {
  const item = emptyItem(b, b.level);
  const pool = mods.filter((m: any) => m.domain.includes(b.slot)).slice(0, 4);
  item.affixes = pool.map((m: any, i: number) => ({
    modId: m.id,
    type: m.type === 'suffix' ? 'suffix' : 'prefix',
    tier: m.tier,
    name: m.name,
    tags: m.tags,
  }));
  item.rarity = 'rare';
  return item;
}

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// ancient_orb
{
  const item = makeRare();
  const ctx: any = { base: helmet, mods, currency, omens, weights: [], item, activeOmens: [] };
  const r = ancientOrb(ctx);
  ok('ancientOrb: succeeds on rare', r.ok);
  ok('ancientOrb: keeps rarity=rare', r.item.rarity === 'rare');
  ok('ancientOrb: history has Ancient Orb', r.item.history.some((h: any) => h.action === 'Ancient Orb'));
}
{
  const item = emptyItem(helmet, helmet.level);
  const ctx: any = { base: helmet, mods, currency, omens, weights: [], item, activeOmens: [] };
  const r = ancientOrb(ctx);
  ok('ancientOrb: rejects normal', !r.ok && /Rare/.test(r.message));
}

// mirror_of_kalandra
{
  const item = makeRare();
  const ctx: any = { base: helmet, mods, currency, omens, weights: [], item, activeOmens: [] };
  const r = mirrorOfKalandra(ctx);
  ok('mirrorOfKalandra: succeeds on rare', r.ok);
}
{
  const item = emptyItem(helmet, helmet.level);
  const ctx: any = { base: helmet, mods, currency, omens, weights: [], item, activeOmens: [] };
  const r = mirrorOfKalandra(ctx);
  ok('mirrorOfKalandra: rejects normal', !r.ok);
}

// fracturing_orb
{
  const item = makeRare();
  const ctx: any = { base: helmet, mods, currency, omens, weights: [], item, activeOmens: [] };
  const r = fracturingOrb(ctx);
  ok('fracturingOrb: succeeds with 4 mods', r.ok);
  ok('fracturingOrb: marks 1 mod as fractured', r.item.fractured.length === 1);
}
{
  const item = makeRare();
  item.affixes = item.affixes.slice(0, 2);
  const ctx: any = { base: helmet, mods, currency, omens, weights: [], item, activeOmens: [] };
  const r = fracturingOrb(ctx);
  ok('fracturingOrb: rejects with <4 mods', !r.ok && /4/.test(r.message));
}

// preserved_cranium
if (jewel) {
  const item = emptyItem(jewel, jewel.level);
  item.rarity = 'rare';
  item.affixes = [{ modId: 'x', type: 'suffix', tier: 1, name: 'X', tags: [] }];
  const ctx: any = { base: jewel, mods, currency, omens, weights: [], item, activeOmens: [] };
  const r = preservedCranium(ctx);
  ok('preservedCranium: succeeds on rare jewel', r.ok);
  ok('preservedCranium: marks item as desecrated', r.item.desecrated === true);
}
{
  const item = makeRare();
  const ctx: any = { base: helmet, mods, currency, omens, weights: [], item, activeOmens: [] };
  const r = preservedCranium(ctx);
  ok('preservedCranium: rejects non-jewel', !r.ok && /Jewel/.test(r.message));
}

// essenceOrb on magic item
{
  const essence = currency.find((c: any) => c.category === 'essence');
  if (essence) {
    // With no guaranteedMod (data limitation), essence should reject magic items
    const item = emptyItem(helmet, helmet.level);
    item.rarity = 'magic';
    item.affixes = [{ modId: 'pre', type: 'prefix', tier: 1, name: 'Pre', tags: [] }];
    const ctx: any = { base: helmet, mods, currency, omens, weights: [], item, activeOmens: [], essenceId: essence.id };
    const r = essenceOrb(ctx);
    // Either succeeds (if guaranteedMod present) or rejects with helpful message
    if (r.ok) {
      ok('essenceOrb: upgrades magic to rare', r.item.rarity === 'rare');
      ok('essenceOrb: adds a guaranteed mod', r.item.affixes.length === 2);
    } else {
      ok('essenceOrb: rejects gracefully when guaranteedMod missing (data limit)', /guaranteed/i.test(r.message));
    }
  } else {
    console.log('  - essenceOrb: skipped (no essences)');
  }
}

// getCurrencyAvailability for the new entries
{
  const item = makeRare();
  const avail = getCurrencyAvailability(item);
  ok('avail.ancient_orb.valid on rare', avail.ancient_orb?.valid === true);
  ok('avail.fracturing_orb.valid on rare >=4', avail.fracturing_orb?.valid === true);
  ok('avail.mirror_of_kalandra.valid on rare', avail.mirror_of_kalandra?.valid === true);
  ok('avail.essence.valid on rare', avail.essence?.valid === true);
}
{
  const item = emptyItem(helmet, helmet.level);
  const avail = getCurrencyAvailability(item);
  ok('avail.ancient_orb.invalid on normal', avail.ancient_orb?.valid === false);
  ok('avail.mirror_of_kalandra.invalid on normal', avail.mirror_of_kalandra?.valid === false);
}

console.log('\n' + pass + '/' + (pass + fail) + ' orb tests passed');
process.exit(fail > 0 ? 1 : 0);
