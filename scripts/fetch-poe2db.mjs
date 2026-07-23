// scripts/fetch-poe2db.mjs
// Fetches raw HTML from poe2db.tw. The set of pages to fetch is discovered from
// poe2db's own listing pages (Currency / Essence / Omen) plus a known-good base
// item subcategory list. Output: data/raw/*.html + data/raw/index.json.

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

export const POE2DB_PAGE_ORIGIN = 'https://poe2db.tw';
export const BASE_URL = `${POE2DB_PAGE_ORIGIN}/us`;
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
export const MAX_FETCH_ATTEMPTS = 3;
export const MAX_DISCOVERED_ITEMS = 500;
export const MAX_GROUP_ITEMS = 1_000;
export const MAX_SLUG_LENGTH = 128;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CraftClassBot/0.1 (+local)';
const SAFE_SLUG_RE = new RegExp(`^[A-Za-z0-9][A-Za-z0-9_-]{0,${MAX_SLUG_LENGTH - 1}}$`);
const SAFE_RAW_LABELS = new Set(['base', 'currency', 'guide', 'omen']);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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

export function validatePageUrl(value, base = `${BASE_URL}/`) {
  let url;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error(`Invalid poe2db page URL: ${String(value)}`);
  }

  if (
    url.protocol !== 'https:'
    || url.origin !== POE2DB_PAGE_ORIGIN
    || url.username
    || url.password
    || (url.pathname !== '/us' && !url.pathname.startsWith('/us/'))
  ) {
    throw new Error(`Refusing non-allowlisted poe2db page URL: ${url.href}`);
  }
  if (url.search) {
    throw new Error(`Refusing poe2db page URL with query parameters: ${url.href}`);
  }

  url.hash = '';
  return url;
}

export function normalizeListingSlug(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw === '#' || raw.includes('\\') || raw.includes('?')) return null;

  // Listing links are expected to be a single slug, /us/<slug>, or the
  // equivalent absolute allowlisted URL. Reject path-relative traversal even
  // when URL normalization would happen to bring it back under /us/.
  const hashless = raw.split('#', 1)[0];
  if (
    !SAFE_SLUG_RE.test(hashless)
    && !hashless.startsWith('/us/')
    && !hashless.startsWith(`${POE2DB_PAGE_ORIGIN}/us/`)
  ) {
    return null;
  }

  let url;
  try {
    url = validatePageUrl(hashless);
  } catch {
    return null;
  }

  const encodedSlug = url.pathname.slice('/us/'.length);
  if (!encodedSlug || encodedSlug.includes('/')) return null;

  let slug;
  try {
    slug = decodeURIComponent(encodedSlug);
  } catch {
    return null;
  }
  return SAFE_SLUG_RE.test(slug) ? slug : null;
}

export function boundedUniqueSlugs(values, maxItems = MAX_GROUP_ITEMS) {
  if (!Array.isArray(values)) throw new TypeError('Expected an array of poe2db slugs');
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > MAX_GROUP_ITEMS) {
    throw new RangeError(`Slug limit must be between 1 and ${MAX_GROUP_ITEMS}`);
  }
  if (values.length > maxItems) {
    throw new RangeError(`Refusing ${values.length} poe2db slugs; limit is ${maxItems}`);
  }

  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const slug = normalizeListingSlug(value);
    if (!slug) throw new Error(`Unsafe poe2db slug: ${String(value)}`);
    if (!seen.has(slug)) {
      seen.add(slug);
      unique.push(slug);
    }
  }
  return unique;
}

export function resolveRawFile(filename) {
  if (
    typeof filename !== 'string'
    || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,191}$/.test(filename)
    || filename === '.'
    || filename === '..'
  ) {
    throw new Error(`Unsafe raw filename: ${String(filename)}`);
  }
  const resolved = path.resolve(RAW, filename);
  if (path.dirname(resolved) !== RAW) {
    throw new Error(`Raw output path escapes data/raw: ${filename}`);
  }
  return resolved;
}

export function resolveRawGroupFile(label, slug) {
  if (!SAFE_RAW_LABELS.has(label)) throw new Error(`Unsafe raw group label: ${String(label)}`);
  const normalized = normalizeListingSlug(slug);
  if (!normalized) throw new Error(`Unsafe poe2db slug: ${String(slug)}`);
  return resolveRawFile(`${label}_${normalized}.html`);
}

async function readBoundedTextFile(filename, maxBytes = MAX_RESPONSE_BYTES) {
  const file = resolveRawFile(filename);
  const info = await stat(file);
  if (info.size > maxBytes) {
    throw new RangeError(`Refusing oversized cached HTML ${filename}: ${info.size} bytes`);
  }
  return await readFile(file, 'utf8');
}

