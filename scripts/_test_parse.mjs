// scripts/_test_parse.mjs
const text = `Item Class: Rings
Rarity: Rare
Torment Whorl
Gold Ring
--------
Requires: Level 60
--------
Item Level: 82
--------
{ Implicit Modifier }
15(6-15)% increased Rarity of Items found
--------
{ Prefix Modifier "Tempered" (Tier: 2) — Damage, Physical, Attack }
Adds 13(10-15) to 23(18-26) Physical Damage to Attacks
{ Desecrated Prefix Modifier "Entombing" (Tier: 1) — Damage, Elemental, Cold, Attack }
Adds 23(21-24) to 32(32-37) Cold damage to Attacks
{ Prefix Modifier "Sparking" (Tier: 5) — Damage, Elemental, Lightning, Attack }
Adds 1 to 30(28-32) Lightning damage to Attacks
{ Suffix Modifier "of the Rainbow" (Tier: 1) — Elemental, Fire, Cold, Lightning, Resistance }
+16(15-16)% to all Elemental Resistances
{ Suffix Modifier "of the Remora" (Tier: 1) — Life, Physical, Attack }
Leech 7.55(7-7.9)% of Physical Attack Damage as Life
{ Crafted Suffix Modifier "of Archaeology" (Tier: 1) }
17(15-18)% increased Rarity of Items found`;

// Replicate the buggy split
const buggySplit = text.split(String.fromCharCode(92, 114, 63, 92, 110));
console.log('Buggy split count:', buggySplit.length, '(this is what the simulator does)');

// Proper regex split
const properSplit = text.split(/\r?\n/);
console.log('Proper split count:', properSplit.length);
console.log('First 5 lines (proper):');
properSplit.slice(0, 5).forEach((l, i) => console.log('  ' + i + ': ' + l));

// Run the simulator's parseClipboardText on it
function parseClipboardText(text) {
  const out = { itemClass: '', rarity: '', uniqueName: '', baseName: '', itemLevel: 0, implicit: '', affixes: [], warnings: [] };
  const lines = text.split(String.fromCharCode(92, 114, 63, 92, 110));
  let dashCount = 0, mod = null;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (!ln) continue;
    if (/^-{5,}$/.test(ln)) {
      dashCount++;
      if (mod && mod.lines.length > 0) { mod.desc = mod.lines.join(' ').trim(); out.affixes.push(mod); }
      mod = null;
      continue;
    }
    if (dashCount === 0) {
      const lc = ln.toLowerCase();
      if (lc.startsWith('item class:')) out.itemClass = ln.split(':')[1]?.trim() || '';
      else if (lc.startsWith('rarity:')) out.rarity = ln.split(':')[1]?.trim().toLowerCase() || '';
      else if (!out.uniqueName) out.uniqueName = ln;
      else if (!out.baseName) out.baseName = ln;
      continue;
    }
    if (dashCount === 1) {
      const lc = ln.toLowerCase();
      if (lc.startsWith('requires:')) { const m = ln.match(/level\s*(\d+)/i); if (m) out.requiredLevel = parseInt(m[1]); }
      else if (lc.startsWith('item level:')) { const m = ln.match(/(\d+)/); if (m) out.itemLevel = parseInt(m[1]); }
      continue;
    }
    if (dashCount >= 2) {
      const mh = ln.match(/^\{?\s*(Implicit|Prefix|Suffix|Crafted Prefix|Crafted Suffix|Desecrated Prefix|Desecrated Suffix)\s+Modifier/i);
      if (mh) {
        if (mod && mod.lines.length > 0) { mod.desc = mod.lines.join(' ').trim(); out.affixes.push(mod); }
        mod = { type: mh[1].toLowerCase().replace(/\s+/g, '_'), lines: [], tier: 1, crafted: /crafted/i.test(mh[1]), desecrated: /desecrated/i.test(mh[1]), desc: '' };
        const tm = ln.match(/Tier\s*[\:\s]*(\d+)/i);
        if (tm) mod.tier = parseInt(tm[1]);
        continue;
      }
      if (mod) mod.lines.push(ln);
    }
  }
  if (mod && mod.lines.length > 0) { mod.desc = mod.lines.join(' ').trim(); out.affixes.push(mod); }
  let imIdx = -1;
  for (let j = 0; j < out.affixes.length; j++) {
    if (out.affixes[j].type === 'implicit' || out.affixes[j].type === 'implicit_modifier') { imIdx = j; break; }
  }
  if (imIdx >= 0) { out.implicit = out.affixes[imIdx].desc; out.affixes.splice(imIdx, 1); }
  return out;
}

console.log('\n=== Buggy parser output ===');
const result = parseClipboardText(text);
console.log('itemClass:', JSON.stringify(result.itemClass));
console.log('rarity:', JSON.stringify(result.rarity));
console.log('uniqueName:', JSON.stringify(result.uniqueName));
console.log('baseName:', JSON.stringify(result.baseName));
console.log('itemLevel:', result.itemLevel);
console.log('affixes:', result.affixes.length);
result.affixes.forEach(a => console.log('  -', a.type, 'T' + a.tier, '|', a.desc?.slice(0, 50)));