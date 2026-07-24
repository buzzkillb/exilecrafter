// scripts/process-data.mjs
// Parses raw poe2db HTML files into normalized JSON the site consumes.
// Output: data/processed/*.json + data/processed/manifest.json

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
const OUT = path.join(ROOT, 'data', 'processed');

const CDN = 'https://cdn.poe2db.tw';

const SLOT_MAP = {
  Helmets_str: 'helmet', Helmets_dex: 'helmet', Helmets_int: 'helmet',
  Helmets_str_dex: 'helmet', Helmets_str_int: 'helmet', Helmets_dex_int: 'helmet',
  Body_Armours_str: 'body_armour', Body_Armours_dex: 'body_armour',
  Body_Armours_int: 'body_armour', Body_Armours_str_dex: 'body_armour',
  Body_Armours_str_int: 'body_armour', Body_Armours_dex_int: 'body_armour',
  Body_Armours_str_dex_int: 'body_armour',
  Gloves_str: 'gloves', Gloves_dex: 'gloves', Gloves_int: 'gloves',
  Gloves_str_dex: 'gloves', Gloves_str_int: 'gloves', Gloves_dex_int: 'gloves',
  Boots_str: 'boots', Boots_dex: 'boots', Boots_int: 'boots',
  Boots_str_dex: 'boots', Boots_str_int: 'boots', Boots_dex_int: 'boots',
  Belts: 'belt',
  Amulets: 'amulet', Rings: 'ring',
  Shields_str: 'shield', Shields_str_dex: 'shield', Shields_str_int: 'shield',
  Bucklers: 'shield', Foci: 'focus',
  Claws: 'weapon_1h', Daggers: 'weapon_1h', Wands: 'weapon_1h',
  One_Hand_Swords: 'weapon_1h', One_Hand_Axes: 'weapon_1h',
  One_Hand_Maces: 'weapon_1h', Sceptres: 'weapon_1h',
  Spears: 'weapon_1h', Flails: 'weapon_1h',
  Bows: 'weapon_2h', Staves: 'weapon_2h', Two_Hand_Swords: 'weapon_2h',
  Two_Hand_Axes: 'weapon_2h', Two_Hand_Maces: 'weapon_2h',
  Quarterstaves: 'weapon_2h', Crossbows: 'weapon_2h',
  Traps: 'weapon_2h', Talismans: 'weapon_1h',
  Quivers: 'quiver',
  Ruby: 'jewel', Emerald: 'jewel', Sapphire: 'jewel', Diamond: 'jewel',
  'Time-Lost_Ruby': 'jewel', 'Time-Lost_Emerald': 'jewel',
  'Time-Lost_Sapphire': 'jewel', 'Time-Lost_Diamond': 'jewel',
  Life_Flasks: 'flask', Mana_Flasks: 'flask',
  Charms: 'charm',
  Waystones: 'waystone',
  Breach_Tablet: 'tablet', Expedition_Tablet: 'tablet', Delirium_Tablet: 'tablet',
  Ritual_Tablet: 'tablet', Irradiated_Tablet: 'tablet', Overseer_Tablet: 'tablet',
  Abyss_Tablet: 'tablet', Temple_Tablet: 'tablet',
  Urn_Relic: 'relic', Amphora_Relic: 'relic', Vase_Relic: 'relic',
  Seal_Relic: 'relic', Coffer_Relic: 'relic', Tapestry_Relic: 'relic', Incense_Relic: 'relic',
};

// Find the container element by scanning the page for an id matching our
// expected patterns. poe2db uses two conventions:
//   - <Plural>BaseItem (e.g. HelmetBaseItem, BodyArmourBaseItem, GlovesBaseItem)
//   - <Plural>Item     (e.g. AmuletsItem, ClawsItem, BowsItem, RingsItem)
// We pick the container with the most .whiteitem links — i.e. the one
// actually carrying the base item cards, not a stray "Item" id in the nav.
function findBaseContainer($) {
  const candidates = [];
  $('[id]').each((_, el) => {
    const id = $(el).attr('id') || '';
    if (!/^(.+)Item$/.test(id)) return;
    const $el = $(el);
    const links = $el.find('a.whiteitem[href]').length;
    const cols = $el.find('.col').length;
    if (links > 0 && cols > 0) candidates.push({ id, links, cols, $el });
  });
  candidates.sort((a, b) => b.links - a.links);
  return candidates[0]?.$el || null;
}

// PoE2 item slot counts (deterministic rule)
const AFFIX_SLOTS = {
  helmet: { prefix: 3, suffix: 3 },
  body_armour: { prefix: 3, suffix: 3 },
  gloves: { prefix: 3, suffix: 3 },
  boots: { prefix: 3, suffix: 3 },
  belt: { prefix: 3, suffix: 3 },
  amulet: { prefix: 3, suffix: 3 },
  ring: { prefix: 3, suffix: 3 },
  weapon_1h: { prefix: 3, suffix: 3 },
  weapon_2h: { prefix: 3, suffix: 3 },
  offhand: { prefix: 3, suffix: 3 },
  shield: { prefix: 3, suffix: 3 },
  quiver: { prefix: 3, suffix: 3 },
  focus: { prefix: 3, suffix: 3 },
  flask: { prefix: 1, suffix: 1 },
  charm: { prefix: 0, suffix: 0 },
  jewel: { prefix: 3, suffix: 3 },
  waystone: { prefix: 3, suffix: 3 },
  tablet: { prefix: 3, suffix: 3 },
  relic: { prefix: 1, suffix: 1 },
};

const TIER_NUM = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9 };

