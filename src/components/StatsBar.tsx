import type { DlssGame, HltbInfo } from "../types";
import { getFrameGenLevel } from "../types";

interface Props {
  filtered: DlssGame[];
  total: number;
  hltb: Record<string, HltbInfo>;
}

export function StatsBar({ filtered, total, hltb }: Props) {
  let c6 = 0, c4 = 0, c2 = 0;
  for (const g of filtered) {
    const level = getFrameGenLevel(g);
    if (level === 3) c6++;
    else if (level === 2) c4++;
    else if (level === 1) c2++;
  }

  return (
    <div className="stats-bar">
      <span>
        Showing <span className="hl">{filtered.length}</span> of <span className="hl">{total}</span> games
      </span>
      <span className="sep">|</span>
      <span>Frame Gen: <span className="hl">{c6}</span> 6X · <span className="hl">{c4}</span> 4X · <span className="hl">{c2}</span> 2X</span>
    </div>
  );
}
