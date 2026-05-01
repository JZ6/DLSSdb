#!/usr/bin/env node
/**
 * Update Steam review data for DLSSdb games.
 * Zero external dependencies — uses Node.js built-in fetch.
 *
 * Usage:
 *   node scripts/update_steam.js                          # update all unchecked
 *   node scripts/update_steam.js --limit 10               # update 10 unchecked entries
 *   node scripts/update_steam.js --game "Cyberpunk 2077"  # update/refresh a single game
 *   node scripts/update_steam.js --retry                  # re-check games previously not found
 *   node scripts/update_steam.js --refresh 30             # re-fetch entries older than 30 days
 */

import { fileURLToPath } from "url";
import { join } from "path";
import {
  PUBLIC, loadJson, saveJson, getGameNames,
  nameVariations, similarity, resolveGameName,
} from "./util.js";

const GAME_DATA_FILE = join(PUBLIC, "game_data.json");
const TODAY = new Date().toISOString().slice(0, 10);

const STEAM_BASE = "https://store.steampowered.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Maps Steam's review_score_desc strings to our canonical rating labels.
 * When Steam returns a non-standard description (e.g. "1 user reviews"),
 * parseReviews falls back to a pct-based bucket instead.
 */
const RATING_MAP = {
  "Overwhelmingly Positive": "Overwhelmingly Positive",
  "Very Positive": "Very Positive",
  "Positive": "Positive",
  "Mostly Positive": "Mostly Positive",
  "Mixed": "Mixed",
  "Mostly Negative": "Mostly Negative",
  "Negative": "Negative",
  "Very Negative": "Very Negative",
  "Overwhelmingly Negative": "Overwhelmingly Negative",
};

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

/** Extract rating/pct/total from appreviews API response. Returns null if no data. */
function parseReviews(json) {
  const s = json?.query_summary;
  if (!s) return null;
  const total = s.total_reviews ?? 0;
  const positive = s.total_positive ?? 0;
  if (total === 0) return null;
  const desc = s.review_score_desc ?? "";
  const pct = Math.round((positive / total) * 100);
  let rating = RATING_MAP[desc];
  if (!rating) {
    // Non-standard desc (e.g. "3 user reviews") — bucket by pct
    if (pct >= 95) rating = "Overwhelmingly Positive";
    else if (pct >= 80) rating = "Very Positive";
    else if (pct >= 70) rating = "Mostly Positive";
    else if (pct >= 40) rating = "Mixed";
    else if (pct >= 20) rating = "Mostly Negative";
    else rating = "Negative";
  }
  return { rating, pct, total };
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Search Steam Store by name. Returns best appid or null.
 * Tries each nameVariation, picks exact match first, then best similarity > 0.6.
 */
async function searchByName(rawName) {
  const name = rawName.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  for (const variation of nameVariations(name)) {
    const url = `${STEAM_BASE}/api/storesearch/?term=${encodeURIComponent(variation)}&l=english&cc=US`;
    const resp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!resp.ok) continue;
    const items = (await resp.json()).items ?? [];
    if (!items.length) continue;

    // Exact match first
    const exact = items.find((i) => i.name.toLowerCase() === variation.toLowerCase());
    if (exact) return exact.id;

    // Best similarity
    let best = null, bestSim = 0;
    for (const item of items) {
      const sim = Math.max(similarity(name, item.name), similarity(variation, item.name));
      if (sim > bestSim) { best = item; bestSim = sim; }
    }
    if (best && bestSim > 0.6) return best.id;
  }
  return null;
}

/** Fetch review summary for a known appid. Returns { rating, pct, total } or null. */
async function fetchReviews(appid) {
  const url = `${STEAM_BASE}/appreviews/${appid}?json=1&language=all&purchase_type=all&num_per_page=0`;
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) return null;
  return parseReviews(await resp.json());
}

/** Fetch metadata (release_date, genres, image, metacritic_url) for a known appid. */
async function fetchDetails(appid) {
  const url = `${STEAM_BASE}/api/appdetails?appids=${appid}`;
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) return {};
  const json = await resp.json();
  const data = json?.[String(appid)]?.data ?? {};
  const result = {};
  const rd = data.release_date;
  if (rd?.date) result.release_date = rd.date;
  const mc = data.metacritic;
  if (mc?.url) result.metacritic_url = mc.url;
  const genres = data.genres;
  if (genres?.length) result.genres = genres.map((g) => g.description);
  const image = data.capsule_imagev5 || data.capsule_image;
  if (image) result.image = image;
  return result;
}

/**
 * Fetch all Steam data for a game.
 * Uses steamEntry.appid if present (skips search).
 * Returns { appid, reviews, details } or null if no appid found.
 */
