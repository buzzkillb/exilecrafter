import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const f = path.resolve(__dirname, '..', 'src', 'lib', 'emulator.ts');
let c = readFileSync(f, 'utf8');
const orig = c.length;

// Fix 1: duplicate ActiveOmen → OmenEffect
// The second "export interface ActiveOmen {" block should be "export type OmenEffect ="
c = c.replace(
  'export interface ActiveOmen {\n  | { kind: \'double_add\' }',
  'export type OmenEffect =\n  | { kind: \'double_add\' }'
);

// Fix 2: divineOrb — incomplete function body
// Replace "const next: ItemState = {\n\nexport function vaalOrb" with proper closing + new vaalOrb
c = c.replace(
  '  const next: ItemState = {\n\nexport function vaalOrb(ctx: EmulatorContext): CraftResult {\n  // Corrupts the item; if it\'s a normal/magic/rare without implicit, the implicit\n  // slot gets a corrupted implicit (we represent this as a corrupted flag).\n  // PoE2 Vaal Orb has 4 equally-likely outcomes:\n  //   25% upgrade',
  '  const next: ItemState = JSON.parse(JSON.stringify(item));\n  return { ok: true, message: detail, item: next };\n}\n\nexport function vaalOrb(ctx: EmulatorContext): CraftResult {\n  // Corrupts the item; if it\'s a normal/magic/rare without implicit, the implicit\n  // slot gets a corrupted implicit (we represent this as a corrupted flag).\n  // PoE2 Vaal Orb has 4 equally-likely outcomes:\n  //   25% upgrade'
);

// Fix 3: Remove second duplicate vaalOrb and the orbOfChance orphan code
// The pattern is: after the first vaalOrb closes, there's a 2nd vaalOrb + orbOfChance orphan + 1st desecrate comment
// We need to keep only: first vaalOrb closing + desecrate function header
// Let me check what's between the vaalOrb closing and the proper desecrate
// Pattern: "}\n\nexport function vaalOrb(ctx" — remove from there through to "}\n\n  // Add a desecrated affix"
// Replacing the entire duplicate range with the desecrate function header

// Find the orbOfChance body between the two vaalOrb declarations
const orbStart = c.indexOf('const omenNoDestroy = omenOf(ctx.activeOmens');
const orbEnd = c.indexOf('export function desecrate(', orbStart);
if (orbStart > 0 && orbEnd > 0) {
  // The orbOfChance code is orphaned. We need to remove it AND the duplicate 2nd vaalOrb before it.
  // Find the 2nd vaalOrb that comes before this orphan code
  const secondVaal = c.lastIndexOf('export function vaalOrb(', orbStart);
  if (secondVaal > 0) {
    // Remove: secondVaal line through orbEnd
    // But keep the desecrate function header
    const before = c.slice(0, secondVaal);
    const after = c.slice(orbEnd);
    c = before + after;
  }
}

// Also fix the activeOmens type import if needed — check for orbOfChance missing declaration
// The orbOfChance body was removed as part of the duplicate removal, but if there's no 
// orbOfChance function at all, we need to add it. Let's check.
if (!c.includes('function orbOfChance')) {
  // Add orbOfChance before the vaalOrb function
  const orbOfChanceFn = `
export function orbOfChance(ctx: EmulatorContext): CraftResult {
  const { item } = ctx;
  if (item.rarity !== 'normal') {
    return { ok: false, message: 'Orb of Chance only works on Normal items.', item };
  }
  if (item.corrupted) {
    return { ok: false, message: 'Cannot use Orb of Chance on corrupted items.', item };
  }
  // In PoE2, Chance fails silently — the item stays Normal.
  return { ok: true, message: 'Chance missed — item unchanged.', item: { ...item, history: [...item.history, { action: 'Orb of Chance', detail: 'Miss, item kept' }] } };
}

`;
  const vaalIdx = c.indexOf('export function vaalOrb(');
  if (vaalIdx > 0) {
    c = c.slice(0, vaalIdx) + orbOfChanceFn + c.slice(vaalIdx);
  }
}

writeFileSync(f, c, 'utf8');
console.log(`Fixed. ${orig} → ${c.length} chars (${orig - c.length} removed)`);
