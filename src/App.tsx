import { useEffect, useState, useCallback } from "react";
import { useGameData } from "./hooks/useGameData";
import { useFilters } from "./hooks/useFilters";
import { StatsBar } from "./components/StatsBar";
import { GameTable, COLUMNS } from "./components/GameTable";
import { ColumnToggle } from "./components/ColumnToggle";
import type { SortCol } from "./types";

const LS_COLS = "dlssdb-columns";

function getDefaultCols(): Set<SortCol> {
  try {
    const saved = localStorage.getItem(LS_COLS);
    if (saved) return new Set(JSON.parse(saved));
  } catch { /* ignore */ }
  const w = window.innerWidth;
  if (w < 768) return new Set(["name", "framegen", "steam"]);
  if (w < 1200) return new Set(["name", "framegen", "steam", "hltb"]);
  return new Set(["name", "framegen", "rt", "steam", "hltb"]);
}

export default function App() {
  const { games, hltb, steam, loading, error } = useGameData();
  const { filtered, filters, setFilter, clearFilters, sortCol, sortDir, toggleSort } =
    useFilters(games, hltb, steam);
  const [visibleCols, setVisibleCols] = useState<Set<SortCol>>(getDefaultCols);

  // Persist columns to localStorage
  useEffect(() => {
    localStorage.setItem(LS_COLS, JSON.stringify([...visibleCols]));
  }, [visibleCols]);

  const toggleCol = useCallback((key: SortCol) => {
    if (key === "name") return;
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>(".th-filter-input")?.focus();
      }
      if (e.key === "Escape") {
        (document.activeElement as HTMLElement)?.blur();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (loading) {
    return (
      <>
        <div className="top-bar">
          <header><div className="header-left"><h1>DLSSdb</h1></div></header>
        </div>
        <div className="loading">
          <span className="spinner" />
          Loading game data…
        </div>
        <StatsBar filtered={[]} total={0} />
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="top-bar">
          <header><div className="header-left"><h1>DLSSdb</h1></div></header>
        </div>
        <div className="error-page">
          <h2>Failed to load game data</h2>
          <p>Make sure <code>dlss-rt-games-apps-overrides.json</code> is in the <code>public/</code> folder.</p>
          <p className="error-detail">{error}</p>
        </div>
        <StatsBar filtered={[]} total={0} />
      </>
    );
  }

  return (
    <>
      <div className="top-bar">
        <header>
          <div className="header-left">
            <h1>DLSSdb</h1>
            <span className="subtitle">Browse and filter NVIDIA DLSS supported games</span>
          </div>
          <div className="header-actions">
            <ColumnToggle columns={COLUMNS} visible={visibleCols} onToggle={toggleCol} />
            <button type="button" className="btn-clear" onClick={clearFilters}>
              Clear Filters
            </button>
          </div>
        </header>
      </div>
      <GameTable
        games={filtered}
        hltb={hltb}
        steam={steam}
        sortCol={sortCol}
        sortDir={sortDir}
        onSort={toggleSort}
        visibleCols={visibleCols}
        filters={filters}
        onFilter={setFilter}
      />
      <StatsBar filtered={filtered} total={games.length} />
    </>
  );
}
