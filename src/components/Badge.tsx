import type { DlssGame, SteamRating, SteamInfo, HltbInfo } from "../types";
import { getFrameGenLabel } from "../types";

const FG_STYLES: Record<string, string> = {
  "6X": "b6x",
  "4X": "b4x",
  "2X": "b2x",
};

const FEATURE_STYLES: Record<string, { cls: string; label: string }> = {
  "NV, T": { cls: "bnvt", label: "NV-T" },
  "NV, U": { cls: "bnvu", label: "NV-U" },
  "✓ (NV)": { cls: "bnvu", label: "NV" },
  "Path Tracing": { cls: "bpt", label: "Path Tracing" },
  Yes: { cls: "byes", label: "✓" },
};

const STEAM_STYLES: Record<SteamRating, string> = {
  "Overwhelmingly Positive": "sop",
  "Very Positive": "svp",
  "Mostly Positive": "smp",
  Mixed: "smx",
  "Mostly Negative": "smn",
  "Very Negative": "svn",
};

export function FrameGenBadge({ game }: { game: DlssGame }) {
  const label = getFrameGenLabel(game);
  if (!label) return <span className="empty">—</span>;
  const cls = FG_STYLES[label] ?? "byes";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function FeatureBadge({ value }: { value: string }) {
  if (!value) return <span className="empty">—</span>;
  const style = FEATURE_STYLES[value];
  if (style) return <span className={`badge ${style.cls}`}>{style.label}</span>;
  return <span className="badge byes">{value}</span>;
}

export function SteamBadge({ info }: { info?: SteamInfo }) {
  if (!info) return <span className="empty">—</span>;
  const cls = STEAM_STYLES[info.rating] ?? "smx";
  return (
    <div className="sc">
      <span className={`badge ${cls}`}>{info.rating}</span>
      <span className="sp">{info.pct}%</span>
    </div>
  );
}

export function HltbBadge({ data }: { data?: HltbInfo }) {
  if (!data) return <span className="empty">—</span>;
  const parts: React.JSX.Element[] = [];
  if (data.main) parts.push(<span key="m" className="hltb-main">{data.main}h</span>);
  if (data.extra) parts.push(<span key="e" className="hltb-extra">{data.extra}h</span>);
  if (data.complete) parts.push(<span key="c" className="hltb-extra">{data.complete}h</span>);
  if (!parts.length) return <span className="empty">—</span>;
  return (
    <div className="hltb-cell" title="Main / Main+Extra / Completionist">
      {parts.reduce<React.JSX.Element[]>((acc, el, i) => {
        if (i > 0) acc.push(<span key={`s${i}`} className="hltb-sep">/</span>);
        acc.push(el);
        return acc;
      }, [])}
    </div>
  );
}
