import { memo, useMemo } from "react";
import type { DlssGame, HltbInfo, SteamInfo, MetacriticInfo, UpscalingInfo, SortCol, SortDir, Filters } from "../types";
import { FrameGenBadge, DlssVersionBadge, FeatureBadge, SteamBadge, MetacriticBadge, UpscalingBadge, HltbBadge } from "./Badge";

export interface Column {
  key: SortCol;
  label: string;
  minWidth: string;
  tooltip: string;
}

export const COLUMNS: Column[] = [
  { key: "name",       label: "Game",           minWidth: "160px", tooltip: "Game title — click to search on Steam" },
  { key: "dlssver",    label: "DLSS",           minWidth: "60px",  tooltip: "Highest DLSS version supported — derived from game features (4.5 = MFG 6X, 4 = MFG 4X, 3.5 = Ray Reconstruction, 3 = Frame Gen, 2 = Super Resolution)" },
  { key: "framegen",   label: "Frame Gen",      minWidth: "70px",  tooltip: "DLSS Frame Generation multiplier — 6X (DLSS 4.5, RTX 50), 4X (DLSS 4, RTX 40/50), 2X (DLSS 3, RTX 40/50)" },
  { key: "sr",         label: "Super Res",      minWidth: "70px",  tooltip: "DLSS Super Resolution — AI upscaling from lower resolution. NV-T = Transformer model (best quality)" },
  { key: "rr",         label: "Ray Recon",      minWidth: "70px",  tooltip: "DLSS Ray Reconstruction — AI-enhanced ray tracing denoising for cleaner reflections and lighting" },
  { key: "dlaa",       label: "DLAA",           minWidth: "60px",  tooltip: "Deep Learning Anti-Aliasing — AI anti-aliasing at native resolution (no upscaling)" },
  { key: "rt",         label: "Ray Tracing",    minWidth: "90px",  tooltip: "Ray Tracing support — 'Path Tracing' = full path tracing, 'Yes' = partial ray tracing (reflections, shadows, GI)" },
  { key: "upscaling",  label: "Other Upscaling",minWidth: "80px",  tooltip: "Other upscaling tech supported — FSR (AMD FidelityFX), XeSS (Intel)" },
  { key: "steam",      label: "Steam",          minWidth: "180px", tooltip: "Steam user review rating and positive review percentage" },
  { key: "metacritic", label: "Metacritic",     minWidth: "70px",  tooltip: "Metacritic critic score — green (75+), yellow (50-74), red (<50)" },
  { key: "hltb",       label: "Hours to Beat",  minWidth: "70px",  tooltip: "HowLongToBeat.com — hover for Main / Main+Extras / Completionist breakdown" },
];

const COLUMN_FILTERS: Partial<Record<SortCol, { value: string; label: string }[]>> = {
  dlssver: [
    { value: "", label: "All" },
    { value: "4.5+", label: "4.5+" },
    { value: "4+", label: "4+" },
    { value: "3+", label: "3+" },
  ],
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
  metacritic: [
    { value: "", label: "All" },
    { value: "90+", label: "90+" },
    { value: "80+", label: "80+" },
    { value: "70+", label: "70+" },
    { value: "50+", label: "50+" },
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
  dlssver: "dlssver",
  framegen: "framegen",
  sr: "sr",
  rr: "rr",
  rt: "rt",
  steam: "steam",
  metacritic: "metacritic",
  hltb: "hltb",
};

// Extra data passed to each row for rendering
interface RowData {
  steam?: SteamInfo;
  hltb?: HltbInfo;
  metacritic?: MetacriticInfo;
  upscaling?: UpscalingInfo;
}

type CellRenderer = (game: DlssGame, data: RowData) => React.JSX.Element;

const CELL_RENDERERS: Record<string, CellRenderer> = {
  dlssver:    (g) => <DlssVersionBadge game={g} />,
  framegen:   (g) => <FrameGenBadge game={g} />,
  sr:         (g) => <FeatureBadge value={g["dlss super resolution"] || ""} />,
  rr:         (g) => <FeatureBadge value={g["dlss ray reconstruction"] || ""} />,
  dlaa:       (g) => <FeatureBadge value={g.dlaa || ""} />,
  rt:         (g) => <FeatureBadge value={g["ray tracing"] || ""} />,
  upscaling:  (_g, d) => <UpscalingBadge info={d.upscaling} />,
  steam:      (_g, d) => <SteamBadge info={d.steam} />,
  metacritic: (_g, d) => <MetacriticBadge info={d.metacritic} />,
  hltb:       (_g, d) => <HltbBadge data={d.hltb} />,
};

interface Props {
  games: DlssGame[];
  hltb: Record<string, HltbInfo>;
  steam: Record<string, SteamInfo>;
  metacritic: Record<string, MetacriticInfo>;
  upscaling: Record<string, UpscalingInfo>;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
  visibleCols: Set<SortCol>;
  filters: Filters;
  onFilter: (key: keyof Filters, value: string) => void;
}

export function GameTable({ games, hltb, steam, metacritic, upscaling, sortCol, sortDir, onSort, visibleCols, filters, onFilter }: Props) {
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
              data={{ steam: steam[g.name], hltb: hltb[g.name], metacritic: metacritic[g.name], upscaling: upscaling[g.name] }}
              cols={cols}
            />
          ))}
        </tbody>
      </table>
      {games.length === 0 && <div className="no-results">No games match your filters</div>}
    </div>
  );
}

const GameRow = memo(function GameRow({ game, data, cols }: {
  game: DlssGame;
  data: RowData;
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
        return <td key={col.key}>{CELL_RENDERERS[col.key](game, data)}</td>;
      })}
    </tr>
  );
});
