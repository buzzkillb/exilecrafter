// src/lib/emulator.ts
// PoE2 crafting emulator. Drives the interactive simulator + simulator worker.
// Models item state, applies currency operations, and produces mod rolls.

import type { Mod, BaseItem, Currency, Omen, WeightEntry } from './types';
import { buildPool, pickN, type PoolResult } from './weights';

export type ItemRarity = 'normal' | 'magic' | 'rare' | 'unique';

export interface Affix {
  modId: string;
  type: 'prefix' | 'suffix';
  tier: number;
  name: string;
  tags: string[];
  rolledValues?: Record<string, number>;
}

export interface ItemState {
  baseId: string;
  baseName: string;
  slot: string;
  rarity: ItemRarity;
  itemLevel: number;
  affixes: Affix[];
  implicit?: string;
  corrupted: boolean;
  desecrated: boolean;
  fractured: Affix[];
  /** Bonus prefix slots from "+1 Prefix Modifier allowed" liquid mods */
  bonusPrefixSlots: number;
  /** Bonus suffix slots from "+1 Suffix Modifier allowed" liquid mods */
  bonusSuffixSlots: number;
  /** Names of liquid emotions that have been applied to this item */
  appliedLiquids: string[];
  /** Hinekora's Lock â€” foresight active: next currency previews without consuming */
  foresight: boolean;
  history: Array<{ action: string; detail?: string; result?: string }>;
}

export interface ActiveOmen {
  id: string;
  effect: OmenEffect;
  foresight: boolean;
  /** Hinekora's Lock â€” foresight active: next currency previews without consuming */
  history: Array<{ action: string; detail?: string; result?: string }>;
  /** Mirror of Kalandra â€” item is mirrored and cannot be modified further */
  mirrored: boolean;
}

export type OmenEffect =
  | { kind: 'double_add' }
  | { kind: 'no_destroy', for: 'orb_of_chance' }
  | { kind: 'specific_unique', for: 'orb_of_chance' }
  | { kind: 'remove_count', value: number }
  | { kind: 'remove_type', value: 'prefix' | 'suffix' }
  | { kind: 'remove_lowest_level' }
  | { kind: 'replace_all_desecrate' }
  | { kind: 'desecrate_faction', value: 'ulaman' | 'amanamu' | 'kurgal' }
  | { kind: 'remove_only_desecrated' }
  | { kind: 'force_type', value: 'prefix' | 'suffix' }        // Sinistral/Dextral Coronation/Alchemy/Exaltation
  | { kind: 'force_homogenise' }                               // Homogenising Coronation/Exaltation
  // Divine Orb variants
  | { kind: 'divine_implicit_only' }           // Omen of the Blessed
  | { kind: 'divine_upgrade' }                  // Omen of Sanctification
  // Exalted variants
  | { kind: 'exalted_consumes_catalyst' }       // Omen of Catalysing Exaltation
  // Desecration variants
  | { kind: 'desecrate_reroll' }                // Omen of Putrefaction
  | { kind: 'desecrate_minion', value: 'prefix' | 'suffix' } // Omen of Necromancy
  // Perfect Orb variants
  | { kind: 'perfect_orb_implicit_upgrade' }   // Omen of Crystallisation
  // Chaos variants
  | { kind: 'chaos_effectiveness' }             // Omen of Chaotic Effectiveness
  | { kind: 'chaos_monsters' }                  // Omen of Chaotic Monsters
  | { kind: 'chaos_quantity' }                  // Omen of Chaotic Quantity
  | { kind: 'chaos_rarity' }                    // Omen of Chaotic Rarity
  ;

export interface EmulatorContext {
  base: BaseItem;
  mods: Mod[];
  currency: Currency[];
  omens: Omen[];
  weights: WeightEntry[];
  item: ItemState;
  activeOmens: ActiveOmen[];
  // When the orb is a Greater/Perfect tier variant, this is the minimum
  //   modifier level it can roll (parsed from poe2db's "Minimum Modifier
  //   Level: 35" line). 0 means no constraint (standard orbs).
  minModLevel?: number;
  /** The specific currency id being applied (e.g. "potent_liquid_contempt") */
  activeCurrencyId?: string;
}

export interface CraftResult {
  ok: boolean;
  message: string;
  item: ItemState;
  rolledAffixes?: Affix[];
  /** When a craft operation changes the base (e.g. Vaal Orb upgrades waystone tier),
   *  the simulator swaps currentBase to this ID. */
  newBaseId?: string;
}

/* ============================================================
   Currency operation handlers
   Each takes a context and returns a CraftResult.
   ============================================================ */

function omenOf(omens: ActiveOmen[], kind: OmenEffect['kind']): ActiveOmen | undefined {
  return omens.find((o) => o.effect.kind === kind);
}

/** Returns the effective affix slots including any bonus from "+1 Modifier allowed" liquids */
function effectiveSlots(item: ItemState, base: BaseItem): { prefix: number; suffix: number } {
  return {
    prefix: base.affixSlots.prefix + item.bonusPrefixSlots,
    suffix: base.affixSlots.suffix + item.bonusSuffixSlots,
  };
}

function pickAffix(
  pool: PoolResult,
  type: 'prefix' | 'suffix',
  blockedModIds: Set<string>,
  weights: WeightEntry[],
  base: BaseItem
): Affix | null {
  const typed = {
    ...pool,
    entries: pool.entries.filter((e) => (e.mod.type === type || e.mod.type === 'any') && !blockedModIds.has(e.mod.id)),
  };
  typed.totalWeight = typed.entries.reduce((s, e) => s + e.weight, 0);
  if (typed.entries.length === 0) return null;
  const { picked } = pickN(typed, 1);
  if (!picked[0]) return null;
  const mod = picked[0];
  return {
    modId: mod.id,
    type: type,
    tier: mod.tier,
    name: mod.name,
    tags: mod.tags,
  };
}

export function orbOfTransmutation(ctx: EmulatorContext): CraftResult {
  const { item, base } = ctx;
  if (item.rarity !== 'normal') {
    return { ok: false, message: 'Transmutation only works on Normal items.', item };
  }
  if (effectiveSlots(item, base).prefix + effectiveSlots(item, base).suffix === 0) {
    return { ok: false, message: `${base.name} cannot be crafted with currency (no affix slots, found with fixed implicit).`, item };
  }
  const pool = buildPool(ctx.mods, 'prefix', base, ctx.weights, { ilvl: item.itemLevel, minModLevel: ctx.minModLevel ?? 0 });
  const affix = pickAffix(pool, 'prefix', new Set(), ctx.weights, base);
  if (!affix) {
    return { ok: false, message: 'No valid prefix could roll (check item level).', item };
  }
  const next: ItemState = {
    ...item,
    rarity: 'magic',
    affixes: [affix],
    history: [...item.history, { action: 'Orb of Transmutation', rolledAffixes: affix.name }],
  };
  return { ok: true, message: `Rolled ${affix.name}`, item: next, rolledAffixes: [affix] };
}

export function orbOfAugmentation(ctx: EmulatorContext): CraftResult {
  const { item } = ctx;
  if (item.rarity !== 'magic') {
    return { ok: false, message: 'Augmentation only works on Magic items.', item };
  }
  if (item.affixes.length >= 2) {
    return { ok: false, message: 'Magic item is already full (1 prefix + 1 suffix).', item };
  }
  // Determine missing slot
  const hasPrefix = item.affixes.some((a) => a.type === 'prefix');
  const typeToRoll = hasPrefix ? 'suffix' : 'prefix';

  const pool = buildPool(ctx.mods, typeToRoll, ctx.base, ctx.weights, { ilvl: item.itemLevel, minModLevel: ctx.minModLevel ?? 0 });
  const affix = pickAffix(pool, typeToRoll, new Set(item.affixes.map((a) => a.modId)), ctx.weights, ctx.base);
  if (!affix) return { ok: false, message: 'No valid mod could roll.', item };

  const next = {
    ...item,
    affixes: [...item.affixes, affix],
    history: [...item.history, { action: 'Orb of Augmentation', rolledAffixes: affix.name }],
  };
  return { ok: true, message: `Added ${affix.name}`, item: next, rolledAffixes: [affix] };
}

