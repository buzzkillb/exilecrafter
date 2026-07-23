// src/lib/optimizer.ts
// Finds the cheapest sequence of crafting operations to replicate a target item
// from scratch. Uses expected-probability math with poe2db DropChance weights.

import type { BaseItem, Mod as ModDef, Currency } from './types';
import { buildPool, type PoolResult } from './weights';

export interface OptimizerStep {
  operation: string;
  description: string;
  cost: number;        // chaos per attempt
  perAttempt: number;  // attempts expected
  subtotal: number;    // cost × perAttempt
}

export interface OptimizerResult {
  steps: OptimizerStep[];
  totalChaos: number;
  totalExalts: number;
  totalDivines: number;
}

export function optimize(
  base: BaseItem,
  targetModNames: string[],   // mod descriptions from the pasted item
  allMods: ModDef[],
  prices: Record<string, number>,
  chaosPerDivine: number,
): OptimizerResult {
  const steps: OptimizerStep[] = [];
  const slotNames = ['Normal', 'Magic', 'Rare'];
  const used = { prefix: 0, suffix: 0 };
  const maxSlots = base.affixSlots;

  // Separate target mods by type based on their name (look them up in mods)
  const prefixTargets = targetModNames.filter(name =>
    allMods.some(m => m.type === 'prefix' && m.description.includes(name.slice(0, 20))));
  const suffixTargets = targetModNames.filter(name =>
    allMods.some(m => m.type === 'suffix' && m.description.includes(name.slice(0, 20))));

  // For each target mod, compute the cheapest way to acquire it.
  // Priority: Essence > Exalted spam > Regal > Augment > gamble
  const ordered = ['prefix', 'suffix'] as const;

  // Step 1: white base cost (negligible)
  steps.push({ operation: 'Buy base', description: base.name, cost: 0.5, perAttempt: 1, subtotal: 0.5 });

  for (const type of ordered) {
    const targets = type === 'prefix' ? prefixTargets : suffixTargets;
    if (targets.length === 0) continue;

    // Step 2: upgrade to Magic (if not done yet) or start with Rare
    if (used.prefix + used.suffix === 0) {
      steps.push({ operation: 'Orb of Alchemy', description: 'Normal → Rare (4 random affixes)', cost: 1.0, perAttempt: 1, subtotal: 1.0 });
      used.prefix = 2;
      used.suffix = 2;
    }

    for (const name of targets) {
      if (used[type] >= maxSlots[type]) continue;

      const mod = allMods.find(m => m.description.includes(name.slice(0, 20)) && m.type === type);
      if (!mod) continue;

      // Compute probability if using Exalted Orb
      const pool = buildPool(allMods, type, base, [], { ilvl: 82 });
      const modWeight = mod.weight || 1000;
      const poolTotal = pool.totalWeight;
      const p = poolTotal > 0 ? modWeight / poolTotal : 0;
      const expectedAttempts = p > 0 ? Math.round(1 / p) : 9999;

      // Essence alternative (estimate)
      const essencePrice = prices[`essence_of_${name.slice(0, 12).toLowerCase().replace(/[^a-z0-9_]/g, '')}`] || 0;

      // Pick cheapest: Essence (if available and < expected exalt cost) vs Exalted spam
      const exaltPrice = prices['exalted_orb'] || 0.018;
      const exaltCost = expectedAttempts * exaltPrice;
      const estEssenceCost = essencePrice || (type === 'prefix' ? 2.5 : 1.5);

      if (estEssenceCost < exaltCost && estEssenceCost < 50) {
        steps.push({
          operation: 'Essence',
          description: `Guaranteed: ${name.slice(0, 50)}`,
          cost: estEssenceCost,
          perAttempt: 1,
          subtotal: estEssenceCost,
        });
      } else {
        steps.push({
          operation: 'Exalted Orb',
          description: `${name.slice(0, 45)} — ~1 in ${expectedAttempts} tries`,
          cost: exaltPrice,
          perAttempt: expectedAttempts,
          subtotal: exaltCost,
        });
      }
      used[type]++;
    }
  }

  const totalChaos = steps.reduce((s, x) => s + x.subtotal, 0);
  return {
    steps,
    totalChaos: Math.round(totalChaos * 100) / 100,
    totalExalts: Math.round((totalChaos / (chaosPerDivine / 56)) * 100) / 100,
    totalDivines: Math.round((totalChaos / chaosPerDivine) * 100) / 100,
  };
}
