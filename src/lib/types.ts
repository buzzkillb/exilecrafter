export type Rarity = 'normal' | 'magic' | 'rare' | 'unique';

export type ItemSlot =
  | 'helmet'
  | 'body_armour'
  | 'gloves'
  | 'boots'
  | 'belt'
  | 'amulet'
  | 'ring'
  | 'weapon_1h'
  | 'weapon_2h'
  | 'offhand'
  | 'shield'
  | 'quiver'
  | 'focus'
  | 'flask'
  | 'charm'
  | 'jewel'
  | 'waystone'
  | 'tablet'
  | 'relic';

export type ModType = 'prefix' | 'suffix' | 'implicit' | 'enchant' | 'corrupted' | 'desecrated' | 'unique';

export type ModTag =
  | 'life'
  | 'mana'
  | 'energy_shield'
  | 'armour'
  | 'evasion'
  | 'fire'
  | 'cold'
  | 'lightning'
  | 'chaos'
  | 'physical'
  | 'elemental'
  | 'damage'
  | 'attack'
  | 'caster'
  | 'minion'
  | 'aura'
  | 'speed'
  | 'critical'
  | 'attribute'
  | 'ailment'
  | 'curse'
  | 'resistance'
  | 'gem'
  | 'spirit'
  | 'ward'
  | 'rune';

export interface StatRange {
  min: number;
  max: number;
}

export interface Mod {
  id: string;
  name: string;
  type: ModType;
  domain: ItemSlot[];
  tier: number;
  level: number;
  tags: ModTag[];
  description: string;
  statRanges: Array<{
    stat: string;
    range: StatRange;
  }>;
  weight?: number;
  modGroup?: string;
  source?: string;
  /** For jewel extra mods: 'liquid' | 'desecrated' | 'corrupted' | 'corruption_upgrade' */
  jewelSubtype?: string;
  /** For liquid mods, the associated Distilled Emotion currency name */
  liquidCurrencyName?: string;
}

export interface BaseItem {
  id: string;
  name: string;
  slot: ItemSlot;
  subSlot?: string;
  rarity: Rarity;
  level: number;
  attributes: {
    str?: number;
    dex?: number;
    int?: number;
  };
  implicit?: string;
  baseStats: Record<string, number | string>;
  imageUrl?: string;
  affixSlots: {
    prefix: number;
    suffix: number;
  };
  family: string;
  variant?: 'runeforged' | 'runemastered' | 'normal';
  source: 'poe2db';
}

export interface Currency {
  id: string;
  name: string;
  tier: 'lesser' | 'normal' | 'greater' | 'perfect' | 'corrupted';
  category:
    | 'upgrade_rarity'
    | 'augment'
    | 'reroll'
    | 'remove'
    | 'essence'
    | 'annul'
    | 'divine'
    | 'corrupt'
    | 'desecrate'
    | 'breach'
    | 'special';
  appliesTo: ItemRarity[];
  description: string;
  mechanics: string;
  imageUrl?: string;
  stackSize?: number;
}

export type ItemRarity = 'normal' | 'magic' | 'rare' | 'unique' | 'any';

export interface Omen {
  id: string;
  name: string;
  appliesTo: string[];
  description: string;
  effect: string;
  imageUrl?: string;
}

export interface Essence extends Currency {
  category: 'essence';
  guaranteedMod: string;
  tier: 'lesser' | 'normal' | 'greater' | 'perfect' | 'corrupted';
  removesRandom?: boolean;
}

export interface CraftingMethod {
  id: string;
  name: string;
  description: string;
  steps: string[];
  bestFor: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export interface Season {
  id: string;
  name: string;
  version: string;
  detectedAt: string;
  source: string;
}

export interface WeightEntry {
  baseId: string;
  modId: string;
  weight: number;
  source: 'krakenbul' | 'trade-scraped' | 'estimated';
  notes?: string;
}