export function regalOrb(ctx: EmulatorContext): CraftResult {
  const { item, base } = ctx;
  if (item.rarity !== 'magic') {
    return { ok: false, message: 'Regal only works on Magic items.', item };
  }
  if (item.affixes.length < 2) {
    return { ok: false, message: 'Magic item must have 2 affixes before Regal.', item };
  }
  const slots = effectiveSlots(item, base);
  const usedPrefix = item.affixes.filter((a) => a.type === 'prefix').length;
  const usedSuffix = item.affixes.filter((a) => a.type === 'suffix').length;

  const forceType = omenOf(ctx.activeOmens, 'force_type');
  const homogenise = omenOf(ctx.activeOmens, 'force_homogenise');

  let rollType: 'prefix' | 'suffix';
  if (forceType) {
    rollType = forceType.effect.kind === 'force_type' ? forceType.effect.value : 'prefix';
  } else if (homogenise) {
    // Homogenising Coronation â€” keep the new affix the same type as the
    // first existing affix so the item ends up with all-prefix or all-suffix.
    rollType = item.affixes[0].type;
  } else {
    // 50/50 â€” actual game uses random weighted by item type
    rollType = Math.random() < 0.5 ? 'prefix' : 'suffix';
  }

  const hasRoom =
    (rollType === 'prefix' && usedPrefix < slots.prefix) ||
    (rollType === 'suffix' && usedSuffix < slots.suffix);
  if (!hasRoom) {
    return { ok: false, message: `No open ${rollType} slot to fill.`, item };
  }

  const pool = buildPool(ctx.mods, rollType, base, ctx.weights, {
    ilvl: item.itemLevel,
    blockedModIds: new Set(item.affixes.map((a) => a.modId)),
    minModLevel: ctx.minModLevel ?? 0,
  });
  const affix = pickAffix(pool, rollType, new Set(item.affixes.map((a) => a.modId)), ctx.weights, base);
  if (!affix) return { ok: false, message: 'No valid mod could roll.', item };

  const next = {
    ...item,
    rarity: 'rare' as ItemRarity,
    affixes: [...item.affixes, affix],
    history: [...item.history, { action: 'Regal Orb', rolledAffixes: affix.name }],
  };
  return { ok: true, message: `Regal added ${affix.name}`, item: next, rolledAffixes: [affix] };
}

export function orbOfAlchemy(ctx: EmulatorContext): CraftResult {
  const { item, base } = ctx;
  if (item.rarity !== 'normal') {
    return { ok: false, message: 'Alchemy only works on Normal items.', item };
  }
  const slots = effectiveSlots(item, base);
  const forceType = omenOf(ctx.activeOmens, 'force_type');

  // Alchemy rolls 4 affixes: usually 2 prefix + 2 suffix (or omen forces all of one type)
  let countPrefix = 0, countSuffix = 0;
  if (forceType?.effect.kind === 'force_type') {
    if (forceType.effect.value === 'prefix') {
      countPrefix = Math.min(slots.prefix, 3);
      countSuffix = Math.max(0, 4 - countPrefix);
    } else {
      countSuffix = Math.min(slots.suffix, 3);
      countPrefix = Math.max(0, 4 - countSuffix);
    }
  } else {
    countPrefix = 2;
    countSuffix = 2;
  }

  const prefixPool = buildPool(ctx.mods, 'prefix', base, ctx.weights, { ilvl: item.itemLevel, minModLevel: ctx.minModLevel ?? 0 });
  const suffixPool = buildPool(ctx.mods, 'suffix', base, ctx.weights, { ilvl: item.itemLevel, minModLevel: ctx.minModLevel ?? 0 });
  const blocked = new Set<string>();

  const newAffixes: Affix[] = [];
  const rolledNames: string[] = [];

  for (let i = 0; i < countPrefix; i++) {
    const a = pickAffix(prefixPool, 'prefix', blocked, ctx.weights, base);
    if (a) { newAffixes.push(a); blocked.add(a.modId); rolledNames.push(a.name); }
  }
  for (let i = 0; i < countSuffix; i++) {
    const a = pickAffix(suffixPool, 'suffix', blocked, ctx.weights, base);
    if (a) { newAffixes.push(a); blocked.add(a.modId); rolledNames.push(a.name); }
  }

  const next: ItemState = {
    ...item,
    rarity: 'rare',
    affixes: newAffixes,
    history: [...item.history, { action: 'Orb of Alchemy', detail: `Rolled: ${rolledNames.join(', ')}` }],
  };
  return { ok: true, message: `Alchemy rolled ${newAffixes.length} affixes`, item: next, rolledAffixes: newAffixes };
}

export function exaltedOrb(ctx: EmulatorContext): CraftResult {
  const { item, base } = ctx;
  if (item.rarity !== 'rare') {
    return { ok: false, message: 'Exalted only works on Rare items.', item };
  }
  const slots = effectiveSlots(item, base);
  const usedPrefix = item.affixes.filter((a) => a.type === 'prefix').length;
  const usedSuffix = item.affixes.filter((a) => a.type === 'suffix').length;
  const hasOpenPrefix = usedPrefix < slots.prefix;
  const hasOpenSuffix = usedSuffix < slots.suffix;

  const forceType = omenOf(ctx.activeOmens, 'force_type');
  const greater = omenOf(ctx.activeOmens, 'double_add');
  const homogenise = omenOf(ctx.activeOmens, 'force_homogenise');
  const consumeCatalyst = omenOf(ctx.activeOmens, 'exalted_consumes_catalyst');

  let rollType: 'prefix' | 'suffix';
  if (forceType?.effect.kind === 'force_type') {
    rollType = forceType.effect.value;
  } else if (homogenise) {
    // Homogenising Exaltation â€” same type as an existing affix
    const existingTypes = item.affixes.map((a) => a.type);
    rollType = existingTypes.includes('prefix') && existingTypes.includes('suffix')
      ? (Math.random() < 0.5 ? 'prefix' : 'suffix')
      : existingTypes[0] || (Math.random() < 0.5 ? 'prefix' : 'suffix');
  } else {
    if (hasOpenPrefix && !hasOpenSuffix) rollType = 'prefix';
    else if (!hasOpenPrefix && hasOpenSuffix) rollType = 'suffix';
    else if (!hasOpenPrefix && !hasOpenSuffix) return { ok: false, message: 'No open affix slots.', item };
    else rollType = Math.random() < 0.5 ? 'prefix' : 'suffix';
  }

  const pool = buildPool(ctx.mods, rollType, base, ctx.weights, {
    ilvl: item.itemLevel,
    blockedModIds: new Set(item.affixes.map((a) => a.modId)),
    minModLevel: ctx.minModLevel ?? 0,
  });
  const a = pickAffix(pool, rollType, new Set(item.affixes.map((a) => a.modId)), ctx.weights, base);
  if (!a) return { ok: false, message: 'No valid mod could roll.', item };

  const additions: Affix[] = [a];
  if (greater) {
    // Greater Exalted Omen requires 2 open slots
    const usedBefore = item.affixes.length;
    const hasRoom2 = (rollType === 'prefix' && usedPrefix + 1 < slots.prefix) || (rollType === 'suffix' && usedSuffix + 1 < slots.suffix);
    if (hasRoom2) {
      const a2 = pickAffix(pool, rollType, new Set([...item.affixes.map((x) => x.modId), a.modId]), ctx.weights, base);
      if (a2) additions.push(a2);
    }
  }

  const next = {
    ...item,
    affixes: [...item.affixes, ...additions],
    history: [...item.history, { action: greater ? 'Exalted (Greater)' : 'Exalted Orb', rolledAffixes: additions.map((x) => x.name).join(', ') }],
  };
  return { ok: true, message: `Added ${additions.length} affix(es)`, item: next, rolledAffixes: additions };
}

