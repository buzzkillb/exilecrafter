// Test poe2scout API endpoints
const BASE = 'https://api.poe2scout.com';
const LEAGUE = 'Runes of Aldur';

async function test() {
  const tests = [
    `${BASE}/poe2/Leagues`,
    `${BASE}/poe2/Leagues/${encodeURIComponent(LEAGUE)}/Currencies/ByCategory?category=currency&perPage=200`,
    `${BASE}/poe2/Leagues/Standard/Currencies/ByCategory?category=currency&perPage=200`,
    `${BASE}/Leagues?realm=poe2`,
    `${BASE}/api/leagues`,
    `${BASE}/api/items/currency/currency?league=${encodeURIComponent(LEAGUE)}`,
    'https://poe2scout.com/api/leagues',
  ];
  
  for (const url of tests) {
    try {
      const res = await fetch(url, { 
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      const text = await res.text();
      console.log(res.status, url);
      if (text.length > 0 && text.length < 1000) console.log('  ', text);
      else if (text.length > 0) console.log('  [body:', text.length, 'chars]');
    } catch(e) {
      console.log('ERR:', url, e.message);
    }
  }
}
test().catch(e => console.error(e));
