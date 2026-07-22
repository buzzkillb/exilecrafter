/**
 * Import a PoE2 item from in-game clipboard text.
 * Handles the exact format produced by Ctrl+C in Path of Exile 2.
 *
 * Input format:
 *   Item Class: Rings
 *   Rarity: Rare
 *   Torment Whorl
 *   Gold Ring
 *   --------
 *   Requires: Level 60
 *   --------
 *   Item Level: 82
 *   --------
 *   { Implicit Modifier }
 *   15(6-15)% increased Rarity of Items found
 *   --------
 *   { Prefix Modifier "Tempered" (Tier: 2) }
 *   Adds 13(10-15) to 23(18-26) Physical Damage to Attacks
 *   ...
 *
 * Returns: {
 *   baseName: string | null,
 *   slot: string | null,
 *   rarity: 'normal' | 'magic' | 'rare' | 'unique',
 *   itemLevel: number,
 *   implicit: { text: string } | null,
 *   affixes: Array<{
 *     name: string,
 *     type: 'prefix' | 'suffix' | 'implicit' | 'crafted' | 'desecrated',
 *     tier: number,
 *     text: string,
 *     numericRolls?: { current: number, min: number, max: number }
 *   }>,
 *   corrupted: boolean,
 *   requiredLevel: number,
 *   warnings: string[]
 * }
 */

