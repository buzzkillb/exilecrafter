// functions/api/prices.ts
// Cloudflare Pages Function — live PoE2 currency prices from poe2scout API.
// Caches at the edge for 6 hours. All prices in chaos-equivalent values.
// Response shape matches the old build-time prices.json so no client changes needed.

const SCOUT_BASE = 'https://api.poe2scout.com';
const REALM = 'poe2';
const SIX_HOURS = 21600;

// poe2scout ApiId → our currency id (lowercase, no hynphens, underscores)
const ID_MAP: Record<string, string> = {
  'mirror': 'mirror_of_kalandra',
  'hinekoras-lock': 'hinekoras_lock',
  'fracturing-orb': 'fracturing_orb',
  'divine': 'divine_orb',
  'exalted': 'exalted_orb',
  'chaos': 'chaos_orb',
  'annul': 'orb_of_annulment',
  'vaal': 'vaal_orb',
  'alch': 'orb_of_alchemy',
  'regal': 'regal_orb',
  'transmute': 'orb_of_transmutation',
  'aug': 'orb_of_augmentation',
  'chance': 'orb_of_chance',
  'whetstone': 'blacksmiths_whetstone',
  'scrap': 'armourers_scrap',
  'wisdom': 'scroll_of_wisdom',
  'bauble': 'glassblowers_bauble',
  'gcp': 'gemcutters_prism',
  'etcher': 'arcanists_etcher',
  'artificers': 'artificers_orb',
  'artificers-shard': 'artificers_shard',
  'regal-shard': 'regal_shard',
  'transmutation-shard': 'transmutation_shard',
  'chance-shard': 'chance_shard',
  'ancient-orb': 'ancient_orb',
  // Tier variants
  'greater-chaos-orb': 'greater_chaos_orb',
  'greater-exalted-orb': 'greater_exalted_orb',
  'greater-regal-orb': 'greater_regal_orb',
  'greater-orb-of-augmentation': 'greater_orb_of_augmentation',
  'greater-orb-of-transmutation': 'greater_orb_of_transmutation',
  'perfect-chaos-orb': 'perfect_chaos_orb',
  'perfect-exalted-orb': 'perfect_exalted_orb',
  'perfect-regal-orb': 'perfect_regal_orb',
  'perfect-orb-of-augmentation': 'perfect_orb_of_augmentation',
  'perfect-orb-of-transmutation': 'perfect_orb_of_transmutation',
};

const CATEGORIES = ['Currency', 'Essence', 'Delirium', 'Breach', 'Catalyst', 'Ritual', 'Incursion'];

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json();
}

