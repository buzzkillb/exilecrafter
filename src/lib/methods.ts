// src/lib/methods.ts
// Curated crafting guides / flowcharts for common newbie goals.
// These are hand-authored content, not scraped. Updated alongside the site.

import type { CraftingMethod } from './types';

export const METHODS: CraftingMethod[] = [
  {
    id: 'transmute_aug_regal',
    name: 'Transmute → Augment → Regal',
    description:
      'The cheapest Magic → Rare path. Use up to 2 affixes on a magic item, then Regal to add a third. Ideal for filling slot 1 of a Rare when you just need "any rare with 3 affixes to start".',
    steps: [
      'Drop a Normal base.',
      'Orb of Transmutation → Magic (1 random affix).',
      'Orb of Augmentation → Magic (adds the missing prefix OR suffix).',
      'Regal Orb → Rare (adds a 3rd affix, ~50/50 prefix or suffix).',
      'Optional: Regal with Omen of Sinistral/Dextral Coronation to force the new affix type.',
    ],
    bestFor: ['budget starter rares', 'filling 3-mod bases', 'act 1-3 progression'],
    difficulty: 'beginner',
  },
  {
    id: 'al_then_exalt',
    name: 'Alchemy → Exalted spam',
    description:
      'Roll a Rare with 4 affixes via Alchemy, then Exalted to add a 5th and 6th. Each Exalted picks a random new mod from the pool.',
    steps: [
      'Normal base → Orb of Alchemy (4 affixes, 2 prefix + 2 suffix).',
      'Check the result. If a "brick" (useless mod), Chaos Orb to reroll all 4.',
      'Exalted Orb → adds 1 affix (random type).',
      'Exalted again → 6 affixes (full rare).',
      'Omens to control slot distribution: Sinistral/Dextral Exaltation, Homogenising Exaltation.',
    ],
    bestFor: ['mid-tier rares', 'high-volume crafting', 'learners'],
    difficulty: 'beginner',
  },
  {
    id: 'essence_crafting',
    name: 'Essence spamming',
    description:
      'An Essence upgrades a Normal item to Rare and guarantees one specific mod. Spam the same essence to roll guaranteed mod + 3 random affixes until you hit your other goals.',
    steps: [
      'Pick an Essence tier (Lesser < Normal < Greater < Perfect).',
      'Normal base + Essence → guaranteed mod + 3 random affixes (Rare).',
      'If too low-tier, Annul down to 1 affix, Augment back up, repeat.',
      'Or Chaos Orb to reroll the random affixes while keeping the essence mod locked.',
      'Perfect Essence removes 1 random mod and adds the guaranteed one — pair with Omen of Sinistral/Dextral Crystallisation to control which type gets removed.',
    ],
    bestFor: ['guaranteed life/resist crafts', 'deterministic starter builds'],
    difficulty: 'beginner',
  },
  {
    id: 'alt_regal_until',
    name: 'Alteration → Regal (target roll)',
    description:
      'Spam Orbs of Alteration on a Normal base until you hit a desired prefix OR suffix, then Regal to Rare. Best for single-target crafts where you only need ONE specific mod.',
    steps: [
      'Normal base → Orb of Alteration (rerolls 1 prefix + 1 suffix; ~1/4 magic per try).',
      'Check if the affix is your target. If yes → Regal Orb to upgrade to Rare.',
      'If no, Alt again. Repeat until hit.',
      'Once Rare, use Annul + Augment or Chaos to round out the other affixes.',
    ],
    bestFor: ['single-target crafts (specific life roll, specific resist)', 'low budget'],
    difficulty: 'intermediate',
  },
  {
    id: 'desecrated_crafting',
    name: 'Desecration crafts',
    description:
      'Use Ancient/Preserved/Gnawed bones to add a Desecrated affix from one of three factions (Ulaman, Amanamu, Kurgal). Can replace an existing affix when slots are full.',
    steps: [
      'Start with a Rare item (the slot dictates which bone: Collarbone for jewellery, Jawbone for weapons, Rib for armour, Cranium for jewels).',
      'Apply bone → rolls 1 Desecrated affix from a random faction.',
      'Use Omen of the Blackblooded / Liege / Sovereign to lock to one faction.',
      'Omen of Putrefaction → replaces ALL affixes with up to 6 Desecrated and corrupts.',
      'Omen of Abyssal Echoes → grants one reroll on the same Desecration result.',
    ],
    bestFor: ['endgame crafts', 'faction-locked build enablers', 'corruption synergies'],
    difficulty: 'advanced',
  },
  {
    id: 'breachstone_crafting',
    name: 'Breachstone crafting',
    description:
      'Breachstones (Xoph, Tul, Esh, Uul-Netol, Chayula) and their Charged/Enriched/Pure/Flawless variants add Area modifiers and rewards. Not for gear but for endgame mapping.',
    steps: [
      'Acquire a base Breachstone.',
      'Use Charged / Enriched / Pure / Flawless variants for higher area modifiers and reward density.',
      'Run in mapping for high-quantity, high-rarity loot.',
    ],
    bestFor: ['endgame mapping', 'divination card farming', 'currency generation'],
    difficulty: 'beginner',
  },
  {
    id: 'corruption_crafting',
    name: 'Vaal Orb corruption',
    description:
      'Vaal Orb corrupts an item, locking in current affixes but potentially adding powerful implicit modifiers. 25% chance to brick (turn white).',
    steps: [
      'Craft the item to its near-final state (you only get one Vaal shot).',
      'Vaal Orb → corrupted (locks affixes, adds implicit).',
      'On rare items, can also add implicit via specific Vaal mechanics.',
    ],
    bestFor: ['finishing builds', 'high-risk high-reward upgrades'],
    difficulty: 'intermediate',
  },
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