export function parsePoe2ItemClipboard(text) {
  const lines = text.split('\n');
  const result = {
    baseName: null,
    slot: null,
    rarity: 'normal',
    itemLevel: 0,
    implicit: null,
    affixes: [],
    corrupted: false,
    requiredLevel: 0,
    warnings: [],
  };

  // Slot / class map
  const CLASS_TO_SLOT = {
    'rings': 'ring',
    'amulets': 'amulet',
    'belts': 'belt',
    'helmets': 'helmet',
    'body armours': 'body_armour',
    'gloves': 'gloves',
    'boots': 'boots',
    'shields': 'shield',
    'quivers': 'quiver',
    'foci': 'focus',
    'wands': 'weapon_1h',
    'sceptres': 'weapon_1h',
    'staves': 'weapon_2h',
    'bows': 'weapon_2h',
    'crossbows': 'weapon_2h',
    'spears': 'weapon_1h',
    'flails': 'weapon_1h',
    'swords': 'weapon_1h',
    'axes': 'weapon_1h',
    'maces': 'weapon_1h',
    'jewels': 'jewel',
    'flasks': 'flask',
    'charms': 'charm',
    'waystones': 'waystone',
    'tablets': 'tablet',
    'relics': 'relic',
  };

  // Map rarity names
  const RARITY_MAP = {
    'normal': 'normal',
    'magic': 'magic',
    'rare': 'rare',
    'unique': 'unique',
  };

  let inMod = false;
  let currentMod = null;
  let implicitFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip blank lines and separator lines
    if (!line || line.match(/^-{5,}$/)) {
      // If we were building a mod, finalize it when hitting a separator
      if (inMod && currentMod) {
        // If we have a text for the current mod but haven't matched it yet
        // It's already handled below
        inMod = false;
      }
      continue;
    }

    // Item Class: Rings
    const classMatch = line.match(/^Item Class:\s*(.+)$/i);
    if (classMatch) {
      const cls = classMatch[1].trim().toLowerCase();
      result.slot = CLASS_TO_SLOT[cls] || CLASS_TO_SLOT[cls.replace(/s$/, '')] || cls.replace(/\s+/g, '_').toLowerCase();
      continue;
    }

    // Rarity: Rare
    const rarityMatch = line.match(/^Rarity:\s*(.+)$/i);
    if (rarityMatch) {
      const r = rarityMatch[1].trim().toLowerCase();
      result.rarity = RARITY_MAP[r] || r;
      continue;
    }

    // Requires: Level 60
    const reqMatch = line.match(/^Requires:\s*Level\s*(\d+)/i);
    if (reqMatch) {
      result.requiredLevel = parseInt(reqMatch[1], 10);
      continue;
    }

    // Item Level: 82
    const ilvlMatch = line.match(/^Item Level:\s*(\d+)/i);
    if (ilvlMatch) {
      result.itemLevel = parseInt(ilvlMatch[1], 10);
      continue;
    }

    // Corrupted
    if (line.toLowerCase() === 'corrupted') {
      result.corrupted = true;
      continue;
    }

    // { Implicit Modifier }
    if (line.match(/^\{\s*Implicit\s*Modifier\s*\}/i)) {
      currentMod = { name: '(Implicit)', type: 'implicit', tier: 0, text: '' };
      implicitFound = true;
      inMod = true;
      continue;
    }

    // { Prefix Modifier "Tempered" (Tier: 2) }
    // { Suffix Modifier "of the Rainbow" (Tier: 1) }
    // { Crafted Suffix Modifier "of Archaeology" (Tier: 1) }
    // { Desecrated Prefix Modifier "Entombing" (Tier: 1) }
    const modHeaderMatch = line.match(/^\{\s*(Crafted\s+)?(Desecrated\s+)?(Prefix|Suffix)\s+Modifier\s+"([^"]*)"\s*\(Tier:\s*(\d+)\)/i);
    if (modHeaderMatch) {
      const isCrafted = !!modHeaderMatch[1];
      const isDesecrated = !!modHeaderMatch[2];
      const type = modHeaderMatch[3].toLowerCase(); // 'prefix' or 'suffix'
      const name = modHeaderMatch[4].trim();
      const tier = parseInt(modHeaderMatch[5], 10);

      // Preserve prefix/suffix type for slot tracking, add flags for display
      currentMod = {
        name,
        type,           // 'prefix' or 'suffix' — preserves the actual slot type
        tier,
        text: '',
        crafted: isCrafted,
        desecrated: isDesecrated,
        // Display type combines the info
        displayType: isCrafted ? 'crafted' : isDesecrated ? 'desecrated' : type,
      };
      inMod = true;
      continue;
    }

    // It's the value line for the current mod
    if (inMod && currentMod) {
      // Extract numeric rolls if present: 15(6-15)% or 13(10-15) to 23(18-26)
      const numeric = extractNumericRolls(line);
      currentMod.text = line;
      if (numeric) {
        currentMod.numericRolls = numeric;
      }
      // Add the mod
      if (currentMod.type === 'implicit') {
        result.implicit = { text: currentMod.text, ...(currentMod.numericRolls ? { numericRolls: currentMod.numericRolls } : {}) };
      } else {
        result.affixes.push({
          name: currentMod.name,
          type: currentMod.type,
          tier: currentMod.tier,
          text: currentMod.text,
          ...(currentMod.numericRolls ? { numericRolls: currentMod.numericRolls } : {}),
        });
      }
      currentMod = null;
      inMod = false;
      continue;
    }

    // Lines before mods start: might be the base name (3rd or 4th non-metadata line)
    // Check if this looks like an item name (not metadata, not a mod value)
    if (!result.baseName && !line.match(/^[\{\[]/) && !line.match(/^\d/) && !line.match(/^(Adds|\+|Leech|Gain|Regenerate|Socket)/i)) {
      // This is likely the base name
      // PoE2 clipboard has: UniqueName? / BaseName / BaseName on next line for uniques
      // "Torment Whorl\nGold Ring" -> Gold Ring is the base
      if (result.rarity === 'unique' && line !== 'Gold Ring' && !line.includes(' Ring') && !line.includes(' Amulet')) {
        // Could be unique name, skip unless it looks like a base
        result._uniqueName = line;
      } else {
        result.baseName = line;
      }
    }
  }

  // Clean up: if base name wasn't found from the fallback, try harder
  if (!result.baseName) {
    // Try to find it from the 3rd non-metadata line
    let nameCandidates = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || l.match(/^-{5,}$/) || l.match(/^Item Class|^Rarity|^Requires|^Item Level|^Corrupted|^\{|^[\d+\-]|^Adds|^Leech|^Gain|^Regenerate|^Socket/i)) continue;
      nameCandidates.push(l);
    }
    // Base name is usually the 2nd or 3rd name candidate
    // For "Torment Whorl\nGold Ring", it's the 2nd one
    if (nameCandidates.length >= 2) {
      result.baseName = nameCandidates[1];
    } else if (nameCandidates.length === 1) {
      result.baseName = nameCandidates[0];
    }
  }

  // Validate
  if (!result.baseName) {
    result.warnings.push('Could not determine base item name.');
  }
  if (result.affixes.length === 0 && !result.implicit) {
    result.warnings.push('No affixes or implicit detected. The item text may not be in PoE2 in-game format.');
  }

  // Count what we got
  const prefixCount = result.affixes.filter(a => a.type === 'prefix').length;
  const suffixCount = result.affixes.filter(a => a.type === 'suffix').length;
  const craftedCount = result.affixes.filter(a => a.type === 'crafted').length;
  const desecratedCount = result.affixes.filter(a => a.type === 'desecrated').length;

  result.warnings.push(
    `Detected: ${result.baseName || 'Unknown'} (${result.slot || 'unknown slot'}, ` +
    `ilvl ${result.itemLevel || '?'}, ${result.affixes.length} mods: ` +
    `${prefixCount}P / ${suffixCount}S` +
    (craftedCount ? ` + ${craftedCount} crafted` : '') +
    (desecratedCount ? ` + ${desecratedCount} desecrated` : '') +
    (result.implicit ? ' + implicit' : '') +
    `, ${result.rarity})`
  );

  return result;
}

