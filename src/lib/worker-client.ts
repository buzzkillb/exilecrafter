// src/lib/worker-client.ts
// Thin client wrapper around the probability web worker.

import ProbabilityWorker from './workers/probability.worker?worker';

let _worker: Worker | null = null;
const _callbacks = new Map<number, (value: number, extra?: { trials: number; hits: number }) => void>();
let _nextId = 1;

function getWorker(): Worker {
  if (!_worker) {
    _worker = new ProbabilityWorker();
    _worker.addEventListener('message', (e: MessageEvent) => {
      const data = e.data as { type: 'result' | 'error'; id: number; value?: number; trials?: number; hits?: number; message?: string };
      const cb = _callbacks.get(data.id);
      if (!cb) return;
      _callbacks.delete(data.id);
      if (data.type === 'result' && typeof data.value === 'number') {
        cb(data.value, { trials: data.trials ?? 0, hits: data.hits ?? 0 });
      }
      // errors are silently ignored in this simple client
    });
  }
  return _worker;
}

export function probAnyOf(opts: {
  base: import('./types').BaseItem;
  mods: import('./types').Mod[];
  weights: import('./types').WeightEntry[];
  targetIds: string[];
  ilvl?: number;
}): Promise<number> {
  return new Promise((resolve) => {
    const id = _nextId++;
    _callbacks.set(id, (v) => resolve(v));
    getWorker().postMessage({ type: 'prob_any_of', id, ...opts });
  });
}

export function probAtLeastOne(opts: {
  base: import('./types').BaseItem;
  mods: import('./types').Mod[];
  weights: import('./types').WeightEntry[];
  targetIds: string[];
  nPicks: number;
  ilvl?: number;
}): Promise<number> {
  return new Promise((resolve) => {
    const id = _nextId++;
    _callbacks.set(id, (v) => resolve(v));
    getWorker().postMessage({ type: 'prob_at_least_one', id, ...opts });
  });
}

export function monteCarlo(opts: {
  base: import('./types').BaseItem;
  mods: import('./types').Mod[];
  weights: import('./types').WeightEntry[];
  targetIds: string[];
  nPicks: number;
  trials: number;
  ilvl?: number;
}): Promise<{ probability: number; trials: number; hits: number }> {
  return new Promise((resolve) => {
    const id = _nextId++;
    _callbacks.set(id, (v, extra) => resolve({ probability: v, trials: extra?.trials ?? 0, hits: extra?.hits ?? 0 }));
    getWorker().postMessage({ type: 'monte_carlo', id, ...opts });
  });
}
