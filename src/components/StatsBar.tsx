import type { DlssGame } from "../types";
import coffeePng from "../assets/coffeeDonation.png";

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
      <a
        className="donate-btn"
        href="https://paypal.me/jzsix"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className="donate-tooltip">Buy me a coffee!</span>
        <img src={coffeePng} alt="Buy me a coffee" />
      </a>
    </div>
  );
}