async function responseTextWithinLimit(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new RangeError(`Response exceeds ${maxBytes} bytes`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RangeError(`Response exceeds ${maxBytes} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

export async function fetchPage(
  value,
  {
    fetchImpl = fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
    maxBytes = MAX_RESPONSE_BYTES,
    maxRedirects = MAX_REDIRECTS,
  } = {},
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > REQUEST_TIMEOUT_MS) {
    throw new RangeError(`Timeout must be between 1 and ${REQUEST_TIMEOUT_MS}ms`);
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RESPONSE_BYTES) {
    throw new RangeError(`Response limit must be between 1 and ${MAX_RESPONSE_BYTES} bytes`);
  }
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > MAX_REDIRECTS) {
    throw new RangeError(`Redirect limit must be between 0 and ${MAX_REDIRECTS}`);
  }

  let url = validatePageUrl(value);
  for (let redirectCount = 0; ; redirectCount++) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Timeout fetching ${url.href} after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    try {
      const operation = (async () => {
        const response = await fetchImpl(url, {
          headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
          redirect: 'manual',
          signal: controller.signal,
        });

        if (REDIRECT_STATUSES.has(response.status)) {
          await response.body?.cancel();
          return { redirect: response.headers.get('location') };
        }
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`HTTP ${response.status}`);
        }
        return { html: await responseTextWithinLimit(response, maxBytes) };
      })();

      const result = await Promise.race([operation, deadline]);
      if ('redirect' in result) {
        if (redirectCount >= maxRedirects) {
          throw new Error(`Too many redirects fetching ${url.href}`);
        }
        if (!result.redirect) throw new Error(`Redirect with no Location: ${url.href}`);
        url = validatePageUrl(result.redirect, url);
        continue;
      }
      return result.html;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function fetchWithRetry(url, attempts = MAX_FETCH_ATTEMPTS) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > MAX_FETCH_ATTEMPTS) {
    throw new RangeError(`Fetch attempts must be between 1 and ${MAX_FETCH_ATTEMPTS}`);
  }
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
function assertListingHtml(html) {
  if (typeof html !== 'string') throw new TypeError('Listing HTML must be a string');
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_RESPONSE_BYTES) {
    throw new RangeError(`Listing HTML exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
}

function addDiscoveredSlug(slugs, value) {
  const slug = normalizeListingSlug(value);
  if (!slug) return;
  slugs.add(slug);
  if (slugs.size > MAX_DISCOVERED_ITEMS) {
    throw new RangeError(`Listing exceeds ${MAX_DISCOVERED_ITEMS} discovered items`);
  }
}

export function discoverFromListing(html) {
  assertListingHtml(html);
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
    addDiscoveredSlug(slugs, href);
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
    addDiscoveredSlug(slugs, href);
  });
  
  return [...slugs];
}

// Discover item slugs from the Liquid Emotions listing page.
// This page uses a card-based layout with plain <a> links to individual pages.
export function discoverPlainListing(html, requiredName) {
  assertListingHtml(html);
  if (!(requiredName instanceof RegExp)) {
    throw new TypeError('Plain-listing name matcher must be a RegExp');
  }
  const nameMatcher = new RegExp(requiredName.source, requiredName.flags.replace(/[gy]/g, ''));
  const $ = cheerio.load(html);
  const slugs = new Set();
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href') || '';
    const slug = normalizeListingSlug(href);
    if (slug && nameMatcher.test(slug)) addDiscoveredSlug(slugs, slug);
  });
  return [...slugs];
}

export function discoverFromLiquidListing(html) {
  // Liquid emotion pages have slugs like "Diluted_Liquid_Ire" and
  // "Liquid_Paranoia".
  return discoverPlainListing(html, /Liquid/i);
}

export function assertNoFetchFailures(label, results) {
  if (typeof label !== 'string' || !label) throw new TypeError('Fetch group label is required');
  if (!Array.isArray(results)) throw new TypeError('Fetch results must be an array');
  const failures = results.filter(({ error }) => error);
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(({ slug, error }) => new Error(`${label}/${slug}: ${error}`)),
      `Required poe2db group ${label} failed for ${failures.length} page(s)`,
    );
  }
  return results;
}

async function fetchGroup(label, pages) {
  const safePages = boundedUniqueSlugs(pages, MAX_GROUP_ITEMS);
  const out = [];
  for (const slug of safePages) {
    const file = resolveRawGroupFile(label, slug);
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
  return assertNoFetchFailures(label, out);
}

export async function main() {
  await mkdir(RAW, { recursive: true });

  // Step 1: fetch listing pages so we can discover current item slugs
  console.log('Fetching listing pages (for slug discovery)...');
  for (const lp of LISTING_PAGES) {
    const file = resolveRawFile(lp.saveAs);
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
      throw new Error(`Required poe2db listing failed: ${lp.url}`, { cause: err });
    }
  }

  // Step 2: discover item slugs from each listing
  const discovered = {};
  for (const lp of LISTING_PAGES) {
    const file = resolveRawFile(lp.saveAs);
    if (!existsSync(file)) continue;
    const html = await readBoundedTextFile(lp.saveAs);
    const slugs = discoverFromListing(html);
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
    const liquidFile = resolveRawFile('_listing_liquid.html');
    if (existsSync(liquidFile)) {
      const html = await readBoundedTextFile('_listing_liquid.html');
      liquidSlugs = discoverFromLiquidListing(html);
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
    const catalystFile = resolveRawFile('_listing_catalyst.html');
    if (existsSync(catalystFile)) {
      const html = await readBoundedTextFile('_listing_catalyst.html');
      catalystSlugs = discoverPlainListing(html, /Catalyst/i);
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
  const homeFile = resolveRawFile('home.html');
  if (!existsSync(homeFile)) {
    try {
      const html = await fetchWithRetry(BASE_URL);
      await writeFile(homeFile, html, 'utf8');
      console.log('  ok');
    } catch (err) {
      console.log(`  FAIL (${err.message})`);
      throw new Error('Required poe2db home page failed', { cause: err });
    }
  } else {
    console.log('  [cached] home');
  }

  console.log('\nDone. Run `npm run process` next.');
}

export function isDirectExecution(metaUrl, argvEntry = process.argv[1]) {
  if (!argvEntry) return false;
  return pathToFileURL(path.resolve(argvEntry)).href === metaUrl;
}

if (isDirectExecution(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
