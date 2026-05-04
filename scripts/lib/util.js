/**
 * Shared utilities for DLSSdb update scripts.
 *
 * Provides file I/O, game name extraction from the DLSS JSON,
 * and fuzzy name matching for resolving user input to canonical game names.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "../..");
export const PUBLIC = join(ROOT, "public");

/** Source of truth for DLSS/RT game list — downloaded from NVIDIA. */
export const DLSS_FILE = join(PUBLIC, "dlss-rt-games-apps-overrides.json");

/** Unified data file — all sources (steam, hltb, metacritic, pcgw) keyed by game name. */
export const GAME_DATA_FILE = join(PUBLIC, "game_data.json");

/** Today's date in YYYY-MM-DD format, used as updated_at in all source entries. */
export const TODAY = new Date().toISOString().slice(0, 10);

/** Shared User-Agent string for all HTTP requests. */
export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Promise-based delay for rate limiting between API requests. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/** Load and parse a JSON file. Returns {} if the file doesn't exist or is invalid. */
export function loadJson(path) {
  try { return JSON.parse(readFileSync(path, "utf-8")); }
  catch { return {}; }
}

/** Save data as sorted JSON (keys alphabetized for stable diffs). */
export function saveJson(path, data) {
  const sorted = Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(path, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`  Saved ${Object.keys(data).length} entries to ${path.split("/").pop()}`);
}

// ---------------------------------------------------------------------------
// Game names
// ---------------------------------------------------------------------------

/** Extract all game names from the DLSS JSON file (filters to type "Game" only). */
export function getGameNames() {
  const data = loadJson(DLSS_FILE);
  return (data.data || [])
    .filter((e) => e.type === "Game")
    .map((e) => String(e.name));
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

/** Normalize curly/smart quotes to straight ASCII quotes for API searches. */
export function normalizeQuotes(s) {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

/** Arabic→Roman numeral map for game name variations (2 → "II", etc.). */
export const ARABIC_TO_ROMAN = { 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X" };

/** Common suffixes to strip when generating name variations for fuzzy matching. */
const STRIP_SUFFIXES = [
  "Enhanced", "Remastered", "Definitive Edition", "Director's Cut",
  "Complete Edition", "RTX Version", "PC Enhanced Edition", "Evolved Edition",
  "Enhanced Edition", "2.0 Edition",
];

/**
 * Generate variations of a game name for fuzzy matching.
 * Tries: original, without parenthetical suffix, before colon, before dash,
 * and with common edition suffixes stripped.
 * Returns deduplicated array.
 */
export function nameVariations(name) {
  const variations = [name];
  // Strip trailing parenthetical: "Game (2024)" → "Game"
  const stripped = name.replace(/\s*\(.*?\)\s*$/, "").trim();
  if (stripped !== name) variations.push(stripped);
  // Before colon: "Game: Subtitle" → "Game"
  if (name.includes(":")) {
    const first = name.split(":")[0].trim();
    if (first.length > 3) variations.push(first);
  }
  // Before dash: "Game - Subtitle" → "Game"
  if (name.includes(" - ")) {
    const first = name.split(" - ")[0].trim();
    if (first.length > 3) variations.push(first);
  }
  // Strip edition suffixes: "Game Remastered" → "Game"
  for (const suffix of STRIP_SUFFIXES) {
    const cleaned = name.replace(suffix, "").trim().replace(/[:−-]+$/, "").trim();
    if (cleaned !== name && cleaned.length > 3) variations.push(cleaned);
  }
  return [...new Set(variations)];
}

/**
 * SequenceMatcher-style similarity score (longest common subsequence ratio).
 * Returns 0–1 where 1 is identical. Used for fuzzy game name matching.
 */
export function similarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[m][n]) / (m + n);
}

/** Best similarity score across all variation pairs of two game names. */
export function bestScore(inputName, gameName) {
  return Math.max(
    ...nameVariations(inputName).flatMap((iv) =>
      nameVariations(gameName).map((gv) => similarity(iv, gv))
    )
  );
}

/**
 * Resolve user input to a canonical game name.
 *
 * Matching priority:
 *   1. Exact match (case-insensitive)
 *   2. Substring match
 *   3. Name variation match (strips suffixes, colons, etc.)
 *   4. Fuzzy match (similarity > 0.7)
 *
 * If multiple candidates match, prints them and exits.
 * If none match, returns the input as-is (new game).
 */
export function resolveGameName(inputName, allNames) {
  const input = inputName.toLowerCase();

  // 1. Exact match (case-insensitive)
  const exact = allNames.find((n) => n.toLowerCase() === input);
  if (exact) return exact;

  // 2. Gather all candidates: substring, variation, and fuzzy matches
  const FUZZY_THRESHOLD = 0.7;

  const subMatches = new Set(allNames.filter((n) => n.toLowerCase().includes(input)));
  const varMatches = new Set(allNames.filter((n) =>
    nameVariations(n).some((v) => v.toLowerCase() === input)
  ));
  const fuzzyMatches = new Set(allNames.filter((n) => bestScore(inputName, n) >= FUZZY_THRESHOLD));

  const candidates = [...new Set([...subMatches, ...varMatches, ...fuzzyMatches])];

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    // Ambiguous — print ranked candidates and exit so user can pick
    const sorted = candidates
      .map((m) => ({ name: m, score: bestScore(inputName, m) }))
      .sort((a, b) => b.score - a.score);
    console.log(`  Multiple matches for "${inputName}":`);
    sorted.forEach(({ name, score }) => console.log(`    - ${name} (${Math.round(score * 100)}%)`));
    console.log(`  Use the exact name from the list above.`);
    process.exit(1);
  }

  // No match — treat as a new game name
  return inputName;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

/**
 * Parse common CLI flags shared by all update scripts.
 * Returns a structured object so callers don't duplicate parsing logic.
 *
 * Supported flags:
 *   --game "<name>"   (repeatable) Specific game(s) to update
 *   --limit <n>       Max games to process per source
 *   --retry           Re-check games previously not found
 *   --refresh <days>  Re-fetch entries older than <days> (default 30 when flag present)
 *   --backfill        Re-fetch entries missing expected fields
 *   --sources <list>  Comma-separated source names (only used by update.js)
 */
export function parseArgs(args) {
  // Collect all --game values (flag can appear multiple times)
  const games = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--game" && i + 1 < args.length) games.push(args[++i]);
  }

  const limitIdx = args.indexOf("--limit");
  const refreshIdx = args.indexOf("--refresh");
  const sourcesIdx = args.indexOf("--sources");

  return {
    games,
    limit: limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) || 0 : 0,
    retry: args.includes("--retry"),
    refresh: refreshIdx !== -1 ? parseInt(args[refreshIdx + 1], 10) || 30 : 0,
    backfill: args.includes("--backfill"),
    sourcesRaw: sourcesIdx !== -1 ? args[sourcesIdx + 1] : null,
  };
}