export function orbOfAnnulment(ctx: EmulatorContext): CraftResult {
  const { item } = ctx;
  if (item.rarity !== 'magic' && item.rarity !== 'rare') {
    return { ok: false, message: 'Annul only works on Magic or Rare items.', item };
  }
  if (item.affixes.length === 0) {
    return { ok: false, message: 'No affixes to remove.', item };
  }
  const omenForceType = omenOf(ctx.activeOmens, 'remove_type');
  const omenCount = omenOf(ctx.activeOmens, 'remove_count');
  const omenLight = omenOf(ctx.activeOmens, 'remove_only_desecrated');

  // Fractured affixes cannot be annulled
  const fracturedIds = new Set(item.fractured.map((f: any) => f.modId));
  let candidates = item.affixes.filter((a) => !fracturedIds.has(a.modId));
  if (candidates.length === 0) return { ok: false, message: 'Only fractured affixes remain — cannot annul them.', item };
  if (omenLight) {
    candidates = candidates.filter((a) => a.tags.includes('desecrated'));
    if (candidates.length === 0) return { ok: false, message: 'No desecrated affixes to remove.', item };
  }
  if (omenForceType?.effect.kind === 'remove_type') {
    candidates = candidates.filter((a) => a.type === omenForceType.effect.value);
    if (candidates.length === 0) return { ok: false, message: `No ${omenForceType.effect.value} to remove.`, item };
  }

  const removed: Affix[] = [];
  const count = omenCount?.effect.kind === 'remove_count' ? Math.min(2, omenCount.effect.value) : 1;
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const idx = Math.floor(Math.random() * candidates.length);
    const [removed1] = candidates.splice(idx, 1);
    removed.push(removed1);
  }
  if (removed.length === 0) return { ok: false, message: 'Nothing to remove.', item };

  const removedIds = new Set(removed.map((r) => r.modId));
  const next: ItemState = {
    ...item,
    affixes: item.affixes.filter((a) => !removedIds.has(a.modId)),
    rarity: item.affixes.length - removed.length === 0 ? 'normal' : item.rarity,
    history: [...item.history, { action: 'Orb of Annulment', detail: `Removed: ${removed.map((r) => r.name).join(', ')}` }],
  };
  return { ok: true, message: `Removed ${removed.length} affix(es): ${removed.map((r) => r.name).join(', ')}`, item: next };
}

export function chaosOrb(ctx: EmulatorContext): CraftResult {
  const { item, base } = ctx;
  if (item.rarity !== 'rare') {
    return { ok: false, message: 'Chaos only works on Rare items.', item };
  }
  const slots = effectiveSlots(item, base);
  const fracturedIds = new Set(item.fractured.map((f: any) => f.modId));
  // Count non-fractured affixes for slot usage
  const currentPrefix = item.affixes.filter((a) => a.type === 'prefix' && !fracturedIds.has(a.modId)).length;
  const currentSuffix = item.affixes.filter((a) => a.type === 'suffix' && !fracturedIds.has(a.modId)).length;
  const prefixPool = buildPool(ctx.mods, 'prefix', base, ctx.weights, { ilvl: item.itemLevel, minModLevel: ctx.minModLevel ?? 0 });
  const suffixPool = buildPool(ctx.mods, 'suffix', base, ctx.weights, { ilvl: item.itemLevel, minModLevel: ctx.minModLevel ?? 0 });
  const blocked = new Set<string>();

  // Keep fractured affixes in place, only reroll non-fractured
  const newAffixes: Affix[] = item.fractured.slice();
  const rolledNames: string[] = [];
  for (let i = 0; i < Math.min(currentPrefix, slots.prefix); i++) {
    const a = pickAffix(prefixPool, 'prefix', blocked, ctx.weights, base);
    if (a) { newAffixes.push(a); blocked.add(a.modId); rolledNames.push(a.name); }
  }
  for (let i = 0; i < Math.min(currentSuffix, slots.suffix); i++) {
    const a = pickAffix(suffixPool, 'suffix', blocked, ctx.weights, base);
    if (a) { newAffixes.push(a); blocked.add(a.modId); rolledNames.push(a.name); }
  }

  const next: ItemState = {
    ...item,
    affixes: newAffixes,
    history: [...item.history, { action: 'Chaos Orb', detail: `Rerolled to: ${rolledNames.join(', ')}` }],
  };
  return { ok: true, message: `Rerolled ${newAffixes.length} affixes`, item: next, rolledAffixes: newAffixes };
}

export function divineOrb(ctx: EmulatorContext): CraftResult {
  // Reroll numeric values on existing affixes.
  const { item } = ctx;
  if (item.affixes.length === 0) return { ok: false, message: 'No affixes to divine.', item };

  const implicitOnly = omenOf(ctx.activeOmens, 'divine_implicit_only');   // Omen of the Blessed
  const upgrade = omenOf(ctx.activeOmens, 'divine_upgrade');              // Omen of Sanctification

  let detail = 'Rerolled numeric values';
  if (implicitOnly) {
    detail = 'Rerolled implicit values only (Omen of the Blessed)';
  }
  if (upgrade) {
    detail = 'Upgraded affix tiers (Omen of Sanctification)';
  }

  const next: ItemState = {
    ...item,
    affixes: item.affixes.map((a) => ({ ...a })),
    history: [...item.history, { action: 'Divine Orb', detail }],
  };
  return { ok: true, message: detail, item: next };
}

