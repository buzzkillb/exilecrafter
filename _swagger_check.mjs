const r = await fetch('https://api.poe2scout.com/swagger/index.html');
const html = await r.text();
console.log('Status:', r.status);
console.log('Length:', html.length);
// Find the swagger spec URL or config URL
const urlMatch = html.match(/url["']?\s*[:=]\s*["']([^"']+)["']/i);
console.log('Spec URL:', urlMatch ? urlMatch[1] : 'not found');
// Find configUrl
const configMatch = html.match(/configUrl["']?\s*[:=]\s*["']([^"']+)["']/i);
console.log('Config URL:', configMatch ? configMatch[1] : 'not found');
// Print some HTML context around the swagger init
const swaggerIdx = html.indexOf('SwaggerUIBundle');
if (swaggerIdx >= 0) console.log('Swagger init:', html.slice(swaggerIdx, swaggerIdx + 500));
