import { useState, useMemo, useCallback, useEffect, startTransition } from "react";
import type { DlssGame, HltbInfo, SteamInfo, MetacriticInfo, UpscalingInfo, Filters, SortCol, SortDir } from "../types";
import { getFrameGenLevel, getDlssVersionOrder, getHltbHours } from "../types";

const FEATURE_ORDER: Record<string, number> = { "NV, T": 3, "NV, U": 2, "✓ (NV)": 2, Yes: 1, "": 0 };
const RT_ORDER: Record<string, number> = { "Path Tracing": 3, "NV, T": 2, "NV, U": 2, "✓ (NV)": 2, Yes: 1, "": 0 };
const STEAM_ORDER: Record<string, number> = {
  "Overwhelmingly Positive": 7,
  "Very Positive": 6,
  Positive: 5,
  "Mostly Positive": 4,
  Mixed: 3,
  "Mostly Negative": 2,
  Negative: 1,
  "Very Negative": 0,
};

const EMPTY_FILTERS: Filters = { search: "", framegen: "", dlssver: "", dlaa: "", sr: "", rr: "", rt: "", upscaling: "", steam: "", metacritic: "", hltb: "" };
const LS_FILTERS = "dlssdb-filters";
const LS_SORT = "dlssdb-sort";

function filtersFromHash(): Partial<Filters> {
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return {};
    const params = new URLSearchParams(hash);
    const result: Partial<Filters> = {};
    for (const [k, v] of params) {
      if (k in EMPTY_FILTERS) (result as Record<string, string>)[k] = v;
    }
    return result;
  } catch { return {}; }
}

function filtersToHash(filters: Filters): void {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const hash = params.toString();
  const newUrl = hash ? `#${hash}` : window.location.pathname + window.location.search;
  window.history.replaceState(null, "", newUrl);
}

