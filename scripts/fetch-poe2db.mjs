// scripts/fetch-poe2db.mjs
// Fetches raw HTML from poe2db.tw. The set of pages to fetch is discovered from
// poe2db's own listing pages (Currency / Essence / Omen) plus a known-good base
// item subcategory list. Output: data/raw/*.html + data/raw/index.json.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

const BASE_URL = 'https://poe2db.tw/us';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CraftClassBot/0.1 (+local)';

// Base item subcategory pages. These are the index pages for each slot on poe2db
// (e.g. /us/Helmets_str). poe2db doesn't have a single "all bases" listing, so
// we hit each subcategory individually and extract the base items from each.
const BASE_SUBCATEGORIES = [
  'Helmets_str', 'Helmets_dex', 'Helmets_int',
  'Helmets_str_dex', 'Helmets_str_int', 'Helmets_dex_int',
  'Body_Armours_str', 'Body_Armours_dex', 'Body_Armours_int',
  'Body_Armours_str_dex', 'Body_Armours_str_int', 'Body_Armours_dex_int',
  'Body_Armours_str_dex_int',
  'Gloves_str', 'Gloves_dex', 'Gloves_int',
  'Gloves_str_dex', 'Gloves_str_int', 'Gloves_dex_int',
  'Boots_str', 'Boots_dex', 'Boots_int',
  'Boots_str_dex', 'Boots_str_int', 'Boots_dex_int',
  'Belts',
  'Amulets', 'Rings',
  'Shields_str', 'Shields_str_dex', 'Shields_str_int',
  'Bucklers', 'Foci',
  'Claws', 'Daggers', 'Wands',
  'One_Hand_Swords', 'One_Hand_Axes', 'One_Hand_Maces',
  'Sceptres', 'Spears', 'Flails',
  'Bows', 'Staves', 'Two_Hand_Swords',
  'Two_Hand_Axes', 'Two_Hand_Maces',
  'Quarterstaves', 'Crossbows', 'Traps', 'Talismans',
  'Quivers',
  'Ruby', 'Emerald', 'Sapphire', 'Diamond',
  'Time-Lost_Ruby', 'Time-Lost_Emerald', 'Time-Lost_Sapphire', 'Time-Lost_Diamond',
  'Life_Flasks', 'Mana_Flasks',
  'Charms',
  'Waystones',
  'Breach_Tablet', 'Expedition_Tablet', 'Delirium_Tablet',
  'Ritual_Tablet', 'Irradiated_Tablet', 'Overseer_Tablet',
  'Abyss_Tablet', 'Temple_Tablet',
  'Urn_Relic', 'Amphora_Relic', 'Vase_Relic',
  'Seal_Relic', 'Coffer_Relic', 'Tapestry_Relic', 'Incense_Relic',
];

const LISTING_PAGES = [
  // Listing pages — these are SPA-loaded so we use them only to discover item slugs
  { url: '/Currency', kind: 'listing', saveAs: '_listing_currency.html' },
  { url: '/Essence', kind: 'listing', saveAs: '_listing_essence.html' },
  { url: '/Omen', kind: 'listing', saveAs: '_listing_omen.html' },
  { url: '/Liquid_Emotions', kind: 'listing', saveAs: '_listing_liquid.html' },
  { url: '/Catalysts', kind: 'listing', saveAs: '_listing_catalyst.html' },
];

const GUIDE_PAGES = ['Crafting', 'Modifiers', 'Desecrated_Modifiers', 'Keywords'];

// Currency/omen pages not auto-discovered from the Currency/Omen listing pages.
// These are reachable only via other in-game systems (Abyssal Depths, Atlas, etc.).
const EXTRA_CURRENCY_PAGES = [
  'Preserved_Cranium',  // Abyssal Depths — desecrates a Rare Jewel
  'Ancient_Orb',        // Reforges a unique item — not on Currency listing SVG tab
  'Corrupted',          // Corrupted implicit mods for Vaal Orb outcome
  // Desecration Bones — targeted desecration for different equipment slots
  'Ancient_Collarbone', 'Preserved_Collarbone', 'Gnawed_Collarbone',  // amulets/rings/belts (Ulaman)
  'Ancient_Jawbone', 'Preserved_Jawbone', 'Gnawed_Jawbone',           // weapons/quivers (Amanamu)
  'Ancient_Rib', 'Preserved_Rib', 'Gnawed_Rib',                       // armour (Kurgal)
];

