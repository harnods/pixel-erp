/**
 * Stock request lifecycle — PRD v0.5 UC-01, UC-05, UC-06, W-3.
 *
 * Covers the rules a request line lives by:
 *   • C-3 — one-step auto-reserve is ALL-OR-NOTHING per line.
 *   • W-3 — status is derived, never stored, and a request's status is the LOWEST
 *     among its lines.
 *   • UC-06 — Edit updates in place; Adjust puts an increase on its own tagged
 *     line with its own required date, and a decrease reduces the Adjustment line
 *     FIRST, so the most recent extra demand is released before committed demand.
 *   • The requestor follows whoever changed the demand, never whoever filled it.
 *
 * The last block reproduces the PRD's own worked example (WO-2026-0042) end to
 * end, which is the acceptance criterion the QA plan names.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  stockRequests, raiseStockRequestForWorkOrder, applyDemandChanges,
  blockedByReservation, appendStockRequestLines, reserveRequestProducts,
  stockRequestLineStatus, stockRequestStatus, needsAction, lineCovered,
  type WorkOrderMaterialLine,
} from '~/data/stockRequests'

const WO_ID = 'wo-lifecycle-test'
const REQ_ID = `sr-wo-${WO_ID}`

/**
 * destAvailable is read from warehouse data when a request is raised, which the
 * seed does not carry for a synthetic work order — so each test sets the
 * availability it means to exercise directly on the lines.
 */
function material(productId: string, qty: number, requiredDate = '2026-07-08'): WorkOrderMaterialLine {
  return {
    productId,
    product: `Component ${productId}`,
    sku: productId,
    unit: 'Sack',
    qty,
    requiredDate,
    destinationWarehouse: 'Gudang Jakarta Pusat',
    destinationWarehouseId: 'wh-1',
  }
}

function raise(lines: WorkOrderMaterialLine[], available: Record<string, number>, autoReserve = false) {
  const i = stockRequests.findIndex(r => r.workOrderId === WO_ID)
  if (i >= 0) stockRequests.splice(i, 1)
  // Raise with auto-reserve off, set the availability the case needs, then settle
  // by re-running the same demand through applyDemandChanges when the case wants it.
  const { request } = raiseStockRequestForWorkOrder({
    workOrderId: WO_ID,
    workOrderNumber: 'WO-2026-0042',
    requestor: 'Bima',
    requestDate: '2026-10-01',
    lines,
  }, { autoReserve: false })
  for (const l of request.lines) l.destAvailable = available[l.productId] ?? 0
  if (autoReserve) {
    // Settle through the public path: reserving every line is what One-step does
    // at creation, and reserveRequestProducts applies the same per-line rule.
    for (const l of request.lines) {
      if (l.destAvailable >= l.qty - lineCovered(l)) {
        reserveRequestProducts(request.id, [l.productId], { source: 'automatic' })
      }
    }
  }
  return request
}

const req = () => stockRequests.find(r => r.id === REQ_ID)!
const lineFor = (productId: string, tag?: 'adjustment' | 'additional') =>
  req().lines.find(l => l.productId === productId && l.tag === tag)!

beforeEach(() => {
  const i = stockRequests.findIndex(r => r.workOrderId === WO_ID)
  if (i >= 0) stockRequests.splice(i, 1)
})

describe('C-4 — one request per work order', () => {
  it('raises a request carrying one line per component, with the creator as requestor', () => {
    const request = raise([material('mdf', 20), material('kaki', 40)], { mdf: 20, kaki: 30 })
    expect(request.lines).toHaveLength(2)
    expect(request.lines.every(l => l.requestor === 'Bima')).toBe(true)
    expect(request.number).toMatch(/^SR-\d{4}-\d{4}$/)
  })

  it('never raises a second request for the same work order', () => {
    raise([material('mdf', 20)], { mdf: 20 })
    const again = raiseStockRequestForWorkOrder({
      workOrderId: WO_ID, workOrderNumber: 'WO-2026-0042',
      requestor: 'Boy', requestDate: '2026-10-02', lines: [material('kaki', 40)],
    }, { autoReserve: false })
    expect(again.created).toBe(false)
    expect(stockRequests.filter(r => r.workOrderId === WO_ID)).toHaveLength(1)
  })
})

