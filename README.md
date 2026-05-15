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

| File | Source |
|---|---|
| `dlss-rt-games-apps-overrides.json` | [NVIDIA RTX Games & Apps](https://www.nvidia.com/en-us/geforce/news/nvidia-rtx-games-engines-apps/) |
| `game_data.json` | [Steam](https://store.steampowered.com/), [HLTB](https://howlongtobeat.com/), [Metacritic](https://www.metacritic.com/), [PCGamingWiki](https://www.pcgamingwiki.com/) |

## Update Scripts

```bash
# Unified updater — updates DLSS list + all sources by default
node scripts/update.js                               # update everything
node scripts/update.js --dlss                        # only update NVIDIA DLSS list
node scripts/update.js --game "Cyberpunk 2077"       # update all sources for one game
node scripts/update.js --game "Game A" --game "Game B"  # update multiple games
node scripts/update.js --sources steam,hltb          # update specific sources only
node scripts/update.js --retry                       # retry previously not-found games
node scripts/update.js --refresh 30                  # re-fetch entries older than 30 days
node scripts/update.js --backfill                    # fill in missing fields
node scripts/update.js --limit 10                    # limit per source in batch mode

# Individual source scripts
node scripts/sources/steam.js --game "Cyberpunk 2077"
node scripts/sources/hltb.js --game "Cyberpunk 2077"
node scripts/sources/metacritic.js --game "Cyberpunk 2077"
node scripts/sources/pcgw.js --game "Cyberpunk 2077"
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


# TODO

tag filer what happens when in the +n

ok lets make a plan, first rules are, column widths can only change when a new column is added or removed from the drop down, or on window resize.

whenever these events happen the column width should be set to a static size based on the size of the values within.
the game column should always be 360px, and the rest of the columns should try expand to take up empty space if necessary, but once a minsize is reached then they overflow into scrollbar.

filter changes should not modify the size of the columns