// src/lib/optimizer.ts — per-affix cost breakdown with alternatives

import type { BaseItem, Mod as ModDef, Currency } from './types';
import { buildPool } from './weights';

export interface CostEstimate {
  method: string;
  expectedCost: number;
  description: string;
}

export interface AffixBreakdown {
  modText: string;
  type: string;
  tier: number;
  weight: number;
  poolSize: number;
  attempts: number;
  strategies: CostEstimate[];
}

export interface OptimizerResult {
  baseName: string;
  affixes: AffixBreakdown[];
  unmatched: string[];
  totalCheapest: number;
  chaoticTotal: number;
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
  if (best && bestScore >= Math.max(2, words.length * 0.6)) return { mod: best, type: bestType };
  return null;
}

// Check if an essence's guaranteed mod text is relevant to this base slot and mod type
function essenceMatches(essence: any, base: BaseItem, modText: string): boolean {
  const gm = (essence.guaranteedMod || '').toLowerCase();
  if (!gm) return false;
  // Slot check: the guaranteed mod text often starts with equipment condition like
  // "One Handed Melee Weapon or Bow:" or "Armour, Belt or Jewellery:" or "Armour:"
  const slot = base.slot;
  const slotOk = slot.includes('weapon') ? /weapon/i.test(gm) :
                 slot === 'body_armour' || slot === 'helmet' || slot === 'gloves' || slot === 'boots' ? /armour/i.test(gm) :
                 slot === 'belt' || slot === 'ring' || slot === 'amulet' ? /belt|jewellery|jewel/i.test(gm) :
                 slot === 'focus' || slot === 'wand' ? /focus|wand/i.test(gm) : true;
  if (!slotOk) return false;

  // Keyword overlap: check if the essence's mod text shares key words with the target mod
  const modKeywords = modText.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
  const essenceKeywords = gm.split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
  const overlap = modKeywords.filter(w => essenceKeywords.includes(w)).length;
  return overlap >= 2;
}

export function optimize(
  base: BaseItem,
  targetModNames: string[],
  allMods: ModDef[],
  allCurrency: any[],
  prices: Record<string, number>,
): OptimizerResult {
  const exaltPrice = prices['exalted_orb'] || 0.018;
  const annulPrice = prices['orb_of_annulment'] || 3.73;
  const fracturePrice = prices['fracturing_orb'] || 81;
  const affixes: AffixBreakdown[] = [];
  const unmatched: string[] = [];

  for (const name of targetModNames) {
    const result = matchMod(name, allMods);
    if (!result) { unmatched.push(name); continue; }

    const pool = buildPool(allMods, result.type, base, [], { ilvl: 82 });
    const modWeight = result.mod.weight || 1000;
    const p = pool.totalWeight > 0 ? modWeight / pool.totalWeight : 0;
    const attempts = p > 0 ? Math.round(1 / p) : 9999;
    const exaltCost = attempts * exaltPrice;
    const strategies: CostEstimate[] = [];

    // Strategy 1: Exalted slam
    strategies.push({
      method: 'Exalted Orb',
      expectedCost: exaltCost,
      description: p > 0 ? `Weight ${modWeight} in pool of ${pool.entries.length} items — ~1 in ${attempts}` : 'Weight data unavailable',
    });

    // Strategy 2: Essence (if available and applicable)
    const matchingEssence = allCurrency.find((c: any) =>
      c.category === 'essence' && essenceMatches(c, base, result.mod.description)
    );
    if (matchingEssence) {
      const essencePrice = prices[matchingEssence.id] || 0;
      if (essencePrice > 0 && essencePrice < exaltCost) {
        strategies.push({
          method: matchingEssence.name,
          expectedCost: essencePrice,
          description: `Guaranteed mod (check slot/mods match) — ${essencePrice.toFixed(2)}c fixed cost`,
        });
      }
    }

    // Strategy 3: Fracture + Chaos (for expensive mods)
    if (exaltCost > 50) {
      const chaosPrice = prices['chaos_orb'] || 1;
      const fractureChaosCost = fracturePrice + chaosPrice * attempts;
      if (fractureChaosCost < exaltCost) {
        strategies.push({
          method: 'Fracture + Chaos',
          expectedCost: fractureChaosCost,
          description: `Lock mod with Fracturing Orb (${fracturePrice.toFixed(0)}c), then Chaos spam the rest`,
        });
      }
    }

    // Strategy 4: Omen-assisted Exalted (Sinistral/Dextral narrows pool by ~half)
    const omenCost = prices['omen_of_sinistral_exaltation'] || 0;
    if (omenCost > 0 && omenCost < 20) {
      const omenPoolTotal = pool.totalWeight / 2; // rough: forcing type halves the pool
      const omenP = omenPoolTotal > 0 ? modWeight / omenPoolTotal : 0;
      const omenAttempts = omenP > 0 ? Math.round(1 / omenP) : 9999;
      const omenTotalCost = omenCost + omenAttempts * exaltPrice;
      if (omenTotalCost < exaltCost * 0.8) {
        strategies.push({
          method: 'Omen + Exalted',
          expectedCost: omenTotalCost,
          description: `Use Sinistral/Dextral Exaltation (${omenCost.toFixed(1)}c) to force type, then Exalted`,
        });
      }
    }

    affixes.push({
      modText: result.mod.description.slice(0, 55),
      type: result.type,
      tier: result.mod.tier,
      weight: modWeight,
      poolSize: pool.entries.length,
      attempts,
      strategies,
    });
  }

  const cheapestTotal = affixes.reduce((s, a) => s + (a.strategies[0]?.expectedCost || 0), 0);
  // For "chaotic total" sum the second cheapest strategy to show the range
  const chaoticTotal = affixes.reduce((s, a) => s + (a.strategies[a.strategies.length - 1]?.expectedCost || a.strategies[0]?.expectedCost || 0), 0);

  return { baseName: base.name, affixes, unmatched, totalCheapest: Math.round(cheapestTotal * 100) / 100, chaoticTotal: Math.round(chaoticTotal * 100) / 100 };
}
