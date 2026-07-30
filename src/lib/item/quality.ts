// src/lib/item/quality.ts
// Pure functions for PoE2 quality mechanics.
//
// Quality on gear boosts the values of matching modifier tags.
//   - Armourer's Scrap → +20% Armour/Evasion/ES
//   - Blacksmith's Whetstone → +20% Physical Damage
//   - Catalysts → quality that matches a specific mod family (Fire, Cold, etc.)
//
// The paste from poe2db shows base rolled values (e.g., "+17(10-20)%").
// In-game, the actual values shown are quality-boosted (e.g., "+20%").
// This module bridges that gap.

/**
 * Maps a quality category string (from the paste text) to the mod tags it boosts.
 * 
 * Examples:
 *   "Quality (Fire Modifiers): +20%" → category "Fire Modifiers" → matches tag "fire"
 *   "Quality: +20%" (generic armour) → category null → matches all defence tags
 */
const QUALITY_TAG_MAP: Record<string, string[]> = {
  'fire modifiers': ['fire'],
  'cold modifiers': ['cold'],
  'lightning modifiers': ['lightning'],
  'attack modifiers': ['attack'],
  'spell modifiers': ['spell'],
  'attribute modifiers': ['attribute', 'strength', 'dexterity', 'intelligence'],
  'defence modifiers': ['armour', 'evasion', 'energy_shield'],
  'life modifiers': ['life'],
  'mana modifiers': ['mana'],
  'chaos modifiers': ['chaos'],
  'physical modifiers': ['physical'],
  'elemental modifiers': ['elemental', 'fire', 'cold', 'lightning'],
};

/**
 * Check whether a mod with the given descriptive tags is boosted by the quality category.
 *
 * @param affixTags        Tags from the mod header (e.g., ["Elemental", "Fire", "Cold", "Lightning"])
 * @param qualityCategory  Quality category text (e.g., "Fire Modifiers", null for generic)
 * @returns                true if the mod's tags match the quality category
 */
export function qualityMatchesAffixTags(
  affixTags: string[] | null | undefined,
  qualityCategory: string | null | undefined,
): boolean {
  if (!affixTags || affixTags.length === 0) return false;
  if (!qualityCategory) return false;

  const normalized = qualityCategory.toLowerCase().trim();
  const matchTags = QUALITY_TAG_MAP[normalized] ?? [normalized];
  const lowerTags = affixTags.map((t) => t.toLowerCase());

  return matchTags.some((mt) => lowerTags.includes(mt));
}

/**
 * Apply the quality multiplier to the first numeric value in a text string.
 *
 * e.g. "+17(10-20)% to all Elemental Resistances" with +20% quality
 *   → the rolled value 17 gets boosted: 17 × 1.2 = 20.4 → floored to 20
 *   → result: "+20(10-20)% to all Elemental Resistances"
 *
 * Only the FIRST numeric value is boosted (the rolled value).
 * The range values in parens are left unchanged (they represent base ranges).
 *
 * @param text        The affix display text (e.g., "+17(10-20)% to all Elemental Resistances")
 * @param multiplier  Boost multiplier. +20% quality → 1.20
 * @returns           Text with the first numeric value boosted
 */
export function boostFirstValue(text: string, multiplier: number): string {
  return text.replace(/([+-]?\d+)/, (match) => {
    const val = parseInt(match, 10);
    if (isNaN(val)) return match;
    const boosted = Math.floor(val * multiplier);
    // Preserve the leading '+' if the original had one
    const prefix = match.startsWith('+') ? '+' : '';
    return prefix + String(boosted);
  });
}

/**
 * Extract the quality multiplier from a quality-parsed object.
 * qualityParsed.value is a percentage (e.g., 20 for +20%).
 *
 * @param qualityPercent  e.g. 20 (meaning +20%)
 * @returns               Multiplier e.g. 1.20
 */
export function qualityPercentToMultiplier(qualityPercent: number): number {
  return 1 + qualityPercent / 100;
}