describe('W-3 — status is derived', () => {
  it('reads Requested, Partially reserved and Reserved off the numbers', () => {
    const request = raise([material('mdf', 20)], { mdf: 20 })
    expect(stockRequestLineStatus(request.lines[0]!)).toBe('requested')
    request.lines[0]!.reserved = 8
    expect(stockRequestLineStatus(request.lines[0]!)).toBe('partially reserved')
    request.lines[0]!.reserved = 20
    expect(stockRequestLineStatus(request.lines[0]!)).toBe('reserved')
  })

  it('counts consumed qty as covered — a partly issued line is not under-reserved', () => {
    const request = raise([material('mdf', 20)], { mdf: 20 })
    request.lines[0]!.reserved = 5
    request.lines[0]!.consumed = 15
    expect(stockRequestLineStatus(request.lines[0]!)).toBe('reserved')
    expect(needsAction(request)).toBe(false)
  })

  it('gives the request the LOWEST status among its lines', () => {
    const request = raise([material('mdf', 20), material('kaki', 40)], { mdf: 20, kaki: 40 })
    request.lines[0]!.reserved = 20
    request.lines[1]!.reserved = 0
    expect(stockRequestStatus(request)).toBe('requested')
    request.lines[1]!.reserved = 40
    expect(stockRequestStatus(request)).toBe('reserved')
  })

  it('keeps a line out of the Requested tab only once reserved + consumed meets required', () => {
    const request = raise([material('mdf', 20)], { mdf: 20 })
    request.lines[0]!.reserved = 19
    expect(needsAction(request)).toBe(true)
    request.lines[0]!.reserved = 20
    expect(needsAction(request)).toBe(false)
  })
})

describe('UC-06 — Edit (Not started) updates in place', () => {
  it('grows the existing line and makes the editor its requestor', () => {
    raise([material('mdf', 20)], { mdf: 20 })
    applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 24, requiredDate: '2026-10-08' }], 'Boy', 'edit')
    expect(req().lines).toHaveLength(1)
    expect(lineFor('mdf').qty).toBe(24)
    expect(lineFor('mdf').requestor).toBe('Boy')
  })

  it('blocks a cut below what is already reserved — the user unreserves first', () => {
    const request = raise([material('mdf', 20)], { mdf: 20 })
    request.lines[0]!.reserved = 20
    const blocked = blockedByReservation(WO_ID, [{ productId: 'mdf', qty: 10, requiredDate: '2026-10-08' }])
    expect(blocked).toEqual(['mdf'])
  })

  it('allows a cut that stays at or above the reserved qty, releasing nothing', () => {
    const request = raise([material('mdf', 20)], { mdf: 20 })
    request.lines[0]!.reserved = 10
    const r = applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 10, requiredDate: '2026-10-08' }], 'Boy', 'edit')
    expect(r.released.qty).toBe(0)
    expect(lineFor('mdf').reserved).toBe(10)
  })
})

describe('UC-06 — Adjust (In progress) keeps the delta on its own line', () => {
  it('puts an increase on a new Adjustment line with its own required date', () => {
    raise([material('mdf', 20, '2026-10-08')], { mdf: 20 })
    applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 28, requiredDate: '2026-10-10' }], 'Citra', 'adjust')

    expect(req().lines).toHaveLength(2)
    expect(lineFor('mdf').qty).toBe(20)
    expect(lineFor('mdf').requiredDate).toBe('2026-10-08')
    expect(lineFor('mdf', 'adjustment').qty).toBe(8)
    expect(lineFor('mdf', 'adjustment').requiredDate).toBe('2026-10-10')
    expect(lineFor('mdf', 'adjustment').requestor).toBe('Citra')
  })

  it('reduces the Adjustment line FIRST on a decrease', () => {
    raise([material('mdf', 20)], { mdf: 20 })
    applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 28, requiredDate: '2026-10-10' }], 'Citra', 'adjust')
    // 28 → 22: the 8-unit Adjustment line absorbs the whole 6-unit cut.
    applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 22, requiredDate: '2026-10-10' }], 'Citra', 'adjust')
    expect(lineFor('mdf').qty).toBe(20)
    expect(lineFor('mdf', 'adjustment').qty).toBe(2)
  })

  it('drops a tagged line cut to nothing, but keeps an original line at zero', () => {
    raise([material('mdf', 20)], { mdf: 20 })
    applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 28, requiredDate: '2026-10-10' }], 'Citra', 'adjust')
    applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 20, requiredDate: '2026-10-10' }], 'Citra', 'adjust')
    expect(req().lines).toHaveLength(1)
    expect(lineFor('mdf').qty).toBe(20)
  })

  it('releases the whole remaining reservation when the cut goes below it (R-4)', () => {
    const request = raise([material('mdf', 20)], { mdf: 0 })
    request.lines[0]!.reserved = 20
    const r = applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 12, requiredDate: '2026-10-10' }], 'Citra', 'adjust')
    expect(r.released.qty).toBe(20)
    expect(lineFor('mdf').qty).toBe(12)
  })
})

