// src/lib/item/find-base.ts
// Pure base-name resolution from free-text name strings.
// Used by the paste importer to resolve a base from a PoE2 clipboard block.

import type { BaseLike, BaseLookupResult } from './types.ts';

/**
 * Find the closest matching base by free-text name.
 *
 * Strategy (in order):
 *  1. exact case-insensitive match
 *  2. pasted name ends with the base name
 *     (most common case: a unique-item name is "Torment Whorl" and the
 *     base is "Gold Ring", which the unique name endsWith)
 *  3. base name is contained anywhere inside pasted name
 *  4. pasted name is contained anywhere inside base name (handles
 *     substrings like corrupted unique bases)
 *
 * Returns null when no candidate matches.
 *
 * This matches the original findBaseByName() in simulator.astro so the
 * imperative behavior of the importer is preserved after the refactor.
 */
export function findBaseByName(
  name: string,
  bases: readonly BaseLike[],
): BaseLookupResult | null {
  const n = name.toLowerCase().trim();

  // 1. Exact case-insensitive
  let b = bases.find((x) => x.name.toLowerCase() === n);
  if (b) return { base: b, matchedOn: 'exact' };

  // 2. Pasted name ends with the base name
  //    e.g. "Torment Whorl Gold Ring" endsWith "Gold Ring"
  b = bases.find((x) => n.endsWith(x.name.toLowerCase()));
  if (b) return { base: b, matchedOn: 'endsWith' };

  // 3. Base name is contained anywhere inside pasted name
  b = bases.find((x) => n.includes(x.name.toLowerCase()));
  if (b) return { base: b, matchedOn: 'containsBase' };

  // 4. Pasted name is contained inside base name
  b = bases.find((x) => x.name.toLowerCase().includes(n));
  if (b) return { base: b, matchedOn: 'containsPasted' };

  return null;
}

/**
 * Map a free-form slot label (e.g. "Body Armours", "Helmets") to the
 * internal slot key (e.g. "body_armour", "helmet"). Used when the
 * pasted `Item Class:` line couldn't be resolved to a base by name,
 * so we still know the slot for filtering.
 */
export const SLOT_FROM_LABEL: Record<string, string> = {
  amulets: 'amulet',
  belts: 'belt',
  'body armours': 'body_armour',
  boots: 'boots',
  bows: 'weapon_2h',
  charms: 'charm',
  'chest armours': 'body_armour',
  crossbows: 'weapon_2h',
  flasks: 'flask',
  focus: 'focus',
  gloves: 'gloves',
  helmets: 'helmet',
  jewels: 'jewel',
  quivers: 'quiver',
  rings: 'ring',
  shields: 'shield',
  spears: 'weapon_1h',
  staves: 'weapon_2h',
  wands: 'weapon_1h',
  waystones: 'waystone',
  tablets: 'tablet',
  relics: 'relic',
  'one handed weapons': 'weapon_1h',
  'two handed weapons': 'weapon_2h',
};

/** Convert an item class string to its internal slot key (lowercase comparison). */
export function slotFromLabel(itemClass: string): string | null {
  return SLOT_FROM_LABEL[itemClass.toLowerCase()] ?? null;
}

/**
 * Find any base in `slot` whose name appears inside the pasted item name.
 * Last-resort lookup when name-based matching failed.
 */
export function findBaseInSlot(
  name: string,
  slot: string,
  bases: readonly BaseLike[],
): BaseLike | null {
  const n = name.toLowerCase();
  return (
    bases.find((b) => b.slot === slot && n.includes(b.name.toLowerCase())) ??
    null
  );
}
