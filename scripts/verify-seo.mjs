import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import yaml from 'js-yaml';
import { escapeHtml } from '../src/lib/safe-html.js';
import { serializeJsonForScript } from '../src/lib/safe-json.js';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SITE = new URL('https://exilecrafter.com/');
const POLICY_PATH = path.join(ROOT, 'seo-skill-policy.json');
const POLICY_ONLY = process.argv.includes('--policy-only');
const failures = [];
const EXPECTED_ORIGIN_ROBOTS = [
  'User-agent: *',
  'Allow: /',
  '',
  'Sitemap: https://exilecrafter.com/sitemap-index.xml',
].join('\n');

const expectedSkills = [
  'seo-audit',
  'seo-page',
  'seo-technical',
  'seo-content',
  'seo-schema',
  'seo-images',
  'seo-sitemap',
  'seo-geo',
  'seo-performance',
  'seo-visual',
  'seo-plan',
  'seo-programmatic',
  'seo-competitor-pages',
  'seo-hreflang',
  'seo-local',
  'seo-maps',
  'seo-google',
  'seo-backlinks',
  'seo-cluster',
  'seo-sxo',
  'seo-drift',
  'seo-ecommerce',
  'seo-firecrawl',
  'seo-dataforseo',
  'seo-image-gen',
  'seo-flow',
  'seo-intel',
  'seo-release-guard',
];

function fail(scope, message) {
  failures.push(`${scope}: ${message}`);
}

function expectThrow(scope, operation) {
  try {
    operation();
    fail(scope, 'malicious fixture was accepted');
  } catch {
    // Expected rejection.
  }
}

async function expectRejection(scope, operation) {
  try {
    await operation();
    fail(scope, 'malicious fixture was accepted');
  } catch {
    // Expected rejection.
  }
}

