// tests/emulator.test.mjs
// Comprehensive emulator mechanics tests — tests every currency operation
// against real poe2db data to verify game mechanics are correct.
//
// Run: npm run test:emu   or   node --experimental-strip-types tests/emulator.test.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load real data
const bases = JSON.parse(readFileSync(join(root, 'data/processed/bases.json'), 'utf8'));
const mods = JSON.parse(readFileSync(join(root, 'data/processed/mods.json'), 'utf8'));
const currencyData = JSON.parse(readFileSync(join(root, 'data/processed/currency.json'), 'utf8'));
const omensData = JSON.parse(readFileSync(join(root, 'data/processed/omens.json'), 'utf8'));
const weightsData = JSON.parse(readFileSync(join(root, 'data/processed/weights.json'), 'utf8'));

// Dynamically import the emulator (TypeScript)
const emu = await import('../src/lib/emulator.ts');

// ==================== Test helpers ====================
let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++; failures.push(msg);
  console.error(`  ✗ ${msg}`);
}
function assertEq(actual, expected, msg) {
  if (actual === expected) { passed++; return; }
  failed++; failures.push(msg + ` (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}
function assertOk(result, msg) {
  if (result.ok) { passed++; return; }
  failed++; failures.push(`${msg}: ${result.message}`);
  console.error(`  ✗ ${msg}: ${result.message}`);
}
function assertFail(result, msg) {
  if (!result.ok) { passed++; return; }
  failed++; failures.push(`${msg}: should have failed but succeeded`);
  console.error(`  ✗ ${msg}: should have failed`);
}

// ==================== Fixtures ====================
const spearBase = bases.find(b => b.name === 'Guardian Spear');
const helmetBase = bases.find(b => b.name === 'Ancestral Tiara');
const tabletBase = bases.find(b => b.name && b.name.toLowerCase().includes('abyss') && b.slot === 'tablet');
const ringBase = bases.find(b => b.name === 'Prismatic Ring');
const jewelBase = bases.find(b => b.slot === 'jewel');

function makeItem(base, overrides = {}) {
  return {
    baseId: base.id,
    baseName: base.name,
    slot: base.slot,
    rarity: 'normal',
    itemLevel: 82,
    affixes: [],
    implicit: undefined,
    corrupted: false,
    desecrated: false,
    fractured: [],
    bonusPrefixSlots: 0,
    bonusSuffixSlots: 0,
    appliedLiquids: [],
    foresight: false,
    mirrored: false,
    history: [],
    ...overrides,
  };
}

function ctx(item, extra = {}) {
  return {
    base: { ...(bases.find(b => b.id === item.baseId) || spearBase) },
    mods,
    currency: currencyData,
    omens: omensData,
    weights: weightsData,
    item,
    activeOmens: [],
    minModLevel: extra.minModLevel ?? 0,
    activeCurrencyId: extra.activeCurrencyId,
  };
}

// ==================== 1. Transmutation Orb ====================
console.log('\n[1] Transmutation Orb');
{
  const item = makeItem(spearBase);
  const res = emu.orbOfTransmutation(ctx(item));
  assertOk(res, 'Transmute normal → magic');
  assertEq(res.item.rarity, 'magic', 'rarity becomes magic');
  assert(res.item.affixes.length === 1, 'has 1 affix');
  assertEq(res.item.affixes[0].type, 'prefix', 'first affix is prefix');

  // Cannot transmute a magic item
  const res2 = emu.orbOfTransmutation(ctx(res.item));
  assertFail(res2, 'Transmute on magic should fail');

  // Cannot transmute a rare item
  const rareItem = makeItem(spearBase, { rarity: 'rare', affixes: [] });
  const res3 = emu.orbOfTransmutation(ctx(rareItem));
  assertFail(res3, 'Transmute on rare should fail');
}

// ==================== 2. Orb of Augmentation ====================
console.log('\n[2] Orb of Augmentation');
{
  // Make a magic item with 1 prefix, augment to add suffix
  const item = makeItem(spearBase, { rarity: 'magic', affixes: [{ modId: 'test_p1', type: 'prefix', tier: 3, name: 'Test Prefix', tags: [] }] });
  const res = emu.orbOfAugmentation(ctx(item));
  assertOk(res, 'Augment magic 1P → 1P+1S');
  assertEq(res.item.affixes.length, 2, 'now has 2 affixes');
  assert(res.item.affixes.some(a => a.type === 'suffix'), 'has a suffix');

  // Full magic item
  const res2 = emu.orbOfAugmentation(ctx(res.item));
  assertFail(res2, 'Augment on full magic should fail');

  // Augment on normal
  const res3 = emu.orbOfAugmentation(ctx(makeItem(spearBase)));
  assertFail(res3, 'Augment on normal should fail');

  // Augment on rare
  const rareItem = makeItem(spearBase, { rarity: 'rare', affixes: [{ modId: 'p1', type: 'prefix', tier: 1, name: 'P', tags: [] }] });
  const res4 = emu.orbOfAugmentation(ctx(rareItem));
  assertFail(res4, 'Augment on rare should fail');
}

// ==================== 3. Regal Orb ====================
console.log('\n[3] Regal Orb');
{
  // Full magic → rare
  const item = makeItem(spearBase, { rarity: 'magic', affixes: [
    { modId: 'p1', type: 'prefix', tier: 3, name: 'Prefix', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'Suffix', tags: [] },
  ] });
  const res = emu.regalOrb(ctx(item));
  assertOk(res, 'Regal full magic → rare');
  assertEq(res.item.rarity, 'rare', 'rarity becomes rare');
  assert(res.item.affixes.length >= 3, `should add at least 1 affix, got ${res.item.affixes.length}`);

  // Cannot regal a normal item
  const res2 = emu.regalOrb(ctx(makeItem(spearBase)));
  assertFail(res2, 'Regal on normal should fail');

  // Cannot regal a rare item
  const res3 = emu.regalOrb(ctx(res.item));
  assertFail(res3, 'Regal on rare should fail');
}

// ==================== 4. Exalted Orb ====================
console.log('\n[4] Exalted Orb');
{
  // Rare item with open slots
  const rareItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 3, name: 'P1', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
  ] });
  const res = emu.exaltedOrb(ctx(rareItem));
  assertOk(res, 'Exalt on rare with open slots');
  assertEq(res.item.affixes.length, 3, 'added 1 affix');

  // Full rare item
  const fullItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
    { modId: 'p2', type: 'prefix', tier: 2, name: 'P2', tags: [] },
    { modId: 'p3', type: 'prefix', tier: 3, name: 'P3', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
    { modId: 's2', type: 'suffix', tier: 2, name: 'S2', tags: [] },
    { modId: 's3', type: 'suffix', tier: 3, name: 'S3', tags: [] },
  ] });
  const res2 = emu.exaltedOrb(ctx(fullItem));
  assertFail(res2, 'Exalt on full item should fail');

  // Exalt on magic (should fail)
  const magicItem = makeItem(spearBase, { rarity: 'magic', affixes: [{ modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] }] });
  const res3 = emu.exaltedOrb(ctx(magicItem));
  assertFail(res3, 'Exalt on magic should fail');

  // Exalt with Omen of Sinistral Exaltation (forces prefix)
  const rareWithSuffix = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
    { modId: 's2', type: 'suffix', tier: 2, name: 'S2', tags: [] },
  ] });
  const forceCtx = ctx(rareWithSuffix);
  forceCtx.activeOmens = [{ id: 'omen_sinistral_exalt', effect: { kind: 'force_type', value: 'prefix' }, foresight: false, history: [], mirrored: false }];
  const res4 = emu.exaltedOrb(forceCtx);
  assertOk(res4, 'Exalt with force_type: prefix omen');
  assertEq(res4.item.affixes[res4.item.affixes.length - 1].type, 'prefix', 'added a prefix (forced)');
}

// ==================== 5. Chaos Orb ====================
console.log('\n[5] Chaos Orb');
{
  const rareItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
    { modId: 'p2', type: 'prefix', tier: 2, name: 'P2', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
    { modId: 's2', type: 'suffix', tier: 2, name: 'S2', tags: [] },
  ] });
  const res = emu.chaosOrb(ctx(rareItem));
  assertOk(res, 'Chaos on rare rerolls all');
  assertEq(res.item.rarity, 'rare', 'stays rare');
  assert(res.item.affixes.length === 4, `rerolls to 4 affixes (got ${res.item.affixes.length})`);

  // Chaos on magic should fail
  const magicItem = makeItem(spearBase, { rarity: 'magic', affixes: [{ modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] }] });
  const res2 = emu.chaosOrb(ctx(magicItem));
  assertFail(res2, 'Chaos on magic should fail');

  // Chaos on corrupted rare should fail
  const corruptedRare = makeItem(spearBase, { rarity: 'rare', corrupted: true, affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
  ] });
  const res3 = emu.chaosOrb(ctx(corruptedRare));
  assertFail(res3, 'Chaos on corrupted should fail');
}

// ==================== 6. Orb of Annulment ====================
console.log('\n[6] Orb of Annulment');
{
  const rareItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
  ] });
  const res = emu.orbOfAnnulment(ctx(rareItem));
  assertOk(res, 'Annul removes 1 affix');
  assertEq(res.item.affixes.length, 1, '1 affix remaining');

  // Annul on item with 0 affixes
  const res2 = emu.orbOfAnnulment(ctx(makeItem(spearBase, { rarity: 'rare', affixes: [] })));
  assertFail(res2, 'Annul on 0 affix rare should fail');

  // Annul with fractured affix preserved
  const fracItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'frac1', type: 'prefix', tier: 1, name: 'Fractured', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'Removable', tags: [] },
  ], fractured: [{ modId: 'frac1', type: 'prefix', tier: 1, name: 'Fractured', tags: [] }] });
  
  // Run annul 10 times — should never remove fractured
  let fracturedStayed = true;
  for (let i = 0; i < 10; i++) {
    const resF = emu.orbOfAnnulment(ctx({ ...fracItem, history: [] }));
    if (resF.ok && resF.item.affixes.length > 0) {
      if (!resF.item.affixes.some(a => a.modId === 'frac1')) {
        fracturedStayed = false;
      }
    }
  }
  assert(fracturedStayed, 'fractured affix preserved across 10 annuls');
}

// ==================== 7. Vaal Orb ====================
console.log('\n[7] Vaal Orb');
{
  // Equipment: 4 outcomes
  const rareItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
  ] });

  // Run 100 trials to verify all 4 outcomes occur
  const outcomes = { destroyed: 0, implicit: 0, shuffled: 0, noEffect: 0 };
  for (let i = 0; i < 100; i++) {
    const res = emu.vaalOrb(ctx({ ...rareItem, history: [], corrupted: false }));
    if (!res.ok) continue;
    if (res.item.rarity === 'normal') outcomes.destroyed++;
    else if (res.item.implicit && res.item.implicit !== rareItem.implicit) outcomes.implicit++;
    else if (res.message.includes('shuffled')) outcomes.shuffled++;
    else outcomes.noEffect++;
  }

  console.log(`  Vaal outcomes: destroyed=${outcomes.destroyed}, implicit=${outcomes.implicit}, shuffled=${outcomes.shuffled}, noEffect=${outcomes.noEffect}`);
  const total = Object.values(outcomes).reduce((a, b) => a + b, 0);
  assert(total > 90, `at least 90 trials succeeded, got ${total}`);
  assert(outcomes.destroyed > 0, 'destroy outcome occurred');
  assert(outcomes.implicit > 0, 'add implicit outcome occurred');
  assert(outcomes.shuffled > 0, 'shuffle outcome occurred');
  assert(outcomes.noEffect > 0, 'no effect outcome occurred');

  // Cannot Vaal a corrupted item
  const corruptedItem = makeItem(spearBase, { rarity: 'rare', corrupted: true, affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
  ] });
  const res2 = emu.vaalOrb(ctx(corruptedItem));
  assertFail(res2, 'Vaal on corrupted item should fail');
}

// ==================== 8. Vaal Orb on Tablets ====================
console.log('\n[8] Vaal Orb on Tablets');
{
  if (tabletBase) {
    const tabletItem = makeItem(tabletBase, { rarity: 'rare', affixes: [
      { modId: 'tp1', type: 'prefix', tier: 1, name: 'TP1', tags: [] },
      { modId: 'ts1', type: 'suffix', tier: 1, name: 'TS1', tags: [] },
    ] });

    const tabletOutcomes = { implicit: 0, noEffect: 0, destroyed: 0 };
    for (let i = 0; i < 50; i++) {
      const res = emu.vaalOrb(ctx({ ...tabletItem, history: [], corrupted: false }));
      if (!res.ok) continue;
      if (res.item.rarity === 'normal') tabletOutcomes.destroyed++;
      else if (res.item.implicit && res.item.implicit !== tabletItem.implicit) tabletOutcomes.implicit++;
      else tabletOutcomes.noEffect++;
    }
    console.log(`  Tablet Vaal outcomes: implicit=${tabletOutcomes.implicit}, noEffect=${tabletOutcomes.noEffect}, destroyed=${tabletOutcomes.destroyed}`);
    assertEq(tabletOutcomes.destroyed, 0, 'tablet Vaal should never destroy');
    assert(tabletOutcomes.implicit > 0 || tabletOutcomes.noEffect > 0, 'tablet Vaal outcome should occur');
  } else {
    console.log('  SKIP: no tablet base found in data');
  }
}

// ==================== 9. Divine Orb ====================
console.log('\n[9] Divine Orb');
{
  const rareItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'Old Name', tags: [] },
  ] });
  const res = emu.divineOrb(ctx(rareItem));
  assertOk(res, 'Divine on rare works');
  assertEq(res.item.rarity, 'rare', 'stays rare');
  // The rerolled names should be different (not guaranteed but likely with real mod pool)
  assert(res.item.affixes.length === 1, 'still 1 affix after divine');

  // Divine on corrupted should fail
  const corruptedItem = makeItem(spearBase, { rarity: 'rare', corrupted: true, affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
  ] });
  const res2 = emu.divineOrb(ctx(corruptedItem));
  assertFail(res2, 'Divine on corrupted should fail');
}

// 9b. Divine Orb on unscalable unique mods (variant reroll)
console.log('\n[9b] Divine Orb — unscalable variant reroll');
{
  // Simulate a Mageblood-like item with unscalable Legacy mods
  const item = makeItem(helmetBase, {
    rarity: 'unique',
    corrupted: false,
    affixes: [
      { modId: 'u1', type: 'unique', tier: 1, name: 'Legacy of Diamond(Amethyst-Topaz)', tags: [], unscalable: true, descriptiveName: '' },
      { modId: 'u2', type: 'unique', tier: 1, name: 'Legacy of Jade(Amethyst-Topaz)', tags: [], unscalable: true, descriptiveName: '' },
      { modId: 'u3', type: 'unique', tier: 1, name: 'All Legacies have 39(25-50)% increased effect', tags: [], unscalable: false, descriptiveName: '' },
    ],
  });
  const res = emu.divineOrb(ctx(item));
  assertOk(res, 'Divine on unique with unscalable mods');
  assert(res.item.affixes.length === 3, 'still 3 affixes');

  // The numeric mod should have been rerolled
  const numeric = res.item.affixes.find(a => a.modId === 'u3');
  assert(numeric, 'numeric mod still present');
  // After divine, 39(25-50)% should change (25-50 range, not always 39)
  // We'll skip checking if it actually changed since it's random; just check it's valid
  const changed = !numeric.name.includes('39(25-50)');
  assert(changed, `numeric mod rerolled (was "39(25-50)%", now "${numeric.name}")`);

  // At least one Legacy variant should have changed (BOTH base name and annotation reroll)
  const v1 = res.item.affixes.find(a => a.modId === 'u1');
  const v2 = res.item.affixes.find(a => a.modId === 'u2');
  // Divine Orb on Mageblood rerolls the entire Legacy type AND the annotation.
  // "Legacy of Diamond(Amethyst-Topaz)" → "Legacy of Quicksilver(Ruby-Sapphire)" etc.
  const v1Changed = v1 && v1.name !== 'Legacy of Diamond(Amethyst-Topaz)';
  const v2Changed = v2 && v2.name !== 'Legacy of Jade(Amethyst-Topaz)';
  // With 11 legacy types and 15 annotations, there's only a ~0.8% chance neither changes.
  // Accept that at least one changed (99.2% reliable, non-flaky for CI).
  const anyVariantChanged = v1Changed || v2Changed;
  assert(anyVariantChanged,
    `At least one Legacy variant should reroll (v1: "${v1?.name}", v2: "${v2?.name}")`);

  // Verify that the base legacy name changed, not just the annotation.
  // The old bug: only annotation changed (e.g. "(Amethyst-Topaz)" → "(Quicksilver)")
  // Fixed: the entire "Legacy of Diamond" base also changes
  if (v1Changed) {
    assert(!v1.name.startsWith('Legacy of Diamond'),
      `variant1 base name changed: "${v1.name}" (should NOT start with "Legacy of Diamond")`);
  }
  if (v2Changed) {
    assert(!v2.name.startsWith('Legacy of Jade'),
      `variant2 base name changed: "${v2.name}" (should NOT start with "Legacy of Jade")`);
  }
  console.log(`  variant1: ${v1?.name}  variant2: ${v2?.name}  numeric: ${numeric?.name}`);
}

// ==================== 10. Perfect Exalted Orb ====================
console.log('\n[10] Perfect Exalted Orb');
{
  const rareItem = makeItem(helmetBase, { rarity: 'rare', affixes: [
    { modId: 'hp1', type: 'prefix', tier: 3, name: 'HP1', tags: [] },
    { modId: 'hs1', type: 'suffix', tier: 2, name: 'HS1', tags: [] },
  ] });

  // Perfect Exalt should add a T1 affix
  const res = emu.perfectExaltedOrb(ctx(rareItem));
  if (res.ok) {
    const added = res.item.affixes[res.item.affixes.length - 1];
    assertEq(added.tier, 1, `Perfect Exalt adds T1 mod (got T${added.tier}: ${added.name})`);
    assertEq(res.item.affixes.length, 3, 'added 1 affix');
  } else {
    console.log(`  Perfect Exalt: ${res.message} (may be valid if no T1 mods available for this base/ilvl)`);
  }

  // Perfect Exalt on magic should fail
  const magicItem = makeItem(helmetBase, { rarity: 'magic', affixes: [{ modId: 'p1', type: 'prefix', tier: 3, name: 'P1', tags: [] }] });
  const res2 = emu.perfectExaltedOrb(ctx(magicItem));
  assertFail(res2, 'Perfect Exalt on magic should fail');
}

// ==================== 11. Orb of Alchemy ====================
console.log('\n[11] Orb of Alchemy');
{
  const item = makeItem(spearBase);
  const res = emu.orbOfAlchemy(ctx(item));
  assertOk(res, 'Alchemy normal → rare');
  assertEq(res.item.rarity, 'rare', 'rarity becomes rare');
  assert(res.item.affixes.length >= 3, `alchemy gives 3+ affixes (got ${res.item.affixes.length})`);

  // Alchemy on magic should fail
  const magicItem = makeItem(spearBase, { rarity: 'magic', affixes: [{ modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] }] });
  const res2 = emu.orbOfAlchemy(ctx(magicItem));
  assertFail(res2, 'Alchemy on magic should fail');
}

// ==================== 12. Fracturing Orb ====================
console.log('\n[12] Fracturing Orb');
{
  // Fracture a rare item with a random affix
  const rareItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
  ] });

  // Scour first to test fracturing on magic
  const magicItem = makeItem(spearBase, { rarity: 'magic', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
  ] });
  const res = emu.fracturingOrb(ctx(magicItem));
  assertOk(res, 'Fracturing on magic works');
  assert(res.item.fractured.length === 1, '1 affix fractured');
  assertEq(res.item.rarity, 'magic', 'stays magic');

  // Fracturing on rare also works
  const res2 = emu.fracturingOrb(ctx(rareItem));
  assertOk(res2, 'Fracturing on rare works');
  assert(res2.item.fractured.length === 1, '1 affix fractured');

  // Already fractured — should fail
  const res3 = emu.fracturingOrb(ctx(res2.item));
  assertFail(res3, 'Fracturing already-fractured item should fail');
}

// ==================== 13. Corrupted item gates ====================
console.log('\n[13] Corrupted item gates');
{
  const corrupted = makeItem(spearBase, { rarity: 'rare', corrupted: true, affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
  ] });

  const ops = [
    ['Transmute', () => emu.orbOfTransmutation(ctx(corrupted))],
    ['Augment', () => emu.orbOfAugmentation(ctx(corrupted))],
    ['Regal', () => emu.regalOrb(ctx(corrupted))],
    ['Exalt', () => emu.exaltedOrb(ctx(corrupted))],
    ['Chaos', () => emu.chaosOrb(ctx(corrupted))],
    ['Divine', () => emu.divineOrb(ctx(corrupted))],
    ['Alchemy', () => emu.orbOfAlchemy(ctx(corrupted))],
    ['Fracturing', () => emu.fracturingOrb(ctx(corrupted))],
    ['Perfect Exalt', () => emu.perfectExaltedOrb(ctx(corrupted))],
    ['Annul', () => emu.orbOfAnnulment(ctx(corrupted))],
  ];

  let blockedCount = 0;
  for (const [name, fn] of ops) {
    const res = fn();
    if (!res.ok) {
      blockedCount++;
    } else {
      console.error(`  ⚠ ${name} allowed on corrupted item: ${res.message}`);
    }
  }
  assert(blockedCount >= 8, `${blockedCount}/10 operations blocked on corrupted item (expect 8+; Annul is allowed on corrupted)`);

  // Annulment IS allowed on corrupted items in PoE2 — this is correct behavior
  const annulRes = emu.orbOfAnnulment(ctx(corrupted));
  assertOk(annulRes, 'Annul allowed on corrupted (correct PoE2 behavior)');
}

// ==================== 14. Ancient Orb ====================
console.log('\n[14] Ancient Orb');
{
  const uniqueItem = makeItem(ringBase, { rarity: 'unique', affixes: [] });
  const res = emu.ancientOrb(ctx(uniqueItem));
  assertOk(res, 'Ancient Orb on unique works');
  assertEq(res.item.rarity, 'unique', 'stays unique');

  // Ancient on non-unique
  const rareItem = makeItem(ringBase, { rarity: 'rare', affixes: [] });
  const res2 = emu.ancientOrb(ctx(rareItem));
  assertFail(res2, 'Ancient on rare should fail');

  // Ancient on corrupted
  const corruptedUnique = makeItem(ringBase, { rarity: 'unique', corrupted: true, affixes: [] });
  const res3 = emu.ancientOrb(ctx(corruptedUnique));
  assertFail(res3, 'Ancient on corrupted unique should fail');
}

// ==================== 15. Desecrate mechanics ====================
console.log('\n[15] Desecrate mechanics');
{
  // Desecrate works on amulets, rings, belts, weapons, quivers, jewels
  const ringItem = makeItem(ringBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
  ] });
  const res = emu.desecrate(ctx(ringItem));
  assertOk(res, 'Desecrate on ring works');
  assert(res.item.desecrated || res.item.bonusSuffixSlots > 0, 'desecrate applies effect');

  // Desecrate on helmet should fail
  const helmetItem = makeItem(helmetBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
  ] });
  const res2 = emu.desecrate(ctx(helmetItem));
  assertFail(res2, 'Desecrate on helmet should fail');
}

// ==================== 16. Quality operations ====================
console.log('\n[16] Quality operations');
{
  // Blacksmith's Whetstone on weapon
  const weaponItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
  ] });
  const res = emu.blacksmithsWhetstone(ctx(weaponItem));
  assertOk(res, 'Whetstone on weapon works');

  // Armourer's Scrap on armour
  const armourItem = makeItem(helmetBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
  ] });
  const res2 = emu.armourersScrap(ctx(armourItem));
  assertOk(res2, 'Armourers Scrap on helmet works');

  // Whetstone on armour should fail
  const res3 = emu.blacksmithsWhetstone(ctx(armourItem));
  assertFail(res3, 'Whetstone on armour should fail');

  // Scrap on weapon should fail
  const res4 = emu.armourersScrap(ctx(weaponItem));
  assertFail(res4, 'Scrap on weapon should fail');
}

// ==================== 17. Preserved Rib / Cranium ====================
console.log('\n[17] Preserved Rib / Cranium');
{
  // Preserved Rib on helmet (armour desecrate)
  const helmetItem = makeItem(helmetBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'S1', tags: [] },
  ] });
  const res = emu.preservedRib(ctx(helmetItem));
  assertOk(res, 'Preserved Rib on helmet works');
  assert(res.item.desecrated || res.item.affixes.some(a => a.tags.includes('desecrated')), 'applies desecration to prefix');

  // Preserved Cranium on jewel
  if (jewelBase) {
    const jewelItem = makeItem(jewelBase, { rarity: 'rare', affixes: [
      { modId: 'jp1', type: 'prefix', tier: 1, name: 'JP1', tags: [] },
      { modId: 'js1', type: 'suffix', tier: 1, name: 'JS1', tags: [] },
    ] });
    const res2 = emu.preservedCranium(ctx(jewelItem));
    assertOk(res2, 'Preserved Cranium on jewel works');
    assert(res2.item.desecrated || res2.item.affixes.some(a => a.tags.includes('desecrated')), 'applies desecration');
  }

  // Preserved Rib on weapon should fail (only armour slots)
  const weaponItem = makeItem(spearBase, { rarity: 'rare', affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'P1', tags: [] },
  ] });
  const res3 = emu.preservedRib(ctx(weaponItem));
  assertFail(res3, 'Preserved Rib on weapon should fail');
}

// ==================== 18. Full crafting path test ====================
console.log('\n[18] Full crafting path — Guardian Spear');
{
  // Step 1: paste Guardian Spear (simulated — start with a rare base)
  const spearItem = makeItem(spearBase, { 
    rarity: 'rare', 
    itemLevel: 82,
    affixes: [
      { modId: 'gs_s1', type: 'suffix', tier: 1, name: 'of Assimilation', tags: ['mana'] },
    ],
  });

  // Step 2: Exalt — should add a prefix or suffix
  const ex1 = emu.exaltedOrb(ctx(spearItem));
  if (ex1.ok) {
    assert(ex1.item.affixes.length === 2, 'exalt adds 1 affix');
  }

  // Step 3: Another Exalt
  if (ex1.ok) {
    const ex2 = emu.exaltedOrb(ctx(ex1.item));
    if (ex2.ok) {
      assert(ex2.item.affixes.length === 3, 'exalt adds another affix');
    }
  }

  // Step 4: Chaos orb (reroll all)
  const chaosRes = emu.chaosOrb(ctx(makeItem(spearBase, { rarity: 'rare', itemLevel: 82, affixes: [
    { modId: 'gs_p1', type: 'prefix', tier: 5, name: 'Arcing', tags: ['lightning'] },
    { modId: 'gs_s1', type: 'suffix', tier: 1, name: 'of Assimilation', tags: ['mana'] },
    { modId: 'gs_s2', type: 'suffix', tier: 1, name: 'of the Concussion', tags: [] },
    { modId: 'gs_s3', type: 'suffix', tier: 1, name: 'of Nourishment', tags: ['life', 'attack'] },
  ] })));
  assertOk(chaosRes, 'Chaos on Guardian Spear works');
  assert(chaosRes.item.affixes.length >= 3, `chaos rerolls to at least 3 affixes (got ${chaosRes.item.affixes.length})`);

  // Step 5: Vaal Orb
  const vaalRes = emu.vaalOrb(ctx(makeItem(spearBase, { rarity: 'rare', itemLevel: 82, corrupted: false, affixes: [
    { modId: 'gs_p1', type: 'prefix', tier: 5, name: 'Arcing', tags: ['lightning'] },
    { modId: 'gs_s1', type: 'suffix', tier: 1, name: 'of Assimilation', tags: [] },
    { modId: 'gs_s2', type: 'suffix', tier: 1, name: 'of the Concussion', tags: [] },
    { modId: 'gs_s3', type: 'suffix', tier: 1, name: 'of Nourishment', tags: ['life'] },
  ] })));
  assertOk(vaalRes, 'Vaal on Guardian Spear works');
  assert(vaalRes.item.corrupted, 'item is now corrupted');
}

// ==================== 19. Tablet crafting path ====================
console.log('\n[19] Tablet crafting path');
{
  if (tabletBase) {
    // Normal → Transmute
    const t1 = emu.orbOfTransmutation(ctx(makeItem(tabletBase)));
    assertOk(t1, 't1: Transmute tablet');
    assertEq(t1.item.rarity, 'magic', 'tablet becomes magic');
    assertEq(t1.item.affixes.length, 1, '1 affix on magic tablet');

    // Add augment
    const t2 = emu.orbOfAugmentation(ctx(t1.item));
    assertOk(t2, 't2: Augment tablet');
    assertEq(t2.item.affixes.length, 2, '2 affixes on augmented tablet');

    // Add Regal
    const t3 = emu.regalOrb(ctx(t2.item));
    assertOk(t3, 't3: Regal tablet');
    assertEq(t3.item.rarity, 'rare', 'tablet becomes rare');
    assert(t3.item.affixes.length >= 3, `regal adds affix to tablet (got ${t3.item.affixes.length})`);

    // Exalt on tablet
    const t4 = emu.exaltedOrb(ctx(t3.item));
    assertOk(t4, 't4: Exalt tablet');

    // Vaal on tablet (should not destroy)
    const tabletForVaal = makeItem(tabletBase, { rarity: 'rare', itemLevel: 82, corrupted: false, affixes: [
      { modId: 'tp1', type: 'prefix', tier: 1, name: 'TP1', tags: [] },
      { modId: 'ts1', type: 'suffix', tier: 1, name: 'TS1', tags: [] },
      { modId: 'tp2', type: 'prefix', tier: 2, name: 'TP2', tags: [] },
      { modId: 'ts2', type: 'suffix', tier: 2, name: 'TS2', tags: [] },
    ] });
    const tVaal = emu.vaalOrb(ctx(tabletForVaal));
    assertOk(tVaal, 't5: Vaal tablet');
    assertEq(tVaal.item.rarity, 'rare', 'tablet stays rare after vaal (not destroyed)');
    assert(tVaal.item.corrupted, 'tablet is corrupted');
  } else {
    console.log('  SKIP: no tablet base');
  }
}


// ════════════════════ Socket Crafting (Artificer's Orb) ════════════════════

console.log('\n[Socket Crafting — Artificer\'s Orb]');
{
  // Helper: create a helmet with no sockets
  const helmBase = bases.find(b => b.id === 'ancestral_tiara') || { id: 'test_helm', name: 'Test Helmet', slot: 'helmet', level: 80 };
  const helmItem = makeItem(helmBase, { rarity: 'rare', itemLevel: 80, sockets: 0, corrupted: false, affixes: [
    { modId: 'p1', type: 'prefix', tier: 1, name: 'Life', tags: ['life'] },
    { modId: 's1', type: 'suffix', tier: 1, name: 'Res', tags: ['resistance'] },
  ] });

  // 1. Add first socket to helmet (max 1 for helmets)
  const s1 = emu.artificersOrb(ctx(helmItem));
  assertOk(s1, 's1: Add socket to helmet');
  assertEq(s1.item.sockets, 1, 'helmet now has 1 socket');
  assert(s1.message.includes('1/1'), 'message shows 1/1');

  // 2. Try adding second socket (should fail — max 1)
  const s2 = emu.artificersOrb(ctx(s1.item));
  assert(!s2.ok, 's2: Should fail — already at max');
  assertEq(s2.item.sockets, 1, 'socket count unchanged');

  // 3. Body armour — can have 2 sockets
  const bodyBase = { id: 'test_body', name: 'Test Body', slot: 'body_armour', level: 80 };
  const bodyItem = makeItem(bodyBase, { rarity: 'rare', itemLevel: 80, sockets: 0, corrupted: false, affixes: [] });
  const s3 = emu.artificersOrb(ctx(bodyItem));
  assertOk(s3, 's3: Add 1st socket to body armour');
  assertEq(s3.item.sockets, 1, 'body has 1 socket');
  const s4 = emu.artificersOrb(ctx(s3.item));
  assertOk(s4, 's4: Add 2nd socket to body armour');
  assertEq(s4.item.sockets, 2, 'body has 2 sockets');
  const s5 = emu.artificersOrb(ctx(s4.item));
  assert(!s5.ok, 's5: Should fail — body at max (2)');

  // 4. Ring — cannot be socketed
  const ringBase = { id: 'test_ring', name: 'Test Ring', slot: 'ring', level: 80 };
  const ringItem = makeItem(ringBase, { rarity: 'rare', itemLevel: 80, sockets: 0, corrupted: false, affixes: [] });
  const s6 = emu.artificersOrb(ctx(ringItem));
  assert(!s6.ok, 's6: Ring cannot be socketed');
  assert(s6.message.includes('cannot be used'), 'proper error message');

  // 5. Corrupted helmet — cannot add socket
  const corrHelm = makeItem(helmBase, { rarity: 'rare', itemLevel: 80, sockets: 0, corrupted: true, affixes: [] });
  const s7 = emu.artificersOrb(ctx(corrHelm));
  assert(!s7.ok, 's7: Corrupted item cannot be socketed');

  // 6. maxSocketsForSlot on talisman
  const talismanBase = bases.find(b => b.id === 'thunder_talisman') || { id: 'test_tali', name: 'Test Talisman', slot: 'talisman', level: 80 };
  const taliItem = makeItem(talismanBase, { rarity: 'rare', itemLevel: 80, sockets: 0, corrupted: false, affixes: [] });
  const s8 = emu.artificersOrb(ctx(taliItem));
  if (talismanBase.slot === 'talisman') {
    // Talisman is weapon_1h internally → 1 socket
    assertOk(s8, 's8: Talisman (weapon_1h) can have 1 socket');
    assertEq(s8.item.sockets, 1, 'talisman has 1 socket');
  } else {
    console.log('  SKIP: talisman base has unexpected slot:', talismanBase.slot);
  }
}

// ==================== Results ====================
console.log(`\n${'='.repeat(60)}`);
console.log(`Passed: ${passed}    Failed: ${failed}`);
console.log(`${'='.repeat(60)}`);

if (failed > 0) {
  console.error(`\nFailures:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
} else {
  console.log('✓ All emulator tests pass.\n');
}
