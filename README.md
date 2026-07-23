# Exile Crafter

A visual crafting companion for **Path of Exile 2**. Browse base, modifier, currency, and omen reference data, then run live crafting simulations with keyboard shortcuts, in-game style item tooltips, and probability calculations.

Hosted at [exilecrafter.com](https://exilecrafter.com). Built as a fully static site for [Cloudflare Pages](https://pages.cloudflare.com/). Zero server runtime.

## Features

- **1,690 base items** across 17 equipment slots (helmets, body armours, gloves, boots, belts, amulets, rings, shields, weapons, foci, quivers, waystones, jewels, tablets, relics, charms, flasks) — each with stat attributes and affix slot counts
- **2,064 modifiers** with tier, level gate, tag classification, and stat ranges scraped from poe2db
- **200 currency items** — all standard orbs (lesser/normal/greater/perfect tiers), essences (all 4 tiers × 14 families), liquid emotions, catalysts, desecration bones, alloys, breachstones — all with real poe2db icons
- **50 omens** with effect descriptions, grouped by category (Alchemy, Exaltation, Annulment, Coronation, Erasure, etc.)
- **Interactive Simulator** with keyboard shortcuts (`T` Transmute, `A` Alchemy, `R` Regal, `E` Exalt, `X` Annul, `C` Chaos, `D` Divine, `Z` Undo), only-valid-currency display, omen toggles via popover, full activity log, mod pool summary, cost tracking
- **Probability Calculator** using a Web Worker for mod pool math (UI never freezes)
- **Paste Import** — copy an item from PoE2 (Ctrl+C) and paste it into the simulator to load its exact state, including implicit, prefix, suffix, desecrated, and crafted mods
- **In-game style item tooltip** — rarity-colored name, tier indicators (111/11/1), mod tags colored by damage type, gold separators, implicit/prefix/suffix sections
- **Crafting guides** — 8 curated step-by-step paths for common goals
- **i18n-ready** — easy to add languages by dropping a JSON file

## Quick start

```bash
npm install
npm run refresh   # scrape poe2db.tw, produce data/processed/*.json
npm run weights   # optional: bake in community weight data
npm run dev       # local dev server at http://localhost:4321
npm run build     # static build → dist/
npm run seo:audit # machine-readable rendered SEO snapshot
npm run check     # build + deterministic SEO validation
npm run preview   # preview the built site
npm run e2e       # end-to-end paste import test
```

## Project structure

```
craftclass/
├── data/
│   ├── raw/                  # scraped HTML cache (gitignored)
│   └── processed/            # normalized JSON the site consumes
├── scripts/
│   ├── fetch-poe2db.mjs      # discover + scrape poe2db pages
│   ├── process-data.mjs      # parse raw HTML → JSON
│   ├── fetch-weights.mjs     # community weights (Krakenbul, etc.)
│   ├── fetch-prices.mjs      # live currency prices (poe2scout)
│   ├── download-images.mjs    # local image cache
│   └── refresh.mjs           # fetch + process in one shot
├── src/
│   ├── components/           # Astro components (BaseCard, ModBadge, ItemCard, …)
│   ├── layouts/              # Base layout
│   ├── lib/                  # core TypeScript
│   │   ├── emulator.ts       # crafting operations (Transmute, Aug, Regal, Exalt, Chaos, …)
│   │   ├── weights.ts        # weighted pool math (pure functions)
│   │   ├── data.ts           # data loader
│   │   ├── cost-tracker.ts   # run-cost accounting
│   │   ├── expected-cost.ts  # probability-based guidance
│   │   ├── i18n.ts           # locale resolution
│   │   ├── methods.ts        # curated crafting guides
│   │   └── workers/          # probability.worker.ts (web worker math)
│   ├── pages/                # routes (index, simulator, calculator, …)
│   ├── i18n/                 # translation JSON files
│   └── styles/global.css     # PoE2 theme tokens + components
├── public/                   # static assets (data JSON, icon cache)
├── astro.config.mjs          # output: 'static' (Cloudflare-friendly)
├── wrangler.toml             # Cloudflare Pages config
└── package.json
```

## Data sources

| Source | Provides | Refreshed by |
|---|---|---|
| [poe2db.tw](https://poe2db.tw) | base items, mods, currency, omens, current season | `npm run fetch` |
| [Krakenbul / Prohibited Library](https://discord.gg/3VxKY6gt7j) | mod weights (per base) | manual → `data/manual/weights.json` |
| [poe2scout.com](https://poe2scout.com) | live currency prices | `npm run prices` |

Item data, mod tiers, mod weights, and the current season are pulled from community-maintained sources — see [Credits](#credits).

## Deploying to Cloudflare Pages

1. Push the repo to GitHub.
2. In Cloudflare Pages, create a new project pointing at the repo.
3. Build settings:
   - **Build command:** `npm run refresh && npm run build`
   - **Build output directory:** `dist`
   - **Environment variables:** none required
4. Cloudflare deploys the static `dist/` directory globally. No Workers, no D1, no KV — just static files served from the edge.

You can also pre-build locally and push `dist/` directly to a Pages branch or any S3-compatible host.

## League refresh workflow

When a new PoE2 league drops:

```bash
npm run refresh       # pulls fresh data from poe2db
npm run weights       # if you have updated weight spreadsheets
npm run build         # regenerate static site
git add data/processed/
git commit -m "chore(data): weekly poe2db refresh"
git push
```

Cloudflare Pages' git integration rebuilds automatically on push.

## Adding community weights

`data/manual/weights.json` schema:

```json
[
  { "baseId": "soldier_greathelm", "modId": "mod_prefix_111_50_...", "weight": 1500, "source": "krakenbul" },
  { "baseId": "soldier_greathelm", "modId": "mod_prefix_1_86_...", "weight": 50, "source": "krakenbul", "notes": "T1 life" }
]
```

Find `modId` and `baseId` by inspecting `data/processed/mods.json` and `data/processed/bases.json`.

You can also point at a remote JSON dataset:

```bash
CRAFTCLASS_WEIGHTS_URL=https://example.com/poe2-weights.json npm run weights
```

## Tech

- **Astro 7** — static site generator with island architecture
- **Tailwind 4** (via Vite plugin)
- **TypeScript** strict
- **Cheerio** for HTML parsing in build scripts
- **Web Workers** for probability math (no UI jank)
- **Zero client-side frameworks** — vanilla JS shipped in `<script>` tags
- **jsdom** for end-to-end tests

## Credits

- Item data: [poe2db.tw](https://poe2db.tw) (CC BY-NC-SA)
- Mod weights: [Krakenbul / Prohibited Library](https://discord.gg/3VxKY6gt7j)
- Game data extraction: [SnosMe/poe-dat-viewer](https://github.com/SnosMe/poe-dat-viewer) (MIT)
- Live prices: [poe2scout.com](https://poe2scout.com)
- Crafting patterns inspired by [Craft of Exile](https://www.craftofexile.com/)

Exile Crafter is an unofficial fan tool and is not affiliated with or endorsed by Grinding Gear Games.

## License

MIT — see [LICENSE](./LICENSE).
