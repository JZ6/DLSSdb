#!/usr/bin/env node
/**
 * Update PCGamingWiki FSR/XeSS upscaling data for DLSSdb games.
 * Zero external dependencies — uses Node.js built-in fetch.
 *
 * Default mode fetches all FSR/XeSS entries from PCGamingWiki in bulk (fast).
 * Retry/refresh modes query per-game via Steam AppID.
 *
 * Usage:
 *   node scripts/update_pcgw.js                          # bulk fetch all FSR/XeSS data
 *   node scripts/update_pcgw.js --game "Cyberpunk 2077"  # update/refresh a single game
 *   node scripts/update_pcgw.js --retry                  # re-check games previously not found
 *   node scripts/update_pcgw.js --refresh 30             # re-fetch entries older than 30 days
 */

import { fileURLToPath } from "url";
import { join } from "path";
import {
  PUBLIC, loadJson, saveJson, getGameNames, resolveGameName,
} from "./util.js";

const GAME_DATA_FILE = join(PUBLIC, "game_data.json");
const TODAY = new Date().toISOString().slice(0, 10);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const PCGW_API = "https://www.pcgamingwiki.com/w/api.php";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/**
 * Parse PCGamingWiki Upscaling field string like "DLSS,FSR 3.1,XeSS 2".
 * Returns { fsr_version?, xess_version? } — takes the last (highest) version listed.
 */
function parseUpscaling(str) {
  if (!str) return {};
  const parts = str.split(",").map((p) => p.trim());
  const fsrParts = parts.filter((p) => p.startsWith("FSR"));
  const xessParts = parts.filter((p) => p.startsWith("XeSS"));
  const result = {};
  if (fsrParts.length) result.fsr_version = fsrParts[fsrParts.length - 1];
  if (xessParts.length) result.xess_version = xessParts[xessParts.length - 1];
  return result;
}

const ARABIC_TO_ROMAN = { 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X" };

/** Generate page name variations with Arabic→Roman numeral conversions. */
function pageVariations(name) {
  const pages = [name];
  const romanized = name.replace(/\b(\d+)\b/g, (_, n) => ARABIC_TO_ROMAN[Number(n)] || n);
  if (romanized !== name) pages.push(romanized);
  return pages;
}

/** Build an ordered pcgw object from fetched data. */
function buildPcgwEntry(page, upscaling) {
  const entry = { found: true, page };
  if (upscaling.fsr_version) entry.fsr_version = upscaling.fsr_version;
  if (upscaling.xess_version) entry.xess_version = upscaling.xess_version;
  entry.updated_at = TODAY;
  return entry;
}

// ---------------------------------------------------------------------------
// Cargo API helpers
// ---------------------------------------------------------------------------

/** Query PCGamingWiki Cargo API and return the cargoquery array. */
async function cargoQuery(params) {
  const url = `${PCGW_API}?action=cargoquery&format=json&${new URLSearchParams(params)}`;
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) return [];
  return (await resp.json()).cargoquery ?? [];
}

/**
 * Fetch all games with FSR or XeSS from PCGamingWiki (paginated bulk fetch).
 * Returns array of { pageName, appids: string[], upscaling: string }.
 */
async function fetchAllUpscaling() {
  const results = [];
  let offset = 0;
  const batchSize = 500;

  while (true) {
    const batch = await cargoQuery({
      tables: "Video,Infobox_game",
      join_on: "Video._pageID=Infobox_game._pageID",
      fields: "Infobox_game._pageName=pageTitle,Infobox_game.Steam_AppID,Video.Upscaling",
      where: "Video.Upscaling HOLDS LIKE '%FSR%' OR Video.Upscaling HOLDS LIKE '%XeSS%'",
      limit: batchSize,
      offset,
    });
    results.push(...batch);
    if (batch.length < batchSize) break;
    offset += batchSize;
    await sleep(500);
  }
  return results;
}

/**
 * Query PCGamingWiki for a single game by Steam AppID.
 * Tries Video+Infobox_game join first, then falls back to Infobox_game only.
 * Returns { page, fsr_version?, xess_version? } or null.
 */
