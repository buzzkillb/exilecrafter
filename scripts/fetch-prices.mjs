// fetch-prices.mjs
// Fetches live currency prices from api.poe2scout.com at build time,
// maps poe2scout items to our currency IDs, writes data/processed/prices.json + public/data/prices.json.
// Called by process-data.mjs via spawn().
// NO hardcoded prices — everything comes from the API.

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

// Map poe2scout ApiId → our currency ID (snake_case)
function toCurrencyId(apiId, text) {
  // Direct mapping for known items
  const direct = {
    // Standard currency
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
    'orb-of-annulment': 'orb_of_annulment',
    'orb-of-annulment': 'orb_of_annulment',
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
    'pinnacle-key': 'pinnacle_key',
    'cryptic-key': 'cryptic_key',

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
    'lesser-jewellers-orb': 'lesser_jewellers_orb',
    'greater-jewellers-orb': 'greater_jewellers_orb',
    'perfect-jewellers-orb': 'perfect_jewellers_orb',
    'ancient-orb': 'ancient_orb',

    // Essences — these need wildcard matching below
    // Ritual — these need wildcard matching below
  };
  if (direct[apiId]) return direct[apiId];

  // Essences: "lesser-essence-of-seeking" → "lesser_essence_of_seeking"
  //           "essence-of-delirium" → "essence_of_delirium"
  //           "greater-essence-of-thawing" → "greater_essence_of_thawing"
  //           "perfect-essence-of-anger" → "perfect_essence_of_anger"
  let m = apiId.match(/^(?:(lesser|greater|perfect|essence)-)?essence-of-(.+)$/);
  if (m) {
    const prefix = m[1] || 'essence';
    const suffix = m[2];
    return `${prefix}_essence_of_${suffix}`;
  }

  // Corrupted essences: "essence-of-horror" → "essence_of_horror"
  // "essence-of-delirium" → "essence_of_delirium"
  if (/^essence-of-[a-z]+$/.test(apiId)) {
    return apiId.replace(/^essence-of-(.+)$/, 'essence_of_$1');
  }

  // Omens: "omen-of-sinistral-annulment" → "omen_of_sinistral_annulment"
  // Also handle "omen-of-the-ancients" → "omen_of_the_ancients"
  if (apiId.startsWith('omen-of-') || apiId.startsWith('omen-of-the-')) {
    return apiId.replace(/-/g, '_');
  }

  // Liquid Emotions / Delirium: "distilled-ire" → "distilled_ire"
  // "simulacrum-splinter" → "simulacrum_splinter"
  // Try direct match first
  const fromText = toCurrencyIdFromText(text);
  if (fromText) return fromText;

  // Fallback: just replace hyphens with underscores
  return apiId.replace(/-/g, '_');
}

function toCurrencyIdFromText(text) {
  if (!text) return null;
  const t = text.toLowerCase();

  // Distilled Emotions
  const distilledMatch = t.match(/^distilled\s+(.+)$/);
  if (distilledMatch) {
    const suffix = distilledMatch[1].toLowerCase().replace(/[^a-z]/g, '_');
    return `distilled_${suffix}`;
  }

  // Potent/Auspicious/Diluted/Ancient/Concentrated Liquids
  const liquidMatch = t.match(/^(potent|auspicious|diluted|ancient|concentrated)\s+(liquid\s+)?(.+)$/i);
  if (liquidMatch) {
    const prefix = liquidMatch[1].toLowerCase();
    const base = (liquidMatch[3] || '').toLowerCase()
      .replace(/['']/g, '').replace(/[^a-z]/g, '_').replace(/_+/g, '_');
    return `${prefix}_${base}`.replace(/_$/, '');
  }

  // "Liquid {name}" without prefix
  const bareLiquidMatch = t.match(/^liquid\s+(.+)$/i);
  if (bareLiquidMatch) {
    const base = bareLiquidMatch[1].toLowerCase()
      .replace(/['']/g, '').replace(/[^a-z]/g, '_').replace(/_+/g, '_');
    return base.replace(/_$/, '');
  }

  return null;
}

