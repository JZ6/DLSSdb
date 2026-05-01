/**
 * Shared utilities for DLSSdb update scripts.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");
export const PUBLIC = join(ROOT, "public");
export const DLSS_FILE = join(PUBLIC, "dlss-rt-games-apps-overrides.json");

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

export function loadJson(path) {
  try { return JSON.parse(readFileSync(path, "utf-8")); }
  catch { return {}; }
}

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

export function getGameNames() {
  const data = loadJson(DLSS_FILE);
  return (data.data || [])
    .filter((e) => e.type === "Game")
    .map((e) => String(e.name));
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

const STRIP_SUFFIXES = [
  "Enhanced", "Remastered", "Definitive Edition", "Director's Cut",
  "Complete Edition", "RTX Version", "PC Enhanced Edition", "Evolved Edition",
  "Enhanced Edition", "2.0 Edition",
];

export function nameVariations(name) {
  const variations = [name];
  const stripped = name.replace(/\s*\(.*?\)\s*$/, "").trim();
  if (stripped !== name) variations.push(stripped);
  if (name.includes(":")) {
    const first = name.split(":")[0].trim();
    if (first.length > 3) variations.push(first);
  }
  if (name.includes(" - ")) {
    const first = name.split(" - ")[0].trim();
    if (first.length > 3) variations.push(first);
  }
  for (const suffix of STRIP_SUFFIXES) {
    const cleaned = name.replace(suffix, "").trim().replace(/[:−-]+$/, "").trim();
    if (cleaned !== name && cleaned.length > 3) variations.push(cleaned);
  }
  return [...new Set(variations)];
}

/** SequenceMatcher-style similarity (longest common subsequence ratio). */
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

/** Best similarity score between input variations and game name variations. */
export function bestScore(inputName, gameName) {
  return Math.max(
    ...nameVariations(inputName).flatMap((iv) =>
      nameVariations(gameName).map((gv) => similarity(iv, gv))
    )
  );
}

/**
 * Resolve user input to a canonical game name via exact, substring, variation, and fuzzy matching.
 * Exits with a list if multiple candidates are found.
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
    const sorted = candidates
      .map((m) => ({ name: m, score: bestScore(inputName, m) }))
      .sort((a, b) => b.score - a.score);
    console.log(`  Multiple matches for "${inputName}":`);
    sorted.forEach(({ name, score }) => console.log(`    - ${name} (${Math.round(score * 100)}%)`));
    console.log(`  Use the exact name from the list above.`);
    process.exit(1);
  }

  return inputName;
}
