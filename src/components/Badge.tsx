import type { DlssGame, SteamRating, SteamInfo, HltbInfo, MetacriticInfo, UpscalingInfo } from "../types";
import { getFrameGenLabel, getDlssVersion, getHltbHours } from "../types";

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
  Positive: "sps",
  "Mostly Positive": "smp",
  Mixed: "smx",
  "Mostly Negative": "smn",
  Negative: "svn",
  "Very Negative": "svn",
};

const DLSS_VER_STYLES: Record<string, string> = {
  "4.5": "b6x",
  "4": "b4x",
  "3.5": "bnvt",
  "3": "bnvu",
  "2": "byes",
  "1": "byes",
};

const fmt = (h: number) => Math.ceil(h);

export function FrameGenBadge({ game }: { game: DlssGame }) {
  const label = getFrameGenLabel(game);
  if (!label) return <span className="empty">—</span>;
  const cls = FG_STYLES[label] ?? "byes";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function DlssVersionBadge({ game }: { game: DlssGame }) {
  const ver = getDlssVersion(game);
  const cls = DLSS_VER_STYLES[ver] ?? "byes";
  return <span className={`badge ${cls}`}>{ver}</span>;
}

export function FeatureBadge({ value }: { value: string }) {
  if (!value) return <span className="empty">—</span>;
  const style = FEATURE_STYLES[value];
  if (style) return <span className={`badge ${style.cls}`}>{style.label}</span>;
  return <span className="badge byes">{value}</span>;
}

function fmtCount(n: number): string {
  if (n >= 1000000) return `${+(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function SteamBadge({ info }: { info?: SteamInfo }) {
  if (!info) return <span className="empty">Not On Steam</span>;
  if (!info.rating) return <span className="empty">—</span>;
  const cls = STEAM_STYLES[info.rating] ?? "smx";
  const tip = info.total ? `${fmtCount(info.total)} reviews` : undefined;
  return (
    <div className="sc">
      <span className={`badge ${cls}`} data-tip={tip} tabIndex={tip ? 0 : undefined}>{info.rating}</span>
      {info.pct !== undefined && <span className="sp">{info.pct}%</span>}
    </div>
  );
}

export function MetacriticBadge({ info }: { info?: MetacriticInfo }) {
  if (!info) return <span className="empty">—</span>;
  const s = info.score;
  const cls = s >= 75 ? "mc-good" : s >= 50 ? "mc-mixed" : "mc-bad";
  return <span className={`badge ${cls}`}>{s}</span>;
}

export function UpscalingBadge({ info }: { info?: UpscalingInfo }) {
  if (!info) return <span className="empty">—</span>;
  const parts: { label: string; cls: string; tip: string }[] = [];
  if (info.fsr_version) parts.push({ label: "FSR", cls: "bfsr", tip: info.fsr_version });
  if (info.xess_version) parts.push({ label: "XeSS", cls: "bxess", tip: info.xess_version });
  if (!parts.length) return <span className="empty">—</span>;
  return (
    <span className="upscaling-badges">
      {parts.map((p) => <span key={p.label} className={`badge ${p.cls}`} data-tip={p.tip} tabIndex={0}>{p.label}</span>)}
    </span>
  );
}

function hltbColor(hours: number): string {
  // Green (short) → Yellow (medium) → Red (long)
  // 0h = green, 150h = yellow, 250h+ = red
  const t = Math.min(hours / 250, 1);
  const mid = 150 / 250; // 0.6
  const r = Math.round(t < mid ? (t / mid) * 220 : 220);
  const g = Math.round(t < mid ? 220 : (1 - (t - mid) / (1 - mid)) * 220);
  return `rgb(${r}, ${g}, 68)`;
}

export function HideBadge({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <button
      className={`hide-btn ${hidden ? "hide-btn-hidden" : ""}`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={hidden ? "Unhide game" : "Hide game"}
      aria-label={hidden ? "Unhide game" : "Hide game"}
    >
      {hidden ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

export function OwnedBadge({ owned }: { owned: boolean }) {
  if (!owned) return <span className="empty">—</span>;
  return <span className="badge byes">Owned</span>;
}

export function HltbBadge({ data }: { data?: HltbInfo }) {
  const displayHours = getHltbHours(data);
  if (displayHours === undefined) return <span className="empty">—</span>;

  const tooltip = [
    data?.main && `Main Story: ${fmt(data.main)}h`,
    data?.extra && `Main + Extras: ${fmt(data.extra)}h`,
    data?.complete && `Completionist: ${fmt(data.complete)}h`,
    data?.coop && `Co-Op: ${fmt(data.coop)}h`,
    data?.pvp && `PvP: ${fmt(data.pvp)}h`,
    data?.all_styles && `All Styles: ${fmt(data.all_styles)}h`,
  ].filter(Boolean).join("\n");

  return (
    <span className="hltb-cell" data-tip={tooltip}>
      <span className="hltb-main" style={{ color: hltbColor(displayHours) }}>{fmt(displayHours)} hours</span>
    </span>
  );
}
