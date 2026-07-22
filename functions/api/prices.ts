// functions/api/prices.ts
// Cloudflare Pages Function — live currency prices from poe2scout.
// Cache API stores the result for 6 hours, so this naturally refreshes
// ~4×/day on a small site without any cron trigger or KV namespace.
//
// Response shape matches the old build-time /data/prices.json exactly,
// so the cost-tracker and header price display work without any changes.

const SCOUT_BASE = 'https://api.poe2scout.com';
const REALM = 'poe2';
const LEAGUE = 'Runes of Aldur';
const SIX_HOURS = 21600;

// Direct mapping: poe2scout apiId → our currency id (snake_case)
const DIRECT_MAP: Record<string, string> = {
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
  'ancient-orb': 'ancient_orb',
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
};

const CATEGORIES = ['Currency', 'Essence', 'Delirium', 'Breach', 'Catalyst', 'Ritual', 'Incursion'];

async function fetchJSON(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return res.json();
}

function pluralForm(n: number): string {
  return ['s', '', '', '', '', 's'][n < 5 && n >= 0 ? n : 5] || '';
}

export async function onRequest(context: EventContext<any, any, any>): Promise<Response> {
  const cache = caches.default;

  // Check cache first
  const cachedResp = await cache.match(new Request(context.request));
  if (cachedResp) return cachedResp;

  try {
    // Fetch league for exchange rates + current league name
    const leagueUrl = `${SCOUT_BASE}/${REALM}/Leagues`;
    const leagues = await fetchJSON(leagueUrl);
    const current = Array.isArray(leagues) ? leagues.find((l: any) => l.value === LEAGUE || l.name === LEAGUE) : null;
    let chaosPerDivine = current?.divinePrice ?? current?.chaosDivinePrice ?? 7.5;
    let exaltsPerDivine = current?.exaltedPrice ?? current?.exaltedChaosEquivalent ?? chaosPerDivine * 56;
    let exaltsPerChaos = exaltsPerDivine / chaosPerDivine;

    // Fetch ALL currency categories
    const allApiItems: Array<{ apiId: string; text: string; price: number }> = [];
    for (const cat of CATEGORIES) {
      const url = `${SCOUT_BASE}/${REALM}/Leagues/${encodeURIComponent(LEAGUE)}/Currencies/ByCategory?category=${encodeURIComponent(cat)}&perPage=200`;
      const data = await fetchJSON(url);
      if (!data?.items) continue;
      for (const i of data.items) {
        const price = i.currentPrice ?? i.chaosEquivalent ?? 0;
        if (price > 0 && i.apiId) {
          allApiItems.push({ apiId: i.apiId, text: i.text || '', price });
        }
      }
    }

    // Build price map from API items
    const prices: Record<string, number> = {};
    for (const item of allApiItems) {
      let id = DIRECT_MAP[item.apiId];
      if (!id) id = item.apiId.replace(/-/g, '_'); // essence/generic fallback
      if (item.price > 0) {
        if (!prices[id] || prices[id] < item.price) prices[id] = item.price;
      }
    }

    // Extract exchange rates from API items
    const dApi = allApiItems.find((i) => i.apiId === 'divine-orb');
    const cApi = allApiItems.find((i) => i.apiId === 'chaos-orb');
    if (dApi?.price) chaosPerDivine = dApi.price;
    if (cApi?.price) chaosPerDivine = cApi.price; // chaos = 1c
    exaltsPerChaos = exaltsPerDivine / chaosPerDivine;

    // Ensure core currencies
    if (!prices.divine_orb) prices.divine_orb = chaosPerDivine;
    if (!prices.exalted_orb) prices.exalted_orb = exaltsPerDivine;
    if (!prices.chaos_orb) prices.chaos_orb = 1;

    // Estimate missing items via tier multipliers
    for (const cid of Object.keys(prices)) {
      if (prices[cid]) continue;
      const base = cid.replace(/^(greater_|perfect_|lesser_|corrupted_)/, '');
      if (cid.startsWith('greater_')) prices[cid] = (prices[base] ?? 1) * 2.5;
      else if (cid.startsWith('perfect_')) prices[cid] = (prices[base] ?? 1) * 5;
      else prices[cid] = 1;
    }

    // Build response object (flat top-level keys matching old /data/prices.json shape)
    const body = JSON.stringify({
      ...prices,
      _meta: {
        league: LEAGUE,
        fetchedAt: new Date().toISOString(),
        source: `poe2scout (${allApiItems.length} items from API)`,
        chaosPerDivine: Math.round(chaosPerDivine * 10) / 10,
        exaltsPerDivine: Math.round(exaltsPerDivine * 10) / 10,
        exaltsPerChaos: Math.round(exaltsPerChaos * 10) / 10,
        chaosPerExalt: Math.round((1 / exaltsPerChaos) * 10) / 10,
      },
    });

    const response = new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${SIX_HOURS}`,
        'Access-Control-Allow-Origin': '*',
      },
    });

    // Store in Edge Cache for 6 hours
    context.waitUntil(cache.put(new Request(context.request), response.clone()));

    return response;
  } catch (err) {
    const fallback = {
      prices: { divine_orb: 7.5, exalted_orb: 0.0177, chaos_orb: 1 },
      _meta: {
        league: LEAGUE,
        fetchedAt: new Date().toISOString(),
        source: 'fallback',
        chaosPerDivine: 7.5,
        exaltsPerDivine: 0,
        exaltsPerChaos: 0,
        chaosPerExalt: 0,
      },
    };
    return new Response(JSON.stringify(fallback), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
