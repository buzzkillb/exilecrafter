// Quick check: what realm does poe2scout API accept?
const API = 'https://api.poe2scout.com';

async function main() {
  const realms = ['poe2', 'runes', 'runes_of_aldur', 'poe2scout', 'pc', 'PC', 'standard', 'Standard', 'Runes of Aldur', 'Runes%20of%20Aldur'];
  
  for (const r of realms) {
    try {
      const url = API + '/api/leagues?realm=' + encodeURIComponent(r);
      const resp = await fetch(url, { headers: { accept: 'application/json' } });
      const t = await resp.text();
      console.log(`realm="${r}": ${resp.status} "${t.slice(0, 150)}"`);
    } catch (e) {
      console.log(`realm="${r}": ERROR ${e.message}`);
    }
  }
}

main();
