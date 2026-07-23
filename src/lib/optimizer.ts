// src/lib/optimizer.ts — per-affix cost breakdown, numeric range matching

import type { BaseItem, Mod as ModDef } from './types';
import { buildPool } from './weights';

export interface AffixStrategy {
  method: string;
  expectedCost: number;
  chaosPerTry: number;
  attempts: number;
}

export interface AffixBreakdown {
  inputText: string;
  matchedMod: string;
  type: string;
  tier: number;
  weight: number;
  poolSize: number;
  strategies: AffixStrategy[];
}

export interface OptimizerResult {
  baseName: string;
  affixes: AffixBreakdown[];
  unmatched: string[];
  totalChaos: number;
}

// Extract center values from a stat text like "(10—15)" or "(10—15)"
function extractCenters(text: string): number[] {
  const nums = text.match(/\d+/g)?.map(Number) || [];
  const centers: number[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    centers.push(Math.round((nums[i] + nums[i + 1]) / 2));
  }
  // Also extract standalone numbers after ranges
  if (nums.length % 2 === 0 && nums.length > 2) {
    // The last two numbers might be the final range
    centers.push(Math.round((nums[nums.length - 2] + nums[nums.length - 1]) / 2));
  }
  return [...new Set(centers)];
}

// Parse a pasted mod description into structured data for matching
function parsePastedMod(text: string): { centers: number[]; sum: number; clean: string } {
  const centers = extractCenters(text);
  const sum = centers.reduce((a, b) => a + b, 0);
  // Remove parenthetical ranges and numbers for word matching
  const clean = text.replace(/\(\d+[-–]\d+\)/g, '').replace(/\d+/g, '').replace(/[^a-z ]/gi, '').trim().toLowerCase();
  return { centers, sum, clean };
}

function matchModToPastedPaste(text: string, mods: ModDef[], type: 'prefix' | 'suffix'): { mod: ModDef; score: number } | null {
  const pasted = parsePastedMod(text);
  if (pasted.centers.length === 0) return null;

  const candidates = mods.filter(m => m.type === type || m.type === 'any');
  let best: { mod: ModDef; score: number } | null = null;

  for (const mod of candidates) {
    const modDesc = mod.description.replace(/\(\d+[-–]\d+\)/g, '').replace(/\d+/g, '').replace(/[^a-z ]/gi, '').trim().toLowerCase();
    
    // Quick word rejection: mod description must share significant words with pasted text
    const pastedWords = pasted.clean.split(/\s+/).filter(w => w.length > 3);
    const modWords = modDesc.split(/\s+/).filter(w => w.length > 3);
    const commonWords = pastedWords.filter(w => modWords.includes(w));
    if (commonWords.length < Math.max(2, pastedWords.length * 0.4)) continue;

    // Numeric range matching: compute how well the mod's statRanges fit the pasted values
    if (!mod.statRanges || mod.statRanges.length === 0) continue;

    let numericScore = 0;
    for (const sr of mod.statRanges) {
      const modMid = Math.round((sr.range.min + sr.range.max) / 2);
      // Find closest pasted center
      for (const pc of pasted.centers) {
        const diff = Math.abs(pc - modMid);
        if (diff <= 5) numericScore += 100 - diff * 10;
        else if (diff <= 15) numericScore += 50 - diff * 3;
      }
      // Bonus if the pasted sum falls within the mod's total range
      if (sr.range.min <= pasted.sum && pasted.sum <= sr.range.max) {
        numericScore += 30;
      }
    }

    if (numericScore > 0 && (!best || numericScore > best.score)) {
      // Bonus for exact word match on base type
      const baseScore = commonWords.length * 5;
      best = { mod, score: numericScore + baseScore };
    }
  }

  return best;
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
    // Try prefix first, then suffix
    let result = matchModToPastedPaste(name, allMods, 'prefix');
    if (!result) result = matchModToPastedPaste(name, allMods, 'suffix');
    if (!result) { unmatched.push(name); continue; }

    const mod = result.mod;
    const modType = mod.type === 'any' ? 'prefix' : mod.type as 'prefix' | 'suffix';

    const pool = buildPool(allMods, modType, base, [], { ilvl: 82 });
    const modWeight = mod.weight || 1000;
    const p = pool.totalWeight > 0 ? modWeight / pool.totalWeight : 0;
    const attempts = p > 0 ? Math.round(1 / p) : 9999;
    const exaltCost = attempts * exaltPrice;
    const strategies: AffixStrategy[] = [];

    // Strategy 1: Exalted slam
    strategies.push({
      method: 'Exalted Orb',
      expectedCost: Math.round(exaltCost * 100) / 100,
      chaosPerTry: exaltPrice,
      attempts,
    });

    // Strategy 2: Essence (check if any essence guarantees a similar mod)
    const essence = allCurrency.find((c: any) => {
      if (c.category !== 'essence' || !c.guaranteedMod) return false;
      return matchModToPastedPaste(c.guaranteedMod, [mod], modType) !== null;
    });
    if (essence) {
      const essencePrice = prices[essence.id] || 0;
      if (essencePrice > 0) {
        strategies.push({
          method: essence.name,
          expectedCost: Math.round(essencePrice * 100) / 100,
          chaosPerTry: essencePrice,
          attempts: 1,
        });
      }
    }

    // Strategy 3: Fracture + Chaos (for expensive mods — lock it, then chaos reroll the rest)
    if (exaltCost > 50) {
      const chaosPrice = prices['chaos_orb'] || 1;
      const fractureChaosCost = fracturePrice + chaosPrice * attempts;
      strategies.push({
        method: 'Fracture + Chaos Orb',
        expectedCost: Math.round(fractureChaosCost * 100) / 100,
        chaosPerTry: fracturePrice + chaosPrice,
        attempts: 1,
      });
    }

    affixes.push({
      inputText: name.slice(0, 55),
      matchedMod: mod.description.slice(0, 55),
      type: modType,
      tier: mod.tier,
      weight: modWeight,
      poolSize: pool.entries.length,
      strategies,
    });
  }

  // Total = cheapest strategy for each affix
  const totalChaos = Math.round(affixes.reduce((s, a) => s + (a.strategies[0]?.expectedCost || 0), 0) * 100) / 100;
  return { baseName: base.name, affixes, unmatched, totalChaos };
}
