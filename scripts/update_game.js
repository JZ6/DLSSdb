#!/usr/bin/env node
/**
 * Unified data updater for DLSSdb — update all sources for a game or in batch.
 *
 * For --game: loads game_data.json once, runs all sources, saves once (no write conflicts).
 * For batch: runs each source sequentially (each source handles its own I/O + rate limits).
 *
 * Usage:
 *   node scripts/update_game.js --game "Cyberpunk 2077"              # all sources, one game
 *   node scripts/update_game.js --game "Cyberpunk" --sources steam,hltb  # specific sources
 *   node scripts/update_game.js                                       # all unchecked, all sources
 *   node scripts/update_game.js --sources steam,metacritic            # batch specific sources
 *   node scripts/update_game.js --retry                               # retry all failed
 *   node scripts/update_game.js --refresh 30                          # refresh stale entries
 *   node scripts/update_game.js --limit 10                            # limit per source (batch)
 *
 * Sources: steam, hltb, metacritic, pcgw (default: all, in that order)
 */

import { fileURLToPath } from "url";
import { join } from "path";
import { PUBLIC, loadJson, saveJson, getGameNames, resolveGameName } from "./util.js";

// Per-game processOne — mutates gameData, no I/O
import { processOne as steamProcess } from "./update_steam.js";
import { processOne as hltbProcess } from "./update_hltb.js";
import { processOne as metacriticProcess } from "./update_metacritic.js";
import { processOne as pcgwProcess } from "./update_pcgw.js";

// Batch update functions — each handles its own load/save/rate-limiting
import { updateSteam } from "./update_steam.js";
import { updateHltb } from "./update_hltb.js";
import { updateMetacritic } from "./update_metacritic.js";
import { updatePcgw } from "./update_pcgw.js";

const GAME_DATA_FILE = join(PUBLIC, "game_data.json");

const ALL_SOURCES = ["steam", "hltb", "metacritic", "pcgw"];

const SOURCE_PROCESS = {
  steam: steamProcess,
  hltb: hltbProcess,
  metacritic: metacriticProcess,
  pcgw: pcgwProcess,
};

const SOURCE_UPDATE = {
  steam: updateSteam,
  hltb: updateHltb,
  metacritic: updateMetacritic,
  pcgw: updatePcgw,
};

// ---------------------------------------------------------------------------
// Parse and validate --sources flag
// ---------------------------------------------------------------------------

function parseSources(raw) {
  if (!raw) return ALL_SOURCES;
  const requested = raw.split(",").map((s) => s.trim().toLowerCase());
  const invalid = requested.filter((s) => !ALL_SOURCES.includes(s));
  if (invalid.length) {
    console.error(`  Unknown source(s): ${invalid.join(", ")}. Valid: ${ALL_SOURCES.join(", ")}`);
    process.exit(1);
  }
  // Return in canonical order (steam → hltb → metacritic → pcgw)
  return ALL_SOURCES.filter((s) => requested.includes(s));
}

// ---------------------------------------------------------------------------
// Single-game update (load once → all processOne → save once)
// ---------------------------------------------------------------------------

async function updateSingleGame(inputName, sources) {
  const gameData = loadJson(GAME_DATA_FILE);
  const allNames = [...new Set([...getGameNames(), ...Object.keys(gameData)])];
  const gameName = resolveGameName(inputName, allNames);
  if (gameName !== inputName) console.log(`  Matched "${inputName}" → "${gameName}"`);

  console.log(`Updating "${gameName}" [${sources.join(", ")}]...`);
  for (const source of sources) {
    console.log(`\n[${source}]`);
    try {
      await SOURCE_PROCESS[source](gameData, gameName);
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  saveJson(GAME_DATA_FILE, gameData);
}

// ---------------------------------------------------------------------------
// Batch update (each source runs independently with its own load/save)
// ---------------------------------------------------------------------------

export async function updateAll(limit = 0, { retry = false, refresh = 0 } = {}, sources = ALL_SOURCES) {
  for (const source of sources) {
    console.log(`\n${"=".repeat(50)}`);
    try {
      await SOURCE_UPDATE[source](limit, { retry, refresh });
    } catch (e) {
      console.error(`  [${source}] Error: ${e.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI (only runs when executed directly, not when imported)
// ---------------------------------------------------------------------------

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage:
  node scripts/update_game.js --game "<name>"               Update all sources for one game
  node scripts/update_game.js --game "<name>" --sources steam,hltb  Update specific sources for one game
  node scripts/update_game.js                               Update all unchecked (all sources)
  node scripts/update_game.js --sources steam,hltb          Update all unchecked (specific sources)
  node scripts/update_game.js --retry                       Re-check all failed entries
  node scripts/update_game.js --refresh <days>              Re-fetch stale entries
  node scripts/update_game.js --limit <n>                   Limit per source in batch mode

Sources: ${ALL_SOURCES.join(", ")} (default: all, in that order)`);
    process.exit(0);
  }

  const gameIdx = args.indexOf("--game");
  const sourcesIdx = args.indexOf("--sources");
  const limitIdx = args.indexOf("--limit");
  const refreshIdx = args.indexOf("--refresh");
  const retry = args.includes("--retry");
  const gameName = gameIdx !== -1 ? args[gameIdx + 1] : null;
  const sourcesRaw = sourcesIdx !== -1 ? args[sourcesIdx + 1] : null;
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 0 : 0;
  const refresh = refreshIdx !== -1 ? parseInt(args[refreshIdx + 1], 10) || 30 : 0;
  const sources = parseSources(sourcesRaw);

  const run = gameName
    ? updateSingleGame(gameName, sources)
    : updateAll(limit, { retry, refresh }, sources);
  run.catch((e) => { console.error(e); process.exit(1); });
}