/**
 * Extract numeric min/max/current values from a PoE2 mod text line.
 * Handles:
 *   15(6-15)% increased Rarity of Items found
 *   Adds 13(10-15) to 23(18-26) Physical Damage to Attacks
 *   Leech 7.55(7-7.9)% of Physical Attack Damage as Life
 *   +16(15-16)% to all Elemental Resistances
 */
function extractNumericRolls(text) {
  // Single-value: 15(6-15)
  const singleMatch = text.match(/([\d.]+)\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/);
  if (singleMatch) {
    return {
      current: parseFloat(singleMatch[1]),
      min: parseFloat(singleMatch[2]),
      max: parseFloat(singleMatch[3]),
    };
  }

  // Double-value (Adds X-Y to Z-W): 13(10-15) to 23(18-26)
  const doubleMatch = text.match(/([\d.]+)\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)\s+to\s+([\d.]+)\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/);
  if (doubleMatch) {
    return {
      current: [parseFloat(doubleMatch[1]), parseFloat(doubleMatch[4])],
      min: [parseFloat(doubleMatch[2]), parseFloat(doubleMatch[5])],
      max: [parseFloat(doubleMatch[3]), parseFloat(doubleMatch[6])],
      type: 'range_pair',
    };
  }

  return null;
}

/**
 * Try to find a matching base by name.
 * Returns the base ID if found, null otherwise.
 */
export function findBaseByName(name, basesList) {
  if (!name || !basesList) return null;

  const normalized = name.toLowerCase().replace(/['\u2019]/g, '').trim();
  
  // Direct match first
  const direct = basesList.find(b => b.name.toLowerCase() === normalized);
  if (direct) return direct.id;

  // Contains match (e.g. "Gold Ring" matches any base with those words)
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  // Score each base by how many search words appear in its name
  let best = null;
  let bestScore = 0;
  
  for (const b of basesList) {
    const bn = b.name.toLowerCase();
    const score = words.filter(w => bn.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }

  if (best && bestScore >= 1) {
    return best.id;
  }

  return null;
}
