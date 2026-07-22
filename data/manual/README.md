# Manual data overrides

Drop manual JSON files here when the scraped source doesn't have what you need.

## weights.json

Format:
```json
[
  { "baseId": "soldier_greathelm", "modId": "mod_prefix_111_50_...", "weight": 1500, "source": "krakenbul" },
  { "baseId": "soldier_greathelm", "modId": "mod_prefix_1_86_...", "weight": 50, "source": "krakenbul", "notes": "T1 life" }
]
```

Sources:
- `krakenbul` — Prohibited Library Discord spreadsheets
- `trade-scraped` — derived from trade listings
- `estimated` — your best guess, mark with `notes`

After editing, run `npm run weights` to bake into `data/processed/weights.json`.
