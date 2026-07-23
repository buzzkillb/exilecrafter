// scripts/_e2e_paste.mjs
// End-to-end test: paste a PoE2 item into the simulator and verify it parses.

import { JSDOM } from 'jsdom';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const distDir = 'dist/_astro';
const files = await readdir(distDir);
const simJs = files.find((f) => f.startsWith('simulator.astro') && f.endsWith('.js'));
if (!simJs) throw new Error('Built simulator entrypoint was not found. Run npm run build first.');

const MALICIOUS_MARKUP = 'seo-xss"><img id="seo-xss-fixture" src=x onerror="alert(1)">';

// The user's test input
const ITEM_TEXT = `Item Class: Rings
Rarity: Rare
${MALICIOUS_MARKUP}
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

const simulatorHtml = await readFile('dist/simulator/index.html', 'utf8');
const dom = new JSDOM(simulatorHtml, {
  url: 'http://localhost:4321/simulator/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});

const { window } = dom;
window.Worker = class { addEventListener() {} postMessage() {} terminate() {} };
window.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));

// Inject the same processed data the browser would fetch.
const basesJson = await readFile('public/data/bases.json', 'utf8');
const modsJson = await readFile('public/data/mods.json', 'utf8');
const currencyJson = await readFile('public/data/currency.json', 'utf8');
const omensJson = await readFile('public/data/omens.json', 'utf8');
const weightsJson = await readFile('public/data/weights.json', 'utf8');

const simData = {
  bases: JSON.parse(basesJson).map((b) => ({ id: b.id, name: b.name, slot: b.slot, level: b.level, affixSlots: b.affixSlots, imageUrl: b.imageUrl, variant: b.variant })),
  currency: JSON.parse(currencyJson).map((c) => ({ id: c.id, name: c.name, category: c.category, tier: c.tier, imageUrl: c.imageUrl, description: c.description })),
  omens: JSON.parse(omensJson).map((o) => ({ id: o.id, name: o.name, effect: o.description, imageUrl: o.imageUrl })),
  mods: JSON.parse(modsJson),
  weights: JSON.parse(weightsJson),
};
const exaltedIndex = simData.currency.findIndex((item) => item.id === 'exalted_orb');
if (exaltedIndex < 0) throw new Error('Expected Exalted Orb fixture data was not found.');
simData.currency[exaltedIndex] = {
  ...simData.currency[exaltedIndex],
  name: MALICIOUS_MARKUP,
  description: MALICIOUS_MARKUP,
  imageUrl: MALICIOUS_MARKUP,
};
if (simData.omens.length === 0) throw new Error('Expected omen fixture data was not found.');
const hostileOmenId = simData.omens[0].id;
simData.omens[0] = {
  ...simData.omens[0],
  name: MALICIOUS_MARKUP,
  effect: MALICIOUS_MARKUP,
  imageUrl: MALICIOUS_MARKUP,
};

const fetchedData = new Map([
  ['/data/currency.json', simData.currency],
  ['/data/omens.json', simData.omens],
  ['/data/mods.json', simData.mods],
  ['/data/weights.json', simData.weights],
]);
const fetchStub = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!fetchedData.has(url)) {
    return { ok: false, status: 404, json: async () => ({}) };
  }
  return { ok: true, status: 200, json: async () => fetchedData.get(url) };
};
window.fetch = fetchStub;

// Astro emits an ES module with relative imports. Run it as a module while
// exposing the JSDOM browser globals it expects.
function installBrowserGlobals(targetWindow, targetFetch) {
  targetWindow.Worker = class { addEventListener() {} postMessage() {} terminate() {} };
  targetWindow.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
  const browserGlobals = {
    window: targetWindow,
    document: targetWindow.document,
    navigator: targetWindow.navigator,
    location: targetWindow.location,
    localStorage: targetWindow.localStorage,
    HTMLElement: targetWindow.HTMLElement,
    HTMLInputElement: targetWindow.HTMLInputElement,
    HTMLSelectElement: targetWindow.HTMLSelectElement,
    HTMLButtonElement: targetWindow.HTMLButtonElement,
    Element: targetWindow.Element,
    Node: targetWindow.Node,
    Event: targetWindow.Event,
    CustomEvent: targetWindow.CustomEvent,
    Worker: targetWindow.Worker,
    fetch: targetFetch,
    requestAnimationFrame: targetWindow.requestAnimationFrame.bind(targetWindow),
    cancelAnimationFrame: targetWindow.cancelAnimationFrame.bind(targetWindow),
    getComputedStyle: targetWindow.getComputedStyle.bind(targetWindow),
  };
  for (const [name, value] of Object.entries(browserGlobals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
}
installBrowserGlobals(window, fetchStub);

function assert(condition, message) {
  if (!condition) throw new Error(`E2E assertion failed: ${message}`);
}

function builtEntrypoint(prefix) {
  const filename = files.find((file) => file.startsWith(`${prefix}.astro`) && file.endsWith('.js'));
  if (!filename) throw new Error(`Built ${prefix} entrypoint was not found.`);
  return pathToFileURL(resolve(join(distDir, filename))).href;
}

await import(pathToFileURL(resolve(join(distDir, simJs))).href);
await new Promise((resolveLoad) => setTimeout(resolveLoad, 0));

console.log('=== Testing PoE2 Item Import ===\n');
assert(window.document.getElementById('main-ui'), 'simulator main UI contract is missing');
assert(window.document.getElementById('omen-search'), 'omen search control is missing');
assert(window.document.getElementById('omen-clear-all'), 'omen clear control is missing');

// 1. Open paste modal
const pasteBtn = window.document.getElementById('paste-btn') || window.document.getElementById('paste-empty-btn');
if (pasteBtn) pasteBtn.click();
const pasteModal = window.document.getElementById('paste-modal');
console.log('Paste modal opened:', !pasteModal.classList.contains('hidden'));
assert(pasteModal && !pasteModal.classList.contains('hidden'), 'paste modal did not open');

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
assert(detected?.textContent?.includes(MALICIOUS_MARKUP), 'malicious item name was not rendered as text');
assert(detected?.textContent?.includes('Matched'), 'pasted base was not matched');
assert(!detected?.classList.contains('hidden'), 'paste detection remained visually hidden');
assert(error?.classList.contains('hidden'), 'paste error was visible for the valid fixture');
assert(!window.document.getElementById('seo-xss-fixture'), 'pasted markup escaped into the DOM');

// 4. Click Import
const importBtn = window.document.getElementById('import-paste-btn') || window.document.getElementById('paste-import');
console.log('Import button disabled:', importBtn?.disabled);
assert(importBtn && !importBtn.disabled, 'valid paste import remained disabled');

if (importBtn && !importBtn.disabled) {
  importBtn.click();
  await new Promise((r) => setTimeout(r, 100));
}
assert(
  !window.document.getElementById('main-ui')?.classList.contains('hidden'),
  'simulator main UI did not become visible after import',
);

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

assert(itemName === 'Gold Ring', `expected Gold Ring, got ${itemName}`);
assert(modRows.length === 7, `expected exactly 7 mod rows, got ${modRows.length}`);
for (const expectedText of [
  'increased Rarity of Items found',
  'Physical Damage to Attacks',
  'all Elemental Resistances',
]) {
  assert(
    [...modRows].some((row) => row.textContent?.includes(expectedText)),
    `representative modifier was not rendered: ${expectedText}`,
  );
}

const hostileCurrency = window.document.querySelector('[data-original-id="exalted_orb"]');
assert(hostileCurrency, 'hostile currency fixture was not rendered');
assert(
  hostileCurrency.getAttribute('aria-label')?.includes(MALICIOUS_MARKUP),
  'currency name did not round-trip through the escaped attribute',
);
assert(!hostileCurrency.querySelector('[onerror]'), 'currency fixture created an event-handler attribute');
assert(!window.document.getElementById('seo-xss-fixture'), 'currency markup escaped into the DOM');

window.document.getElementById('open-omens-btn')?.click();
const hostileOmen = [...window.document.querySelectorAll('.omen-btn')]
  .find((button) => button.dataset.omen === hostileOmenId);
assert(hostileOmen, 'hostile omen fixture was not rendered');
assert(
  hostileOmen.getAttribute('aria-label') === MALICIOUS_MARKUP,
  'omen name did not round-trip through the escaped attribute',
);
assert(!hostileOmen.querySelector('[onerror]'), 'omen fixture created an event-handler attribute');
assert(!window.document.getElementById('seo-xss-fixture'), 'omen markup escaped into the DOM');

console.log('\n✓ PASS: simulator import rendered exactly 7 mods and contained malicious data');

async function runCalculatorInjectionFixture() {
  const html = await readFile('dist/calculator/index.html', 'utf8');
  const calculatorDom = new JSDOM(html, {
    url: 'http://localhost:4321/calculator/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const base = {
    ...simData.bases.find((item) => item.slot === 'ring'),
    name: MALICIOUS_MARKUP,
  };
  assert(base.id, 'calculator base fixture was not found');
  const maliciousModId = `mod-${MALICIOUS_MARKUP}`;
  const maliciousMod = {
    id: maliciousModId,
    name: MALICIOUS_MARKUP,
    description: MALICIOUS_MARKUP,
    type: 'prefix',
    domain: [base.slot],
    tier: 1,
    level: 1,
    tags: [],
  };
  const responses = new Map([
    ['/data/bases.json', [base]],
    ['/data/mods.json', [maliciousMod]],
    ['/data/weights.json', []],
  ]);
  const calculatorFetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    return responses.has(url)
      ? { ok: true, status: 200, json: async () => responses.get(url) }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  calculatorDom.window.fetch = calculatorFetch;
  installBrowserGlobals(calculatorDom.window, calculatorFetch);
  await import(builtEntrypoint('calculator'));
  await new Promise((resolveLoad) => setTimeout(resolveLoad, 0));

  const baseSelect = calculatorDom.window.document.getElementById('base');
  assert(baseSelect.options[1]?.textContent === MALICIOUS_MARKUP, 'base option was not rendered as text');
  baseSelect.value = base.id;
  baseSelect.dispatchEvent(new calculatorDom.window.Event('change', { bubbles: true }));
  const search = calculatorDom.window.document.getElementById('mod-search');
  search.value = 'seo-xss';
  search.dispatchEvent(new calculatorDom.window.Event('input', { bubbles: true }));

  const result = calculatorDom.window.document.querySelector('.mod-item');
  assert(result, 'malicious modifier fixture was not rendered');
  assert(result.dataset.modId === maliciousModId, 'modifier ID did not round-trip safely');
  assert(result.textContent.includes(MALICIOUS_MARKUP), 'modifier description was not rendered as text');
  assert(!calculatorDom.window.document.getElementById('seo-xss-fixture'), 'calculator markup escaped into the DOM');
  assert(!result.querySelector('[onerror]'), 'calculator fixture created an event-handler attribute');
  calculatorDom.window.close();
}

async function runOptimizerInjectionFixture() {
  const html = await readFile('dist/optimizer/index.html', 'utf8');
  const optimizerDom = new JSDOM(html, {
    url: 'http://localhost:4321/optimizer/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const base = {
    ...simData.bases.find((item) => item.slot === 'ring'),
    name: MALICIOUS_MARKUP,
  };
  const responses = new Map([
    ['/data/bases.json', [base]],
    ['/data/mods.json', []],
    ['/data/currency.json', []],
    ['/api/prices', {}],
  ]);
  const optimizerFetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    return responses.has(url)
      ? { ok: true, status: 200, json: async () => responses.get(url) }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  optimizerDom.window.fetch = optimizerFetch;
  installBrowserGlobals(optimizerDom.window, optimizerFetch);
  await import(builtEntrypoint('optimizer'));
  await new Promise((resolveLoad) => setTimeout(resolveLoad, 0));

  const paste = optimizerDom.window.document.getElementById('paste-area');
  paste.value = `Item Class: Rings\nRarity: Rare\nFixture Name\n${MALICIOUS_MARKUP}\n--------\nItem Level: 80`;
  paste.dispatchEvent(new optimizerDom.window.Event('input', { bubbles: true }));
  const detectedBase = optimizerDom.window.document.getElementById('detected-base');
  assert(
    detectedBase.textContent === `${MALICIOUS_MARKUP} — 0 affixes`,
    'optimizer base name was not rendered as text',
  );
  assert(!optimizerDom.window.document.getElementById('seo-xss-fixture'), 'optimizer markup escaped into the DOM');
  optimizerDom.window.close();
}

await runCalculatorInjectionFixture();
await runOptimizerInjectionFixture();
window.close();
console.log('✓ PASS: simulator, calculator, and optimizer rejected executable fixture markup');
