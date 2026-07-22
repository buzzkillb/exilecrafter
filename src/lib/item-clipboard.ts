// src/lib/item-clipboard.ts
// Parse and generate PoE2 in-game clipboard item format (patch 0.2.0+)
//
// Format:
//   Item Class: Rings
//   Rarity: Rare
//   Wrath Eye Prismatic Ring
//   --------
//   Quality (Cold Modifiers): +6% (augmented)
//   --------
//   Requires: Level 56
//   --------
//   Item Level: 75
//   --------
//   +10% to all Elemental Resistances (implicit)
//   --------
//   Adds 3 to 6 Physical Damage to Attacks
//   Adds 9 to 18 Cold Damage to Attacks
//   ...

const ITEM_CLASS_TO_SLOT: Record<string, string> = {
  'amulets': 'amulet',
  'belts': 'belt',
  'body armours': 'body_armour',
  'boots': 'boots',
  'bows': 'weapon_2h',
  'bracelets': 'bracelet',
  'charms': 'charm',
  'chest armours': 'body_armour',
  'crossbows': 'weapon_2h',
  'flails': 'weapon_1h',
  'flasks': 'flask',
  'focus': 'focus',
  'gloves': 'gloves',
  'helmets': 'helmet',
  'jewels': 'jewel',
  'maces': 'weapon_1h',
  'one handed axes': 'weapon_1h',
  'one handed maces': 'weapon_1h',
  'one handed swords': 'weapon_1h',
  'one handed weapons': 'weapon_1h',
  'quivers': 'quiver',
  'rings': 'ring',
  'sceptres': 'weapon_1h',
  'shields': 'shield',
  'spears': 'weapon_1h',
  'staves': 'weapon_2h',
  'two handed axes': 'weapon_2h',
  'two handed maces': 'weapon_2h',
  'two handed swords': 'weapon_2h',
  'two handed weapons': 'weapon_2h',
  'wands': 'weapon_1h',
  'waystones': 'waystone',
  'tablets': 'tablet',
  'relics': 'relic',
};

const RARITY_MAP: Record<string, 'normal' | 'magic' | 'rare' | 'unique'> = {
  'normal': 'normal',
  'magic': 'magic',
  'rare': 'rare',
  'unique': 'unique',
};

export interface ParsedClipboardItem {
  itemClass: string;
  slot: string | null;
  rarity: 'normal' | 'magic' | 'rare' | 'unique';
  name: string;
  baseName: string;       // extracted (last part of name, or the name if it's the base)
  itemLevel: number;
  implicit: string | null;
  affixes: string[];       // raw mod description lines
  fractured: boolean;
  corrupted: boolean;
  quality: { type?: string; value: number } | null;
}

/**
 * Parse a PoE2 in-game clipboard item string.
 */
