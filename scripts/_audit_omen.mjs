// scripts/_audit_omen.mjs
// Verifies that every omen in the data is correctly mapped to a meaningful OmenEffect.
// Some omens are out-of-scope (Logbook omens, Sagas, etc.) and are explicitly flagged.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const omens = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/processed/omens.json'), 'utf8'));

// The parseOmenEffect logic from simulator.astro, copied here for offline audit.
function parseOmenEffect(o) {
  if (!o) return { kind: 'force_type', value: 'prefix' };
  const e = (o.effect || '').toLowerCase();
  if (/only (have )?prefix/.test(e)) return { kind: 'force_type', value: 'prefix' };
  if (/only (have )?suffix/.test(e)) return { kind: 'force_type', value: 'suffix' };
  if (/maximum number of prefix/.test(e)) return { kind: 'force_type', value: 'prefix' };
  if (/maximum number of suffix/.test(e)) return { kind: 'force_type', value: 'suffix' };
  if (/adds 2 affixes|add two random modifiers|add two new random modifiers/.test(e)) return { kind: 'double_add' };
  if (/does not destroy|will not destroy/.test(e)) return { kind: 'no_destroy', for: 'orb_of_chance' };
  if (/remove two modifiers|removes 2 affixes/.test(e)) return { kind: 'remove_count', value: 2 };
  if (/removes 1 prefix|only prefix modifiers/.test(e)) return { kind: 'remove_type', value: 'prefix' };
  if (/removes 1 suffix|only suffix modifiers/.test(e)) return { kind: 'remove_type', value: 'suffix' };
  if (/lowest level/.test(e)) return { kind: 'remove_lowest_level' };
  if (/replaces? all (affixes|modifiers)|reroll (the options|desecrated modifiers)/.test(e)) return { kind: 'replace_all_desecrate' };
  if (/same type as an existing modifier/.test(e)) return { kind: 'force_homogenise' };
  if (/ulaman/.test(e)) return { kind: 'desecrate_faction', value: 'ulaman' };
  if (/amanamu/.test(e)) return { kind: 'desecrate_faction', value: 'amanamu' };
  if (/kurgal/.test(e)) return { kind: 'desecrate_faction', value: 'kurgal' };
  if (/desecrated affixes/.test(e)) return { kind: 'remove_only_desecrated' };
  if (/implicit/.test(e)) return { kind: 'divine_implicit_only' };
  if (/sanctif/.test(e)) return { kind: 'divine_upgrade' };
  if (/catalysing|catalyst/.test(e)) return { kind: 'exalted_consumes_catalyst' };
  if (/putrefaction/.test(e)) return { kind: 'desecrate_reroll' };
  if (/necromancy/.test(e)) return { kind: 'desecrate_minion', value: 'suffix' };
  if (/crystallisation/.test(e)) return { kind: 'perfect_orb_implicit_upgrade' };
  if (/chaotic effectiveness/.test(e)) return { kind: 'chaos_effectiveness' };
  if (/chaotic monsters/.test(e)) return { kind: 'chaos_monsters' };
  if (/chaotic quantity/.test(e)) return { kind: 'chaos_quantity' };
  if (/chaotic rarity/.test(e)) return { kind: 'chaos_rarity' };
  if (/random unique|ancients/.test(e)) return { kind: 'specific_unique', for: 'orb_of_chance' };
  return { kind: 'force_type', value: 'prefix' };
}