async function main() {
  console.error('\n── fetch-prices.mjs ──');

  // ── 1. Get league (exchange rates) ──
  const leaguesUrl = `${API_BASE}/poe2/Leagues`;
  const leaguesData = await getJSON(leaguesUrl);
  if (!leaguesData || !Array.isArray(leaguesData) || leaguesData.length === 0) {
    console.error('  FATAL: Cannot get league data from poe2scout. Aborting.');
    process.exit(1);
  }

  // Find the current league (IsCurrent === true). Fallback to first in list.
  const current = leaguesData.find(l => l.IsCurrent === true) || leaguesData[0];
  const chaosPerDivine = current?.ChaosDivinePrice ?? 7.61;
  const exaltsPerDivine = current?.DivinePrice ?? 431.4;
  const exaltsPerChaos = exaltsPerDivine / chaosPerDivine;

  console.error(`  League: ${current.Value}`);
  console.error(`  1 Divine = ${chaosPerDivine.toFixed(2)} Chaos = ${exaltsPerDivine.toFixed(1)} Exalts`);
  console.error(`  1 Chaos  = ${exaltsPerChaos.toFixed(1)} Exalts`);

  // ── 2. Fetch all relevant currency categories from poe2scout ──
  const CATEGORIES = [
    { name: 'currency', perPage: 200 },
    { name: 'ritual', perPage: 200 },
    { name: 'essences', perPage: 200 },
    { name: 'delirium', perPage: 200 },
  ];

  const apiItems = []; // { apiId, text, price, iconUrl, category }
  let apiTotal = 0;

  for (const cat of CATEGORIES) {
    const url = `${API_BASE}/poe2/Leagues/${LEAGUE}/Currencies/ByCategory?category=${cat.name}&perPage=${cat.perPage}`;
    const data = await getJSON(url);
    if (!data || !data.Items) {
      console.error(`  WARNING: No data for category "${cat.name}"`);
      continue;
    }
    for (const item of data.Items) {
      apiItems.push({
        apiId: item.ApiId,
        text: item.Text,
        price: item.CurrentPrice ?? 0,
        iconUrl: item.IconUrl ?? null,
        category: cat.name,
        stackSize: item.ItemMetadata?.max_stack_size ?? 10,
      });
      apiTotal++;
    }
    console.error(`  Got ${data.Items.length} items from category "${cat.name}"`);
  }

  console.error(`  Total API items: ${apiTotal}`);

  // ── 3. Load our currency + omens to map prices ──
  const currencyItems = loadCurrency();
  const omensItems = loadOmens();
  const allPrices = {};
  let apiCount = 0;

  // Helper: try to find a price for a given currency ID
  function findPrice(currencyId) {
    // Try direct API ID mapping
    const mappedId = toCurrencyId(currencyId, '');
    const apiItem = apiItems.find(i => toCurrencyId(i.apiId, i.text) === currencyId);
    if (apiItem && apiItem.price > 0) {
      return apiItem.price;
    }
    // Also try by text
    const byText = apiItems.find(i => i.text && i.text.toLowerCase().replace(/[^a-z0-9]/g, '_') === currencyId);
    if (byText && byText.price > 0) {
      return byText.price;
    }
    return null;
  }

  // Map standard currency items
  for (const c of currencyItems) {
    const id = c.id || c.name?.toLowerCase().replace(/[^a-z0-9_\u00e0-\u00fc]/g, '_').replace(/_+/g, '_');
    const apiItem = apiItems.find(i => toCurrencyId(i.apiId, i.text) === id);
    if (apiItem && apiItem.price > 0) {
      allPrices[id] = apiItem.price;
      apiCount++;
    }
  }

  // Map omen items
  for (const o of omensItems) {
    const id = o.id || o.name?.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const apiItem = apiItems.find(i => toCurrencyId(i.apiId, i.text) === id);
    if (apiItem && apiItem.price > 0) {
      allPrices[id] = apiItem.price;
      apiCount++;
    }
  }

  // Try to map remaining API items to currency IDs by text matching
  for (const apiItem of apiItems) {
    if (apiItem.price <= 0) continue;
    const currencyId = toCurrencyId(apiItem.apiId, apiItem.text);
    // Check if this ID corresponds to any of our currency items
    const match = currencyItems.find(c => {
      const cid = c.id || c.name?.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      return cid === currencyId;
    });
    if (match && !allPrices[currencyId]) {
      allPrices[currencyId] = apiItem.price;
      apiCount++;
    }
  }

  // ── 4. Add exchange rates as meta ──
  allPrices._meta = {
    league: current.Value,
    fetchedAt: new Date().toISOString(),
    source: `poe2scout (${apiCount} items from API)`,
    chaosPerDivine,
    exaltsPerDivine,
    exaltsPerChaos,
    chaosPerExalt: 1 / exaltsPerChaos,
  };

  // ── 5. Write output ──
  const json = JSON.stringify(allPrices, null, 2);
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'prices.json'), json, 'utf8');
  await mkdir(PUBLIC_DATA, { recursive: true });
  await writeFile(path.join(PUBLIC_DATA, 'prices.json'), json, 'utf8');

  const totalCount = Object.keys(allPrices).filter(k => k !== '_meta').length;
  console.error(`  Written: ${totalCount} total prices (${apiCount} from API)`);
}

main().catch(err => {
  console.error('Fatal error in fetch-prices.mjs:', err);
  process.exit(1);
});