function imgAbs(src) {
  if (!src) return undefined;
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('/')) return `${CDN}${src}`;
  return `${CDN}/${src}`;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function parseBasePage($, slug, html) {
  const items = [];
  const $container = findBaseContainer($);
  if ($container) {
    $container.find('.col').each((_, col) => {
      const $col = $(col);
      // The text link is the second .whiteitem; the first is image-only
      const $a = $col.find('a.whiteitem').filter((_, el) => $(el).text().trim().length > 0).first();
      if (!$a.length) return;

      const href = $a.attr('href') || '';
      if (!href || href.startsWith('?')) return;
      const baseSlug = href;
      const name = $a.text().trim();
      if (!name) return;

      const $img = $col.find('img').first();

      const baseStats = {};
      const attributes = {};

      // Stats come from `.property` divs ("Armour: 80"). Requirements come
      // from `.requirements` divs ("Requires: Level 12, 19 Str"). Both need
      // to be parsed — the previous version only read `.property` so every
      // base had level=1 and str=dex=int=0.
      $col.find('.property').each((_, p) => {
        const pText = $(p).text().trim();
        // "Armour: 29" or "Evasion Rating: 50" etc.
        const m1 = pText.match(/^([\w\s]+?):\s*(\d+)\s*$/);
        if (m1) {
          const key = m1[1].trim();
          const val = m1[2];
          if (key === 'Armour') baseStats.armour = +val;
          else if (key === 'Evasion Rating') baseStats.evasion = +val;
          else if (key === 'Energy Shield') baseStats.energy_shield = +val;
          else if (key === 'Ward') baseStats.ward = +val;
          else if (key === 'Runic Ward') baseStats.runic_ward = +val;
          else if (key === 'Critical Strike Chance') baseStats.crit = +val;
          else if (key === 'Attacks per Second') baseStats.aps = +val;
          else if (key === 'Physical Damage') baseStats.phys_dmg = val;
          // Waystones report "Area Level: 65" instead of "Requires: Level X".
          // Treat Area Level as the base's effective ilvl gate.
          else if (key === 'Area Level') baseStats.area_level = +val;
          else baseStats[slugify(key)] = val;
        }
      });

      $col.find('.requirements').each((_, p) => {
        const rText = $(p).text().trim();
        // "Requires: Level 12, 19 Str" — accept any whitespace between segments
        // because poe2db emits "Requires:  <span>Level 12</span>, <span>19 Str</span>"
        // which after cheerio .text() collapses to "Requires: Level 12, 19 Str"
        // (and sometimes there's an em-space after the colon).
        const m = rText.match(/Requires:?\s*Level\s*(\d+)(?:[,\s]+(\d+)\s*Str)?(?:[,\s]+(\d+)\s*Dex)?(?:[,\s]+(\d+)\s*Int)?/i);
        if (m) {
          attributes.level = +m[1];
          if (m[2]) attributes.str = +m[2];
          if (m[3]) attributes.dex = +m[3];
          if (m[4]) attributes.int = +m[4];
        }
      });

      const slot = SLOT_MAP[slug];
      if (!slot) return; // unmapped subcategory — skip
      const variant = /Runeforged/i.test(name) ? 'runeforged'
        : /Runemastered/i.test(name) ? 'runemastered'
        : 'normal';

      items.push({
        id: baseSlug.toLowerCase(),
        name,
        slot,
        rarity: 'normal',
        // Waystones report "Area Level: 65" via .property; everything else
        // reports via .requirements ("Requires: Level 12, 19 Str").
        level: attributes.level ?? baseStats.area_level ?? 1,
        attributes: {
          str: attributes.str ?? 0,
          dex: attributes.dex ?? 0,
          int: attributes.int ?? 0,
        },
        baseStats,
        imageUrl: imgAbs($img.attr('src')),
        affixSlots: AFFIX_SLOTS[slot] || { prefix: 0, suffix: 0 },
        family: slot,
        variant,
        source: 'poe2db',
      });
    });
  } else {
    // No `.col` cards on this page. This is the case for jewels, waystones,
    // relics, and tablets — each subcategory slug IS the base item (e.g.
    // "Ruby", "Breach Tablet"). Synthesize a single base from the ModsView
    // blob + the page's nav/header info.
    const fallback = buildFallbackBaseFromModsView(slug, html);
    if (fallback) items.push(fallback);
  }

  return items;
}

