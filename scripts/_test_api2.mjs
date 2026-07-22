async function main() {
  // Check the leagues data
  const res = await fetch('https://api.poe2scout.com/poe2/Leagues', {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
  });
  const data = await res.json();
  const runes = data.find(l => l.Value === 'Runes of Aldur');
  if (runes) {
    console.log('Runes of Aldur:', JSON.stringify(runes, null, 2));
  } else {
    console.log('First 3 leagues:', JSON.stringify(data.slice(0,3), null, 2));
    console.log('All league values:', data.map(l => l.Value));
  }
  
  // Now check currency data
  const url = 'https://api.poe2scout.com/poe2/Leagues/Runes%20of%20Aldur/Currencies/ByCategory?category=currency&perPage=200';
  const cres = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
  });
  const cdata = await cres.json();
  const items = cdata.Items || cdata.items || [];
  console.log('\nCurrency items:', items.length);
  // Show first and last few
  for (let i = 0; i < Math.min(5, items.length); i++) {
    console.log('  ', i, items[i].ApiId, items[i].CurrentPrice, items[i].ChaosPrice);
  }
  if (items.length > 5) {
    console.log('  ...');
    for (let i = Math.max(5, items.length - 3); i < items.length; i++) {
      console.log('  ', i, items[i].ApiId, items[i].CurrentPrice, items[i].ChaosPrice);
    }
  }
}
main().catch(e => console.error(e));