function loadFilters(): Filters {
  // URL hash takes priority over localStorage
  const hashFilters = filtersFromHash();
  if (Object.keys(hashFilters).length > 0) {
    return { ...EMPTY_FILTERS, ...hashFilters };
  }
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
  return { col: "steam", dir: -1 };
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
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>(loadSort);

  // Persist to localStorage + URL hash
  useEffect(() => { localStorage.setItem(LS_FILTERS, JSON.stringify(filters)); filtersToHash(filters); }, [filters]);
  useEffect(() => { localStorage.setItem(LS_SORT, JSON.stringify(sort)); }, [sort]);

  const setFilter = useCallback((key: keyof Filters, value: string) => {
    startTransition(() => setFilters((prev) => ({ ...prev, [key]: value })));
  }, []);

  const clearFilters = useCallback(() => startTransition(() => setFilters(EMPTY_FILTERS)), []);

  const toggleSort = useCallback((col: SortCol) => {
    setSort((prev) => prev.col === col
      ? { col, dir: (prev.dir === 1 ? -1 : 1) as SortDir }
      : { col, dir: 1 }
    );
  }, []);

  const sortCol = sort.col;
  const sortDir = sort.dir;

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
      if (!fmatch(g.dlaa || "", filters.dlaa)) return false;
      if (!fmatch(g["ray tracing"] || "", filters.rt)) return false;

      // Upscaling filter
      if (filters.upscaling) {
        const u = upscaling[g.name];
        if (filters.upscaling === "fsr" && !u?.fsr_version) return false;
        if (filters.upscaling === "xess" && !u?.xess_version) return false;
        if (filters.upscaling === "both" && (!u?.fsr_version || !u?.xess_version)) return false;
        if (filters.upscaling === "any" && (!u?.fsr_version && !u?.xess_version)) return false;
        if (filters.upscaling === "none" && (u?.fsr_version || u?.xess_version)) return false;
      }

      // Metacritic filter
      if (filters.metacritic) {
        const mc = metacritic[g.name]?.score;
        if (filters.metacritic === "unk") { if (mc !== undefined) return false; }
        else {
          if (mc === undefined) return false;
          if (filters.metacritic === "90+" && mc < 90) return false;
          if (filters.metacritic === "75+" && mc < 75) return false;
        }
      }

      // Steam filter
      if (filters.steam) {
        const sr = (steam[g.name]?.rating && STEAM_ORDER[steam[g.name].rating!]) ?? -1;
        if (filters.steam === "op+" && sr < 7) return false;
        if (filters.steam === "vp+" && sr < 6) return false;
        if (filters.steam === "mp+" && sr < 4) return false;
        if (filters.steam === "neg" && (sr < 0 || sr > 3)) return false;
        if (filters.steam === "unk" && sr !== -1) return false;
        if (filters.steam === "nos" && !steam[g.name]?.not_on_steam) return false;
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
      const av = getSortVal(a, sortCol, hltb, steam, metacritic, upscaling);
      const bv = getSortVal(b, sortCol, hltb, steam, metacritic, upscaling);
      // null values always sort last regardless of direction
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });

    return result;
  }, [games, hltb, steam, metacritic, upscaling, filters, sortCol, sortDir]);

  // Precompute filter option counts from full game list
  const filterCounts = useMemo(() => {
    const c: Record<string, Record<string, number>> = {};
    // Frame Gen
    const fg: Record<string, number> = { "6x": 0, "4x": 0, "2x": 0, any: 0, none: 0 };
    // DLSS Version
    const dv: Record<string, number> = { "4.5+": 0, "4+": 0, "3+": 0 };
    // Feature columns
    const sr: Record<string, number> = { "NV, T": 0, Yes: 0, any: 0, none: 0 };
    const rr: Record<string, number> = { any: 0, none: 0 };
    const dlaa: Record<string, number> = { any: 0, none: 0 };
    const rt: Record<string, number> = { "Path Tracing": 0, Yes: 0, "any": 0 };
    // Upscaling
    const up: Record<string, number> = { fsr: 0, xess: 0, both: 0, any: 0, none: 0 };
    // Steam
    const st: Record<string, number> = { "op+": 0, "vp+": 0, "mp+": 0, neg: 0, nos: 0 };
    // Metacritic
    const mc: Record<string, number> = { "90+": 0, "75+": 0 };
    // HLTB
    const hl: Record<string, number> = { u10: 0, u60: 0, u100: 0, "100+": 0, unk: 0 };

    for (const g of games) {
      const level = getFrameGenLevel(g);
      if (level === 3) fg["6x"]++;
      if (level === 2) fg["4x"]++;
      if (level === 1) fg["2x"]++;
      if (level > 0) fg.any++;
      if (level === 0) fg.none++;

      const ver = getDlssVersionOrder(g);
      if (ver >= 5) dv["4.5+"]++;
      if (ver >= 4) dv["4+"]++;
      if (ver >= 2) dv["3+"]++;

      const srVal = g["dlss super resolution"] || "";
      if (srVal === "NV, T") sr["NV, T"]++;
      if (srVal === "Yes") sr.Yes++;
      if (srVal) sr.any++; else sr.none++;

      if (g["dlss ray reconstruction"]) rr.any++; else rr.none++;
      if (g.dlaa) dlaa.any++; else dlaa.none++;

      const rtVal = g["ray tracing"] || "";
      if (rtVal === "Path Tracing") rt["Path Tracing"]++;
      if (rtVal === "Yes") rt.Yes++;
      if (rtVal) rt.any++;

      const u = upscaling[g.name];
      const hasFsr = !!u?.fsr_version, hasXess = !!u?.xess_version;
      if (hasFsr) up.fsr++;
      if (hasXess) up.xess++;
      if (hasFsr && hasXess) up.both++;
      if (hasFsr || hasXess) up.any++;
      if (!hasFsr && !hasXess) up.none++;

      const si = steam[g.name];
      const sOrder = (si?.rating && STEAM_ORDER[si.rating]) ?? -1;
      if (sOrder >= 7) st["op+"]++;
      if (sOrder >= 6) st["vp+"]++;
      if (sOrder >= 4) st["mp+"]++;
      if (sOrder >= 0 && sOrder <= 3) st.neg++;
      if (steam[g.name]?.not_on_steam) st.nos++;

      const mScore = metacritic[g.name]?.score;
      if (mScore !== undefined) {
        if (mScore >= 90) mc["90+"]++;
        if (mScore >= 75) mc["75+"]++;
      }

      const hours = getHltbHours(hltb[g.name]);
      if (hours !== undefined) {
        if (hours < 10) hl.u10++;
        if (hours < 60) hl.u60++;
        if (hours < 100) hl.u100++;
        if (hours >= 100) hl["100+"]++;
      } else { hl.unk++; }
    }

    c.framegen = fg; c.dlssver = dv; c.sr = sr; c.rr = rr; c.dlaa = dlaa;
    c.rt = rt; c.upscaling = up; c.steam = st; c.metacritic = mc; c.hltb = hl;
    return c;
  }, [games, hltb, steam, metacritic, upscaling]);

  return { filtered, filters, filterCounts, setFilter, clearFilters, sortCol, sortDir, toggleSort };
}

function getSortVal(
  g: DlssGame, col: SortCol,
  hltb: Record<string, HltbInfo>, steam: Record<string, SteamInfo>,
  metacritic: Record<string, MetacriticInfo>, upscaling: Record<string, UpscalingInfo>,
): string | number | null {
  switch (col) {
    case "name":
      return g.name.toLowerCase();
    case "dlssver":
      return getDlssVersionOrder(g);
    case "framegen":
      return getFrameGenLevel(g);
    case "sr":
      return FEATURE_ORDER[g["dlss super resolution"] || ""] ?? 0;
    case "rr":
      return FEATURE_ORDER[g["dlss ray reconstruction"] || ""] ?? 0;
    case "dlaa":
      return FEATURE_ORDER[g.dlaa || ""] ?? 0;
    case "rt":
      return RT_ORDER[g["ray tracing"] || ""] ?? 0;
    case "upscaling": {
      const u = upscaling[g.name];
      if (!u) return null;
      return (u.fsr_version ? 1 : 0) + (u.xess_version ? 1 : 0);
    }
    case "steam": {
      const si = steam[g.name];
      if (!si?.rating) return null;
      const tier = STEAM_ORDER[si.rating] ?? 0;
      return tier * 1000 + (si.pct ?? 0);
    }
    case "metacritic":
      return metacritic[g.name]?.score ?? null;
    case "hltb":
      return getHltbHours(hltb[g.name]) ?? null;
    default:
      return "";
  }
}
