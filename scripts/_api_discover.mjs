// Discover poe2scout API structure
async function main() {
  // First get the page HTML and look for API calls
  const res = await fetch('https://poe2scout.com/poe2/runes/economy/currencies/ritual', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CraftClass/1.0)' }
  });
  const html = await res.text();
  
  // Find all script sources
  const srcRegex = /src="([^"]+)"/g;
  let match;
  const scripts = [];
  while ((match = srcRegex.exec(html)) !== null) {
    scripts.push(match[1]);
  }
  console.log('Script sources found:');
  scripts.forEach(s => console.log(' ', s));
  
  // Find the manifest file
  const manifestMatch = html.match(/manifest-([^.]+)\.js/);
  if (manifestMatch) {
    console.log('\nManifest file: manifest-' + manifestMatch[1] + '.js');
    // Try to fetch it
    const mRes = await fetch('https://poe2scout.com/assets/manifest-' + manifestMatch[1] + '.js');
    const mBody = await mRes.text();
    console.log('Manifest content (first 2000):');
    console.log(mBody.substring(0, 2000));
  }
  
  // Look for any data fetching patterns
  const apiRegex = /["']([^"']*(?:api|economy|currency|league)[^"']*)["']/gi;
  let apiMatch;
  const apiUrls = new Set();
  while ((apiMatch = apiRegex.exec(html)) !== null) {
    apiUrls.add(apiMatch[1]);
  }
  console.log('\nPotential API URLs found in HTML:');
  apiUrls.forEach(u => console.log(' ', u));
  
  // Check the page JSON data
  const jsonRegex = /<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/;
  const jsonMatch = html.match(jsonRegex);
  if (jsonMatch) {
    console.log('\nFound __NEXT_DATA__:', jsonMatch[1].substring(0, 500));
  }
  
  // Also check for static-data attributes
  const dataAttrRegex = /data-([a-z]+)="([^"]+)"/gi;
  let dataMatch;
  const dataAttrs = [];
  while ((dataMatch = dataAttrRegex.exec(html)) !== null) {
    dataAttrs.push({ attr: dataMatch[1], val: dataMatch[2] });
  }
  console.log('\nKey data attributes:');
  dataAttrs.slice(0, 30).forEach(d => console.log(' ', d.attr + '=' + d.val));
}
main().catch(e => console.error('Error:', e.message));
