// src/lib/item/render.ts
// Pure HTML-string render for the simulator item card.
// Inputs are a ParsedPaste; output is safe HTML suitable for `innerHTML`.

import type { ParsedAffix, ParsedPaste } from './types.ts';
import { capitalize, escapeHtml, RARITY_COLORS, SLOT_DISPLAY, tagColor } from './tags.ts';

/**
 * Slot-label map used by the existing preview pane.
 * Mirrors the inline SLOT_LABELS inside simulator.astro's handlePasteText
 * (slightly different from SLOT_DISPLAY in tags.ts — different use site).
 */
const PREVIEW_SLOT_LABELS: Record<string, string> = {
  amulet: 'Amulet',
  belt: 'Belt',
  body_armour: 'Body Armour',
  boots: 'Boots',
  charm: 'Charm',
  focus: 'Focus',
  gloves: 'Gloves',
  helmet: 'Helmet',
  jewel: 'Jewel',
  quiver: 'Quiver',
  ring: 'Ring',
  shield: 'Shield',
  weapon_1h: 'Weapon (1H)',
  weapon_2h: 'Weapon (2H)',
  waystone: 'Waystone',
  tablet: 'Tablet',
  relic: 'Relic',
};

/** Row HTML for a single affix line — tier pill + name (in colored span).
 *  Uses PoE2 in-game tooltip coloring:
 *    - normal affixes → bright blue (#7fb5ff)
 *    - crafted affixes → paler whitish-blue (#b0d8ff)
 *    - desecrated affixes → bright blue (same as normal — corruption outcomes are real affixes)
 */
export function rowHTML(affix: ParsedAffix): string {
  const tier = affix.tier != null ? `T${affix.tier}` : '-';
  let color = '#7fb5ff';
  let deco = 'none';
  if (affix.crafted) {
    color = '#b0d8ff';
  }
  // Desecrated affixes (corruption outcomes) display as normal — no strikethrough.
  // Strikethrough is reserved for empty/inactive bonded rune slots only.
  const label =
    affix.descriptiveName && affix.descriptiveName.length > 0
      ? `${affix.descriptiveName}: ${affix.name}`
      : affix.name;
  return `<div class="item-row"><span class="mod-tier">${escapeHtml(
    tier,
  )}</span><span class="mod-text" style="color:${color};text-decoration:${deco}">${escapeHtml(
    label,
  )}</span></div>`;
}

/** Horizontal separator used between sections. */
function separatorHTML(dashed: boolean): string {
  return dashed
    ? `<div class="item-separator-dashed"></div>`
    : `<div class="item-separator"></div>`;
}

/**
 * Render the full item card as a single HTML string.
 * Mirrors the in-page `renderItemCardHTML` shape currently in simulator.astro
 * so the live site shows identical output for the same parsed input.
 *
 * `item.corruptionLevel` (when provided) controls the corruption badge:
 *   0 = no badge, 1 = "Corrupted", 2 = "Twice Corrupted".
 * Falls back to `item.corrupted` boolean for legacy callers.
 */
export function renderItemCardHTML(item: {
  affixes: ParsedAffix[];
  implicit?: string | null;
  itemLevel: number;
  rarity: string;
  itemName?: string;
  baseName?: string;
  slot?: string;
  corrupted?: boolean;
  corruptionLevel?: 0 | 1 | 2;
}): string {
  const prefixes = item.affixes.filter((a) => a.type === 'prefix');
  const suffixes = item.affixes.filter((a) => a.type === 'suffix');
  // Unique-type affixes (from unique items like The Taming) rendered in their own section
  const uniques = item.affixes.filter((a) => a.type === 'unique');
  const rarityColor = RARITY_COLORS[item.rarity.toLowerCase()] ?? '#c8c8c8';
  const corruptionLevel =
    typeof item.corruptionLevel === 'number'
      ? item.corruptionLevel
      : item.corrupted
        ? 1
        : 0;
  const corruptionBadge =
    corruptionLevel === 2
      ? `<div class="corrupted-indicator">Twice Corrupted</div>`
      : corruptionLevel === 1
        ? `<div class="corrupted-indicator">Corrupted</div>`
        : '';

  const bodyHtml = `
    ${item.implicit ? `
            <div class="item-section">
              <div class="item-row">
                <span class="mod-tier">-</span>
                <span class="mod-text implicit">${escapeHtml(item.implicit)}</span>
              </div>
            </div>
            ${separatorHTML(true)}
          ` : ''}
    ${prefixes.length > 0 ? `
            <div class="item-section">
              <div class="section-label">Prefix Modifier</div>
              ${prefixes.map(rowHTML).join('')}
            </div>
          ` : ''}
    ${suffixes.length > 0 && prefixes.length > 0 ? separatorHTML(true) : ''}
    ${suffixes.length > 0 ? `
            <div class="item-section">
              <div class="section-label">Suffix Modifier</div>
              ${suffixes.map(rowHTML).join('')}
            </div>
          ` : ''}
    ${uniques.length > 0 ? `
            <div class="item-section">
              <div class="section-label">Unique Modifier</div>
              ${uniques.map(rowHTML).join('')}
            </div>
          ` : ''}
    ${prefixes.length === 0 && suffixes.length === 0 && uniques.length === 0 ? `<div class="item-empty">Empty item</div>` : ''}
    ${separatorHTML(false)}
    <div class="item-footer">
      <div class="item-rarity">${capitalize(item.rarity)} · Item Level: ${item.itemLevel}</div>
      ${corruptionBadge}
    </div>
  `;

  return `<div class="item-card" style="--rarity-color:${rarityColor}">
    <div class="item-header" style="color:${rarityColor}">
      <div class="item-name">${escapeHtml(item.itemName ?? '')}</div>
      <div class="item-base">${escapeHtml(item.baseName ?? '')}</div>
      ${item.slot ? `<div class="item-slot">${escapeHtml(SLOT_DISPLAY[item.slot] ?? '')}</div>` : ''}
    </div>
    ${bodyHtml}
  </div>`;
}

/**
 * Render the parse-preview summary that goes inside the paste modal.
 * Mirrors the inline `pasteDetected.innerHTML = ` block from simulator.astro.
 */
export function renderPastePreviewHTML(p: ParsedPaste & { baseMatched?: boolean }): string {
  const slotLabel = PREVIEW_SLOT_LABELS[(p as any).slot ?? ''] ?? 'unknown';
  const found = p.baseMatched ? 'Matched' : 'Not matched';
  const baseName = (p as any).baseMatchedName ?? p.baseName ?? 'Unknown';
  return `
    <div class="flex items-center gap-2"><span class="text-dim">Name:</span> <span class="text-fg font-semibold">${escapeHtml(p.itemName)}</span></div>
    <div class="flex items-center gap-2"><span class="text-dim">Base:</span> <span class="${p.baseMatched ? 'text-gold' : 'text-corrupted'}">${escapeHtml(baseName)} (${slotLabel})</span></div>
    <div class="flex items-center gap-2"><span class="text-dim">Rarity:</span> <span class="text-fg">${escapeHtml(p.rarity)}</span></div>
    <div class="flex items-center gap-2"><span class="text-dim">Item Level:</span> <span class="text-fg">${p.itemLevel}</span></div>
    <div class="flex items-center gap-2"><span class="text-dim">Mods:</span> <span class="text-fg">${p.affixes.length}${p.implicit ? ' + 1 implicit' : ''}</span></div>
    <div class="flex items-center gap-2"><span class="text-dim">Match:</span> <span class="${p.baseMatched ? 'text-green-400' : 'text-corrupted'}">${found}</span></div>
  `;
}
