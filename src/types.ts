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
  sr: string;
  rr: string;
  rt: string;
  steam: string;
}

export type SortCol = "name" | "framegen" | "sr" | "rr" | "dlaa" | "rt" | "steam" | "hltb";
export type SortDir = 1 | -1;

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