// Build a single base item for pages that don't list individual base cards
// (jewels, waystones, relics, tablets). Pulls name/icon/level from the page
// header + the ModsView blob.
function buildFallbackBaseFromModsView(slug, html) {
  if (!html) return null;
  const slot = SLOT_MAP[slug];
  if (!slot) return null;

  // Name — try h1, then <title>, then h5 card-header (filtered to skip
  // fossil/enchant/catalyst sections which also use h5.card-header).
  const $ = cheerio.load(html);
  let name = $('h1').first().text().trim();
  if (!name) {
    const title = $('title').first().text().trim();
    // "Ruby - PoE2DB, Path of Exile Wiki us" -> "Ruby"
    name = title.replace(/\s*-\s*PoE2DB.*$/i, '').trim();
  }
  if (!name) {
    // h5.card-header appears for fossil/enchant sections too — skip those.
    const headers = $('h5.card-header').toArray()
      .map((el) => $(el).text().trim())
      .filter((t) => !/fossil|enchant|catalyst|alloy|omen|corrupted/i.test(t));
    if (headers.length) {
      name = headers[0].replace(/\s+\/+\s*\d+\s*$/, '').trim();
      const parts = name.split(/\s+/);
      if (parts.length > 2) name = parts.slice(0, 2).join(' ');
    }
  }
  if (!name) name = slug.replace(/_/g, ' ');
  // Final cleanups: turn slug-style titles into proper nouns.
  name = name.replace(/\bwaystones_(low|mid|top)_tier\b/i, (_, tier) => `Waystone (${tier[0].toUpperCase() + tier.slice(1)} Tier)`);
  name = name.replace(/_/g, ' ').trim();

  // Icon — first image in /image/Art/ that isn't an item-skill icon
  let imageUrl = null;
  $('img[src]').each((_, img) => {
    if (imageUrl) return;
    const src = $(img).attr('src') || '';
    if (/cdn\.poe2db\.tw\/image\/Art\/2DItems\//i.test(src)) imageUrl = imgAbs(src);
  });

  // Level — try to pull from a Base.base_level row in the metadata tables
  let level = 1;
  $('table').each((_, t) => {
    if (level !== 1) return;
    const txt = $(t).text();
    const m = txt.match(/Base\.base_level\s*(\d+)/);
    if (m) level = +m[1];
  });

  return {
    id: slug.toLowerCase(),
    name,
    slot,
    rarity: 'normal',
    level,
    attributes: { str: 0, dex: 0, int: 0 },
    baseStats: {},
    imageUrl,
    affixSlots: AFFIX_SLOTS[slot] || { prefix: 0, suffix: 0 },
    family: slot,
    variant: 'normal',
    source: 'poe2db',
  };
}

// Map poe2db's `ItemClassesCode` strings to our internal ItemSlot names.
// Verified by grepping every base_*.html for "ItemClassesCode":"..." and
// matching against poe2db's nav/labels.
const ITEM_CLASS_TO_SLOT = {
  'Helmet': 'helmet',
  'Body Armour': 'body_armour',
  'Gloves': 'gloves',
  'Boots': 'boots',
  'Belt': 'belt',
  'Amulet': 'amulet',
  'Ring': 'ring',
  'Shield': 'shield',
  'Buckler': 'shield', // PoE2 collapsed bucklers into shields; treat as shield
  'Focus': 'focus',
  'Quiver': 'quiver',
  'Bow': 'weapon_2h',
  'Crossbow': 'weapon_2h',
  'Staff': 'weapon_2h',
  'Warstaff': 'weapon_2h',
  'Two Hand Sword': 'weapon_2h',
  'Two Hand Axe': 'weapon_2h',
  'Two Hand Mace': 'weapon_2h',
  'TrapTool': 'weapon_2h', // traps are 2h weapons in PoE2
  'Claw': 'weapon_1h',
  'Dagger': 'weapon_1h',
  'Wand': 'weapon_1h',
  'One Hand Sword': 'weapon_1h',
  'One Hand Axe': 'weapon_1h',
  'One Hand Mace': 'weapon_1h',
  'Sceptre': 'weapon_1h',
  'Spear': 'weapon_1h',
  'Flail': 'weapon_1h',
  'Talisman': 'weapon_1h', // talismans are 1h offhands that take weapon mods
  'Jewel': 'jewel',
  'LifeFlask': 'flask',
  'ManaFlask': 'flask',
  'UtilityFlask': 'flask', // charms roll on UtilityFlask
  'Map': 'waystone',
  'Relic': 'relic',
  'TowerAugmentation': 'tablet',
};

// Strip HTML tags & decode the common entities poe2db emits inside `str`.
function stripHtml(s) {
  if (!s) return '';
  return s
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Derive a tag list from the rendered mod text by scanning for known PoE
// keywords. Kept conservative — we only tag things we can identify unambiguously.
const TAG_KEYWORDS = [
  ['life', /\blife\b/i],
  ['mana', /\bmana\b/i],
  ['energy_shield', /\benergy shield\b/i],
  ['armour', /\barmour\b/i],
  ['evasion', /\bevasion\b/i],
  ['fire', /\bfire\b/i],
  ['cold', /\bcold\b/i],
  ['lightning', /\blightning\b/i],
  ['chaos', /\bchaos\b/i],
  ['physical', /\bphysical\b/i],
  ['damage', /\bdamage\b/i],
  ['attack', /\battack\b/i],
  ['caster', /\bcaster\b/i],
  ['minion', /\bminion\b/i],
  ['speed', /\battack speed|cast speed|movement speed\b/i],
  ['critical', /\bcritical\b/i],
  ['attribute', /\bstrength|dexterity|intelligence\b/i],
  ['ailment', /\bbleed|bleeding|chill|freeze|shock|ignite|burn|poison\b/i],
  ['resistance', /\bresistance\b/i],
  ['spirit', /\bspirit\b/i],
  ['ward', /\bward\b/i],
];
function deriveTags(text) {
  const out = [];
  for (const [tag, re] of TAG_KEYWORDS) {
    if (re.test(text) && !out.includes(tag)) out.push(tag);
  }
  return out;
}

// Find the ModsView JSON literal embedded in a base subcategory page. poe2db
// inlines it as `new ModsView({...})` inside a <script>. The blob contains:
//   - opt.ItemClassesCode (the slot this page is for — armour/wep/etc.)
//   - opt.ModDomainsID    (1 = regular items, 2 = maps)
//   - opt.tags            (e.g. "str_armour")
//   - normal[].ModGenerationTypeID ("1" = prefix, "2" = suffix)
//   - normal[].Level (the item level the mod becomes available)
//   - normal[].DropChance (the relative weight; "0" = implicit, skip)
//   - normal[].ModFamilyList[0] (groups tiers; T1 = highest Level)
//   - normal[].str (rendered HTML of the mod text)
//
// Returns { slot, mods: [{ type, level, weight, description, family, dropChance }] }
// or null if the page doesn't have a ModsView blob.
// Two variants at the same level within a family should each have their
// own slot in the mod page index. We detect "overlap" cases (multiple
// stat-variants at one tier) so the id generator can disambiguate them.
function variantsOverlap(variants) {
  return Array.isArray(variants) && variants.length > 1;
}

function parseModsView(html, fallbackSlot) {
  const marker = 'new ModsView(';
  const idx = html.indexOf(marker);
  if (idx < 0) return null;

  // Walk forward from the opening `{`, count braces to find the matching `}`.
  let i = idx + marker.length;
  while (i < html.length && /\s/.test(html[i])) i++;
  if (html[i] !== '{') return null;

  const start = i;
  let depth = 0;
  let end = -1;
  let inStr = false;
  let strCh = '';
  let prev = '';
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (ch === strCh && prev !== '\\') inStr = false;
    } else {
      if (ch === '"' || ch === "'") { inStr = true; strCh = ch; }
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    prev = ch;
  }
  if (end < 0) return null;

  const json = html.slice(start, end + 1);
  let view;
  try { view = JSON.parse(json); }
  catch { return null; }

  const slot = (view.opt?.ItemClassesCode && ITEM_CLASS_TO_SLOT[view.opt.ItemClassesCode]) || fallbackSlot || null;

  // Each mod entry in the "normal" array is a separate tier. They all share
  // ModFamilyList[0] — group by family to assign T1, T2, T3, ...
  const buckets = new Map(); // family -> [{ level, raw, type, weight }]
  const normal = Array.isArray(view.normal) ? view.normal : [];
  for (const m of normal) {
    // Skip implicit / spawn-only / weightless mods
    const weight = +m.DropChance || 0;
    if (weight <= 0) continue;
    const description = stripHtml(m.str);
    if (!description || description.length < 8) continue;
    const level = Math.max(1, Math.min(100, +m.Level || 1));
    const type = m.ModGenerationTypeID === '1' ? 'prefix'
               : m.ModGenerationTypeID === '2' ? 'suffix'
               : 'any';
    const family = (Array.isArray(m.ModFamilyList) && m.ModFamilyList[0]) || m.Code || m.Name || 'unknown';
    if (!buckets.has(family)) buckets.set(family, []);
    buckets.get(family).push({ level, type, weight, description, raw: m });
  }

  const mods = [];
  // Tier assignment: rank within (family + type) by descending level, but
  // collapse entries that share a level (these are stat-variants like
  // "Chaos Damage" / "Cold Damage" — same PoE tier, different elements).
  //
  // Variants at the same level share tier / weight / family but have
  // different descriptions (different element, different stat). Each variant
  // gets a stable short tag derived from its description text, used as a
  // tag-suffix in the mod id so they're individually addressable as pages.
  // Cross-page dedupe by description (in merge step below) collapses
  // duplicates that share the description across multiple base categories.
  for (const [family, entries] of buckets) {
    const seenLevel = new Map();
    const collapsed = [];
    for (const e of entries) {
      if (!seenLevel.has(e.level)) {
        seenLevel.set(e.level, { level: e.level, type: e.type, weight: e.weight, variants: [], description: e.description, family });
        collapsed.push(seenLevel.get(e.level));
      }
      seenLevel.get(e.level).variants.push(e.description);
    }
    // T1 = the highest level (rarest), T2 = next, etc.
    collapsed.sort((a, b) => b.level - a.level);
    collapsed.forEach((c, idx) => {
      const tier = idx + 1;
      c.variants.forEach((description, vIdx) => {
        // Derive a stable per-variant tag. Approach:
        //   1. pull all stat values from "(min-max)" ranges so "Adds
        //      (10—15) to (20—30) Cold Damage" → "10—15—20—30colddamage"
        //   2. if multiple variants still end up identical (e.g. the two
        //      min-max pairs happen to share values for some lines), suffix
        //      an index. This guarantees every variant at this tier ends
        //      up addressable in the mod id, so no mod is dropped at
        //      build time by getStaticPaths dedupe.
        const ranges = [...description.matchAll(/\(\s*([0-9.\-—–\s]+)\s*\)/g)].map((m) => m[1]);
        const rangePart = ranges.join('').replace(/\s+/g, '').replace(/[—–]/g, '-');
        const wordPart = description
          .toLowerCase()
          .replace(/\([^)]*\)/g, ' ')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()
          .split(/\s+/)
          .slice(0, 4)
          .join('')
          .slice(0, 20);
        let tag = `${wordPart}${rangePart}`;
        tag = tag.replace(/[^a-z0-9-]/g, '').toLowerCase().slice(0, 32) || `v${vIdx}`;
        const variantFamily = c.variants.length > 1
          ? `${family}_${tag}_v${vIdx}`
          : family;
        mods.push({
          type: c.type,
          level: c.level,
          tier,
          weight: c.weight,
          description,
          family: variantFamily,
          modGroup: family,
          dropChance: c.weight,
        });
      });
    });
  }

  return { slot, mods };
}

