#!/usr/bin/env node
/**
 * Update HLTB (HowLongToBeat) playtime data for DLSSdb games.
 * Zero external dependencies — uses Node.js built-in fetch.
 *
 * Usage:
 *   node scripts/update_hltb.js                          # update all unchecked
 *   node scripts/update_hltb.js --limit 10               # update 10 unchecked entries
 *   node scripts/update_hltb.js --game "Cyberpunk 2077"  # update/refresh a single game
 *   node scripts/update_hltb.js --retry                  # re-check games previously not found
 *   node scripts/update_hltb.js --refresh 30             # re-fetch entries older than 30 days
 *   node scripts/update_hltb.js --backfill               # backfill hltb_id for existing entries
 */

import { fileURLToPath } from "url";
import { join } from "path";
import {
  PUBLIC, loadJson, saveJson, getGameNames,
  nameVariations, similarity, resolveGameName,
} from "./util.js";

const GAME_DATA_FILE = join(PUBLIC, "game_data.json");
const TODAY = new Date().toISOString().slice(0, 10);

const BASE_URL = "https://howlongtobeat.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Extract times from raw HLTB game object. Returns null if no data at all. */
function parseHltbTimes(g) {
  const toHours = (s) => Math.round((s / 3600) * 100) / 100;
  const d = { hltb_id: g.game_id };
  if (g.comp_main > 0) d.main = toHours(g.comp_main);
  if (g.comp_plus > 0) d.extra = toHours(g.comp_plus);
  if (g.comp_100 > 0) d.complete = toHours(g.comp_100);
  if (g.invested_co > 0) d.coop = toHours(g.invested_co);
  if (g.invested_mp > 0) d.pvp = toHours(g.invested_mp);
  if (g.comp_speed > 0) d.speed = toHours(g.comp_speed);
  if (g.comp_all > 0) d.all_styles = toHours(g.comp_all);
  return Object.keys(d).length > 1 ? d : null;
}

// ---------------------------------------------------------------------------
// HLTB API — lazy-initialized, shared across calls
// ---------------------------------------------------------------------------

let _apiPromise = null;

async function getApi() {
  if (_apiPromise) return _apiPromise;
  _apiPromise = _initApi();
  return _apiPromise;
}

