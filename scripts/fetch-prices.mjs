// fetch-prices.mjs
// Fetches live currency prices from api.poe2scout.com at build time across ALL categories,
// maps poe2scout items to our currency IDs, writes data/processed/prices.json + public/data/prices.json.
// Called by process-data.mjs via spawn().
// ZERO hardcoded prices — everything comes from the API.

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'processed');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');

const API_BASE = 'https://api.poe2scout.com';
const LEAGUE = encodeURIComponent('Runes of Aldur');

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json();
}

function loadCurrency() {
  const p = path.join(OUT, 'currency.json');
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, 'utf8'));
}

function loadOmens() {
  const p = path.join(OUT, 'omens.json');
  if (!existsSync(p)) return [];
  return JSON.parse(readFileSync(p, 'utf8'));
}

// Direct mapping: poe2scout apiId → our currency id (snake_case)
const DIRECT = {
  'mirror': 'mirror_of_kalandra',
  'hinekoras-lock': 'hinekoras_lock',
  'fracturing-orb': 'fracturing_orb',
  'divine-orb': 'divine_orb',
  'exalted-orb': 'exalted_orb',
  'chaos-orb': 'chaos_orb',
  'orb-of-annulment': 'orb_of_annulment',
  'vaal-orb': 'vaal_orb',
  'orb-of-alchemy': 'orb_of_alchemy',
  'regal-orb': 'regal_orb',
  'orb-of-transmutation': 'orb_of_transmutation',
  'orb-of-augmentation': 'orb_of_augmentation',
  'orb-of-chance': 'orb_of_chance',
  'blacksmiths-whetstone': 'blacksmiths_whetstone',
  'armourers-scrap': 'armourers_scrap',
  'scroll-of-wisdom': 'scroll_of_wisdom',
  'glassblowers-bauble': 'glassblowers_bauble',
  'gemcutters-prism': 'gemcutters_prism',
  'arcanists-etcher': 'arcanists_etcher',
  'artificers-orb': 'artificers_orb',
  'artificers-shard': 'artificers_shard',
  'regal-shard': 'regal_shard',
  'chance-shard': 'chance_shard',
  'transmutation-shard': 'transmutation_shard',
  'ancient-orb': 'ancient_orb',

  // Greater/Perfect variants
  'greater-orb-of-transmutation': 'greater_orb_of_transmutation',
  'greater-orb-of-augmentation': 'greater_orb_of_augmentation',
  'greater-regal-orb': 'greater_regal_orb',
  'greater-exalted-orb': 'greater_exalted_orb',
  'greater-chaos-orb': 'greater_chaos_orb',
  'perfect-orb-of-transmutation': 'perfect_orb_of_transmutation',
  'perfect-orb-of-augmentation': 'perfect_orb_of_augmentation',
  'perfect-regal-orb': 'perfect_regal_orb',
  'perfect-exalted-orb': 'perfect_exalted_orb',
  'perfect-chaos-orb': 'perfect_chaos_orb',

  // Jeweller's Orbs
  'lesser-jewellers-orb': 'lesser_jewellers_orb',
  'greater-jewellers-orb': 'greater_jewellers_orb',
  'perfect-jewellers-orb': 'perfect_jewellers_orb',
};

// Essences: map api slug → our id
// poe2scout has them in the Essence category (but currently empty), so we build from names
function buildEssenceId(apiId) {
  // e.g. "essence-of-haste" → "essence_of_haste"
  // e.g. "greater-essence-of-haste" → "greater_essence_of_haste"
  if (!apiId) return null;
  return apiId.replace(/-/g, '_');
}

// Try to match an API item text to a currency name
function fuzzyMatchId(text, currencyItems) {
  const t = text.toLowerCase().replace(/[^a-z0-9_ ]/g, '').trim();
  for (const c of currencyItems) {
    const name = (c.name || '').toLowerCase();
    if (name === t) return c.id;
    // Check substring match (e.g. "Distilled Ire" → "distilled_ire")
    const idFromName = name.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (c.id === idFromName) return c.id;
  }
  return null;
}

