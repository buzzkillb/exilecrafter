/**
 * PoE2 Item Paste Parser & Importer
 * Standalone module — handles in-game clipboard format for all item types.
 */

export interface ParsedMod {
  type: 'prefix' | 'suffix' | 'implicit';
  tier: number;
  name: string;
  crafted: boolean;
  desecrated: boolean;
  fractured: boolean;
  corrupted: boolean;
}

export interface ParsedItem {
  itemClass: string;
  rarity: 'normal' | 'magic' | 'rare' | 'unique';
  name: string;
  baseName: string;
  baseId: string;
  itemLevel: number;
  requiredLevel: number;
  implicit: string;
  affixes: ParsedMod[];
  raw: string;
}

/**
 * Parse the PoE2 in-game clipboard text into a structured item.
 */
export function parsePoe2Clipboard(text: string): ParsedItem | null {
  const lines = text.split(/\r?\n/);
  let idx = 0;

  function nextLine(): string | null {
    while (idx < lines.length) {
      const l = lines[idx++].trim();
      if (l.length > 0) return l;
    }
    return null;
  }

  // 1. Item Class
  const first = nextLine();
  if (!first || !first.startsWith('Item Class:')) return null;
  const itemClass = first.slice('Item Class:'.length).trim().toLowerCase();

  // 2. Rarity
  const rarityLine = nextLine();
  let rarity: 'normal' | 'magic' | 'rare' | 'unique' = 'rare';
  if (rarityLine && rarityLine.startsWith('Rarity:')) {
    const r = rarityLine.slice('Rarity:'.length).trim().toLowerCase();
    if (r === 'normal' || r === 'magic' || r === 'rare' || r === 'unique') rarity = r;
  }

  // 3. Item name(s)
  // In-game clipboard has format:
  //   Torment Whorl
  //   Gold Ring
  // (unique name on line 3, base name on line 4)
  // OR just the base name on line 3.
  const nameLine1 = nextLine();
  let baseName = nameLine1 || '';

  // Peek ahead to see if the next non-empty line is another name line or a separator
  let savedIdx = idx;
  let peekLine: string | null = null;
  while (savedIdx < lines.length) {
    const t = lines[savedIdx].trim();
    savedIdx++;
    if (t.length > 0) { peekLine = t; break; }
  }

  if (peekLine && !peekLine.startsWith('---') && !peekLine.startsWith('{')) {
    // Two name lines — the peeked line is the base name
    baseName = peekLine;
    idx = savedIdx; // advance past the peeked line
  } else {
    // Single name line — restore idx
    idx = savedIdx - 1;
    // Reset peekLine to reflect restored position
    if (peekLine && peekLine.startsWith('---')) {
      // peekLine is a separator, idx is past it, we need it back
      idx = savedIdx - 1;
    }
  }

  // Parse remaining lines for item level, required level, and mod blocks
  let itemLevel = 80;
  let requiredLevel = 0;
  let implicit = '';
  const affixes: ParsedMod[] = [];
  let inModBlock = false;
  let currentMod: { type: string; tier: number; name: string; crafted: boolean; desecrated: boolean } | null = null;

  function parseModHeader(l: string) {
    const m = l.match(/^\{\s*(?:(Crafted)\s+)?(?:(Desecrated)\s+)?(Implicit|Prefix|Suffix)\s+Modifier\s*(?:"([^"]+)")?\s*(?:\(Tier:\s*(\d+)\))?/i);
    if (!m) return null;
    const isCrafted = !!m[1];
    const isDesecrated = !!m[2];
    const modType = (m[3] || '').toLowerCase();
    const name = m[4] || '';
    const tier = m[5] ? parseInt(m[5], 10) : 1;
    return { type: modType, tier, name, crafted: isCrafted, desecrated: isDesecrated };
  }

  for (let i = idx; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) { inModBlock = false; continue; }
    if (l.startsWith('---')) { inModBlock = false; continue; }

    if (/^Item\s*Level:\s*\d+/i.test(l)) {
      itemLevel = parseInt(l.replace(/^Item\s*Level:\s*/i, ''), 10);
      continue;
    }
    if (/^Requires?:\s*Level\s+(\d+)/i.test(l)) {
      requiredLevel = parseInt(l.replace(/^Requires?:\s*Level\s+/i, ''), 10);
      continue;
    }

    if (l.startsWith('{')) {
      const parsed = parseModHeader(l);
      if (parsed) {
        currentMod = parsed;
        inModBlock = true;
        continue;
      }
    }

    if (inModBlock && currentMod) {
      // Lines that start with these patterns are actual mod values
      if (l.startsWith('+') || l.startsWith('Adds') || /^\d/.test(l) || /^[A-Z]/.test(l)) {
        const modType = currentMod.type;
        const tier = currentMod.tier;
        const isCrafted = currentMod.crafted;
        const isDesecrated = currentMod.desecrated;

        if (modType === 'implicit') {
          implicit = l;
        } else {
          let type: 'prefix' | 'suffix' = 'prefix';
          if (modType === 'suffix') type = 'suffix';

          affixes.push({
            type,
            tier,
            name: l,
            crafted: isCrafted,
            desecrated: isDesecrated,
            fractured: false,
            corrupted: false,
          });
        }
        currentMod = null;
        inModBlock = false;
      }
      // Fallback: some mod values might not match the expected patterns
      else if (l.length > 3) {
        const modType = currentMod.type;
        const tier = currentMod.tier;
        const isCrafted = currentMod.crafted;
        const isDesecrated = currentMod.desecrated;

        if (modType === 'implicit') {
          implicit = l;
        } else {
          let type: 'prefix' | 'suffix' = 'prefix';
          if (modType === 'suffix') type = 'suffix';

          affixes.push({
            type,
            tier,
            name: l,
            crafted: isCrafted,
            desecrated: isDesecrated,
            fractured: false,
            corrupted: false,
          });
        }
        currentMod = null;
        inModBlock = false;
      }
    }
  }

  return {
    itemClass,
    rarity,
    name: nameLine1 || baseName || 'Unknown',
    baseName,
    baseId: '', // caller fills this
    itemLevel,
    requiredLevel,
    implicit,
    affixes,
    raw: text,
  };
}

