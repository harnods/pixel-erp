/**
 * Stock request lifecycle — PRD v0.6 UC-01, UC-05, UC-06, W-3.
 *
 * Covers the rules a request line lives by:
 *   • C-3 — one-step auto-reserve takes each line UP TO the qty available.
 *   • W-3 — status is derived, never stored, and a request's status is the LOWEST
 *     among its lines.
 *   • UC-06 — Edit AND Adjust update the existing line in place: any qty change
 *     releases the component's remaining reservation, the line takes the new qty
 *     and date, and it is reserved again through the method. A new product adds a
 *     line. There are no tagged lines and no rejection (L-12).
 *   • The requestor follows whoever changed the demand, never whoever filled it.
 *
 * The last block reproduces the PRD's own worked example (WO-2026-0042) end to
 * end, which is the acceptance criterion the QA plan names.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  stockRequests, raiseStockRequestForWorkOrder, applyDemandChanges,
  reserveRequestProducts,
  stockRequestLineStatus, stockRequestStatus, needsAction, lineCovered,
  type WorkOrderMaterialLine,
  lowestLineStatus,
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
    // Settle through the public path: One-step at creation reserves each line up
    // to the qty available (C-3), the same rule reserveRequestProducts applies.
    reserveRequestProducts(request.id, request.lines.map(l => l.productId), { source: 'automatic' })
  }
  return request
}

const req = () => stockRequests.find(r => r.id === REQ_ID)!
const lineFor = (productId: string) => req().lines.find(l => l.productId === productId)!

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

  // The request's own status answers "is anything outstanding", so reserving does
  // not close it — only issuing does. How far reservation has got is the LINE
  // question, which `lowestLineStatus` answers.
  it('gives the request the LOWEST line status among its lines', () => {
    const request = raise([material('mdf', 20), material('kaki', 40)], { mdf: 20, kaki: 40 })
    request.lines[0]!.reserved = 20
    request.lines[1]!.reserved = 0
    expect(lowestLineStatus(request)).toBe('requested')
    expect(stockRequestStatus(request)).toBe('open')
    request.lines[1]!.reserved = 40
    expect(lowestLineStatus(request)).toBe('reserved')
    // Reserved is not issued — the request still has demand to settle.
    expect(stockRequestStatus(request)).toBe('open')
  })

  it('completes a request only once every line is fulfilled', () => {
    const request = raise([material('mdf', 20)], { mdf: 20 })
    request.lines[0]!.reserved = 20
    expect(stockRequestStatus(request)).toBe('open')
    request.lines[0]!.consumed = 20
    expect(lowestLineStatus(request)).toBe('fulfilled')
    expect(stockRequestStatus(request)).toBe('completed')
  })

  it('keeps a line out of the Requested tab only once reserved + consumed meets required', () => {
    const request = raise([material('mdf', 20)], { mdf: 20 })
    request.lines[0]!.reserved = 19
    expect(needsAction(request)).toBe(true)
    request.lines[0]!.reserved = 20
    expect(needsAction(request)).toBe(false)
  })
})

describe('UC-06 — Edit and Adjust update the line in place', () => {
  for (const phase of ['edit', 'adjust'] as const) {
    it(`${phase}: grows the existing line, takes the new date, and makes the user its requestor`, () => {
      raise([material('mdf', 20, '2026-10-08')], { mdf: 20 })
      applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 28, requiredDate: '2026-10-10' }], 'Citra', phase)
      expect(req().lines).toHaveLength(1)
      expect(lineFor('mdf').qty).toBe(28)
      expect(lineFor('mdf').requiredDate).toBe('2026-10-10')
      expect(lineFor('mdf').requestor).toBe('Citra')
    })

    it(`${phase}: a cut releases the whole reservation, then updates in place (Two-step: stays Requested)`, () => {
      const request = raise([material('mdf', 20)], { mdf: 0 })
      request.lines[0]!.reserved = 20
      const r = applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 10, requiredDate: '2026-10-08' }], 'Boy', phase)
      expect(r.released.qty).toBe(20)
      expect(lineFor('mdf').qty).toBe(10)
      expect(lineFor('mdf').reserved).toBe(0)
      expect(stockRequestLineStatus(lineFor('mdf'))).toBe('requested')
    })

    it(`${phase}: an increase releases too, and One-step reserves again up to the qty available`, () => {
      const request = raise([material('mdf', 20)], { mdf: 0 })
      request.lines[0]!.reserved = 20
      const r = applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 24, requiredDate: '2026-10-08' }], 'Boy', phase,
        { autoReserve: true })
      expect(r.released.qty).toBe(20)
      // 20 released are free again; 24 asked → 20 reserved, Partially reserved (C-3)
      expect(lineFor('mdf').reserved).toBe(20)
      expect(stockRequestLineStatus(lineFor('mdf'))).toBe('partially reserved')
      expect(r.reserved.partialProducts).toBe(1)
    })
  }

  it('a date-only change releases nothing', () => {
    const request = raise([material('mdf', 20)], { mdf: 0 })
    request.lines[0]!.reserved = 20
    const r = applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 20, requiredDate: '2026-10-09' }], 'Boy', 'edit')
    expect(r.released.qty).toBe(0)
    expect(lineFor('mdf').reserved).toBe(20)
  })

  it('never cuts a line below what has already been issued', () => {
    const request = raise([material('mdf', 20)], { mdf: 0 })
    request.lines[0]!.consumed = 12
    applyDemandChanges(WO_ID, [{ productId: 'mdf', qty: 5, requiredDate: '2026-10-09' }], 'Citra', 'adjust')
    expect(lineFor('mdf').qty).toBe(12)
  })

  it('adds a component new to the work order as a new line, with the user as requestor', () => {
    raise([material('mdf', 20)], { mdf: 20 })
    applyDemandChanges(WO_ID, [{ productId: 'handle', qty: 10, requiredDate: '2026-10-08', newLine: material('handle', 10) }], 'Boy', 'edit')
    expect(req().lines).toHaveLength(2)
    expect(lineFor('handle').qty).toBe(10)
    expect(lineFor('handle').requestor).toBe('Boy')
  })
})

/**
 * The PRD's own worked example, steps 1–4 (WO-2026-0042 · Meja kerja × 10,
 * One-step, one destination warehouse). Opening stock: MDF 20, Kaki besi 30,
 * Baut 500, Handle 10. Each step checks the PRD table's figures line by line.
 */
