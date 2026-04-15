import { memo } from "react";
import type { DlssGame, HltbInfo, SteamInfo, SortCol, SortDir, Filters } from "../types";
import { FrameGenBadge, FeatureBadge, SteamBadge, HltbBadge } from "./Badge";

export interface Column {
  key: SortCol;
  label: string;
  width: string;
  tooltip: string;
}

export const COLUMNS: Column[] = [
  { key: "name", label: "Game", width: "240px", tooltip: "Game title — click to search on Steam" },
  { key: "framegen", label: "Frame Gen", width: "80px", tooltip: "DLSS Frame Generation multiplier — 6X (DLSS 4.5, RTX 50), 4X (DLSS 4, RTX 40/50), 2X (DLSS 3, RTX 40/50)" },
  { key: "sr", label: "Super Res", width: "75px", tooltip: "DLSS Super Resolution — AI upscaling from lower resolution. NV-T = Transformer model (best quality)" },
  { key: "rr", label: "Ray Recon", width: "75px", tooltip: "DLSS Ray Reconstruction — AI-enhanced ray tracing denoising for cleaner reflections and lighting" },
  { key: "dlaa", label: "DLAA", width: "65px", tooltip: "Deep Learning Anti-Aliasing — AI anti-aliasing at native resolution (no upscaling)" },
  { key: "rt", label: "Ray Tracing", width: "95px", tooltip: "Ray Tracing support — 'Path Tracing' = full path tracing, 'Yes' = partial ray tracing (reflections, shadows, GI)" },
  { key: "steam", label: "Steam Rating", width: "180px", tooltip: "Steam user review rating and positive review percentage" },
  { key: "hltb", label: "Hours to Beat", width: "140px", tooltip: "HowLongToBeat.com completion times — Main Story / Main + Extras / Completionist" },
];

// Filter options per column (key → options array)
const COLUMN_FILTERS: Partial<Record<SortCol, { value: string; label: string }[]>> = {
  framegen: [
    { value: "", label: "All" },
    { value: "6x", label: "6X" },
    { value: "4x", label: "4X" },
    { value: "2x", label: "2X" },
    { value: "any", label: "Any" },
    { value: "none", label: "None" },
  ],
  sr: [
    { value: "", label: "All" },
    { value: "NV, T", label: "Transformer" },
    { value: "Yes", label: "Yes" },
    { value: "none", label: "None" },
  ],
  rr: [
    { value: "", label: "All" },
    { value: "any", label: "Any" },
    { value: "none", label: "None" },
  ],
  rt: [
    { value: "", label: "All" },
    { value: "Path Tracing", label: "Path Tracing" },
    { value: "Yes", label: "Yes" },
    { value: "any", label: "Any RT" },
    { value: "none", label: "None" },
  ],
  steam: [
    { value: "", label: "All" },
    { value: "op", label: "Overwhelmingly Positive" },
    { value: "vp", label: "Very Positive" },
    { value: "mp", label: "Mostly Positive" },
    { value: "mix", label: "Mixed" },
    { value: "neg", label: "Negative" },
    { value: "vp+", label: "Very Positive +" },
    { value: "mp+", label: "Mostly Positive +" },
    { value: "unk", label: "Unknown" },
  ],
};

// Map column key → filter key in Filters interface
const COL_TO_FILTER: Partial<Record<SortCol, keyof Filters>> = {
  framegen: "framegen",
  sr: "sr",
  rr: "rr",
  rt: "rt",
  steam: "steam",
};

const CELL_RENDERERS: Record<string, (game: DlssGame, steam?: SteamInfo, hltb?: HltbInfo) => JSX.Element> = {
  name: () => <></>,
  framegen: (g) => <FrameGenBadge game={g} />,
  sr: (g) => <FeatureBadge value={g["dlss super resolution"] || ""} />,
  rr: (g) => <FeatureBadge value={g["dlss ray reconstruction"] || ""} />,
  dlaa: (g) => <FeatureBadge value={g.dlaa || ""} />,
  rt: (g) => <FeatureBadge value={g["ray tracing"] || ""} />,
  steam: (_g, steam) => <SteamBadge info={steam} />,
  hltb: (_g, _s, hltb) => <HltbBadge data={hltb} />,
};

interface Props {
  games: DlssGame[];
  hltb: Record<string, HltbInfo>;
  steam: Record<string, SteamInfo>;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
  visibleCols: Set<SortCol>;
  filters: Filters;
  onFilter: (key: keyof Filters, value: string) => void;
}

export function GameTable({ games, hltb, steam, sortCol, sortDir, onSort, visibleCols, filters, onFilter }: Props) {
  const cols = COLUMNS.filter((c) => visibleCols.has(c.key));

  return (
    <div className="table-wrap">
      <table>
        <colgroup>
          {cols.map((col) => {
            const cls = col.key === "name" ? "col-name"
              : col.key === "steam" ? "col-steam"
              : col.key === "hltb" ? "col-hltb"
              : "col-fixed";
            return <col key={col.key} className={cls} />;
          })}
        </colgroup>
        <thead>
          <tr>
            {cols.map((col) => {
              const filterKey = COL_TO_FILTER[col.key];
              const filterOpts = COLUMN_FILTERS[col.key];
              return (
                <th
                  key={col.key}
                  className={sortCol === col.key ? "sorted" : ""}
                  title={col.tooltip}
                >
                  <div className="th-label" onClick={() => onSort(col.key)}>
                    {col.label}{" "}
                    <span className="si">
                      {sortCol === col.key ? (sortDir === 1 ? "▲" : "▼") : "↕"}
                    </span>
                  </div>
                  {col.key === "name" ? (
                    <input
                      className="th-filter-input"
                      type="text"
                      placeholder="Search… ( / )"
                      value={filters.search}
                      onChange={(e) => onFilter("search", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : filterKey && filterOpts ? (
                    <select
                      className="th-filter-select"
                      value={filters[filterKey]}
                      onChange={(e) => onFilter(filterKey, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {filterOpts.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {games.map((g) => (
            <GameRow key={g.sno} game={g} hltbData={hltb[g.name]} steamInfo={steam[g.name]} visibleCols={cols} />
          ))}
        </tbody>
      </table>
      {games.length === 0 && <div className="no-results">No games match your filters</div>}
    </div>
  );
}

const GameRow = memo(function GameRow({ game, hltbData, steamInfo, visibleCols }: {
  game: DlssGame; hltbData?: HltbInfo; steamInfo?: SteamInfo; visibleCols: Column[];
}) {
  const steamUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(game.name)}`;
  return (
    <tr>
      {visibleCols.map((col) => {
        if (col.key === "name") {
          return (
            <td key="name" className="nc">
              <a href={steamUrl} target="_blank" rel="noopener noreferrer" title={game.name}>
                {game.name}
              </a>
            </td>
          );
        }
        return <td key={col.key}>{CELL_RENDERERS[col.key](game, steamInfo, hltbData)}</td>;
      })}
    </tr>
  );
});
