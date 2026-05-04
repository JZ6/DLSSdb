#!/usr/bin/env node
/**
 * PCGamingWiki source updater for DLSSdb.
 *
 * Fetches FSR and XeSS upscaling support data from PCGamingWiki's Cargo API.
 * Zero external dependencies — uses Node.js built-in fetch.
 *
 * Two fetch modes:
 *   - Per-game: queries by Steam AppID or page name (~2 API calls per game)
 *   - Bulk:     fetches ALL games with FSR/XeSS in ~3 paginated calls
 *
 * The update() method auto-selects: bulk for large lists (>10 games),
 * per-game for small lists. This is transparent to the caller.
 *
 * Cargo API docs: https://www.pcgamingwiki.com/wiki/PCGamingWiki:API
 */

import { Updater } from "../lib/base.js";
import { TODAY, UA, sleep, ARABIC_TO_ROMAN } from "../lib/util.js";

const PCGW_API = "https://www.pcgamingwiki.com/w/api.php";

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

/** Generate page name variations with Arabic→Roman numeral conversions. */
function pageVariations(name) {
  const pages = [name];
  const romanized = name.replace(/\b(\d+)\b/g, (_, n) => ARABIC_TO_ROMAN[Number(n)] || n);
  if (romanized !== name) pages.push(romanized);
  return pages;
}

/** Build an ordered pcgw entry object for game_data.json. */
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

/** Query PCGamingWiki's Cargo API. Returns the cargoquery result array. */
async function cargoQuery(params) {
  const url = `${PCGW_API}?action=cargoquery&format=json&${new URLSearchParams(params)}`;
  const resp = await fetch(url, { headers: { "User-Agent": UA } });
  if (!resp.ok) return [];
  return (await resp.json()).cargoquery ?? [];
}

// ---------------------------------------------------------------------------
// Per-game fetch (used for small batches, --game, --retry, --backfill)
// ---------------------------------------------------------------------------

/**
 * Query PCGamingWiki for a single game by Steam AppID.
 * Tries Video+Infobox_game join first (for upscaling data), then
 * falls back to Infobox_game only (game exists but no upscaling data).
 * Returns { page, fsr_version?, xess_version? } or null.
 */
async function fetchByAppId(appid) {
  // Step 1: Look for upscaling data + page name
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
    return { page, ...parseUpscaling(t.Upscaling) };
  }

  // Step 2: Check if game exists on PCGW at all (even without upscaling)
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
 * Query PCGamingWiki by page name (for games without a Steam AppID).
 * Tries name variations including Arabic→Roman numeral conversions.
 * WHERE uses spaces (not underscores) for _pageName matching.
 */
async function fetchByPageName(gameName) {
  for (const variation of pageVariations(gameName)) {
    // Step 1: Try with upscaling data
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
      return { page, ...parseUpscaling(t.Upscaling) };
    }

    // Step 2: Check if game exists at all
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
// Bulk fetch (optimization for large batches — ~3 API calls vs ~1600)
// ---------------------------------------------------------------------------

/**
 * Fetch ALL games with FSR or XeSS from PCGamingWiki in paginated bulk queries.
 * Returns the raw cargoquery results array. Much faster than per-game queries
 * when processing hundreds of games (~3 API calls vs ~2 per game).
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
    if (batch.length < batchSize) break; // Last page — no more results
    offset += batchSize;
    await sleep(500); // Be polite to the API
  }
  return results;
}

// ---------------------------------------------------------------------------
// Updater
// ---------------------------------------------------------------------------

class PcgwUpdater extends Updater {
  sourceKey = "pcgw";
  label = "PCGamingWiki";
  helpText = `Usage:
  node scripts/sources/pcgw.js                          Update all unchecked games
  node scripts/sources/pcgw.js --limit <n>              Update n unchecked games
  node scripts/sources/pcgw.js --game "<name>"          Update/refresh a single game (fuzzy match)
  node scripts/sources/pcgw.js --retry                  Re-check games previously not found
  node scripts/sources/pcgw.js --refresh <days>         Re-fetch entries older than <days>
  node scripts/sources/pcgw.js --backfill               Re-fetch page-only entries missing FSR/XeSS data`;

  /** Backfill: games that have a PCGW page but no FSR or XeSS version recorded. */
  backfillFilter(e) { return !e.fsr_version && !e.xess_version; }

  /**
   * Override: auto-selects bulk vs per-game strategy based on list size.
   *
   * For small lists (<=3): use per-game processOne() via base class.
   *   → ~2 API calls per game, fine for --game, --retry, --backfill
   *
   * For large lists (>3): use bulk fetch — one paginated API query gets ALL
   *   FSR/XeSS games from PCGW, then match by Steam appid locally.
   *   → ~3 API calls total, regardless of how many games are in the list
   */
  async update(gameData, names) {
    // Small list — delegate to base class (per-game processOne)
    if (names.length <= 3) return super.update(gameData, names);

    // Large list — bulk fetch all FSR/XeSS entries at once
    console.log("  Bulk fetching all FSR/XeSS entries from PCGamingWiki...");
    const allResults = await fetchAllUpscaling();
    console.log(`  PCGamingWiki returned ${allResults.length} entries with FSR/XeSS`);

    // Build appid → { page, fsr_version?, xess_version? } lookup map
    const appidMap = new Map();
    for (const r of allResults) {
      const t = r.title;
      const appidsRaw = t["Steam AppID"] ?? "";
      const upscalingStr = t.Upscaling ?? "";
      const pageName = (t.pageTitle ?? "").replace(/ /g, "_");
      if (!pageName) continue;
      const upscaling = parseUpscaling(upscalingStr);
      // A PCGW page can have multiple Steam AppIDs (e.g. editions)
      for (const appidStr of String(appidsRaw).split(",")) {
        const trimmed = appidStr.trim();
        if (/^\d+$/.test(trimmed)) {
          appidMap.set(Number(trimmed), { page: pageName, ...upscaling });
        }
      }
    }

    // Match each game in the list by its Steam appid
    let updated = 0, skipped = 0;
    for (const name of names) {
      const appid = gameData[name]?.steam?.appid;
      if (!appid) { skipped++; continue; } // No Steam appid — can't match in bulk mode
      const match = appidMap.get(appid);
      if (match) {
        gameData[name].pcgw = buildPcgwEntry(match.page, match);
        updated++;
      } else {
        skipped++;
      }
    }

    console.log(`  Updated ${updated} games, ${skipped} had no match`);
    return updated;
  }

  /** Per-game fetch: try by Steam AppID first, fall back to page name lookup. */
  async processOne(gameData, name, prefix = "") {
    const appid = gameData[name].steam?.appid;

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
}

// Instantiate and wire up CLI — runCli() no-ops when this file is imported
const pcgw = new PcgwUpdater();
pcgw.runCli(import.meta.url);
export default pcgw;