async function fetchGame(name, steamEntry) {
  let appid = steamEntry?.appid ?? null;
  if (!appid) {
    appid = await searchByName(name);
    if (!appid) return null;
  }
  const reviews = await fetchReviews(appid);
  const details = await fetchDetails(appid);
  return { appid, reviews, details };
}

/** Build an ordered steam object from fetched data. */
function buildSteamEntry(appid, reviews, details) {
  const entry = { found: true, appid };
  if (reviews) {
    entry.rating = reviews.rating;
    entry.pct = reviews.pct;
    entry.total = reviews.total;
  }
  if (details.release_date) entry.release_date = details.release_date;
  if (details.genres?.length) entry.genres = details.genres;
  if (details.image) entry.image = details.image;
  if (details.metacritic_url) entry.metacritic_url = details.metacritic_url;
  entry.updated_at = TODAY;
  return entry;
}

// ---------------------------------------------------------------------------
// Core update logic (exported for use by a future unified update_game.js)
// ---------------------------------------------------------------------------

/**
 * Fetch Steam data for one game and update gameData in place.
 * Owns no file I/O — caller is responsible for load and save.
 * Returns true if found on Steam.
 */
export async function processOne(gameData, name, prefix = "") {
  if (!gameData[name]) gameData[name] = {};
  const steamEntry = gameData[name]?.steam || {};
  if (!prefix && steamEntry.appid) {
    console.log(`  Current: appid=${steamEntry.appid} rating=${steamEntry.rating} pct=${steamEntry.pct}`);
  }
  const result = await fetchGame(name, steamEntry);
  if (result) {
    gameData[name].steam = buildSteamEntry(result.appid, result.reviews, result.details);
    const rev = result.reviews;
    const revStr = rev ? `${rev.rating} (${rev.pct}%, ${rev.total.toLocaleString()} reviews)` : "no reviews yet";
    console.log(`  ${prefix}${name}: ${revStr} [appid=${result.appid}]`);
  } else {
    gameData[name].steam = { found: false };
    console.log(`  ${prefix}${name}: not found on Steam`);
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

  console.log(`Updating Steam data for "${gameName}"...`);
  await processOne(gameData, gameName);
  saveJson(GAME_DATA_FILE, gameData);
}

export async function updateSteam(limit = 0, { retry = false, refresh = 0 } = {}) {
  console.log("Updating Steam data...");
  const gameData = loadJson(GAME_DATA_FILE);
  const gameNames = getGameNames();

  let targets;
  let modeLabel;
  if (retry) {
    targets = gameNames.filter((n) => gameData[n]?.steam?.found === false);
    modeLabel = "to retry";
  } else if (refresh > 0) {
    const cutoff = new Date(Date.now() - refresh * 86400000).toISOString().slice(0, 10);
    targets = gameNames.filter((n) => {
      const s = gameData[n]?.steam;
      return s?.found === true && (!s.updated_at || s.updated_at < cutoff);
    });
    modeLabel = `stale (>${refresh}d)`;
  } else {
    targets = gameNames.filter((n) => !("found" in (gameData[n]?.steam ?? {})));
    modeLabel = "unchecked";
  }

  const withData = gameNames.filter((n) => gameData[n]?.steam?.found === true).length;
  const notFound = gameNames.filter((n) => gameData[n]?.steam?.found === false).length;
  console.log(`  ${withData} with data, ${notFound} not found, ${targets.length} ${modeLabel}`);

  const toFetch = limit > 0 ? targets.slice(0, limit) : targets;
  if (!toFetch.length) {
    console.log("  Nothing to do");
    return;
  }

  console.log(`  Fetching ${toFetch.length} games...`);
  let added = 0;

  const batchSize = 5;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    await Promise.all(batch.map(async (name, j) => {
      const prefix = `[${i + j + 1}/${toFetch.length}] `;
      try {
        if (await processOne(gameData, name, prefix)) added++;
      } catch (e) {
        console.log(`  ${prefix}${name}: error (${e.message})`);
      }
    }));
  }

  saveJson(GAME_DATA_FILE, gameData);
  console.log(`  Added ${added} new Steam entries`);
}

// ---------------------------------------------------------------------------
// CLI (only runs when executed directly, not when imported)
// ---------------------------------------------------------------------------

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage:
  node scripts/update_steam.js                          Update all unchecked games
  node scripts/update_steam.js --limit <n>              Update n unchecked games
  node scripts/update_steam.js --game "<name>"          Update/refresh a single game (fuzzy match)
  node scripts/update_steam.js --retry                  Re-check games previously not found
  node scripts/update_steam.js --refresh <days>         Re-fetch entries older than <days>`);
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
    : updateSteam(limit, { retry, refresh });
  run.catch((e) => { console.error(e); process.exit(1); });
}
