import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

const SITE = new URL('https://exilecrafter.com/');
const distArgument = process.argv.find((argument) => argument.startsWith('--dist='));
const DIST = path.resolve(distArgument?.slice('--dist='.length) || 'dist');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

function routeFromFile(file) {
  const relative = path.relative(DIST, file).split(path.sep).join('/');
  if (relative === 'index.html') return '/';
  if (relative.endsWith('/index.html')) {
    return `/${relative.slice(0, -'index.html'.length)}`;
  }
  return `/${relative}`;
}

function normalizedText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isPagePath(pathname) {
  const lastSegment = pathname.split('/').filter(Boolean).at(-1) ?? '';
  return !/\.[a-z0-9]{1,8}$/i.test(lastSegment)
    && pathname !== '/api'
    && !pathname.startsWith('/api/');
}

const files = (await walk(DIST)).sort();
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const artifactHash = createHash('sha256');
const seoOutputFiles = files.filter((file) => {
  const relative = path.relative(DIST, file).split(path.sep).join('/');
  return file.endsWith('.html')
    || /^sitemap.*\.xml$/.test(relative)
    || relative === 'robots.txt'
    || relative === 'og-exile-crafter.jpg'
    || /^data\/(?:bases|mods|currency|omens|weights|season|manifest)\.json$/.test(relative);
});
for (const file of seoOutputFiles) {
  const relative = path.relative(DIST, file).split(path.sep).join('/');
  artifactHash.update(relative);
  artifactHash.update('\0');
  artifactHash.update(await readFile(file));
  artifactHash.update('\0');
}
const pages = [];
let missingCanonicals = 0;
let missingSharedSocialMetadata = 0;
let jsonLdPages = 0;
let invalidJsonLdBlocks = 0;
let titlesOver60 = 0;
let pagesUnder200Words = 0;
let modPagesUnder300Words = 0;
let imageOccurrences = 0;
let imagesMissingDimensions = 0;
let nonTrailingPageLinkOccurrences = 0;

for (const file of htmlFiles) {
  const route = routeFromFile(file);
  const html = await readFile(file, 'utf8');

  const $ = load(html);
  const title = normalizedText($('title').first().text());
  const description = $('meta[name="description"]').first().attr('content')?.trim() ?? '';
  const robots = $('meta[name="robots"]').first().attr('content')?.trim() ?? '';
  const isNoindex = /(?:^|,)\s*noindex(?:,|$)/i.test(robots);
  const isIndexable = !isNoindex && route !== '/404.html';
  const canonical = $('link[rel="canonical"]').first().attr('href')?.trim() ?? null;
  if (isIndexable && !canonical) missingCanonicals += 1;
  if (title.length > 60) titlesOver60 += 1;

  const requiredSocialSelectors = [
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:image"]',
    'meta[name="twitter:card"]',
    'meta[name="twitter:title"]',
    'meta[name="twitter:description"]',
    'meta[name="twitter:image"]',
  ];
  if (
    isIndexable
    && requiredSocialSelectors.some((selector) => $(selector).length !== 1)
  ) {
    missingSharedSocialMetadata += 1;
  }

  const jsonLdScripts = $('script[type="application/ld+json"]').toArray();
  if (jsonLdScripts.length > 0) jsonLdPages += 1;
  for (const script of jsonLdScripts) {
    try {
      JSON.parse($(script).html() ?? '');
    } catch {
      invalidJsonLdBlocks += 1;
    }
  }

  const mainText = normalizedText($('main').text());
  const wordCount = mainText === '' ? 0 : mainText.split(/\s+/).length;
  if (wordCount < 200) pagesUnder200Words += 1;
  if (route.startsWith('/mods/') && route !== '/mods/' && wordCount < 300) {
    modPagesUnder300Words += 1;
  }

  const images = $('img').toArray();
  imageOccurrences += images.length;
  imagesMissingDimensions += images.filter((image) => {
    return !$(image).attr('width') || !$(image).attr('height');
  }).length;

  const internalLinks = new Set();
  for (const anchor of $('a[href]').toArray()) {
    const href = $(anchor).attr('href')?.trim() ?? '';
    if (href === '' || href.startsWith('#') || /^(?:mailto|tel|javascript|data):/i.test(href)) {
      continue;
    }
    let target;
    try {
      target = new URL(href, new URL(route, SITE));
    } catch {
      continue;
    }
    if (target.origin !== SITE.origin || !isPagePath(target.pathname)) continue;
    const graphPath = target.pathname === '/' || target.pathname.endsWith('/')
      ? target.pathname
      : `${target.pathname}/`;
    internalLinks.add(`${target.origin}${graphPath}`);
    if (target.pathname !== '/' && !target.pathname.endsWith('/')) {
      nonTrailingPageLinkOccurrences += 1;
    }
  }

  pages.push({
    route,
    title,
    description,
    canonical,
    isNoindex,
    isIndexable,
    internalLinks,
  });
}

const titleGroups = new Map();
for (const page of pages.filter((candidate) => candidate.isIndexable)) {
  const key = page.title.toLocaleLowerCase('en');
  titleGroups.set(key, [...(titleGroups.get(key) ?? []), page.route]);
}
const duplicateTitleGroups = [...titleGroups.values()]
  .filter((routes) => routes.length > 1).length;

const pageUrls = new Set(
  pages
    .filter((page) => page.isIndexable)
    .map((page) => `${SITE.origin}${page.route === '/' ? '/' : page.route}`),
);
const inlinks = new Map([...pageUrls].map((url) => [url, 0]));
for (const page of pages) {
  const source = `${SITE.origin}${page.route === '/' ? '/' : page.route}`;
  for (const target of page.internalLinks) {
    if (target !== source && inlinks.has(target)) {
      inlinks.set(target, inlinks.get(target) + 1);
    }
  }
}
const zeroInlinkPages = [...inlinks.entries()].filter(([url, count]) => {
  return url !== `${SITE.origin}/`
    && url !== `${SITE.origin}/404.html`
    && count === 0;
}).length;

let sitemapUrls = [];
try {
  const sitemap = await readFile(path.join(DIST, 'sitemap-0.xml'), 'utf8');
  sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
} catch {
  // A missing sitemap is represented by an empty URL set.
}

const result = {
  schemaVersion: 1,
  tool: 'scripts/audit-seo-output.mjs',
  site: SITE.origin,
  dist: path.relative(process.cwd(), DIST) || 'dist',
  seoOutputSha256: artifactHash.digest('hex'),
  metrics: {
    htmlPages: pages.length,
    indexablePages: pages.filter((page) => page.isIndexable).length,
    noindexPages: pages.filter((page) => page.isNoindex).length,
    errorPages: pages.filter((page) => page.route === '/404.html').length,
    missingCanonicals,
    missingSharedSocialMetadata,
    jsonLdPages,
    invalidJsonLdBlocks,
    duplicateTitleGroups,
    titlesOver60,
    pagesUnder200Words,
    modPagesUnder300Words,
    imageOccurrences,
    imagesMissingDimensions,
    nonTrailingPageLinkOccurrences,
    zeroInlinkPages,
    sitemapUrls: sitemapUrls.length,
    duplicateSitemapUrls: sitemapUrls.length - new Set(sitemapUrls).size,
  },
};

console.log(JSON.stringify(result, null, 2));
