#!/usr/bin/env node
/**
 * Update Metacritic scores for DLSSdb games.
 * Zero external dependencies — uses Node.js built-in fetch.
 *
 * Usage:
 *   node scripts/update_metacritic.js                          # update all unchecked
 *   node scripts/update_metacritic.js --limit 10               # update 10 unchecked entries
 *   node scripts/update_metacritic.js --game "Cyberpunk 2077"  # update/refresh a single game
 *   node scripts/update_metacritic.js --retry                  # re-check games previously not found
 *   node scripts/update_metacritic.js --refresh 30             # re-fetch entries older than 30 days
 */

import { fileURLToPath } from "url";
import { join } from "path";
import {
  PUBLIC, loadJson, saveJson, getGameNames,
  nameVariations, resolveGameName,
} from "./util.js";

const GAME_DATA_FILE = join(PUBLIC, "game_data.json");
const TODAY = new Date().toISOString().slice(0, 10);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Slug generation
// ---------------------------------------------------------------------------

/** Convert game name to Metacritic URL slug (lowercase, alphanumeric + dashes). */
function nameToSlug(name) {
  let s = name.toLowerCase();
  s = s.replace(/[™®©]/g, "");
  s = s.replace(/[':./!,()[\]&+]/g, "");
  s = s.replace(/[^a-z0-9\s-]/g, "");
  s = s.replace(/[\s-]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  return s;
}

/** Extract slug from Metacritic URL like "https://www.metacritic.com/game/pc/cyberpunk-2077?ftag=..." */
function slugFromUrl(url) {
  const match = url.match(/\/game\/(?:pc\/)?([^/?]+)/);
  return match ? match[1] : null;
}

const ARABIC_TO_ROMAN = { 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi", 7: "vii", 8: "viii", 9: "ix", 10: "x" };

/** Generate slug variations: original + Arabic→Roman numeral conversions. */
function slugVariations(slug) {
  const slugs = [slug];
  const romanized = slug.replace(/\b(\d+)\b/g, (_, n) => ARABIC_TO_ROMAN[Number(n)] || n);
  if (romanized !== slug) slugs.push(romanized);
  return slugs;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Pass 1: Try to get Metacritic score from Steam appdetails API.
 * Returns { score, slug, appid } or null.
 */
async function fetchViaAppId(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}`;
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) return null;
  const json = await resp.json();
  const data = json?.[String(appid)]?.data;
  if (!data) return null;
  const mc = data.metacritic;
  if (!mc?.score) return null;
  const slug = mc.url ? slugFromUrl(mc.url) : null;
  return { score: mc.score, slug, appid };
}

/**
 * Pass 2: Scrape Metacritic HTML directly for ratingValue.
 * Tries slug variations (from nameVariations).
 * Returns { score?, slug } or null.
 */
async function fetchViaMetacritic(name) {
  for (const variation of nameVariations(name)) {
    for (const slug of slugVariations(nameToSlug(variation))) {
      const url = `https://www.metacritic.com/game/${slug}/`;
      const resp = await fetch(url, {
        headers: { "User-Agent": UA, "Accept": "text/html" },
      });
      if (!resp.ok) { await sleep(1000); continue; }
      const html = await resp.text();
      const scoreMatch = html.match(/"ratingValue"[:\s]*"?(\d+)"?/);
      await sleep(1000);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : undefined;
      return { score, slug };
    }
  }
  return null;
}

/** Build an ordered metacritic object from fetched data. */
function buildMetacriticEntry(data) {
  const entry = { found: true };
  if (data.slug) entry.slug = data.slug;
  if (data.score) entry.score = data.score;
  entry.source = data.source;
  if (data.appid) entry.appid = data.appid;
  entry.updated_at = TODAY;
  return entry;
}

// ---------------------------------------------------------------------------
// Core update logic (exported for use by update_game.js)
// ---------------------------------------------------------------------------

/**
 * Fetch Metacritic data for one game and update gameData in place.
 * Owns no file I/O — caller is responsible for load and save.
 * Returns true if found on Metacritic.
 */
export async function processOne(gameData, name, prefix = "") {
  if (!gameData[name]) gameData[name] = {};
  const metacriticEntry = gameData[name]?.metacritic || {};
  const steamEntry = gameData[name]?.steam || {};
  if (!prefix && metacriticEntry.score) {
    console.log(`  Current: score=${metacriticEntry.score} slug=${metacriticEntry.slug}`);
  }

  // Pass 1: Try Steam appdetails if we have an appid
  if (steamEntry.appid) {
    const result = await fetchViaAppId(steamEntry.appid);
    if (result) {
      gameData[name].metacritic = buildMetacriticEntry({
        ...result,
        source: "steam",
        slug: result.slug || nameToSlug(name), // fallback slug
      });
      console.log(`  ${prefix}${name}: ${result.score} [pass1: steam appid=${result.appid}]`);
      return true;
    }
  }

  // Pass 2: Scrape Metacritic directly
  const result = await fetchViaMetacritic(name);
  if (result) {
    gameData[name].metacritic = buildMetacriticEntry({
      ...result,
      source: "metacritic",
    });
    const scoreStr = result.score ? `${result.score}` : "no score yet";
    console.log(`  ${prefix}${name}: ${scoreStr} [pass2: metacritic slug=${result.slug}]`);
    return true;
  }

  // Not found
  gameData[name].metacritic = { found: false };
  console.log(`  ${prefix}${name}: not found`);
  return false;
}

// ---------------------------------------------------------------------------
// CLI entry functions
// ---------------------------------------------------------------------------

async function updateSingleGame(inputName) {
  const gameData = loadJson(GAME_DATA_FILE);
  const allNames = [...new Set([...getGameNames(), ...Object.keys(gameData)])];
  const gameName = resolveGameName(inputName, allNames);
  if (gameName !== inputName) console.log(`  Matched "${inputName}" → "${gameName}"`);

  console.log(`Updating Metacritic data for "${gameName}"...`);
  await processOne(gameData, gameName);
  saveJson(GAME_DATA_FILE, gameData);
}

export async function updateMetacritic(limit = 0, { retry = false, refresh = 0 } = {}) {
  console.log("Updating Metacritic data...");
  const gameData = loadJson(GAME_DATA_FILE);
  const gameNames = getGameNames();

  let targets;
  let modeLabel;
  if (retry) {
    targets = gameNames.filter((n) => gameData[n]?.metacritic?.found === false);
    modeLabel = "to retry";
  } else if (refresh > 0) {
    const cutoff = new Date(Date.now() - refresh * 86400000).toISOString().slice(0, 10);
    targets = gameNames.filter((n) => {
      const m = gameData[n]?.metacritic;
      return m?.found === true && (!m.updated_at || m.updated_at < cutoff);
    });
    modeLabel = `stale (>${refresh}d)`;
  } else {
    targets = gameNames.filter((n) => !("found" in (gameData[n]?.metacritic ?? {})));
    modeLabel = "unchecked";
  }

  const withData = gameNames.filter((n) => gameData[n]?.metacritic?.found === true).length;
  const notFound = gameNames.filter((n) => gameData[n]?.metacritic?.found === false).length;
  console.log(`  ${withData} with data, ${notFound} not found, ${targets.length} ${modeLabel}`);

  const toFetch = limit > 0 ? targets.slice(0, limit) : targets;
  if (!toFetch.length) {
    console.log("  Nothing to do");
    return;
  }

  console.log(`  Fetching ${toFetch.length} games...`);
  let added = 0;

  // SEQUENTIAL processing (batchSize = 1) to avoid bot detection
  for (let i = 0; i < toFetch.length; i++) {
    const name = toFetch[i];
    const prefix = `[${i + 1}/${toFetch.length}] `;
    try {
      if (await processOne(gameData, name, prefix)) added++;
    } catch (e) {
      console.log(`  ${prefix}${name}: error (${e.message})`);
    }
  }

  saveJson(GAME_DATA_FILE, gameData);
  console.log(`  Added ${added} new Metacritic entries`);
}

// ---------------------------------------------------------------------------
// CLI (only runs when executed directly, not when imported)
// ---------------------------------------------------------------------------

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage:
  node scripts/update_metacritic.js                      Update all unchecked games
  node scripts/update_metacritic.js --limit <n>          Update n unchecked games
  node scripts/update_metacritic.js --game "<name>"      Update/refresh a single game (fuzzy match)
  node scripts/update_metacritic.js --retry              Re-check games previously not found
  node scripts/update_metacritic.js --refresh <days>     Re-fetch entries older than <days>`);
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
    : updateMetacritic(limit, { retry, refresh });
  run.catch((e) => { console.error(e); process.exit(1); });
}
