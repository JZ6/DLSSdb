import { memo, useEffect, useRef, useMemo, useState } from "react";
import type { DlssGame, HltbInfo, SteamInfo, MetacriticInfo, UpscalingInfo, SortCol, SortDir, Filters } from "../types";
import { FrameGenBadge, DlssVersionBadge, FeatureBadge, SteamBadge, MetacriticBadge, UpscalingBadge, HltbBadge, HideBadge } from "./Badge";

export interface Column {
  key: SortCol;
  label: string;
  minWidth: string;
  tooltip: string;
  icon?: React.JSX.Element;
}

export const COLUMNS: Column[] = [
  { key: "name",       label: "Game",           minWidth: "160px", tooltip: "Click to view on Steam" },
  { key: "dlaa",       label: "DLAA",           minWidth: "60px",  tooltip: "Deep Learning Anti-Aliasing\nAI anti-aliasing at native resolution" },
  { key: "dlssver",    label: "DLSS",           minWidth: "60px",  tooltip: "DLSS Version\n4.5 = Multi Frame Gen 6X\n4 = Multi Frame Gen 4X\n3.5 = Ray Reconstruction\n3 = Frame Generation\n2 = Super Resolution" },
  { key: "framegen",   label: "Frame Gen",      minWidth: "80px",  tooltip: "DLSS Frame Generation\n6X = DLSS 4.5 (RTX 50)\n4X = DLSS 4 (RTX 40/50)\n2X = DLSS 3 (RTX 40/50)" },
  { key: "hltb",       label: "Playtime",       minWidth: "70px",  tooltip: "Average playtime from HowLongToBeat\n(Main Story + Extras + Completionist)\nHover a value for full breakdown" },
  { key: "metacritic", label: "Metacritic",     minWidth: "70px",  tooltip: "Metacritic critic score\nGreen = 75+\nYellow = 50–74\nRed = below 50" },
  { key: "upscaling",  label: "FSR / XeSS",     minWidth: "80px",  tooltip: "Non-DLSS upscaling support\nFSR = AMD FidelityFX\nXeSS = Intel" },
  { key: "rr",         label: "Ray Recon",      minWidth: "80px",  tooltip: "DLSS Ray Reconstruction\nAI-enhanced ray tracing denoiser\nfor cleaner reflections and lighting" },
  { key: "rt",         label: "Ray Tracing",    minWidth: "90px",  tooltip: "Ray Tracing support\nPath Tracing = full path tracing\nYes = partial (reflections, shadows, GI)" },
  { key: "steam",      label: "Steam Rating",   minWidth: "180px", tooltip: "Steam user review rating\nwith positive review percentage" },
  { key: "sr",         label: "Super Res",      minWidth: "70px",  tooltip: "DLSS Super Resolution\nAI upscaling from lower resolution\nNV-T = Transformer model (best)" },
  { key: "hide",       label: "Visibility",     minWidth: "40px",  tooltip: "Toggle game visibility\nHidden games are saved in your browser", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg> },
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
    { value: "u10", label: "< 10 h" },
    { value: "u60", label: "< 60 h" },
    { value: "u100", label: "< 100 h" },
    { value: "100+", label: "> 100 h" },
  ],
  hide: [
    { value: "", label: "Visible" },
    { value: "hidden", label: "Hidden Only" },
    { value: "all", label: "Show All" },
  ],
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
  images: Record<string, string>;
  sortCol: SortCol;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
  visibleCols: Set<SortCol>;
  filters: Filters;
  filterCounts: Record<string, Record<string, number>>;
  onFilter: (key: keyof Filters, value: string) => void;
  hiddenGames: Set<string>;
  onToggleHide: (name: string) => void;
}

export function GameTable({ games, hltb, steam, metacritic, upscaling, images, sortCol, sortDir, onSort, visibleCols, filters, filterCounts, onFilter, hiddenGames, onToggleHide }: Props) {
  const cols = useMemo(
    () => COLUMNS.filter((c) => visibleCols.has(c.key)),
    [visibleCols]
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || window.innerWidth > 800) return;
    let frame: number;
    const timer = setTimeout(() => {
      const distance = 60;
      const duration = 800;
      const start = performance.now();
      function animate(now: number) {
        const t = Math.min((now - start) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        el!.scrollLeft = ease < 0.5 ? ease * 2 * distance : (1 - (ease - 0.5) * 2) * distance;
        if (t < 1) frame = requestAnimationFrame(animate);
      }
      frame = requestAnimationFrame(animate);
    }, 600);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, []);

  return (
    <div className="table-wrap" ref={wrapRef}>
      <table>
        <thead>
          <tr>
            {cols.map((col) => {
              const filterKey = col.key as keyof Filters;
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
                    {col.icon || col.label}
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
                      placeholder={window.innerWidth <= 800 ? "Search..." : "Search games (/) "}
                      value={filters.search}
                      onChange={(e) => onFilter("search", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : filterOpts ? (
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
              image={images[g.name]}
              cols={cols}
              hidden={hiddenGames.has(g.name)}
              onToggleHide={onToggleHide}
            />
          ))}
        </tbody>
      </table>
      {games.length === 0 && <div className="no-results">No games match your filters</div>}
    </div>
  );
}

const GameRow = memo(function GameRow({ game, steam, hltb, metacritic, upscaling, image, cols, hidden, onToggleHide }: {
  game: DlssGame;
  steam?: SteamInfo;
  hltb?: HltbInfo;
  metacritic?: MetacriticInfo;
  upscaling?: UpscalingInfo;
  image?: string;
  cols: Column[];
  hidden: boolean;
  onToggleHide: (name: string) => void;
}) {
  const data: RowData = { steam, hltb, metacritic, upscaling };
  const [imgErr, setImgErr] = useState(false);
  const imgSrc = steam?.image || image;
  const steamUrl = steam?.appid
    ? `https://store.steampowered.com/app/${steam.appid}`
    : `https://store.steampowered.com/search/?term=${encodeURIComponent(game.name)}`;
  return (
    <tr className={hidden ? "row-hidden" : ""}>
      {cols.map((col) => {
        if (col.key === "hide") {
          return (
            <td key="hide">
              <HideBadge hidden={hidden} onToggle={() => onToggleHide(game.name)} />
            </td>
          );
        }
        if (col.key === "name") {
          return (
            <td key="name" className="nc">
              <a href={steamUrl} target="_blank" rel="noopener noreferrer" title={game.name}>
                {imgSrc && !imgErr
                  ? <img className="game-thumb" src={imgSrc} alt="" loading="lazy" onError={() => setImgErr(true)} />
                  : <span className="game-thumb-ph">?</span>}
                <span className="game-name">{game.name}</span>
              </a>
            </td>
          );
        }
        const renderer = CELL_RENDERERS[col.key];
        return (
          <td key={col.key}>
            {renderer ? renderer(game, data) : <span className="empty">—</span>}
          </td>
        );
      })}
    </tr>
  );
});
