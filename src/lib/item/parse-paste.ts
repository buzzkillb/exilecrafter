// src/lib/item/parse-paste.ts
// Pure parser for PoE2 clipboard text.
// Supports both wiki/poe2db format and in-game ctrl+c text.
// Returns a ParsedPaste object with all detected fields — including
// corruption level, runes, enhancement blocks, and unknown lines so
// the simulator can surface warnings instead of silently dropping data.

import type {
  ParsedAffix,
  ParsedEnchantment,
  ParsedPaste,
  ParsedRune,
  Rarity,
} from './types';
import {
  findBaseByName,
  findBaseInSlot,
  slotFromLabel,
} from './find-base.ts';

/**
 * Match the wiki header line e.g.
 *   `{ Prefix Modifier "Tempered" (Tier: 2) — Damage, Physical, Attack }`
 *   `{ Desecrated Suffix Modifier "of Bameth" (Tier: 1) — Chaos, Resistance }`
 *   `{ Crafted Prefix Modifier "of Archaeology" (Tier: 1) }`
 * Returns null when the line is not a header we can classify.
 *
 * Wiki header special-cases:
 *   - optional leading `{`
 *   - optional `Crafted` / `Desecrated` keyword before mod type
 *   - quoted descriptive name
 *   - `(Tier: N)` after the quoted name (optional for implicit)
 *   - `—`/`-` separator then comma-separated tags
 *   - closing `}`
 */
interface WikiHeaderMatch {
  crafted: boolean;
  desecrated: boolean;
  type: 'prefix' | 'suffix' | 'implicit' | 'unique';
  descriptiveName: string | null;
  tier: number | null;
  tags: string[] | null;
}
function matchWikiHeader(line: string): WikiHeaderMatch | null {
  // Allow 5 shapes:
  //   1. { Prefix Modifier "Tempered" (Tier: 2) — Tags }
  //   2. { Suffix Modifier "of Bameth" (Tier: 1) — Chaos, Resistance }
  //   3. { Crafted Suffix Modifier "of Archaeology" (Tier: 1) }
  //      (crafted/desecrated mods often omit the trailing tag list)
  //   4. { Implicit Modifier }  (no name, no tier)
  //   5. { Unique Modifier — Tags }   (unique items; no descriptiveName, no Tier)
  const m = line.match(
    /^\{?\s*(?:(Crafted)\s+)?(?:(Desecrated)\s+)?(Prefix|Suffix|Implicit|Unique)\s+Modifier(?:\s+"([^"]+)")?(?:\s+\(Tier:\s*(\d+)\))?(?:\s*[—\-]\s*([^}]*?))?\s*\}?\s*$/i,
  );
  if (!m) return null;
  const tagsRaw = (m[6] ?? '').trim();
  return {
    crafted: !!m[1],
    desecrated: !!m[2],
    type: m[3].toLowerCase() as 'prefix' | 'suffix' | 'implicit' | 'unique',
    descriptiveName: m[4] ?? null,
    tier: m[5] ? parseInt(m[5], 10) : null,
    tags: tagsRaw ? tagsRaw.split(/\s*,\s*/) : null,
  };
}

/** Match the in-game header line (no `{}`, no Tier or quote, just the modifier type). */
function matchInGameHeader(
  line: string,
): { crafted: boolean; desecrated: boolean; type: 'prefix' | 'suffix' | 'implicit' | 'unique' } | null {
  const m = line.match(
    /^\s*(?:(Crafted)\s+)?(?:(Desecrated)\s+)?(Prefix|Suffix|Implicit|Unique)\s+Modifier\s*$/i,
  );
  if (!m) return null;
  return {
    crafted: !!m[1],
    desecrated: !!m[2],
    type: m[3].toLowerCase() as 'prefix' | 'suffix' | 'implicit' | 'unique',
  };
}

