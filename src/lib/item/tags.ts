// src/lib/item/tags.ts
// Pure presentation helpers for the item card.
// No runtime imports — these are static maps and tiny string fns.

/** Map from rarity tier → display color (matches the in-game tooltip palette). */
export const RARITY_COLORS: Record<string, string> = {
  normal: '#c8c8c8',
  magic: '#8888ff',
  rare: '#ffff77',
  unique: '#af6025',
};

/** Singular slot label shown above the item name on the simulator card. */
export const SLOT_DISPLAY: Record<string, string> = {
  helmet: 'Helmet',
  body_armour: 'Body Armour',
  gloves: 'Gloves',
  boots: 'Boots',
  belt: 'Belt',
  amulet: 'Amulet',
  ring: 'Ring',
  shield: 'Shield',
  quiver: 'Quiver',
  focus: 'Focus',
  weapon_1h: 'One Handed Weapon',
  weapon_2h: 'Two Handed Weapon',
  flask: 'Flask',
  charm: 'Charm',
  jewel: 'Jewel',
  waystone: 'Waystone',
  tablet: 'Tablet',
  relic: 'Relic',
};

/**
 * Tag → display color rules.
 * Rules are checked in priority order; the first match wins.
 * Mirrors the color families the in-game modifier text uses.
 */
export const TAG_COLOR_RULES: ReadonlyArray<readonly [readonly string[], string]> = [
  [['fire'], '#c44a2a'],
  [['cold'], '#4a8fc4'],
  [['lightning'], '#d4c84a'],
  [['chaos'], '#a04ac4'],
  [['physical'], '#c9a87a'],
  [['life'], '#d44a4a'],
  [['mana'], '#4a6fc4'],
  [['energy_shield', 'ward'], '#6accc4'],
  [['elemental', 'damage'], '#c9a14a'],
  [['attack'], '#c97070'],
  [['speed', 'critical'], '#d4c84a'],
  [['caster'], '#8888ff'],
  [['minion'], '#a08ac4'],
];

/** Tag color used when no rule matches. */
export const TAG_COLOR_DEFAULT = '#a89a7d';

/** Resolve the display color for a modifier based on its tags. */
export function tagColor(tags: readonly string[]): string {
  for (const [needles, color] of TAG_COLOR_RULES) {
    if (needles.some((n) => tags.includes(n))) return color;
  }
  return TAG_COLOR_DEFAULT;
}

/** Capitalize the first letter of a string; empty string returns empty. */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Escape a string for safe embedding in HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