// Individual Catalyst pages — discovered from the Catalyst listing.
const CATALYST_PAGES = [
  'Flesh_Catalyst', 'Neural_Catalyst', 'Carapace_Catalyst',
  'Uul-Netols_Catalyst', 'Xophs_Catalyst', 'Tuls_Catalyst',
  'Eshs_Catalyst', 'Chayulas_Catalyst',
  'Reaver_Catalyst', 'Sibilant_Catalyst', 'Skittering_Catalyst',
  'Adaptive_Catalyst', 'Necrotic_Catalyst',
  'Refined_Flesh_Catalyst', 'Refined_Neural_Catalyst', 'Refined_Carapace_Catalyst',
  'Refined_Uul-Netols_Catalyst', 'Refined_Xophs_Catalyst', 'Refined_Tuls_Catalyst',
  'Refined_Eshs_Catalyst', 'Refined_Chayulas_Catalyst',
  'Refined_Reaver_Catalyst', 'Refined_Sibilant_Catalyst', 'Refined_Skittering_Catalyst',
  'Refined_Adaptive_Catalyst', 'Refined_Necrotic_Catalyst',
];

// Omen pages not auto-discovered. poe2db's Omen listing has all 50, but be explicit
// to defend against future listing changes.
const EXTRA_OMEN_PAGES = [
  'Omen_of_Abyssal_Echoes', // Cranium re-roll
];

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function fetchWithRetry(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try { return await fetchPage(url); }
    catch (err) {
      if (i === attempts - 1) throw err;
      const wait = 750 * (i + 1);
      console.warn(`  retry ${i + 1}/${attempts} for ${url} after ${wait}ms (${err.message})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Discover item slugs from a listing page (e.g. /Currency, /Essence, /Omen).
// poe2db uses both <img> (some tabs) and SVG <image> (Currency Tab /37) formats.
async function discoverFromListing(html) {
  const $ = cheerio.load(html);
  const slugs = new Set();
  
  // Check for <img> elements (used in various tab panes)
  $('a').each((_, a) => {
    const $a = $(a);
    const $img = $a.find('img').first();
    if (!$img.length) return;
    const src = $img.attr('src') || '';
    if (!/\/2DItems\/Currency\//.test(src)) return;
    const href = $a.attr('href') || '';
    if (!href || href === '#') return;
    const slug = href.replace(/^\/us\//, '').split('#')[0];
    if (slug) slugs.add(slug);
  });
  
  // Check for SVG <image> elements with xlink:href (used in Currency Tab /37 SVG grid)
  $('a[xlink\\:href]').each((_, a) => {
    const $a = $(a);
    const $image = $a.find('image').first();
    if (!$image.length) return;
    const src = $image.attr('xlink:href') || '';
    if (!/\/2DItems\/Currency\//.test(src)) return;
    const href = $a.attr('xlink:href') || '';
    if (!href || href === '#') return;
    const slug = href.replace(/^\/us\//, '').split('#')[0];
    if (slug) slugs.add(slug);
  });
  
  return [...slugs];
}

// Discover item slugs from the Liquid Emotions listing page.
// This page uses a card-based layout with plain <a> links to individual pages.
async function discoverFromLiquidListing(html) {
  const $ = cheerio.load(html);
  const slugs = new Set();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    // Liquid emotion pages have slugs like "Diluted_Liquid_Ire", "Liquid_Paranoia", etc.
    // They don't start with / or # and don't contain /
    if (/^[A-Z][a-zA-Z_]+$/.test(href) && /Liquid/i.test(href)) {
      slugs.add(href);
    }
  });
  return [...slugs];
}

async function fetchGroup(label, pages) {
  const out = [];
  for (const slug of pages) {
    const file = path.join(RAW, `${label}_${slug}.html`);
    if (existsSync(file)) {
      console.log(`  [cached] ${label}/${slug}`);
      out.push({ slug, file, cached: true });
      continue;
    }
    process.stdout.write(`  [fetch ] ${label}/${slug} ... `);
    try {
      const html = await fetchWithRetry(`${BASE_URL}/${slug}`);
      await writeFile(file, html, 'utf8');
      console.log('ok');
      out.push({ slug, file, cached: false });
    } catch (err) {
      console.log(`FAIL (${err.message})`);
      out.push({ slug, file: null, error: err.message });
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

async function main() {
  await mkdir(RAW, { recursive: true });

  // Step 1: fetch listing pages so we can discover current item slugs
  console.log('Fetching listing pages (for slug discovery)...');
  for (const lp of LISTING_PAGES) {
    const file = path.join(RAW, lp.saveAs);
    if (existsSync(file)) {
      console.log(`  [cached] ${lp.saveAs}`);
      continue;
    }
    process.stdout.write(`  [fetch ] ${lp.url} ... `);
    try {
      const html = await fetchWithRetry(`${BASE_URL}${lp.url}`);
      await writeFile(file, html, 'utf8');
      console.log('ok');
    } catch (err) {
      console.log(`FAIL (${err.message})`);
    }
  }

  // Step 2: discover item slugs from each listing
  const discovered = {};
  for (const lp of LISTING_PAGES) {
    const file = path.join(RAW, lp.saveAs);
    if (!existsSync(file)) continue;
    const html = await readFile(file, 'utf8');
    const slugs = await discoverFromListing(html);
    discovered[lp.saveAs] = slugs;
    console.log(`  discovered ${slugs.length} slugs from ${lp.saveAs}`);
  }

  // Currency and omens come from the listing pages.
  // Essences have their own listing too.
  // We split discovered lists by which listing they came from.
  const currencySlugs = discovered['_listing_currency.html'] || [];
  const essenceSlugs = discovered['_listing_essence.html'] || [];
  const omenSlugs = discovered['_listing_omen.html'] || [];
  let liquidSlugs = [];
  if (discovered['_listing_liquid.html']) {
    liquidSlugs = discovered['_listing_liquid.html'];
  } else {
    // Fallback: try discovering from the raw liquid listing page
    const liquidFile = path.join(RAW, '_listing_liquid.html');
    if (existsSync(liquidFile)) {
      const html = await readFile(liquidFile, 'utf8');
      liquidSlugs = await discoverFromLiquidListing(html);
      discovered['_listing_liquid.html'] = liquidSlugs;
      console.log(`  discovered ${liquidSlugs.length} slugs from _listing_liquid.html (fallback)`);
    }
  }

  // Step 3: fetch every discovered item page + base subcategories + guides + home
  console.log('\nFetching currency items from listing...');
  await fetchGroup('currency', currencySlugs);

  console.log('\nFetching extra currency pages (not on Currency listing)...');
  await fetchGroup('currency', EXTRA_CURRENCY_PAGES);

  console.log('\nFetching essences from listing...');
  await fetchGroup('currency', essenceSlugs); // essences go into currency file group

  console.log('\nFetching omens from listing...');
  await fetchGroup('omen', omenSlugs);

  console.log('\nFetching extra omen pages (not on Omen listing)...');
  await fetchGroup('omen', EXTRA_OMEN_PAGES);

  console.log('\nFetching liquid emotions from listing...');
  await fetchGroup('currency', liquidSlugs);

  // Discover catalyst slugs from listing and fetch them
  let catalystSlugs = [];
  if (discovered['_listing_catalyst.html']) {
    catalystSlugs = discovered['_listing_catalyst.html'];
  } else {
    const catalystFile = path.join(RAW, '_listing_catalyst.html');
    if (existsSync(catalystFile)) {
      const html = await readFile(catalystFile, 'utf8');
      const $ = cheerio.load(html);
      catalystSlugs = [];
      $('a[href]').each((_, a) => {
        const href = $(a).attr('href') || '';
        if (/^[A-Z][a-zA-Z_]+$/.test(href) && /Catalyst/i.test(href)) {
          catalystSlugs.push(href);
        }
      });
      console.log(`  discovered ${catalystSlugs.length} catalyst slugs`);
    }
  }
  const allCatalystSlugs = [...new Set([...catalystSlugs, ...CATALYST_PAGES])];
  console.log('\nFetching catalysts...');
  await fetchGroup('currency', allCatalystSlugs);

  console.log('\nFetching base item subcategories...');
  await fetchGroup('base', BASE_SUBCATEGORIES);

  console.log('\nFetching guides...');
  await fetchGroup('guide', GUIDE_PAGES);

  console.log('\nFetching home (season detection)...');
  const homeFile = path.join(RAW, 'home.html');
  if (!existsSync(homeFile)) {
    try {
      const html = await fetchWithRetry(BASE_URL);
      await writeFile(homeFile, html, 'utf8');
      console.log('  ok');
    } catch (err) {
      console.log(`  FAIL (${err.message})`);
    }
  } else {
    console.log('  [cached] home');
  }

  console.log('\nDone. Run `npm run process` next.');
}

main().catch((err) => { console.error(err); process.exit(1); });

