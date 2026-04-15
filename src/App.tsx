import { useEffect, useState, useCallback } from "react";
import { useGameData } from "./hooks/useGameData";
import { useFilters } from "./hooks/useFilters";
import { StatsBar } from "./components/StatsBar";
import { GameTable, COLUMNS } from "./components/GameTable";
import { ColumnToggle } from "./components/ColumnToggle";
import type { SortCol } from "./types";

const DEFAULT_VISIBLE = new Set<SortCol>(["name", "framegen", "steam", "hltb"]);

export default function App() {
  const { games, hltb, steam, loading, error } = useGameData();
  const { filtered, filters, setFilter, clearFilters, sortCol, sortDir, toggleSort } =
    useFilters(games, hltb, steam);
  const [visibleCols, setVisibleCols] = useState<Set<SortCol>>(DEFAULT_VISIBLE);

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

  // Fix sticky thead position after top-bar renders
  useEffect(() => {
    const fix = () => {
      const h = document.getElementById("topbar")?.offsetHeight ?? 0;
      document.querySelectorAll<HTMLElement>("thead th").forEach((th) => {
        th.style.top = `${h}px`;
      });
    };
    fix();
    window.addEventListener("resize", fix);
    return () => window.removeEventListener("resize", fix);
  }, [loading, filtered, visibleCols]);

  if (loading) {
    return (
      <div className="loading">
        <span className="spinner" />
        Loading game data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-page">
        <h2>Failed to load game data</h2>
        <p>
          Make sure <code>dlss-rt-games-apps-overrides.json</code> is in the <code>public/</code> folder.
        </p>
        <p className="error-detail">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="top-bar" id="topbar">
        <header>
          <h1>DLSSdb</h1>
        </header>
        <StatsBar filtered={filtered} total={games.length} hltb={hltb}>
          <ColumnToggle columns={COLUMNS} visible={visibleCols} onToggle={toggleCol} />
          <button type="button" className="btn-clear" onClick={clearFilters}>
            Clear Filters
          </button>
        </StatsBar>
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
    </>
  );
}
