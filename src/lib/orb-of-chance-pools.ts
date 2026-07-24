// src/lib/orb-of-chance-pools.ts
// Unique item pools per base type for Orb of Chance outcomes.
// Data sourced from poe2db.tw — each base lists its possible unique items.
// Weights are equal (poe2db does not publish unique outcome weights).

export interface UniquePoolEntry {
  name: string;
  baseType: string;
  /** Level requirement of the unique */
  level: number;
  /** Whether this is considered a "trash" unique for cost estimation */
  trash: boolean;
}

export interface OrbOfChancePool {
  baseName: string;
  baseId: string;
  uniques: UniquePoolEntry[];
}

export const ORB_OF_CHANCE_POOLS: Record<string, OrbOfChancePool> = {
  heavy_belt: {
    baseName: 'Heavy Belt',
    baseId: 'heavy_belt',
    uniques: [
      { name: 'Waistgate', baseType: 'Heavy Belt', level: 50, trash: true },
      { name: 'Headhunter', baseType: 'Heavy Belt', level: 50, trash: false },
      { name: "Zerphi's Genesis", baseType: 'Heavy Belt', level: 56, trash: true },
    ],
  },
  utility_belt: {
    baseName: 'Utility Belt',
    baseId: 'utility_belt',
    uniques: [
      { name: "Cat O' Nine Tails", baseType: 'Utility Belt', level: 55, trash: true },
      { name: 'Ingenuity', baseType: 'Utility Belt', level: 55, trash: true },
      { name: 'Mageblood', baseType: 'Utility Belt', level: 55, trash: false },
    ],
  },
};

/** Returns all possible unique names for a given base name */
export function getUniquePool(baseName: string): UniquePoolEntry[] {
  const key = baseName.toLowerCase().replace(/\s+/g, '_');
  const pool = ORB_OF_CHANCE_POOLS[key];
  return pool?.uniques ?? [];
}

/** Pick a random unique from the pool (equal weighting) */
export function pickUnique(baseName: string): UniquePoolEntry | null {
  const pool = getUniquePool(baseName);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
