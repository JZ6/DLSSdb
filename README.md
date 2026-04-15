# DLSSdb

Browse and filter NVIDIA DLSS supported games with Steam reviews and HowLongToBeat data.

**Live site:** [jz6.github.io/dlssdb](https://jz6.github.io/dlssdb/)

## Features

- 793 games from NVIDIA's official DLSS list
- Combined Frame Generation column (6X / 4X / 2X)
- Steam user review ratings
- HowLongToBeat completion times
- Inline column header filters and sorting
- Toggleable column visibility
- Dark theme, responsive layout
- Keyboard shortcut: `/` to focus search

## Data Sources

All data is stored as static JSON files in `public/` for easy updates:

| File | Source | How to update |
|---|---|---|
| `dlss-rt-games-apps-overrides.json` | [nvidia.com](https://www.nvidia.com/en-us/geforce/news/nvidia-rtx-games-engines-apps/) | Re-download from NVIDIA |
| `steam_data.json` | Manually curated | Add entries with `{ "rating": "...", "pct": N }` |
| `hltb_data.json` | [howlongtobeat.com](https://howlongtobeat.com/) | Run HLTB fetch script |

## Development

```bash
npm install
npm run dev
```

## Build & Deploy

```bash
npm run build     # outputs to dist/
npm run preview   # preview production build locally
```

GitHub Pages deployment is configured via the `base: '/dlssdb/'` setting in `vite.config.ts`.

## Tech Stack

- Vite + React + TypeScript
- No external UI libraries
