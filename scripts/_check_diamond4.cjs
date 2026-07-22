const fs = require('fs');
const html = fs.readFileSync('./data/raw/base_Diamond.html', 'utf-8');
const m = html.match(/new\s+ModsView\(/);
console.log('Found ModsView call:', !!m, m ? 'at ' + m.index : '');
if (m) {
  // Print surrounding context
  console.log('Context:', html.substring(Math.max(0, m.index - 50), m.index + 200));
}
// Search for JSON key 'normal'
const idx4 = html.indexOf('"normal"');
console.log('JSON key normal at:', idx4);
if (idx4 >= 0) {
  const snippet = html.substring(Math.max(0, idx4 - 200), idx4 + 100);
  console.log('Context:', snippet);
}
// Is the diamond page a stub/redirect?
console.log('First 100 chars:', html.substring(0, 100));