function normalizedText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function markdownAnchors(source) {
  const anchors = new Set(
    [...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]),
  );
  for (const match of source.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1]
      .replace(/[`*_~]/g, '')
      .toLocaleLowerCase('en')
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-');
    if (slug) anchors.add(slug);
  }
  return anchors;
}

function isExpectedOriginRobots(source) {
  return source.replace(/\r\n/g, '\n').trim() === EXPECTED_ORIGIN_ROBOTS;
}

function expectedPageRobots(route) {
  return route === '/404.html' || route === '/optimizer/'
    ? 'noindex,follow'
    : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1';
}

function hasExpectedPageRobots(route, value) {
  return value === expectedPageRobots(route);
}

function outputFailures() {
  if (failures.length === 0) return;

  console.error(`\nSEO verification failed with ${failures.length} issue(s):`);
  for (const issue of failures.slice(0, 50)) {
    console.error(`- ${issue}`);
  }
  if (failures.length > 50) {
    console.error(`- …and ${failures.length - 50} more`);
  }
  process.exitCode = 1;
}

async function checkUntrustedDataGuards() {
  const maliciousValue = {
    name: '</script><img id="seo-xss-fixture" src=x onerror=alert(1)>',
    separators: '<>&\u2028\u2029',
  };
  const serialized = serializeJsonForScript(maliciousValue);
  if (/<\/script/i.test(serialized) || /<img/i.test(serialized)) {
    fail('safe-json', 'serialized untrusted JSON still contains executable markup');
  }
  if (JSON.stringify(JSON.parse(serialized)) !== JSON.stringify(maliciousValue)) {
    fail('safe-json', 'safe serialization does not round-trip losslessly');
  }

  const fixture = load(
    `<script type="application/json" id="fixture">${serialized}</script>`,
  );
  if (fixture('#seo-xss-fixture').length !== 0) {
    fail('safe-json', 'malicious </script> fixture escaped into the DOM');
  }
  try {
    JSON.parse(fixture('#fixture').html() ?? '');
  } catch (error) {
    fail('safe-json', `inline JSON fixture is not parseable: ${error.message}`);
  }

  const maliciousHtml = 'x" onerror="alert(1)"><img id="html-xss-fixture" src=x>';
  const escapedHtml = escapeHtml(maliciousHtml);
  const attributeFixture = load(`<img id="target" src="${escapedHtml}">`);
  if (
    attributeFixture('#target').attr('src') !== maliciousHtml
    || attributeFixture('#target').attr('onerror') !== undefined
    || attributeFixture('#html-xss-fixture').length !== 0
  ) {
    fail('safe-html', 'malicious attribute fixture escaped its quoted attribute');
  }
  const textFixture = load(`<div id="target">${escapedHtml}</div>`);
  if (
    textFixture('#target').text() !== maliciousHtml
    || textFixture('#html-xss-fixture').length !== 0
  ) {
    fail('safe-html', 'malicious text fixture escaped into the DOM');
  }
  const blockingRobotsFixture = [
    'User-agent: *',
    'Disallow: /',
    '',
    'Sitemap: https://exilecrafter.com/sitemap-index.xml',
  ].join('\n');
  if (isExpectedOriginRobots(blockingRobotsFixture)) {
    fail('robots.txt', 'a sitewide Disallow fixture bypassed the origin policy guard');
  }
  if (hasExpectedPageRobots('/', 'index,nofollow')) {
    fail('robots meta', 'an index,nofollow fixture bypassed the page policy guard');
  }

  const [simulatorSource, optimizerSource, calculatorSource] = await Promise.all([
    readFile(path.join(ROOT, 'src/pages/simulator.astro'), 'utf8'),
    readFile(path.join(ROOT, 'src/pages/optimizer.astro'), 'utf8'),
    readFile(path.join(ROOT, 'src/pages/calculator.astro'), 'utf8'),
  ]);
  if (!simulatorSource.includes('serializeJsonForScript(baseOptions)')) {
    fail('simulator', 'external base data must use the safe inline JSON serializer');
  }
  if (optimizerSource.includes('detectedBase.innerHTML')) {
    fail('optimizer', 'external base names must not be assigned through innerHTML');
  }
  const unsafeSourcePatterns = [
    [simulatorSource, 'src="${o.imageUrl}"', 'simulator omen image URL'],
    [simulatorSource, 'src="${c.imageUrl}"', 'simulator currency image URL'],
    [simulatorSource, '${s.currencyName}', 'simulator currency history name'],
    [calculatorSource, 'data-mod-id="${m.id}"', 'calculator modifier ID attribute'],
    [calculatorSource, 'CSS.escape(m.id)', 'calculator HTML attribute ID'],
  ];
  for (const [source, pattern, scope] of unsafeSourcePatterns) {
    if (source.includes(pattern)) {
      fail(scope, `untrusted-data sink is not escaped: ${pattern}`);
    }
  }
}

async function checkExternalRefreshGuards() {
  const pageGuards = await import('./fetch-poe2db.mjs');
  const imageGuards = await import('./download-images.mjs');
  const processGuards = await import('./process-data.mjs');

  if (pageGuards.normalizeListingSlug('/us/Exalted_Orb#details') !== 'Exalted_Orb') {
    fail('poe2db page guard', 'valid same-origin listing slug was not normalized');
  }
  for (const value of [
    'https://example.com/us/Exalted_Orb',
    'http://poe2db.tw/us/Exalted_Orb',
    '../../../../tmp/poison',
    '/us/%2e%2e%2fpoison',
    '/us/Exalted_Orb?next=https://example.com',
    '//127.0.0.1/us/Exalted_Orb',
  ]) {
    if (pageGuards.normalizeListingSlug(value) !== null) {
      fail('poe2db page guard', `unsafe listing value was accepted: ${value}`);
    }
  }
  if (
    imageGuards.validateLocalImagePath('/images/base/example.webp', 'bases')
    !== '/images/base/example.webp'
  ) {
    fail('poe2db local image guard', 'valid category-local image path did not round-trip');
  }
  for (const value of [
    '/images/base/../../secret',
    '/images/base/%2e%2e%2fsecret',
    './../../../secret',
    '/images/omens/wrong-category.webp',
  ]) {
    expectThrow(
      'poe2db local image guard',
      () => imageGuards.validateLocalImagePath(value, 'bases'),
    );
  }
  expectThrow(
    'poe2db raw path guard',
    () => pageGuards.resolveRawGroupFile('currency', '../../../../tmp/poison'),
  );
  expectThrow(
    'poe2db group bound',
    () => pageGuards.boundedUniqueSlugs(
      Array.from({ length: pageGuards.MAX_GROUP_ITEMS + 1 }, () => 'Exalted_Orb'),
    ),
  );
  expectThrow(
    'poe2db partial failure',
    () => pageGuards.assertNoFetchFailures('currency', [
      { slug: 'Exalted_Orb', error: 'fixture failure' },
    ]),
  );

  const listingFixture = `
    <a href="/us/Exalted_Orb"><img src="/image/Art/2DItems/Currency/Exalted.webp"></a>
    <a href="../../../../tmp/poison"><img src="/image/Art/2DItems/Currency/Bad.webp"></a>
    <a href="https://example.com/us/Bad"><img src="/image/Art/2DItems/Currency/Bad.webp"></a>
  `;
  const discovered = pageGuards.discoverFromListing(listingFixture);
  if (discovered.length !== 1 || discovered[0] !== 'Exalted_Orb') {
    fail('poe2db listing guard', `unexpected discovered slugs: ${discovered.join(', ')}`);
  }
  expectThrow(
    'poe2db listing byte bound',
    () => pageGuards.discoverFromListing(
      'x'.repeat(pageGuards.MAX_RESPONSE_BYTES + 1),
    ),
  );

  const okHtml = await pageGuards.fetchPage('https://poe2db.tw/us/Exalted_Orb', {
    fetchImpl: async () => new Response('<html>ok</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
    timeoutMs: 50,
    maxBytes: 1_024,
  });
  if (okHtml !== '<html>ok</html>') {
    fail('poe2db response guard', 'valid bounded HTML did not round-trip');
  }
  await expectRejection(
    'poe2db redirect host guard',
    () => pageGuards.fetchPage('https://poe2db.tw/us/Exalted_Orb', {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      }),
      timeoutMs: 50,
      maxBytes: 1_024,
    }),
  );
  await expectRejection(
    'poe2db redirect bound',
    () => pageGuards.fetchPage('https://poe2db.tw/us/Exalted_Orb', {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: '/us/Exalted_Orb' },
      }),
      timeoutMs: 50,
      maxBytes: 1_024,
      maxRedirects: 1,
    }),
  );
  await expectRejection(
    'poe2db response byte bound',
    () => pageGuards.fetchPage('https://poe2db.tw/us/Exalted_Orb', {
      fetchImpl: async () => new Response('x', {
        status: 200,
        headers: { 'content-length': '2048' },
      }),
      timeoutMs: 50,
      maxBytes: 1_024,
    }),
  );
  await expectRejection(
    'poe2db request deadline',
    () => pageGuards.fetchPage('https://poe2db.tw/us/Exalted_Orb', {
      fetchImpl: async () => await new Promise(() => {}),
      timeoutMs: 5,
      maxBytes: 1_024,
    }),
  );

  const validImage = 'https://cdn.poe2db.tw/image/Art/2DItems/Currency/Exalted.webp';
  if (imageGuards.validateImageUrl(validImage).href !== validImage) {
    fail('poe2db image guard', 'valid allowlisted image URL did not round-trip');
  }
  for (const value of [
    'http://cdn.poe2db.tw/image/x.webp',
    'https://example.com/image/x.webp',
    'https://127.0.0.1/image/x.webp',
    'https://cdn.poe2db.tw/image/%2e%2e%2fsecret',
    'https://user:pass@cdn.poe2db.tw/image/x.webp',
  ]) {
    expectThrow('poe2db image host guard', () => imageGuards.validateImageUrl(value));
  }
  expectThrow(
    'poe2db image output path guard',
    () => imageGuards.resolveLocalImageDestination(validImage, '../../../../tmp'),
  );
  expectThrow(
    'poe2db data output path guard',
    () => imageGuards.resolveCategoryDataPaths('../../../../tmp/poison.json'),
  );
  expectThrow(
    'poe2db image item bound',
    () => imageGuards.serializeCategoryItems(
      Array.from({ length: imageGuards.MAX_ITEMS_PER_CATEGORY + 1 }, () => ({})),
    ),
  );
  expectThrow(
    'poe2db image partial failure',
    () => imageGuards.assertCategoryDownloadSucceeded('bases.json', 1),
  );

  async function* boundedImageFixture() {
    yield Buffer.alloc(3);
    yield Buffer.alloc(3);
  }
  await expectRejection(
    'poe2db image response byte bound',
    () => imageGuards.collectImageBody(boundedImageFixture(), 5),
  );
  const imageOutputFixture = path.join(ROOT, 'public/images/security-fixture.webp');
  await expectRejection(
    'poe2db image redirect host guard',
    () => imageGuards.downloadImage(
      validImage,
      imageOutputFixture,
      'https://poe2db.tw/us/',
      {
        maxBytes: 16,
        maxRedirects: 1,
        requestImpl: async () => ({ redirect: 'http://127.0.0.1/private' }),
      },
    ),
  );
  await expectRejection(
    'poe2db image redirect bound',
    () => imageGuards.downloadImage(
      validImage,
      imageOutputFixture,
      'https://poe2db.tw/us/',
      {
        maxBytes: 16,
        maxRedirects: 1,
        requestImpl: async () => ({ redirect: validImage }),
      },
    ),
  );
  await expectRejection(
    'poe2db image returned-body bound',
    () => imageGuards.downloadImage(
      validImage,
      imageOutputFixture,
      'https://poe2db.tw/us/',
      {
        maxBytes: 2,
        requestImpl: async () => ({ body: Buffer.alloc(3) }),
      },
    ),
  );

  const currentManifest = JSON.parse(
    await readFile(path.join(ROOT, 'data/processed/manifest.json'), 'utf8'),
  );
  const currentCounts = currentManifest.counts;
  processGuards.assertProcessedDataQuality({
    season: currentManifest.season,
    counts: currentCounts,
    previousCounts: currentCounts,
    parseFailures: [],
  });
  expectThrow(
    'poe2db parser partial-failure guard',
    () => processGuards.assertProcessedDataQuality({
      season: currentManifest.season,
      counts: currentCounts,
      previousCounts: currentCounts,
      parseFailures: [{ file: 'base_fixture.html', error: new Error('fixture') }],
    }),
  );
  expectThrow(
    'poe2db season guard',
    () => processGuards.assertProcessedDataQuality({
      season: { id: 'unknown', name: 'Unknown', version: '0.0.0' },
      counts: currentCounts,
      previousCounts: currentCounts,
      parseFailures: [],
    }),
  );
  for (const counts of [
    { ...currentCounts, bases: 10 },
    { ...currentCounts, mods: currentCounts.mods * 2 },
  ]) {
    expectThrow(
      'poe2db dataset drift guard',
      () => processGuards.assertProcessedDataQuality({
        season: currentManifest.season,
        counts,
        previousCounts: currentCounts,
        parseFailures: [],
      }),
    );
  }
}

async function checkPolicy() {
  let policy;
  try {
    policy = JSON.parse(await readFile(POLICY_PATH, 'utf8'));
  } catch (error) {
    fail('seo-skill-policy.json', `cannot be parsed: ${error.message}`);
    return;
  }

  if (policy.version !== 1) {
    fail('seo-skill-policy.json', 'version must be 1');
  }
  if (policy.site !== SITE.origin) {
    fail('seo-skill-policy.json', `site must be ${SITE.origin}`);
  }
  if (!Array.isArray(policy.coverage)) {
    fail('seo-skill-policy.json', 'coverage must be an array');
    return;
  }

  const allowedClassifications = new Set(['required', 'conditional', 'not_applicable']);
  const seen = new Set();
  for (const entry of policy.coverage) {
    const scope = `seo-skill-policy.json#${entry?.skill ?? 'unknown'}`;
    if (!entry || typeof entry.skill !== 'string') {
      fail(scope, 'skill must be a string');
      continue;
    }
    if (seen.has(entry.skill)) {
      fail(scope, 'skill is listed more than once');
    }
    seen.add(entry.skill);
    if (!allowedClassifications.has(entry.classification)) {
      fail(scope, 'classification must be required, conditional, or not_applicable');
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length < 20) {
      fail(scope, 'reason must explain the classification');
    }
    if (typeof entry.evidence !== 'string' || entry.evidence.trim() === '') {
      fail(scope, 'evidence must reference a repository artifact');
      continue;
    }

    const [evidenceFile, evidenceAnchor] = entry.evidence.split('#');
    try {
      const evidenceSource = await readFile(path.join(ROOT, evidenceFile), 'utf8');
      if (evidenceAnchor && !markdownAnchors(evidenceSource).has(evidenceAnchor)) {
        fail(scope, `evidence anchor does not exist: #${evidenceAnchor}`);
      }
    } catch {
      fail(scope, `evidence file does not exist: ${evidenceFile}`);
    }
  }

  for (const skill of expectedSkills) {
    if (!seen.has(skill)) {
      fail('seo-skill-policy.json', `missing coverage decision for ${skill}`);
    }
  }
  for (const skill of seen) {
    if (!expectedSkills.includes(skill)) {
      fail('seo-skill-policy.json', `unexpected skill entry: ${skill}`);
    }
  }

  if (seen.size !== expectedSkills.length) {
    fail(
      'seo-skill-policy.json',
      `expected ${expectedSkills.length} unique skill decisions, found ${seen.size}`,
    );
  }
}