describe('UC-06 worked example — WO-2026-0042 (v0.6)', () => {
  const row = (productId: string) => {
    const l = lineFor(productId)
    return { qty: l.qty, reserved: l.reserved, remaining: l.qty - lineCovered(l), requestor: l.requestor, status: stockRequestLineStatus(l) }
  }

  it('runs create → edit → PPIC → adjust as the PRD tables say', () => {
    // 1 — Create, Bima. One-step reserves each line up to the qty available.
    const request = raise(
      [material('mdf', 20), material('kaki', 40), material('baut', 160)],
      { mdf: 20, kaki: 30, baut: 500 },
      true,
    )
    expect(row('mdf')).toEqual({ qty: 20, reserved: 20, remaining: 0, requestor: 'Bima', status: 'reserved' })
    expect(row('kaki')).toEqual({ qty: 40, reserved: 30, remaining: 10, requestor: 'Bima', status: 'partially reserved' })
    expect(row('baut')).toEqual({ qty: 160, reserved: 160, remaining: 0, requestor: 'Bima', status: 'reserved' })
    expect(lowestLineStatus(request)).toBe('partially reserved')

    // 2 — Edit, Boy (not started): MDF 20 → 24; Handle 10 added.
    applyDemandChanges(WO_ID, [
      { productId: 'mdf', qty: 24, requiredDate: '2026-10-08' },
      { productId: 'handle', qty: 10, requiredDate: '2026-10-08', newLine: material('handle', 10) },
    ], 'Boy', 'edit', { autoReserve: true })
    // A new line reads the warehouse's real stock, which a synthetic SKU doesn't
    // have — give it the PRD's 10 Handle, then settle it as One-step would.
    lineFor('handle').destAvailable = 10
    reserveRequestProducts(REQ_ID, ['handle'], { source: 'automatic' })
    expect(row('mdf')).toEqual({ qty: 24, reserved: 20, remaining: 4, requestor: 'Boy', status: 'partially reserved' })
    expect(row('kaki')).toEqual({ qty: 40, reserved: 30, remaining: 10, requestor: 'Bima', status: 'partially reserved' })
    expect(row('baut').requestor).toBe('Bima')
    expect(row('handle')).toEqual({ qty: 10, reserved: 10, remaining: 0, requestor: 'Boy', status: 'reserved' })

    // 3 — PPIC fulfils after stock in (MDF +10, Kaki +20). Requestors unchanged.
    lineFor('mdf').destAvailable += 10
    lineFor('kaki').destAvailable += 20
    reserveRequestProducts(REQ_ID, ['mdf', 'kaki'], { source: 'stock-request' })
    expect(row('mdf')).toEqual({ qty: 24, reserved: 24, remaining: 0, requestor: 'Boy', status: 'reserved' })
    expect(row('kaki')).toEqual({ qty: 40, reserved: 40, remaining: 0, requestor: 'Bima', status: 'reserved' })

    // 4 — Adjust, Citra (in progress): MDF +8 required 10 Oct; Baut 160 → 150.
    // MDF on hand 30, so after its 24 are released only 30 can be reserved again.
    const r = applyDemandChanges(WO_ID, [
      { productId: 'mdf', qty: 32, requiredDate: '2026-10-10' },
      { productId: 'baut', qty: 150, requiredDate: '2026-10-08' },
    ], 'Citra', 'adjust', { autoReserve: true })
    expect(r.released.qty).toBe(24 + 160)
    expect(row('mdf')).toEqual({ qty: 32, reserved: 30, remaining: 2, requestor: 'Citra', status: 'partially reserved' })
    expect(lineFor('mdf').requiredDate).toBe('2026-10-10')
    expect(row('baut')).toEqual({ qty: 150, reserved: 150, remaining: 0, requestor: 'Citra', status: 'reserved' })
    expect(row('kaki').requestor).toBe('Bima')
    expect(row('handle').requestor).toBe('Boy')
    expect(req().lines).toHaveLength(4) // updated in place — no Adjustment line
  })
})