export function parseItemClipboard(text: string): ParsedClipboardItem | null {
  const lines = text.split(/\r?\n/);
  let idx = 0;

  function nextLine(): string | null {
    while (idx < lines.length) {
      const l = lines[idx++].trim();
      if (l.length > 0) return l;
    }
    return null;
  }

  function peek(): string | null {
    while (idx < lines.length && lines[idx].trim().length === 0) idx++;
    return idx < lines.length ? lines[idx].trim() : null;
  }

  const result: ParsedClipboardItem = {
    itemClass: '',
    slot: null,
    rarity: 'normal',
    name: '',
    baseName: '',
    itemLevel: 1,
    implicit: null,
    affixes: [],
    fractured: false,
    corrupted: false,
    quality: null,
  };

  // Line 1: Item Class: <Class>
  let line = nextLine();
  if (!line || !line.startsWith('Item Class:')) return null;
  result.itemClass = line.slice('Item Class:'.length).trim();
  result.slot = ITEM_CLASS_TO_SLOT[result.itemClass.toLowerCase()] || null;

  // Line 2: Rarity: <Rarity>
  line = nextLine();
  if (!line || !line.startsWith('Rarity:')) return null;
  const rarityStr = line.slice('Rarity:'.length).trim().toLowerCase();
  result.rarity = RARITY_MAP[rarityStr] || 'rare';

  // Line 3: Item Name (may include base name as suffix)
  line = nextLine();
  if (!line) return null;
  result.name = line;

  // ----- separator
  line = nextLine();
  if (!line || !line.startsWith('---')) return null;

  // Parse sections until end
  let currentSection: string[] = [];
  let inImplicit = false;

  while ((line = nextLine()) !== null) {
    if (line.startsWith('---')) {
      // End of previous section
      if (currentSection.length > 0) {
        const combined = currentSection.join(' ');
        if (inImplicit) {
          result.implicit = combined;
          inImplicit = false;
        } else {
          result.affixes.push(...currentSection);
        }
        currentSection = [];
      }
      // Check what's next
      const next = peek();
      if (!next) break;
      continue;
    }

    // Parse quality line: "Quality (Cold Modifiers): +6% (augmented)"
    const qualityMatch = line.match(/^Quality\s*(?:\(([^)]*)\))?:\s*([+-]?\d+(?:\.\d+)?)%/i);
    if (qualityMatch) {
      result.quality = { type: qualityMatch[1]?.trim(), value: parseInt(qualityMatch[2]) };
      continue;
    }

    // Parse "Requires: Level <N>"
    if (/^Requires:\s*Level\s*\d+/i.test(line)) {
      continue;
    }

    // Parse "Item Level: <N>"
    const ilvlMatch = line.match(/^Item\s*Level:\s*(\d+)/i);
    if (ilvlMatch) {
      result.itemLevel = parseInt(ilvlMatch[1]);
      continue;
    }

    // Check for "Corrupted" or "Fractured" standalone markers
    if (/^corrupted$/i.test(line.trim())) {
      result.corrupted = true;
      continue;
    }
    if (/^fractured$/i.test(line.trim())) {
      result.fractured = true;
      continue;
    }

    // Check if this is an implicit line
    if (/(implicit)/i.test(line)) {
      currentSection.push(line.replace(/\s*\(implicit\)\s*/i, '').trim());
      inImplicit = true;
      continue;
    }

    // Regular affix line
    if (line.length > 0) {
      currentSection.push(line);
    }
  }

  // Flush remaining
  if (currentSection.length > 0) {
    if (inImplicit && !result.implicit) {
      result.implicit = currentSection.join(' ');
    } else {
      result.affixes.push(...currentSection);
    }
  }

  // Extract baseName from item name:
  // Typically the item name is "Prefix BaseName" or just "BaseName"
  // Try to find a known base name from the name
  result.baseName = result.name;

  return result;
}

/**
 * Generate a PoE2 in-game clipboard format string from an item state.
 */
export function generateItemClipboard(params: {
  slot: string;
  rarity: string;
  baseName: string;
  itemLevel: number;
  implicit?: string | null;
  affixes: Array<{ type: string; tier: number; name: string; description?: string }>;
  corrupted?: boolean;
  fractured?: boolean;
}): string {
  const lines: string[] = [];

  // Reverse slot map
  const slotToClass: Record<string, string> = {};
  for (const [cls, sl] of Object.entries(ITEM_CLASS_TO_SLOT)) {
    // Capitalize each word
    slotToClass[sl] = cls.replace(/\b\w/g, c => c.toUpperCase());
  }
  const itemClass = slotToClass[params.slot] || params.slot;

  lines.push(`Item Class: ${itemClass}`);
  lines.push(`Rarity: ${params.rarity.charAt(0).toUpperCase() + params.rarity.slice(1)}`);
  lines.push(params.baseName);
  lines.push('--------');
  lines.push(`Item Level: ${params.itemLevel}`);
  lines.push('--------');

  if (params.implicit) {
    lines.push(`${params.implicit} (implicit)`);
    lines.push('--------');
  }

  const prefixes = params.affixes.filter(a => a.type === 'prefix');
  const suffixes = params.affixes.filter(a => a.type === 'suffix');

  // Match game style: prefix block first, then suffix block
  if (prefixes.length > 0) {
    for (const a of prefixes) {
      lines.push(a.description || a.name);
    }
    // Only add separator if there are also suffixes (to match game's ----- between sections)
    if (suffixes.length > 0) {
      lines.push('--------');
    }
  }

  if (suffixes.length > 0) {
    for (const a of suffixes) {
      lines.push(a.description || a.name);
    }
  }

  if (params.corrupted) {
    lines.push('--------');
    lines.push('Corrupted');
  }

  if (params.fractured) {
    if (!params.corrupted) lines.push('--------');
    lines.push('Fractured');
  }

  return lines.join('\n');
}