/** In-game tier line, e.g. "T1", "T3". Null if not a tier line. */
function matchInGameTier(line: string): number | null {
  const m = line.match(/^T(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Derive a numeric rolled value and range from a modifier line.
 * Examples:
 *   "+118(100-119) to maximum Life"  -> rolled:118, range:{min:100,max:119}
 *   "99(92-100)% increased Energy Shield" -> rolled:99, range:{min:92,max:100}
 *   "Adds 23 to 32 Cold damage to Attacks" -> null (multi-numeric)
 *   "+57 to Accuracy Rating"          -> null (no range, would need DB lookup)
 */
function extractNumericRange(
  text: string,
): { rolled: number | null; range: { min: number; max: number } | null } {
  const m = text.match(/(\d+)\s*\(\s*(\d+)\s*[–\-]\s*(\d+)\s*\)/);
  if (m) return { rolled: parseInt(m[1], 10), range: { min: parseInt(m[2], 10), max: parseInt(m[3], 10) } };
  return { rolled: null, range: null };
}

/**
 * Detect { Enhancement } / { Corruption Enhancement — X } etc. blocks.
 * Returns the header content (without braces) plus true when matched.
 */
const ENHANCEMENT_RE = /^\{\s*([^}]+?)\s*\}$/;
function matchEnhancementHeader(
  line: string,
): { slot: string; raw: string } | null {
  const m = line.match(ENHANCEMENT_RE);
  if (!m) return null;
  const raw = m[1].trim();
  // Only treat as enhancement slot if it doesn't start with mod type keywords
  if (
    /^(?:Crafted\s+)?(?:Desecrated\s+)?(?:Prefix|Suffix|Implicit|Unique)\s+Modifier/i.test(
      raw,
    )
  )
    return null;
  return { slot: raw, raw };
}

/** Rune line, e.g. "Raven-Touched (rune)" */
function matchRune(line: string): ParsedRune | null {
  const m = line.match(/^(.+?)\s+\(rune\)\s*$/);
  if (!m) return null;
  return { name: m[1].trim(), effect: line.trim() };
}

/** Defense stat names we recognise as item properties (not mods). */
const DEFENSE_NAMES = new Set([
  'energy shield', 'evasion rating', 'armour', 'runic ward', 'ward',
]);

/**
 * Parse a line like "Energy Shield: 305 (augmented)" or "Evasion Rating: 91 (augmented)".
 * Returns the DefenseStat or null if the line doesn't match.
 */
function parseDefenseLine(line: string): { name: string; value: number; augmented: boolean } | null {
  const m = line.match(/^(Energy Shield|Evasion Rating|Armour|Runic Ward|Ward):\s*(\d+)\s*(?:\((\w+)\))?\s*$/i);
  if (!m) return null;
  return {
    name: m[1],
    value: parseInt(m[2], 10),
    augmented: (m[3] ?? '').toLowerCase() === 'augmented',
  };
}

/**
 * Parse a line like "Requires: Level 80, 115 Int" or "Requires: Level 65, 44 Dex, 44 Int".
 * Returns level and attribute requirements.
 */
function parseRequirementsLine(line: string): { level: number | null; str: number | null; dex: number | null; int: number | null } {
  const out = { level: null as number | null, str: null as number | null, dex: null as number | null, int: null as number | null };
  const m = line.match(/^Requires:\s*(.+)$/i);
  if (!m) return out;
  const parts = m[1].split(',').map(s => s.trim());
  for (const part of parts) {
    const lvl = part.match(/^Level\s+(\d+)$/i);
    if (lvl) { out.level = parseInt(lvl[1], 10); continue; }
    const attr = part.match(/^(\d+)\s+(Str|Dex|Int)/i);
    if (attr) {
      const val = parseInt(attr[1], 10);
      const key = attr[2].toLowerCase() as 'str' | 'dex' | 'int';
      out[key] = val;
    }
  }
  return out;
}

/**
 * Scan lines between the header and mod sections for item properties:
 * defense stats, requirements, sockets, and rune effects.
 * Mutates `out` in place.
 */
function scanItemProperties(
  lines: string[],
  startIndex: number,
  endIndex: number,
  out: ParsedPaste,
): void {
  for (let si = startIndex; si < endIndex && si < lines.length; si++) {
    const l = lines[si].trim();
    if (!l) continue;

    // Defense stats
    const def = parseDefenseLine(l);
    if (def) {
      out.defenses.push(def);
      continue;
    }

    // Requirements
    if (/^Requires:/i.test(l)) {
      out.requirements = parseRequirementsLine(l);
      continue;
    }

    // Sockets
    const sock = l.match(/^Sockets:\s*(.+)$/i);
    if (sock) {
      out.sockets = sock[1].trim();
      continue;
    }

    // Rune lines (outside {} blocks)
    const rn = matchRune(l);
    if (rn) {
      out.runes.push(rn);
      out.runeEffects.push(rn.effect);
      continue;
    }
  }
}

/**
 * Main entry point: parse a paste into a structured ParsedPaste.
 * Pure: no DOM access, no side effects.
 *
 * Format support:
 *   - `Item Class: Helmets\nRarity: Rare\nName\nBase\nItem Level: N\n… mods …`
 *   - `Rarity: Rare\nName\nBase\nItem Level: N\n… mods …` (no Item Class)
 *
 * @param text       The raw clipboard text.
 * @param bases      Available base records for lookup.
 * @returns          A ParsedPaste with all detected fields.
 */
export function parsePaste(
  text: string,
  bases: readonly import('./types.ts').BaseLike[],
): ParsedPaste {
  const out: ParsedPaste = {
    itemClass: '',
    rarity: 'Rare',
    itemName: '',
    baseName: '',
    itemLevel: 80,
    defenses: [],
    requirements: { level: null, str: null, dex: null, int: null },
    sockets: null,
    quality: null,
    qualityParsed: null,
    implicit: null,
    implicitTags: null,
    affixes: [],
    runes: [],
    runeEffects: [],
    enchantments: [],
    corruptionLevel: 0,
    unknownLines: [],
    enhancementNames: [],
    base: null,
    flavorText: null,
  };
  if (!text || !text.trim()) return out;

  const lines = text.split(/\r?\n/);
  let i = 0;

  function nextLine(): string | null {
    while (i < lines.length) {
      const l = lines[i++].trim();
      if (l.length > 0) return l;
    }
    return null;
  }

  let line = nextLine();
  if (!line) return out;

  // Optional "Item Class:" header (wiki format)
  if (line.toLowerCase().startsWith('item class:')) {
    out.itemClass = line.slice('item class:'.length).trim();
    line = nextLine();
    if (!line) return out;
  }

  // Required "Rarity:" header
  if (line && line.toLowerCase().startsWith('rarity:')) {
    const r = line.slice('rarity:'.length).trim();
    if (['Normal', 'Magic', 'Rare', 'Unique'].includes(r)) {
      out.rarity = r as Rarity;
    }
    line = nextLine();
    if (!line) return out;
  }

  // Skip a Quality: line if present (some sources include it)
  if (line && /^quality:/i.test(line)) {
    out.quality = line;
    // Parse structured quality info
    const qMatch = line.match(/^Quality\s*(?:\(([^)]*)\))?:\s*\+?(\d+)%/i);
    if (qMatch) {
      const cat = (qMatch[1] || '').trim();
      out.qualityParsed = {
        text: (qMatch[1] || qMatch[0]).trim(),
        category: cat || null,
        value: parseInt(qMatch[2], 10),
      };
    } else {
      out.qualityParsed = { text: line, category: null, value: 0 };
    }
    line = nextLine();
    if (!line) return out;
  }

  // First non-empty line: candidate unique/rare item name
  // Next non-empty line: candidate base name (both formats)
  const candidateName = line;
  let nextCandidate = nextLine();
  const candidates = [candidateName];
  if (nextCandidate && !/^-{3,}$/.test(nextCandidate) && !/^rarity:/i.test(nextCandidate) && !/^item\s*class:/i.test(nextCandidate)) {
    candidates.push(nextCandidate);
  }
  out.itemName = candidateName;
  if (candidates.length >= 2) {
    out.baseName = candidates[1];
  }

  // Resolve base via the second candidate (in-game format) then fallbacks
  let foundBase: import('./types.ts').BaseLike | null = null;
  if (candidates.length >= 2) {
    foundBase = findBaseByName(candidates[1], bases)?.base ?? null;
    if (foundBase) out.itemName = candidates[0];
  }
  if (!foundBase) {
    foundBase = findBaseByName(out.itemName, bases)?.base ?? null;
  }
  if (!foundBase && out.itemClass) {
    const slot = slotFromLabel(out.itemClass);
    if (slot) foundBase = findBaseInSlot(out.itemName, slot, bases);
  }

  // Continue scanning for "Item Level: N" and mod sections, starting from
  // wherever the cursor is now. The base name may already have been consumed.
  // Before jumping to Item Level, scan the intermediate lines for item properties
  // (defenses, requirements, sockets, rune effects).
  let itemLevelIndex = -1;
  for (let k = i; k < lines.length; k++) {
    const l = lines[k].trim();
    const il = l.match(/^Item\s*Level:\s*(\d+)/i);
    if (il) {
      out.itemLevel = parseInt(il[1], 10);
      itemLevelIndex = k;
      break;
    }
  }
  // Scan intermediate lines for defenses, requirements, sockets, runes
  if (itemLevelIndex > i) {
    scanItemProperties(lines, i, itemLevelIndex, out);
  }

  // ── Walk mod sections ──
  // Reset the line cursor to the top and parse mod headers + bodies.
  i = 0;
  let currentSection: 'prefix' | 'suffix' | 'implicit' | 'unique' | null = null;
  let sectionCrafted = false;
  let sectionDesecrated = false;
  let sectionDescriptiveName: string | null = null;
  let sectionTags: string[] | null = null;
  let sectionTier: number | null = null;

  function pushAffix(
    type: 'prefix' | 'suffix' | 'implicit' | 'unique',
    tier: number | null,
    name: string,
    descriptiveName: string | null,
    descriptiveTags: string[] | null,
    crafted: boolean,
    desecrated: boolean,
  ): void {
    if (!name) return;
    if (type === 'implicit') {
      out.implicit = (out.implicit ? out.implicit + '\n' : '') + name;
      // Store the tags from the implicit header so quality matching can check them
      if (descriptiveTags && descriptiveTags.length > 0 && !out.implicitTags) {
        out.implicitTags = descriptiveTags;
      }
      return;
    }
    const { rolled, range } = extractNumericRange(name);
    const affix: ParsedAffix = {
      type,
      tier,
      name,
      descriptiveName,
      descriptiveTags,
      crafted,
      desecrated,
      rolled,
      range,
    };
    out.affixes.push(affix);
  }

  for (; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (/^-+$/.test(raw)) continue;
    if (/^Item Level:/i.test(raw)) continue;
    if (/^Requires:/i.test(raw)) continue;
    if (/^Sockets:/i.test(raw)) continue;
    if (/^Quality(\s*\([^)]*\))?\s*:/i.test(raw)) {
      out.quality = raw;
      const qMatch = raw.match(/^Quality\s*(?:\(([^)]*)\))?:\s*\+?(\d+)%/i);
      if (qMatch) {
        const cat = (qMatch[1] || '').trim();
        out.qualityParsed = {
          text: (qMatch[1] || qMatch[0]).trim(),
          category: cat || null,
          value: parseInt(qMatch[2], 10),
        };
      } else {
        out.qualityParsed = { text: raw, category: null, value: 0 };
      }
      continue;
    }
    if (/^Energy Shield:/i.test(raw)) continue;
    if (/^Item Class:/i.test(raw)) continue;

    // ── Corruption detection ──
    if (/^Twice Corrupted\s*$/i.test(raw)) {
      out.corruptionLevel = 2;
      continue;
    }
    if (/^Corrupted\s*$/i.test(raw)) {
      out.corruptionLevel = 1;
      continue;
    }
    if (/^Rarity:/i.test(raw)) continue;

    // ── Rune detection (must be tried before generic text handling) ──
    if (raw.endsWith('(rune)')) {
      const r = matchRune(raw);
      if (r) {
        out.runes.push(r);
        out.runeEffects.push(r.effect);
        continue;
      }
    }

    // ── Enhancement block header ──
    const enh = matchEnhancementHeader(raw);
    if (enh) {
      out.enhancementNames.push(enh.slot);
      // Capture the body line(s) following the enhancement header until --- or another {…}
      let body: string[] = [];
      let k = i + 1;
      while (k < lines.length) {
        const nk = lines[k].trim();
        if (!nk) { k++; continue; }
        if (/^-+$/.test(nk)) break;
        if (ENHANCEMENT_RE.test(nk)) break;
        if (/^(?:Crafted\s+)?(?:Desecrated\s+)?(?:Prefix|Suffix|Implicit|Unique)\s+Modifier/i.test(nk)) break;
        if (/^(Corrupted|Twice Corrupted)\b/i.test(nk)) break;
        body.push(nk);
        k++;
      }
      if (body.length > 0) {
        out.enchantments.push({ raw: body.join('\n') });
      }
      i = k - 1;
      continue;
    }

    // ── Corruption status ──
    if (/^Corrupted\s*$/i.test(raw)) {
      out.corruptionLevel = Math.max(out.corruptionLevel, 1) as 0 | 1 | 2;
      continue;
    }
    if (/^Twice Corrupted\s*$/i.test(raw)) {
      out.corruptionLevel = 2;
      continue;
    }

    // ── Wiki header (with quoted name + tier + tags) ──
    const wiki = matchWikiHeader(raw);
    if (wiki) {
      currentSection = wiki.type;
      sectionCrafted = wiki.crafted;
      sectionDesecrated = wiki.desecrated;
      sectionDescriptiveName = wiki.descriptiveName;
      sectionTags = wiki.tags;
      sectionTier = wiki.tier;
      // For implicit the next single line is its body. For prefix/suffix the
      // very next non-empty line is the rolled mod text.
      // Walk forward to find the body
      let body = '';
      let k = i + 1;
      while (k < lines.length) {
        const nk = lines[k].trim();
        if (!nk) { k++; continue; }
        if (/^-+$/.test(nk)) break;
        if (matchWikiHeader(nk)) break;
        if (matchInGameHeader(nk)) break;
        body = nk;
        k++;
        // Capture a single continuation line (hybrid mod second line)
        if (currentSection !== 'implicit') {
          while (k < lines.length) {
            const nk2 = lines[k].trim();
            if (!nk2) { k++; continue; }
            if (/^-+$/.test(nk2)) break;
            if (matchWikiHeader(nk2)) break;
            if (matchInGameHeader(nk2)) break;
            if (/^T\d+$/.test(nk2)) break;
            if (nk2.endsWith('(rune)')) break;
            if (/^(Corrupted|Twice Corrupted)\s*$/i.test(nk2)) break;
            // Only treat as continuation if it starts with `+` or a number — common hybrid prefix.
            if (/^[+\d]/.test(nk2)) {
              body += '\n' + nk2;
              k++;
              continue;
            }
            break;
          }
        }
        break;
      }
      pushAffix(currentSection, sectionTier, body, sectionDescriptiveName, sectionTags, sectionCrafted, sectionDesecrated);
      i = k - 1;
      continue;
    }

    // ── In-game header (just "Prefix Modifier" / etc., no `{}`) ──
    const ing = matchInGameHeader(raw);
    if (ing) {
      currentSection = ing.type;
      sectionCrafted = ing.crafted;
      sectionDesecrated = ing.desecrated;
      sectionDescriptiveName = null;
      sectionTags = null;
      sectionTier = null;
      continue;
    }

    // ── In-game tier marker ──
    const tierNum = matchInGameTier(raw);
    if (tierNum != null) {
      sectionTier = tierNum;
      // Body is the next non-empty, non-tier line
      let body = '';
      let k = i + 1;
      while (k < lines.length) {
        const nk = lines[k].trim();
        if (!nk) { k++; continue; }
        if (/^-+$/.test(nk)) break;
        if (matchInGameHeader(nk)) break;
        if (matchWikiHeader(nk)) break;
        if (matchInGameTier(nk) != null) break;
        body = nk;
        k++;
        // Hybrid continuation: a second line starting with `+` or digit
        while (k < lines.length) {
          const nk2 = lines[k].trim();
          if (!nk2) { k++; continue; }
          if (/^-+$/.test(nk2)) break;
          if (matchInGameHeader(nk2)) break;
          if (matchWikiHeader(nk2)) break;
          if (matchInGameTier(nk2) != null) break;
          if (nk2.endsWith('(rune)')) break;
          if (/^(Corrupted|Twice Corrupted)\s*$/i.test(nk2)) break;
          if (/^[+\d]/.test(nk2)) {
            body += '\n' + nk2;
            k++;
            continue;
          }
          break;
        }
        break;
      }
      pushAffix(
        currentSection ?? 'prefix',
        sectionTier,
        body,
        sectionDescriptiveName,
        sectionTags,
        sectionCrafted,
        sectionDesecrated,
      );
      i = k - 1;
      continue;
    }
  }

  // Stitch base name from foundBase if we found one — the input may have
  // empty baseName (in case the second candidate was wrong).
  if (foundBase && !out.baseName) out.baseName = foundBase.name;

  // Expose the resolved base record so callers don't have to re-resolve.
  out.base = foundBase;

  // ── Flavour/lore text detection ──
  // Scan raw lines after the main loop for a quote block (starts with ")
  for (let fi = 0; fi < lines.length; fi++) {
    const fl = lines[fi].trim();
    if (!fl.startsWith('"')) continue;
    // Found a quote start — collect until separator or end
    const flavorLines: string[] = [fl];
    let fj = fi + 1;
    while (fj < lines.length) {
      const nf = lines[fj].trim();
      if (!nf) { fj++; continue; }
      if (/^-+$/.test(nf)) break;
      if (/^(Corrupted|Twice Corrupted)\s*$/i.test(nf)) break;
      if (/^{.*}$/.test(nf) && !nf.startsWith('"')) break;
      flavorLines.push(nf);
      fj++;
    }
    if (flavorLines.length >= 2) {
      out.flavorText = flavorLines.join('\n');
      break;
    }
  }

  return out;
}
