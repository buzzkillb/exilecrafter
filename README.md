# CraftClass

**Path of Exile 2 crafting simulator** — browse every base, modifier, currency, and omen, then run live crafting simulations with real game mechanics and market pricing.

Built as a fully static site for [Cloudflare Pages](https://pages.cloudflare.com/). Zero server runtime.

## Features

- **1690 base items** across 18 equipment slots (helmets, body armours, gloves, boots, belts, amulets, rings, shields, weapons, foci, quivers, waystones, jewels, tablets, relics, charms, flasks) — each with level requirement, stat attributes, and affix slot counts
- **2064 modifiers** with real prefix/suffix type, tier (T1–T13), level gate, tag classification, stat ranges, and DropChance weights from poe2db
- **200 currency items** — all standard orbs, greater/perfect variants, essences, liquid emotions, catalysts, desecration bones, alloys, omens — all with live market prices from poe2scout
- **50 omens** with effect descriptions and applies-to tags; 26 wired directly into the simulator (force prefix/suffix, double add/remove, homogenise, corrupt, desecrate faction/reroll, etc.)
- **Interactive Simulator** — click any orb to apply it to your item. Toggle omens to alter the next craft. Full activity log of every action with cost tracking. Real mod weights so the odds reflect actual GGG data.
- **Probability Calculator** — pick a base, target specific mods, and see the exact odds using a web worker (UI never freezes)
- **Crafting guidance** — every currency button shows what it does, when to use it, and expected cost based on your item's current state
- **Expected cost analysis** — real market pricing from poe2scout API for every craft step
- **Auto-detected league** — pulls current league name and version from poe2db on data refresh
- **12 curated crafting examples** — beginner through expert difficulty, with pre-configured bases and goals
- **i18n** — English + Portuguese (Brazil) UI. Add more languages by dropping a JSON file into `src/i18n/`.

## Quick start

```bash
npm install
npm run process    # fetch poe2db + poe2scout, produce data/processed/*.json
npm run check      # 39 data invariants
npm run dev        # local dev server at http://localhost:4321
npm run build      # static build → dist/
npm run preview    # preview the built site
```

After `process` the full dataset is cached in `data/processed/`. Re-run `npm run process` when a new league drops or you want fresh pricing.

## Project structure

```
craftclass/
├── data/
│   ├── raw/                  # cached HTML from poe2db (gitignored)
│   ├── processed/            # normalized JSON → everything the site consumes
│   └── manual/               # optional community weight overrides
├── public/
│   ├── data/                 # static JSON served to the browser (prices, etc.)
│   └── images/               # local item images (downloaded from poe2db CDN)
├── scripts/
│   ├── fetch-poe2db.mjs      # scrape poe2db pages
│   ├── fetch-prices.mjs      # fetch live pricing from api.poe2scout.com
│   ├── process-data.mjs      # parse raw HTML → processed JSON
│   ├── download-images.mjs   # download item images locally
│   └── refresh.mjs           # fetch + process in one shot
├── src/
│   ├── components/           # Astro components
│   ├── i18n/                 # en.json, pt.json
│   ├── layouts/Base.astro    # site shell (header, footer, metadata)
│   ├── lib/
│   │   ├── types.ts          # shared TypeScript types
│   │   ├── data.ts           # imports JSON + lookup helpers
│   │   ├── emulator.ts       # crafting simulation engine
│   │   ├── weights.ts        # weighted pool math
│   │   ├── cost-tracker.ts   # per-step cost tracking
│   │   ├── expected-cost.ts  # probability + cost guidance
│   │   ├── mod-render.ts     # in-game style mod text formatting
│   │   ├── omens.ts          # omen effect definitions
│   │   ├── i18n.ts           # t() helper + locale resolution
│   │   └── workers/          # probability worker (off-main-thread math)
│   ├── middleware.ts          # locale resolution (cookie → Accept-Language)
│   └── pages/                # Astro routes
└── public/
```

## Data sources

| Source | What we use |
|---|---|
| [poe2db.tw](https://poe2db.tw) | All base items, modifiers, currency descriptions, omen effects, item images — scraped at build time |
| [poe2scout.com](https://poe2scout.com) | Live market pricing for all currencies (API: `api.poe2scout.com`) |
| [pathofexile.com](https://www.pathofexile.com) | Game mechanics reference |

## League refresh workflow

```bash
npm run process   # pulls fresh data from poe2db + fresh prices from poe2scout
npm run check     # 39 data invariants
npm run build     # regenerate static site
```

Commit the updated `data/processed/*.json` files after each refresh. Cloudflare Pages' git integration picks up the changes automatically.

## Tests

```bash
npm run check       # 39 data invariants (bases, mods, currencies, omens)
npm run audit:omen  # 26 omen patterns verified
npm run audit:costs # 200 currency prices verified
npm run e2e:all     # 17 base types end-to-end through simulator
npm run e2e:orbs    # 20 orb function tests
```

## License

Data sourced from poe2db.tw (CC BY-NC-SA). Live pricing from api.poe2scout.com. Game mechanics and item data are the property of Grinding Gear Games.

CraftClass is an unofficial fan tool and is not affiliated with or endorsed by Grinding Gear Games.