export function vaalOrb(ctx: EmulatorContext): CraftResult {
  // Corrupts the item; if it's a normal/magic/rare without implicit, the implicit
  // slot gets a corrupted implicit (we represent this as a corrupted flag).
  // PoE2 Vaal Orb has 4 equally-likely outcomes:
  //   25% upgrade â€” adds corrupted implicit
  //   25% modify â€” rerolls affixes (adds/removes some)
  //   25% no change â€” just corrupts, nothing else
  //   25% destroy â€” item is destroyed (lose all affixes)
  const { item } = ctx;
  if (item.corrupted) return { ok: false, message: 'Already corrupted.', item };
  const roll = Math.random();
  if (roll < 0.25) {
    // Destroy â€” clear all affixes, revert to normal
    const next = { ...item, corrupted: true, affixes: [], rarity: 'normal' as ItemRarity, desecrated: false, fractured: [], bonusPrefixSlots: 0, bonusSuffixSlots: 0, appliedLiquids: [], history: [...item.history, { action: 'Vaal Orb', detail: 'Destroyed' }] };
    return { ok: true, message: 'Vaal Orb destroyed the item â€” all affixes lost.', item: next };
  }
  // 25% upgrade — adds corrupted implicit. On waystones, this increases the tier.
  if (roll < 0.5) {
    const tierMatch = item.slot === 'waystone' ? item.baseName.match(/Waystone \(Tier (\d+)\)/) || item.baseName.match(/tier (\d+)/i) : null;
    if (tierMatch) {
      const currentTier = parseInt(tierMatch[1]);
      const newTier = Math.max(1, Math.min(16, currentTier + Math.floor(Math.random() * 3) - 1));
      return { ok: true, message: newTier > currentTier ? `Vaal Orb upgraded waystone to Tier ${newTier}!` : newTier < currentTier ? `Vaal Orb downgraded waystone to Tier ${newTier}.` : 'Vaal Orb corrupted the waystone (tier unchanged).', item: { ...item, corrupted: true, history: [...item.history, { action: 'Vaal Orb', detail: `Tier ${newTier}` }] }, newBaseId: `waystone_tier_${newTier}` };
    }
    const corruptedImplicits = [
      '(15\u201325)% increased Armour', '(15\u201325)% increased Evasion Rating', '(15\u201325)% increased Energy Shield',
      '(15\u201325)% increased Armour and Evasion', '(15\u201325)% increased Armour and Energy Shield',
      '(15\u201325)% increased Evasion and Energy Shield',
      '(10\u201320)% reduced Attribute Requirements', '(3\u20135)% additional Physical Damage Reduction',
      '(10\u201320)% of Damage taken Recouped as Life', '(10\u201320)% of Damage taken Recouped as Mana',
      '+1% to all Maximum Elemental Resistances', '+(30\u201340) to maximum Life', '+(20\u201325) to maximum Mana',
      '+(13\u201319)% to Chaos Resistance', '+(20\u201325)% to Fire Resistance', '+(20\u201325)% to Cold Resistance',
      '+(20\u201325)% to Lightning Resistance', '(3\u20135)% increased Movement Speed',
      '(15\u201325)% increased Physical Damage', '(6\u20138)% increased Attack Speed',
      '(20\u201330)% increased Stun Threshold', '(40\u201350)% increased Thorns damage',
      '+(5\u201310)% to Critical Damage Bonus', '(10\u201315)% chance to Blind Enemies on hit',
      '(10\u201315)% chance to Maim on Hit', '(15\u201325)% increased Spell Damage',
      '+(20\u201330) to Spirit', '+1 to Maximum Power Charges',
      '+1 to Level of all Minion Skills', '+1 to Level of all Melee Skills',
      '+(50\u2013100) to Accuracy Rating', '(20\u201330)% increased Mana Regeneration Rate',
      '(15\u201325)% increased Life Regeneration rate', '+(4\u20136) to Strength',
      '+(4\u20136) to Dexterity', '+(4\u20136) to Intelligence',
    ];
    const imp = corruptedImplicits[Math.floor(Math.random() * corruptedImplicits.length)];
    return { ok: true, message: 'Vaal Orb added corrupted implicit: ' + imp, item: { ...item, corrupted: true, implicit: (item.implicit ? item.implicit + ' | ' : '') + imp, history: [...item.history, { action: 'Vaal Orb', detail: 'Implicit: ' + imp }] } };
  }
  // 25% modify — shuffle some affix types
  if (roll < 0.75) {
    const shuffled = item.affixes.map((a: any) => Math.random() < 0.3 ? { ...a, type: a.type === 'prefix' ? 'suffix' : 'prefix' } : a);
    return { ok: true, message: 'Vaal Orb shuffled affixes (some mods swapped type).', item: { ...item, corrupted: true, affixes: shuffled, history: [...item.history, { action: 'Vaal Orb', detail: 'Affixes shuffled' }] } };
  }
  // 25% no change
  return { ok: true, message: 'Vaal Orb corrupted the item (no other effect).', item: { ...item, corrupted: true, history: [...item.history, { action: 'Vaal Orb', detail: 'Corrupted' }] } };
}

// Hinekora's Lock: foresight — next currency previews without consuming

export function desecrate(ctx: EmulatorContext): CraftResult {
  // Add a desecrated affix (one of 3 factions: Ulaman/Amanamu/Kurgal)
  const { item, base } = ctx;
  if (!['amulet', 'ring', 'belt', 'weapon_1h', 'weapon_2h', 'quiver', 'jewel'].includes(base.slot)) {
    return { ok: false, message: 'This item type cannot be desecrated.', item };
  }
  const factionOmen = omenOf(ctx.activeOmens, 'desecrate_faction');
  const faction = factionOmen?.effect.kind === 'desecrate_faction'
    ? factionOmen.effect.value
    : (['ulaman', 'amanamu', 'kurgal'] as const)[Math.floor(Math.random() * 3)];

  const slot = item.affixes.length < effectiveSlots(item, base).prefix + effectiveSlots(item, base).suffix ? 'open' : 'replace';

  // For simplicity, add a desecrated affix as a tagged suffix on top
  const desecrated: Affix = {
    modId: `desecrated_${faction}_${Date.now()}`,
    type: 'suffix',
    tier: 1,
    name: `Desecrated (${faction}) affix`,
    tags: ['desecrated'],
  };

  const bonusSlots = { bonusSuffixSlots: item.bonusSuffixSlots + 1, desecrated: true };
  let next = item;
  if (slot === 'open') {
    next = { ...item, ...bonusSlots, affixes: [...item.affixes, desecrated], history: [...item.history, { action: 'Desecrate', detail: `Rolled ${faction} desecrated affix` }] };
  } else {
    const idx = Math.floor(Math.random() * item.affixes.length);
    const removed = item.affixes[idx];
    next = { ...item, ...bonusSlots, affixes: [...item.affixes.slice(0, idx), desecrated, ...item.affixes.slice(idx + 1)], history: [...item.history, { action: 'Desecrate', detail: `Replaced ${removed.name} with ${faction} desecrated affix` }] };
  }

  return { ok: true, message: `Desecrated with ${faction}.`, item: next, rolledAffixes: [desecrated] };
}

/* ============================================================
   Standard orbs that need explicit wiring
   ============================================================ */

export function ancientOrb(ctx: EmulatorContext): CraftResult {
  // Ancient Orb: reforges a Unique item into another Unique of the same item class.
  const { item, base } = ctx;
  if (item.rarity !== 'unique') {
    return { ok: false, message: 'Ancient Orb only works on Unique items (reforges to another Unique of the same class).', item };
  }
  if (item.corrupted) {
    return { ok: false, message: 'Cannot Ancient a corrupted item.', item };
  }
  // Reforge: generate a fresh set of affixes. In the simulator this produces a
  // random pool of affixes as a stand-in for "another Unique".
  const poolP = buildPool(ctx.mods, 'prefix', base, ctx.weights, { ilvl: item.itemLevel, minModLevel: ctx.minModLevel ?? 0 });
  const poolS = buildPool(ctx.mods, 'suffix', base, ctx.weights, { ilvl: item.itemLevel, minModLevel: ctx.minModLevel ?? 0 });
  const slots2 = effectiveSlots(item, base);
  const maxP = slots2.prefix;
  const maxS = slots2.suffix;
  const newAffixes: Affix[] = [];
  const blocked = new Set<string>();
  for (let i = 0; i < maxP; i++) {
    const a = pickAffix(poolP, 'prefix', blocked, ctx.weights, base);
    if (!a) break;
    newAffixes.push(a);
    blocked.add(a.modId);
  }
  for (let i = 0; i < maxS; i++) {
    const a = pickAffix(poolS, 'suffix', blocked, ctx.weights, base);
    if (!a) break;
    newAffixes.push(a);
    blocked.add(a.modId);
  }

  const next = {
    ...item,
    rarity: 'unique' as const,
    affixes: newAffixes,
    history: [...item.history, { action: 'Ancient Orb', detail: 'Rerolled into new Rare' }],
  };
  return { ok: true, message: 'Re-rolled into a new Rare.', item: next };

}

