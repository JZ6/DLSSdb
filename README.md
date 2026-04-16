# DLSSdb

Browse and filter NVIDIA DLSS supported games with Steam reviews, Metacritic scores, HowLongToBeat data, and upscaling info.

**Live site:** [jz6.github.io/DLSSdb](https://jz6.github.io/DLSSdb/)

## Features

- 965 games/apps from [NVIDIA's official DLSS list](https://www.nvidia.com/en-us/geforce/news/nvidia-rtx-games-engines-apps/)
- DLSS version, Frame Generation (6X / 4X / 2X), Super Resolution, Ray Reconstruction, DLAA, Ray Tracing
- Steam user review ratings with review counts
- Metacritic critic scores
- HowLongToBeat completion times with color-coded display
- FSR / XeSS upscaling support with version numbers
- Game thumbnails from Steam
- Click-to-filter on any badge cell
- Shareable filter URLs via hash parameters
- Inline column header filters and sorting
- Toggleable column visibility
- Dark theme, responsive layout
- Keyboard shortcut: `/` to focus search

## Data Sources

All data is stored as static JSON files in `public/`:

| File | Source | How to update |
|---|---|---|
| `dlss-rt-games-apps-overrides.json` | [NVIDIA RTX Games & Apps](https://www.nvidia.com/en-us/geforce/news/nvidia-rtx-games-engines-apps/) | `python scripts/update_data.py --dlss` |
| `steam_data.json` | [Steam API](https://store.steampowered.com/) | `python scripts/update_data.py --steam` |
| `hltb_data.json` | [HowLongToBeat](https://howlongtobeat.com/) | `python scripts/update_data.py --hltb` |
| `metacritic_data.json` | [Metacritic](https://www.metacritic.com/) | `python scripts/update_data.py --metacritic` |
| `upscaling_data.json` | [PCGamingWiki](https://www.pcgamingwiki.com/) | `python scripts/update_data.py --upscaling` |

## Update Script

```bash
python scripts/update_data.py --all              # update all sources
python scripts/update_data.py --dlss             # update NVIDIA DLSS list
python scripts/update_data.py --steam            # update Steam reviews
python scripts/update_data.py --hltb             # update HLTB times
python scripts/update_data.py --metacritic       # update Metacritic scores
python scripts/update_data.py --upscaling        # update FSR/XeSS data
python scripts/update_data.py --backfill         # backfill appid + metadata
python scripts/update_data.py --backfill-total   # backfill total review counts
python scripts/update_data.py --steam --limit 10 # update 10 missing entries
python scripts/update_data.py --test 6           # test with 6 random games
```

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