async function fetchByAppId(appid) {
  // Step 1: look for upscaling data + page name (HOLDS = exact match, no wildcards)
  const withUpscaling = await cargoQuery({
    tables: "Video,Infobox_game",
    join_on: "Video._pageID=Infobox_game._pageID",
    fields: "Infobox_game._pageName=pageTitle,Infobox_game.Steam_AppID,Video.Upscaling",
    where: `Infobox_game.Steam_AppID HOLDS '${appid}'`,
    limit: 5,
  });
  if (withUpscaling.length) {
    const t = withUpscaling[0].title;
    const page = (t.pageTitle ?? "").replace(/ /g, "_");
    const upscaling = parseUpscaling(t.Upscaling);
    return { page, ...upscaling };
  }

  // Step 2: check if game exists on PCGW at all (even without upscaling)
  const infoboxOnly = await cargoQuery({
    tables: "Infobox_game",
    fields: "Infobox_game._pageName=pageTitle",
    where: `Infobox_game.Steam_AppID HOLDS '${appid}'`,
    limit: 1,
  });
  if (infoboxOnly.length) {
    const page = (infoboxOnly[0].title.pageTitle ?? "").replace(/ /g, "_");
    return { page };
  }

  return null;
}

/**
 * Query PCGamingWiki by page name (for games without Steam AppID).
 * Tries name variations including Roman numeral conversions.
 * WHERE uses spaces (not underscores) for _pageName matching.
 * Returns { page, fsr_version?, xess_version? } or null.
 */
