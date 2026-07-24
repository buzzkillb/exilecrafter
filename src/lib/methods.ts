// src/lib/methods.ts
// Curated crafting guides with real Monte Carlo simulation support.
// Only expert guides remain — basic methods were removed as clutter.

import type { CraftingMethod } from './types';

export const METHODS: CraftingMethod[] = [
  {
    id: 'boot_crafting_t1',
    name: 'T1 Triple-Suffix Boots (ES Recharge variant)',
    description:
      'Full deterministic path to craft ilvl 82 exceptional boots with T1 MS, triple T1 ES suffixes (double res + ES recharge rate), and T1 ES prefixes. Uses fracturing, chaos spam, Dextral + Greater exaltations, Perfect Exalt, Preserved Rib, and Omen of Light Jail. Real expected cost: ~30–50 div per successful craft.',
    steps: [
      'Buy an exceptional base with 35% MS and ilvl 82 (Sekhema Sandals or equivalent).',
      'Fracture Orb the Movement Speed — locks T1 MS as a permanent prefix.',
      'Annulment + Chaos spam until you hit T1 Cold or Fire resistance (use Flux Omens to target the element you need).',
      'Activate Omen of Dextral Crystallisation → forces next exalt to add a prefix.',
      'Activate Omen of Greater Exaltation → next exalt adds 2 affixes.',
      'Use Dextral Exaltation + Perfect Exalted Orb → adds 2 T1 prefixes (guaranteed tier-1 rolls).',
      'If it hits triple resist (two T1 res + any third prefix), great! Otherwise repeat step 3+.',
      'Apply Preserved Rib (armour prefix) → adds a desecrated prefix (hybrid ES + stun threshold or ES mod).',
      'Use Perfect Exalted Orb for the 3rd prefix → forces flat ES +% ES combination.',
      'Activate Omen of Light Jail → desecrated prefix becomes permanent.',
      'Finish with a 2nd Perfect Exalted Orb for the remaining ES prefix.',
      'Result: T1 MS, T1 ES%, T1 flat ES / triple T1 suffix (cold res, fire res, ES recharge rate).',
    ],
    bestFor: ['T1 triple-res ES boots', 'endgame ES stackers', '30–50 div budget', 'ES recharge rate suffix seekers'],
    difficulty: 'expert',
  },
  {
    id: 'jewel_crafting',
    name: 'Endgame Jewel Crafting (5-mod target)',
    description:
      'Craft top-tier 5+ mod jewels by stacking bonus affix slots via Liquids, Desecration, and targeted Orb priority. This method relies on the PoE2 jewel affix system where Diamond-base jewels have 3 prefix + 3 suffix slots, plus bonus slots from Potent Liquid Contempt (+1 suffix allowed) and Potent Liquid Ferocity (Increased Effect of Suffixes).',
    steps: [
      'Normal Diamond → Orb of Transmutation (1 random prefix).',
      'Orb of Augmentation → Magic (adds the missing prefix or suffix).',
      'Regal Orb → Rare (adds a 3rd affix, ~50/50 prefix or suffix).',
      'Exalted Orb ×3 → fill to 3 prefix + 3 suffix (6 affixes).',
      'Potent Liquid Contempt → removes a random mod then adds +1 Prefix/Suffix Modifier allowed (bonus slot). Exalted into the new slot → 7 affixes.',
      '(Optional) Potent Liquid Ferocity → removes a random mod, adds (40—60)% increased Effect of Suffixes/Prefixes.',
      '(Optional) Preserved Cranium → adds a Desecrated mod from real poe2db scraped pool (42 affixes across Ulaman/Amanamu/Kurgal factions).',
      '(Optional) Omen of Abyssal Echoes → rerolls the Desecration pool before picking.',
      '(Optional) Fracturing Orb ≥4 mods → locks one random mod in place.',
    ],
    bestFor: ['endgame jewel crafts', 'Diamond bases', '+1 suffix bonus slot stacking', 'Desecration synergies'],
    difficulty: 'expert',
  },
];

export function getMethod(id: string): CraftingMethod | undefined {
  return METHODS.find((m) => m.id === id);
}
