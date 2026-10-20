/**
 * ERP table column-width standard — SOURCE OF TRUTH.
 *
 * Every ERP table column width MUST come from here (via a column's `kind`), so a
 * "date" column is the same width in every table, a "name" column the same, etc.
 * Do NOT hand-set pixel widths on semantic columns — pick the matching `kind`.
 *
 * Widths are a [min, max] range. Under the table's fill model the column grows to
 * use available space up to `max`, and never shrinks below `min`. Fixed types
 * (date, unit) set min === max. See docs/patterns/ErpTablePage.md for the spec.
 *
 * If a column doesn't fit any semantic kind, omit `kind` — it falls back to
 * `default` (160–240px). Layout-only columns (attachment icon, etc.) keep an
 * explicit `width` instead of a `kind`.
 */
export type ColumnKind =
  | 'date'     // any date column (created, due, transaction date …)
  | 'number'   // document / transaction number (often a link)
  | 'name'     // vendor / customer / beneficiary / warehouse / product … any name
  | 'status'   // status column rendered with a badge
  | 'amount'   // any monetary amount (balance due, total, price …)
  | 'tags'     // tag chips
  | 'badges'   // several stacked status badges per cell (e.g. a Signals column)
  | 'unit'     // unit of measurement (pcs, kg …)
  | 'address'  // address or any content that can wrap to multiple lines
  | 'wide'     // a default-type column whose HEADER label is longer than the default min (e.g. "Demand velocity per day")
  | 'default'  // anything not defined above

export interface ColWidthRange {
  /** Hard floor — the column never renders narrower than this. */
  minWidth: string
  /** Hard ceiling — the column never renders wider than this. */
  maxWidth: string
}

/**
 * The canonical width ranges. Keep in sync with the table in
 * docs/patterns/ErpTablePage.md — that doc and this map are the same source of
 * truth expressed twice (prose + code).
 */
export const COLUMN_WIDTH: Record<ColumnKind, ColWidthRange> = {
  date:    { minWidth: '160px', maxWidth: '160px' }, // fixed
  // 240 min, not 160. Two things have to fit here at the MINIMUM, because a
  // saturated table never grows a column past it:
  //   • the codified "<Module name> #<number>" format (~141px for
  //     "Sales Invoice #40150"), and
  //   • up to two trailing status icons in the same cell (2x20px + 8px gap = 48px),
  //     e.g. the e-faktur and attachment markers on Sales invoices.
  // 141 + 8 + 48 = 197, plus the cell's 24px padding = 221. 240 clears that with
  // room to spare; 160 and 200 both truncated the ID format they were meant to show.
  number:  { minWidth: '240px', maxWidth: '280px' },
  name:    { minWidth: '240px', maxWidth: '280px' },
  status:  { minWidth: '128px', maxWidth: '160px' },
  amount:  { minWidth: '160px', maxWidth: '240px' },
  tags:    { minWidth: '160px', maxWidth: '240px' },
  badges:  { minWidth: '192px', maxWidth: '240px' }, // floor fits a ~3-word badge label (e.g. "Stocks out before resupply") + cell padding
  unit:    { minWidth: '128px', maxWidth: '128px' }, // fixed
  address: { minWidth: '200px', maxWidth: '240px' },
  wide:    { minWidth: '216px', maxWidth: '240px' }, // same cap as default, higher floor so a long header never clips
  default: { minWidth: '160px', maxWidth: '240px' },
}

/** Resolve a column kind to its width range (falls back to `default`). */
export function columnWidth(kind?: ColumnKind): ColWidthRange {
  return COLUMN_WIDTH[kind ?? 'default']
}