async function fetchByPageName(gameName) {
  for (const variation of pageVariations(gameName)) {
    // Step 1: try with upscaling data
    const withUpscaling = await cargoQuery({
      tables: "Video,Infobox_game",
      join_on: "Video._pageID=Infobox_game._pageID",
      fields: "Infobox_game._pageName=pageTitle,Video.Upscaling",
      where: `Infobox_game._pageName='${variation}'`,
      limit: 1,
    });
    if (withUpscaling.length) {
      const t = withUpscaling[0].title;
      const page = (t.pageTitle ?? variation).replace(/ /g, "_");
      const upscaling = parseUpscaling(t.Upscaling);
      return { page, ...upscaling };
    }

    // Step 2: check if game exists at all
    const infoboxOnly = await cargoQuery({
      tables: "Infobox_game",
      fields: "Infobox_game._pageName=pageTitle",
      where: `Infobox_game._pageName='${variation}'`,
      limit: 1,
    });
    if (infoboxOnly.length) {
      const page = (infoboxOnly[0].title.pageTitle ?? variation).replace(/ /g, "_");
      return { page };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core update logic (exported for use by update_game.js)
// ---------------------------------------------------------------------------

/**
 * Fetch PCGW data for one game and update gameData in place.
 * Owns no file I/O — caller is responsible for load and save.
 * Returns true if found on PCGamingWiki.
 */
export async function processOne(gameData, name, prefix = "") {
  if (!gameData[name]) gameData[name] = {};
  const appid = gameData[name]?.steam?.appid;

  // Try by Steam AppID first, then fall back to page name lookup
  const result = appid
    ? await fetchByAppId(appid)
    : await fetchByPageName(name);

  if (result) {
    gameData[name].pcgw = buildPcgwEntry(result.page, {
      fsr_version: result.fsr_version,
      xess_version: result.xess_version,
    });
    const upStr = [result.fsr_version, result.xess_version].filter(Boolean).join(", ") || "no upscaling";
    console.log(`  ${prefix}${name}: ${upStr} [page="${result.page}"]`);
  } else {
    gameData[name].pcgw = { found: false };
    console.log(`  ${prefix}${name}: not found on PCGamingWiki`);
  }
  return !!result;
}

// ---------------------------------------------------------------------------
// CLI entry functions
// ---------------------------------------------------------------------------

async function updateSingleGame(inputName) {
  const gameData = loadJson(GAME_DATA_FILE);
  const allNames = [...new Set([...getGameNames(), ...Object.keys(gameData)])];
  const gameName = resolveGameName(inputName, allNames);
  if (gameName !== inputName) console.log(`  Matched "${inputName}" → "${gameName}"`);

  console.log(`Updating PCGamingWiki data for "${gameName}"...`);
  await processOne(gameData, gameName);
  saveJson(GAME_DATA_FILE, gameData);
}

export async function updatePcgw(limit = 0, { retry = false, refresh = 0 } = {}) {
  const gameData = loadJson(GAME_DATA_FILE);
  const gameNames = getGameNames();

  // Retry and refresh modes: per-game API calls
  if (retry || refresh > 0) {
    let targets;
    let modeLabel;
    if (retry) {
      targets = gameNames.filter((n) => gameData[n]?.pcgw?.found === false && gameData[n]?.steam?.appid);
      modeLabel = "to retry";
    } else {
      const cutoff = new Date(Date.now() - refresh * 86400000).toISOString().slice(0, 10);
      targets = gameNames.filter((n) => {
        const p = gameData[n]?.pcgw;
        return p?.found === true && (!p.updated_at || p.updated_at < cutoff) && gameData[n]?.steam?.appid;
      });
      modeLabel = `stale (>${refresh}d)`;
    }
    const withData = gameNames.filter((n) => gameData[n]?.pcgw?.found === true).length;
    const notFound = gameNames.filter((n) => gameData[n]?.pcgw?.found === false).length;
    console.log(`Updating PCGamingWiki data (per-game)...`);
    console.log(`  ${withData} with data, ${notFound} not found, ${targets.length} ${modeLabel}`);

    const toFetch = limit > 0 ? targets.slice(0, limit) : targets;
    if (!toFetch.length) { console.log("  Nothing to do"); return; }

    console.log(`  Fetching ${toFetch.length} games...`);
    let added = 0;
    const batchSize = 5;
    for (let i = 0; i < toFetch.length; i += batchSize) {
      const batch = toFetch.slice(i, i + batchSize);
      await Promise.all(batch.map(async (name, j) => {
        const prefix = `[${i + j + 1}/${toFetch.length}] `;
        try { if (await processOne(gameData, name, prefix)) added++; }
        catch (e) { console.log(`  ${prefix}${name}: error (${e.message})`); }
      }));
    }
    saveJson(GAME_DATA_FILE, gameData);
    console.log(`  Updated ${added} PCGW entries`);
    return;
  }

  // Default mode: bulk fetch all FSR/XeSS entries at once
  console.log("Updating PCGamingWiki data (bulk fetch)...");
  console.log("  Fetching all FSR/XeSS entries from PCGamingWiki...");
  const allResults = await fetchAllUpscaling();
  console.log(`  PCGamingWiki returned ${allResults.length} entries with FSR/XeSS`);

  // Build appid → { page, fsr_version?, xess_version? } map
  const appidMap = new Map();
  for (const r of allResults) {
    const t = r.title;
    const appidsRaw = t["Steam AppID"] ?? "";
    const upscalingStr = t.Upscaling ?? "";
    const pageName = (t.pageTitle ?? "").replace(/ /g, "_");
    if (!pageName) continue;
    const upscaling = parseUpscaling(upscalingStr);
    for (const appidStr of String(appidsRaw).split(",")) {
      const trimmed = appidStr.trim();
      if (/^\d+$/.test(trimmed)) {
        appidMap.set(Number(trimmed), { page: pageName, ...upscaling });
      }
    }
  }

  // Match against DLSS games by Steam appid
  let updated = 0, skipped = 0;
  const toProcess = limit > 0
    ? gameNames.filter((n) => !gameData[n]?.pcgw?.found).slice(0, limit)
    : gameNames;

  for (const name of toProcess) {
    const appid = gameData[name]?.steam?.appid;
    if (!appid) continue;
    const match = appidMap.get(appid);
    if (match) {
      if (!gameData[name]) gameData[name] = {};
      gameData[name].pcgw = buildPcgwEntry(match.page, match);
      updated++;
    } else {
      skipped++;
    }
  }

  saveJson(GAME_DATA_FILE, gameData);

  const withData = gameNames.filter((n) => gameData[n]?.pcgw?.found === true).length;
  const withFsr = gameNames.filter((n) => gameData[n]?.pcgw?.fsr_version).length;
  const withXess = gameNames.filter((n) => gameData[n]?.pcgw?.xess_version).length;
  console.log(`  Updated ${updated} games, ${skipped} had no match`);
  console.log(`  Total: ${withData} on PCGamingWiki (FSR: ${withFsr}, XeSS: ${withXess})`);
}

// ---------------------------------------------------------------------------
// CLI (only runs when executed directly, not when imported)
// ---------------------------------------------------------------------------

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage:
  node scripts/update_pcgw.js                          Bulk fetch all FSR/XeSS data from PCGamingWiki
  node scripts/update_pcgw.js --game "<name>"          Update/refresh a single game (fuzzy match)
  node scripts/update_pcgw.js --retry                  Re-check games previously not found
  node scripts/update_pcgw.js --refresh <days>         Re-fetch entries older than <days>`);
    process.exit(0);
  }

  const gameIdx = args.indexOf("--game");
  const limitIdx = args.indexOf("--limit");
  const refreshIdx = args.indexOf("--refresh");
  const retry = args.includes("--retry");
  const gameName = gameIdx !== -1 ? args[gameIdx + 1] : null;
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 0 : 0;
  const refresh = refreshIdx !== -1 ? parseInt(args[refreshIdx + 1], 10) || 30 : 0;

  const run = gameName
    ? updateSingleGame(gameName)
    : updatePcgw(limit, { retry, refresh });
  run.catch((e) => { console.error(e); process.exit(1); });
}
