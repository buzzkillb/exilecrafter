/**
 * PoE2 Clipboard Paste Parser
 * Parses in-game item text (Ctrl+C) into structured data.
 */

export interface ImportedAffix {
  type: 'prefix' | 'suffix';
  tier: number;
  name: string;
  description: string;
  crafted?: boolean;
  desecrated?: boolean;
}

export interface ImportedItem {
  baseName: string;
  slot: string;
  itemLevel: number;
  rarity: string;
  implicit: string | null;
  affixes: ImportedAffix[];
  corrupted?: boolean;
  requiredLevel?: number;
  uniqueName?: string;
}

function normalize(s: string): string {
  return s.replace(/[â€“â€™â€˜â€œâ€�â€¢â€”Â·â€šâ„¢Â®Â©Â°]/g, '').trim();
}

/**
 * Try to find a base name inside a PoE2 clipboard line.
 * "Torment Whorl\nGold Ring" -> reads as two lines, second is base.
 */
function findBaseName(lines: string[], idx: number): string | null {
  // After "Rarity: X" line, the next 1-2 lines contain names.
  // Usually: "Unique Name\nBase Name" or just "Base Name"
  const candidates: string[] = [];
  for (let i = idx; i < Math.min(idx + 3, lines.length); i++) {
    const l = lines[i].trim();
    if (!l || l.startsWith('---') || l.startsWith('{') || l.startsWith('Requires') || l.startsWith('Item Level')) continue;
    candidates.push(l);
  }
  // If there are 2 name lines, the second is usually the base
  if (candidates.length >= 2) return candidates[candidates.length - 1];
  if (candidates.length === 1) return candidates[0];
  return null;
}

export function parsePoe2Clipboard(text: string): ImportedItem | null {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  let itemLevel = 0;
  let rarity = 'normal';
  let slot = '';
  let baseName = '';
  let implicit: string | null = null;
  const affixes: ImportedAffix[] = [];
  let corrupted = false;
  let requiredLevel = 0;
  let uniqueName = '';

  // State machine
  let currentSection: null | 'header' | 'implicit' | 'prefix' | 'suffix' = null;
  let currentAffix: Partial<ImportedAffix> | null = null;
  let nameLinesCollected = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Item Class: Rings -> slot
    const itemClassMatch = line.match(/Item\s+Class:\s*(.+)/i);
    if (itemClassMatch) {
      slot = itemClassMatch[1].trim().toLowerCase().replace(/s$/, '');
      continue;
    }

    // Rarity: Rare / Magic / Normal / Unique
    const rarityMatch = line.match(/Rarity:\s*(.+)/i);
    if (rarityMatch) {
      rarity = rarityMatch[1].trim().toLowerCase();
      // After rarity, the next 1-2 lines are name/base
      continue;
    }

    // After "Rarity: X" line(s), find the base name
    if (rarity && !nameLinesCollected && !line.startsWith('---') && !line.startsWith('Item Level') && !line.startsWith('Requires') && !line.startsWith('{')) {
      // Collect name lines
      const baseCandidate = findBaseName(lines, i);
      if (baseCandidate) {
        // The line before the base name might be a unique name
        const prevLine = i > 0 ? lines[i - 1] : '';
        if (prevLine && !prevLine.startsWith('Rarity') && !prevLine.startsWith('---') && !prevLine.startsWith('Item Class')) {
          // If prev line is also a name, it's the unique name
          const prevCandidate = findBaseName(lines, i - 1);
          if (prevCandidate && prevCandidate !== baseCandidate) {
            uniqueName = prevCandidate;
          }
        }
        baseName = baseCandidate;
        nameLinesCollected = true;
      }
      continue;
    }

    // Item Level: 82
    const ilvlMatch = line.match(/Item\s+Level:\s*(\d+)/i);
    if (ilvlMatch) {
      itemLevel = parseInt(ilvlMatch[1], 10);
      continue;
    }

    // Requires: Level 60
    const reqMatch = line.match(/Requires:\s*Level\s*(\d+)/i);
    if (reqMatch) {
      requiredLevel = parseInt(reqMatch[1], 10);
      continue;
    }

    // Corrupted
    if (/corrupted/i.test(line)) {
      corrupted = true;
      continue;
    }

    // ---------- Mod sections ----------

    // { Implicit Modifier }
    if (/\{\s*Implicit\s*Modifier/i.test(line)) {
      currentSection = 'implicit';
      continue;
    }

    // { Prefix Modifier "Name" (Tier: N) }
    // { Desecrated Prefix Modifier "Name" (Tier: N) }
    // { Crafted Prefix Modifier "Name" (Tier: N) }
    const prefixMatch = line.match(/\{\s*(Crafted\s+|Desecrated\s+)?Prefix\s+Modifier\s+"([^"]*)"\s*\(Tier:\s*(\d+)/i);
    if (prefixMatch) {
      currentSection = 'prefix';
      currentAffix = {
        type: 'prefix',
        name: prefixMatch[2].trim(),
        tier: parseInt(prefixMatch[3], 10),
        description: '',
        crafted: (prefixMatch[1] || '').toLowerCase().includes('crafted'),
        desecrated: (prefixMatch[1] || '').toLowerCase().includes('desecrated'),
      };
      continue;
    }

    // { Suffix Modifier "Name" (Tier: N) }
    // { Crafted Suffix Modifier "Name" (Tier: N) }
    const suffixMatch = line.match(/\{\s*(Crafted\s+|Desecrated\s+)?Suffix\s+Modifier\s+"([^"]*)"\s*\(Tier:\s*(\d+)/i);
    if (suffixMatch) {
      currentSection = 'suffix';
      currentAffix = {
        type: 'suffix',
        name: suffixMatch[2].trim(),
        tier: parseInt(suffixMatch[3], 10),
        description: '',
        crafted: (suffixMatch[1] || '').toLowerCase().includes('crafted'),
        desecrated: (suffixMatch[1] || '').toLowerCase().includes('desecrated'),
      };
      continue;
    }

    // Description line (the actual mod text like "Adds 13 to 23 Physical Damage to Attacks")
    if (currentSection === 'implicit' && line && !line.startsWith('{') && !line.startsWith('---')) {
      implicit = normalize(line);
      currentSection = null;
      continue;
    }

    if ((currentSection === 'prefix' || currentSection === 'suffix') && currentAffix && line && !line.startsWith('{') && !line.startsWith('---')) {
      currentAffix.description = normalize(line);
      affixes.push(currentAffix as ImportedAffix);
      currentAffix = null;
      currentSection = null;
      continue;
    }
  }

  if (!baseName && !affixes.length && !implicit) {
    return null;
  }

  return {
    baseName,
    slot,
    itemLevel: itemLevel || 1,
    rarity,
    implicit,
    affixes,
    corrupted,
    requiredLevel: requiredLevel || 0,
    uniqueName: uniqueName || undefined,
  };
}
