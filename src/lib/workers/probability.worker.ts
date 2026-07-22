// src/lib/workers/probability.worker.ts
// Web worker for heavy probability calculations. Runs off the main thread so
// large combinatorial mod-pool math doesn't freeze the UI.
//
// Protocol:
//   IN:  { type: 'prob_any_of', base, mods, weights, targetIds, ilvl }
//        { type: 'prob_at_least_one', base, mods, weights, targetIds, n, ilvl }
//        { type: 'monte_carlo', base, mods, weights, targetIds, nPicks, trials }
//   OUT: { type: 'result', id, value }
//        { type: 'error', id, message }

import { buildPool, probAnyOf, probAtLeastOne } from '../weights';
import { pickN } from '../weights';
import type { Mod, BaseItem, WeightEntry } from '../types';

interface ProbAnyOfMsg {
  type: 'prob_any_of';
  id: number;
  base: BaseItem;
  mods: Mod[];
  weights: WeightEntry[];
  targetIds: string[];
  ilvl?: number;
}

interface ProbAtLeastOneMsg {
  type: 'prob_at_least_one';
  id: number;
  base: BaseItem;
  mods: Mod[];
  weights: WeightEntry[];
  targetIds: string[];
  nPicks: number;
  ilvl?: number;
}

interface MonteCarloMsg {
  type: 'monte_carlo';
  id: number;
  base: BaseItem;
  mods: Mod[];
  weights: WeightEntry[];
  targetIds: string[];
  nPicks: number;
  trials: number;
  ilvl?: number;
}

type InMsg = ProbAnyOfMsg | ProbAtLeastOneMsg | MonteCarloMsg;

self.addEventListener('message', (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  try {
    switch (msg.type) {
      case 'prob_any_of': {
        // Build both prefix and suffix pools — a single currency pick
        // (Exalted/Regal) can yield either type. Check if each target
        // mod is in whichever pool matches its type, then take the max
        // probability (the user cares about hitting it in any pool).
        const prefixPool = buildPool(msg.mods, 'prefix', msg.base, msg.weights, { ilvl: msg.ilvl ?? 100 });
        const suffixPool = buildPool(msg.mods, 'suffix', msg.base, msg.weights, { ilvl: msg.ilvl ?? 100 });
        const targetIds = new Set(msg.targetIds);
        let bestP = 0;
        for (const pool of [prefixPool, suffixPool]) {
          const p = probAnyOf(pool, targetIds);
          if (p > bestP) bestP = p;
        }
        (self as unknown as Worker).postMessage({ type: 'result', id: msg.id, value: bestP });
        break;
      }
      case 'prob_at_least_one': {
        const prefixPool = buildPool(msg.mods, 'prefix', msg.base, msg.weights, { ilvl: msg.ilvl ?? 100 });
        const suffixPool = buildPool(msg.mods, 'suffix', msg.base, msg.weights, { ilvl: msg.ilvl ?? 100 });
        const combined = {
          entries: [...prefixPool.entries, ...suffixPool.entries],
          totalWeight: prefixPool.totalWeight + suffixPool.totalWeight,
          hasRealWeights: prefixPool.hasRealWeights || suffixPool.hasRealWeights,
        };
        const p = probAtLeastOne(combined, new Set(msg.targetIds), msg.nPicks);
        (self as unknown as Worker).postMessage({ type: 'result', id: msg.id, value: p });
        break;
      }
      case 'monte_carlo': {
        const prefixPool = buildPool(msg.mods, 'prefix', msg.base, msg.weights, { ilvl: msg.ilvl ?? 100 });
        const suffixPool = buildPool(msg.mods, 'suffix', msg.base, msg.weights, { ilvl: msg.ilvl ?? 100 });
        const target = new Set(msg.targetIds);
        let hits = 0;
        for (let i = 0; i < msg.trials; i++) {
          let ok = false;
          for (const pool of [prefixPool, suffixPool]) {
            const r = pickN(pool, msg.nPicks);
            if (r.picked.some((m) => target.has(m.id))) { ok = true; break; }
          }
          if (ok) hits++;
        }
        (self as unknown as Worker).postMessage({
          type: 'result',
          id: msg.id,
          value: hits / msg.trials,
          trials: msg.trials,
          hits,
        });
        break;
      }
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      id: (msg as { id?: number }).id ?? 0,
      message: (err as Error).message,
    });
  }
});