async function _initApi() {
  console.log("  Discovering HLTB API endpoint...");
  const resp = await fetch(BASE_URL, { headers: { "User-Agent": UA, Accept: "text/html" } });
  if (!resp.ok) throw new Error(`HLTB homepage returned ${resp.status}`);
  const html = await resp.text();

  const allScripts = [...html.matchAll(/src="([^"]*\.js)"/g)].map((m) => m[1]);
  const appScripts = allScripts.filter((s) => s.includes("_app-"));
  let searchPath = "/api/s";
  for (const src of appScripts.length ? appScripts : allScripts) {
    const url = src.startsWith("http") ? src : `${BASE_URL}/${src.replace(/^\//, "")}`;
    const scriptResp = await fetch(url, { headers: { "User-Agent": UA } });
    if (!scriptResp.ok) continue;
    const match = (await scriptResp.text()).match(
      /fetch\s*\(\s*["']\/api\/([a-zA-Z0-9_/]+)[^"']*["']\s*,\s*\{[^}]*method:\s*["']POST["'][^}]*\}/s
    );
    if (match) { searchPath = `/api/${match[1].split("/")[0]}`; break; }
  }
  console.log(`  Endpoint: ${searchPath}`);

  const initResp = await fetch(`${BASE_URL}${searchPath}/init?t=${Date.now()}`, {
    headers: { "User-Agent": UA, Referer: BASE_URL + "/" },
  });
  if (!initResp.ok) throw new Error("Could not get HLTB auth token");
  const json = await initResp.json();
  let authKey = null, authValue = null;
  for (const [k, v] of Object.entries(json)) {
    if (/key/i.test(k)) authKey = v;
    else if (/val/i.test(k)) authValue = v;
  }
  console.log("  Auth token acquired");
  return { searchPath, token: json.token, authKey, authValue };
}

// ---------------------------------------------------------------------------
// Fetch strategies — both return { data, via } or null
// ---------------------------------------------------------------------------

/** Fetch by HLTB game ID (scrapes game page — no auth needed). */
async function fetchById(hltbId) {
  const resp = await fetch(`${BASE_URL}/game/${hltbId}`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!resp.ok) return null;
  const match = (await resp.text()).match(
    /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s
  );
  if (!match) return null;
  const games = JSON.parse(match[1]).props?.pageProps?.game?.data?.game;
  const g = Array.isArray(games) ? games[0] : games;
  if (!g) return null;
  const data = parseHltbTimes(g) ?? { hltb_id: g.game_id };
  return { data, via: "" };
}

/** Search by name with variations + similarity matching (needs auth). */
async function fetchByName(rawName) {
  const name = rawName.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  const api = await getApi();
  const headers = {
    "Content-Type": "application/json",
    Accept: "*/*",
    "User-Agent": UA,
    Referer: BASE_URL + "/",
    Origin: BASE_URL + "/",
    "x-auth-token": String(api.token),
  };
  if (api.authKey != null) headers["x-hp-key"] = String(api.authKey);
  if (api.authValue != null) headers["x-hp-val"] = String(api.authValue);

  for (const variation of nameVariations(name)) {
    const payload = {
      searchType: "games",
      searchTerms: variation.split(/\s+/),
      searchPage: 1,
      size: 20,
      searchOptions: {
        games: {
          userId: 0, platform: "", sortCategory: "popular", rangeCategory: "main",
          rangeTime: { min: 0, max: 0 },
          gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
          rangeYear: { max: "", min: "" }, modifier: "",
        },
        users: { sortCategory: "postcount" },
        lists: { sortCategory: "follows" },
        filter: "", sort: 0, randomizer: 0,
      },
      useCache: true,
    };
    if (api.authKey != null) payload[api.authKey] = api.authValue;

    const resp = await fetch(`${BASE_URL}${api.searchPath}`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
    if (!resp.ok) continue;
    const results = (await resp.json()).data || [];

    let best = null, bestSim = 0;
    for (const r of results) {
      const sim = Math.max(similarity(name, r.game_name), similarity(name, r.game_alias));
      if (sim > bestSim) { best = r; bestSim = sim; }
    }
    if (best && bestSim > 0.6) {
      const data = parseHltbTimes(best) ?? { hltb_id: best.game_id };
      const via = variation !== name ? ` (via "${variation}")` : "";
      return { data, via };
    }
  }
  return null;
}

/** Fetch HLTB data for a game — ID first if available, then name search. */
async function fetchGame(name, hltbEntry) {
  if (hltbEntry?.hltb_id) {
    const result = await fetchById(hltbEntry.hltb_id);
    if (result) return result;
  }
  return await fetchByName(name);
}

/** Build an ordered hltb object from fetched data. */
function buildHltbEntry(data) {
  const entry = { found: true };
  if (data.hltb_id) entry.hltb_id = data.hltb_id;
  if (data.main) entry.main = data.main;
  if (data.extra) entry.extra = data.extra;
  if (data.complete) entry.complete = data.complete;
  if (data.coop) entry.coop = data.coop;
  if (data.pvp) entry.pvp = data.pvp;
  if (data.speed) entry.speed = data.speed;
  if (data.all_styles) entry.all_styles = data.all_styles;
  entry.updated_at = TODAY;
  return entry;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Fetch HLTB data for one game and update gameData in place.
 * Owns no file I/O — caller is responsible for load and save.
 * Returns true if found on HLTB.
 */
export async function processOne(gameData, name, prefix = "") {
  const hltbEntry = gameData[name]?.hltb || {};
  if (!prefix && hltbEntry.hltb_id) console.log(`  Current: hltb_id=${hltbEntry.hltb_id} main=${hltbEntry.main}`);
  const result = await fetchGame(name, hltbEntry);
  if (result) {
    gameData[name].hltb = buildHltbEntry(result.data);
    console.log(`  ${prefix}${name}: ${result.data.main || "?"}h${result.via} [hltb_id=${result.data.hltb_id}]`);
  } else {
    const preserved = hltbEntry.hltb_id ? { hltb_id: hltbEntry.hltb_id } : {};
    gameData[name].hltb = { found: false, ...preserved };
    console.log(`  ${prefix}${name}: not found`);
  }
  return !!result;
}

async function updateSingleGame(inputName) {
  const gameData = loadJson(GAME_DATA_FILE);
  const allNames = [...new Set([...getGameNames(), ...Object.keys(gameData)])];
  const gameName = resolveGameName(inputName, allNames);
  if (gameName !== inputName) console.log(`  Matched "${inputName}" → "${gameName}"`);

  console.log(`Updating HLTB data for "${gameName}"...`);
  await processOne(gameData, gameName);
  saveJson(GAME_DATA_FILE, gameData);
}

export async function updateHltb(limit = 0, { backfill = false, retry = false, refresh = 0 } = {}) {
  console.log("Updating HLTB data...");
  const gameData = loadJson(GAME_DATA_FILE);
  const gameNames = getGameNames();

  let targets;
  let modeLabel;
  if (backfill) {
    targets = gameNames.filter((n) => gameData[n]?.hltb?.found === true && !gameData[n]?.hltb?.hltb_id);
    modeLabel = "missing hltb_id";
  } else if (retry) {
    targets = gameNames.filter((n) => gameData[n]?.hltb?.found === false);
    modeLabel = "to retry";
  } else if (refresh > 0) {
    const cutoff = new Date(Date.now() - refresh * 86400000).toISOString().slice(0, 10);
    targets = gameNames.filter((n) => {
      const h = gameData[n]?.hltb;
      return h?.found === true && (!h.updated_at || h.updated_at < cutoff);
    });
    modeLabel = `stale (>${refresh}d)`;
  } else {
    targets = gameNames.filter((n) => !("found" in (gameData[n]?.hltb ?? {})));
    modeLabel = "unchecked";
  }

  const withData = gameNames.filter((n) => gameData[n]?.hltb?.found === true).length;
  const notFound = gameNames.filter((n) => gameData[n]?.hltb?.found === false).length;
  console.log(`  ${withData} with data, ${notFound} not found, ${targets.length} ${modeLabel}`);

  const toFetch = limit > 0 ? targets.slice(0, limit) : targets;
  if (!toFetch.length) {
    console.log(`  Nothing to do`);
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
  console.log(`  Added ${added} new HLTB entries`);
}

// ---------------------------------------------------------------------------
// CLI (only runs when executed directly, not when imported)
// ---------------------------------------------------------------------------

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage:
  node scripts/update_hltb.js                          Update all unchecked games
  node scripts/update_hltb.js --limit <n>              Update n unchecked games
  node scripts/update_hltb.js --game "<name>"          Update/refresh a single game (fuzzy match)
  node scripts/update_hltb.js --backfill               Backfill hltb_id for existing entries
  node scripts/update_hltb.js --retry                  Re-check games previously not found
  node scripts/update_hltb.js --refresh <days>         Re-fetch entries older than <days>`);
    process.exit(0);
  }

  const gameIdx = args.indexOf("--game");
  const limitIdx = args.indexOf("--limit");
  const refreshIdx = args.indexOf("--refresh");
  const backfill = args.includes("--backfill");
  const retry = args.includes("--retry");
  const gameName = gameIdx !== -1 ? args[gameIdx + 1] : null;
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 0 : 0;
  const refresh = refreshIdx !== -1 ? parseInt(args[refreshIdx + 1], 10) || 30 : 0;

  const run = gameName
    ? updateSingleGame(gameName)
    : updateHltb(limit, { backfill, retry, refresh });
  run.catch((e) => { console.error(e); process.exit(1); });
}
