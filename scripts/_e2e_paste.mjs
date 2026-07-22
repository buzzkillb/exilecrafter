// scripts/_e2e_paste.mjs
// End-to-end test: paste a PoE2 item into the simulator and verify it parses.

import { JSDOM } from 'jsdom';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const distDir = 'dist/_astro';
const files = await readdir(distDir);
const simJs = files.find((f) => f.startsWith('simulator.astro') && f.endsWith('.js'));
const simJsContent = await readFile(join(distDir, simJs), 'utf8');

// The user's test input
const ITEM_TEXT = `Item Class: Rings
Rarity: Rare
Torment Whorl
Gold Ring
--------
Requires: Level 60
--------
Item Level: 82
--------
{ Implicit Modifier }
15(6-15)% increased Rarity of Items found
--------
{ Prefix Modifier "Tempered" (Tier: 2) — Damage, Physical, Attack }
Adds 13(10-15) to 23(18-26) Physical Damage to Attacks
{ Desecrated Prefix Modifier "Entombing" (Tier: 1) — Damage, Elemental, Cold, Attack }
Adds 23(21-24) to 32(32-37) Cold damage to Attacks
{ Prefix Modifier "Sparking" (Tier: 5) — Damage, Elemental, Lightning, Attack }
Adds 1 to 30(28-32) Lightning damage to Attacks
{ Suffix Modifier "of the Rainbow" (Tier: 1) — Elemental, Fire, Cold, Lightning, Resistance }
+16(15-16)% to all Elemental Resistances
{ Suffix Modifier "of the Remora" (Tier: 1) — Life, Physical, Attack }
Leech 7.55(7-7.9)% of Physical Attack Damage as Life
{ Crafted Suffix Modifier "of Archaeology" (Tier: 1) }
17(15-18)% increased Rarity of Items found`;

const dom = new JSDOM(`<!DOCTYPE html><html><body>
<div id="base-picker"></div><div id="ilvl-input" value="80"></div>
<div id="item-display"></div><div id="currency-strip"></div>
<div id="history-list"></div><div id="history-count"></div>
<div id="tips-panel"></div><div id="mod-pool-summary"></div>
<div id="active-omens-strip"></div><div id="active-omens-chips"></div>
<div id="omens-btn-label"></div><div id="empty-state"></div>
<div id="main-ui"></div><div id="reset-btn"></div><div id="seed-rare-btn"></div>
<div id="undo-btn"></div><div id="clear-omens-btn"></div><div id="open-omens-btn"></div>
<div id="omen-modal"></div><div id="omen-modal-body"></div><div id="omen-modal-count"></div>
<div id="omen-search"></div><div id="omen-clear-all"></div><div id="omen-done"></div>
<div id="close-omen-modal"></div><div id="tooltip"></div>
<div id="paste-modal"></div><div id="paste-empty-btn"></div>
<div id="paste-btn"></div><div id="paste-import"></div>
<div id="paste-cancel"></div><div id="close-paste-modal"></div>
<div id="paste-textarea"></div><div id="paste-preview"></div>
<div id="paste-detected"></div><div id="paste-error"></div>
<div id="import-paste-btn"></div>
<div id="cancel-paste-btn"></div>
<script type="application/json" id="sim-data"></script>
</body></html>`, {
  url: 'http://localhost:4321/simulator/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});

const { window } = dom;
window.Worker = class { addEventListener() {} postMessage() {} terminate() {} };
window.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));

// Inject sim-data
const basesJson = await readFile('data/processed/bases.json', 'utf8');
const modsJson = await readFile('data/processed/mods.json', 'utf8');
const currencyJson = await readFile('data/processed/currency.json', 'utf8');
const omensJson = await readFile('data/processed/omens.json', 'utf8');
const weightsJson = await readFile('data/processed/weights.json', 'utf8');

const simData = {
  bases: JSON.parse(basesJson).map((b) => ({ id: b.id, name: b.name, slot: b.slot, level: b.level, affixSlots: b.affixSlots, imageUrl: b.imageUrl, variant: b.variant })),
  currency: JSON.parse(currencyJson).map((c) => ({ id: c.id, name: c.name, category: c.category, tier: c.tier, imageUrl: c.imageUrl, description: c.description })),
  omens: JSON.parse(omensJson).map((o) => ({ id: o.id, name: o.name, effect: o.description, imageUrl: o.imageUrl })),
  mods: JSON.parse(modsJson),
  weights: JSON.parse(weightsJson),
};

window.document.getElementById('sim-data').textContent = JSON.stringify(simData);
window.eval(simJsContent);

console.log('=== Testing PoE2 Item Import ===\n');

// 1. Open paste modal
const pasteBtn = window.document.getElementById('paste-btn') || window.document.getElementById('paste-empty-btn');
if (pasteBtn) pasteBtn.click();
const pasteModal = window.document.getElementById('paste-modal');
console.log('Paste modal opened:', !pasteModal.classList.contains('hidden'));

// 2. Paste the text
const textarea = window.document.getElementById('paste-textarea');
textarea.value = ITEM_TEXT;
textarea.dispatchEvent(new window.Event('input', { bubbles: true }));

// 3. Wait briefly then check detected
await new Promise((r) => setTimeout(r, 100));

const detected = window.document.getElementById('paste-detected');
console.log('Detected:', detected?.textContent?.slice(0, 200));
const error = window.document.getElementById('paste-error');
console.log('Error visible:', !error?.classList.contains('hidden'));

// 4. Click Import
const importBtn = window.document.getElementById('import-paste-btn') || window.document.getElementById('paste-import');
console.log('Import button disabled:', importBtn?.disabled);

if (importBtn && !importBtn.disabled) {
  importBtn.click();
  await new Promise((r) => setTimeout(r, 100));
}

// 5. Check the rendered item
const itemName = window.document.querySelector('.item-name')?.textContent;
const modRows = window.document.querySelectorAll('.item-row');
console.log('\n=== Rendered Item ===');
console.log('Item name:', itemName);
console.log('Mod rows:', modRows.length);
modRows.forEach((r) => {
  const tier = r.querySelector('.mod-tier')?.textContent;
  const text = r.querySelector('.mod-text')?.textContent;
  console.log(`  ${tier}: ${text}`);
});

if (modRows.length >= 5) {
  console.log('\n✓ PASS: Item parsed and rendered with 5+ mods');
} else {
  console.error('\n✗ FAIL: Expected 5+ mod rows, got', modRows.length);
  process.exit(1);
}