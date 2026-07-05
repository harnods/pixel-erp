import { TODAY } from './master'

/**
 * A manufacturing work order (Production → Work orders). Produces (Assembly) or
 * breaks down (Disassembly) a BOM's output. Child work orders reference a parent
 * via `parentNumber`.
 */
export interface WorkOrder {
  id: string
  /** work order number, e.g. WO-2026-0001 */
  number: string
  /** bill of materials this WO builds/breaks down */
  bomName: string
  /** Standard = made-to-stock · Order = made-to-order (tied to a sales order) */
  category: 'Standard' | 'Order'
  /** Assembly = build the output · Disassembly = break the output into components */
  type: 'Assembly' | 'Disassembly'
  /** whether the WO follows a defined routing (sequence of operations) */
  trackRouting: boolean
  /** not started · canceled · in progress · partially produced · partially completed · completed */
  status: WorkOrderStatus
  /** parent WO number when this is a sub-assembly, else undefined */
  parentNumber?: string
  /** units produced so far */
  producedQty: number
  /** total units planned */
  plannedQty: number
  /** ISO planned start date */
  planStartDate: string
  /** ISO planned end date */
  planEndDate: string
  /** ISO actual start date (present once work has begun) */
  startDate?: string
  /** ISO actual end/close date (present once the WO is closed or canceled) */
  endDate?: string
}

export type WorkOrderStatus =
  | 'not started'
  | 'canceled'
  | 'in progress'
  | 'partially produced'
  | 'partially completed'
  | 'completed'