export function mirrorOfKalandra(ctx: EmulatorContext): CraftResult {
  // Mirror of Kalandra: creates a Mirrored copy of a Rare item.
  // The simulator doesn't have a side-by-side compare view, so we model
  // it as "the source becomes mirrored" â€” locks the item so no further
  // crafting is possible (matches PoE2 behavior).
  const { item } = ctx;
  if (item.rarity !== 'rare' && item.rarity !== 'unique') {
    return { ok: false, message: 'Mirror of Kalandra only works on Rare or Unique items.', item };
  }
  return {
    ok: true,
    message: 'Mirrored. Item is now immutable.',
    item: {
      ...item,
      mirrored: true,
      history: [...item.history, { action: 'Mirror of Kalandra', detail: 'Mirrored' }],
    },
  };
}

export function fracturingOrb(ctx: EmulatorContext): CraftResult {
  // Fracturing Orb: locks in a random modifier on a Rare item with â‰¥4 mods.
  const { item } = ctx;
  if (item.rarity !== 'rare') {
    return { ok: false, message: 'Fracturing Orb only works on Rare items.', item };
  }
  if (item.affixes.length < 4) {
    return { ok: false, message: 'Fracturing Orb requires at least 4 modifiers.', item };
  }
  if (item.fractured.length > 0) {
    return { ok: false, message: 'Item already has a fractured modifier.', item };
  }
  // Pick a random non-fractured affix
  const candidateIdxs = item.affixes
    .map((a, i) => (item.fractured.find((f) => f.modId === a.modId) ? -1 : i))
    .filter((i) => i >= 0);
  if (candidateIdxs.length === 0) {
    return { ok: false, message: 'No eligible affix to fracture.', item };
  }
  const idx = candidateIdxs[Math.floor(Math.random() * candidateIdxs.length)];
  const target = item.affixes[idx];
  return {
    ok: true,
    message: `Fractured modifier: ${target.name} (locked).`,
    item: {
      ...item,
      fractured: [...item.fractured, target],
      history: [...item.history, { action: 'Fracturing Orb', detail: `Locked: ${target.name}` }],
    },
  };
}

export function essenceOrb(ctx: EmulatorContext): CraftResult {
  // Essence: upgrades a Magic item to Rare with a guaranteed modifier,
  // OR removes a random modifier and adds a guaranteed one on a Rare item
  // (the latter is for corrupted-tier essences like Hysteria).
  const { item, base, currency } = ctx;
  // Fallback from essenceId to activeCurrencyId so the simulator UI works
  const essenceId = ((ctx as any).essenceId || ctx.activeCurrencyId) as string | undefined;
  const essence = currency.find((c) => c.id === essenceId);
  if (!essence) {
    return { ok: false, message: 'Essence not specified.', item };
  }

  // Standard essences upgrade Magic → Rare. Corrupted-tier essences work on Rares.
  const isCorrupted = (essence as any).tier === 'corrupted' || /hysteria|insanity|horror|delirium|abyss|breach/i.test(essence.name || '');
  if (item.rarity === 'rare' && !isCorrupted) {
    return { ok: false, message: `${essence.name} only works on Magic items (use Alt+Regal instead for rares).`, item };
  }

  // Magic → Rare: just add a guaranteed affix and upgrade
  if (item.rarity === 'magic') {
    const guaranteedMod = (essence as any).guaranteedMod as string | undefined;
    if (!guaranteedMod) {
      return { ok: false, message: 'Essence has no guaranteed mod defined.', item };
    }
    const mod = ctx.mods.find((m) => m.id === guaranteedMod || m.name === guaranteedMod);
    if (!mod) {
      // Try by description fragment. The guaranteed mod text is usually
      // "<equipment condition>: <actual mod text>" â€” strip the prefix and
      // match the actual mod text against the mod descriptions.
      const colonIdx = guaranteedMod.indexOf(':');
      const modText = (colonIdx >= 0 ? guaranteedMod.slice(colonIdx + 1) : guaranteedMod).trim().toLowerCase();
      const match = ctx.mods.find((m) => m.description.toLowerCase().includes(modText));
      if (!match) {
        return { ok: false, message: `Guaranteed mod not found: ${guaranteedMod}`, item };
      }
      return upgradeWithGuaranteed(item, base, ctx, match);
    }
    return upgradeWithGuaranteed(item, base, ctx, mod);
  }

  // Rare â†’ Rare (corrupted essences): remove a random, add a guaranteed
  if (item.rarity === 'rare') {
    if (item.affixes.length === 0) {
      return { ok: false, message: 'No affixes to remove.', item };
    }
    const fracturedIds = new Set(item.fractured.map((f: any) => f.modId));
    const removable = item.affixes.filter((a: Affix) => !fracturedIds.has(a.modId));
    if (removable.length === 0) return { ok: false, message: 'Only fractured affixes remain — cannot remove them.', item };
    const removeIdx = Math.floor(Math.random() * removable.length);
    const removed = removable[removeIdx];
    const guaranteedMod = (essence as any).guaranteedMod as string | undefined;
    let mod = guaranteedMod ? ctx.mods.find((m) => m.id === guaranteedMod || m.name === guaranteedMod) : null;
    if (!mod && guaranteedMod) {
      const colonIdx = guaranteedMod.indexOf(':');
      const modText = (colonIdx >= 0 ? guaranteedMod.slice(colonIdx + 1) : guaranteedMod).trim().toLowerCase();
      mod = ctx.mods.find((m) => m.description.toLowerCase().includes(modText));
    }
    if (!mod) {
      return { ok: false, message: `Guaranteed mod not found: ${guaranteedMod}`, item };
    }
    const newAffix: Affix = {
      modId: mod.id,
      type: mod.type === 'any' ? (removed.type) : (mod.type as 'prefix' | 'suffix'),
      tier: mod.tier,
      name: mod.name,
      tags: mod.tags,
    };
    const next: ItemState = {
      ...item,
      affixes: [...item.affixes.slice(0, removeIdx), newAffix, ...item.affixes.slice(removeIdx + 1)],
      history: [...item.history, { action: essence.name, detail: `Removed ${removed.name}, added ${mod.name}` }],
    };
    return { ok: true, message: `${essence.name}: removed ${removed.name}, added ${mod.name}.`, item: next, rolledAffixes: [newAffix] };
  }

  return { ok: false, message: `${essence.name} cannot be applied to a ${item.rarity} item.`, item };
}

function upgradeWithGuaranteed(
  item: ItemState,
  base: BaseItem,
  ctx: EmulatorContext,
  mod: Mod
): CraftResult {
  const newAffix: Affix = {
    modId: mod.id,
    type: mod.type === 'any' ? 'suffix' : (mod.type as 'prefix' | 'suffix'),
    tier: mod.tier,
    name: mod.name,
    tags: mod.tags,
  };
  return {
    ok: true,
    message: `Upgraded to Rare with guaranteed mod: ${mod.name}.`,
    item: {
      ...item,
      rarity: 'rare',
      affixes: [...item.affixes, newAffix],
      history: [...item.history, { action: ctx.currency.find((c) => c.category === 'essence')?.name || 'Essence', detail: `Guaranteed: ${mod.name}` }],
    },
    rolledAffixes: [newAffix],
  };
}

