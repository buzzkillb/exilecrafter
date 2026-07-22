# CraftClass

A visual crafting companion for **Path of Exile 2**. Browse every base, mod, currency, and omen — then run live crafting simulations and probability calculations, all in the browser.

Built with [Astro](https://astro.build) as a **fully static site** so it deploys cleanly to Cloudflare Pages (or any static host: Netlify, GitHub Pages, S3+CDN, etc.) with zero server runtime.

## Features

- **1690 base items** across 18 slots (Helmets, Body Armours, Gloves, Boots, Belts, Amulets, Rings, Shields, Weapons 1H/2H, Foci, Flasks, Charms, Quivers, Waystones, Jewels, Tablets, Relics), each with slot, required level, attributes (str/dex/int), and affix slot counts.
- **1988 modifiers** with real prefix/suffix type, tier (T1–T13), required level, tag classification, stat ranges, and **real DropChance weights** from poe2db's ModsView JSON.
- **135 currency items** including all essence tiers.
- **50 omens** with effect descriptions, icons, and applies-to tags.
- **Interactive Simulator** — click any orb to apply it to your item. Toggle omens to alter the next craft. Full history of every action. Uses real mod weights so the odds reflect GGG's actual drop chances.
- **Probability Calculator** — pick a base, target mods, and see the exact odds using a web worker (so the UI never freezes).
- **Crafting Guides** — curated step-by-step paths for common goals.
- **Auto-detected season** — pulls current league name from poe2db on refresh.
- **Cost estimates** — pulls live poe.ninja prices client-side.
- **i18n ready** — UI chrome ships in English and Portuguese (Brazil). Add more languages by dropping a JSON file into `src/i18n/` and adding the locale code to `LOCALES` in `src/lib/i18n.ts`.

## Quick start

```bash
npm install
npm run refresh        # scrape poe2db.tw and produce data/processed/*.json
npm run weights        # (optional) bake in community weights for accurate odds
npm run check          # 37 data invariants (run any time after a refactor)
npm run e2e:all        # exercises every base type end-to-end through Trans+Reg+Aug
npm run dev            # local dev server on http://localhost:4321
npm run build          # static build → dist/
npm run preview        # preview the built site
```

The first `refresh` populates `data/processed/*.json` with everything the site needs. After that, refresh any time a new league drops.

## Project structure

```
craftclass/
├── data/
│   ├── raw/                  # cached HTML from poe2db (gitignored)
│   ├── processed/            # normalized JSON the site consumes
│   └── manual/weights.json   # drop community-maintained weights here
├── scripts/
│   ├── fetch-poe2db.mjs      # scrape poe2db pages
│   ├── process-data.mjs      # parse raw HTML → JSON
│   ├── fetch-weights.mjs     # bake in weights from manual + remote
│   └── refresh.mjs           # fetch + process in one shot
├── src/
│   ├── components/           # Astro components (BaseCard, ModBadge, …)
│   ├── i18n/                 # en.json, pt.json — translation strings
│   ├── layouts/Base.astro    # site shell
│   ├── lib/
│   │   ├── types.ts          # shared TS types
│   │   ├── data.ts           # imports JSON, lookup helpers
│   │   ├── weights.ts        # weighted pool math (pure functions)
│   │   ├── emulator.ts       # crafting simulation (Transmute → Desecrate)
│   │   ├── methods.ts        # curated crafting guides
│   │   ├── prices.ts         # poe.ninja client (browser-side)
│   │   ├── i18n.ts           # t() helper + locale resolution
│   │   ├── worker-client.ts  # typed wrapper around the probability worker
│   │   └── workers/probability.worker.ts   # heavy math, runs off main thread
│   ├── middleware.ts         # reads Accept-Language / cookie into Astro.locals.locale
│   ├── pages/                # routes
│   └── styles/global.css     # PoE2 theme (Cinzel, parchment, gold)
├── astro.config.mjs          # output: 'static' (Cloudflare-friendly)
└── package.json
```

## Data sources

| Source | Provides | Refreshed by |
|---|---|---|
| [poe2db.tw](https://poe2db.tw) | base items, mods, currency, omens, current season | `npm run fetch` |
| [Krakenbul / Prohibited Library](https://discord.gg/3VxKY6gt7j) | mod weights (per base) | manual → `data/manual/weights.json` |
| [poe.ninja](https://poe2.ninja) | live currency prices | runtime, client-side |

Weights are the one thing that can't be auto-scraped — they come from in-game testing with recombinators. Drop a JSON array into `data/manual/weights.json` (see the README there) and run `npm run weights` to enable accurate probability math.

## Deploying to Cloudflare Pages

1. Push the repo to GitHub.
2. In Cloudflare Pages, create a new project pointing at the repo.
3. Build settings:
   - **Build command:** `npm run refresh && npm run build`
   - **Build output directory:** `dist`
   - **Environment variables:** none required
4. Cloudflare will deploy the static `dist/` directory globally. No Workers, no D1, no KV — just static files served from the edge.

You can also pre-build locally and push `dist/` directly to a Pages branch or any S3-compatible host.

## League refresh workflow

When a new PoE2 league drops:

```bash
npm run refresh        # pulls fresh data from poe2db
npm run weights        # if you have updated weight spreadsheets
npm run build          # regenerate static site
```

Commit the updated `data/processed/*.json` files so Cloudflare Pages' git integration rebuilds automatically, or push `dist/` directly.

## Adding community weights

`data/manual/weights.json` schema:

```json
[
  { "baseId": "soldier_greathelm", "modId": "mod_prefix_111_50_...", "weight": 1500, "source": "krakenbul" },
  { "baseId": "soldier_greathelm", "modId": "mod_prefix_1_86_...", "weight": 50, "source": "krakenbul", "notes": "T1 life" }
]
```

You can find `modId` and `baseId` values by inspecting `data/processed/mods.json` and `data/processed/bases.json`.

You can also point the script at a remote JSON dataset:

```bash
CRAFTCLASS_WEIGHTS_URL=https://example.com/poe2-weights.json npm run weights
```

## Tech

- **Astro 5** — static site generator
- **Tailwind 4** (via Vite plugin)
- **TypeScript** strict
- **Cheerio** for HTML parsing in build scripts
- **Web Workers** for probability math (no UI jank)
- **Zero client-side frameworks** — vanilla JS shipped in `<script>` tags

## Credits

- Data: [poe2db.tw](https://poe2db.tw) (CC BY-NC-SA)
- Mod weights: [Krakenbul / Prohibited Library](https://discord.gg/3VxKY6gt7j)
- Live prices: [poe.ninja](https://poe2.ninja)
- Crafting patterns inspired by [Craft of Exile](https://www.craftofexile.com/)

CraftClass is an unofficial fan tool and is not affiliated with or endorsed by Grinding Gear Games.