function isoOffset(days: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const BOMS = [
  'Espresso Blend 1kg',
  'Cold Brew Concentrate',
  'Gift Box - Signature',
  'Drip Bag Pack (10s)',
  'House Roast 250g',
  'Caramel Syrup 750ml',
  'Ceramic Mug Set',
  'Nitro Cold Brew Keg',
  'Single Origin Sampler',
  'Decaf Blend 1kg',
  'Seasonal Spice Mix',
  'Barista Starter Kit',
]

// Seed rows: 4 per status so every badge + column rule is represented.
// startDate is hidden by the page for "not started" / "canceled";
// endDate is hidden for "not started" / "in progress" / "partially produced".
const SEED: Array<Omit<WorkOrder, 'id' | 'number'>> = [
  // ── not started ──────────────────────────────────────────────────────────
  { bomName: BOMS[0], category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'not started', producedQty: 0,   plannedQty: 500, planStartDate: isoOffset(2),  planEndDate: isoOffset(6) },
  { bomName: BOMS[1], category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'not started', producedQty: 0,   plannedQty: 120, planStartDate: isoOffset(3),  planEndDate: isoOffset(5) },
  { bomName: BOMS[2], category: 'Order',    type: 'Assembly',    trackRouting: true,  status: 'not started', producedQty: 0,   plannedQty: 80,  planStartDate: isoOffset(1),  planEndDate: isoOffset(4), parentNumber: 'WO-2026-0001' },
  { bomName: BOMS[3], category: 'Standard', type: 'Disassembly', trackRouting: false, status: 'not started', producedQty: 0,   plannedQty: 300, planStartDate: isoOffset(5),  planEndDate: isoOffset(9) },

  // ── in progress ──────────────────────────────────────────────────────────
  { bomName: BOMS[4], category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'in progress', producedQty: 140, plannedQty: 400, planStartDate: isoOffset(-2), planEndDate: isoOffset(3),  startDate: isoOffset(-2) },
  { bomName: BOMS[5], category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'in progress', producedQty: 60,  plannedQty: 200, planStartDate: isoOffset(-1), planEndDate: isoOffset(4),  startDate: isoOffset(-1) },
  { bomName: BOMS[6], category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'in progress', producedQty: 25,  plannedQty: 150, planStartDate: isoOffset(-3), planEndDate: isoOffset(2),  startDate: isoOffset(-3), parentNumber: 'WO-2026-0005' },
  { bomName: BOMS[7], category: 'Order',    type: 'Disassembly', trackRouting: false, status: 'in progress', producedQty: 8,   plannedQty: 40,  planStartDate: isoOffset(0),  planEndDate: isoOffset(5),  startDate: isoOffset(0) },

  // ── partially produced ───────────────────────────────────────────────────
  { bomName: BOMS[8], category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'partially produced', producedQty: 220, plannedQty: 350, planStartDate: isoOffset(-5), planEndDate: isoOffset(1),  startDate: isoOffset(-5) },
  { bomName: BOMS[9], category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'partially produced', producedQty: 90,  plannedQty: 160, planStartDate: isoOffset(-4), planEndDate: isoOffset(0),  startDate: isoOffset(-4) },
  { bomName: BOMS[10], category: 'Standard', type: 'Assembly',   trackRouting: true,  status: 'partially produced', producedQty: 45,  plannedQty: 100, planStartDate: isoOffset(-6), planEndDate: isoOffset(-1), startDate: isoOffset(-6), parentNumber: 'WO-2026-0009' },
  { bomName: BOMS[11], category: 'Order',   type: 'Disassembly', trackRouting: false, status: 'partially produced', producedQty: 18,  plannedQty: 60,  planStartDate: isoOffset(-3), planEndDate: isoOffset(2),  startDate: isoOffset(-3) },

  // ── partially completed ──────────────────────────────────────────────────
  { bomName: BOMS[0], category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'partially completed', producedQty: 470, plannedQty: 500, planStartDate: isoOffset(-9), planEndDate: isoOffset(-2), startDate: isoOffset(-9), endDate: isoOffset(-1) },
  { bomName: BOMS[2], category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'partially completed', producedQty: 74,  plannedQty: 80,  planStartDate: isoOffset(-8), planEndDate: isoOffset(-3), startDate: isoOffset(-8), endDate: isoOffset(-2) },
  { bomName: BOMS[4], category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'partially completed', producedQty: 380, plannedQty: 400, planStartDate: isoOffset(-10), planEndDate: isoOffset(-4), startDate: isoOffset(-10), endDate: isoOffset(-3), parentNumber: 'WO-2026-0013' },
  { bomName: BOMS[6], category: 'Order',    type: 'Disassembly', trackRouting: false, status: 'partially completed', producedQty: 130, plannedQty: 150, planStartDate: isoOffset(-7), planEndDate: isoOffset(-2), startDate: isoOffset(-7), endDate: isoOffset(-1) },

  // ── completed ────────────────────────────────────────────────────────────
  { bomName: BOMS[1], category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'completed', producedQty: 120, plannedQty: 120, planStartDate: isoOffset(-14), planEndDate: isoOffset(-9),  startDate: isoOffset(-14), endDate: isoOffset(-9) },
  { bomName: BOMS[3], category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'completed', producedQty: 300, plannedQty: 300, planStartDate: isoOffset(-16), planEndDate: isoOffset(-11), startDate: isoOffset(-16), endDate: isoOffset(-10) },
  { bomName: BOMS[5], category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'completed', producedQty: 200, plannedQty: 200, planStartDate: isoOffset(-13), planEndDate: isoOffset(-8),  startDate: isoOffset(-13), endDate: isoOffset(-8), parentNumber: 'WO-2026-0017' },
  { bomName: BOMS[7], category: 'Order',    type: 'Disassembly', trackRouting: false, status: 'completed', producedQty: 40,  plannedQty: 40,  planStartDate: isoOffset(-12), planEndDate: isoOffset(-7),  startDate: isoOffset(-12), endDate: isoOffset(-7) },

  // ── canceled ─────────────────────────────────────────────────────────────
  { bomName: BOMS[8], category: 'Standard', type: 'Assembly',    trackRouting: true,  status: 'canceled', producedQty: 0, plannedQty: 350, planStartDate: isoOffset(-6), planEndDate: isoOffset(-1), endDate: isoOffset(-4) },
  { bomName: BOMS[10], category: 'Order',   type: 'Assembly',    trackRouting: false, status: 'canceled', producedQty: 0, plannedQty: 100, planStartDate: isoOffset(-5), planEndDate: isoOffset(0),  endDate: isoOffset(-3) },
  { bomName: BOMS[11], category: 'Standard', type: 'Disassembly', trackRouting: true, status: 'canceled', producedQty: 0, plannedQty: 60,  planStartDate: isoOffset(-4), planEndDate: isoOffset(1),  endDate: isoOffset(-2), parentNumber: 'WO-2026-0021' },
  { bomName: BOMS[9], category: 'Order',    type: 'Assembly',    trackRouting: false, status: 'canceled', producedQty: 0, plannedQty: 160, planStartDate: isoOffset(-3), planEndDate: isoOffset(2),  endDate: isoOffset(-1) },
]

export const workOrders: WorkOrder[] = SEED.map((wo, i) => ({
  ...wo,
  id: `wo-${i + 1}`,
  number: `WO-2026-${String(i + 1).padStart(4, '0')}`,
}))
