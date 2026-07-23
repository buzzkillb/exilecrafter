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
  { id: 'ancestral_tiara', name: 'Ancestral Tiara', slot: 'helmet', level: 80 },
  { id: 'gold_ring',        name: 'Gold Ring',       slot: 'ring',   level: 60 },
  { id: 'two_stone_ring',   name: 'Two-Stone Ring',  slot: 'ring',   level: 24 },
  { id: 'waystone_t15',     name: 'Waystone (Tier 15)', slot: 'waystone', level: 78 },
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

// ─────────────────────────────── SUMMARY ───────────────────────────────

console.log('\n────────────────────────────────────────────');
console.log(`Passed: ${passed}    Failed: ${failed}`);
console.log('────────────────────────────────────────────');
if (failed > 0) {
  console.error('\nFailures:');
  for (const f of failures) console.error(' - ' + f);
  process.exit(1);
}
console.log('\n✓ All tests pass.');
