import { useEffect, useState, useCallback } from "react";
import coffeePng from "./assets/coffeeDonation.png";
import { useGameData } from "./hooks/useGameData";
import { useFilters } from "./hooks/useFilters";
import { Header } from "./components/Header";
import { StatsBar } from "./components/StatsBar";
import { GameTable, COLUMNS } from "./components/GameTable";
import type { SortCol } from "./types";

const LS_COLS = "dlssdb-columns";

function getDefaultCols(): Set<SortCol> {
  try {
    const saved = localStorage.getItem(LS_COLS);
    if (saved) return new Set(JSON.parse(saved));
  } catch { /* ignore */ }
  const w = window.innerWidth;
  if (w < 768) return new Set(["name", "framegen", "steam"]);
  if (w < 1200) return new Set(["name", "dlssver", "framegen", "steam", "hltb"]);
  return new Set(["name", "dlssver", "framegen", "rt", "steam", "metacritic", "hltb"]);
}

export default function App() {
  const { games, hltb, steam, metacritic, upscaling, loading, error } = useGameData();
  const { filtered, filters, filterCounts, setFilter, clearFilters, sortCol, sortDir, toggleSort } =
    useFilters(games, hltb, steam, metacritic, upscaling);
  const [visibleCols, setVisibleCols] = useState<Set<SortCol>>(getDefaultCols);

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
        <Header />
        <div className="loading"><span className="spinner" />Loading game data…</div>
        <StatsBar filtered={[]} total={0} />
      </>
    );
  }

  if (error) {
    return (
      <>
        <Header />
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
      <Header
        columns={COLUMNS}
        visibleCols={visibleCols}
        onToggleCol={toggleCol}
        onClearFilters={clearFilters}
      />
      <GameTable
        games={filtered}
        hltb={hltb}
        steam={steam}
        metacritic={metacritic}
        upscaling={upscaling}
        sortCol={sortCol}
        sortDir={sortDir}
        onSort={toggleSort}
        visibleCols={visibleCols}
        filters={filters}
        filterCounts={filterCounts}
        onFilter={setFilter}
      />
      <StatsBar filtered={filtered} total={games.length} />
      <a
        className="donate-btn"
        href="https://paypal.me/jzsix"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="donate-tooltip">Buy me a coffee!</span>
        <img src={coffeePng} alt="Buy me a coffee" />
      </a>
    </>
  );
}
