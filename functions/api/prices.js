// functions/api/prices.js
// Cloudflare Pages Function — proxies api.poe2scout.com with caching.
// When deployed, this runs on Cloudflare's edge network.
// In local dev, Astro can also serve it if configured, but the client-side
// code falls back to /data/prices.json for local dev.

const SCOUT_BASE = 'https://api.poe2scout.com';
const REALM = 'poe2';
const LEAGUE = 'Runes of Aldur';

// poe2scout apiId → our currency ID
const API_ID_MAP = {
  'divine': 'divine_orb', 'exalted': 'exalted_orb', 'chaos': 'chaos_orb',
  'mirror': 'mirror_of_kalandra', 'annul': 'orb_of_annulment',
  'vaal': 'vaal_orb', 'chance': 'orb_of_chance', 'alch': 'orb_of_alchemy',
  'regal': 'regal_orb', 'aug': 'orb_of_augmentation',
  'transmute': 'orb_of_transmutation', 'fracturing-orb': 'fracturing_orb',
  'hinekoras-lock': 'hinekoras_lock', 'scrap': 'armourers_scrap',
  'whetstone': 'blacksmiths_whetstone', 'bauble': 'glassblowers_bauble',
  'gcp': 'gemcutters_prism', 'etcher': 'arcanists_etcher',
  'artificers': 'artificers_orb', 'wisdom': 'scroll_of_wisdom',
  'regal-shard': 'regal_shard', 'transmutation-shard': 'transmutation_shard',
  'chance-shard': 'chance_shard', 'artificers-shard': 'artificers_shard',
  'lesser-jewellers-orb': 'lesser_jewellers_orb',
  'greater-jewellers-orb': 'greater_jewellers_orb',
  'perfect-jewellers-orb': 'perfect_jewellers_orb',
  'greater-exalted-orb': 'greater_exalted_orb',
  'perfect-exalted-orb': 'perfect_exalted_orb',
  'greater-chaos-orb': 'greater_chaos_orb',
  'perfect-chaos-orb': 'perfect_chaos_orb',
  'greater-regal-orb': 'greater_regal_orb',
  'perfect-regal-orb': 'perfect_regal_orb',
  'greater-orb-of-augmentation': 'greater_orb_of_augmentation',
  'perfect-orb-of-augmentation': 'perfect_orb_of_augmentation',
  'greater-orb-of-transmutation': 'greater_orb_of_transmutation',
  'perfect-orb-of-transmutation': 'perfect_orb_of_transmutation',
  'cryptic-key': 'cryptic_key',
};

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request('https://craftclass/api/prices', { method: 'GET' });

  // Try cache first (5 min TTL)
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    // Fetch leagues for divine price
    const leaguesRes = await fetch(`${SCOUT_BASE}/${REALM}/Leagues`);
    if (!leaguesRes.ok) throw new Error(`Leagues API: ${leaguesRes.status}`);
    const leagues = await leaguesRes.json();
    const current = leagues.find((l) => l.Value === LEAGUE);
    if (!current) throw new Error(`League "${LEAGUE}" not found`);

    const divineChaos = current.ChaosDivinePrice;
    const exaltChaos = divineChaos / current.DivinePrice; // exalts → chaos

    // Fetch currency items
    const currencyUrl = `${SCOUT_BASE}/${REALM}/Leagues/${encodeURIComponent(LEAGUE)}/Currencies/ByCategory?category=currency&perPage=200`;
    const currencyRes = await fetch(currencyUrl);
    if (!currencyRes.ok) throw new Error(`Currency API: ${currencyRes.status}`);
    const currencyData = await currencyRes.json();
    const items = currencyData.Items || currencyData.items || [];

    // Build prices in chaos equivalents
    const prices = {};
    for (const item of items) {
      const apiId = item.ApiId || item.apiId;
      const basePrice = item.CurrentPrice || item.currentPrice;
      if (typeof basePrice !== 'number' || basePrice <= 0) continue;
      const ourId = API_ID_MAP[apiId];
      if (ourId) {
        prices[ourId] = parseFloat((basePrice * exaltChaos).toFixed(6));
      }
    }

    // Ensure core currencies
    if (!prices.divine_orb) prices.divine_orb = divineChaos;
    if (!prices.exalted_orb) prices.exalted_orb = exaltChaos;
    if (!prices.chaos_orb) prices.chaos_orb = 1;

    const body = JSON.stringify({
      prices,
      divinePrice: prices.divine_orb,
      exaltPrice: prices.exalted_orb,
      chaosPrice: 1,
      chaosPerDivine: prices.divine_orb,
      chaosPerExalt: prices.exalted_orb,
      fetchedAt: new Date().toISOString(),
      source: 'poe2scout',
      league: current.Value,
    });

    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });

    await cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    // Return a 502 with fallback prices
    const fallback = {
      error: err.message,
      prices: { divine_orb: 7.5, exalted_orb: 0.0177, chaos_orb: 1 },
      divinePrice: 7.5,
      exaltPrice: 0.0177,
      chaosPrice: 1,
      chaosPerDivine: 7.5,
      chaosPerExalt: 0.0177,
      fetchedAt: new Date().toISOString(),
      source: 'fallback',
      league: 'Runes of Aldur',
    };
    return new Response(JSON.stringify(fallback), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
