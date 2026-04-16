import type { DlssGame } from "../types";

interface Props {
  filtered: DlssGame[];
  total: number;
}

export function StatsBar({ filtered, total }: Props) {
  return (
    <div className="stats-bar">
      <span>
        Showing <span className="hl">{filtered.length}</span> of <span className="hl">{total}</span> games
      </span>
    </div>
  );
}
