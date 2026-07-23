/**
 * download-images.mjs
 *
 * Downloads all item/currency/omen/etc. images from poe2db's CDN
 * and saves them locally under public/images/ so the static site
 * isn't at the mercy of hotlink protection (CDN returns 403 without
 * a proper Referer header).
 *
 * Usage:  node scripts/download-images.mjs
 *
 * Reads every processed JSON file, finds imageUrl fields,
 * downloads the image with the correct Referer header,
 * writes it to public/images/<category>/<path>, and patches
 * the JSON in-place so the URL becomes a relative local path.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import https from 'node:https';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public', 'images');
const DATA = join(ROOT, 'data', 'processed');
const PUBLIC_DATA = join(ROOT, 'public', 'data');

export const POE2DB_IMAGE_ORIGINS = Object.freeze(['https://cdn.poe2db.tw']);
export const IMAGE_REQUEST_TIMEOUT_MS = 15_000;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_REDIRECTS = 3;
export const MAX_ITEMS_PER_CATEGORY = 10_000;
export const MAX_IMAGE_PATH_SEGMENTS = 16;
export const MAX_IMAGE_PATH_LENGTH = 512;

const CATEGORIES = [
  { file: 'bases.json',    key: 'bases',    referer: 'https://poe2db.tw/us/' },
  { file: 'currency.json', key: 'currency', referer: 'https://poe2db.tw/us/' },
  { file: 'omens.json',    key: 'omens',    referer: 'https://poe2db.tw/us/' },
  // mods.json has no imageUrl fields — skip it
];

const MAX_CONCURRENT = 8;
const IMAGE_ORIGIN_SET = new Set(POE2DB_IMAGE_ORIGINS);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CATEGORY_KEYS = new Set(CATEGORIES.map(({ key }) => key));
const CATEGORY_FILES = new Set(CATEGORIES.map(({ file }) => file));
const LOCAL_CATEGORY_PREFIXES = Object.freeze({
  bases: ['/images/base/', '/images/bases/'],
  currency: ['/images/currency/'],
  omens: ['/images/omen/', '/images/omens/'],
});

export function validateImageUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError('Image URL must be a non-empty string');
  }
  const raw = value.trim();
  if (
    raw.includes('\\')
    || /%(?:2e|2f|5c)/i.test(raw)
    || /(?:^|\/)\.{1,2}(?:\/|$)/.test(raw)
  ) {
    throw new Error(`Refusing image URL with unsafe path syntax: ${raw}`);
  }

  let url;
  try {
    url = base ? new URL(raw, base) : new URL(raw);
  } catch {
    throw new Error(`Invalid poe2db image URL: ${raw}`);
  }
  if (
    url.protocol !== 'https:'
    || !IMAGE_ORIGIN_SET.has(url.origin)
    || url.username
    || url.password
  ) {
    throw new Error(`Refusing non-allowlisted poe2db image URL: ${url.href}`);
  }
  url.hash = '';
  return url;
}

export function validatePoe2dbReferer(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid poe2db referer: ${String(value)}`);
  }
  if (
    url.protocol !== 'https:'
    || url.origin !== 'https://poe2db.tw'
    || url.username
    || url.password
    || (url.pathname !== '/us' && !url.pathname.startsWith('/us/'))
  ) {
    throw new Error(`Refusing non-allowlisted poe2db referer: ${url.href}`);
  }
  url.search = '';
  url.hash = '';
  return url.href;
}

function safePathSegments(encodedPath) {
  if (encodedPath.length > MAX_IMAGE_PATH_LENGTH) {
    throw new RangeError(`Image path exceeds ${MAX_IMAGE_PATH_LENGTH} characters`);
  }
  const encodedSegments = encodedPath.split('/').filter(Boolean);
  if (encodedSegments.length < 1 || encodedSegments.length > MAX_IMAGE_PATH_SEGMENTS) {
    throw new RangeError(`Image path must contain 1-${MAX_IMAGE_PATH_SEGMENTS} segments`);
  }

  return encodedSegments.map((encodedSegment) => {
    let segment;
    try {
      segment = decodeURIComponent(encodedSegment);
    } catch {
      throw new Error(`Invalid encoded image path segment: ${encodedSegment}`);
    }
    if (
      !segment
      || segment === '.'
      || segment === '..'
      || segment.length > 180
      || /[\\/\u0000-\u001f\u007f<>:"|?*]/.test(segment)
      || /[. ]$/.test(segment)
    ) {
      throw new Error(`Unsafe image path segment: ${segment}`);
    }
    return segment;
  });
}

function assertImageOutputPath(candidate) {
  const root = resolve(PUBLIC);
  const output = resolve(candidate);
  if (output === root || !output.startsWith(`${root}${sep}`)) {
    throw new Error(`Image output path escapes public/images: ${candidate}`);
  }
  return output;
}

function resolveContainedFile(rootDirectory, filename) {
  const root = resolve(rootDirectory);
  const output = resolve(root, filename);
  if (output === root || !output.startsWith(`${root}${sep}`)) {
    throw new Error(`Data output path escapes ${rootDirectory}: ${filename}`);
  }
  return output;
}

export function resolveCategoryDataPaths(filename) {
  if (!CATEGORY_FILES.has(filename)) {
    throw new Error(`Unsafe processed-data filename: ${String(filename)}`);
  }
  return {
    processed: resolveContainedFile(DATA, filename),
    public: resolveContainedFile(PUBLIC_DATA, filename),
  };
}

export function serializeCategoryItems(items) {
  if (!Array.isArray(items)) throw new TypeError('Category data must be an array');
  if (items.length > MAX_ITEMS_PER_CATEGORY) {
    throw new RangeError(`Category data exceeds ${MAX_ITEMS_PER_CATEGORY} items`);
  }
  return JSON.stringify(items, null, 2);
}

export function syncCategoryData(filename, items) {
  const paths = resolveCategoryDataPaths(filename);
  const serialized = serializeCategoryItems(items);
  mkdirSync(dirname(paths.processed), { recursive: true });
  mkdirSync(dirname(paths.public), { recursive: true });
  writeFileSync(paths.processed, serialized, 'utf8');
  writeFileSync(paths.public, serialized, 'utf8');
  return { ...paths, serialized };
}

export function assertCategoryDownloadSucceeded(filename, failureCount) {
  if (!CATEGORY_FILES.has(filename)) {
    throw new Error(`Unsafe processed-data filename: ${String(filename)}`);
  }
  if (!Number.isSafeInteger(failureCount) || failureCount < 0) {
    throw new TypeError('Image failure count must be a non-negative integer');
  }
  if (failureCount > 0) {
    throw new Error(
      `Refusing to synchronize ${filename}: ${failureCount} required image(s) failed validation or download`,
    );
  }
}

export function resolveLocalImageDestination(imageUrl, categoryKey) {
  if (!CATEGORY_KEYS.has(categoryKey)) {
    throw new Error(`Unsafe image category: ${String(categoryKey)}`);
  }
  const url = validateImageUrl(imageUrl);
  const match = url.pathname.match(/\/Art\/2DItems\/(.+)$/i);
  const encodedSubpath = match
    ? match[1]
    : url.pathname.split('/').filter(Boolean).at(-1);
  if (!encodedSubpath) throw new Error(`Image URL has no filename: ${url.href}`);

  const segments = safePathSegments(encodedSubpath);
  const sub = segments.join('/');
  const dest = assertImageOutputPath(resolve(PUBLIC, categoryKey, ...segments));
  return { dest, sub, url: url.href };
}

export function validateLocalImagePath(value, categoryKey) {
  if (!CATEGORY_KEYS.has(categoryKey) || typeof value !== 'string') {
    throw new Error('Local image path requires a known category and string value');
  }
  if (
    value.includes('\\')
    || value.includes('?')
    || value.includes('#')
    || /%(?:2e|2f|5c)/i.test(value)
  ) {
    throw new Error(`Unsafe local image path: ${value}`);
  }
  const prefix = LOCAL_CATEGORY_PREFIXES[categoryKey]
    .find((candidate) => value.startsWith(candidate));
  if (!prefix) {
    throw new Error(`Local image path does not match ${categoryKey}: ${value}`);
  }
  safePathSegments(value.slice(prefix.length));
  return value;
}

export function localDest(imageUrl, categoryKey) {
  if (!imageUrl) return null;
  try {
    return resolveLocalImageDestination(imageUrl, categoryKey);
  } catch {
    return null;
  }
}

export async function collectImageBody(stream, maxBytes = MAX_IMAGE_BYTES) {
  if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('Image response body must be an async iterable');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_IMAGE_BYTES) {
    throw new RangeError(`Image limit must be between 1 and ${MAX_IMAGE_BYTES} bytes`);
  }

  const chunks = [];
  let total = 0;
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) {
      throw new RangeError(`Image response exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

function requestImage(url, referer, timeoutMs, maxBytes) {
  return new Promise((resolveRequest, rejectRequest) => {
    let settled = false;
    let hardTimer;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      callback(value);
    };

    const request = https.get(url, {
      headers: {
        Referer: referer,
        Accept: 'image/*',
        'User-Agent': 'CraftClassBot/0.1 (+local)',
      },
      timeout: timeoutMs,
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (REDIRECT_STATUSES.has(status)) {
        const location = response.headers.location;
        response.destroy();
        if (!location) {
          settle(rejectRequest, new Error(`Redirect with no Location: ${url.href}`));
          return;
        }
        settle(resolveRequest, { redirect: location });
        return;
      }
      if (status !== 200) {
        response.destroy();
        settle(rejectRequest, new Error(`HTTP ${status} for ${url.href}`));
        return;
      }

      const contentType = String(response.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
      if (contentType && !contentType.startsWith('image/')) {
        response.destroy();
        settle(rejectRequest, new Error(`Unexpected content type ${contentType} for ${url.href}`));
        return;
      }
      const declaredLength = Number(response.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        response.destroy();
        settle(rejectRequest, new RangeError(`Image exceeds ${maxBytes} bytes: ${url.href}`));
        return;
      }

      collectImageBody(response, maxBytes)
        .then((body) => settle(resolveRequest, { body }))
        .catch((error) => {
          response.destroy();
          settle(rejectRequest, error);
        });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Timeout fetching ${url.href} after ${timeoutMs}ms`));
    });
    request.on('error', (error) => settle(rejectRequest, error));
    hardTimer = setTimeout(() => {
      const error = new Error(`Timeout fetching ${url.href} after ${timeoutMs}ms`);
      settle(rejectRequest, error);
      request.destroy(error);
    }, timeoutMs);
  });
}

export async function downloadImage(
  value,
  dest,
  referer,
  {
    timeoutMs = IMAGE_REQUEST_TIMEOUT_MS,
    maxBytes = MAX_IMAGE_BYTES,
    maxRedirects = MAX_IMAGE_REDIRECTS,
    requestImpl = requestImage,
  } = {},
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > IMAGE_REQUEST_TIMEOUT_MS) {
    throw new RangeError(`Timeout must be between 1 and ${IMAGE_REQUEST_TIMEOUT_MS}ms`);
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_IMAGE_BYTES) {
    throw new RangeError(`Image limit must be between 1 and ${MAX_IMAGE_BYTES} bytes`);
  }
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > MAX_IMAGE_REDIRECTS) {
    throw new RangeError(`Redirect limit must be between 0 and ${MAX_IMAGE_REDIRECTS}`);
  }
  if (typeof requestImpl !== 'function') throw new TypeError('Image request implementation must be a function');

  const output = assertImageOutputPath(dest);
  const safeReferer = validatePoe2dbReferer(referer);
  let url = validateImageUrl(value);
  for (let redirectCount = 0; ; redirectCount++) {
    const result = await requestImpl(url, safeReferer, timeoutMs, maxBytes);
    if (!result || typeof result !== 'object') {
      throw new TypeError('Image request returned an invalid result');
    }
    if (result.redirect) {
      if (redirectCount >= maxRedirects) {
        throw new Error(`Too many redirects fetching ${url.href}`);
      }
      url = validateImageUrl(result.redirect, url);
      continue;
    }
    if (!Buffer.isBuffer(result.body) && !(result.body instanceof Uint8Array)) {
      throw new TypeError('Image request returned no response body');
    }
    if (result.body.byteLength > maxBytes) {
      throw new RangeError(`Image response exceeds ${maxBytes} bytes`);
    }

    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, result.body);
    return;
  }
}

export function toRelative(localResult) {
  // The dest is like ...\public\images\currency\Currency\AncientOrb.webp
  // We want /images/currency/Currency/AncientOrb.webp
  const norm = localResult.dest.replace(/\\/g, '/');
  const idx = norm.indexOf('public/images/');
  if (idx !== -1) {
    // /public/images/currency/Currency/AncientOrb.webp → /images/currency/Currency/AncientOrb.webp
    return '/images/' + norm.slice(idx + 'public/images/'.length);
  }
  const idx2 = norm.indexOf('images/');
  if (idx2 !== -1) return '/' + norm.slice(idx2);
  return '/images/' + localResult.sub;
}

export async function main() {
  let total = 0, skipped = 0, failed = 0;

  for (const cat of CATEGORIES) {
    const { processed: filePath } = resolveCategoryDataPaths(cat.file);
    if (!existsSync(filePath)) {
      throw new Error(`Required processed-data file not found: ${cat.file}`);
    }

    const items = JSON.parse(readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(items)) {
      throw new TypeError(`Required processed-data file is not an array: ${cat.file}`);
    }
    if (items.length > MAX_ITEMS_PER_CATEGORY) {
      throw new RangeError(
        `Refusing ${items.length} items from ${cat.file}; limit is ${MAX_ITEMS_PER_CATEGORY}`,
      );
    }

    console.log(`\n  ${cat.file} (${items.length} items) …`);

    // Build a list of items that need downloading
    const needDownload = [];
    let changed = false;
    let categoryFailures = 0;

    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const orig = item.imageUrl;
      if (typeof orig !== 'string' || !orig) continue;
      if (orig.startsWith('/images/')) {
        try {
          validateLocalImagePath(orig, cat.key);
        } catch (error) {
          failed++;
          categoryFailures++;
          console.warn(`  [SKIP] ${error.message}`);
        }
        continue;
      }

      const loc = localDest(orig, cat.key);
      if (!loc) {
        failed++;
        categoryFailures++;
        console.warn(`  [SKIP] Refusing non-allowlisted or unsafe image URL: ${String(orig)}`);
        continue;
      }

      const destPath = loc.dest;
      item.imageUrl = toRelative(loc);
      changed = true;

      if (existsSync(destPath)) {
        skipped++;
      } else {
        needDownload.push({ item, orig, destPath, referer: cat.referer });
      }
    }

    // Download with concurrency limit
    if (needDownload.length > 0) {
      console.log(`  Downloading ${needDownload.length} images (concurrency: ${MAX_CONCURRENT}) …`);
      const queue = [...needDownload];
      async function worker() {
        while (queue.length > 0) {
          const job = queue.shift();
          try {
            await downloadImage(job.orig, job.destPath, job.referer);
            total++;
            if (total % 25 === 0) console.log(`  … ${total} downloaded`);
          } catch (err) {
            failed++;
            categoryFailures++;
            console.error(`  [FAIL] ${err.message}`);
            // Restore original CDN URL
            job.item.imageUrl = job.orig;
          }
        }
      }
      const workers = Array.from({ length: Math.min(MAX_CONCURRENT, needDownload.length) }, () => worker());
      await Promise.all(workers);
    }

    assertCategoryDownloadSucceeded(cat.file, categoryFailures);
    if (changed) {
      syncCategoryData(cat.file, items);
      console.log(`  ✓ URLs localised` + (needDownload.length > 0 ? ` (${needDownload.length} new)` : ''));
    } else {
      console.log(`  (no changes)`);
    }
  }

  console.log(`\n  Done: ${total} downloaded, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) {
    console.error('  Some downloads failed — check the URLs or network');
  }
}

export function isDirectExecution(metaUrl, argvEntry = process.argv[1]) {
  if (!argvEntry) return false;
  return pathToFileURL(resolve(argvEntry)).href === metaUrl;
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
