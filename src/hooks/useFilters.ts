import { useState, useMemo } from "react";
import type { DlssGame, HltbInfo, SteamInfo, Filters, SortCol, SortDir } from "../types";
import { getFrameGenLevel } from "../types";

const FT_ORDER: Record<string, number> = { "NV, T": 2, Yes: 1, "": 0 };
const RT_ORDER: Record<string, number> = { "Path Tracing": 2, Yes: 1, "": 0 };
const STEAM_ORDER: Record<string, number> = {
  "Overwhelmingly Positive": 5,
  "Very Positive": 4,
  "Mostly Positive": 3,
  Mixed: 2,
  "Mostly Negative": 1,
  "Very Negative": 0,
};

const EMPTY_FILTERS: Filters = { search: "", framegen: "", sr: "", rr: "", rt: "", steam: "" };

function fmatch(val: string, filt: string): boolean {
  if (!filt) return true;
  if (filt === "any") return !!val;
  if (filt === "none") return !val;
  return val === filt;
}

export function useFilters(games: DlssGame[], hltb: Record<string, HltbInfo>, steam: Record<string, SteamInfo>) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortDir, setSortDir] = useState<SortDir>(1);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 1 ? -1 : 1) as SortDir);
    } else {
      setSortCol(col);
      setSortDir(1);
    }
  };

  const filtered = useMemo(() => {
    const q = filters.search.toLowerCase();

    let result = games.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false;

      // Frame Gen filter (combined MFG + FG)
      if (filters.framegen) {
        const level = getFrameGenLevel(g);
        if (filters.framegen === "6x" && level !== 3) return false;
        if (filters.framegen === "4x" && level !== 2) return false;
        if (filters.framegen === "2x" && level !== 1) return false;
        if (filters.framegen === "any" && level === 0) return false;
        if (filters.framegen === "none" && level !== 0) return false;
      }

      if (!fmatch(g["dlss super resolution"] || "", filters.sr)) return false;
      if (!fmatch(g["dlss ray reconstruction"] || "", filters.rr)) return false;
      if (!fmatch(g["ray tracing"] || "", filters.rt)) return false;

      if (filters.steam) {
        const sr = STEAM_ORDER[steam[g.name]?.rating] ?? -1;
        if (filters.steam === "op" && sr !== 5) return false;
        if (filters.steam === "vp" && sr !== 4) return false;
        if (filters.steam === "mp" && sr !== 3) return false;
        if (filters.steam === "mix" && sr !== 2) return false;
        if (filters.steam === "neg" && (sr < 0 || sr > 2)) return false;
        if (filters.steam === "vp+" && sr < 4) return false;
        if (filters.steam === "mp+" && sr < 3) return false;
        if (filters.steam === "unk" && sr !== -1) return false;
      }

      return true;
    });

    result.sort((a, b) => {
      const av = getSortVal(a, sortCol, hltb, steam);
      const bv = getSortVal(b, sortCol, hltb, steam);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });

    return result;
  }, [games, hltb, steam, filters, sortCol, sortDir]);

  return { filtered, filters, setFilter, clearFilters, sortCol, sortDir, toggleSort };
}

function getSortVal(g: DlssGame, col: SortCol, hltb: Record<string, HltbInfo>, steam: Record<string, SteamInfo>): string | number {
  switch (col) {
    case "name":
      return g.name.toLowerCase();
    case "framegen":
      return getFrameGenLevel(g);
    case "sr":
      return FT_ORDER[g["dlss super resolution"] || ""] ?? 0;
    case "rr":
      return FT_ORDER[g["dlss ray reconstruction"] || ""] ?? 0;
    case "dlaa":
      return FT_ORDER[g.dlaa || ""] ?? 0;
    case "rt":
      return RT_ORDER[g["ray tracing"] || ""] ?? 0;
    case "steam":
      return STEAM_ORDER[steam[g.name]?.rating] ?? -1;
    case "hltb":
      return hltb[g.name]?.main ?? 9999;
    default:
      return "";
  }
}
