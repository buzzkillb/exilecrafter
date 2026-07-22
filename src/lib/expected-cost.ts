// src/lib/expected-cost.ts
// Probability & expected-cost calculations for crafting guidance.
// Used by the simulator to show tooltip odds and strategy recommendations.

export type Guidance = {
  summary: string;      // e.g. "Rerolls all affixes. Only use if item has zero keepers."
  when: string;         // e.g. "Best when your item has no desirable affixes."
  odds?: string;        // e.g. "~0.5% chance to hit a specific T1 prefix (199 eligible mods)"
  costNote?: string;    // e.g. "1 attempt = 1.00c. Expected ~40k Chaos for two specific mods."
};

// Eligible mod count per slot at a given ilvl
export function eligibleModCount(
  slot: string,
  ilvl: number,
  type: 'prefix' | 'suffix',
  mods: Array<{ domain: string[]; level: number; type: string }>,
): number {
  return mods.filter(
    (m) => m.domain.includes(slot) && m.level <= ilvl && m.type === type,
  ).length;
}

/** ~ Bernoulli: P(hit exactly k specific mods drawing n items from pool) */
export function hitSpecific(
  poolSize: number,
  targetCount: number,
  draws: number,
): number {
  if (poolSize < targetCount || draws < targetCount) return 0;
  // Hypergeometric: choose(targetCount, targetCount) * choose(poolSize - targetCount, draws - targetCount) / choose(poolSize, draws)
  function nCk(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  }
  return nCk(targetCount, targetCount) * nCk(poolSize - targetCount, draws - targetCount) / nCk(poolSize, draws);
}

