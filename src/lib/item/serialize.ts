// src/lib/item/serialize.ts
// Inverse of parse-paste: turn a current item state into the same
// clipboard text the in-game Ctrl+C uses. Pure function.

import type { ParsedAffix } from './types.ts';

/** Convert internal slot key to the slot label the in-game clipboard uses. */
const SLOT_TO_CLASS: Record<string, string> = {
  amulet: 'Amulets',
  belt: 'Belts',
  body_armour: 'Body Armours',
  boots: 'Boots',
  charm: 'Charms',
  focus: 'Focuses',
  gloves: 'Gloves',
  helmet: 'Helmets',
  jewel: 'Jewels',
  quiver: 'Quivers',
  ring: 'Rings',
  shield: 'Shields',
  weapon_1h: 'One Handed Weapons',
  weapon_2h: 'Two Handed Weapons',
  waystone: 'Waystones',
  tablet: 'Tablets',
  relic: 'Relics',
  bracelet: 'Bracelets',
  flask: 'Flasks',
};

const RARITY_FROM_KEY: Record<string, string> = {
  normal: 'Normal',
  magic: 'Magic',
  rare: 'Rare',
  unique: 'Unique',
};

export interface SerializedItem {
  itemClass?: string;
  slot: string;
  rarity: string;
  baseName: string;
  itemName?: string;
  itemLevel: number;
  implicit?: string | null;
  affixes: ParsedAffix[];
  corrupted?: boolean;
  fractured?: boolean;
}

/**
 * Produce the PoE2 ctrl+c clipboard text for an item.
 * Pure function — no DOM, no side effects.
 *
 * Format:
 *   Item Class: <Class>
 *   Rarity: <Rarity>
 *   <Item Name>          (unique-name line; optional)
 *   <Base Name>
 *   --------
 *   Item Level: <N>
 *   --------
 *   <implicit>
 *   --------
 *   <prefixes>
 *   --------
 *   <suffixes>
 *   --------
 *   Corrupted
 */
export function itemToText(item: SerializedItem): string {
  const lines: string[] = [];
  const itemClass = item.itemClass ?? SLOT_TO_CLASS[item.slot] ?? item.slot;
  const rarity = RARITY_FROM_KEY[item.rarity.toLowerCase()] ?? 'Rare';

  lines.push(`Item Class: ${itemClass}`);
  lines.push(`Rarity: ${rarity}`);
  if (item.itemName) lines.push(item.itemName);
  lines.push(item.baseName);
  lines.push('--------');
  lines.push(`Item Level: ${item.itemLevel}`);
  lines.push('--------');
  if (item.implicit) {
    lines.push(`${item.implicit} (implicit)`);
    lines.push('--------');
  }
  const prefixes = item.affixes.filter((a) => a.type === 'prefix');
  const suffixes = item.affixes.filter((a) => a.type === 'suffix');
  for (const a of prefixes) lines.push(a.name);
  if (prefixes.length > 0 && suffixes.length > 0) lines.push('--------');
  for (const a of suffixes) lines.push(a.name);
  if (item.corrupted) {
    lines.push('--------');
    lines.push('Corrupted');
  }
  if (item.fractured && !item.corrupted) {
    lines.push('--------');
    lines.push('Fractured');
  }
  return lines.join('\n');
}

/** Exposed so other call sites can re-use it if they need to format headers. */
export { SLOT_TO_CLASS };
