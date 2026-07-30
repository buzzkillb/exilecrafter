/**
 * Omen effect parsing + categorization rules.
 * Pure functions — no DOM, no state.
 */

export interface OmenOpt {
  id: string;
  name: string;
  effect: string;
  imageUrl?: string;
}

/** Rules: regex → omen effect descriptor */
export const OMEN_EFFECT_RULES: Array<[RegExp, () => any]> = [
  // Greater Exaltation (double add) must be checked before generic dextral/sinistral patterns
  [/greater.*exaltation/, () => ({ kind: 'double_add' })],
  // Annulment-specific directional omens. poe2db effect wording:
  //   Omen of Dextral Annulment   → "...will remove only suffix modifiers"
  //   Omen of Sinistral Annulment → "...will remove only prefix modifiers"
  // The omens' *name* contains dextral/sinistral, but the *effect text* only
  // mentions "remove only prefix/suffix modifiers" + "Orb of Annulment".
  // Match on the effect text (this is what parseOmenEffect receives) so we
  // cover both the name and the description.
  [/annulment.*remove only suffix modifiers|remove only suffix modifiers.*annulment/, () => ({ kind: 'remove_type', value: 'suffix' })],
  [/annulment.*remove only prefix modifiers|remove only prefix modifiers.*annulment/, () => ({ kind: 'remove_type', value: 'prefix' })],
  // Omen of Greater Annulment → "next Orb of Annulment will remove two modifiers"
  // (poe2db id: omen_of_greater_annulment). Must precede the generic annulment
  // rules above so it captures the count instead of the type.
  [/annulment.*remove two modifiers|remove two modifiers.*annulment/, () => ({ kind: 'remove_count', value: 2 })],
  // Omen of Light → "next Orb of Annulment will remove only Desecrated modifiers"
  // (poe2db id: omen_of_light). The annulment code already handles this kind.
  [/annulment.*remove only desecrated|remove only desecrated.*annulment/, () => ({ kind: 'remove_only_desecrated' })],
  [/sinistral/, () => ({ kind: 'force_type', value: 'prefix' })],
  [/dextral/, () => ({ kind: 'force_type', value: 'suffix' })],
  [/whittling/, () => ({ kind: 'force_annul' })],
  [/erasure/, () => ({ kind: 'force_annul_fraction' })],
  [/same type as an existing modifier/, () => ({ kind: 'force_homogenise' })],
  [/ulaman/, () => ({ kind: 'desecrate_faction', value: 'ulaman' })],
  [/amanamu/, () => ({ kind: 'desecrate_faction', value: 'amanamu' })],
  [/kurgal/, () => ({ kind: 'desecrate_faction', value: 'kurgal' })],
  [/desecrated affixes/, () => ({ kind: 'remove_only_desecrated' })],
  [/implicit/, () => ({ kind: 'divine_implicit_only' })],
  [/sanctif/, () => ({ kind: 'divine_upgrade' })],
  [/catalysing|catalyst/, () => ({ kind: 'exalted_consumes_catalyst' })],
  [/abyssal/, () => ({ kind: 'replace_all_desecrate' })],
  [/putrefaction/, () => ({ kind: 'desecrate_reroll' })],
  [/sinistral.*necromancy/, () => ({ kind: 'desecrate_minion', value: 'prefix' })],
  [/dextral.*necromancy/, () => ({ kind: 'desecrate_minion', value: 'suffix' })],
  [/crystallisation/, () => ({ kind: 'perfect_orb_implicit_upgrade' })],
  [/chaotic effectiveness/, () => ({ kind: 'chaos_effectiveness' })],
  [/chaotic monsters/, () => ({ kind: 'chaos_monsters' })],
  [/chaotic quantity/, () => ({ kind: 'chaos_quantity' })],
  [/chaotic rarity/, () => ({ kind: 'chaos_rarity' })],
  [/random unique|ancients/, () => ({ kind: 'specific_unique', for: 'orb_of_chance' })],
];

export const OMEN_EFFECT_DEFAULT = { kind: 'force_type', value: 'prefix' };

export function parseOmenEffect(o: OmenOpt | undefined): any {
  if (!o) return OMEN_EFFECT_DEFAULT;
  // Match on BOTH the omen name and the effect text. poe2db places the
  // directional word ("dextral" / "sinistral") in the *name* but the action
  // description ("remove only suffix modifiers", "add only prefix modifiers")
  // in the *effect* text. Either source alone is incomplete.
  const haystack = `${o.name || ''} ${o.effect || ''}`.toLowerCase();
  for (const [re, build] of OMEN_EFFECT_RULES) {
    if (re.test(haystack)) return build();
  }
  return OMEN_EFFECT_DEFAULT;
}

/** Map omen name → category for the popover grid */
export const OMEN_CATEGORY_RULES: Array<[RegExp, string]> = [
  [/saga$/, 'Saga'],
  [/ancients|blackblooded|liege|sovereign/, 'Faction'],
  [/alchemy/, 'Alchemy'],
  [/coronation/, 'Coronation'],
  [/exaltation/, 'Exaltation'],
  [/annulment/, 'Annulment'],
  [/erasure/, 'Erasure'],
  [/crystallisation/, 'Crystallisation'],
  [/necromancy/, 'Necromancy'],
  [/chance/, 'Chance'],
  [/whittling/, 'Whittling'],
  [/abyssal/, 'Abyssal'],
  [/putrefaction/, 'Putrefaction'],
  [/light/, 'Light'],
  [/refreshment|resurgence|amelioration|bartering|answered|catalysing|chaotic|corruption/, 'Other'],
];

export function categorizeOmen(name: string): string {
  const n = name.toLowerCase();
  for (const [re, cat] of OMEN_CATEGORY_RULES) {
    if (re.test(n)) return cat;
  }
  return 'Other';
}
