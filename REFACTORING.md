# DLSSdb Refactoring Plan

Generated: 2026-04-15

## HIGH Priority

### H1. Memoize `toggleSort` in useFilters
**File:** `src/hooks/useFilters.ts:66`
**Issue:** Not wrapped in `useCallback` — unstable reference breaks memo contracts
**Fix:** `useCallback(toggleSort, [sortCol, setSortDir, setSortCol])`
**Effort:** 2 min

### H2. Collapse sort state to prevent torn reads
**File:** `src/hooks/useFilters.ts:48-58`
**Issue:** `sortCol` and `sortDir` are two separate `useState` + localStorage round-trips
**Fix:** Single `useState<{ col: SortCol; dir: SortDir }>`, one persist effect
**Effort:** 15 min

### H3. Type `DlssData.columns` properly
**File:** `src/types.ts:15`
**Issue:** `columns: unknown` — no validation, opaque runtime errors
**Fix:** Model actual JSON shape or use `Record<string, string>[]`
**Effort:** 10 min

## MEDIUM Priority

### M1. Rename FT_ORDER / split per-feature if semantics diverge
**File:** `src/hooks/useFilters.ts:5-6`
**Issue:** `FT_ORDER` used for SR/RR/DLAA but named for "Frame Gen"
**Fix:** Rename to `FEATURE_ORDER` or split if values diverge
**Effort:** 10 min

### M2. Extract responsive breakpoints to constants
**File:** `src/App.tsx:9-14`
**Issue:** Breakpoints (768, 1200) duplicated, no single source of truth
**Fix:** `RESPONSIVE_DEFAULTS` map in `constants.ts`
**Effort:** 20 min

### M3. Extract filter value constants
**File:** `src/components/GameTable.tsx:23-60` + `src/hooks/useFilters.ts:82-113`
**Issue:** Filter codes ("op+", "vp+", "u10") hardcoded in UI and logic separately
**Fix:** Define constants in `types.ts`, import in both files
**Effort:** 30 min

### M5. Narrow `Filters` interface to union types
**File:** `src/types.ts:38-46`
**Issue:** All filter fields typed as `string` — no compile-time safety
**Fix:** Define union types per field:
```ts
type FramegenFilter = "" | "6x" | "4x" | "2x" | "any";
type SteamFilter = "" | "op+" | "vp+" | "mp+" | "neg";
```
**Effort:** 20 min

### M6. Hoist `fmt` in HltbBadge to module scope
**File:** `src/components/Badge.tsx:56`
**Issue:** Recreated on every render
**Fix:** `const fmt = Math.ceil` at module top
**Effort:** 2 min

### M7. Extract `<Header>` component
**File:** `src/App.tsx:59-88`
**Issue:** Header duplicated 3x (loading/error/normal)
**Fix:** Extract to component, always render
**Effort:** 20 min

## LOW Priority

### L1. Add AbortController to fetches
**File:** `src/hooks/useGameData.ts:19-51`
**Issue:** No cleanup on unmount, React 18 strict mode fires twice
**Fix:** Add abort controller + `cancelled` flag
**Effort:** 15 min

### L2. Fix sort button accessibility
**File:** `src/components/GameTable.tsx:116`
**Issue:** `<div onClick>` not keyboard-accessible
**Fix:** Use `<button type="button">` or add `role` + `tabIndex` + `onKeyDown`
**Effort:** 10 min

### L3. Normalize game name keys for lookups
**File:** Multiple
**Issue:** `hltb[g.name]` fragile to spacing/punctuation differences
**Fix:** Normalize keys with `.toLowerCase().trim()` consistently
**Effort:** Variable

### L4. Narrow CELL_RENDERERS key type
**File:** `src/components/GameTable.tsx:73`
**Issue:** Typed as `Record<string, ...>` not `Partial<Record<SortCol, ...>>`
**Fix:** Change key type
**Effort:** 2 min

### L5. Collocate filterKey on Column
**File:** `src/components/GameTable.tsx:62-69`
**Issue:** `COL_TO_FILTER` manually maintained
**Fix:** Add `filterKey?: keyof Filters` to `Column` interface
**Effort:** 20 min

## Execution Order (by impact)

1. H1 (2min) → H2 (15min) → M5 (20min) → M3 (30min) → M7 (20min)
2. L4 (2min) → L2 (10min) → M2 (20min) → L5 (20min)
3. M1 (10min) → H3 (10min) → M6 (2min) → L1 (15min) → L3 (variable)

Total HIGH: ~27 min
Total MEDIUM: ~100 min
Total LOW: ~57 min (excluding L3)
