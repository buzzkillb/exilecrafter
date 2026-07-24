// src/lib/item/types.ts
// Pure types for the crafting simulator.
// No runtime imports — these shapes cross every item-related module.

/**
 * Where a modifier originates in the item pipeline.
 *   prefix/suffix — common magic-mod slots
 *   implicit      — base-defined mod (not rerollable)
 *   enchantment   — corruption / soul / sanctum alteration
 *   corruption    — corruption outcome
 *   desecrated    — desecrated altar outcome
 *   rune          — socketed rune mod
 */
export type GenerationType =
  | 'prefix'
  | 'suffix'
  | 'implicit'
  | 'enchantment'
  | 'corruption'
  | 'desecrated'
  | 'rune';

export type Rarity = 'Normal' | 'Magic' | 'Rare' | 'Unique';

/**
 * An affix as parsed from a pasted item.
 * After the simulator imports it, this shape can upgrade to the
 * emulator's Affix interface (see src/lib/emulator.ts) once
 * the local mod DB has matched it.
 */
export interface ParsedAffix {
  /**
   * Prefix/Suffix/Implicit/Unique — wiki headers and in-game headers share this.
   * Unique appears only on items with unique modifiers (e.g. The Taming).
   */
  type: 'prefix' | 'suffix' | 'implicit' | 'unique';
  /** Tier 1 = best. Null for implicit. */
  tier: number | null;
  /** The rolled display text, e.g. "+118(100-119) to maximum Life". */
  name: string;
  /** Wiki headers include a quoted display name ("Virile", "of Bameth"). null in in-game format. */
  descriptiveName: string | null;
  /** Wiki headers include tag list ("Life", "Elemental, Fire, Resistance"). null in in-game format. */
  descriptiveTags: string[] | null;
  crafted: boolean;
  desecrated: boolean;
  /** Numeric range, derived from the rolled-text parens, when applicable. */
  range: { min: number; max: number } | null;
  /** The numeric value rolled, when applicable. */
  rolled: number | null;
}

export interface ParsedRune {
  /** Rune name, e.g. "Raven-Touched". */
  name: string;
}

export interface ParsedEnchantment {
  /** Block contents, e.g. "Allocates Zarokh's Gift — Unscalable Value". */
  raw: string;
}

/**
 * The full output of parsing one clipboard paste.
 * Two-line structure of PoE2:
 *   - the OS header (`Item Class` / `Rarity` / name / base)
 *   - the mod table (prefix/suffix tiers + rolled text)
 *   - corruptions (lines like "Corrupted" / "Twice Corrupted")
 *   - runes (lines like "Raven-Touched (rune)")
 *   - enhancement blocks (`{ Enhancement }` — `Allocates …`)
 */
export interface ParsedPaste {
  itemClass: string;
  rarity: Rarity;
  /** The rolled unique or rare name, if any. e.g. "Cataclysm Ward". */
  itemName: string;
  /** The base item name. e.g. "Ancestral Tiara". */
  baseName: string;
  itemLevel: number;
  /** Quality line if present, e.g. "+20%". Raw text from clipboard. */
  quality: string | null;
  /** Structured quality info (parsed from quality line). null if no quality line. */
  qualityParsed: { text: string; category: string | null; value: number } | null;
  /** Implicit mod text if a separate implicit modifier block existed. */
  implicit: string | null;
  affixes: ParsedAffix[];
  runes: ParsedRune[];
  enchantments: ParsedEnchantment[];
  /** 0 = clean, 1 = "Corrupted", 2 = "Twice Corrupted". */
  corruptionLevel: 0 | 1 | 2;
  /** Lines we couldn't classify — surfaced as warnings, never silently dropped. */
  unknownLines: string[];
  /** Detected descriptive names of corruption outcomes (e.g. "Enhancement", "Corruption Enhancement — Attack"). */
  enhancementNames: string[];
  /** Resolved base record (if found). Same lookup logic as findBaseByName — exposed here
   *  so call sites don't have to redo the work after parsePaste() returns. */
  base: BaseLike | null;
}

/** Subset of BaseItem fields used by pure functions. Mirrors the minimum the simulator passes in. */
export interface BaseLike {
  id: string;
  name: string;
  slot: string;
  level: number;
}

/** Result of looking up a base by free-text name. */
export interface BaseLookupResult {
  base: BaseLike;
  matchedOn: 'exact' | 'endsWith' | 'containsBase' | 'containsPasted';
}
