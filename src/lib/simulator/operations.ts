/**
 * Simulator — currency-to-operation mapping + keyboard shortcuts.
 * Pure functions, no DOM, no state.
 */

export const CURRENCY_NAME_TO_OP: Array<[RegExp | string, string]> = [
  ['transmutation', 'orb_of_transmutation'],
  ['augmentation', 'orb_of_augmentation'],
  ['alchemy', 'orb_of_alchemy'],
  ['regal', 'regal_orb'],
  ['exalt', 'exalted_orb'],
  ['annul', 'orb_of_annulment'],
  ['chaos', 'chaos_orb'],
  ['divine', 'divine_orb'],
  ['chance', 'orb_of_chance'],
  ['vaal', 'vaal_orb'],
  ['desecrat', 'desecrate'],
  ['collarbone|jawbone|rib|cranium', 'desecrate'],
  ['liquid|potent|auspicious|concentrated|diluted|ancient|distilled', 'liquid_emotion'],
  ['catalyst', 'catalyst'],
  ['alloy', 'alloy'],
];

export const OP_KEYBOARD_HINTS: Record<string, string> = {
  orb_of_transmutation: 'T',
  orb_of_alchemy: 'A',
  regal_orb: 'R',
  exalted_orb: 'E',
  orb_of_annulment: 'X',
  chaos_orb: 'C',
  divine_orb: 'D',
  orb_of_augmentation: 'U',
  vaal_orb: 'V',
};

export const CATEGORY_LABELS: Record<string, string> = {
  upgrade_rarity: 'Upgrade',
  augment: 'Add Affix',
  reroll: 'Reroll',
  annul: 'Annul',
  divine: 'Divine',
  corrupt: 'Corrupt',
  desecrate: 'Desecrate',
  essence: 'Essences',
  breach: 'Breach',
  special: 'Special',
  catalyst: 'Catalysts',
  liquid_affector: 'Liquids',
  currency_other: 'Other',
};

export const SLOT_LABELS: Record<string, string> = {
  amulet: 'Amulet',
  belt: 'Belt',
  body_armour: 'Body Armour',
  boots: 'Boots',
  charm: 'Charm',
  focus: 'Focus',
  gloves: 'Gloves',
  helmet: 'Helmet',
  jewel: 'Jewel',
  quiver: 'Quiver',
  ring: 'Ring',
  shield: 'Shield',
  weapon_1h: 'Weapon (1H)',
  weapon_2h: 'Weapon (2H)',
  waystone: 'Waystone',
  tablet: 'Tablet',
  relic: 'Relic',
};

/** Map a currency id/name to the canonical operation id */
export function mapCurrencyToOp(
  id: string,
  name: string,
  operations: Record<string, any>,
): string {
  if (operations[id]) return id;
  const stripped = id.replace(/^(lesser_|greater_|perfect_|corrupted_)/, '');
  if (operations[stripped]) return stripped;
  const n = name.toLowerCase();
  for (const [needle, opId] of CURRENCY_NAME_TO_OP) {
    if (typeof needle === 'string' ? n.includes(needle) : needle.test(n)) return opId;
  }
  return stripped || id;
}

/** Keyboard shortcut letter for a given operation */
export function getOpKey(opId: string): string {
  return OP_KEYBOARD_HINTS[opId] || '';
}

/** Human-readable category label */
export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}