/**
 * Slot mapping from Item Class to our slot key.
 */
const ITEM_CLASS_TO_SLOT: Record<string, string> = {
  rings: 'ring',
  amulets: 'amulet',
  belts: 'belt',
  'body armours': 'body_armour',
  'chest armours': 'body_armour',
  boots: 'boots',
  gloves: 'gloves',
  helmets: 'helmet',
  shields: 'shield',
  quivers: 'quiver',
  focus: 'focus',
  charms: 'charm',
  jewels: 'jewel',
  flasks: 'flask',
  waystones: 'waystone',
  tablets: 'tablet',
  relics: 'relic',
  bows: 'weapon_2h',
  crossbows: 'weapon_2h',
  staves: 'weapon_2h',
  spears: 'weapon_1h',
  wands: 'weapon_1h',
  sceptres: 'weapon_1h',
  flails: 'weapon_1h',
  swords: 'weapon_1h',
  axes: 'weapon_1h',
  maces: 'weapon_1h',
  'one handed weapons': 'weapon_1h',
  'two handed weapons': 'weapon_2h',
};

/**
 * Known base name suffixes for disambiguation.
 */
const BASE_SUFFIXES = [
  'ring', 'amulet', 'helmet', 'boots', 'gloves', 'shield', 'quiver',
  'focus', 'spear', 'sword', 'axe', 'mace', 'staff', 'wand', 'sceptre',
  'bow', 'crossbow', 'flail', 'jewel', 'sapphire', 'diamond', 'ruby',
  'emerald', 'topaz', 'waystone', 'tablet', 'relic', 'greaves', 'cuirass',
  'tiara', 'crown', 'helm', 'mask', 'bascinet', 'sallet', 'casque',
];

/**
 * Find a matching base from our dataset by name + slot hint.
 */
export function findBaseByName(
  name: string,
  basesData: any[],
  slotHint?: string,
): any | null {
  if (!name || !basesData) return null;
  const n = name.toLowerCase().trim();

  // Exact match first
  let b = basesData.find((x: any) => x.name.toLowerCase() === n);
  if (b) return b;

  // Ends with base name
  b = basesData.find((x: any) => n.endsWith(x.name.toLowerCase()));
  if (b) return b;

  // Check last word against common suffixes
  const words = n.split(' ');
  const lastWord = words[words.length - 1]?.replace(/[^a-z]/g, '');
  if (lastWord && BASE_SUFFIXES.includes(lastWord)) {
    // Try from progressively shorter tails
    for (let i = Math.max(0, words.length - 2); i < words.length; i++) {
      const tail = words.slice(i).join(' ');
      b = basesData.find((x: any) => x.name.toLowerCase() === tail);
      if (b) return b;
    }
  }

  // Slot-based: match item class to slot, then find base by slot
  if (slotHint) {
    b = basesData.find((x: any) => x.slot === slotHint && n.includes(x.name.toLowerCase()));
    if (b) return b;
  }

  // Word-level match (3+ char words)
  for (const word of words) {
    if (word.length < 3) continue;
    b = basesData.find((x: any) => x.name.toLowerCase().includes(word));
    if (b) return b;
  }

  // Full substring match
  b = basesData.find((x: any) => x.name.toLowerCase().includes(n));
  if (b) return b;

  b = basesData.find((x: any) => n.includes(x.name.toLowerCase()));
  if (b) return b;

  return null;
}

/**
 * Import an item from pasted text into the simulator state.
 * Returns the parsed item with baseId resolved, or null if parsing fails.
 */
export function importPastedItem(
  text: string,
  basesData: any[],
): ParsedItem | null {
  const parsed = parsePoe2Clipboard(text);
  if (!parsed) return null;

  // Find matching base
  const slot = ITEM_CLASS_TO_SLOT[parsed.itemClass] || null;
  let base = findBaseByName(parsed.baseName, basesData, slot);

  // Try fallback: search by slot only
  if (!base && slot) {
    base = basesData.find((b: any) => b.slot === slot);
  }

  if (base) {
    parsed.baseId = base.id;
    parsed.baseName = base.name;
  }

  return parsed;
}