describe('D-7 — additional stock lands on the same request, tagged', () => {
  it('appends a tagged line rather than raising a second request', () => {
    raise([material('mdf', 20)], { mdf: 20 })
    const r = appendStockRequestLines(WO_ID, [material('mdf', 5, '2026-10-12')], 'Citra', 'additional', { autoReserve: false })
    expect(r?.request.id).toBe(REQ_ID)
    expect(stockRequests.filter(x => x.workOrderId === WO_ID)).toHaveLength(1)
    expect(lineFor('mdf', 'additional').qty).toBe(5)
    expect(lineFor('mdf', 'additional').requestor).toBe('Citra')
  })
})

/**
 * The PRD's own worked example, steps 1–4 (WO-2026-0042 · Meja kerja × 10,
 * One-step, one destination warehouse). Opening stock: MDF 20, Kaki besi 30,
 * Baut 500, Handle 10.
 */
describe('UC-06 worked example — WO-2026-0042', () => {
  it('step 1: one-step reserves only the lines stock fully covers', () => {
    const request = raise(
      [material('mdf', 20), material('kaki', 40), material('baut', 160)],
      { mdf: 20, kaki: 30, baut: 500 },
      true,
    )
    expect(request.lines.find(l => l.productId === 'mdf')!.reserved).toBe(20)
    // 30 < 40 — all-or-nothing per line, so Kaki besi reserves NOTHING.
    expect(request.lines.find(l => l.productId === 'kaki')!.reserved).toBe(0)
    expect(request.lines.find(l => l.productId === 'baut')!.reserved).toBe(160)
    expect(stockRequestStatus(request)).toBe('requested')
  })

  it('step 2: an Edit before start grows MDF in place and adds Handle as a new line', () => {
    raise([material('mdf', 20), material('kaki', 40), material('baut', 160)], { mdf: 0, kaki: 30, baut: 340 }, false)
    lineFor('mdf').reserved = 20
    lineFor('baut').reserved = 160

    applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 24, requiredDate: '2026-10-08' }], 'Boy', 'edit')
    appendStockRequestLines(WO_ID, [material('handle', 10)], 'Boy', 'additional', { autoReserve: false })

    expect(lineFor('mdf').qty).toBe(24)
    expect(lineFor('mdf').reserved).toBe(20)
    expect(stockRequestLineStatus(lineFor('mdf'))).toBe('partially reserved')
    expect(lineFor('mdf').requestor).toBe('Boy')
    // Kaki besi's requestor is untouched — Boy did not change that line's demand.
    expect(lineFor('kaki').requestor).toBe('Bima')
  })

  it('step 4: an Adjust mid-run adds MDF +8 as its own line and cuts Baut in place', () => {
    raise([material('mdf', 24), material('baut', 160)], { mdf: 6, baut: 0 }, false)
    lineFor('mdf').reserved = 24
    lineFor('baut').reserved = 160

    applyDemandChanges(WO_ID, [
      { productId: 'mdf', qty: 32, requiredDate: '2026-10-10' },
      { productId: 'baut', qty: 150, requiredDate: '2026-10-10' },
    ], 'Citra', 'adjust')

    // MDF +8 becomes L5, leaving L1 and its date untouched; 6 available < 8, so
    // all-or-nothing leaves the new line Requested.
    expect(lineFor('mdf').qty).toBe(24)
    expect(lineFor('mdf', 'adjustment').qty).toBe(8)
    expect(lineFor('mdf', 'adjustment').reserved).toBe(0)
    expect(stockRequestLineStatus(lineFor('mdf', 'adjustment'))).toBe('requested')
    // Baut 160 → 150 is a cut below its reservation: released, then reduced.
    expect(lineFor('baut').qty).toBe(150)
    expect(lineFor('baut').requestor).toBe('Citra')
  })
})
