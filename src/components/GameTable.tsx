import { memo, useMemo, useState } from "react";
import type { DlssGame, HltbInfo, SteamInfo, MetacriticInfo, UpscalingInfo, SortCol, SortDir, Filters } from "../types";
import { FrameGenBadge, DlssVersionBadge, FeatureBadge, SteamBadge, MetacriticBadge, UpscalingBadge, HltbBadge } from "./Badge";
import { getFrameGenLabel, getDlssVersion } from "../types";

const STEAM_FILTER_MAP: Record<string, string> = {
  "Overwhelmingly Positive": "op+", "Very Positive": "vp+", "Positive": "mp+",
  "Mostly Positive": "mp+", "Mixed": "neg", "Mostly Negative": "neg",
  "Negative": "neg", "Very Negative": "neg",
};

function cellFilterValue(col: SortCol, game: DlssGame, data: RowData): [keyof Filters, string] | null {
  switch (col) {
    case "framegen": { const l = getFrameGenLabel(game); return l ? ["framegen", l.toLowerCase()] : null; }
    case "dlssver": return ["dlssver", getDlssVersion(game) + "+"];
    case "sr": return game["dlss super resolution"] ? ["sr", game["dlss super resolution"]] : null;
    case "rr": return game["dlss ray reconstruction"] ? ["rr", "any"] : null;
    case "dlaa": return game.dlaa ? ["dlaa", "any"] : null;
    case "rt": return game["ray tracing"] ? ["rt", game["ray tracing"]] : null;
    case "steam": return data.steam?.rating ? ["steam", STEAM_FILTER_MAP[data.steam.rating] || ""] : null;
    case "metacritic": {
      const s = data.metacritic?.score;
      if (s === undefined) return null;
      if (s >= 90) return ["metacritic", "90+"];
      return ["metacritic", "75+"];
    }
    default: return null;
  }
}

export interface Column {
  key: SortCol;
  label: string;
  minWidth: string;
  tooltip: string;
}

export const COLUMNS: Column[] = [
  { key: "name",       label: "Game",           minWidth: "160px", tooltip: "Click to view on Steam" },
  { key: "dlaa",       label: "DLAA",           minWidth: "60px",  tooltip: "Deep Learning Anti-Aliasing\nAI anti-aliasing at native resolution" },
  { key: "dlssver",    label: "DLSS",           minWidth: "60px",  tooltip: "DLSS Version\n4.5 = Multi Frame Gen 6X\n4 = Multi Frame Gen 4X\n3.5 = Ray Reconstruction\n3 = Frame Generation\n2 = Super Resolution" },
  { key: "framegen",   label: "Frame Gen",      minWidth: "80px",  tooltip: "DLSS Frame Generation\n6X = DLSS 4.5 (RTX 50)\n4X = DLSS 4 (RTX 40/50)\n2X = DLSS 3 (RTX 40/50)" },
  { key: "hltb",       label: "Playtime",       minWidth: "70px",  tooltip: "Main story hours from HowLongToBeat\nHover a value for full breakdown" },
  { key: "metacritic", label: "Metacritic",     minWidth: "70px",  tooltip: "Metacritic critic score\nGreen = 75+\nYellow = 50–74\nRed = below 50" },
  { key: "upscaling",  label: "FSR / XeSS",     minWidth: "80px",  tooltip: "Non-DLSS upscaling support\nFSR = AMD FidelityFX\nXeSS = Intel" },
  { key: "rr",         label: "Ray Recon",      minWidth: "80px",  tooltip: "DLSS Ray Reconstruction\nAI-enhanced ray tracing denoiser\nfor cleaner reflections and lighting" },
  { key: "rt",         label: "Ray Tracing",    minWidth: "90px",  tooltip: "Ray Tracing support\nPath Tracing = full path tracing\nYes = partial (reflections, shadows, GI)" },
  { key: "steam",      label: "Steam Rating",   minWidth: "180px", tooltip: "Steam user review rating\nwith positive review percentage" },
  { key: "sr",         label: "Super Res",      minWidth: "70px",  tooltip: "DLSS Super Resolution\nAI upscaling from lower resolution\nNV-T = Transformer model (best)" },
];

