// src/lib/optimizer.ts
// Finds the cheapest sequence of crafting operations to replicate a target item
// from scratch using poe2db DropChance weights and live poe2scout prices.

import type { BaseItem, Mod as ModDef } from './types';
import { buildPool } from './weights';

export interface OptimizerStep {
  operation: string;
  description: string;
  cost: number;        // chaos expected total
  perAttempt: number;  // attempts expected
  subtotal: number;
}

export interface OptimizerResult {
  steps: OptimizerStep[];
  totalChaos: number;
  totalExalts: number;
  totalDivines: number;
}

// Match a pasted mod description to our mod database.
// Returns the best matching mod, or null.
function matchMod(text: string, mods: ModDef[], type: 'prefix' | 'suffix'): ModDef | null {
  const t = text.toLowerCase().replace(/[^a-z0-9%+\- ]/g, '').trim();
  // Try exact match (after stripping ranges from both)
  const candidates = mods.filter(m => m.type === type || m.type === 'any');
  for (const m of candidates) {
    const desc = m.description.toLowerCase().replace(/[^a-z0-9%+\- ]/g, '');
    // Check if every meaningful word in the mod text appears in the description
    const words = t.split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
    const matches = words.filter(w => desc.includes(w));
    if (matches.length >= Math.max(2, words.length * 0.6)) return m;
  }
  // Fallback: return first mod with any word overlap
  const words = t.split(/\s+/).filter(w => w.length > 3);
  let best: ModDef | null = null;
  let bestScore = 0;
  for (const m of candidates) {
    const desc = m.description.toLowerCase();
    const score = words.filter(w => desc.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  if (bestScore > 0) return best;
  return null;
}

export function optimize(
  base: BaseItem,
  targetModNames: string[],
  allMods: ModDef[],
  prices: Record<string, number>,
  chaosPerDivine: number,
): OptimizerResult {
  const steps: OptimizerStep[] = [];
  const usedSlots = { prefix: 0, suffix: 0 };
  const maxSlots = { ...base.affixSlots };
  let rarity: 'normal' | 'magic' | 'rare' = 'normal';
  let affixesAdded = 0;

  // Classify target mods and match them to our database
  const targets: Array<{ text: string; mod: ModDef | null; type: 'prefix' | 'suffix' }> = [];
  for (const name of targetModNames) {
    const mod = matchMod(name, allMods, 'prefix') || matchMod(name, allMods, 'suffix');
    if (mod) {
      targets.push({ text: name, mod, type: mod.type === 'any' ? 'prefix' : mod.type as 'prefix' | 'suffix' });
    }
  }

  if (targets.length === 0) {
    return { steps: [], totalChaos: 0, totalExalts: 0, totalDivines: 0 };
  }

  // Step 1: Buy base
  steps.push({ operation: 'Buy base', description: base.name, cost: 0.5, perAttempt: 1, subtotal: 0.5 });

  // Helper: get pool for operation type
  function getPool(type: 'prefix' | 'suffix') {
    return buildPool(allMods, type, base, [], { ilvl: 82 });
  }

  // Process prefix targets first, then suffix
  for (const type of ['prefix', 'suffix'] as const) {
    const typeTargets = targets.filter(t => t.type === type);
    if (typeTargets.length === 0) continue;

    for (const target of typeTargets) {
      if (usedSlots[type] >= maxSlots[type]) continue;
      const mod = target.mod;
      if (!mod) continue;

      // Compute probability for Exalted route
      const pool = getPool(type);
      const modWeight = mod.weight || 1000;
      const poolTotal = pool.totalWeight;
      const p = poolTotal > 0 ? modWeight / poolTotal : 0;
      const expectedAttempts = p > 0 ? Math.round(1 / p) : 9999;

      // Essence price estimate
      const exaltPrice = prices['exalted_orb'] || 0.018;
      const exaltCost = expectedAttempts * exaltPrice;

      // Determine which operation to use
      if (rarity === 'normal') {
        // Need to upgrade to Rare first
        steps.push({ operation: 'Orb of Alchemy', description: 'Normal → Rare (4 affixes)', cost: 1.0, perAttempt: 1, subtotal: 1.0 });
        rarity = 'rare';
        usedSlots.prefix = Math.min(usedSlots.prefix + 2, maxSlots.prefix);
        usedSlots.suffix = Math.min(usedSlots.suffix + 2, maxSlots.suffix);
        affixesAdded += 4;
      }

      if (rarity === 'magic') {
        steps.push({ operation: 'Regal Orb', description: 'Magic → Rare', cost: 0.01, perAttempt: 1, subtotal: 0.01 });
        rarity = 'rare';
      }

      // Check if we need Annul spam to clear space
      if (usedSlots[type] >= maxSlots[type]) continue; // no room

      // Try Essence first (cheaper than expected Exalted spam for expensive mods)
      // In real PoE2, essence cost = average price for that essence type
      const essencePrice = prices[`essence_of_${target.text.slice(0, 12).replace(/[^a-z]/g, '_')}`] || 0;

      if (essencePrice > 0 && essencePrice < exaltCost && essencePrice < 15) {
        if (affixesAdded === 0 && rarity === 'normal') {
          // Essence on Normal → Magic → Rare
          steps.push({ operation: 'Essence', description: `Guaranteed: ${mod.description.slice(0, 50)}`, cost: essencePrice, perAttempt: 1, subtotal: essencePrice });
          rarity = 'rare';
        } else if (affixesAdded > 0 && rarity === 'rare') {
          // Essence on Rare: removes + replaces
          steps.push({ operation: 'Essence (overwrite)', description: `Guaranteed: ${mod.description.slice(0, 45)}`, cost: essencePrice, perAttempt: 1, subtotal: essencePrice });
        }
        usedSlots[type]++;
        affixesAdded++;
      } else {
        // Exalted slam
        if (usedSlots.prefix + usedSlots.suffix >= maxSlots.prefix + maxSlots.suffix) {
          steps.push({ operation: 'Annul + Exalted', description: `Annul bad mod, then try for: ${mod.description.slice(0, 35)}`, cost: (prices['orb_of_annulment'] || 3.73) + exaltPrice, perAttempt: expectedAttempts, subtotal: (expectedAttempts + 1) * (prices['orb_of_annulment'] || 3.73 + exaltPrice) });
          continue;
        }
        steps.push({ operation: 'Exalted Orb', description: `${mod.description.slice(0, 40)} — ~1 in ${expectedAttempts} tries`, cost: exaltPrice, perAttempt: expectedAttempts, subtotal: exaltCost });
        usedSlots[type]++;
        affixesAdded++;
      }
    }
  }

  const totalChaos = steps.reduce((s, x) => s + x.subtotal, 0);
  const cpd = chaosPerDivine || 7.5;
  return {
    steps,
    totalChaos: Math.round(totalChaos * 100) / 100,
    totalExalts: Math.round((totalChaos / (cpd / 56)) * 100) / 100,
    totalDivines: Math.round((totalChaos / cpd) * 100) / 100,
  };
}