export function preservedCranium(ctx: EmulatorContext): CraftResult {
  const { item, base } = ctx;
  if (base.slot !== 'jewel') {
    return { ok: false, message: 'Preserved Cranium only works on Jewels.', item };
  }
  if (item.rarity !== 'rare') {
    return { ok: false, message: 'Cranium requires a Rare Jewel.', item };
  }
  if (item.desecrated) {
    return { ok: false, message: 'This jewel has already been desecrated.', item };
  }

  const desecratedMods = ctx.mods.filter((m) => m.jewelSubtype === 'desecrated');
  if (desecratedMods.length === 0) {
    return { ok: false, message: 'No desecrated mods available.', item };
  }

  // Omen of Abyssal Echoes rerolls the options
  const echoOmen = omenOf(ctx.activeOmens, 'replace_all_desecrate');
  const pool = echoOmen ? [...desecratedMods].sort(() => Math.random() - 0.5) : desecratedMods;

  const mod = pool[Math.floor(Math.random() * pool.length)];
  const affix: Affix = {
    modId: mod.id,
    type: 'suffix',
    tier: 1,
    name: mod.name,
    tags: mod.tags,
  };

  return {
    ok: true,
    message: `Desecrated with ${mod.name}${echoOmen ? ' (Abyssal Echoes rerolled options)' : ''}.`,
    item: {
      ...item,
      desecrated: true,
      affixes: [...item.affixes, affix],
      history: [...item.history, { action: 'Preserved Cranium', detail: `Desecrated: ${mod.name}` }],
    },
    rolledAffixes: [affix],
  };
}

/**
 * Internal type ids used in poe2db's raw data to identify which liquid
 * currency a mod belongs to.  Extracted from the `data-hover` query string
 * on each mod's `liquidCurrencyName` HTML.
 *
 *   EndgameDistilledEmotion2  â†’ Potent Liquid Ferocity + Ancient variants
 *   EndgameDistilledEmotion3  â†’ Potent Liquid Contempt + Ancient variants
 */
const LIQUID_INTERNAL_TYPE: Record<string, string> = {
  potent_liquid_ferocity:         'endgamedistilledemotion2',
  potent_liquid_contempt:         'endgamedistilledemotion3',
  ancient_potent_liquid_ferocity: 'endgamedistilledemotion2',
  ancient_potent_liquid_contempt: 'endgamedistilledemotion3',
};

/**
 * Find the pair of liquid mods (prefix + suffix) that belong to a given
 * internal GGG type slug.
 */
function findLiquidModPair(
  internalType: string,
  allMods: Mod[],
): { prefix: Mod | undefined; suffix: Mod | undefined } {
  const candidates = allMods.filter((m) => {
    const href = (m.liquidCurrencyName || '').toLowerCase();
    return href.includes(internalType);
  });
  return {
    prefix: candidates.find((m) => m.type === 'prefix'),
    suffix: candidates.find((m) => m.type === 'suffix'),
  };
}

/** Liquid Emotion â€” applies a guaranteed jewel mod from the liquid pool.
 *
 * Game mechanic (verified against poe2db description):
 *   1. Removes a random existing modifier from the jewel.
 *   2. Augments the jewel with a guaranteed Crafted modifier.
 *   3. The effect of the crafted modifier depends on which affix slot it
 *      occupies:
 *        - Prefix slot â†’ "+1 Suffix Modifier allowed" / "incr. Effect of Suffixes"
 *        - Suffix slot â†’ "+1 Prefix Modifier allowed" / "incr. Effect of Prefixes"
 */
export function liquidEmotion(ctx: EmulatorContext): CraftResult {
  const { item, base } = ctx;
  if (base.slot !== 'jewel') {
    return { ok: false, message: 'Liquid Emotions only work on Jewels.', item };
  }
  if (item.rarity !== 'rare') {
    return { ok: false, message: 'Liquid Emotion requires a Rare jewel.', item };
  }

  const liquidMods = ctx.mods.filter((m) => m.jewelSubtype === 'liquid');
  if (liquidMods.length === 0) {
    return { ok: false, message: 'No liquid mods available for this jewel.', item };
  }

  // 1. Identify the active liquid currency
  const activeId = (ctx.activeCurrencyId || '').toLowerCase();
  const activeCurrency = ctx.currency.find(
    (c) => c.id && c.id.toLowerCase() === activeId,
  );
  if (!activeCurrency) {
    return { ok: false, message: `Unknown liquid currency: ${activeId}`, item };
  }

  // 2. Resolve the internal GGG type slug for this liquid
  let internalType = LIQUID_INTERNAL_TYPE[activeId];
  if (!internalType) {
    // Fallback: extract from the liquid currency's image URL path
    // e.g. ".../DistilledEmotions/UniqueBeastEmotion.webp" â†’ "uniquebeastemotion"
    const imgSlug =
      (activeCurrency.imageUrl || '').split('/').pop()?.replace(/\.webp$/i, '').toLowerCase() || '';
    for (const m of liquidMods) {
      const href = (m.liquidCurrencyName || '').toLowerCase();
      if (href.includes(imgSlug)) {
        const typeMatch = href.match(/endgamedistilledemotion\d+/);
        if (typeMatch) {
          internalType = typeMatch[0];
          break;
        }
      }
    }
    if (!internalType) {
      return {
        ok: false,
        message: `Could not resolve mod pool for liquid: ${activeCurrency.name}.`,
        item,
      };
    }
  }

  // 3. Find both the prefix & suffix variant mods for this liquid pool
  const { prefix: prefixMod, suffix: suffixMod } = findLiquidModPair(internalType, liquidMods);
  if (!prefixMod && !suffixMod) {
    return {
      ok: false,
      message: `No mod variants found for ${activeCurrency.name}.`,
      item,
    };
  }

  // 4. Prevent re-application of the same liquid type
  if (item.appliedLiquids.some((lid) => lid.includes(internalType))) {
    return {
      ok: false,
      message: 'This liquid type has already been applied to this jewel.',
      item,
    };
  }

  // 5. Determine which slot to fill based on remaining capacity
  const slots = effectiveSlots(item, base);
  const usedPrefixes = item.affixes.filter((a) => a.type === 'prefix').length;
  const usedSuffixes = item.affixes.filter((a) => a.type === 'suffix').length;
  const prefixOpen = slots.prefix - usedPrefixes;
  const suffixOpen = slots.suffix - usedSuffixes;

  // PoE2 mechanic: liquid removes a random mod first (freeing a slot), then adds
  // a crafted mod.  So it works on a full jewel as long as there's at least one
  // mod to remove.  Only fail if there are 0 affixes AND 0 open slots.
  const hasAnyAffix = item.affixes.length > 0;
  if (prefixOpen <= 0 && suffixOpen <= 0 && !hasAnyAffix) {
    return { ok: false, message: 'Jewel has no open affix slots and no existing mods to replace.', item };
  }

  // Determine target slot.  If both are full, any slot will do (the removal
  // will free one), so pick arbitrarily.
  // Prefer the slot with more room; if equal prefer suffix (typical PoE2 jewelry).
  let targetType: 'prefix' | 'suffix';
  if (prefixOpen > suffixOpen && prefixMod) {
    targetType = 'prefix';
  } else if (suffixOpen > prefixOpen && suffixMod) {
    targetType = 'suffix';
  } else if (prefixOpen > 0 && prefixMod) {
    targetType = 'prefix';
  } else if (suffixOpen > 0 && suffixMod) {
    targetType = 'suffix';
  } else if (prefixMod && suffixMod) {
    // Both full, but removal will free one â€” pick whichever has more affixes to replace
    const prefixCount = item.affixes.filter(a => a.type === 'prefix').length;
    const suffixCount = item.affixes.filter(a => a.type === 'suffix').length;
    targetType = suffixCount >= prefixCount ? 'suffix' : 'prefix';
  } else if (prefixMod) {
    targetType = 'prefix';
  } else if (suffixMod) {
    targetType = 'suffix';
  } else {
    return { ok: false, message: 'No mod variant available for any slot.', item };
  }

  const matchedMod = targetType === 'prefix' ? prefixMod! : suffixMod!;

  // 6. PoE2 mechanic: "Removes a random modifier and Augments with a new
  //    guaranteed Crafted modifier" (per poe2db description)
  let nextItem = { ...item };
  let removedMessage = '';
  if (nextItem.affixes.length > 0) {
    const removeIdx = Math.floor(Math.random() * nextItem.affixes.length);
    const removed = nextItem.affixes[removeIdx];
    const newAffixes = [...nextItem.affixes];
    newAffixes.splice(removeIdx, 1);
    nextItem = { ...nextItem, affixes: newAffixes };
    removedMessage = `Removed ${removed.name} (${removed.type})`;
  }

  // 7. Build the new affix for the targeted slot
  const newAffix: Affix = {
    modId: matchedMod.id,
    type: targetType,
    tier: matchedMod.tier,
    name: matchedMod.name,
    tags: matchedMod.tags,
  };

  // 8. Calculate bonus slots from the applied mod
  let bonusPrefix = 0;
  let bonusSuffix = 0;
  if (matchedMod.description.includes('+1 Suffix Modifier allowed')) bonusSuffix = 1;
  if (matchedMod.description.includes('+1 Prefix Modifier allowed')) bonusPrefix = 1;

  const next: ItemState = {
    ...nextItem,
    affixes: [...nextItem.affixes, newAffix],
    bonusPrefixSlots: nextItem.bonusPrefixSlots + bonusPrefix,
    bonusSuffixSlots: nextItem.bonusSuffixSlots + bonusSuffix,
    appliedLiquids: [...nextItem.appliedLiquids, internalType],
    history: [
      ...nextItem.history,
      {
        action: 'Liquid Emotion',
        detail: `${removedMessage} â†’ Applied "${matchedMod.description}" to ${targetType} slot`,
      },
    ],
  };

  const msg = [
    removedMessage,
    `Applied "${matchedMod.description}" to ${targetType} slot`,
    bonusPrefix ? '(+1 prefix slot gained)' : '',
    bonusSuffix ? '(+1 suffix slot gained)' : '',
  ]
    .filter(Boolean)
    .join('. ');

  return { ok: true, message: msg, item: next, rolledAffixes: [newAffix] };
}