function workflowSteps(workflow, jobName) {
  const steps = workflow?.jobs?.[jobName]?.steps;
  return Array.isArray(steps) ? steps : [];
}

function exactCommandIndex(steps, command) {
  return steps.findIndex((step) => typeof step?.run === 'string' && step.run.trim() === command);
}

function executableLines(script) {
  return script
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function deployWorkflowErrors(workflow) {
  const errors = [];
  const triggers = Object.keys(workflow?.on ?? {}).sort();
  if (triggers.length !== 1 || triggers[0] !== 'push') {
    errors.push('production deploy must be triggered only by a push');
  }
  const branches = workflow?.on?.push?.branches;
  if (!Array.isArray(branches) || branches.length !== 1 || branches[0] !== 'main') {
    errors.push('production deploy push trigger must be restricted to main');
  }
  const steps = workflowSteps(workflow, 'deploy');
  if (workflow?.jobs?.deploy?.if !== "vars.PRODUCTION_RELEASE_GUARD_CONFIGURED == 'true'") {
    errors.push('production deploy must remain disabled until owner guard configuration is acknowledged');
  }
  if (
    workflow?.jobs?.deploy?.environment?.name !== 'production'
    || workflow?.jobs?.deploy?.environment?.url !== 'https://exilecrafter.com'
  ) {
    errors.push('production deploy must target the named production environment');
  }
  const checkIndex = exactCommandIndex(steps, 'npm run check');
  const publishIndex = steps.findIndex((step) => step?.uses === 'cloudflare/pages-action@v1');
  if (steps.some((step) => typeof step?.run === 'string' && /\bnpm run refresh\b/.test(step.run))) {
    errors.push('production deploy must not refresh data from the network');
  }
  if (checkIndex < 0 || publishIndex < 0 || checkIndex > publishIndex) {
    errors.push('an exact npm run check step must precede the Cloudflare publish action');
  }
  return errors;
}

function refreshWorkflowErrors(workflow) {
  const errors = [];
  const triggers = Object.keys(workflow?.on ?? {}).sort();
  if (triggers.length !== 1 || triggers[0] !== 'schedule') {
    errors.push('external refresh must be schedule-only');
  }
  if (
    workflow?.jobs?.refresh?.permissions?.contents !== 'write'
    || workflow?.jobs?.refresh?.permissions?.['pull-requests'] !== 'write'
  ) {
    errors.push('refresh permissions must be explicit for branch and PR creation');
  }
  const steps = workflowSteps(workflow, 'refresh');
  const refreshIndex = exactCommandIndex(steps, 'npm run refresh');
  const checkIndex = exactCommandIndex(steps, 'npm run check');
  const proposalIndex = steps.findIndex((step) => step?.name === 'Propose updated data for review');
  if (
    refreshIndex < 0
    || checkIndex < 0
    || proposalIndex < 0
    || refreshIndex > checkIndex
    || checkIndex > proposalIndex
  ) {
    errors.push('refresh, exact gate, and review proposal steps are missing or out of order');
  }
  const proposal = steps[proposalIndex];
  if (proposal?.env?.GH_TOKEN !== '${{ github.token }}') {
    errors.push('review proposal must use the scoped workflow token');
  }
  const lines = executableLines(typeof proposal?.run === 'string' ? proposal.run : '');
  for (const requiredLine of [
    'git add data/processed/ public/data/ public/images/',
    'branch="automation/poe2db-refresh-${GITHUB_RUN_ID}"',
    'git switch -c "$branch"',
    'git commit -m "chore(data): weekly poe2db refresh"',
    'git push origin "$branch"',
    'gh pr create \\',
  ]) {
    if (!lines.includes(requiredLine)) {
      errors.push(`review proposal is missing exact command: ${requiredLine}`);
    }
  }
  return errors;
}

function qualityWorkflowErrors(workflow) {
  const errors = [];
  if (!Object.hasOwn(workflow?.on ?? {}, 'pull_request')) {
    errors.push('quality workflow must run on pull requests');
  }
  if (exactCommandIndex(workflowSteps(workflow, 'check'), 'npm run check') < 0) {
    errors.push('quality workflow must contain an exact npm run check step');
  }
  return errors;
}

async function checkWorkflowGuards() {
  const [deploySource, refreshSource, qualitySource] = await Promise.all([
    readFile(path.join(ROOT, '.github/workflows/deploy.yml'), 'utf8'),
    readFile(path.join(ROOT, '.github/workflows/refresh.yml'), 'utf8'),
    readFile(path.join(ROOT, '.github/workflows/quality.yml'), 'utf8'),
  ]);
  let deploy;
  let refresh;
  let quality;
  try {
    deploy = yaml.load(deploySource);
    refresh = yaml.load(refreshSource);
    quality = yaml.load(qualitySource);
  } catch (error) {
    fail('workflow YAML', `cannot be parsed: ${error.message}`);
    return;
  }
  for (const error of deployWorkflowErrors(deploy)) {
    fail('deploy workflow', error);
  }
  for (const error of refreshWorkflowErrors(refresh)) {
    fail('refresh workflow', error);
  }
  for (const error of qualityWorkflowErrors(quality)) {
    fail('quality workflow', error);
  }

  const decoyDeploy = {
    on: { push: { branches: ['main'] } },
    jobs: {
      deploy: {
        steps: [
          { run: 'echo "npm run check"' },
          { uses: 'cloudflare/pages-action@v1' },
        ],
      },
    },
  };
  if (deployWorkflowErrors(decoyDeploy).length === 0) {
    fail('deploy workflow', 'an echo/comment decoy bypassed structural workflow validation');
  }
}

async function checkClientDataParity() {
  const filenames = [
    'bases.json',
    'mods.json',
    'currency.json',
    'omens.json',
    'weights.json',
    'season.json',
    'manifest.json',
  ];
  for (const filename of filenames) {
    const [processed, client] = await Promise.all([
      readFile(path.join(ROOT, 'data/processed', filename)),
      readFile(path.join(ROOT, 'public/data', filename)),
    ]);
    if (!processed.equals(client)) {
      fail(
        `public/data/${filename}`,
        `must be byte-identical to data/processed/${filename}`,
      );
    }
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(target));
    } else {
      files.push(target);
    }
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

function metaContent($, attribute, value) {
  return $(`meta[${attribute}="${value}"]`).map((_, element) => {
    return $(element).attr('content')?.trim() ?? '';
  }).get();
}

function expectMetaValues({ $, route, attribute, name, expected }) {
  const values = metaContent($, attribute, name);
  if (values.length !== 1 || values[0] === '') {
    fail(route, `expected one non-empty ${name} meta tag`);
    return '';
  }
  if (expected !== undefined && values[0] !== expected) {
    fail(route, `${name} mismatch: ${values[0]} !== ${expected}`);
  }
  return values[0];
}

function collectSchemaUrls(value, urls = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaUrls(item, urls);
    return urls;
  }
  if (!value || typeof value !== 'object') return urls;

  for (const [key, child] of Object.entries(value)) {
    if (['url', 'item', '@id'].includes(key) && typeof child === 'string') {
      urls.push(child);
    } else {
      collectSchemaUrls(child, urls);
    }
  }
  return urls;
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('not a JPEG file');
  }

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset + 2);
    if (startOfFrameMarkers.has(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    if (length < 2) throw new Error('invalid JPEG marker length');
    offset += length + 2;
  }
  throw new Error('JPEG dimensions were not found');
}

