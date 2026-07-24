/**
 * Crafting examples — curated base + description + suggested goal
 * Called from Astro frontmatter at build time with the resolved bases array.
 */
import type { BaseItem } from '../types';

export interface CraftingExample {
  id: string;
  name: string;
  tag: string;
  description: string;
  goal: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export function getCraftingExamples(bases: BaseItem[]): CraftingExample[] {
  return [
    {
      id: bases.find((b) => b.name === 'Sapphire')?.id || '',
      name: 'Sapphire Jewel',
      tag: '💎 Expert',
      description: 'Craft a top-tier jewel using Essences, Liquid Emotions, Desecration & Fracturing.',
      goal: '5-mod jewel with 40-60% increased Effect of Suffixes',
      difficulty: 'expert',
    },
    {
      id: bases.find((b) => b.name === 'Ancestral Tiara')?.id || '',
      name: 'Ancestral Tiara',
      tag: '🎯 Endgame',
      description: 'High-end Energy Shield helmet. Roll life, resistances, and mana with real tier gates.',
      goal: '3P/3S ES helmet at ilvl 80',
      difficulty: 'advanced',
    },
    {
      id: bases.find((b) => b.name === 'Flying Spear')?.id || '',
      name: 'Flying Spear',
      tag: '🗡️ Weapon',
      description: 'One-handed spear with physical damage, attack speed, and crit chance.',
      goal: '3P/3S DPS weapon at ilvl 78',
      difficulty: 'advanced',
    },
    {
      id: bases.find((b) => b.name === 'Gold Amulet')?.id || '',
      name: 'Gold Amulet',
      tag: '📿 Amulet',
      description: 'High-end jewellery base with increased Rarity of Items Found. Roll life, resists, spirit.',
      goal: '3P/2S magic-find amulet at ilvl 80',
      difficulty: 'advanced',
    },
    {
      id: bases.find((b) => b.name === 'Gold Ring')?.id || '',
      name: 'Gold Ring',
      tag: '💍 Rings',
      description: 'Top-tier ring base with innate increased rarity. Roll resists, damage, attributes.',
      goal: '2P/2S MF ring at ilvl 80 for mapping',
      difficulty: 'advanced',
    },
    {
      id: bases.find((b) => b.name === 'Two-Stone Ring')?.id || '',
      name: 'Two-Stone Ring',
      tag: '💍 Rings',
      description: 'Versatile leveling ring with dual elemental resistances. Easy to craft.',
      goal: '2P/2S ring for early endgame',
      difficulty: 'intermediate',
    },
    {
      id: bases.find((b) => b.name === 'Tasalian Greaves')?.id || '',
      name: 'Tasalian Greaves',
      tag: '👢 Boots',
      description: 'High-end evasion/ES boots. Roll movement speed, resistances, and attributes.',
      goal: '2P/2S endgame boots at ilvl 80',
      difficulty: 'advanced',
    },
    {
      id: bases.find((b) => b.name === 'Waystone (Tier 15)')?.id || '',
      name: 'Waystone (Tier 15)',
      tag: 'Endgame',
      description: 'T15 waystone — Vaal to T16 for max-tier mapping.',
      goal: 'Roll quantity, rarity, and pack size — Vaal for corruption + tier upgrade',
      difficulty: 'advanced',
    },
    {
      id: bases.find((b) => b.name === 'Warlord Cuirass')?.id || '',
      name: 'Warlord Cuirass',
      tag: '🛡️ Armour',
      description: 'High-level body armour. Roll life, resistances, and armour/ES hybrid mods.',
      goal: '3P/3S endgame chest at ilvl 80',
      difficulty: 'intermediate',
    },
    {
      id: bases.find((b) => b.name === 'Solar Amulet')?.id || '',
      name: 'Solar Amulet',
      tag: '📿 Mid-Level',
      description: 'All-around amulet craft. Roll +spirit, resistances, and attributes.',
      goal: '2P/2S amulet at ilvl 30',
      difficulty: 'intermediate',
    },
    {
      id: bases.find((b) => b.name === 'Broadhead Quiver')?.id || '',
      name: 'Broadhead Quiver',
      tag: '🏹 Quiver',
      description: 'Budget quiver craft. Roll increased damage, attack speed, and crit chance.',
      goal: '2P/2S damage quiver at ilvl 1',
      difficulty: 'beginner',
    },
  ];
}
