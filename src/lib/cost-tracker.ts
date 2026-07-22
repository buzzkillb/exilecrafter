// src/lib/cost-tracker.ts
// Client-side cost tracker for the simulator.
// Fetches live prices from /api/prices (Cloudflare Pages Function that calls poe2scout API).
// Runs only in the browser — keeps the build static.

export interface PriceSnapshot {
  chaosPerExalt: number;
  chaosPerDivine: number;
  exaltsPerChaos: number;
  prices: Record<string, number>; // currencyId -> chaosValue
  fetchedAt: number; // epoch ms
}

export interface CostStep {
  currencyId: string;
  currencyName: string;
  count: number;
  chaosCost: number;
}

export class CostTracker {
  private snapshot: PriceSnapshot | null = null;
  private steps: CostStep[] = [];
  private loading = false;
  private initAttempted = false;
  private listeners: Array<() => void> = [];

  async init(_league?: string): Promise<void> {
    if (this.snapshot || this.initAttempted) return;
    this.initAttempted = true;
    this.loading = true;

    try {
      const res = await fetch('/api/prices');
      if (res.ok) {
        const data = await res.json();
        const meta = data._meta || {};
        const prices: Record<string, number> = {};
        for (const [key, val] of Object.entries(data)) {
          if (key === '_meta') continue;
          if (typeof val === 'number' && val > 0) {
            prices[key] = val;
          }
        }
        this.snapshot = {
          chaosPerExalt: meta.chaosPerExalt || 1 / 55.719,
          chaosPerDivine: meta.chaosPerDivine || 7.368,
          exaltsPerChaos: meta.exaltsPerChaos || 55.719,
          prices,
          fetchedAt: meta.fetchedAt ? new Date(meta.fetchedAt).getTime() : Date.now(),
        };
      } else {
        throw new Error('prices.json not found');
      }
    } catch {
      // Absolute last resort — derive from known exchange rates
      this.snapshot = {
        chaosPerExalt: 1 / 55.719,
        chaosPerDivine: 7.368,
        exaltsPerChaos: 55.719,
        prices: {},
        fetchedAt: 0,
      };
    } finally {
      this.loading = false;
    }
    this.notify();
  }

  get ready(): boolean { return this.snapshot !== null; }
  get loadingState(): boolean { return this.loading; }

  addStep(currencyId: string, currencyName: string, count = 1): void {
    const chaosCost = this.lookupPrice(currencyId, currencyName) * count;
    this.steps.push({ currencyId, currencyName, count, chaosCost });
    this.notify();
  }

  popStep(): CostStep | null {
    const s = this.steps.pop() || null;
    if (s) this.notify();
    return s;
  }

  reset(): void {
    this.steps = [];
    this.notify();
  }

  getSteps(): readonly CostStep[] { return this.steps; }

  totalChaos(): number {
    return this.steps.reduce((sum, s) => sum + s.chaosCost, 0);
  }

  toDivines(chaos: number): { divines: number; remainderChaos: number } {
    const cd = this.snapshot?.chaosPerDivine || 7.368;
    return { divines: Math.floor(chaos / cd), remainderChaos: chaos % cd };
  }

  toExalts(chaos: number): { exalts: number; remainderChaos: number } {
    const ce = this.snapshot?.chaosPerExalt || 0.01795;
    return { exalts: Math.floor(chaos / ce), remainderChaos: chaos % ce };
  }

