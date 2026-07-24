# Exile Crafter

A visual crafting companion for **Path of Exile 2** with an interactive simulator that reads real item pastes from the game and lets you craft with every currency. Browse bases, modifiers, currencies, and omens — then simulate the entire crafting process with in-game-style tooltips, quality mechanics, corrupted implicits, and probability calculations.

Hosted at [exilecrafter.com](https://exilecrafter.com). Fully static site, zero server runtime, deployed on [Cloudflare Pages](https://pages.cloudflare.com/).

---

## Features

### 📋 Paste Import (Ctrl+C from the game)
Paste any item copied in-game and the simulator reconstructs every detail:

- Item name, base type, rarity, item level, quality (with category — "Fire Modifiers", etc.)
- Defenses (Energy Shield, Evasion Rating, Armour, Runic Ward)
- Requirements (Level, Str, Dex, Int) and sockets
- All affixes — prefixes, suffixes, implicits, unique mods, enchantments, corruption enhancements
- Desecrated and crafted mods flagged correctly
- Rune effects, corrupted/twice-corrupted status
- Lore/flavor text and unique item images
- Quality-boosted stat values (e.g. +20% Fire Modifiers boosts matching mods)

### 🎨 In-Game Style Tooltip
Every item renders as a PoE2-styled tooltip with:

- Rarity-colored borders and header backgrounds (white/blue/yellow/orange)
- Rarity-colored mod text (cream for uniques, gold for rares, blue for magic, white for normal)
- Crafted mods in a paler shade, desecrated mods with strikethrough when inactive
- Tier badges, tag-colored damage types, orange flavor text, item icon
- Item Level at the top, quality stats, requirements, rune effects — everything matches the game layout

### 🔧 Full Crafting Simulator
- 27+ currency operations (Transmute, Augment, Regal, Exalted, Chaos, Divine, Annul, Vaal, Alchemy, Scouring, Blessed, Orb of Chance, Ancient Orb, Essences, Catalysts, Omens, Armourer's Scrap, Blacksmith's Whetstone, Glassblower's Bauble, and more)
- Keyboard shortcuts for every operation (A, R, E, X, C, D, T, Z, etc.)
- Only valid currencies are shown for the current item state (no grayed-out buttons)
- Activity log with full roll history
- Cost tracking across a crafting session
- Mod pool summary with tier ranges
- Omen effects via popover toggles
- Currency tier badges (L/G/P/R) for easy visual identification

### 🧮 Probability Calculator
- Web Worker-powered probability math — never freezes the UI
- Calculates expected cost to hit a target mod or tier

### 📖 Curated Crafting Guides
- 7 step-by-step paths for common PoE2 crafting goals
- Each guide shows required materials and expected outcomes

### 🌐 i18n Ready
- English and Portuguese JSON translation files
- Drop in a new locale file to add a language

---

## Quick Start

```bash
git clone https://github.com/buzzkillb/exilecrafter.git
cd exilecrafter
npm install
npm run dev        # local dev server at http://localhost:4321
```

### Build for production

```bash
npm run build      # static build → dist/
npm run preview    # preview the built site
```

### Run tests

```bash
npm test           # 165+ assertions across paste parsing, rendering, quality, find-base, and more
npm run e2e        # end-to-end paste import test (jsdom)
```

The build process automatically runs the test suite first (via the `prebuild` script). If any test fails, the build stops.

---

## ⚙️ Project Structure

```
exilecrafter/
├── data/
│   ├── raw/                  # scraped HTML cache (gitignored)
│   ├── manual/               # hand-curated data (weights.json schema + README)
│   └── processed/            # normalized JSON the site consumes
│       ├── bases.json        # 368 base items (17 slots)
│       ├── mods.json         # 97 modifier definitions (tier, level gate, tags, ranges)
│       ├── currency.json     # 135 currency items with icons
│       ├── omens.json        # 50 omens with effect descriptions
│       ├── prices.json       # live prices from poe2scout
│       ├── seasons.json      # league metadata
│       ├── unique-images.json  # 37 unique item icons fetched from poe2db
│       └── manifest.json     # data version manifest
├── scripts/
│   ├── refresh.mjs           # fetch + process in one shot
│   ├── fetch-poe2db.mjs      # discover + scrape poe2db pages
│   ├── fetch-unique-images.mjs  # download unique item icons
│   ├── fetch-weights.mjs     # community weight data
│   ├── process-data.mjs      # parse raw HTML → normalized JSON
│   ├── download-images.mjs   # local image cache for bases/currency/omens
│   ├── compress-raw.mjs      # compress raw HTML cache
│   ├── _check_tiers.mjs      # tier validation helper
│   └── _e2e_paste.mjs        # end-to-end paste import test
├── src/
│   ├── components/
│   │   ├── BaseCard.astro
│   │   ├── ItemCard.astro
│   │   ├── AffixSlot.astro
│   │   ├── AffixSlots.astro
│   │   ├── ModBadge.astro
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   └── simulator/        # 13 child components
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
│   │   ├── emulator.ts        # 27+ currency crafting operations
│   │   ├── weights.ts         # weighted pool math
│   │   ├── data.ts            # data loading
│   │   ├── cost-tracker.ts    # run-cost accounting
│   │   ├── expected-cost.ts   # probability-based cost guidance
│   │   ├── corrupted-implicits.ts  # corrupted implicit table (poe2db)
│   │   ├── methods.ts         # 7 curated crafting guides
│   │   ├── optimizer.ts       # mod pool optimizer
│   │   ├── i18n.ts            # locale resolution
│   │   ├── types.ts           # core type definitions
│   │   ├── item/              # paste parsing, rendering, quality
│   │   │   ├── types.ts       # ParsedPaste, ParsedAffix, Item model
│   │   │   ├── parse-paste.ts # wiki + in-game clipboard text parser
│   │   │   ├── quality.ts     # quality category matching + value boosting
│   │   │   ├── render.ts      # pure HTML generation for item tooltips
│   │   │   ├── serialize.ts   # item → clipboard text export
│   │   │   ├── tags.ts        # rarity colors, tag color rules, escapeHtml
│   │   │   ├── find-base.ts   # base item resolution
│   │   │   └── index.ts
│   │   ├── simulator/         # simulator logic modules
│   │   │   ├── store.ts       # typed reactive state
│   │   │   ├── data-loader.ts # async data loading
│   │   │   ├── keyboard.ts    # keyboard shortcut handler
│   │   │   ├── examples.ts    # starting item examples
│   │   │   ├── operations.ts  # currency operation mappings
│   │   │   ├── omens.ts       # omen parsing
│   │   │   └── index.ts
│   │   └── workers/
│   │       └── probability.worker.ts  # Web Worker for probability math
│   ├── pages/                 # routes (index, simulator, calculator, optimizer, etc.)
│   ├── i18n/                  # en.json, pt.json
│   └── styles/
│       └── global.css         # PoE2 theme tokens
├── public/
│   └── images/                # cached base item, currency, omen, and unique icons
├── tests/
│   ├── run.mjs                # 165+ assertion test runner (Node native)
│   ├── fixtures/              # 5 paste fixtures (ancestral_tiara, runeforged_war_wraps, the_taming, two_stone_ring, waystone_t15)
│   ├── _smoke_ancestral.mjs   # smoke test for Ancestral Tiara
│   └── _baseline_simulator.html  # pre-refactor HTML snapshot
├── .github/workflows/
│   ├── ci.yml                 # PR gate (test + build)
│   ├── deploy.yml             # push-to-main deploy
│   └── refresh.yml            # weekly data refresh
├── astro.config.mjs
├── tsconfig.json
├── wrangler.toml
└── package.json
```

---

## Paste Format Support

The parser handles two clipboard formats:

### Wiki Format (poe2db / community sites)

```
{ Prefix Modifier "Virile" (Tier: 3) — Life }
+118(100-119) to maximum Life
```

Extracts: descriptive name (`Virile`), tier, tags (`Life`), rolled value and range, crafted/desecrated flags.

### In-Game Format (Ctrl+C from PoE2)

```
Prefix Modifier
T3
+118(100-119) to maximum Life
```

Extracts: tier, rolled value and range (no descriptive name since the game doesn't include it).

---

## Quality Mechanics

PoE2 quality with category-specific modifiers is fully supported:

- Quality is parsed with its category (e.g. "Quality (Fire Modifiers): +20%")
- Matching affixes have their first numeric value boosted by the quality multiplier
- Supported categories: Fire, Cold, Lightning, Attack, Spell, Attribute, Defence, Life, Mana, Chaos, Physical, Elemental Modifiers
- Quality currency operations (Armourer's Scrap, Blacksmith's Whetstone, Glassblower's Bauble) apply quality directly in the simulator

---

## Data Pipeline

```bash
npm run refresh    # fetch poe2db + process → data/processed/*.json
npm run fetch      # scrape only (no processing)
npm run process    # process + download images only (no fetch)
npm run weights    # optional: bake in community weight data
```

Item data comes from [poe2db.tw](https://poe2db.tw) (CC BY-NC-SA). Mod weights from [Krakenbul / Prohibited Library](https://discord.gg/3VxKY6gt7j). Live prices from [poe2scout.com](https://poe2scout.com). Game data extraction via [SnosMe/poe-dat-viewer](https://github.com/SnosMe/poe-dat-viewer) (MIT).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Static site** | Astro 7 + TypeScript strict |
| **Styling** | Tailwind 4 (Vite plugin) |
| **Data scraping** | Cheerio in Node scripts |
| **Client logic** | Vanilla JS in `<script>` tags (no framework) |
| **Probability** | Web Workers (non-blocking) |
| **Testing** | Node native test runner (165+ assertions) + jsdom (e2e) |
| **Deploy** | Cloudflare Pages (auto-builds from git) |
| **CI** | GitHub Actions — test + build on every PR |

---

## Weight Data

Community weight data can be loaded from `data/manual/weights.json` or a remote URL:

```bash
CRAFTCLASS_WEIGHTS_URL=https://example.com/poe2-weights.json npm run weights
npm run build
```

---

## Adding Crafting Guides

Edit `src/lib/methods.ts` — each guide is a typed object with title, description, steps, and expected outcomes. The simulator renders them automatically.

---

## Credits

Crafting patterns inspired by [Craft of Exile](https://www.craftofexile.com/). Exile Crafter is an unofficial fan tool and is not affiliated with or endorsed by Grinding Gear Games.

## License

MIT — see [LICENSE](./LICENSE).
