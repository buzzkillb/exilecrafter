// src/lib/weights.ts
// Weighted mod pool math. Mirrors the logic in craftofexile's calculator worker.
// Pure functions, fully deterministic, no DOM access — safe for web workers.

import type { Mod, BaseItem, WeightEntry } from './types';

export interface ModPoolEntry {
  mod: Mod;
  weight: number;
  source: 'weights' | 'fallback';
}

export interface PoolResult {
  entries: ModPoolEntry[];
  totalWeight: number;
  hasRealWeights: boolean;
}

/**
 * Build a weighted pool for a given item slot and type (prefix/suffix).
 * Real weights come from the weights.json data set. If no weights are
 * available for a base, we fall back to tier-based pseudo-weights so the
 * site is still useful without a community-maintained weight dataset.
 *
 * Fallback weights approximate "rarer = lower tier = more weight" by
 * giving T1 mods 1000, T2 500, T3 250, etc. This is NOT accurate odds —
 * it's a placeholder until real weights are imported.
 */
export function buildPool(
  mods: Mod[],
  type: 'prefix' | 'suffix',
  base: BaseItem,
  weights: WeightEntry[],
  options?: { ilvl?: number; blockedModIds?: Set<string>; tagMultipliers?: Map<string, number>; minModLevel?: number }
): PoolResult {
  const ilvl = options?.ilvl ?? base.level ?? 100;
  const blocked = options?.blockedModIds ?? new Set<string>();
  const tagMul = options?.tagMultipliers ?? new Map<string, number>();
  const minModLevel = options?.minModLevel ?? 0;

  const entries: ModPoolEntry[] = [];
  let hasRealWeights = false;

  for (const mod of mods) {
    // Mod is eligible if:
    // - its type matches the requested pool, OR
    // - its type is "any" (when poe2db doesn't distinguish, e.g. scraped mods),
    // - OR its domain filter doesn't restrict it from this base
    if (mod.type !== type && mod.type !== 'any') continue;
    if (mod.domain.length > 0 && !mod.domain.includes(base.slot as any)) continue;
    if (mod.level > ilvl) continue; // ilvl gates which tiers can roll
    if (mod.level < minModLevel) continue; // Greater/Perfect variant gate
    if (blocked.has(mod.id)) continue; // can't roll the same mod twice

    const explicit = weights.find((w) => w.baseId === base.id.toLowerCase() && w.modId === mod.id);
    let weight: number;
    let source: 'weights' | 'fallback';

    if (explicit && explicit.weight > 0) {
      // weights.json wins — that's the curated per-base per-mod dataset.
      weight = explicit.weight;
      source = 'weights';
      hasRealWeights = true;
    } else if (mod.weight && mod.weight > 0) {
      // Use the mod's real DropChance value scraped from poe2db's ModsView
      // JSON. This is GGG's actual mod weight for this family/tier, not a
      // guess — it's just slot-wide (one DropChance per family, not per
      // individual base) which is the closest we can get without GGG's
      // official weights.dat.
      weight = mod.weight;
      source = 'fallback';
      hasRealWeights = true;
    } else {
      // Tier pseudo-weight as a last resort (T1 heaviest, T9 lightest).
      // Only used when neither weights.json nor mod.weight is available.
      weight = Math.max(1, Math.pow(2, 10 - mod.tier) * 10);
      source = 'fallback';
    }

    // Apply tag multipliers (e.g. catalysts, essences, fossils)
    for (const [tag, mult] of tagMul.entries()) {
      if (mod.tags.includes(tag as never)) weight *= mult;
    }

    entries.push({ mod, weight, source });
  }

  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
  return { entries, totalWeight, hasRealWeights };
}

/**
 * Pick N mods WITHOUT replacement from a pool, using weights.
 * Returns the list of selected mods and the probability of the exact selection.
 */
export function pickN(pool: PoolResult, n: number): { picked: Mod[]; probability: number } {
  if (n <= 0 || pool.entries.length === 0) return { picked: [], probability: 0 };

  const picked: Mod[] = [];
  let probability = 1;
  let remaining = pool.entries.slice();

  for (let i = 0; i < n && remaining.length > 0; i++) {
    const total = remaining.reduce((s, e) => s + e.weight, 0);
    if (total <= 0) break;

    let r = Math.random() * total;
    let chosenIdx = 0;
    for (let j = 0; j < remaining.length; j++) {
      r -= remaining[j].weight;
      if (r <= 0) { chosenIdx = j; break; }
    }

    const chosen = remaining[chosenIdx];
    const p = chosen.weight / total;
    probability *= p;
    picked.push(chosen.mod);
    remaining.splice(chosenIdx, 1); // can't pick same mod twice
  }

  return { picked, probability };
}

/**
 * Probability that ANY of the target mods is rolled on a single draw.
 */
export function probAnyOf(pool: PoolResult, targetIds: Set<string>): number {
  let sum = 0;
  for (const e of pool.entries) {
    if (targetIds.has(e.mod.id)) sum += e.weight;
  }
  return pool.totalWeight > 0 ? sum / pool.totalWeight : 0;
}

/**
 * Probability that ALL target mods are rolled when picking N mods.
 * Used for things like "T1 life + T1 cold" — rare double hit.
 */
export function probAllOf(pool: PoolResult, targetIds: Set<string>, n: number): number {
  if (n <= 0) return 0;
  const hits = pool.entries.filter((e) => targetIds.has(e.mod.id));
  if (hits.length < n) return 0;
  if (n === 1) return probAnyOf(pool, targetIds);

  let total = 0;
  // Enumerate combinations without replacement
  const combos = combinations(hits.map((h) => h.mod.id), n);
  for (const combo of combos) {
    let p = 1;
    let remaining = pool.entries.slice();
    for (const modId of combo) {
      const subTotal = remaining.reduce((s, e) => s + e.weight, 0);
      const entry = remaining.find((e) => e.mod.id === modId);
      if (!entry || subTotal === 0) { p = 0; break; }
      p *= entry.weight / subTotal;
      remaining = remaining.filter((e) => e.mod.id !== modId);
    }
    total += p;
  }
  return total;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  if (k === 1) return arr.map((x) => [x]);
  const [head, ...rest] = arr;
  const withHead = combinations(rest, k - 1).map((c) => [head, ...c]);
  const withoutHead = combinations(rest, k);
  return [...withHead, ...withoutHead];
}

/**
 * Probability that AT LEAST ONE of the target mods appears among N picks.
 */
export function probAtLeastOne(pool: PoolResult, targetIds: Set<string>, n: number): number {
  if (n <= 0) return 0;
  let prob = 0;
  for (let k = 1; k <= Math.min(n, targetIds.size); k++) {
    prob += probAllOf(pool, targetIds, k);
  }
  return Math.min(1, prob);
}
