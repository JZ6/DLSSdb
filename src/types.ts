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
  columns: Record<string, Record<string, unknown>>;
  data: DlssGame[];
}

export interface SteamInfo {
  rating?: SteamRating;
  pct?: number;
  total?: number;
  not_on_steam?: boolean;
  appid?: number;
  image?: string;
}

export interface HltbInfo {
  main?: number;
  extra?: number;
  complete?: number;
  hltb_id?: number;
}

export interface MetacriticInfo {
  score: number;
}

export interface UpscalingInfo {
  fsr_version?: string;
  xess_version?: string;
}

export type SteamRating =
  | "Overwhelmingly Positive"
  | "Very Positive"
  | "Positive"
  | "Mostly Positive"
  | "Mixed"
  | "Mostly Negative"
  | "Negative"
  | "Very Negative";

export interface Filters {
  search: string;
  framegen: string;
  dlssver: string;
  dlaa: string;
  sr: string;
  rr: string;
  rt: string;
  upscaling: string;
  steam: string;
  metacritic: string;
  hltb: string;
  hide: string;
}

export type SortCol = "name" | "framegen" | "dlssver" | "sr" | "rr" | "dlaa" | "rt" | "steam" | "metacritic" | "upscaling" | "hltb" | "hide";
export type SortDir = 1 | -1;

/** Returns the average of all available HLTB hours values, or undefined */
export function getHltbHours(info?: HltbInfo): number | undefined {
  if (!info) return undefined;
  const vals = [info.main, info.extra, info.complete].filter((v): v is number => v != null);
  if (vals.length === 0) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
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

/** Numeric sort order for DLSS version strings (higher = newer) */
const DLSS_VER_ORDER: Record<string, number> = { "4.5": 5, "4": 4, "3.5": 3, "3": 2, "2": 1, "1": 0 };

export function getDlssVersionOrder(g: DlssGame): number {
  return DLSS_VER_ORDER[getDlssVersion(g)] ?? 0;
}