export async function onRequest(context: EventContext<any, any, any>): Promise<Response> {
  const cache = caches.default;
  const cachedResp = await cache.match(new Request(context.request));
  if (cachedResp) return cachedResp;

  try {
    // 1. Fetch league to find current league + exchange rates
    const leaguesRaw = await fetchJSON(`${SCOUT_BASE}/${REALM}/Leagues`);
    const leagues = Array.isArray(leaguesRaw) ? leaguesRaw : [];
    const current = leagues.find((l: any) => l.IsCurrent === true);
    const leagueName = current?.Value || 'Runes of Aldur';

    // Exchange rates from league data
    // ChaosDivinePrice = divine in chaos, DivinePrice = divine in exalts
    const chaosPerDivine = current?.ChaosDivinePrice || 7.88;
    const exaltsPerDivine = current?.DivinePrice || 415;
    const exaltsPerChaos = exaltsPerDivine / chaosPerDivine; // ~52.7
    const chaosPerExalt = chaosPerDivine / exaltsPerDivine;  // ~0.019

    // 2. Fetch ALL currency categories from poe2scout
    const allItems: Array<{ apiId: string; text: string; priceExalts: number }> = [];
    for (const cat of CATEGORIES) {
      const url = `${SCOUT_BASE}/${REALM}/Leagues/${encodeURIComponent(leagueName)}/Currencies/ByCategory?category=${encodeURIComponent(cat)}&perPage=200`;
      const data = await fetchJSON(url);
      if (!data?.Items) continue;
      for (const i of data.Items) {
        const p = i.CurrentPrice ?? 0;
        if (p > 0 && i.ApiId) {
          allItems.push({ apiId: i.ApiId, text: i.Text || '', priceExalts: p });
        }
      }
    }

    // 3. Build price map. poe2scout prices are in exalts — convert to chaos.
    const prices: Record<string, number> = {};
    for (const item of allItems) {
      let id = ID_MAP[item.apiId];
      if (!id) id = item.apiId.replace(/-/g, '_');
      if (item.priceExalts > 0) {
        const chaos = item.priceExalts * chaosPerExalt;
        if (!prices[id] || prices[id] < chaos) prices[id] = chaos;
      }
    }

    // 4. Ensure core craftable currencies always exist
    if (!prices.divine_orb) prices.divine_orb = chaosPerDivine;
    if (!prices.exalted_orb) prices.exalted_orb = chaosPerExalt;
    if (!prices.chaos_orb) prices.chaos_orb = 1;
    if (!prices.orb_of_alchemy) prices.orb_of_alchemy = (allItems.find(i => i.apiId === 'alch')?.priceExalts ?? 0.96) * chaosPerExalt;
    if (!prices.orb_of_annulment) prices.orb_of_annulment = (allItems.find(i => i.apiId === 'annul')?.priceExalts ?? 196) * chaosPerExalt;
    if (!prices.vaal_orb) prices.vaal_orb = (allItems.find(i => i.apiId === 'vaal')?.priceExalts ?? 3.27) * chaosPerExalt;
    if (!prices.regal_orb) prices.regal_orb = (allItems.find(i => i.apiId === 'regal')?.priceExalts ?? 0.58) * chaosPerExalt;
    if (!prices.orb_of_transmutation) prices.orb_of_transmutation = (allItems.find(i => i.apiId === 'transmute')?.priceExalts ?? 0.24) * chaosPerExalt;
    if (!prices.orb_of_augmentation) prices.orb_of_augmentation = (allItems.find(i => i.apiId === 'aug')?.priceExalts ?? 0.34) * chaosPerExalt;
    if (!prices.orb_of_chance) prices.orb_of_chance = (allItems.find(i => i.apiId === 'chance')?.priceExalts ?? 6) * chaosPerExalt;
    if (!prices.fracturing_orb) prices.fracturing_orb = (allItems.find(i => i.apiId === 'fracturing-orb')?.priceExalts ?? 4275) * chaosPerExalt;

    // Tier variants: greater_ = base × ~2.5, perfect_ = base × ~5
    for (const [apiId, ourId] of Object.entries(ID_MAP)) {
      if (!apiId.startsWith('greater-') && !apiId.startsWith('perfect-')) continue;
      const baseId = ourId.replace(/^(greater_|perfect_)/, '');
      const base = prices[baseId];
      if (base && !prices[ourId]) {
        prices[ourId] = apiId.startsWith('greater-') ? base * 2.5 : base * 5;
      }
    }

    // 5. Build flat response matching old /data/prices.json shape
    const body = JSON.stringify({
      ...prices,
      _meta: {
        league: leagueName,
        fetchedAt: new Date().toISOString(),
        source: `poe2scout (${allItems.length} items from API)`,
        chaosPerDivine: Math.round(chaosPerDivine * 10) / 10,
        chaosPerExalt: Math.round(chaosPerExalt * 1000) / 1000,
        exaltsPerDivine: Math.round(exaltsPerDivine * 10) / 10,
        chaosPerExalt: Math.round(chaosPerExalt * 1000) / 1000,
      },
    });

    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${SIX_HOURS}`,
        'Access-Control-Allow-Origin': '*',
      },
    });

    context.waitUntil(cache.put(new Request(context.request), response.clone()));
    return response;
  } catch (err) {
    const fallback = {
      divine_orb: 7.88, exalted_orb: 0.019, chaos_orb: 1,
      orb_of_alchemy: 0.018, orb_of_annulment: 3.73, vaal_orb: 0.062,
      regal_orb: 0.011, orb_of_transmutation: 0.0046, orb_of_augmentation: 0.0065,
      orb_of_chance: 0.114,
      _meta: {
        league: 'Runes of Aldur',
        fetchedAt: new Date().toISOString(),
        source: 'fallback',
        chaosPerDivine: 7.88,
        chaosPerExalt: 0.019,
        exaltsPerDivine: 415,
        chaosPerExalt: 0.019,
      },
    };
    return new Response(JSON.stringify(fallback), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