// Extract special-domain mods (liquid, desecrated, corrupted, corruption_upgrade)
// from a jewel base page's ModsView JSON. Returns an array of mod objects with
// `domain: 'jewel'` and a `jewelSubtype: 'liquid'|'desecrated'|'corrupted'|'corruption_upgrade'`
// field so the emulator can partition them correctly.
function parseJewelExtraMods(html, slot) {
  const marker = 'new ModsView(';
  const idx = html.indexOf(marker);
  if (idx < 0) return { liquid: [], desecrated: [], corrupted: [], corruption_upgrade: [] };

  let i = idx + marker.length;
  while (i < html.length && /\s/.test(html[i])) i++;
  if (html[i] !== '{') return { liquid: [], desecrated: [], corrupted: [], corruption_upgrade: [] };

  let depth = 0, inStr = false, strCh = '', prev = '', end = -1;
  for (let j = i; j < html.length; j++) {
    const ch = html[j];
    if (inStr) { if (ch === strCh && prev !== '\\') inStr = false; }
    else {
      if (ch === '"' || ch === "'") { inStr = true; strCh = ch; }
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    prev = ch;
  }
  if (end < 0) return { liquid: [], desecrated: [], corrupted: [], corruption_upgrade: [] };

  let view;
  try { view = JSON.parse(html.slice(i, end + 1)); }
  catch { return { liquid: [], desecrated: [], corrupted: [], corruption_upgrade: [] }; }

  function extractArray(arr, subtype) {
    if (!Array.isArray(arr)) return [];
    return arr.map((m, vi) => {
      const description = stripHtml(m.str);
      const type = m.ModGenerationTypeID === '1' ? 'prefix' : (m.ModGenerationTypeID === '2' ? 'suffix' : 'prefix');
      const tags = deriveTags(description || '');
      const family = (Array.isArray(m.ModFamilyList) && m.ModFamilyList[0]) || m.Code || m.Name || `extra_${subtype}_${vi}`;
      const descSlug = (description || '')
        .replace(/[^a-z0-9]+/gi, '').slice(0, 48).toLowerCase();
      const descHash = (() => {
        let h = 0x811c9dc5;
        for (let k = 0; k < (description || '').length; k++) { h ^= description.charCodeAt(k); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
        return h.toString(16).padStart(8, '0').slice(0, 4);
      })();
      const id = `mod_${type}_${subtype}_${family}_${descSlug}${descHash}`.toLowerCase();
      return {
        id,
        name: description || m.Name || '',
        type,
        domain: [slot || 'jewel'],
        jewelSubtype: subtype,
        tier: 1,
        level: Math.max(1, Math.min(100, +m.Level || 1)),
        tags,
        description: description || '',
        statRanges: parseStatRanges(description || ''),
        weight: +m.DropChance || 1,
        modGroup: family,
        source: 'poe2db',
        // For liquid mods, preserve the associated currency name
        liquidCurrencyName: subtype === 'liquid' ? (m.Name || '') : undefined,
      };
    });
  }

  return {
    liquid: extractArray(view.liquid, 'liquid'),
    desecrated: extractArray(view.desecrated, 'desecrated'),
    corrupted: extractArray(view.corrupted, 'corrupted'),
    corruption_upgrade: extractArray(view.corruption_upgrade, 'corruption_upgrade'),
  };
}

// `parseModsFromPage` used to do fragile table-scraping of the rendered mod
// tables. We now read the ModsView JSON that's inlined on every base
// subcategory page — that has real type (prefix/suffix from ModGenerationTypeID),
// real tier (grouped by ModFamilyList + level sort), real weight (DropChance),
// and real slot (ItemClassesCode). Falls back to the legacy table-scrape if
// (defensively) the page somehow lacks a ModsView blob.
function parseModsFromPage($, baseSlot, html) {
  if (html) {
    const parsed = parseModsView(html, baseSlot);
    if (parsed && parsed.slot && parsed.mods.length > 0) {
      return parsed.mods.map((m) => {
        const tags = deriveTags(m.description);
        // ID incorporates the description content so the same family/level/
        // tier discovered from two different pages (e.g. Amulets and Quivers)
        // doesn't collide when their rendered descriptions differ. We suffix
        // with a 48-char slug of the description. With short descriptions
        // like "Critical Hit Chance" vs "Critical Hit Chance for Attacks"
        // we ALSO append a 4-character FNV-1a hash of the raw description
        // so colliding prefixes can't merge them.
        const descSlug = m.description
          .replace(/[^a-z0-9]+/gi, '')
          .slice(0, 48)
          .toLowerCase();
        const descHash = (() => {
          let h = 0x811c9dc5;
          for (let i = 0; i < m.description.length; i++) {
            h ^= m.description.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
          }
          return h.toString(16).padStart(8, '0').slice(0, 4);
        })();
        const id = `mod_${m.type}_${m.level}_${m.family}_t${m.tier}_${descSlug}${descHash}`.toLowerCase();
        return {
          id,
          name: m.description,
          type: m.type,
          domain: [parsed.slot],
          tier: m.tier,
          level: m.level,
          tags,
          description: m.description,
          statRanges: parseStatRanges(m.description),
          weight: m.weight,
          modGroup: m.family,
          source: 'poe2db',
        };
      });
    }
    // Fallback: the page lacks a ModsView blob. Some pages (notably
    // /us/Waystones) ship mods only as HTML tables inside an element
    // with id ending in "Mods" — parse that.
    if (baseSlot) {
      const tableMods = parseModsTable($, baseSlot);
      if (tableMods.length > 0) return tableMods;
    }
  }
  return [];
}

// Legacy table-scrape fallback for pages that don't embed a ModsView JSON
// blob. poe2db renders these as `<h5 class="card-header">Mods /N</h5>`
// followed by a 3-column table: Level | Pre/Suf | Description. Each row
// is a separate tier of the same family (same row's description text).
function parseModsTable($, baseSlot) {
  const out = [];
  $('h5.card-header').each((_, h) => {
    const title = $(h).text().trim();
    // Match "Mods /N", "Waystones Mods /107", "Desecrated X Mods /N", etc.
    // Exclude "Level Resist Penalty /7" which is a 2-column data table.
    if (!/\bMods?\b\s*\//i.test(title)) return;
    const $card = $(h).parent();
    const $table = $card.find('table').first();
    if (!$table.length) return;
    const headers = $table.find('thead th').toArray().map((th) => $(th).text().trim().toLowerCase());
    if (!headers.includes('description') || !headers.includes('level')) return;
    // Group rows by their stripped description (same family across tiers).
    const families = new Map(); // familyKey -> [{level, type, desc}]
    $table.find('tbody tr').each((_, tr) => {
      const cells = $(tr).find('td').toArray();
      if (cells.length < 3) return;
      const level = parseInt($(cells[0]).text().trim(), 10) || 1;
      const typeRaw = $(cells[1]).text().trim().toLowerCase();
      const type = typeRaw.startsWith('pref') ? 'prefix'
                 : typeRaw.startsWith('suff') ? 'suffix'
                 : 'any';
      // Take just the first line as the family key — tiers are different
      // values of the same first-line statement.
      const desc = $(cells[2]).text().trim().split(/\r?\n|<br\s*\/?>/i)[0].trim();
      if (!desc) return;
      // Family key = first ~30 chars of the first stat line, normalized.
      const familyKey = desc.replace(/^Monsters?\s+/i, '').slice(0, 40);
      if (!families.has(familyKey)) families.set(familyKey, []);
      families.get(familyKey).push({ level, type, desc });
    });
    let familyIdx = 0;
    for (const [, entries] of families) {
      familyIdx++;
      // Sort by level ascending — PoE T1 = lowest level for these
      // legacy tables (each row is one tier above the previous).
      entries.sort((a, b) => a.level - b.level);
      const family = `WaystoneTableMod_${familyIdx}`;
      entries.forEach((e, idx) => {
        const tier = idx + 1;
        const id = `mod_${e.type}_${e.level}_${family}_t${tier}`.toLowerCase();
        out.push({
          id,
          name: e.desc,
          type: e.type,
          domain: [baseSlot],
          tier,
          level: e.level,
          tags: deriveTags(e.desc),
          description: e.desc,
          statRanges: parseStatRanges(e.desc),
          weight: 1000, // no DropChance in legacy tables — uniform within tier
          modGroup: family,
          source: 'poe2db',
        });
      });
    }
  });
  return out;
}

function parseStatRanges(description) {
  // Mod descriptions on poe2db look like one or more "{value} {stat text}"
  // segments separated by " / ". Each value is a range like "(1—2)" or
  // "(29.1—33)". Some segments have a leading "+" or "-" sign (e.g.
  // "+(17—20) to maximum Mana"). A segment can also contain two ranges
  // — the "Adds X to Y" pattern (e.g. "Adds (5—8) to (10—12) Fire Damage")
  // where the actual rolled stat is min+X..max+Y. We collapse those into
  // a single range with summed min/max and a stat name like
  // "Fire Damage" so the UI can render them properly.
  const out = [];
  const segments = description.split(/\s*\/\s*/);
  for (const segRaw of segments) {
    const seg = segRaw.trim();
    if (!seg) continue;

    // "Adds (5—8) to (10—12) Fire Damage" — combine into single range
    const addsMatch = seg.match(/^Adds\s+\(\s*([\d.]+)\s*[—–\-]\s*([\d.]+)\s*\)\s*to\s*\(\s*([\d.]+)\s*[—–\-]\s*([\d.]+)\s*\)\s*(.+)$/);
    if (addsMatch) {
      const min = parseFloat(addsMatch[1]) + parseFloat(addsMatch[3]);
      const max = parseFloat(addsMatch[2]) + parseFloat(addsMatch[4]);
      const stat = addsMatch[5].trim();
      if (stat) out.push({ stat, range: { min, max } });
      continue;
    }

    // Generic: extract every (min—max) and treat the text between/around
    // them as the stat name. For a single tuple, the stat is whatever
    // follows. For multiple tuples in one segment, emit each with the text
    // between this tuple and the next (or to end of segment).
    const re = /([+-]?)\(\s*([\d.]+)\s*[—–\-]\s*([\d.]+)\s*\)/g;
    const hits = [];
    let m;
    while ((m = re.exec(seg)) !== null) {
      hits.push({ sign: m[1], min: parseFloat(m[2]), max: parseFloat(m[3]), idx: m.index, end: m.index + m[0].length });
    }
    if (hits.length === 0) continue;
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const next = hits[i + 1];
      const statStart = h.end;
      const statEnd = next ? next.idx : seg.length;
      const stat = seg.slice(statStart, statEnd).replace(/^\s*[+,]?\s*/, '').trim();
      if (stat) out.push({ stat, range: { min: h.min, max: h.max } });
    }
  }
  return out;
}

function parseSeason($) {
  let name = 'Unknown';
  let version = '0.0.0';

  // Try <title> tag first: "Home - PoE2DB, Path of Exile Wiki us" — no help.
  // Try <meta name="description"> — the search snippet sometimes has version info.
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const versionMatch = metaDesc.match(/Version\s+(\d+\.\d+\.\d+[a-z]?)/i) || metaDesc.match(/v(\d+\.\d+\.\d+[a-z]?)/i);
  if (versionMatch) version = versionMatch[1];

  // poe2db loads league info via JS, so the raw HTML has no league images.
  // The page JS renders a nav link to Runes_of_Aldur_league. We can find it
  // by scanning <a href> for known league page patterns.
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    // Match hrefs like "/us/Runes_of_Aldur_league" or just "Runes_of_Aldur_league"
    const m = href.match(/([A-Z][a-z]+_[A-Z][a-z]+(?:_[A-Z][a-z]+)*?)_league/i);
    if (m) {
      const raw = m[1].replace(/_/g, ' ');
      // Clean up: "Runes Of Aldur" → "Runes of Aldur"
      name = raw.replace(/\bOf\b/g, 'of').replace(/\bThe\b/g, 'the');
      name = name.replace(/\b([A-Z][a-z]+)\b/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }
  });

  // Fallback: try <title> for any useful info
  if (name === 'Unknown') {
    const title = $('title').text().trim();
    if (title && title !== 'Home - PoE2DB, Path of Exile Wiki us') {
      // Try to extract anything useful
      const tMatch = title.match(/(\d+\.\d+\.\d+[a-z]?)/i);
      if (tMatch) version = tMatch[1];
      if (/league/i.test(title)) name = title.replace(/ - .*$/, '').trim();
    }
  }

  // If version is still unknown or '0.0.0', fall back to the latest known
  // patch from poe2db's own homepage listing (loaded server-side as
  // <a href="/us/Version_0.5.4b">). We detect it by scanning nav links
  // for patterns like Version_X.Y.Z.
  if (!version || version === '0.0.0') {
    $('a[href]').each((_, a) => {
      if (version && version !== '0.0.0') return;
      const href = $(a).attr('href') || '';
      const vm = href.match(/Version_(\d+\.\d+\.\d+[a-z]?)/i);
      if (vm) version = vm[1];
    });
  }

  // As a last resort, use the current known patch (accurate as of 2025).
  // This gets updated when npm run fetch fetches the latest data.
  if (!version || version === '0.0.0') {
    version = '0.5.4b';
  }

  return { id: slugify(name), name, version };
}

function parseCurrencyPage($, slug) {
  // Name: try <h1> first, then og:title meta, then slug
  let name = $('h1').first().text().trim();
  if (!name) {
    name = $('meta[property="og:title"]').attr('content') || '';
  }
  if (!name) name = slug.replace(/_/g, ' ');

  const text = $('body').text();
  const stackMatch = text.match(/Stack Size:\s*(\d+)\s*\/\s*(\d+)/i);
  const stackSize = stackMatch ? +stackMatch[2] : undefined;

  // Image: try <img> first, then og:image meta
  let imageUrl = null;
  $('img[src]').each((_, img) => {
    if (imageUrl) return;
    const src = $(img).attr('src') || '';
    if (/\/2DItems\/Currency\//i.test(src)) imageUrl = imgAbs(src);
  });
  if (!imageUrl) {
    const ogImg = $('meta[property="og:image"]').attr('content');
    if (ogImg) imageUrl = imgAbs(ogImg);
  }

  // Description: try explicitMod, item-detail, then og:description
  let description = '';
  const $explicit = $('.explicitMod').first();
  if ($explicit.length) description = $explicit.text().trim().replace(/\s+/g, ' ');
  const $itemDetail = $('.item-detail, .itemDescription, .itemText').first();
  if (!description && $itemDetail.length) description = $itemDetail.text().trim().replace(/\s+/g, ' ');
  if (!description) {
    const ogDesc = $('meta[property="og:description"]').attr('content');
    if (ogDesc) description = ogDesc.trim().replace(/\s+/g, ' ');
  }
  // Fallback: pick the longest text node in the page that doesn't look
  //   like metadata (no "DropLevel", "BaseType", "Stack Size", etc.).
  const $cardWithName = $('.card').filter((_, c) => $(c).text().includes(name) && $(c).text().length > 50).first();
  if (!description && $cardWithName.length) {
    let longest = '';
    $cardWithName.find('p, div, td').each((_, el) => {
      const t = $(el).text().trim().replace(/\s+/g, ' ');
      if (t.length > 30 && t.length < 400 && t.length > longest.length
          && !/^Orb of |^Stack Size|^Drop|^BaseType|^Class|^Flags|^TypeMetadata|^NoteCode|^Metadata|^Sell|^Purchase|^Drop Enabled|^Stack Size/i.test(t)
          && !/^Description\s*$/i.test(t)) {
        longest = t;
      }
    });
    description = longest;
  }

  // Extract "Minimum Modifier Level: 35" or "Modifiers have a minimum required
  //   level of 50" from anywhere in the page text. Real PoE2 data — used by
  //   Greater/Perfect variants of Chaos/Exalted/Regal/Augmentation/Transmutation.
  const pageText = $('body').text();
  let minModifierLevel = undefined;
  const minMatch1 = pageText.match(/Minimum\s+Modifier\s+Level\s*:?\s*(\d+)/i);
  const minMatch2 = pageText.match(/minimum\s+required\s+(?:modifier\s+)?level\s*(?:of\s*)?(\d+)/i);
  const minMatch3 = pageText.match(/Modifiers?\s+have\s+a\s+minimum\s+required\s+level\s+of\s+(\d+)/i);
  if (minMatch1) minModifierLevel = +minMatch1[1];
  else if (minMatch2) minModifierLevel = +minMatch2[1];
  else if (minMatch3) minModifierLevel = +minMatch3[1];

  return {
    id: slug.toLowerCase(),
    name,
    tier: /Lesser/i.test(name) ? 'lesser'
      : /Greater/i.test(name) ? 'greater'
      : /Perfect/i.test(name) ? 'perfect'
      : /Corrupted/i.test(name) ? 'corrupted'
      : 'normal',
    category: categorize(slug, name),
    appliesTo: ['any'],
    description,
    effect: description,
    mechanics: description,
    imageUrl,
    stackSize,
    ...(minModifierLevel !== undefined ? { minModifierLevel } : {}),
  };
}

// Extract the guaranteed mod (essence effect) for an essence currency page.
// Essences have one or more .explicitMod blocks; the first non-blank one
// after the "Upgrades a Magic item..." header describes the actual mod.
function extractEssenceGuaranteedMod($) {
  const mods = [];
  $('.explicitMod').each((_, el) => {
    const txt = $(el).text().trim().replace(/\s+/g, ' ');
    if (!/^Upgrades a/.test(txt) && txt.length > 10) {
      mods.push(txt);
    }
  });
  return mods[0] || null;
}

function categorize(slug, name) {
  if (/Transmutation/.test(name)) return 'upgrade_rarity';
  if (/Augmentation/.test(name)) return 'augment';
  if (/Alchemy/.test(name)) return 'upgrade_rarity';
  if (/Regal/.test(name)) return 'augment';
  if (/Exalted/.test(name)) return 'augment';
  if (/Chaos/.test(name)) return 'reroll';
  if (/Annul/.test(name)) return 'annul';
  if (/Divine/.test(name)) return 'divine';
  if (/Chance/.test(name)) return 'upgrade_rarity';
  if (/Vaal/.test(name)) return 'corrupt';
  if (/Fracturing/.test(name)) return 'special';
  if (/Essence/.test(name)) return 'essence';
  if (/Breachstone|Breach/.test(name)) return 'breach';

  // Catalyst
  if (/Catalyst/.test(name)) return 'catalyst';

  // Desecration bones (Collarbone, Jawbone, Rib, Cranium)
  if (/(Collarbone|Jawbone|Rib|Cranium)/.test(name) && !/Omen/.test(name)) return 'desecrate';

  // Liquid emotions — all contain "Liquid" (including Diluted, Concentrated, Ancient, Potent variants)
  if (/\bLiquid\b/.test(name)) return 'liquid_affector';

  // Omens that appear in the currency listing
  if (/Omen of/.test(name)) return 'omen';

  // Jeweller's Orbs / refinement items
  if (/(Jewellers|Gemcutters|Glassblowers|Armourers|Blacksmiths|Artificers)/.test(name)) return 'refinement';

  // Alloys (Delirium instilling)
  if (/Alloy/i.test(name) || /(?:Arcanists?|Hinekoras?(?:_lock)?|Mystery|Scroll of Wisdom|Runebinders?|Runefathers?)/i.test(name)) return 'currency_other';

  return 'special';
}

function parseOmenPage($, slug) {
  // 1) Name — poe2db doesn't put a real <h1> on omen pages. Use the first
  //    meaningful <li.nav-item> text (the breadcrumb in the tab strip).
  let name = '';
  $('li.nav-item').each((_, el) => {
    if (name) return;
    const t = $(el).clone().children().remove().end().text().trim();
    // Omen breadcrumb looks like "Omen of Refreshment  OmenOnLowLifeRecoverCharges"
    if (t && t.length > 3 && t.length < 60 && !/^Item|^Modifier|^Crafting|^Quest|^Waystones?$/i.test(t)) {
      // Take just the human-readable first phrase
      name = t.split(/\s+/).slice(0, 6).join(' ').trim();
    }
  });
  if (!name) name = $('div.py-2').first().text().trim().split(/\s+Omen\s+/i)[0]?.trim() || '';
  if (!name) name = slug.replace(/^Omen_of_/, '').replace(/_/g, ' ');
  if (name.length > 40) name = name.slice(0, 40).trim();

  // 2) Description — the canonical place is the FIRST .explicitMod on the
  //    page. Everything before it ("Omen", "Stack Size: 1/10") is metadata.
  const $desc = $('.explicitMod').first();
  let description = ($desc.length ? $desc.text() : '').trim().replace(/\s+/g, ' ');
  if (!description || description.length < 8) {
    // Fallback to any explicitMod descendant or the long <p> in the popup
    const $fallback = $('div.explicitMod, p').filter((_, el) => ($(el).text().trim().length > 30)).first();
    description = $fallback.text().trim().replace(/\s+/g, ' ');
  }
  if (description.length > 300) description = description.slice(0, 297) + '…';

  // 3) Image — omen icons live under /2DItems/Currency/Omens/ (most), but
  //    Expedition/Runes of Aldur omens live under /2DItems/Currency/Expedition2/.
  //    Try Omens first, then any /2DItems/Currency/ icon.
  let imageUrl = null;
  $('img[src]').each((_, img) => {
    if (imageUrl) return;
    const src = $(img).attr('src') || '';
    if (/\/2DItems\/Currency\/Omens\//i.test(src)) imageUrl = imgAbs(src);
  });
  if (!imageUrl) {
    $('img[src]').each((_, img) => {
      if (imageUrl) return;
      const src = $(img).attr('src') || '';
      if (/\/2DItems\/Currency\//i.test(src)) imageUrl = imgAbs(src);
    });
  }

  // 4) Applies-to — best-effort extraction from the description. The text
  //    usually starts "While this item is active in your inventory your next X ...".
  const appliesTo = [];
  if (description) {
    const m = description.match(/your\s+next\s+([^.\n]+?)(?:\s+(?:will|inflicts|adds|removes|grants|are|is|has)|\.)/i);
    if (m) appliesTo.push(m[1].trim());
    else {
      const alt = description.match(/next\s+([^.\n]+?)(?:\s+(?:will|inflicts|adds|removes|grants|are|is|has)|\.)/i);
      if (alt) appliesTo.push(alt[1].trim());
    }
  }

  return {
    id: slug.toLowerCase(),
    name,
    appliesTo,
    description,
    effect: description,
    imageUrl,
  };
}

async function processFile(filename) {
  const filepath = path.join(RAW, filename);
  if (!existsSync(filepath)) return null;
  const html = await readFile(filepath, 'utf8');
  const $ = cheerio.load(html);

  if (filename === 'home.html') return { kind: 'home', season: parseSeason($) };
  if (filename === 'index.json') return null;

  if (filename.startsWith('base_')) {
    const slug = decodeURIComponent(filename).replace(/^base_/, '').replace(/\.html$/, '').replace(/[()]/g, '');
    const slot = SLOT_MAP[slug];
    const b = parseBasePage($, slug, html);
    const m = parseModsFromPage($, slot, html);
    let extra = { liquid: [], desecrated: [], corrupted: [], corruption_upgrade: [] };
    if (slot === 'jewel' && html) {
      extra = parseJewelExtraMods(html, slot);
    }
    return { kind: 'base', slug, bases: b, mods: m, extraMods: extra };
  }
  if (filename.startsWith('currency_')) {
    const slug = decodeURIComponent(filename).replace(/^currency_/, '').replace(/\.html$/, '').replace(/[()]/g, '');
    const result = parseCurrencyPage($, slug);
    // For essences, also extract the guaranteed mod text
    if (result.category === 'essence') {
      const guaranteed = extractEssenceGuaranteedMod($);
      if (guaranteed) result.guaranteedMod = guaranteed;
    }
    return { kind: 'currency', slug, currency: result };
  }
  if (filename.startsWith('omen_')) {
    const slug = decodeURIComponent(filename).replace(/^omen_/, '').replace(/\.html$/, '').replace(/[()]/g, '');
    return { kind: 'omen', slug, omen: parseOmenPage($, slug) };
  }
  if (filename.startsWith('guide_') && filename.includes('Essence')) {
    return { kind: 'essence_listing', html };
  }
  return null;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = (await readdir(RAW)).filter((f) => f.endsWith('.html'));

  let season = { id: 'unknown', name: 'Unknown', version: '0.0.0', detectedAt: new Date().toISOString(), source: 'poe2db' };
  const bases = [];
  const mods = [];
  const currency = [];
  const omens = [];
  let essenceListingHtml = null;

  for (const file of files) {
    try {
      const out = await processFile(file);
      if (!out) continue;
      if (out.kind === 'home' && out.season) season = { ...out.season, detectedAt: new Date().toISOString(), source: 'poe2db' };
      else if (out.kind === 'base') {
        bases.push(...out.bases);
        mods.push(...out.mods);
        if (out.extraMods) {
          mods.push(...out.extraMods.liquid);
          mods.push(...out.extraMods.desecrated);
          mods.push(...out.extraMods.corrupted);
          mods.push(...out.extraMods.corruption_upgrade);
        }
      } else if (out.kind === 'currency') {
        currency.push(out.currency);
      } else if (out.kind === 'omen') {
        omens.push(out.omen);
      } else if (out.kind === 'essence_listing') {
        essenceListingHtml = out.html;
      }
    } catch (err) {
      console.warn(`Failed ${file}: ${err.message}`);
    }
  }

  // Backfill essence icons from the Essence listing page
  if (essenceListingHtml) {
    const $listing = cheerio.load(essenceListingHtml);
    const essenceIconMap = new Map();
    $listing('img[src*="/Essence/"]').each((_, img) => {
      const src = $listing(img).attr('src') || '';
      const file = src.split('/').pop()?.split('.')[0] || '';
      if (!essenceIconMap.has(file)) essenceIconMap.set(file, imgAbs(src));
    });
    // Apply to currency items where imageUrl is null and name is an essence
    for (const c of currency) {
      if (c.imageUrl) continue;
      if (!/Essence/i.test(c.name)) continue;
      const slug = c.name.replace(/^Essence of /, '').replace(/^Lesser |^Greater |^Perfect |^Corrupted /i, '').replace(/\s+/g, '');
      if (essenceIconMap.has(slug)) {
        c.imageUrl = essenceIconMap.get(slug);
        continue;
      }
      const lc = slug.toLowerCase();
      for (const [k, v] of essenceIconMap.entries()) {
        if (k.toLowerCase().includes(lc)) { c.imageUrl = v; break; }
      }
    }
  }

  // Drop essences that have no image AND didn't appear in the listing page —
  // they're not in the current game.
  const beforeCount = currency.length;
  const dropped = [];
  for (let i = currency.length - 1; i >= 0; i--) {
    const c = currency[i];
    if (/Essence/i.test(c.name) && !c.imageUrl) {
      dropped.push(c.name);
      currency.splice(i, 1);
    }
  }
  if (dropped.length) console.log(`Dropped ${dropped.length} missing essences: ${dropped.join(', ')}`);

  // De-dupe bases by id
  const baseById = new Map();
  for (const b of bases) {
    const key = b.id;
    if (!baseById.has(key)) baseById.set(key, b);
  }
  const basesFinal = [...baseById.values()].sort((a, b) => a.name.localeCompare(b.name)).map(b => ({ ...b, id: b.id.replace(/%28/g, '_').replace(/%29/g, '').replace(/__+/g, '_').replace(/_$/, '') }));

  // De-dupe mods by description (not id, since the id encodes the original
  // scraper page's slot — we want to merge domains across pages so a mod
  // rolled by multiple base categories appears for all of them).
  const modByDesc = new Map();
  for (const m of mods) {
    const k = `${m.level}|${m.description}`;
    if (!modByDesc.has(k)) {
      modByDesc.set(k, { ...m });
    } else {
      const merged = modByDesc.get(k);
      for (const s of m.domain) {
        if (!merged.domain.includes(s)) merged.domain.push(s);
      }
    }
  }
  const modsFinal = [...modByDesc.values()].sort((a, b) => a.name.localeCompare(b.name));

  await writeFile(path.join(OUT, 'season.json'), JSON.stringify(season, null, 2), 'utf8');
  await writeFile(path.join(OUT, 'bases.json'), JSON.stringify(basesFinal, null, 2), 'utf8');
  await writeFile(path.join(OUT, 'mods.json'), JSON.stringify(modsFinal, null, 2), 'utf8');
  await writeFile(path.join(OUT, 'currency.json'), JSON.stringify(currency, null, 2), 'utf8');
  await writeFile(path.join(OUT, 'omens.json'), JSON.stringify(omens, null, 2), 'utf8');

  const manifest = {
    generatedAt: new Date().toISOString(),
    season,
    counts: {
      bases: basesFinal.length,
      mods: modsFinal.length,
      currency: currency.length,
      omens: omens.length,
    },
  };
  await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log('Processed:');
  console.log(`  season:   ${season.name} v${season.version}`);
  console.log(`  bases:    ${basesFinal.length}`);
  console.log(`  mods:     ${modsFinal.length}`);
  console.log(`  currency: ${currency.length}`);
  console.log(`  omens:    ${omens.length}`);

  // Ensure weights.json exists — data.ts statically imports it; if the
  // user hasn't run npm run weights, the import would fail.
  const weightsPath = path.join(OUT, 'weights.json');
  if (!existsSync(weightsPath)) {
    await writeFile(weightsPath, '[]', 'utf8');
  }

  // Copy processed JSON to public/data/ so client-side pages (simulator,
  // calculator) can fetch them on demand instead of embedding 1MB+ inline.
  const PUBLIC_DATA = path.join(ROOT, 'public', 'data');
  await mkdir(PUBLIC_DATA, { recursive: true });
  const filesToCopy = ['bases.json', 'mods.json', 'currency.json', 'omens.json', 'weights.json', 'season.json', 'manifest.json'];
  for (const f of filesToCopy) {
    const src = path.join(OUT, f);
    if (existsSync(src)) {
      await writeFile(path.join(PUBLIC_DATA, f), await readFile(src, 'utf8'), 'utf8');
    }
  }
  console.log(`Copied ${filesToCopy.length} data files to public/data/`);

  if (basesFinal.length > 0) {
    console.log('\nSample bases:');
    for (const b of basesFinal.slice(0, 5)) {
      console.log(`  ${b.name} (${b.slot}, lvl ${b.level}, ${b.affixSlots.prefix}P/${b.affixSlots.suffix}S)`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