function inspectInternalLinks($, route) {
  const targets = new Set();
  for (const element of $('a[href]').toArray()) {
    const href = $(element).attr('href')?.trim() ?? '';
    if (
      href === ''
      || href.startsWith('#')
      || /^(?:mailto|tel|javascript|data):/i.test(href)
    ) {
      continue;
    }

    let target;
    try {
      target = new URL(href, new URL(route, SITE));
    } catch {
      fail(route, `invalid link URL: ${href}`);
      continue;
    }
    if (target.origin !== SITE.origin) continue;

    const lastSegment = target.pathname.split('/').filter(Boolean).at(-1) ?? '';
    const isFile = /\.[a-z0-9]{1,8}$/i.test(lastSegment);
    const isApi = target.pathname === '/api' || target.pathname.startsWith('/api/');
    if (!isFile && !isApi) {
      targets.add(`${target.origin}${target.pathname}`);
    }
    if (
      target.pathname !== '/'
      && !target.pathname.endsWith('/')
      && !isFile
      && !isApi
    ) {
      fail(route, `internal page link is not trailing-slash normalized: ${href}`);
    }
  }
  return targets;
}

async function inspectRenderedOutput() {
  try {
    await access(DIST);
  } catch {
    fail('dist', 'missing rendered output; run npm run build first');
    return null;
  }

  const htmlFiles = (await walk(DIST))
    .filter((file) => file.endsWith('.html'))
    .sort();
  if (htmlFiles.length === 0) {
    fail('dist', 'contains no HTML files');
    return null;
  }

  const pages = [];
  let schemaPages = 0;
  let schemaBlocks = 0;
  let websiteSchemas = 0;
  let breadcrumbSchemas = 0;
  let longTitles = 0;
  let images = 0;
  let imagesWithoutDimensions = 0;

  for (const file of htmlFiles) {
    const route = routeFromFile(file);
    const $ = load(await readFile(file, 'utf8'));
    const titles = $('title').map((_, element) => normalizedText($(element).text())).get();
    const descriptions = metaContent($, 'name', 'description');
    const robots = metaContent($, 'name', 'robots');
    const canonicals = $('link[rel="canonical"]').map((_, element) => {
      return $(element).attr('href')?.trim() ?? '';
    }).get();

    if (titles.length !== 1 || titles[0] === '') {
      fail(route, `expected one non-empty title, found ${titles.length}`);
    }
    if (titles[0]?.length > 60) longTitles += 1;
    if (descriptions.length !== 1 || descriptions[0] === '') {
      fail(route, `expected one non-empty meta description, found ${descriptions.length}`);
    } else if (descriptions[0].length > 160) {
      fail(route, `meta description is ${descriptions[0].length} characters`);
    }
    if (robots.length !== 1 || robots[0] === '') {
      fail(route, `expected one non-empty robots meta tag, found ${robots.length}`);
    } else if (!hasExpectedPageRobots(route, robots[0])) {
      fail(route, `robots meta must be exactly ${expectedPageRobots(route)}`);
    }
    if ($('h1').length !== 1) {
      fail(route, `expected one h1, found ${$('h1').length}`);
    }
    if ($('main').length !== 1) {
      fail(route, `expected one main landmark, found ${$('main').length}`);
    }

    const isNoindex = robots.some((value) => /(?:^|,)\s*noindex(?:,|$)/i.test(value));
    const expectedCanonical = new URL(route, SITE).toString();
    if (!isNoindex && canonicals.length !== 1) {
      fail(route, `indexable page must have one canonical, found ${canonicals.length}`);
    }
    if (canonicals.length > 1) {
      fail(route, `expected at most one canonical, found ${canonicals.length}`);
    }
    if (canonicals[0] && canonicals[0] !== expectedCanonical) {
      fail(route, `canonical mismatch: ${canonicals[0]} !== ${expectedCanonical}`);
    }
    if (canonicals[0] && !canonicals[0].startsWith('https://')) {
      fail(route, `canonical must use HTTPS: ${canonicals[0]}`);
    }

    const expectedSocialImage = `${SITE.origin}/og-exile-crafter.jpg`;
    const ogTitle = expectMetaValues({
      $, route, attribute: 'property', name: 'og:title', expected: titles[0],
    });
    const ogDescription = expectMetaValues({
      $, route, attribute: 'property', name: 'og:description', expected: descriptions[0],
    });
    expectMetaValues({
      $, route, attribute: 'property', name: 'og:site_name', expected: 'Exile Crafter',
    });
    expectMetaValues({
      $, route, attribute: 'property', name: 'og:type', expected: 'website',
    });
    expectMetaValues({
      $, route, attribute: 'property', name: 'og:image', expected: expectedSocialImage,
    });
    expectMetaValues({
      $, route, attribute: 'property', name: 'og:image:secure_url', expected: expectedSocialImage,
    });
    expectMetaValues({
      $, route, attribute: 'property', name: 'og:image:type', expected: 'image/jpeg',
    });
    expectMetaValues({
      $, route, attribute: 'property', name: 'og:image:width', expected: '1200',
    });
    expectMetaValues({
      $, route, attribute: 'property', name: 'og:image:height', expected: '630',
    });
    const ogImageAlt = expectMetaValues({
      $, route, attribute: 'property', name: 'og:image:alt',
    });
    expectMetaValues({
      $, route, attribute: 'name', name: 'twitter:card', expected: 'summary_large_image',
    });
    expectMetaValues({
      $, route, attribute: 'name', name: 'twitter:title', expected: ogTitle,
    });
    expectMetaValues({
      $, route, attribute: 'name', name: 'twitter:description', expected: ogDescription,
    });
    expectMetaValues({
      $, route, attribute: 'name', name: 'twitter:image', expected: expectedSocialImage,
    });
    expectMetaValues({
      $, route, attribute: 'name', name: 'twitter:image:alt', expected: ogImageAlt,
    });
    const ogUrls = metaContent($, 'property', 'og:url');
    if (canonicals.length === 1 && (ogUrls.length !== 1 || ogUrls[0] !== canonicals[0])) {
      fail(route, 'og:url must exist once and match the canonical');
    }
    if (canonicals.length === 0 && ogUrls.length !== 0) {
      fail(route, 'og:url must be omitted when the page has no canonical');
    }
    const scripts = $('script[type="application/ld+json"]').toArray();
    let pageWebsiteSchemas = 0;
    let pageBreadcrumbSchemas = 0;
    if (scripts.length > 0) schemaPages += 1;
    schemaBlocks += scripts.length;
    for (const script of scripts) {
      let schema;
      try {
        schema = JSON.parse($(script).html() ?? '');
      } catch (error) {
        fail(route, `invalid JSON-LD: ${error.message}`);
        continue;
      }
      if (schema['@context'] !== 'https://schema.org') {
        fail(route, 'JSON-LD @context must be https://schema.org');
      }
      if (typeof schema['@type'] !== 'string' || schema['@type'] === '') {
        fail(route, 'JSON-LD must have a non-empty @type');
      }
      for (const value of collectSchemaUrls(schema)) {
        let url;
        try {
          url = new URL(value);
        } catch {
          fail(route, `schema URL is not absolute: ${value}`);
          continue;
        }
        if (url.protocol !== 'https:') {
          fail(route, `schema URL must use HTTPS: ${value}`);
        }
      }

      if (schema['@type'] === 'WebSite') {
        websiteSchemas += 1;
        pageWebsiteSchemas += 1;
        if (
          route !== '/'
          || schema.url !== `${SITE.origin}/`
          || schema.name !== 'Exile Crafter'
          || schema['@id'] !== `${SITE.origin}/#website`
          || schema.inLanguage !== 'en'
        ) {
          fail(route, 'WebSite schema does not match the canonical site entity');
        }
      } else if (schema['@type'] === 'BreadcrumbList') {
        breadcrumbSchemas += 1;
        pageBreadcrumbSchemas += 1;
        const list = schema.itemListElement;
        const collectionUrl = route.startsWith('/bases/')
          ? `${SITE.origin}/bases/`
          : route.startsWith('/mods/')
            ? `${SITE.origin}/mods/`
            : null;
        if (!collectionUrl || !Array.isArray(list) || list.length !== 2) {
          fail(route, 'BreadcrumbList must have exactly two items on a detail route');
        } else {
          const [collection, current] = list;
          if (
            collection?.['@type'] !== 'ListItem'
            || collection?.position !== 1
            || typeof collection?.name !== 'string'
            || collection.name.trim() === ''
            || collection?.item !== collectionUrl
          ) {
            fail(route, 'BreadcrumbList collection item is invalid');
          }
          if (
            current?.['@type'] !== 'ListItem'
            || current?.position !== 2
            || typeof current?.name !== 'string'
            || current.name.trim() === ''
            || current?.item !== expectedCanonical
            || schema['@id'] !== `${expectedCanonical}#breadcrumb`
          ) {
            fail(route, 'BreadcrumbList current-page item is invalid');
          }
        }
      } else {
        fail(route, `unsupported JSON-LD type: ${schema['@type']}`);
      }
    }

    const isDetailRoute = /^\/(?:bases|mods)\/[^/]+\/$/.test(route);
    const expectedPageBreadcrumbs = isDetailRoute ? 1 : 0;
    if (pageBreadcrumbSchemas !== expectedPageBreadcrumbs) {
      fail(
        route,
        `expected ${expectedPageBreadcrumbs} BreadcrumbList schema, found ${pageBreadcrumbSchemas}`,
      );
    }
    const expectedPageWebsites = route === '/' ? 1 : 0;
    if (pageWebsiteSchemas !== expectedPageWebsites) {
      fail(route, `expected ${expectedPageWebsites} WebSite schema, found ${pageWebsiteSchemas}`);
    }

    const internalLinks = inspectInternalLinks($, route);
    const pageImages = $('img').toArray();
    images += pageImages.length;
    imagesWithoutDimensions += pageImages.filter((element) => {
      return !$(element).attr('width') || !$(element).attr('height');
    }).length;

    pages.push({
      route,
      title: titles[0] ?? '',
      description: descriptions[0] ?? '',
      canonical: canonicals[0] ?? null,
      isNoindex,
      internalLinks,
    });
  }

  let basesData = [];
  let modsData = [];
  let manifest = {};
  try {
    [basesData, modsData, manifest] = await Promise.all([
      readFile(path.join(ROOT, 'data/processed/bases.json'), 'utf8').then(JSON.parse),
      readFile(path.join(ROOT, 'data/processed/mods.json'), 'utf8').then(JSON.parse),
      readFile(path.join(ROOT, 'data/processed/manifest.json'), 'utf8').then(JSON.parse),
    ]);
  } catch (error) {
    fail('route coverage', `processed data cannot be parsed: ${error.message}`);
  }
  if (manifest.counts?.bases !== basesData.length) {
    fail(
      'route coverage',
      `manifest base count ${manifest.counts?.bases} !== data length ${basesData.length}`,
    );
  }
  if (manifest.counts?.mods !== modsData.length) {
    fail(
      'route coverage',
      `manifest mod count ${manifest.counts?.mods} !== data length ${modsData.length}`,
    );
  }
  const countDescriptions = [
    ['/bases/', basesData.length],
    ['/mods/', modsData.length],
    ['/currency/', manifest.counts?.currency],
    ['/omens/', manifest.counts?.omens],
  ];
  for (const [route, count] of countDescriptions) {
    const page = pages.find((candidate) => candidate.route === route);
    const formattedCount = Number(count).toLocaleString('en-US');
    if (!Number.isInteger(count) || !page?.description.includes(formattedCount)) {
      fail(
        route,
        `meta description must include the current processed-data count ${formattedCount}`,
      );
    }
  }
  if (websiteSchemas !== 1) {
    fail('structured data', `expected one WebSite schema, found ${websiteSchemas}`);
  }
  if (breadcrumbSchemas !== basesData.length + modsData.length) {
    fail(
      'structured data',
      `expected ${basesData.length + modsData.length} BreadcrumbList schemas, found ${breadcrumbSchemas}`,
    );
  }

  const expectedRoutes = new Set([
    '/',
    '/404.html',
    '/bases/',
    '/calculator/',
    '/currency/',
    '/guides/',
    '/mods/',
    '/omens/',
    '/optimizer/',
    '/simulator/',
    ...basesData.map((base) => `/bases/${base.id}/`),
    ...modsData.map((mod) => `/mods/${mod.id}/`),
  ]);
  const renderedRoutes = new Set(pages.map((page) => page.route));
  if (expectedRoutes.size !== basesData.length + modsData.length + 10) {
    fail('route coverage', 'processed IDs are duplicated or collide with fixed routes');
  }
  for (const route of expectedRoutes) {
    if (!renderedRoutes.has(route)) {
      fail('route coverage', `missing generated route: ${route}`);
    }
  }
  for (const route of renderedRoutes) {
    if (!expectedRoutes.has(route)) {
      fail('route coverage', `unexpected generated route: ${route}`);
    }
  }

  const indexable = pages.filter((page) => !page.isNoindex);
  const titleGroups = new Map();
  const canonicalGroups = new Map();
  for (const page of indexable) {
    const titleKey = page.title.toLocaleLowerCase('en');
    titleGroups.set(titleKey, [...(titleGroups.get(titleKey) ?? []), page.route]);
    if (page.canonical) {
      canonicalGroups.set(
        page.canonical,
        [...(canonicalGroups.get(page.canonical) ?? []), page.route],
      );
    }
  }
  for (const [title, routes] of titleGroups) {
    if (routes.length > 1) {
      fail('titles', `duplicate "${title}" on ${routes.slice(0, 4).join(', ')}`);
    }
  }
  for (const [canonical, routes] of canonicalGroups) {
    if (routes.length > 1) {
      fail('canonicals', `duplicate ${canonical} on ${routes.join(', ')}`);
    }
  }

  const inlinks = new Map(indexable.map((page) => [page.canonical, 0]));
  for (const page of pages) {
    for (const target of page.internalLinks) {
      const canonicalTarget = target === SITE.origin ? `${SITE.origin}/` : target;
      if (canonicalTarget !== page.canonical && inlinks.has(canonicalTarget)) {
        inlinks.set(canonicalTarget, inlinks.get(canonicalTarget) + 1);
      }
    }
  }
  const zeroInlinkPages = [...inlinks.entries()]
    .filter(([canonical, count]) => canonical !== `${SITE.origin}/` && count === 0)
    .map(([canonical]) => canonical);
  const renderedPageUrls = new Set(
    pages.map((page) => `${SITE.origin}${page.route === '/' ? '/' : page.route}`),
  );
  for (const page of pages) {
    for (const target of page.internalLinks) {
      const pageTarget = target === SITE.origin ? `${SITE.origin}/` : target;
      if (!renderedPageUrls.has(pageTarget)) {
        fail(page.route, `internal page link target does not exist: ${pageTarget}`);
      }
    }
  }

  let sitemapXml = '';
  let sitemapIndexXml = '';
  try {
    [sitemapXml, sitemapIndexXml] = await Promise.all([
      readFile(path.join(DIST, 'sitemap-0.xml'), 'utf8'),
      readFile(path.join(DIST, 'sitemap-index.xml'), 'utf8'),
    ]);
  } catch (error) {
    fail('sitemap', `missing sitemap output: ${error.message}`);
  }

  if (!sitemapIndexXml.includes(`${SITE.origin}/sitemap-0.xml`)) {
    fail('sitemap-index.xml', 'does not reference the generated sitemap');
  }
  const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1]);
  const sitemapSet = new Set(sitemapUrls);
  if (sitemapSet.size !== sitemapUrls.length) {
    fail('sitemap-0.xml', 'contains duplicate URLs');
  }
  for (const url of sitemapUrls) {
    if (!url.startsWith(`${SITE.origin}/`)) {
      fail('sitemap-0.xml', `contains non-canonical origin: ${url}`);
    }
    if (url !== `${SITE.origin}/` && !new URL(url).pathname.endsWith('/')) {
      fail('sitemap-0.xml', `contains non-normalized page URL: ${url}`);
    }
  }

  const expectedSitemap = new Set(indexable.map((page) => page.canonical));
  for (const url of expectedSitemap) {
    if (!sitemapSet.has(url)) {
      fail('sitemap-0.xml', `missing indexable canonical: ${url}`);
    }
  }
  for (const url of sitemapSet) {
    if (!expectedSitemap.has(url)) {
      fail('sitemap-0.xml', `contains a noindex or unknown URL: ${url}`);
    }
  }

  let robotsText = '';
  try {
    robotsText = await readFile(path.join(DIST, 'robots.txt'), 'utf8');
  } catch (error) {
    fail('robots.txt', `missing: ${error.message}`);
  }
  if (!/^User-agent:\s*\*/mi.test(robotsText)) {
    fail('robots.txt', 'missing wildcard user-agent policy');
  }
  if (!new RegExp(`^Sitemap:\\s*${SITE.origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/sitemap-index\\.xml$`, 'mi').test(robotsText)) {
    fail('robots.txt', 'missing absolute sitemap declaration');
  }
  if (!isExpectedOriginRobots(robotsText)) {
    fail(
      'robots.txt',
      'origin policy must exactly allow wildcard crawling and declare the canonical sitemap',
    );
  }

  try {
    const socialImage = await readFile(path.join(DIST, 'og-exile-crafter.jpg'));
    const dimensions = jpegDimensions(socialImage);
    if (dimensions.width !== 1200 || dimensions.height !== 630) {
      fail(
        'og-exile-crafter.jpg',
        `expected 1200x630, found ${dimensions.width}x${dimensions.height}`,
      );
    }
    if (socialImage.length > 1_000_000) {
      fail('og-exile-crafter.jpg', `file is too large: ${socialImage.length} bytes`);
    }
  } catch (error) {
    fail('og-exile-crafter.jpg', `cannot validate social image: ${error.message}`);
  }

  console.log('Rendered SEO verification summary');
  console.log(`- HTML pages: ${pages.length}`);
  console.log(`- Indexable pages: ${indexable.length}`);
  console.log(`- Noindex pages: ${pages.length - indexable.length}`);
  console.log(`- Sitemap URLs: ${sitemapUrls.length}`);
  console.log(`- JSON-LD: ${schemaBlocks} block(s) on ${schemaPages} page(s)`);
  console.log(`- Duplicate indexable titles: ${[...titleGroups.values()].filter((routes) => routes.length > 1).length}`);
  console.log(`- Zero-inlink indexable pages (advisory): ${zeroInlinkPages.length}`);
  console.log(`- Titles over 60 characters (advisory): ${longTitles}`);
  console.log(`- Images without explicit dimensions (advisory): ${imagesWithoutDimensions}/${images}`);

  return { pages, indexable, sitemapUrls };
}

await checkUntrustedDataGuards();
await checkExternalRefreshGuards();
await checkPolicy();
await checkWorkflowGuards();
await checkClientDataParity();
if (POLICY_ONLY) {
  if (failures.length === 0) {
    console.log(`SEO skill policy verified: ${expectedSkills.length} coverage decisions.`);
  }
  outputFailures();
} else {
  await inspectRenderedOutput();
  if (failures.length === 0) {
    console.log('SEO verification passed.');
  }
  outputFailures();
}
