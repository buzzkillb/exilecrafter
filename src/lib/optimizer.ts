// src/lib/optimizer.ts — practical breakdown of expected costs per target mod

import type { BaseItem, Mod as ModDef } from './types';
import { buildPool } from './weights';

export interface OptimizerStep {
  mod: string;
  type: string;
  tier: number;
  poolWeight: number;
  poolSize: number;
  attempts: number;
  costPerAttempt: number;
  subtotal: number;
}

export interface OptimizerResult {
  baseName: string;
  matched: OptimizerStep[];
  unmatched: string[];
  totalChaos: number;
  totalExalts: number;
  totalDivines: number;
}

function matchMod(text: string, mods: ModDef[]): { mod: ModDef; type: 'prefix' | 'suffix' } | null {
  const t = text.toLowerCase().replace(/[^a-z0-9%+\- ]/g, '').trim();
  const words = t.split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
  if (words.length === 0) return null;

  let best: ModDef | null = null;
  let bestScore = 0;
  let bestType: 'prefix' | 'suffix' = 'prefix';

  for (const m of mods) {
    if (m.type !== 'prefix' && m.type !== 'suffix') continue;
    const desc = m.description.toLowerCase().replace(/[^a-z0-9%+\- ]/g, '');
    const score = words.filter(w => desc.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = m; bestType = m.type as 'prefix' | 'suffix'; }
  }

  if (best && bestScore >= Math.max(2, words.length * 0.6)) {
    return { mod: best, type: bestType };
  }
  return null;
}

export function optimize(
  base: BaseItem,
  targetModNames: string[],
  allMods: ModDef[],
  prices: Record<string, number>,
  chaosPerDivine: number,
): OptimizerResult {
  const matched: OptimizerStep[] = [];
  const unmatched: string[] = [];
  const exaltPrice = prices['exalted_orb'] || 0.018;

  for (const name of targetModNames) {
    const result = matchMod(name, allMods);
    if (!result) { unmatched.push(name); continue; }

    const pool = buildPool(allMods, result.type, base, [], { ilvl: 82 });
    const modWeight = result.mod.weight || 1000;
    const p = pool.totalWeight > 0 ? modWeight / pool.totalWeight : 0;
    const attempts = p > 0 ? Math.round(1 / p) : 9999;

    matched.push({
      mod: result.mod.description.slice(0, 55),
      type: result.type,
      tier: result.mod.tier,
      poolWeight: modWeight,
      poolSize: pool.entries.length,
      attempts,
      costPerAttempt: exaltPrice,
      subtotal: attempts * exaltPrice,
    });
  }

  // Sort by expected cost ascending
  matched.sort((a, b) => a.subtotal - b.subtotal);

  const totalChaos = matched.reduce((s, x) => s + x.subtotal, 0);
  const cpd = chaosPerDivine || 7.5;
  return {
    baseName: base.name,
    matched,
    unmatched,
    totalChaos: Math.round(totalChaos * 100) / 100,
    totalExalts: Math.round((totalChaos / (cpd / 56)) * 100) / 100,
    totalDivines: Math.round((totalChaos / cpd) * 100) / 100,
  };
}
