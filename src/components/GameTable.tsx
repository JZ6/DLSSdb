import { memo, useMemo } from "react";
import type { DlssGame, HltbInfo, SteamInfo, SortCol, SortDir, Filters } from "../types";
import { FrameGenBadge, FeatureBadge, SteamBadge, HltbBadge } from "./Badge";

export interface Column {
  key: SortCol;
  label: string;
  minWidth: string;
  tooltip: string;
}

export const COLUMNS: Column[] = [
  { key: "name",     label: "Game",         minWidth: "160px", tooltip: "Game title — click to search on Steam" },
  { key: "framegen", label: "Frame Gen",    minWidth: "70px",  tooltip: "DLSS Frame Generation multiplier — 6X (DLSS 4.5, RTX 50), 4X (DLSS 4, RTX 40/50), 2X (DLSS 3, RTX 40/50)" },
  { key: "sr",       label: "Super Res",    minWidth: "70px",  tooltip: "DLSS Super Resolution — AI upscaling from lower resolution. NV-T = Transformer model (best quality)" },
  { key: "rr",       label: "Ray Recon",    minWidth: "70px",  tooltip: "DLSS Ray Reconstruction — AI-enhanced ray tracing denoising for cleaner reflections and lighting" },
  { key: "dlaa",     label: "DLAA",         minWidth: "60px",  tooltip: "Deep Learning Anti-Aliasing — AI anti-aliasing at native resolution (no upscaling)" },
  { key: "rt",       label: "Ray Tracing",  minWidth: "90px",  tooltip: "Ray Tracing support — 'Path Tracing' = full path tracing, 'Yes' = partial ray tracing (reflections, shadows, GI)" },
  { key: "steam",    label: "Steam Rating", minWidth: "180px", tooltip: "Steam user review rating and positive review percentage" },
  { key: "hltb",     label: "Hours to Beat",minWidth: "70px",  tooltip: "HowLongToBeat.com — hover for Main / Main+Extras / Completionist breakdown" },
];

const COLUMN_FILTERS: Partial<Record<SortCol, { value: string; label: string }[]>> = {
  framegen: [
    { value: "", label: "All" },
    { value: "6x", label: "6X" },
    { value: "4x", label: "4X" },
    { value: "2x", label: "2X" },
    { value: "any", label: "Any" },
  ],
  sr: [
    { value: "", label: "All" },
    { value: "NV, T", label: "Transformer" },
    { value: "Yes", label: "Yes" },
  ],
  rr: [
    { value: "", label: "All" },
    { value: "any", label: "Any" },
  ],
  rt: [
    { value: "", label: "All" },
    { value: "Path Tracing", label: "Path Tracing" },
    { value: "Yes", label: "Yes" },
    { value: "any", label: "Any RT" },
  ],
  steam: [
    { value: "", label: "All" },
    { value: "op+", label: "Overwhelmingly Positive +" },
    { value: "vp+", label: "Very Positive +" },
    { value: "mp+", label: "Mostly Positive +" },
    { value: "neg", label: "Negative" },
  ],
  hltb: [
    { value: "", label: "All" },
    { value: "u10", label: "< 10h" },
    { value: "u60", label: "< 60h" },
    { value: "u100", label: "< 100h" },
    { value: "100+", label: "100h+" },
  ],
};

const COL_TO_FILTER: Partial<Record<SortCol, keyof Filters>> = {
  framegen: "framegen",
  sr: "sr",
  rr: "rr",
  rt: "rt",
  steam: "steam",
  hltb: "hltb",
};

type CellRenderer = (game: DlssGame, steam?: SteamInfo, hltb?: HltbInfo) => React.JSX.Element;

const CELL_RENDERERS: Record<string, CellRenderer> = {
  framegen: (g) => <FrameGenBadge game={g} />,
  sr:       (g) => <FeatureBadge value={g["dlss super resolution"] || ""} />,
  rr:       (g) => <FeatureBadge value={g["dlss ray reconstruction"] || ""} />,
  dlaa:     (g) => <FeatureBadge value={g.dlaa || ""} />,
  rt:       (g) => <FeatureBadge value={g["ray tracing"] || ""} />,
  steam:    (_g, steam) => <SteamBadge info={steam} />,
  hltb:     (_g, _s, hltb) => <HltbBadge data={hltb} />,
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
  // Memoize so GameRow memo() actually prevents re-renders
  const cols = useMemo(
    () => COLUMNS.filter((c) => visibleCols.has(c.key)),
    [visibleCols]
  );

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {cols.map((col) => {
              const filterKey = COL_TO_FILTER[col.key];
              const filterOpts = COLUMN_FILTERS[col.key];
              return (
                <th
                  key={col.key}
                  style={{ minWidth: col.minWidth }}
                  className={sortCol === col.key ? "sorted" : ""}
                >
                  <div className="th-label" onClick={() => onSort(col.key)}>
                    <span className="si">
                      <span className={`si-up ${sortCol === col.key && sortDir === 1 ? "si-on" : "si-off"}`} />
                      <span className={`si-down ${sortCol === col.key && sortDir === -1 ? "si-on" : "si-off"}`} />
                    </span>
                    {col.label}
                    <span
                      className="th-info"
                      data-tip={col.tooltip}
                      tabIndex={0}
                      onClick={(e) => e.stopPropagation()}
                    >ⓘ</span>
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
            <GameRow
              key={g.sno}
              game={g}
              hltbData={hltb[g.name]}
              steamInfo={steam[g.name]}
              cols={cols}
            />
          ))}
        </tbody>
      </table>
      {games.length === 0 && <div className="no-results">No games match your filters</div>}
    </div>
  );
}

const GameRow = memo(function GameRow({ game, hltbData, steamInfo, cols }: {
  game: DlssGame;
  hltbData?: HltbInfo;
  steamInfo?: SteamInfo;
  cols: Column[];
}) {
  const steamUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(game.name)}`;
  return (
    <tr>
      {cols.map((col) => {
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
