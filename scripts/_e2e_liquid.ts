/**
 * Regression test for Liquid Emotion mechanics.
 *
 * Verifies:
 *   1. Contempt adds the correct mod variant based on slot capacity.
 *   2. Ferocity adds the correct mod variant based on slot capacity.
 *   3. Liquid removes a random existing mod before adding.
 *   4. Bonus slots propagate correctly.
 *   5. Re-application of same liquid type is blocked.
 *   6. Non-jewel bases are rejected.
 */

import { readFileSync } from 'fs';
import { emptyItem, orbOfTransmutation, orbOfAugmentation, regalOrb, liquidEmotion } from '../src/lib/emulator';

const bases = JSON.parse(readFileSync('./data/processed/bases.json', 'utf8'));
const mods = JSON.parse(readFileSync('./data/processed/mods.json', 'utf8'));
const currency = JSON.parse(readFileSync('./data/processed/currency.json', 'utf8'));
const omens = [] as any[];
let weights: any[] = [];
try {
  weights = JSON.parse(readFileSync('./data/processed/weights.json', 'utf8'));
} catch { weights = []; }

const diamond = bases.find((b: any) => b.slot === 'jewel' && b.name === 'Diamond');
if (!diamond) { console.error('FATAL: Diamond base not found'); process.exit(1); }

const ctx = (item: any, activeCurrencyId?: string) => ({
  base: diamond,
  mods,
  currency,
  omens,
  weights,
  item,
  activeOmens: [],
  activeCurrencyId,
});

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; } else { console.error(`  FAIL: ${msg}`); fail++; }
}

// ─── Test 1: Contempt on Diamond ───
{
  let item = emptyItem(diamond, 65);
  item = orbOfTransmutation(ctx(item)).item;
  item = orbOfAugmentation(ctx(item)).item;
  item = regalOrb(ctx(item)).item;

  const result = liquidEmotion(ctx(item, 'potent_liquid_contempt'));
  assert(result.ok, 'Contempt should succeed on rare Diamond');
  assert(result.rolledAffixes && result.rolledAffixes.length === 1, 'Should have rolled 1 new affix');

  const rolled = result.rolledAffixes[0];
  assert(rolled.type === 'prefix' || rolled.type === 'suffix', 'Rolled mod should be prefix or suffix');

  if (rolled.type === 'prefix') {
    assert(rolled.modId.includes('suffixmodifierallowed'), 'Prefix Contempt → +1 Suffix allowed');
  } else {
    assert(rolled.modId.includes('prefixmodifierallowed'), 'Suffix Contempt → +1 Prefix allowed');
  }

  const resultItem = result.item;
  if (rolled.type === 'prefix') {
    assert(resultItem.bonusSuffixSlots >= 1, 'Prefix-rolled → suffix slot gained');
  } else {
    assert(resultItem.bonusPrefixSlots >= 1, 'Suffix-rolled → prefix slot gained');
  }

  const dupResult = liquidEmotion(ctx(resultItem, 'potent_liquid_contempt'));
  assert(!dupResult.ok, 'Duplicate Contempt rejected');
  assert(dupResult.message.includes('already been applied'), 'Message: already applied');
}

// ─── Test 2: Ferocity on Diamond ───
{
  let item = emptyItem(diamond, 65);
  item = orbOfTransmutation(ctx(item)).item;
  item = orbOfAugmentation(ctx(item)).item;
  item = regalOrb(ctx(item)).item;

  const result = liquidEmotion(ctx(item, 'potent_liquid_ferocity'));
  assert(result.ok, 'Ferocity should succeed on rare Diamond');
  const rolled = result.rolledAffixes[0];
  assert(rolled.type === 'prefix' || rolled.type === 'suffix', 'Rolled mod should be prefix or suffix');
  if (rolled.type === 'prefix') {
    assert(rolled.modId.includes('effectofsuffixes'), 'Prefix Ferocity → Effect of Suffixes');
  } else {
    assert(rolled.modId.includes('effectofprefixes'), 'Suffix Ferocity → Effect of Prefixes');
  }
}

// ─── Test 3: Reject non-jewel ───
{
  const helm = bases.find((b: any) => b.slot === 'helmet');
  if (helm) {
    const helmItem = { ...emptyItem(helm, 65), rarity: 'rare' as const };
    const result = liquidEmotion({ ...ctx(helmItem, 'potent_liquid_contempt'), base: helm });
    assert(!result.ok, 'Non-jewel should be rejected');
    assert(result.message.includes('only work on Jewels'), 'Message: jewels only');
  }
}

// ─── Test 4: Reject non-rare ───
{
  const normalItem = emptyItem(diamond, 65);
  const result = liquidEmotion(ctx(normalItem, 'potent_liquid_contempt'));
  assert(!result.ok, 'Normal item should be rejected');
  assert(result.message.includes('requires a Rare'), 'Message: rare only');
}

// ─── Test 5: Random mod removal ───
{
  let item = emptyItem(diamond, 80);
  item = orbOfTransmutation(ctx(item)).item;
  item = orbOfAugmentation(ctx(item)).item;
  item = regalOrb(ctx(item)).item;

  const result = liquidEmotion(ctx(item, 'potent_liquid_contempt'));
  assert(result.ok, 'Liquid should succeed');
  const hasRemoveInHistory = result.item.history.some((h: any) => h.detail && h.detail.includes('Removed'));
  assert(hasRemoveInHistory, 'Liquid should remove a mod before adding');
}

console.log(`\nLiquid Emotion E2E: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
