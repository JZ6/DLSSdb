export interface DlssGame {
  sno: number;
  name: string;
  type: string;
  "dlss multi frame generation": string;
  "dlss frame generation": string;
  "dlss super resolution": string;
  "dlss ray reconstruction": string;
  dlaa: string;
  "ray tracing": string;
  ai: string;
}

export interface DlssData {
  columns: unknown;
  data: DlssGame[];
}

export interface SteamInfo {
  rating: SteamRating;
  pct: number;
}

export interface HltbInfo {
  main?: number;
  extra?: number;
  complete?: number;
}

export interface MetacriticInfo {
  score: number;
}

export interface UpscalingInfo {
  fsr?: boolean;
  xess?: boolean;
}

export type SteamRating =
  | "Overwhelmingly Positive"
  | "Very Positive"
  | "Mostly Positive"
  | "Mixed"
  | "Mostly Negative"
  | "Very Negative";

export interface Filters {
  search: string;
  framegen: string;
  dlssver: string;
  sr: string;
  rr: string;
  rt: string;
  steam: string;
  metacritic: string;
  hltb: string;
}

export type SortCol = "name" | "framegen" | "dlssver" | "sr" | "rr" | "dlaa" | "rt" | "steam" | "metacritic" | "upscaling" | "hltb";
export type SortDir = 1 | -1;

/** Returns the best available hours value (main > extra > complete), or undefined */
export function getHltbHours(info?: HltbInfo): number | undefined {
  return info?.main ?? info?.extra ?? info?.complete;
}

/** Returns the effective frame gen multiplier: 3 = 6X, 2 = 4X, 1 = 2X, 0 = none */
export function getFrameGenLevel(g: DlssGame): number {
  const mfg = g["dlss multi frame generation"] || "";
  if (mfg === "NV, 6X") return 3;
  if (mfg === "NV, 4X") return 2;
  const fg = g["dlss frame generation"] || "";
  if (fg) return 1;
  return 0;
}

export function getFrameGenLabel(g: DlssGame): string {
  const level = getFrameGenLevel(g);
  if (level === 3) return "6X";
  if (level === 2) return "4X";
  if (level === 1) return "2X";
  return "";
}

/** Derive DLSS version from features */
export function getDlssVersion(g: DlssGame): string {
  if (g["dlss multi frame generation"] === "NV, 6X") return "4.5";
  if (g["dlss multi frame generation"] === "NV, 4X") return "4";
  if (g["dlss ray reconstruction"]) return "3.5";
  if (g["dlss frame generation"]) return "3";
  if (g["dlss super resolution"]) return "2";
  return "1";
}

const DLSS_VER_ORDER: Record<string, number> = { "4.5": 5, "4": 4, "3.5": 3, "3": 2, "2": 1, "1": 0 };

export function getDlssVersionOrder(g: DlssGame): number {
  return DLSS_VER_ORDER[getDlssVersion(g)] ?? 0;
}