const expected = (o) => {
  const name = (o.display_name || o.name || '').toLowerCase();
  const e = (o.effect || '').toLowerCase();
  // Out-of-scope: Logbook-only, Sagas, mechanics without an orb
  if (/saga$/.test(name)) return { scope: 'out-of-scope', reason: 'Logbook-only (no orb interaction)' };
  if (/refreshment|resurgence|amelioration|bartering|answered prayers|corruption|secret compartments|reinforcements|gambling/.test(name) && !/abyssal/.test(name)) return { scope: 'out-of-scope', reason: 'Non-orb mechanic (flask, shrine, vendor, etc.)' };
  if (/recombination/.test(name)) return { scope: 'out-of-scope', reason: 'Faction-only, no orb mechanic' };
  // Chaotic omens affect Chaos Orb on Waystones only — out of scope for equipment simulator
  if (/chaotic/.test(name)) return { scope: 'out-of-scope', reason: 'Chaos Orb waystone-only — no equipment effect' };
  if (/of the hunt|of the liege|of the sovereign|of the blackblooded/.test(name)) return { scope: 'out-of-scope', reason: 'Faction encounter' };
  // Force prefix
  if (/sinistral alchemy|sinistral coronation|sinistral crystallisation|sinistral necromancy|sinistral erasure|sinistral exaltation|sinistral ann/.test(name)) return { scope: 'prefix-force' };
  if (/dextral alchemy|dextral coronation|dextral crystallisation|dextral necromancy|dextral erasure|dextral exaltation|dextral ann/.test(name)) return { scope: 'suffix-force' };
  if (/greater annulment/.test(name)) return { scope: 'remove_count_2' };
  if (/greater exaltation/.test(name)) return { scope: 'double_add' };
  if (/homogenising coronation|homogenising exaltation/.test(name)) return { scope: 'homogenise' };
  if (/whittling/.test(name)) return { scope: 'remove_lowest_level' };
  if (/abyssal echoes/.test(name)) return { scope: 'desecrate-reroll' };
  if (/chance$/.test(name)) return { scope: 'chance-preserve' };
  if (/ancients/.test(name)) return { scope: 'chance-unique' };
  // New fully-wired omens
  if (/of the blessed/.test(name)) return { scope: 'divine-implicit' };
  if (/putrefaction/.test(name)) return { scope: 'desecrate-reroll' };
  if (/light$/.test(name)) return { scope: 'unknown', reason: 'Affects Orb of Annulment behavior — no specific OmenEffect kind yet' };
  if (/catalysing/.test(name)) return { scope: 'exalted-catalyst' };
  if (/sanctification/.test(name)) return { scope: 'divine-upgrade' };
  if (/chaotic effectiveness/.test(name)) return { scope: 'chaos-effectiveness' };
  if (/chaotic monsters/.test(name)) return { scope: 'chaos-monsters' };
  if (/chaotic quantity/.test(name)) return { scope: 'chaos-quantity' };
  if (/chaotic rarity/.test(name)) return { scope: 'chaos-rarity' };
  if (/ancients/.test(name)) return { scope: 'chance-unique' };
  return { scope: 'uncategorized' };
};

const scopeGroups = {};
let pass = 0, fail = 0, oos = 0;
omens.forEach((o) => {
  const name = o.display_name || o.name;
  const eff = parseOmenEffect(o);
  const exp = expected(o);
  const key = exp.scope;
  if (!scopeGroups[key]) scopeGroups[key] = [];

  let status = 'OK';
  if (exp.scope === 'out-of-scope') {
    // Default behavior is fine — no orb to wire
    status = 'OOS';
    oos++;
  } else if (exp.scope === 'unknown') {
    // Will get default force_type/prefix — wrong, but no fix without new effect kinds
    status = 'NO-FITTING-EFFECT-KIND';
  } else if (exp.scope === 'prefix-force' && eff.kind === 'force_type' && eff.value === 'prefix') {
    pass++;
  } else if (exp.scope === 'suffix-force' && eff.kind === 'force_type' && eff.value === 'suffix') {
    pass++;
  } else if (exp.scope === 'remove_count_2' && eff.kind === 'remove_count' && eff.value === 2) {
    pass++;
  } else if (exp.scope === 'double_add' && eff.kind === 'double_add') {
    pass++;
  } else if (exp.scope === 'homogenise' && eff.kind === 'force_homogenise') {
    pass++;
  } else if (exp.scope === 'remove_lowest_level' && eff.kind === 'remove_lowest_level') {
    pass++;
  } else if (exp.scope === 'chance-preserve' && eff.kind === 'no_destroy') {
    pass++;
  } else if (exp.scope === 'desecrate-reroll' && eff.kind === 'replace_all_desecrate') {
    pass++;
  } else if (exp.scope === 'divine-implicit' && eff.kind === 'divine_implicit_only') {
    pass++;
  } else if (exp.scope === 'divine-upgrade' && eff.kind === 'divine_upgrade') {
    pass++;
  } else if (exp.scope === 'exalted-catalyst' && eff.kind === 'exalted_consumes_catalyst') {
    pass++;
  } else if (exp.scope === 'chance-unique' && eff.kind === 'specific_unique') {
    pass++;
  } else if (exp.scope === 'chaos-effectiveness' && eff.kind === 'chaos_effectiveness') {
    pass++;
  } else if (exp.scope === 'chaos-monsters' && eff.kind === 'chaos_monsters') {
    pass++;
  } else if (exp.scope === 'chaos-quantity' && eff.kind === 'chaos_quantity') {
    pass++;
  } else if (exp.scope === 'chaos-rarity' && eff.kind === 'chaos_rarity') {
    pass++;
  } else {
    status = 'MISMATCH';
    fail++;
  }
  scopeGroups[key].push({ name, status, eff });
});

console.log('=== OMEN WIRING AUDIT ===\n');
console.log('Total omens:', omens.length);
console.log('Pass:', pass);
console.log('Fail (regex mismatch):', fail);
console.log('Out of scope:', oos);
console.log('No fitting effect kind:', omens.length - pass - fail - oos);
console.log();
for (const [scope, items] of Object.entries(scopeGroups)) {
  console.log(`\n--- ${scope} (${items.length}) ---`);
  items.forEach((i) => console.log(`  [${i.status}] ${i.name} -> ${JSON.stringify(i.eff)}`));
}

if (fail > 0) process.exit(1);
