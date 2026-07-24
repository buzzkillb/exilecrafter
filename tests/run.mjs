// tests/run.mjs
// Lightweight native-Node test runner for pure item modules.
// Uses Node 24's --experimental-strip-types so no transpile step is needed.
//
// Run with:   npm run test
// (or)        node --experimental-strip-types --import ./tests/_setup.mjs ./tests/run.mjs

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dirname, 'fixtures');

// Convert this file to a "module" via the relative import trick:
const itemModule = await import('../src/lib/item/index.ts');

const itemsMod = itemModule;

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    return;
  }
  failed++;
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}
function assertEq(actual, expected, msg) {
  if (actual === expected) {
    passed++;
    return;
  }
  failed++;
  failures.push(msg + ` (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  console.error(`  ✗ ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertIncludes(arr, value, msg) {
  if (Array.isArray(arr) && arr.includes(value)) {
    passed++;
    return;
  }
  failed++;
  failures.push(msg + ` (looking for ${JSON.stringify(value)} in ${JSON.stringify(arr)})`);
  console.error(`  ✗ ${msg} — looking for ${JSON.stringify(value)} in ${JSON.stringify(arr)}`);
}

const BASES = [
  { id: 'ancestral_tiara',        name: 'Ancestral Tiara',        slot: 'helmet', level: 80 },
  { id: 'gold_ring',               name: 'Gold Ring',              slot: 'ring',   level: 60 },
  { id: 'two_stone_ring',          name: 'Two-Stone Ring',         slot: 'ring',   level: 24 },
  { id: 'prismatic_ring',          name: 'Prismatic Ring',         slot: 'ring',   level: 42 },
  { id: 'runeforged_war_wraps',    name: 'Runeforged War Wraps',   slot: 'gloves', level: 65 },
  { id: 'waystone_t15',            name: 'Waystone (Tier 15)',     slot: 'waystone', level: 78 },
];

async function loadFixture(name) {
  return readFile(join(fixtures, name), 'utf8');
}

// ──────────────────────────────── TESTS ────────────────────────────────

console.log('\n[find-base]');
{
  // 1. exact match
  const r = itemsMod.findBaseByName('Ancestral Tiara', BASES);
  assert(r !== null, 'exact match returns a base');
  assertEq(r?.base.id, 'ancestral_tiara', 'exact match id');
  assertEq(r?.matchedOn, 'exact', 'exact matchedOn');

  // 2. endsWith (typical unique-item case)
  const r2 = itemsMod.findBaseByName('Torment Whorl Gold Ring', BASES);
  assert(r2 !== null, 'endsWith match returns a base');
  assertEq(r2?.base.id, 'gold_ring', 'endsWith id');
  assertEq(r2?.matchedOn, 'endsWith', 'endsWith matchedOn');

  // 3. containsBase
  const r3 = itemsMod.findBaseByName('Gold Ring of Wonder', BASES);
  assert(r3 !== null, 'containsBase match returns a base');
  assertEq(r3?.matchedOn, 'containsBase', 'containsBase matchedOn');

  // 4. containsPasted (sub-string)
  const r4 = itemsMod.findBaseByName('Gold', BASES);
  assert(r4 !== null, 'containsPasted match returns a base');
  assertEq(r4?.matchedOn, 'containsPasted', 'containsPasted matchedOn');

  // 5. miss
  const r5 = itemsMod.findBaseByName('Mithril Blade of Doom', BASES);
  assertEq(r5, null, 'unknown returns null');
}

console.log('\n[parse-paste: Ancestral Tiara]');
{
  const text = await loadFixture('ancestral_tiara.txt');
  const parsed = itemsMod.parsePaste(text, BASES);

  assertEq(parsed.itemClass, 'Helmets', 'itemClass');
  assertEq(parsed.rarity, 'Rare', 'rarity');
  assertEq(parsed.itemName, 'Cataclysm Ward', 'itemName (rolled name)');
  assertEq(parsed.baseName, 'Ancestral Tiara', 'baseName');
  assertEq(parsed.itemLevel, 86, 'itemLevel');
  assertEq(parsed.corruptionLevel, 2, 'Twice Corrupted detected');

  // This wiki-format paste contains 6 visible mods (3 prefixes + 3 suffixes).
  // No implicit modifier block is present in this item.
  assertEq(parsed.affixes.length, 6, '6 affixes');
  assertEq(parsed.implicit, null, 'no implicit (no implicit block in paste)');

  // Rune
  assertEq(parsed.runes.length, 1, 'rune detected');
  assertEq(parsed.runes[0].name, 'Raven-Touched', 'rune name');

  // Enhancement blocks
  assert(parsed.enhancementNames.length >= 1, 'enhancement blocks detected');
  assert(parsed.enhancementNames.includes('Enhancement'), 'Enhancement header captured');
  assertIncludes(parsed.enhancementNames, 'Corruption Enhancement — Attack', 'Corruption Enhancement captured');

  // Hybrid mod (Exarch's two-line):
  const exarch = parsed.affixes.find((a) => a.descriptiveName === "Exarch's");
  assert(!!exarch, 'Exarch\'s affix captured');
  assert(exarch?.name.includes('\n+39'), 'hybrid second line merged into name');
  assertEq(exarch?.tier, 2, 'Exarch\'s tier');
  assertEq(exarch?.rolled, 34, 'Exarch\'s rolled value');
  assertEq(exarch?.range?.min, 33, 'Exarch\'s range.min');
  assertEq(exarch?.range?.max, 38, 'Exarch\'s range.max');

  // Descriptive names captured on all six wiki headers
  const names = parsed.affixes.map((a) => a.descriptiveName);
  assertIncludes(names, 'Virile', 'Virile descriptive name');
  assertIncludes(names, 'Unassailable', 'Unassailable descriptive name');
  assertIncludes(names, 'of Bameth', 'of Bameth descriptive name');
  assertIncludes(names, 'of the Polar Bear', 'Polar Bear descriptive name');
  assertIncludes(names, 'of Tzteosh', 'of Tzteosh descriptive name');

  // numeric ranges per affix
  const virile = parsed.affixes.find((a) => a.descriptiveName === 'Virile');
  assertEq(virile?.rolled, 118, 'Virile rolled 118');
  assertEq(virile?.range?.min, 100, 'Virile range.min');
  assertEq(virile?.range?.max, 119, 'Virile range.max');

  // Tag groups captured from wiki headers
  assertIncludes(virile?.descriptiveTags ?? [], 'Life', 'Virile has Life tag');
  const polar = parsed.affixes.find((a) => a.descriptiveName === 'of the Polar Bear');
  assertIncludes(polar?.descriptiveTags ?? [], 'Cold', 'Polar Bear has Cold tag');
  assertIncludes(polar?.descriptiveTags ?? [], 'Resistance', 'Polar Bear has Resistance tag');
}

console.log('\n[parse-paste: Two-Stone Ring]');
{
  const text = await loadFixture('two_stone_ring.txt');
  const parsed = itemsMod.parsePaste(text, BASES);
  assertEq(parsed.itemClass, 'Rings', 'itemClass');
  assertEq(parsed.rarity, 'Rare', 'rarity');
  assertEq(parsed.itemName, 'Torment Whorl', 'itemName');
  assertEq(parsed.baseName, 'Gold Ring', 'baseName (matched via second candidate)');
  assertEq(parsed.itemLevel, 82, 'itemLevel');
  assertEq(parsed.affixes.length, 6, '6 affixes');

  // sanity: includes Entombing, Tempered, Sparking, of Archaeology, of the Remora, of the Rainbow
  const all = parsed.affixes.map((a) => a.descriptiveName).filter(Boolean);
  assertIncludes(all, 'Tempered', 'Tempered present');
  assertIncludes(all, 'Entombing', 'Entombing present');
  assertIncludes(all, 'Sparking', 'Sparking present');
  assertIncludes(all, 'of Archaeology', 'of Archaeology present');
  assertIncludes(all, 'of the Remora', 'of the Remora present');
  assertIncludes(all, 'of the Rainbow', 'of the Rainbow present');

  // crafted / desecrated flags
  const entombing = parsed.affixes.find((a) => a.descriptiveName === 'Entombing');
  assertEq(entombing?.desecrated, true, 'Entombing flagged desecrated');
  const archaeology = parsed.affixes.find((a) => a.descriptiveName === 'of Archaeology');
  assertEq(archaeology?.crafted, true, 'of Archaeology flagged crafted');
}

console.log('\n[parse-paste: in-game format Waystone]');
{
  const text = await loadFixture('waystone_t15_ingame.txt');
  const parsed = itemsMod.parsePaste(text, BASES);
  assertEq(parsed.itemClass, '', 'in-game has no Item Class');
  assertEq(parsed.rarity, 'Normal', 'rarity Normal');
  assertEq(parsed.itemName, 'Waystone (Tier 15)', 'in-game item name');
  assertEq(parsed.baseName, 'Waystone (Tier 15)', 'in-game base name (single-line)');
  assertEq(parsed.itemLevel, 78, 'in-game item level');
  // No prefix/suffix headers in this paste; nothing should be misclassified.
  assertEq(parsed.affixes.length, 0, 'no affixes');
}

console.log('\n[tags]');
{
  assertEq(itemsMod.tagColor(['fire']), '#c44a2a', 'fire tag color');
  assertEq(itemsMod.tagColor(['cold']), '#4a8fc4', 'cold tag color');
  assertEq(itemsMod.tagColor(['life']), '#d44a4a', 'life tag color');
  assertEq(itemsMod.tagColor(['energy_shield']), '#6accc4', 'energy_shield tag color');
  assertEq(itemsMod.tagColor(['unknown-tag']), itemsMod.TAG_COLOR_DEFAULT, 'unknown tag falls through to default');
  assertEq(itemsMod.escapeHtml(String.raw`<b>hi</b>&"'`), '&lt;b&gt;hi&lt;/b&gt;&amp;&quot;&#39;', 'escapeHtml');
  assertEq(itemsMod.capitalize('rare'), 'Rare', 'capitalize');
}

console.log('\n[render]');
{
  const item = {
    itemName: 'Cataclysm Ward',
    baseName: 'Ancestral Tiara',
    slot: 'helmet',
    rarity: 'rare',
    itemLevel: 86,
    implicit: '305 Energy Shield',
    affixes: [
      { type: 'prefix', tier: 3, name: '+118 to maximum Life', descriptiveName: 'Virile', descriptiveTags: ['Life'], crafted: false, desecrated: false, range: { min: 100, max: 119 }, rolled: 118 },
    ],
    corruptionLevel: 2,
  };
  const html = itemsMod.renderItemCardHTML(item);
  assert(html.includes('Cataclysm Ward'), 'rendered itemName');
  assert(html.includes('Ancestral Tiara'), 'rendered baseName');
  assert(html.includes('Helmet'), 'rendered Helmet slot');
  assert(html.includes('T3'), 'rendered tier pill');
  assert(html.includes('Virile'), 'rendered descriptive name');
  assert(html.includes('Twice Corrupted'), 'Twice Corrupted renders indicator');
  assert(!html.includes('<div class="corrupted-indicator">Corrupted</div>'), 'no plain Corrupted badge when Twice Corrupted');
  assert(html.includes('Helmet'), 'rendered slot label');
}

console.log('\n[serialize roundtrip]');
{
  const item = {
    itemClass: 'Helmets',
    slot: 'helmet',
    rarity: 'rare',
    baseName: 'Ancestral Tiara',
    itemName: 'Cataclysm Ward',
    itemLevel: 86,
    implicit: '305 Energy Shield',
    affixes: [
      { type: 'prefix', tier: 3, name: '+118 to maximum Life', descriptiveName: 'Virile', descriptiveTags: ['Life'], crafted: false, desecrated: false, range: { min: 100, max: 119 }, rolled: 118 },
    ],
    corrupted: true,
  };
  const text = itemsMod.itemToText(item);
  assert(text.includes('Item Class: Helmets'), 'serialize includes Item Class');
  assert(text.includes('Rarity: Rare'), 'serialize includes Rarity');
  assert(text.includes('Cataclysm Ward'), 'serialize includes item name');
  assert(text.includes('Ancestral Tiara'), 'serialize includes base');
  assert(text.includes('+118 to maximum Life'), 'serialize includes affix');
  assert(text.includes('\nCorrupted\n') || text.endsWith('\nCorrupted'), 'serialize includes Corrupted marker');
  // Round-trip: confirm the essential headers survive even though the
  // in-game format emitted by itemToText doesn't include tier markers,
  // so individual affixes can't be reconstructed from it.
  const parsed = itemsMod.parsePaste(text, BASES);
  assertEq(parsed.itemName, 'Cataclysm Ward', 'roundtrip preserves item name');
  assertEq(parsed.baseName, 'Ancestral Tiara', 'roundtrip preserves base name');
  assertEq(parsed.itemLevel, 86, 'roundtrip preserves item level');
  assertEq(parsed.corruptionLevel, 1, 'roundtrip preserves corruption level');
  assertEq(parsed.rarity, 'Rare', 'roundtrip preserves rarity');
}

console.log('\n[parse-paste: Runeforged War Wraps (runes, hybrid, desecrated, crafted, tag-empty)]');
{
  const text = await loadFixture('runeforged_war_wraps.txt');
  const parsed = itemsMod.parsePaste(text, BASES);

  assertEq(parsed.itemClass, 'Gloves', 'itemClass');
  assertEq(parsed.rarity, 'Rare', 'rarity');
  assertEq(parsed.itemName, 'Woe Clutches', 'itemName (rolled)');
  assertEq(parsed.baseName, 'Runeforged War Wraps', 'baseName resolved');
  assertEq(parsed.itemLevel, 81, 'itemLevel');
  assertEq(parsed.corruptionLevel, 0, 'not corrupted');

  // Rune bonuses are *outside* the {} blocks.
  assertEq(parsed.runes.length, 2, 'two rune bonuses parsed');
  // The parser strips the `(rune)` suffix, leaving the full text of each bonus.
  assert(parsed.runes[0]?.name.includes('Attack Speed'), 'Attack Speed rune captured');
  assert(parsed.runes[1]?.name.includes('Marksman'), 'Marksman rune captured');

  // Wiki header expectations
  assertEq(parsed.affixes.length, 6, '6 affixes (3 prefix + 3 suffix)');
  const prefixes = parsed.affixes.filter((a) => a.type === 'prefix');
  const suffixes = parsed.affixes.filter((a) => a.type === 'suffix');
  assertEq(prefixes.length, 3, '3 prefixes');
  assertEq(suffixes.length, 3, '3 suffixes');

  const names = parsed.affixes.map((a) => a.descriptiveName);
  assertIncludes(names, "Kolr's", 'Kolr\'s descriptive name');
  assertIncludes(names, 'Electrocuting', 'Electrocuting descriptive name');
  assertIncludes(names, 'Razor-sharp', 'Razor-sharp descriptive name');
  assertIncludes(names, 'of the Hunt', 'of the Hunt descriptive name');
  assertIncludes(names, 'of the Lightning', 'of the Lightning descriptive name');
  assertIncludes(names, 'of Fury', 'of Fury descriptive name');

  // Desecrated + Crafted modifiers
  const electrocuting = parsed.affixes.find((a) => a.descriptiveName === 'Electrocuting');
  assertEq(electrocuting?.desecrated, true, 'Electrocuting is desecrated');
  assertEq(electrocuting?.crafted, false, 'Electrocuting is not crafted');
  assertEq(electrocuting?.tier, 1, 'Electrocuting tier');

  const ofFury = parsed.affixes.find((a) => a.descriptiveName === 'of Fury');
  assertEq(ofFury?.crafted, true, 'of Fury is crafted');
  assertEq(ofFury?.desecrated, false, 'of Fury is not desecrated');
  assertEq(ofFury?.tier, 2, 'of Fury tier');

  // Header with no tags (of the Hunt (Tier: 1) — no em-dash tags)
  const ofTheHunt = parsed.affixes.find((a) => a.descriptiveName === 'of the Hunt');
  assert(ofTheHunt !== undefined, 'of the Hunt present');
  assert(
    !ofTheHunt.descriptiveTags || ofTheHunt.descriptiveTags.length === 0,
    'of the Hunt has no descriptive tags',
  );
  assertEq(ofTheHunt?.rolled, 62, 'of the Hunt rolled 62');

  // Numeric values
  const kolrs = parsed.affixes.find((a) => a.descriptiveName === "Kolr's");
  assertEq(kolrs?.rolled, 37, 'Kolr\'s rolled 37');
  assertEq(kolrs?.range?.min, 31, 'Kolr\'s range.min');
  assertEq(kolrs?.range?.max, 40, 'Kolr\'s range.max');

  // Adds X(…)-Y(…) multi-numeric (parser keeps raw form)
  const electrocutingName = electrocuting?.name ?? '';
  assert(electrocutingName.includes('Adds 2(1-4)'),
    'Electrocuting rolled text contains "Adds 2(1-4)" (raw form preserved)');
  assert(electrocutingName.includes('60(60-71)'),
    'Electrocuting rolled text contains "60(60-71)" (raw form preserved)');
  assert(electrocutingName.toLowerCase().includes('lightning'),
    'Electrocuting rolled text mentions Lightning');

  // Tag groups (wiki headers carried them)
  assertIncludes(electrocuting?.descriptiveTags ?? [], 'Damage', 'Electrocuting has Damage tag');
  assertIncludes(electrocuting?.descriptiveTags ?? [], 'Lightning', 'Electrocuting has Lightning tag');

  // of the Lightning (the second tier-2 suffix, NOT of the Hunt) has Elemental tag
  const ofTheLightning = parsed.affixes.find((a) => a.descriptiveName === 'of the Lightning');
  assert(ofTheLightning !== undefined, 'of the Lightning present');
  assertIncludes(ofTheLightning?.descriptiveTags ?? [], 'Elemental', 'of the Lightning has Elemental tag');
  assertIncludes(ofTheLightning?.descriptiveTags ?? [], 'Resistance', 'of the Lightning has Resistance tag');
  assertEq(ofTheLightning?.rolled, 36, 'of the Lightning rolled 36');
}

console.log('\n[parse-paste: The Taming (unique, implicit, enhancement, corruption)]');
{
  const text = await loadFixture('the_taming.txt');
  const parsed = itemsMod.parsePaste(text, BASES);

  assertEq(parsed.itemClass, 'Rings', 'itemClass');
  assertEq(parsed.rarity, 'Unique', 'rarity');
  assertEq(parsed.itemName, 'The Taming', 'itemName (rolled)');
  assertEq(parsed.baseName, 'Prismatic Ring', 'baseName resolved');
  assertEq(parsed.itemLevel, 81, 'itemLevel');
  assertEq(parsed.corruptionLevel, 1, 'Corrupted (single) detected');

  // Implicit modifier block (no Tier, no descriptive name, has tags)
  assert(parsed.implicit !== null && parsed.implicit.length > 0,
    'implicit modifier parsed');
  assert(parsed.implicit.includes('all Elemental Resistances'),
    'implicit rolled text contains "all Elemental Resistances"');

  // Corruption Enhancement block
  assert(parsed.enhancementNames.length >= 1, 'enhancement blocks detected');
  const corrupEnh = parsed.enhancementNames.find((n) => n.startsWith('Corruption Enhancement'));
  assert(corrupEnh !== undefined, 'Corruption Enhancement — Attribute captured');
  assertIncludes(parsed.enhancementNames, 'Corruption Enhancement — Attribute', 'Corruption Enhancement name');

  // 3 unique mods captured as affixes (the Corruption Enhancement body is
  // routed to enchantments[] separately, since "Corruption Enhancement" is
  // a slot header, not a Unique/Prefix/Suffix/Implicit Modifier).
  assertEq(parsed.affixes.length, 3, '3 unique-mod affixes parsed');

  const allTypes = parsed.affixes.map((a) => a.type);
  assert(allTypes.every((t) => t === 'unique'), 'all 3 affixes typed as unique');

  const resistAffix = parsed.affixes.find((a) => a.name.includes('+17') && a.name.includes('Elemental Resistances'));
  assert(resistAffix !== undefined, '+17% all Elemental Resistances affix captured');
  assertEq(resistAffix?.descriptiveTags?.[0] ?? '', 'Elemental', 'first tag is Elemental');
  assertIncludes(resistAffix?.descriptiveTags ?? [], 'Fire', 'resist affix has Fire tag');

  // Corruption Enhancement body goes to enchantments[]
  assertEq(parsed.enchantments.length, 1, 'one enhancement block');
  const enhText = parsed.enchantments[0]?.raw ?? '';
  assert(enhText.includes('+11(10-15)'), 'enhancement body has +11(10-15) roll');
  assert(enhText.includes('Intelligence'), 'enhancement body mentions Intelligence');

  // The first three unique mods are NOT prefix/suffix
  assert(!allTypes.includes('prefix'), 'no spurious prefix classification on unique mods');
  assert(!allTypes.includes('suffix'), 'no spurious suffix classification on unique mods');

  // "Unscalable Value" lines (no numeric rolls) preserved as text
  const unscalable = parsed.affixes.find((a) => a.name.includes('Unscalable Value'));
  assert(unscalable !== undefined, 'Unscalable Value text captured in name');

  // No spurious implicit classification
  assert(!allTypes.includes('implicit'), 'no spurious implicit classification on unique mods');

  // Unknown lines: lore block should not surface as unknown
  assert(
    !parsed.unknownLines.some((l) => l.includes('Berek')),
    'lore not surfaced as unknown lines',
  );
}

console.log('\n[quality: tag matching + value boost]');
{
  // qualityMatchesAffixTags
  assert(itemsMod.qualityMatchesAffixTags(['fire', 'elemental'], 'Fire Modifiers'), 'fire tag matches Fire Modifiers');
  assert(itemsMod.qualityMatchesAffixTags(['cold'], 'Cold Modifiers'), 'cold tag matches Cold Modifiers');
  assert(!itemsMod.qualityMatchesAffixTags(['life'], 'Fire Modifiers'), 'life tag does NOT match Fire Modifiers');
  assert(!itemsMod.qualityMatchesAffixTags(['attack'], null), 'null category returns false');
  assert(!itemsMod.qualityMatchesAffixTags([], 'Fire Modifiers'), 'empty tags returns false');

  // qualityPercentToMultiplier
  assertEq(itemsMod.qualityPercentToMultiplier(20), 1.2, '20% to 1.2');
  assertEq(itemsMod.qualityPercentToMultiplier(0), 1.0, '0% to 1.0');

  // boostFirstValue
  assertEq(itemsMod.boostFirstValue('+17(10-20)% to all Elemental Resistances', 1.2),
    '+20(10-20)% to all Elemental Resistances', 'boost 17 by 20% to 20');
  assertEq(itemsMod.boostFirstValue('+9(7-10)% to all Elemental Resistances', 1.2),
    '+10(7-10)% to all Elemental Resistances', 'boost 9 by 20% to 10');
  assertEq(itemsMod.boostFirstValue('+37(31-40)% increased Projectile Damage', 1.0),
    '+37(31-40)% increased Projectile Damage', '1.0 multiplier leaves value unchanged');
  assertEq(itemsMod.boostFirstValue('+10 to Strength', 1.2),
    '+12 to Strength', 'boost 10 by 20% to 12');

  // applyQualityToPaste — The Taming (Fire Modifiers +20%)
  const fireModsQual = { category: 'Fire Modifiers', value: 20 };
  const firePaste = {
    affixes: [
      { name: '+17(10-20)% to all Elemental Resistances', descriptiveTags: ['elemental', 'fire', 'cold', 'lightning', 'resistance'], type: 'unique', tier: null },
      { name: '+9(7-10)% to all Elemental Resistances', descriptiveTags: ['elemental', 'fire', 'cold', 'lightning', 'resistance'], type: 'implicit', tier: null },
      { name: '19(10-20)% increased Damage', descriptiveTags: ['elemental', 'fire', 'cold', 'lightning'], type: 'unique', tier: null },
      { name: '+36% to Lightning Resistance', descriptiveTags: ['elemental', 'lightning', 'resistance'], type: 'suffix', tier: 2 },
    ],
    qualityParsed: fireModsQual,
  };
  const boosted = itemsMod.applyQualityToPaste(firePaste);
  assertEq(boosted.affixes[0].name, '+20(10-20)% to all Elemental Resistances', 'fire quality boosts 17 to 20');
  assertEq(boosted.affixes[1].name, '+10(7-10)% to all Elemental Resistances', 'fire quality boosts 9 to 10');
  assertEq(boosted.affixes[2].name, '22(10-20)% increased Damage', 'fire quality boosts 19 to 22');
  // Lightning mod DOES have 'lightning' tag but Fire Modifiers only boosts 'fire' tag
  // Since descriptiveTags has 'lightning' not 'fire', this mod is NOT boosted
  assertEq(boosted.affixes[3].name, '+36% to Lightning Resistance', 'lightning mod NOT boosted by Fire Modifiers');
}

// ──────────────── SUMMARY ────────────────

console.log('\n────────────────────────────────────────────');
console.log(`Passed: ${passed}    Failed: ${failed}`);
console.log('────────────────────────────────────────────');
if (failed > 0) {
  console.error('\nFailures:');
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log('\n✓ All tests pass.');