  /** Resolve price by currency ID (then name fallback) */
  lookupPrice(currencyId: string, currencyName?: string): number {
    if (!this.snapshot) return 1;

    // Direct ID match
    const direct = this.snapshot.prices[currencyId];
    if (direct != null && direct > 0) return direct;

    // Strip prefix variants (greater_/perfect_/lesser_/corrupted_)
    const stripped = currencyId.replace(/^(greater_|perfect_|lesser_|corrupted_)/, '');
    const fromStripped = this.snapshot.prices[stripped];
    if (fromStripped != null && fromStripped > 0) {
      // Apply tier multiplier
      if (currencyId.startsWith('greater_')) return fromStripped * 2.5;
      if (currencyId.startsWith('perfect_')) return fromStripped * 5;
      return fromStripped;
    }

    // Essence tier detection
    const essenceMatch = currencyId.match(/^(fallen_|lesser_|greater_|perfect_|corrupted_)?(essence_of_.+)/);
    if (essenceMatch) {
      const prefix = essenceMatch[1] || '';
      const base = essenceMatch[2];
      const basePrice = this.snapshot.prices[base];
      if (basePrice != null && basePrice > 0) {
        if (prefix.startsWith('greater_')) return basePrice * 3;
        if (prefix.startsWith('perfect_')) return basePrice * 6;
        if (prefix.startsWith('corrupted_')) return basePrice * 10;
        return basePrice;
      }
      // Essence fallback by tier
      if (prefix.startsWith('greater_') || prefix.startsWith('fallen_')) return 2.5;
      if (prefix.startsWith('perfect_')) return 5;
      if (prefix.startsWith('corrupted_')) return 8;
      return 0.8;
    }

    // Liquid emotion detection
    if (currencyId.includes('liquid') || currencyId.includes('potent') || currencyId.includes('auspicious') ||
        currencyId.includes('distilled') || currencyId.includes('concentrated') || currencyId.includes('diluted') ||
        currencyId.includes('ancient') || currencyId.includes('fear') || currencyId.includes('guilt') ||
        currencyId.includes('greed') || currencyId.includes('ire') || currencyId.includes('disgust') ||
        currencyId.includes('envy') || currencyId.includes('paranoia')) {
      if (currencyId.includes('potent')) return 6;
      if (currencyId.includes('auspicious')) return 15;
      if (currencyId.includes('concentrated')) return 3;
      if (currencyId.includes('diluted')) return 0.5;
      if (currencyId.includes('paranoia') || currencyId.includes('ancient')) return 8;
      return 2;
    }

    // Catalyst detection
    if (currencyId.includes('catalyst')) {
      return currencyId.includes('refined') ? 8 : 3;
    }

    // Desecration bones
    if (currencyId.includes('collarbone') || currencyId.includes('jawbone') || currencyId.includes('cranium') || currencyId.includes('rib')) {
      if (currencyId.includes('gnawed')) return 0.2;
      if (currencyId.includes('preserved')) return 15;
      return 5;
    }

    // Alloy
    if (currencyId.includes('alloy')) return 2;

    // Omen fallback (run only if not found in API prices at all)
    if (currencyId.startsWith('omen_of_')) {
      const n = currencyId.replace(/_/g, ' ').toLowerCase();
      if (n.includes('light')) return 5000;
      if (n.includes('sinistral annulment')) return 7000;
      if (n.includes('dextral annulment')) return 4200;
      if (n.includes('whittling')) return 4600;
      if (n.includes('abyssal')) return 180;
      if (n.includes('homogenising coronation')) return 4500;
      if (n.includes('sinistral exalt')) return 12;
      if (n.includes('dextral exalt')) return 7;
      if (n.includes('homogenising exalt')) return 7;
      if (n.includes('greater exalt')) return 1000;
      if (n.includes('greater annul')) return 3500;
      if (n.includes('sinistral coronat')) return 9;
      if (n.includes('dextral coronat')) return 7;
      if (n.includes('sinistral erasure')) return 3;
      if (n.includes('dextral erasure')) return 2;
      if (n.includes('sinistral alchemy')) return 1.5;
      if (n.includes('dextral alchemy')) return 1.3;
      if (n.includes('blessed')) return 500;
      if (n.includes('sanctif')) return 350;
      if (n.includes('preserv')) return 15;
      if (n.includes('secret hoard')) return 25;
      if (n.includes('putrefa')) return 0.9;
      if (n.includes('catalysing')) return 30;
      if (n.includes('crystall')) return 35;
      if (n.includes('necromancy')) return 4;
      if (n.includes('chaotic')) return 0.5;
      if (n.includes('gambling')) return 1.2;
      if (n.includes('liege')) return 0.5;
      if (n.includes('sovereign')) return 0.8;
      if (n.includes('hunt')) return 1.2;
      if (n.includes('sage')) return 0.6;
      return 0.5;
    }

    // Name-based fallback for anything else
    if (currencyName) {
      const n = currencyName.toLowerCase();
      if (n.includes('transmutation')) return 0.005;
      if (n.includes('augmentation')) return 0.006;
      if (n.includes('alchemy')) return 0.01;
      if (n.includes('regal')) return 0.01;
      if (n.includes('exalted') && !n.includes('greater') && !n.includes('perfect')) return 0.018;
      if (n.includes('chaos') && !n.includes('greater') && !n.includes('perfect')) return 1;
      if (n.includes('divine')) return 7.37;
      if (n.includes('annulment') || n.includes('annul')) return 4;
      if (n.includes('vaal')) return 0.06;
      if (n.includes('chance')) return 0.1;
      return 0.5;
    }

    return 0.5;
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}

export const costTracker = new CostTracker();