/* ============================================================
   Catalyst â€” adds quality to ring/amulet/jewel
   ============================================================ */

export function catalystOrb(ctx: EmulatorContext): CraftResult {
  const { item, base } = ctx;
  // Catalysts work on Rings, Amulets, and Jewels
  if (!['ring', 'amulet', 'jewel'].includes(base.slot)) {
    return { ok: false, message: `Catalysts only work on Rings, Amulets, and Jewels.`, item };
  }
  if (item.rarity !== 'magic' && item.rarity !== 'rare') {
    return { ok: false, message: `Catalysts require a Magic or Rare item.`, item };
  }
  // Check if catalyst already applied (simple cap: one catalyst)
  const existing = item.affixes.find((a) => a.tags.includes('catalyst'));
  if (existing) {
    return { ok: false, message: `Item already has a catalyst applied.`, item };
  }
  // Resolve the catalyst's tag affinity from its description
  const activeId = (ctx.activeCurrencyId || '').toLowerCase();
  const activeCurrency = ctx.currency.find((c) => (c.id || '').toLowerCase() === activeId);
  const desc = (activeCurrency?.description || activeCurrency?.mechanics || '').toLowerCase();
  let tagAffinity = '';
  if (desc.includes('life') || desc.includes('mana')) tagAffinity = 'life mana';
  else if (desc.includes('cast speed') || desc.includes('spell')) tagAffinity = 'caster';
  else if (desc.includes('attack')) tagAffinity = 'attack';
  else if (desc.includes('elemental') || desc.includes('fire') || desc.includes('cold') || desc.includes('lightning')) tagAffinity = 'elemental';
  else if (desc.includes('chaos')) tagAffinity = 'chaos';
  else if (desc.includes('physical')) tagAffinity = 'physical';
  else if (desc.includes('defence') || desc.includes('armour') || desc.includes('evasion') || desc.includes('shield')) tagAffinity = 'defence';
  else tagAffinity = 'generic';

  const isRefined = activeId.includes('refined');
  const qualityGained = isRefined ? 10 : 5;

  const catalystAffix: Affix = {
    modId: `catalyst_${activeId}_${Date.now()}`,
    type: 'prefix',
    tier: 1,
    name: `${qualityGained}% ${tagAffinity} Quality`,
    tags: ['catalyst', tagAffinity],
    };
  // Apply the catalyst to the item
  return {
    ok: true,
    message: 'Applied catalyst: ' + catalystAffix.name + '.',
    item: {
      ...item,
      affixes: [...item.affixes, catalystAffix],
      history: [...item.history, { action: 'Catalyst', detail: 'Applied catalyst: ' + catalystAffix.name }],
    },
  };
}



export function emptyItem(base, itemLevel) {
  return {
    baseId: base.id,
    baseName: base.name,
    slot: base.slot,
    rarity: 'normal',
    itemLevel: itemLevel || 1,
    affixes: [],
    corrupted: false,
    desecrated: false,
    fractured: [],
    bonusPrefixSlots: 0,
    bonusSuffixSlots: 0,
    appliedLiquids: [],
    foresight: false,
    history: [],
  };
}



export const OPERATIONS: Record<string, (c: any) => any> = {
  orb_of_transmutation: orbOfTransmutation,
  orb_of_augmentation: orbOfAugmentation,
  regal_orb: regalOrb,
  orb_of_alchemy: orbOfAlchemy,
  exalted_orb: exaltedOrb,
  orb_of_annulment: orbOfAnnulment,
  chaos_orb: chaosOrb,
  divine_orb: divineOrb,
  vaal_orb: vaalOrb,
  orb_of_chance: orbOfChance,
  desecrate: desecrate,
  ancient_orb: ancientOrb,
  mirror_of_kalandra: mirrorOfKalandra,
  fracturing_orb: fracturingOrb,
  essence: essenceOrb,
  preserved_cranium: preservedCranium,
  liquid_emotion: liquidEmotion,
  catalyst: catalystOrb,
  alloy: essenceOrb,
  hinekoras_lock: hinekoraLock,
};

function orbOfChance(ctx: EmulatorContext): CraftResult {
  // Orb of Chance: gambles a Normal item. PoE2 outcomes: ~1% Unique, ~10% Rare, ~15% Magic, ~74% nothing.
  const { item } = ctx;
  if (item.rarity !== 'normal') return { ok: false, message: 'Chance only works on Normal items.', item };

  // Omen of the Ancients: guarantees Unique
  if (omenOf(ctx.activeOmens, 'specific_unique')) {
    return { ok: true, message: 'Omen of the Ancients — upgraded to a Unique!', item: { ...item, rarity: 'unique' as const, history: [...item.history, { action: 'Orb of Chance (Ancients)', detail: 'Upgraded to Unique' }] } };
  }

  const roll = Math.random();
  if (roll < 0.01) {
    return { ok: true, message: 'Transformed into a Unique item!', item: { ...item, rarity: 'unique' as const, history: [...item.history, { action: 'Orb of Chance', detail: 'Upgraded to Unique' }] } };
  } else if (roll < 0.11) {
    return { ok: true, message: 'Upgraded to Rare!', item: { ...item, rarity: 'rare' as const, history: [...item.history, { action: 'Orb of Chance', detail: 'Upgraded to Rare' }] } };
  } else if (roll < 0.26) {
    return { ok: true, message: 'Upgraded to Magic!', item: { ...item, rarity: 'magic' as const, history: [...item.history, { action: 'Orb of Chance', detail: 'Upgraded to Magic' }] } };
  } else {
    return { ok: true, message: (omenOf(ctx.activeOmens, 'no_destroy') ? 'Chance missed — Omen preserved the item.' : 'Chance missed — item unchanged.'), item };
  }
}