/**
 * Apply quality boosts to an entire ParsedPaste.
 * Returns a new ParsedPaste with affix names boosted where tags match the quality category.
 *
 * @param paste  The parsed paste from poe2db (base rolled values)
 * @returns      A new ParsedPaste with quality-boosted affix display text
 */
export function applyQualityToPaste(paste: {
  affixes: Array<{
    name: string;
    descriptiveTags: string[] | null;
    type: string;
    tier: number | null;
    crafted?: boolean;
    desecrated?: boolean;
  }>;
  qualityParsed: { category: string | null; value: number } | null;
}): {
  affixes: Array<{
    name: string;
    descriptiveTags: string[] | null;
    type: string;
    tier: number | null;
    crafted?: boolean;
    desecrated?: boolean;
  }>;
} {
  if (!paste.qualityParsed || paste.qualityParsed.value <= 0) {
    return { affixes: paste.affixes };
  }

  const category = paste.qualityParsed.category;
  const multiplier = qualityPercentToMultiplier(paste.qualityParsed.value);
  const boostedAffixes = paste.affixes.map((affix) => {
    if (multiplier === 1.0) return affix;

    // Check if this affix's tags match the quality category
    // We only boost the display text — the rolled values are preserved for craft calculations
    if (qualityMatchesAffixTags(affix.descriptiveTags, category)) {
      return {
        ...affix,
        name: boostFirstValue(affix.name, multiplier),
      };
    }
    return affix;
  });

  return { affixes: boostedAffixes };
}

/**
 * Maps the internal catalyst category (as produced by emulator.catalystOrb) to
 * the descriptive-tags it should boost.
 *
 *   'life mana'  -> life, mana
 *   'caster'     -> spell, caster
 *   'attack'     -> attack
 *   'elemental'  -> fire, cold, lightning, elemental
 *   'chaos'      -> chaos
 *   'physical'   -> physical
 *   'defence'    -> armour, evasion, energy_shield, ward, rune
 *   'generic'    -> (no boost)
 */
export const CATALYST_TAG_MAP: Record<string, string[]> = {
  'life mana':  ['life', 'mana'],
  'caster':     ['spell', 'caster'],
  attack:       ['attack'],
  elemental:    ['fire', 'cold', 'lightning', 'elemental'],
  chaos:        ['chaos'],
  physical:     ['physical'],
  defence:      ['armour', 'evasion', 'energy_shield', 'ward', 'defence', 'defences', 'shield'],
  generic:      [],
};

/**
 * Check whether an emulator-style Affix (which carries its own tags array) is
 * boosted by a given catalyst category. Returns true if any of the affix's
 * tags intersect the catalyst's tag list.
 */
export function catalystBoostsAffix(
  affixTags: string[] | null | undefined,
  catalystType: string,
): boolean {
  if (!affixTags || affixTags.length === 0) return false;
  const boostTags = CATALYST_TAG_MAP[catalystType];
  if (!boostTags || boostTags.length === 0) return false;
  const lower = affixTags.map((t) => t.toLowerCase());
  return lower.some((t) => boostTags.includes(t));
}

/**
 * Apply catalyst quality to a list of emulator-style Affix objects.
 * Returns a new array; affixes whose tags match the catalyst's tag list have
 * their first numeric value in `name` boosted by the quality multiplier.
 *
 * @param affixes  Array of Affix objects (see src/lib/emulator.ts)
 * @param quality  { type, value } or null
 * @returns        New array of affixes (unchanged refs for non-matching ones)
 */
export function applyCatalystQuality<
  T extends { name: string; tags: string[] },
>(
  affixes: readonly T[],
  quality: { type: string; value: number } | null,
): T[] {
  if (!quality || quality.value <= 0) return [...affixes];
  const multiplier = 1 + quality.value / 100;
  return affixes.map((a) => {
    if (multiplier === 1.0) return a;
    if (!catalystBoostsAffix(a.tags, quality.type)) return a;
    return { ...a, name: boostFirstValue(a.name, multiplier) };
  });
}
