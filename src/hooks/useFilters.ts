import { useState, useMemo, useCallback, useEffect } from "react";
import type { DlssGame, HltbInfo, SteamInfo, MetacriticInfo, UpscalingInfo, Filters, SortCol, SortDir } from "../types";
import { getFrameGenLevel, getDlssVersionOrder, getHltbHours } from "../types";

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

const EMPTY_FILTERS: Filters = { search: "", framegen: "", dlssver: "", sr: "", rr: "", rt: "", steam: "", metacritic: "", hltb: "" };
const LS_FILTERS = "dlssdb-filters";
const LS_SORT = "dlssdb-sort";

function loadFilters(): Filters {
  try {
    const saved = localStorage.getItem(LS_FILTERS);
    if (saved) return { ...EMPTY_FILTERS, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return EMPTY_FILTERS;
}

function loadSort(): { col: SortCol; dir: SortDir } {
  try {
    const saved = localStorage.getItem(LS_SORT);
    if (saved) {
      const { col, dir } = JSON.parse(saved);
      return { col, dir };
    }
  } catch { /* ignore */ }
  return { col: "name", dir: 1 };
}

function fmatch(val: string, filt: string): boolean {
  if (!filt) return true;
  if (filt === "any") return !!val;
  if (filt === "none") return !val;
  return val === filt;
}

export function useFilters(
  games: DlssGame[],
  hltb: Record<string, HltbInfo>,
  steam: Record<string, SteamInfo>,
  metacritic: Record<string, MetacriticInfo> = {},
  upscaling: Record<string, UpscalingInfo> = {},
) {
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [sortCol, setSortCol] = useState<SortCol>(() => loadSort().col);
  const [sortDir, setSortDir] = useState<SortDir>(() => loadSort().dir);

  // Persist filters and sort to localStorage
  useEffect(() => {
    localStorage.setItem(LS_FILTERS, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    localStorage.setItem(LS_SORT, JSON.stringify({ col: sortCol, dir: sortDir }));
  }, [sortCol, sortDir]);

  const setFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

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

      // Frame Gen filter
      if (filters.framegen) {
        const level = getFrameGenLevel(g);
        if (filters.framegen === "6x" && level !== 3) return false;
        if (filters.framegen === "4x" && level !== 2) return false;
        if (filters.framegen === "2x" && level !== 1) return false;
        if (filters.framegen === "any" && level === 0) return false;
        if (filters.framegen === "none" && level !== 0) return false;
      }

      // DLSS Version filter
      if (filters.dlssver) {
        const ver = getDlssVersionOrder(g);
        if (filters.dlssver === "4.5+" && ver < 5) return false;
        if (filters.dlssver === "4+" && ver < 4) return false;
        if (filters.dlssver === "3+" && ver < 2) return false;
      }

      if (!fmatch(g["dlss super resolution"] || "", filters.sr)) return false;
      if (!fmatch(g["dlss ray reconstruction"] || "", filters.rr)) return false;
      if (!fmatch(g["ray tracing"] || "", filters.rt)) return false;

      // Metacritic filter
      if (filters.metacritic) {
        const mc = metacritic[g.name]?.score;
        if (mc === undefined) return false;
        if (filters.metacritic === "90+" && mc < 90) return false;
        if (filters.metacritic === "80+" && mc < 80) return false;
        if (filters.metacritic === "70+" && mc < 70) return false;
        if (filters.metacritic === "50+" && mc < 50) return false;
      }

      // Steam filter
      if (filters.steam) {
        const sr = STEAM_ORDER[steam[g.name]?.rating] ?? -1;
        if (filters.steam === "op+" && sr < 5) return false;
        if (filters.steam === "vp+" && sr < 4) return false;
        if (filters.steam === "mp+" && sr < 3) return false;
        if (filters.steam === "neg" && (sr < 0 || sr > 2)) return false;
        if (filters.steam === "unk" && sr !== -1) return false;
      }

      // HLTB filter
      if (filters.hltb) {
        const hours = getHltbHours(hltb[g.name]);
        if (filters.hltb === "u10"  && (hours === undefined || hours >= 10))  return false;
        if (filters.hltb === "u60"  && (hours === undefined || hours >= 60))  return false;
        if (filters.hltb === "u100" && (hours === undefined || hours >= 100)) return false;
        if (filters.hltb === "100+" && (hours === undefined || hours < 100))  return false;
        if (filters.hltb === "unk"  && hours !== undefined) return false;
      }

      return true;
    });

    result.sort((a, b) => {
      const av = getSortVal(a, sortCol, hltb, steam, metacritic);
      const bv = getSortVal(b, sortCol, hltb, steam, metacritic);
      // null values always sort last regardless of direction
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });

    return result;
  }, [games, hltb, steam, metacritic, filters, sortCol, sortDir]);

  return { filtered, filters, setFilter, clearFilters, sortCol, sortDir, toggleSort };
}

function getSortVal(
  g: DlssGame, col: SortCol,
  hltb: Record<string, HltbInfo>, steam: Record<string, SteamInfo>,
  metacritic: Record<string, MetacriticInfo>,
): string | number | null {
  switch (col) {
    case "name":
      return g.name.toLowerCase();
    case "dlssver":
      return getDlssVersionOrder(g);
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
    case "upscaling":
      return 0; // no sort for upscaling yet
    case "steam": {
      const v = STEAM_ORDER[steam[g.name]?.rating];
      return v !== undefined ? v : null;
    }
    case "metacritic":
      return metacritic[g.name]?.score ?? null;
    case "hltb":
      return getHltbHours(hltb[g.name]) ?? null;
    default:
      return "";
  }
}