function hinekoraLock(ctx: EmulatorContext): CraftResult {
  // Hinekora's Lock: sets foresight on the item so next currency previews without consuming.
  const { item } = ctx;
  if (item.foresight) return { ok: false, message: 'Already under foresight.', item };
  return {
    ok: true,
    message: 'Foresight active. Next currency will preview without consuming.',
    item: {
      ...item,
      foresight: true,
      history: [...item.history, { action: 'Hinekora\'s Lock', detail: 'Foresight activated' }],
    },
  };
}

export function applyOperation(
  currencyId: string,
  ctx: EmulatorContext
): CraftResult {
  // Use module-level OPERATIONS constant
  const op = OPERATIONS[currencyId];
  if (!op) return { ok: false, message: "Unknown operation: " + currencyId, item: ctx.item };
  return op(ctx);
}

export function getCurrencyAvailability(item: ItemState, base: BaseItem): Record<string, { valid: boolean; reason: string }> {
  const result: Record<string, { valid: boolean; reason: string }> = {};
  const rarity = item.rarity;
  const affixes = item.affixes;

  if (!item) {
    for (const id of Object.keys(OPERATIONS)) {
      result[id] = { valid: false, reason: 'Select a base item first.' };
    }
    result.desecrate = { valid: false, reason: 'Select a base item first.' };
    return result;
  }

  if (item.corrupted) {
    for (const id of Object.keys(OPERATIONS)) {
      result[id] = { valid: false, reason: 'Cannot apply to a corrupted item.' };
    }
    result.desecrate = { valid: false, reason: 'Cannot apply to a corrupted item.' };
    return result;
  }

  // Normal-only
  result.orb_of_transmutation = {
    valid: rarity === 'normal' && !item.mirrored,
    reason: rarity === 'normal' ? 'Upgrade Normal → Magic (adds 1 random prefix).' : 'Transmutation only works on Normal items.',
  };
  result.orb_of_alchemy = {
    valid: rarity === 'normal' && !item.mirrored,
    reason: rarity === 'normal' ? 'Upgrade Normal → Rare (adds 4 random affixes).' : 'Alchemy only works on Normal items.',
  };
  result.orb_of_chance = {
    valid: rarity === 'normal' && !item.mirrored,
    reason: rarity === 'normal' ? 'Gamble Normal → random outcome (magic/rare/unique/nothing).' : 'Chance only works on Normal items.',
  };

  // Magic-only
  result.orb_of_augmentation = {
    valid: rarity === 'magic' && affixes.length < 2 && !item.mirrored,
    reason: rarity !== 'magic' ? 'Augmentation only works on Magic items.' : 'Magic item is already full (1 prefix + 1 suffix).',
  };
  result.regal_orb = {
    valid: rarity === 'magic' && affixes.length >= 2 && !item.mirrored,
    reason: rarity !== 'magic' ? 'Regal only works on Magic items.' : 'Magic item must have 2 affixes before Regal.',
  };

  // Rare-only
  const maxSlots = base ? effectiveSlots(item, base).prefix + effectiveSlots(item, base).suffix : 6;
  result.exalted_orb = {
    valid: rarity === 'rare' && affixes.length < maxSlots && !item.mirrored,
    reason: rarity !== 'rare' ? 'Exalted only works on Rare items.' : 'Rare item is full (all affix slots filled).',
  };
  result.chaos_orb = {
    valid: rarity === 'rare' && affixes.length > 0 && !item.mirrored,
    reason: rarity !== 'rare' ? 'Chaos only works on Rare items.' : 'Rare item has no affixes to reroll.',
  };

  // Hybrid Magic/Rare
  result.orb_of_annulment = {
    valid: (rarity === 'magic' || rarity === 'rare') && affixes.length > 0 && !item.mirrored,
    reason: affixes.length === 0 ? 'No affixes to remove.' : 'Annul works on Magic or Rare items.',
  };

  // Always if affixes exist
  result.divine_orb = {
    valid: affixes.length > 0 && !item.mirrored,
    reason: affixes.length === 0 ? 'No affixes to divine.' : 'Rerolls numeric values of all affixes.',
  };

  // Corrupt-only
  result.vaal_orb = {
    valid: !item.corrupted && !item.mirrored,
    reason: item.corrupted ? 'Already corrupted.' : 'Corrupts the item. Locks further crafting.',
  };

  // Desecrate
  result.desecrate = {
    valid: ['amulet', 'ring', 'belt', 'weapon_1h', 'weapon_2h', 'quiver', 'jewel'].includes(item.slot) && rarity === 'rare' && !item.mirrored,
    reason: !['amulet', 'ring', 'belt', 'weapon_1h', 'weapon_2h', 'quiver', 'jewel'].includes(item.slot) ? 'This item type cannot be desecrated.' : rarity !== 'rare' ? 'Requires a Rare item.' : 'Adds a desecrated affix from one of 3 factions.',
  };

  // Ancient Orb
  result.ancient_orb = {
    valid: rarity === 'unique' && !item.corrupted && !item.mirrored,
    reason: rarity !== 'unique' ? 'Ancient Orb only works on Unique items (reforges to another Unique of the same class).' : 'Reforges to another Unique of the same class.',
  };
  result.mirror_of_kalandra = {
    valid: (rarity === 'rare' || rarity === 'unique') && !item.mirrored && !item.corrupted,
    reason: rarity !== 'rare' && rarity !== 'unique' ? 'Mirror of Kalandra only works on Rare or Unique items.' : 'Mirrors the current state.',
  };

  // Fracturing Orb
  result.fracturing_orb = {
    valid: rarity === 'rare' && affixes.length >= 4 && item.fractured.length === 0 && !item.mirrored,
    reason: rarity !== 'rare' ? 'Fracturing Orb only works on Rare items.' : affixes.length < 4 ? 'Fracturing Orb requires at least 4 modifiers.' : 'Item already has a fractured modifier.',
  };

  // Others
  result.preserved_cranium = {
    valid: item.slot === 'jewel' && rarity === 'rare' && !item.mirrored,
    reason: item.slot !== 'jewel' ? 'Preserved Cranium only works on Jewels.' : 'Requires a Rare Jewel.',
  };
  result.liquid_emotion = {
    valid: item.slot === 'jewel' && rarity === 'rare' && !item.mirrored,
    reason: item.slot !== 'jewel' ? 'Liquid Emotions only work on Jewels.' : rarity !== 'rare' ? 'Requires a Rare Jewel.' : 'Apply a liquid emotion to add a guaranteed mod.',
  };
  result.essence = {
    valid: (rarity === 'magic' || rarity === 'rare') && !item.mirrored,
    reason: rarity !== 'magic' && rarity !== 'rare' ? 'Essence requires a Magic or Rare item.' : 'Apply a guaranteed-mod essence. (Waystone compatibility unverified — operation will fail gracefully if essence has no matching mod for this slot.)',
  };
  result.alloy = {
    valid: rarity === 'rare' && !item.mirrored,
    reason: rarity !== 'rare' ? 'Alloy requires a Rare item.' : 'Removes a random mod and adds a guaranteed mod.',
  };
  result.hinekoras_lock = {
    valid: !item.foresight && (rarity === 'normal' || rarity === 'magic' || rarity === 'rare') && !item.corrupted && !item.mirrored,
    reason: item.foresight ? 'Already under foresight.' : item.corrupted ? 'Cannot apply to a corrupted item.' : 'Applies foresight: next currency shows preview without consuming it.',
  };

  return result;
}