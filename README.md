# Exile Crafter

A Path of Exile 2 crafting simulator. Paste items copied in-game, craft with every currency, and run Monte Carlo simulations to estimate costs. The site is fully static and deployed on Cloudflare Pages.

Hosted at [exilecrafter.com](https://exilecrafter.com).

---

## Features

### Paste Import

Paste an item copied in-game (Ctrl+C) and the simulator reconstructs its full state:

- Item name, base type, rarity, item level, quality (with category, e.g. "Fire Modifiers")
- Defenses (Energy Shield, Evasion Rating, Armour, Runic Ward)
- Requirements (Level, Str, Dex, Int) and sockets
- All affixes: prefixes, suffixes, implicits, unique mods, enchantments, corruption enhancements
- Desecrated and crafted mods, rune effects, corrupted and twice-corrupted status
- Lore text and item icons

Quality-boosted stat values are shown automatically when the item has a quality category that matches its mods.

### Crafting Simulator

- 27+ currency operations: Transmute, Augment, Regal, Exalted, Chaos, Divine, Annul, Vaal, Alchemy, Scouring, Blessed, Orb of Chance, Ancient Orb, Essences, Catalysts, Omens, quality currencies, and more
- Keyboard shortcuts for every operation
- Only valid currencies are shown for the current item state
- Activity log with roll history and cost tracking
- Mod pool summary with tier ranges
- Omen effects via toggleable popovers
- Currency tier badges for Greater, Perfect, Lesser, and Refined variants
- Persistence: your item survives page navigation and browser restarts

### Guided Methods with Monte Carlo

Two expert-level crafting methods are documented with step-by-step instructions:

- Triple-suffix boots (T1 ES Recharge)
- Endgame jewel crafting (Diamond with 5+ mods)

Each method page includes a Monte Carlo widget that runs trials against the site's real mod data, showing success rate, cost distribution (P10/median/P90), items destroyed, and average materials per success.

### Probability Calculator

Runs in a Web Worker so the UI stays responsive. Calculates expected cost to hit a target mod or tier.

### Internationalization

English and Portuguese translation files. Add a new locale by dropping in a JSON file.

---

## Quick Start

```
git clone https://github.com/buzzkillb/exilecrafter.git
cd exilecrafter
npm install
npm run dev
```

### Build

```
npm run build
npm run preview
```

### Tests

```
npm test
npm run e2e
```

The build runs the test suite first via the `prebuild` script. Any failure stops the build.

---

## Project Structure

```
exilecrafter/
├── data/
│   ├── raw/                       # scraped HTML cache (gitignored)
│   ├── manual/                    # hand-curated data
│   └── processed/                 # normalized JSON consumed by the site
│       ├── bases.json             # 368 base items across 17 equipment slots
│       ├── mods.json              # modifier definitions (tier, level gate, tags, ranges)
│       ├── currency.json          # currency items with icons
│       ├── omens.json             # omens with effect descriptions
│       ├── prices.json            # live prices from poe2scout
│       ├── seasons.json           # league metadata
│       ├── unique-images.json     # unique item icons from poe2db
│       └── manifest.json          # data version manifest
├── scripts/
│   ├── refresh.mjs                # fetch + process in one shot
│   ├── fetch-poe2db.mjs           # discover and scrape poe2db pages
│   ├── fetch-unique-images.mjs    # download unique item icons
│   ├── fetch-weights.mjs          # community weight data
│   ├── process-data.mjs           # raw HTML to normalized JSON
│   ├── download-images.mjs        # local image cache
│   ├── compress-raw.mjs           # compress raw HTML cache
│   ├── _check_tiers.mjs           # tier validation helper
│   └── _e2e_paste.mjs             # end-to-end paste import test
├── src/
│   ├── components/
│   │   ├── BaseCard.astro
│   │   ├── ItemCard.astro
│   │   ├── AffixSlot.astro
│   │   ├── AffixSlots.astro
│   │   ├── ModBadge.astro
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   └── simulator/
│   │       ├── LeftPanel.astro
│   │       ├── RightPanel.astro
│   │       ├── PasteModal.astro
│   │       ├── OmenModal.astro
│   │       ├── CurrencyStrip.astro
│   │       ├── ActivityLog.astro
│   │       ├── QuickActions.astro
│   │       ├── LoadingState.astro
│   │       ├── EmptyState.astro
│   │       ├── CostPanel.astro
│   │       ├── RefLog.astro
│   │       ├── TipsPanel.astro
│   │       └── ActiveOmensStrip.astro
│   ├── layouts/
│   │   └── Base.astro
│   ├── lib/
│   │   ├── emulator.ts            # currency crafting operations
│   │   ├── weights.ts             # weighted pool math
│   │   ├── data.ts                # data loading
│   │   ├── cost-tracker.ts        # run-cost accounting
│   │   ├── expected-cost.ts       # probability-based cost guidance
│   │   ├── corrupted-implicits.ts # corrupted implicit table
│   │   ├── methods.ts             # crafting method definitions
│   │   ├── optimizer.ts           # mod pool optimizer
│   │   ├── i18n.ts                # locale resolution
│   │   ├── types.ts               # core type definitions
│   │   ├── item/                  # paste parsing, rendering, quality
│   │   │   ├── types.ts
│   │   │   ├── parse-paste.ts
│   │   │   ├── quality.ts
│   │   │   ├── render.ts
│   │   │   ├── serialize.ts
│   │   │   ├── tags.ts
│   │   │   ├── find-base.ts
│   │   │   └── index.ts
│   │   ├── simulator/             # simulator logic modules
│   │   │   ├── store.ts
│   │   │   ├── data-loader.ts
│   │   │   ├── keyboard.ts
│   │   │   ├── examples.ts
│   │   │   ├── operations.ts
│   │   │   ├── omens.ts
│   │   │   └── index.ts
│   │   └── workers/
│   │       └── probability.worker.ts
│   ├── pages/                     # routes
│   ├── i18n/                      # en.json, pt.json
│   └── styles/
│       └── global.css             # PoE2 theme tokens
├── public/
│   └── images/                    # cached base, currency, omen, and unique icons
├── tests/
│   ├── run.mjs                    # test runner
│   ├── fixtures/                  # paste test fixtures
│   ├── _smoke_ancestral.mjs       # Ancestral Tiara smoke test
│   └── _baseline_simulator.html   # pre-refactor HTML snapshot
├── .github/workflows/
│   ├── ci.yml                     # PR gate (test + build)
│   ├── deploy.yml                 # push-to-main deploy
│   └── refresh.yml                # weekly data refresh
├── astro.config.mjs
├── tsconfig.json
├── wrangler.toml
└── package.json
```

---

## Paste Format Support

The parser handles two clipboard formats:

### Wiki format (poe2db and community sites)

```
{ Prefix Modifier "Virile" (Tier: 3) -- Life }
+118(100-119) to maximum Life
```

Extracts descriptive name, tier, tags, rolled value and range, crafted/desecrated flags.

### In-game format (Ctrl+C from PoE2)

```
Prefix Modifier
T3
+118(100-119) to maximum Life
```

Extracts tier and rolled value/range. Descriptive names are not included by the game.

---

## Quality Mechanics

Quality with category-specific modifiers is supported:

- Quality is parsed with its category (e.g. "Quality (Fire Modifiers): +20%")
- Matching affixes have their first numeric value boosted by the quality multiplier
- Supported categories: Fire, Cold, Lightning, Attack, Spell, Attribute, Defence, Life, Mana, Chaos, Physical, Elemental Modifiers
- Quality currencies (Armourer's Scrap, Blacksmith's Whetstone, Glassblower's Bauble) apply quality directly in the simulator

---

## Data Pipeline

```
npm run refresh    # fetch poe2db + process into data/processed/*.json
npm run fetch      # scrape only (no processing)
npm run process    # process + download images only (no fetch)
npm run weights    # bake in community weight data (optional)
```

Data sources: [poe2db.tw](https://poe2db.tw) (CC BY-NC-SA), Prohibited Library / Krakenbul for mod weights, [poe2scout.com](https://poe2scout.com) for live prices, and [SnosMe/poe-dat-viewer](https://github.com/SnosMe/poe-dat-viewer) (MIT) for game data extraction.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Static site | Astro 7, TypeScript strict |
| Styling | Tailwind 4 (Vite plugin) |
| Data scraping | Cheerio |
| Client logic | Vanilla JS, no framework |
| Probability | Web Workers |
| Testing | Node native test runner, jsdom for e2e |
| Deploy | Cloudflare Pages (auto-builds from git) |
| CI | GitHub Actions (test + build on every PR) |

---

## Community Weight Data

Load from `data/manual/weights.json` or a remote URL:

```
CRAFTCLASS_WEIGHTS_URL=https://example.com/poe2-weights.json npm run weights
npm run build
```

---

## Credits

Inspired by [Craft of Exile](https://www.craftofexile.com/). This is an unofficial fan tool and is not affiliated with or endorsed by Grinding Gear Games.

## License

MIT — see [LICENSE](./LICENSE).
