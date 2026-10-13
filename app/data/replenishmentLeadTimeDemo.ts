/**
 * Curated GENUINE lead-time documents for a few "hero" replenishment cells.
 *
 * The rest of the lead-time history is modelled density (leadTimeHistory.ts Layer B,
 * `poNumber: null`) — honest, but it means a computed row's "Export purchases (CSV)"
 * only ever cites "(modelled)" samples. For a handful of vendor × product × warehouse
 * cells that sit on the "To order" list we instead seed REAL purchase orders and
 * goods receipts (appended to purchaseOrders / receipts, so they are openable in
 * Purchases and WMS), and derive the lead time straight from those documents.
 *
 * This is the single source of truth, imported by:
 *   • purchaseOrders.ts  — appends the PO records (so PO-2026-91xx exists)
 *   • receipts.ts        — appends the completed GR records (so RCV-2026-91xx exists)
 *   • leadTimeHistory.ts — emits one computed sample per doc for the cell, suppresses
 *                          modelled density there, and skips these receipts in the
 *                          generic matcher (they are represented here, once).
 *
 * Each cell carries ≥ leadTimeMinSamples (2) documents so it resolves to the
 * `computed` tier (US-001 AC-01/AC-02/AC-05), and every lead-day gap is well under
 * the Roasted Beans outlier cap so none is excluded.
 */
export interface CuratedLeadTimeDoc {
  vendorId: string
  vendorName: string
  sku: string
  productId: string
  warehouseId: string
  warehouseName: string
  poId: string
  poNumber: string
  receiptId: string
  receiptNumber: string
  /** ISO date the PO was ordered. */
  orderDate: string
  /** ISO date the goods were received (orderDate + leadDays). */
  receiptDate: string
  leadDays: number
  /** Units received (purchase qty) on the receipt. */
  qty: number
  unitCost: number
}

/**
 * Three hero cells, each with four real PO→GR pairs. All three are non-sample SKUs
 * (not in PREFERRED_WH_SAMPLE_SKUS), so their preferred vendor is the stable seed
 * default and the curated vendor below always matches the worklist row's vendor:
 *   • 1008 @ Gudang Jakarta Pusat    — real lead time + mature demand
 *   • 1102 @ Gudang Makassar Selatan — real lead time + mature demand
 *   • 1106 @ Gudang Palembang        — real lead time + provisional demand
 */
export const CURATED_LEAD_TIME_DOCS: CuratedLeadTimeDoc[] = [
  // ── 1008 · Green Beans Robusta Temanggung · V004 Toraja Sapan Estate · wh-001 ──
  mk('V004', 'Toraja Sapan Estate', '1008', 'p08', 'wh-001', 'Gudang Jakarta Pusat', 1, '2026-02-01', 11, 6, 2_200_000),
  mk('V004', 'Toraja Sapan Estate', '1008', 'p08', 'wh-001', 'Gudang Jakarta Pusat', 2, '2026-03-11', 13, 8, 2_200_000),
  mk('V004', 'Toraja Sapan Estate', '1008', 'p08', 'wh-001', 'Gudang Jakarta Pusat', 3, '2026-04-16', 12, 7, 2_200_000),
  mk('V004', 'Toraja Sapan Estate', '1008', 'p08', 'wh-001', 'Gudang Jakarta Pusat', 4, '2026-05-16', 14, 6, 2_200_000),
  // ── 1102 · Roasted Beans Espresso Blend Dark · V001 Klasik Beans Cooperative · wh-006 ──
  mk('V001', 'Klasik Beans Cooperative', '1102', 'p10', 'wh-006', 'Gudang Makassar Selatan', 5, '2026-02-08', 10, 36, 305_000),
  mk('V001', 'Klasik Beans Cooperative', '1102', 'p10', 'wh-006', 'Gudang Makassar Selatan', 6, '2026-03-15', 12, 42, 305_000),
  mk('V001', 'Klasik Beans Cooperative', '1102', 'p10', 'wh-006', 'Gudang Makassar Selatan', 7, '2026-04-19', 11, 40, 305_000),
  mk('V001', 'Klasik Beans Cooperative', '1102', 'p10', 'wh-006', 'Gudang Makassar Selatan', 8, '2026-05-20', 13, 44, 305_000),
  // ── 1106 · Roasted Beans Signature Espresso 250g · V002 Sagaleh Coffee Supply · wh-008 (provisional demand) ──
  mk('V002', 'Sagaleh Coffee Supply', '1106', 'p27', 'wh-008', 'Gudang Palembang', 9, '2026-02-07', 13, 60, 96_000),
  mk('V002', 'Sagaleh Coffee Supply', '1106', 'p27', 'wh-008', 'Gudang Palembang', 10, '2026-03-14', 15, 72, 96_000),
  mk('V002', 'Sagaleh Coffee Supply', '1106', 'p27', 'wh-008', 'Gudang Palembang', 11, '2026-04-18', 14, 66, 96_000),
  mk('V002', 'Sagaleh Coffee Supply', '1106', 'p27', 'wh-008', 'Gudang Palembang', 12, '2026-05-24', 12, 60, 96_000),
]

function mk(
  vendorId: string, vendorName: string, sku: string, productId: string,
  warehouseId: string, warehouseName: string, seq: number,
  orderDate: string, leadDays: number, qty: number, unitCost: number,
): CuratedLeadTimeDoc {
  const n = String(9100 + seq)
  return {
    vendorId, vendorName, sku, productId, warehouseId, warehouseName,
    poId: `po-${n}`, poNumber: `PO-2026-${n}`,
    receiptId: `rcv-lt-${n}`, receiptNumber: `RCV-2026-${n}`,
    orderDate, receiptDate: shiftIso(orderDate, leadDays), leadDays, qty, unitCost,
  }
}

function shiftIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Receipt ids that leadTimeHistory's generic matcher must skip (represented here). */
export const CURATED_LEAD_TIME_RECEIPT_IDS: ReadonlySet<string> = new Set(
  CURATED_LEAD_TIME_DOCS.map((d) => d.receiptId),
)

/** `vendorId::sku::warehouseId` cells where modelled density is suppressed. */
export const CURATED_LEAD_TIME_CELLS: ReadonlySet<string> = new Set(
  CURATED_LEAD_TIME_DOCS.map((d) => `${d.vendorId}::${d.sku}::${d.warehouseId}`),
)
