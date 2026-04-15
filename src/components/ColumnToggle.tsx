import { useState, useRef, useEffect } from "react";
import type { SortCol } from "../types";

interface Props {
  columns: { key: SortCol; label: string }[];
  visible: Set<SortCol>;
  onToggle: (key: SortCol) => void;
}

export function ColumnToggle({ columns, visible, onToggle }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const hiddenCount = columns.filter((c) => !visible.has(c.key)).length;

  return (
    <div className="col-toggle" ref={ref}>
      <button type="button" className="btn-columns" onClick={() => setOpen(!open)}>
        Columns{hiddenCount > 0 && <span className="col-badge">{hiddenCount} hidden</span>}
      </button>
      {open && (
        <div className="col-dropdown">
          {columns.map((col) => (
            <label key={col.key} className="col-option">
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                onChange={() => onToggle(col.key)}
                disabled={col.key === "name"}
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