export function guidanceFor(
  opId: string,
  itemRarity: string,
  slot: string,
  ilvl: number,
  prefixPoolSize: number,
  suffixPoolSize: number,
): Guidance {
  const base: Record<string, Guidance> = {
    orb_of_transmutation: {
      summary: 'Upgrades Normal → Magic, adding 1 random prefix.',
      when: 'Always the first step on a Normal item.',
      odds: `Rolls 1 prefix from ${prefixPoolSize} eligible mods.`,
      costNote: 'Cheapest orb — essential opening move.',
    },
    orb_of_augmentation: {
      summary: 'Adds the missing affix to a Magic item (1P→1P+1S or 1S→1P+1S).',
      when: 'Use right after Transmutation to fill both Magic slots.',
      costNote: 'Inexpensive way to get a 2nd mod before Regal.',
    },
    regal_orb: {
      summary: 'Upgrades Magic → Rare, adding 1 affix.',
      when: 'Use on a Magic item with 2 affixes you want to keep.',
      odds: `Adds 1 affix from ${prefixPoolSize + suffixPoolSize} eligible mods. ~${(
        100 / (prefixPoolSize + suffixPoolSize)
      ).toFixed(1)}% chance to hit a specific mod.`,
      costNote: `Expected ~${(prefixPoolSize + suffixPoolSize)} attempts (~${(
        (prefixPoolSize + suffixPoolSize) * 0.013
      ).toFixed(1)}c alt-spamming) for one specific mod.`,
    },
    exalted_orb: {
      summary: 'Adds 1 new affix to a Rare item with open slots.',
      when: 'Fill empty slots after Regal / before Vaal.',
      odds: `Adds 1 affix from ${prefixPoolSize + suffixPoolSize} eligible mods.`,
      costNote: `Cheapest orb in the game (~0.02c). Fill before expensive rerolls.`,
    },
    chaos_orb: {
      summary: 'Rerolls ALL affixes on a Rare item.',
      when: 'Only use if the item has ZERO desirable mods.',
      odds: hitSpecific(prefixPoolSize + suffixPoolSize, 1, 6) > 0.001
        ? `~${(hitSpecific(prefixPoolSize + suffixPoolSize, 2, 6) * 100).toFixed(2)}% to hit two specific prefixes on one roll.`
        : `~${(100 / (prefixPoolSize + suffixPoolSize)).toFixed(1)}% per specific mod.`,
      costNote: `1 attempt = 1c. For two specific mods, expected ~${Math.round(
        1 / hitSpecific(prefixPoolSize + suffixPoolSize, 2, 6),
      )}c on average.`,
    },
    orb_of_annulment: {
      summary: 'Removes 1 random affix from a Magic or Rare item.',
      when: 'Use to remove a bad affix, ideally with Sinister/Dextral omen to target type.',
      odds: itemRarity === 'rare'
        ? `~${(100 / 6).toFixed(0)}% per affix (6 total). Use an omen to target prefix/suffix.`
        : `~${(100 / 2).toFixed(0)}% per affix (2 total).`,
      costNote: 'Pair with Omen of Sinister/Dextral Annulment for targeted removal.',
    },
    divine_orb: {
      summary: 'Rerolls numeric values of all affixes without changing mod types.',
      when: 'Use after hitting correct mods with low rolls.',
      costNote: 'Much cheaper than re-crafting. Saves currency on good mods with bad values.',
    },
    vaal_orb: {
      summary: 'Corrupts the item — 25% upgrade, 25% modify, 25% no change, 25% destroyed.',
      when: 'ONLY use on a finished item you are willing to lose.',
      odds: '~25% upgrade chance per attempt.',
      costNote: `Expected ${Math.ceil(1 / 0.25)} attempts to hit an upgrade outcome.`,
    },
    orb_of_fusing: {
      summary: 'Rerolls socket links — primarily for body armour and 2-hand weapons.',
      when: 'Use after socket colors are correct.',
    },
    orb_of_chance: {
      summary: '~1% chance to upgrade Normal → Unique. Fails silently — item stays Normal.',
      when: 'Low-risk gamble for a specific Unique base.',
      odds: '~1% per attempt. Expected ~100 attempts for a Unique.',
      costNote: 'No risk to the item. Only cost is the Orb of Chance per try.',
    },
    desecrate: {
      summary: 'Adds a desecrated faction mod (Ulaman / Amanamu / Kurgal). Available on equipable jewellery & weapons.',
      when: 'Use on a finished Rare to add a powerful faction-locked mod.',
      costNote: 'Faction mods are locked at desecration — cannot be changed.',
    },
    ancient_orb: {
      summary: 'Rerolls a Rare item into a different base of the same slot type.',
      when: 'Use when you want the same mods on a different base (e.g. armour base swap).',
    },
    mirror_of_kalandra: {
      summary: 'Creates an exact copy of the item.',
      when: 'Only on a fully finished, perfectly rolled item worth duplicating.',
      costNote: 'Extremely expensive — only for mirror-tier items.',
    },
    hinekoras_lock: {
      summary: 'Foresight — shows the result of your next craft without committing.',
      when: 'Use before an expensive or important craft step.',
      costNote: 'One-shot preview. Use before Vaal / Fracture / Exalted slam.',
    },
    fracturing_orb: {
      summary: 'Fractures a random affix, locking it permanently. Requires 4+ affixes.',
      when: 'Lock your best mod before rerolling the rest with Chaos/Annul.',
      odds: `~${(100 / 6).toFixed(0)}% per affix. Use on an item where 1 affix is perfect.`,
      costNote: 'Expensive. Only use on items where 1 mod is irreplaceable.',
    },
    catalyst: {
      summary: 'Adds quality to rings / amulets / jewels, enhancing matching mod families.',
      when: 'Apply before final crafting steps to boost mod values.',
      costNote: 'Quality scales with base mod matching the catalyst type.',
    },
    liquid_emotion: {
      summary: 'Adds a liquid mod (Distilled Emotion) to jewels / rings / amulets.',
      when: 'Used for stacking bonus slots (+1 prefix/suffix) or effect scaling.',
      costNote: 'Expensive utility — Distilled Contempt gives +1 suffix slot.',
    },
  };

  return base[opId] || { summary: 'Apply to see what happens.', when: '' };
}
