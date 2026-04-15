import type { Filters } from "../types";

interface Props {
  filters: Filters;
  onFilter: (key: keyof Filters, value: string) => void;
  onClear: () => void;
  children?: React.ReactNode;
}

export function FilterBar({ filters, onFilter, onClear, children }: Props) {
  return (
    <div className="filters">
      <FilterGroup label="Search" htmlFor="f-search">
        <input
          id="f-search"
          type="text"
          placeholder="Type to filter… ( / )"
          value={filters.search}
          onChange={(e) => onFilter("search", e.target.value)}
        />
      </FilterGroup>
      <FilterGroup label="Frame Gen" htmlFor="f-framegen">
        <select id="f-framegen" value={filters.framegen} onChange={(e) => onFilter("framegen", e.target.value)}>
          <option value="">All</option>
          <option value="6x">6X</option>
          <option value="4x">4X</option>
          <option value="2x">2X</option>
          <option value="any">Any</option>
          <option value="none">None</option>
        </select>
      </FilterGroup>
      <FilterGroup label="Super Res" htmlFor="f-sr">
        <select id="f-sr" value={filters.sr} onChange={(e) => onFilter("sr", e.target.value)}>
          <option value="">All</option>
          <option value="NV, T">Transformer</option>
          <option value="Yes">Yes</option>
          <option value="none">None</option>
        </select>
      </FilterGroup>
      <FilterGroup label="Ray Recon" htmlFor="f-rr">
        <select id="f-rr" value={filters.rr} onChange={(e) => onFilter("rr", e.target.value)}>
          <option value="">All</option>
          <option value="any">Any</option>
          <option value="none">None</option>
        </select>
      </FilterGroup>
      <FilterGroup label="Ray Tracing" htmlFor="f-rt">
        <select id="f-rt" value={filters.rt} onChange={(e) => onFilter("rt", e.target.value)}>
          <option value="">All</option>
          <option value="Path Tracing">Path Tracing</option>
          <option value="Yes">Yes</option>
          <option value="any">Any RT</option>
          <option value="none">None</option>
        </select>
      </FilterGroup>
      <FilterGroup label="Steam" htmlFor="f-steam">
        <select id="f-steam" value={filters.steam} onChange={(e) => onFilter("steam", e.target.value)}>
          <option value="">All</option>
          <option value="op">Overwhelmingly Positive</option>
          <option value="vp">Very Positive</option>
          <option value="mp">Mostly Positive</option>
          <option value="mix">Mixed</option>
          <option value="neg">Negative</option>
          <option value="vp+">Very Positive & Above</option>
          <option value="mp+">Mostly Positive & Above</option>
          <option value="unk">Unknown</option>
        </select>
      </FilterGroup>
      {children}
      <button type="button" className="btn-clear" onClick={onClear}>
        Clear Filters
      </button>
    </div>
  );
}

function FilterGroup({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="filter-group">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