const COLUMN_FILTERS: Partial<Record<SortCol, { value: string; label: string }[]>> = {
  dlaa: [
    { value: "", label: "All" },
    { value: "any", label: "Any" },
  ],
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
  upscaling: [
    { value: "", label: "All" },
    { value: "fsr", label: "FSR" },
    { value: "xess", label: "XeSS" },
    { value: "both", label: "Both" },
    { value: "any", label: "Any" },
  ],
  steam: [
    { value: "", label: "All" },
    { value: "op+", label: "Overwhelmingly Positive +" },
    { value: "vp+", label: "Very Positive +" },
    { value: "mp+", label: "Mostly Positive +" },
    { value: "neg", label: "Negative" },
    { value: "nos", label: "Not On Steam" },
  ],
  metacritic: [
    { value: "", label: "All" },
    { value: "90+", label: "90+" },
    { value: "75+", label: "75+" },
  ],
  hltb: [
    { value: "", label: "All" },
    { value: "u10", label: "< 10h" },
    { value: "u60", label: "< 60h" },
    { value: "u100", label: "< 100h" },
    { value: "100+", label: "> 100h" },
  ],
};

const COL_TO_FILTER: Partial<Record<SortCol, keyof Filters>> = {
  dlaa: "dlaa",
  dlssver: "dlssver",
  framegen: "framegen",
  sr: "sr",
  rr: "rr",
  rt: "rt",
  upscaling: "upscaling",
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
  filterCounts: Record<string, Record<string, number>>;
  onFilter: (key: keyof Filters, value: string) => void;
}

export function GameTable({ games, hltb, steam, metacritic, upscaling, sortCol, sortDir, onSort, visibleCols, filters, filterCounts, onFilter }: Props) {
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
                  <div className="th-label" role="button" tabIndex={0} onClick={() => onSort(col.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSort(col.key); } }}>
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
                      placeholder="Search games…   Press / to focus"
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
                      {filterOpts.map((o) => {
                        const count = o.value ? filterCounts[col.key]?.[o.value] : undefined;
                        return <option key={o.value} value={o.value}>{o.label}{count !== undefined ? ` (${count})` : ""}</option>;
                      })}
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
              steam={steam[g.name]}
              hltb={hltb[g.name]}
              metacritic={metacritic[g.name]}
              upscaling={upscaling[g.name]}
              cols={cols}
              onFilter={onFilter}
            />
          ))}
        </tbody>
      </table>
      {games.length === 0 && <div className="no-results">No games match your filters</div>}
    </div>
  );
}

const GameRow = memo(function GameRow({ game, steam, hltb, metacritic, upscaling, cols, onFilter }: {
  game: DlssGame;
  steam?: SteamInfo;
  hltb?: HltbInfo;
  metacritic?: MetacriticInfo;
  upscaling?: UpscalingInfo;
  cols: Column[];
  onFilter: (key: keyof Filters, value: string) => void;
}) {
  const data: RowData = { steam, hltb, metacritic, upscaling };
  const [imgErr, setImgErr] = useState(false);
  const steamUrl = steam?.appid
    ? `https://store.steampowered.com/app/${steam.appid}`
    : `https://store.steampowered.com/search/?term=${encodeURIComponent(game.name)}`;
  return (
    <tr>
      {cols.map((col) => {
        if (col.key === "name") {
          return (
            <td key="name" className="nc">
              <a href={steamUrl} target="_blank" rel="noopener noreferrer" title={game.name}>
                {steam?.appid && !imgErr
                  ? <img className="game-thumb" src={steam.image || `https://cdn.akamai.steamstatic.com/steam/apps/${steam.appid}/capsule_sm_120.jpg`} alt="" loading="lazy" onError={() => setImgErr(true)} />
                  : <span className="game-thumb-ph">?</span>}
                {game.name}
              </a>
            </td>
          );
        }
        const fv = cellFilterValue(col.key, game, data);
        const renderer = CELL_RENDERERS[col.key];
        return (
          <td key={col.key} className={fv ? "clickable" : undefined} onClick={fv ? () => onFilter(fv[0], fv[1]) : undefined}>
            {renderer ? renderer(game, data) : <span className="empty">—</span>}
          </td>
        );
      })}
    </tr>
  );
});
