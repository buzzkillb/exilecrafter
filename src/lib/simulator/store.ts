/**
 * Central state store for the simulator page.
 * Module-level variables imported by simulator.astro and sub-modules.
 * DOM-touching functions (logActivity, renderActivityLog, flash) stay
 * in simulator.astro since they reference DOM element refs.
 */

// ── Application state ──

export let currentBase: any = null;
export let currentItem: any = null;
export let history: any[] = [];
export const activeOmens = new Set<string>();
export let activityLog: { ts: number; msg: string; kind: 'ok' | 'error' | 'info' }[] = [];

// ── Data caches ──

export let currencyData: any[] = [];
export let omensData: any[] = [];
export let modsData: any[] = [];
export let weightsData: any[] = [];

// ── Setters ──

export function setCurrencyData(d: any[]) { currencyData = d; }
export function setOmensData(d: any[]) { omensData = d; }
export function setModsData(d: any[]) { modsData = d; }
export function setWeightsData(d: any[]) { weightsData = d; }

// ── Derived helpers ──

export function usedCount(type: string) {
  return currentItem?.affixes?.filter((a: any) => a.type === type).length || 0;
}

/** Tier sort helper — shared by renderCurrencyStrip */
export const TIER_PREFIX_RE = /^(lesser|greater|perfect|refined|corrupted)_(.*)/;
export const TIER_ORDER: Record<string, number> = {
  lesser: 0, '': 1, greater: 2, perfect: 3, refined: 4, corrupted: 5,
};

export function tierGroup(name: string): [string, number] {
  const m = name.match(TIER_PREFIX_RE);
  const stem = m ? m[2] : name;
  const base = stem.replace(/^(orb_of|essence_of|^)/, '').replace(/^[^a-z]/, '');
  const tier = m ? TIER_ORDER[m[1]] ?? 1 : 1;
  return [base || stem, tier];
}
