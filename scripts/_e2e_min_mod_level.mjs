// scripts/_e2e_min_mod_level.mjs
// Verifies the Greater/Perfect variant tier-gating mechanic:
//   A Greater Chaos Orb should only roll mods whose level >= 35.
//   A Perfect Chaos Orb should only roll mods whose level >= 50.
// A standard Chaos Orb has no level gate (rolls any mod).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import {
  applyOperation,
  emptyItem,
} from '../src/lib/emulator.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '../data/processed');
const bases = JSON.parse(fs.readFileSync(path.join(DATA, 'bases.json'), 'utf8'));
const currency = JSON.parse(fs.readFileSync(path.join(DATA, 'currency.json'), 'utf8'));
const omens = JSON.parse(fs.readFileSync(path.join(DATA, 'omens.json'), 'utf8'));
const mods = JSON.parse(fs.readFileSync(path.join(DATA, 'mods.json'), 'utf8'));

const base = bases.find((b) => b.slot === 'helmet' && b.level === 80);

function makeCtx(itemLevel, minModLevel = 0) {
  const baseRecord = { ...base };
  const item = emptyItem(baseRecord, itemLevel);
  // Pre-load item with two prefixes so Chaos Orb has something to remove
  item.rarity = 'rare';
  item.affixes = [
    { modId: mods[0].id, type: 'prefix', tier: 5, name: mods[0].name, tags: [] },
    { modId: mods[1].id, type: 'suffix', tier: 5, name: mods[1].name, tags: [] },
  ];
  return {
    base: baseRecord,
    mods,
    currency,
    omens,
    weights: [],
    item,
    activeOmens: [],
    minModLevel,
  };
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name} ${detail}`); fail++; }
}

// Test 1: Greater Chaos Orb (minModLevel=35) only rolls mods with level >= 35
console.log('Greater Chaos Orb (minModLevel=35)');
{
  const ctx = makeCtx(80, 35);
  const result = applyOperation('chaos_orb', ctx);
  check('ok', result.ok);
  if (result.ok) {
    const newMod = result.item.affixes.find((a) => !ctx.item.affixes.some((b) => b.modId === a.modId));
    if (newMod) {
      const mod = mods.find((m) => m.id === newMod.modId);
      check('rolled mod has level >= 35', mod.level >= 35, `mod.level=${mod.level}`);
      console.log(`    rolled: "${mod.name}" level=${mod.level} tier=${mod.tier}`);
    } else {
      check('rolled a new mod', false, 'no new mod found');
    }
  }
}

// Test 2: Perfect Chaos Orb (minModLevel=50) only rolls mods with level >= 50
console.log('Perfect Chaos Orb (minModLevel=50)');
{
  const ctx = makeCtx(80, 50);
  const result = applyOperation('chaos_orb', ctx);
  check('ok', result.ok);
  if (result.ok) {
    const newMod = result.item.affixes.find((a) => !ctx.item.affixes.some((b) => b.modId === a.modId));
    if (newMod) {
      const mod = mods.find((m) => m.id === newMod.modId);
      check('rolled mod has level >= 50', mod.level >= 50, `mod.level=${mod.level}`);
      console.log(`    rolled: "${mod.name}" level=${mod.level} tier=${mod.tier}`);
    }
  }
}

// Test 3: Standard Chaos Orb (minModLevel=0) can roll any mod
console.log('Standard Chaos Orb (minModLevel=0)');
{
  const ctx = makeCtx(80, 0);
  const result = applyOperation('chaos_orb', ctx);
  check('ok', result.ok);
  if (result.ok) {
    const newMod = result.item.affixes.find((a) => !ctx.item.affixes.some((b) => b.modId === a.modId));
    if (newMod) {
      const mod = mods.find((m) => m.id === newMod.modId);
      // Could roll anything; just verify it has a level
      check('rolled a valid mod', typeof mod.level === 'number');
      console.log(`    rolled: "${mod.name}" level=${mod.level} tier=${mod.tier}`);
    }
  }
}

// Test 4: Greater Exalted Orb (minModLevel=35) only adds mods with level >= 35
console.log('Greater Exalted Orb (minModLevel=35)');
{
  const ctx = makeCtx(80, 35);
  ctx.item.affixes.push({ modId: mods[0].id, type: 'prefix', tier: 5, name: mods[0].name, tags: [] });
  ctx.item.affixes.push({ modId: mods[1].id, type: 'suffix', tier: 5, name: mods[1].name, tags: [] });
  const result = applyOperation('exalted_orb', ctx);
  check('ok', result.ok);
  if (result.ok && result.item.affixes.length > ctx.item.affixes.length) {
    const added = result.item.affixes[result.item.affixes.length - 1];
    const mod = mods.find((m) => m.id === added.modId);
    check('added mod has level >= 35', mod.level >= 35, `mod.level=${mod.level}`);
    console.log(`    added: "${mod.name}" level=${mod.level} tier=${mod.tier}`);
  }
}

// Test 5: Greater Orb of Augmentation (minModLevel=44) only adds mods level >= 44
console.log('Greater Orb of Augmentation (minModLevel=44)');
{
  const ctx = makeCtx(80, 44);
  ctx.item.rarity = 'magic';
  ctx.item.affixes = [{ modId: mods[0].id, type: 'prefix', tier: 5, name: mods[0].name, tags: [] }];
  const result = applyOperation('orb_of_augmentation', ctx);
  check('ok', result.ok);
  if (result.ok) {
    const added = result.item.affixes[result.item.affixes.length - 1];
    const mod = mods.find((m) => m.id === added.modId);
    check('added mod has level >= 44', mod.level >= 44, `mod.level=${mod.level}`);
    console.log(`    added: "${mod.name}" level=${mod.level} tier=${mod.tier}`);
  }
}

// Test 6: Run many rolls for statistical verification
console.log('Statistical verification (1000 Greater Chaos rolls on lvl-80 helmet):');
{
  let minObservedLevel = 999, maxObservedLevel = 0;
  let validRolls = 0;
  for (let i = 0; i < 1000; i++) {
    const ctx = makeCtx(80, 35);
    const result = applyOperation('chaos_orb', ctx);
    if (result.ok) {
      const newMod = result.item.affixes.find((a) => !ctx.item.affixes.some((b) => b.modId === a.modId));
      if (newMod) {
        const mod = mods.find((m) => m.id === newMod.modId);
        if (mod.level < minObservedLevel) minObservedLevel = mod.level;
        if (mod.level > maxObservedLevel) maxObservedLevel = mod.level;
        if (mod.level >= 35) validRolls++;
      }
    }
  }
  console.log(`    min level rolled: ${minObservedLevel}, max: ${maxObservedLevel}`);
  console.log(`    rolls that respected minModLevel>=35: ${validRolls}/1000`);
  check('no roll produced level < 35', minObservedLevel >= 35, `minObserved=${minObservedLevel}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