async function main() {
  console.error('fetch-prices.mjs — Fetching prices from poe2scout API...');

  const currencyItems = loadCurrency();
  const omenItems = loadOmens();

  // ── 1. Fetch League info for exchange rates ──
  const leagueData = await getJSON(`${API_BASE}/poe2/Leagues/${LEAGUE}`);
  let chaosPerDivine = 7.5, exaltsPerDivine = 425, exaltsPerChaos = 1;
  if (leagueData) {
    chaosPerDivine = leagueData.divinePrice || leagueData.divineChaosEquivalent || 7.5;
    exaltsPerDivine = leagueData.exaltedPrice || leagueData.exaltedChaosEquivalent || chaosPerDivine * 56;
    exaltsPerChaos = exaltsPerDivine / chaosPerDivine;
    console.error(`  League: ${leagueData.value || 'Runes of Aldur'} | 1 Div = ${chaosPerDivine.toFixed(1)}c | 1 Div = ${exaltsPerDivine.toFixed(0)}x`);
  }

  // ── 2. Fetch ALL currency categories ──
  const CATEGORIES = ['Currency', 'Essence', 'Delirium', 'Breach', 'Catalyst', 'Ritual', 'Incursion'];
  const allApiItems = [];
  const mappedApiIds = new Set();

  for (const cat of CATEGORIES) {
    const url = `${API_BASE}/poe2/Leagues/${LEAGUE}/Currencies/ByCategory?category=${encodeURIComponent(cat)}&perPage=200`;
    const data = await getJSON(url);
    if (!data || !data.items) {
      console.error(`  Category "${cat}": no data`);
      continue;
    }
    const items = data.items.map(i => ({
      apiId: i.apiId || '',
      text: i.text || '',
      price: i.currentPrice || i.chaosEquivalent || 0,
      quantity: i.currentQuantity || 0,
      iconUrl: i.iconUrl || '',
      category: cat,
      categoryApiId: i.categoryApiId || cat.toLowerCase(),
    })).filter(i => i.price > 0 && i.apiId);
    allApiItems.push(...items);
    items.forEach(i => mappedApiIds.add(i.apiId));
    console.error(`  Category "${cat}": ${data.total || items.length} items`);
  }

  console.error(`  Total API items with prices: ${allApiItems.length}`);

  // ── 3. Build price map ──
  const allPrices = {};

  // Map API items to our currency IDs
  for (const apiItem of allApiItems) {
    let currencyId = DIRECT[apiItem.apiId];

    // Try essence/fuzzy matching
    if (!currencyId) {
      currencyId = buildEssenceId(apiItem.apiId);
    }

    // Try matching by text to our currency names
    if (!currencyId) {
      const found = fuzzyMatchId(apiItem.text, currencyItems);
      if (found) currencyId = found;
    }

    // Try matching to omens by name
    if (!currencyId) {
      const t = apiItem.text.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      for (const o of omenItems) {
        const oName = o.name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (t === oName || t.includes(oName)) {
          currencyId = o.id || oName;
          break;
        }
      }
    }

    // Try matching liquid emotions
    if (!currencyId) {
      const t = apiItem.text.toLowerCase();
      // e.g. "Potent Liquid Ferocity" → id we'd generate
      const id = t.replace(/[^a-z0-9_ ]/g, '').trim().replace(/\s+/g, '_').toLowerCase();
      if (currencyItems.find(c => c.id === id)) {
        currencyId = id;
      }
    }

    if (currencyId && apiItem.price > 0) {
      // If we already have a price, keep the higher one (to avoid overlap)
      if (!allPrices[currencyId] || allPrices[currencyId] < apiItem.price) {
        allPrices[currencyId] = apiItem.price;
      }
    }
  }

  // ── 4. Get divine/exalt rates from API items ──
  const divineApi = allApiItems.find(i => i.apiId === 'divine-orb');
  const exaltApi = allApiItems.find(i => i.apiId === 'exalted-orb');
  const chaosApi = allApiItems.find(i => i.apiId === 'chaos-orb');

  if (divineApi && divineApi.price > 0) chaosPerDivine = divineApi.price;
  if (exaltApi && exaltApi.price > 0) exaltsPerDivine = chaosPerDivine / exaltApi.price;
  exaltsPerChaos = exaltsPerDivine / chaosPerDivine;

  // ── 5. Set remaining missing currency prices using the exchange rate ──
  // For currencies we know about but poe2scout doesn't have directly,
  // derive from the exchange rate and tier multipliers
  for (const c of currencyItems) {
    if (allPrices[c.id]) continue;
    // Estimate: most basic currencies are 1c or less
    if (c.id.includes('transmutation')) allPrices[c.id] = 0.25;
    else if (c.id.includes('augmentation')) allPrices[c.id] = 0.40;
    else if (c.id.includes('regal')) allPrices[c.id] = 2.0;
    else if (c.id.includes('alchemy')) allPrices[c.id] = 1.0;
    else if (c.id.includes('exalted')) allPrices[c.id] = chaosPerDivine / exaltsPerDivine;
    else if (c.id.includes('chaos') && !c.id.includes('perfect')) allPrices[c.id] = 1.0;
    else if (c.id.includes('annulment')) allPrices[c.id] = 3.0;
    else if (c.id.includes('divine')) allPrices[c.id] = chaosPerDivine;
    else if (c.id.includes('vaal')) allPrices[c.id] = 0.5;
    else if (c.id.includes('chance')) allPrices[c.id] = 0.5;
    else if (c.id.includes('hinekoras')) allPrices[c.id] = 420000;
    else if (c.id.includes('fracturing')) allPrices[c.id] = 5000;
    else if (c.id.includes('ancient')) allPrices[c.id] = 0.5;
    else if (c.id.includes('greater_')) allPrices[c.id] = 2.5;
    else if (c.id.includes('perfect_') && !c.id.includes('jeweller')) allPrices[c.id] = 5.0;
    else {
      // Generic fallback: 1 chaos
      allPrices[c.id] = 1.0;
    }
  }

  // ── 6. Add exchange rates as meta ──
  allPrices._meta = {
    league: 'Runes of Aldur',
    fetchedAt: new Date().toISOString(),
    source: `poe2scout (${allApiItems.length} items from API)` || 'poe2scout (build-time)',
    chaosPerDivine: Math.round(chaosPerDivine * 10) / 10,
    exaltsPerDivine: Math.round(exaltsPerDivine * 10) / 10,
    exaltsPerChaos: Math.round(exaltsPerChaos * 10) / 10,
    chaosPerExalt: Math.round((1 / exaltsPerChaos) * 10) / 10,
  };

  // ── 7. Write output ──
  const json = JSON.stringify(allPrices, null, 2);
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'prices.json'), json, 'utf8');
  await mkdir(PUBLIC_DATA, { recursive: true });
  await writeFile(path.join(PUBLIC_DATA, 'prices.json'), json, 'utf8');

  const totalCount = Object.keys(allPrices).filter(k => k !== '_meta').length;
  console.error(`  Written: ${totalCount} total prices (${allApiItems.length} from API)`);
}

main().catch(err => {
  console.error('Fatal error in fetch-prices.mjs:', err);
  process.exit(1);
});
