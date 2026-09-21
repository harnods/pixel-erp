/**
 * Batch Traceability Report — data layer (plan Phase 0).
 *
 * Covers the rules the report and detail pages will lean on without re-checking them:
 *   • every batch's journey reconciles: running balance ends at on-hand, per-warehouse
 *     stock never goes negative and sums to the total, Received − Issued = On hand
 *   • the PRD sign rule per transaction type
 *   • attribute cells: NA / empty / value, and the entitlement gate
 *   • Search by batch: All warehouse vs selected, AND across filters, OR within one,
 *     date conditions incl. month-precision expiry
 *   • Search by transaction: Customer/Vendor/warehouse filters only hit their modules
 *   • batches in selected transactions, attribute snapshots, related batches
 *
 * Data modules keep module-level state, so each test re-imports a fresh copy.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

async function load() {
  vi.resetModules()
  const trace = await import('~/data/batchTraceability')
  const details = await import('~/data/productDetails')
  const index = await import('~/data/productsIndex')
  const { warehouses } = await import('~/data/warehouses')
  const activeWarehouses = () => warehouses.filter((w) => !w.isDefault && w.status === 'active')
  return { ...trace, ...details, ...index, activeWarehouses }
}
type Api = Awaited<ReturnType<typeof load>>
let api: Api
beforeEach(async () => { api = await load() })

/** Every stocked batch of every batch-tracked product. */
function stockedBatches() {
  return api.productIndexRows()
    .filter((r) => api.isProductBatchTracked(r.sku))
    .flatMap((r) => api.getProductBatches(r.sku).filter((b) => b.onHand > 0).map((b) => ({ sku: r.sku, batch: b })))
}

describe('journey reconciliation', () => {
  it('ends every stocked batch at its on-hand, oldest first', () => {
    const batches = stockedBatches()
    expect(batches.length).toBeGreaterThan(20)
    for (const { sku, batch } of batches) {
      const journey = api.batchJourney(sku, batch.batchNo)
      expect(journey.length, `${sku} ${batch.batchNo}`).toBeGreaterThan(0)
      expect(journey.at(-1)!.balanceBase, `${sku} ${batch.batchNo}`).toBe(batch.onHand)
      const dates = journey.map((j) => j.date)
      expect(dates).toEqual([...dates].sort())
    }
  })

  it('never takes a warehouse negative, and its warehouses sum to the total', () => {
    for (const { sku, batch } of stockedBatches()) {
      const position = api.batchStockPosition(sku, batch.batchNo)!
      expect(position.totalBase).toBe(batch.onHand)
      expect(position.warehouses.every((w) => w.onHandBase > 0)).toBe(true)
      expect(position.warehouses.reduce((sum, w) => sum + w.onHandBase, 0)).toBe(batch.onHand)
      expect(position.received - position.issued).toBe(batch.onHand)
      expect(position.difference).toBe(0)
    }
  })

  it('flags a mismatch with the difference, ignoring neutral movements', () => {
    expect(api.reconcile([
      { direction: 'in', qty: 10 }, { direction: 'out', qty: 3 }, { direction: 'neutral', qty: 5 },
    ], 8)).toEqual({ received: 10, issued: 3, difference: 1 })
  })

  it('shows a created batch with no stock as an empty journey and position', () => {
    const created = api.createBatch('1004', { batchNo: 'TRACE-NEW', description: '', attributes: {} })
    expect(created.ok).toBe(true)
    expect(api.batchJourney('1004', 'TRACE-NEW')).toEqual([])
    const position = api.batchStockPosition('1004', 'TRACE-NEW')!
    expect(position.totalBase).toBe(0)
    expect(position.warehouses).toEqual([])
    expect(api.getBatchTrace('1004', 'TRACE-NEW')!.createdByNumber).toBeNull()
  })

  it('returns nothing for an unknown batch', () => {
    expect(api.getBatchTrace('1001', 'Nope')).toBeUndefined()
    expect(api.batchStockPosition('1001', 'Nope')).toBeUndefined()
    expect(api.batchJourney('1001', 'Nope')).toEqual([])
  })
})

describe('sign rule', () => {
  it('follows the PRD per transaction type', () => {
    const d = api.mutationDirection
    expect(d('Purchase delivery')).toBe('in')
    expect(d('Purchase invoice')).toBe('in')
    expect(d('Purchase return')).toBe('out')
    expect(d('Sales delivery')).toBe('out')
    expect(d('Sales invoice')).toBe('out')
    expect(d('Sales return')).toBe('in')
    expect(d('Warehouse transfer')).toBe('neutral')
    expect(d('Stock count')).toBe('neutral')
    expect(d('Work order', { role: 'output' })).toBe('in')
    expect(d('Work order', { role: 'input' })).toBe('out')
    expect(d('Stock in/out', { delta: 2 })).toBe('in')
    expect(d('Stock in/out', { delta: -2 })).toBe('out')
    expect(d('Reversal', { delta: -1 })).toBe('out')
  })

  it('shows origin, destination and counterparty only where the PRD allows', () => {
    const rows = stockedBatches().flatMap(({ sku, batch }) => api.batchJourney(sku, batch.batchNo))
    const of = (type: string) => rows.filter((r) => r.type === type)
    for (const r of of('Warehouse transfer')) {
      expect(r.originWarehouseId).not.toBeNull()
      expect(r.destinationWarehouseId).not.toBeNull()
      expect(r.baseDelta).toBe(0)
    }
    for (const r of of('Sales delivery')) {
      expect(r.originWarehouseId).not.toBeNull()
      expect(r.destinationWarehouseId).toBeNull()
      expect(r.counterparty?.kind).toBe('customer')
      expect(r.baseDelta).toBeLessThan(0)
    }
    for (const r of of('Purchase delivery')) {
      expect(r.originWarehouseId).toBeNull()
      expect(r.destinationWarehouseId).not.toBeNull()
      expect(r.counterparty?.kind).toBe('vendor')
    }
    for (const r of of('Work order')) {
      expect(r.originWarehouseId).toBeNull()
      expect(r.destinationWarehouseId).toBeNull()
      expect(r.counterparty).toBeNull()
    }
    expect(of('Work order').length).toBeGreaterThan(0)
  })
})

describe('attribute cells', () => {
  it('is NA when the product does not use the attribute, empty when used without a value', () => {
    // 1001 uses Vendor + Grade + Expiry; Batch #003 has no vendor. 1101 doesn't use Vendor.
    expect(api.attributeCell('1001', {}, 'supplier')).toEqual({ state: 'empty' })
    expect(api.attributeCell('1001', { supplier: 'V003' }, 'supplier')).toEqual({ state: 'value', value: 'V003' })
    expect(api.attributeCell('1101', { supplier: 'V003' }, 'supplier')).toEqual({ state: 'na' })
  })

  it('never makes Expiry NA, and greys everything else out without the add-on', () => {
    const noAddOn = { batchAttribute: false, dualUnit: true }
    expect(api.attributeCell('1101', {}, 'expiry_date', noAddOn)).toEqual({ state: 'empty' })
    expect(api.attributeCell('1001', { grade: 'grade-a' }, 'grade', noAddOn)).toEqual({ state: 'na' })
    expect(api.isAttributeAvailable('expiry_date', noAddOn)).toBe(true)
    expect(api.isAttributeAvailable('supplier', noAddOn)).toBe(false)
  })
})

describe('search by batch', () => {
  it('lists one All warehouse line per stocked batch, sorted by product then batch', () => {
    const rows = api.searchBatches()
    expect(rows.length).toBe(stockedBatches().length)
    expect(rows.every((r) => r.warehouseId === null)).toBe(true)
    for (const r of rows) {
      const batch = api.getProductBatches(r.sku).find((b) => b.id === r.batchId)!
      expect(r.onHandBase).toEqual({ state: 'value', value: batch.onHand })
    }
    const order = rows.map((r) => [r.productName, r.batchNo])
    const sorted = [...order].sort((a, b) => a[0]!.localeCompare(b[0]!, 'en', { numeric: true }) || a[1]!.localeCompare(b[1]!, 'en', { numeric: true }))
    expect(order).toEqual(sorted)
  })

  it('combines Product and Batch number with AND', () => {
    const rows = api.searchBatches({ productSkus: ['1001'], batchNos: ['Batch #002'] })
    expect(rows.map((r) => `${r.sku} ${r.batchNo}`)).toEqual(['1001 Batch #002'])
  })

  it('combines several vendors with OR, and grades the same way', () => {
    const byVendor = api.searchBatches({ vendorIds: ['V003', 'V001'] })
    expect(byVendor.map((r) => `${r.sku} ${r.batchNo}`).sort()).toEqual(['1001 Batch #001', '1001 Batch #002'])
    const byGrade = api.searchBatches({ gradeIds: ['grade-b'] })
    expect(byGrade.map((r) => `${r.sku} ${r.batchNo}`)).toEqual(['1001 Batch #002'])
  })

  it('filters expiry before / after / between, a month expiry counting as its last day', () => {
    const before = api.searchBatches({ expiry: { op: 'before', date: '2026-08-01' } })
    expect(before.length).toBeGreaterThan(0)
    for (const r of before) expect(r.attributes.expiry_date.state).toBe('value')

    const target = api.getProductBatches('1101')[0]!
    expect(api.updateBatch('1101', target.id, { attributes: { expiry_date: '2026-07' } }).ok).toBe(true)
    const keys = (f: Parameters<typeof api.searchBatches>[0]) => api.searchBatches(f).map((r) => r.batchId)
    expect(keys({ expiry: { op: 'before', date: '2026-07-31' } })).not.toContain(target.id)
    expect(keys({ expiry: { op: 'before', date: '2026-08-01' } })).toContain(target.id)
    expect(keys({ expiry: { op: 'between', from: '2026-07-31', to: '2026-07-31' } })).toContain(target.id)
    expect(keys({ expiry: { op: 'after', date: '2026-07-31' } })).not.toContain(target.id)
  })

  it('splits a batch per selected warehouse it moved through, summing back to its total', () => {
    const all = api.searchBatches({ productSkus: ['1001'], batchNos: ['Batch #001'] })[0]!
    const allIds = api.activeWarehouses().map((w) => w.id)
    const rows = api.searchBatches({ productSkus: ['1001'], batchNos: ['Batch #001'], warehouseIds: allIds })
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.every((r) => r.warehouseId !== null)).toBe(true)
    const total = rows.reduce((sum, r) => sum + (r.onHandBase.state === 'value' ? r.onHandBase.value : 0), 0)
    expect(all.onHandBase).toEqual({ state: 'value', value: total })
  })

  it('ignores greyed-out attribute filters and shows NA without access', () => {
    const noAddOn = { batchAttribute: false, dualUnit: true }
    const rows = api.searchBatches({ vendorIds: ['V003'] }, noAddOn)
    expect(rows.length).toBe(stockedBatches().length)
    expect(rows.every((r) => r.attributes.supplier.state === 'na')).toBe(true)
  })

  it('shows the secondary unit only for dual-unit products the company has access to', () => {
    const green = api.searchBatches({ productSkus: ['1001'] })[0]!
    expect(green.secondaryUnit).toBe('kg')
    expect(green.onHandSecondary.state).toBe('value')
    expect(api.searchBatches({ productSkus: ['1101'] })[0]!.onHandSecondary).toEqual({ state: 'na' })
    const noDui = api.searchBatches({ productSkus: ['1001'] }, { batchAttribute: true, dualUnit: false })[0]!
    expect(noDui.onHandSecondary).toEqual({ state: 'na' })
  })
})

describe('search by transaction', () => {
  it('lists each transaction once, newest first, unpaginated', () => {
    const rows = api.searchTransactions()
    expect(new Set(rows.map((r) => r.number)).size).toBe(rows.length)
    expect(rows.length).toBe(api.traceTransactionNumberOptions().length)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.date >= rows[i]!.date).toBe(true)
    }
  })

  it('only matches the Sales module for Customer and the Purchase module for Vendor', () => {
    const sale = api.searchTransactions({ types: ['Sales delivery'] })[0]!
    const byCustomer = api.searchTransactions({ customerIds: [sale.counterparty!.id] })
    expect(byCustomer.length).toBeGreaterThan(0)
    expect(byCustomer.every((r) => r.module === 'sales')).toBe(true)
    const byVendor = api.searchTransactions({ vendorIds: ['V003'] })
    expect(byVendor.length).toBeGreaterThan(0)
    expect(byVendor.every((r) => r.module === 'purchase')).toBe(true)
  })

  it('combines types with OR', () => {
    const rows = api.searchTransactions({ types: ['Work order', 'Warehouse transfer'] })
    expect(new Set(rows.map((r) => r.type))).toEqual(new Set(['Work order', 'Warehouse transfer']))
  })

  it('limits warehouse origin / destination to the types that have one', () => {
    const origin = api.searchTransactions({ originWarehouseIds: 'all' })
    expect(origin.length).toBeGreaterThan(0)
    expect(origin.every((r) => api.hasOriginWarehouse(r.type))).toBe(true)
    const wh = origin[0]!.originWarehouseId!
    expect(api.searchTransactions({ originWarehouseIds: [wh] }).every((r) => r.originWarehouseId === wh)).toBe(true)
    const destination = api.searchTransactions({ destinationWarehouseIds: 'all' })
    expect(destination.every((r) => api.hasDestinationWarehouse(r.type))).toBe(true)
  })

  it('filters on transaction date', () => {
    const cutoff = '2026-04-01'
    const rows = api.searchTransactions({ date: { op: 'before', date: cutoff } })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.date < cutoff)).toBe(true)
  })
})

describe('batches in selected transactions', () => {
  it('is empty until a transaction is selected', () => {
    expect(api.batchesInTransactions([])).toEqual([])
  })

  it('shows a Work order output as + and its raw materials as −', () => {
    const wo = api.searchTransactions({ types: ['Work order'] })[0]!
    const rows = api.batchesInTransactions([wo.number])
    expect(rows.filter((r) => r.baseDelta > 0)).toHaveLength(1)
    expect(rows.filter((r) => r.baseDelta < 0).length).toBeGreaterThan(0)
  })

  it('lists the same batch once per selected transaction', () => {
    const { sku, batch } = stockedBatches()[0]!
    const numbers = [...new Set(api.batchJourney(sku, batch.batchNo).map((j) => j.number))].slice(0, 2)
    expect(numbers).toHaveLength(2)
    const rows = api.batchesInTransactions(numbers).filter((r) => r.batchId === batch.id)
    expect(rows.map((r) => r.number).sort()).toEqual([...numbers].sort())
  })

  it('carries the attribute values recorded on the transaction, not the current ones', () => {
    const batch = api.getProductBatches('1001').find((b) => b.batchNo === 'Batch #001')!
    const receipt = api.batchJourney('1001', batch.batchNo)[0]!
    const row = api.batchesInTransactions([receipt.number]).find((r) => r.batchId === batch.id)!
    expect(row.attributes.grade).toEqual({ state: 'value', value: receipt.attributes.grade })
    expect(receipt.attributes.grade).not.toBe(batch.attributes.grade)
  })
})

describe('batch detail', () => {
  it('marks attributes whose recorded value differs from the batch master', () => {
    const journey = api.batchJourney('1001', 'Batch #001')
    expect(journey[0]!.changedAttributes).toEqual(['grade'])
    expect(journey.slice(1).every((j) => j.changedAttributes.length === 0)).toBe(true)
  })

  it('names the transaction that created the batch', () => {
    expect(api.getBatchTrace('1101', 'Batch #001')!.createdByType).toBe('Work order')
    expect(api.getBatchTrace('1004', 'Batch #001')!.createdByType).toBe('Purchase delivery')
  })

  it('carries secondary-unit balances for a dual-unit product only', () => {
    expect(api.batchJourney('1001', 'Batch #001').every((j) => j.balanceSecondary !== null)).toBe(true)
    expect(api.batchJourney('1101', 'Batch #001').every((j) => j.balanceSecondary === null)).toBe(true)
  })

  it('links a roasted batch to its green-bean sources and back', () => {
    const roasted = api.getProductBatches('1101')[0]!
    const { sources, results } = api.relatedBatches('1101', roasted.batchNo)
    expect(results).toEqual([])
    expect(sources.length).toBeGreaterThan(0)
    const source = sources[0]!
    const back = api.relatedBatches(source.sku, source.batchNo).results
    expect(back.some((r) => r.sku === '1101' && r.batchNo === roasted.batchNo && r.workOrderNumber === source.workOrderNumber)).toBe(true)
  })

  it('keeps several batches of the same product in one Work order as separate lines', () => {
    const lines = api.getProductBatches('1106')
      .filter((b) => b.onHand > 0)
      .map((b) => api.relatedBatches('1106', b.batchNo).sources)
    const twin = lines.find((s) => s.length === 2)!
    expect(twin.every((s) => s.sku === '1102')).toBe(true)
    expect(new Set(twin.map((s) => s.batchNo)).size).toBe(2)
  })

  it('links a middle batch both ways: roasted from green beans, packed into retail bags', () => {
    const middle = api.getProductBatches('1102').filter((b) => b.onHand > 0)
      .map((b) => ({ b, rel: api.relatedBatches('1102', b.batchNo) }))
      .find(({ rel }) => rel.sources.length && rel.results.length)!
    expect(middle.rel.sources.every((r) => ['1002', '1008'].includes(r.sku))).toBe(true)
    expect(middle.rel.results.every((r) => r.sku === '1106')).toBe(true)
    // Packed after it was roasted.
    const roastedOn = middle.rel.sources[0]!.workOrderDate
    expect(middle.rel.results.every((r) => r.workOrderDate > roastedOn)).toBe(true)
  })

  it('gives every stocked green-bean batch a result batch', () => {
    const greens = stockedBatches().filter(({ sku }) => sku.startsWith('10'))
    for (const { sku, batch } of greens) {
      expect(api.relatedBatches(sku, batch.batchNo).results.length, `${sku} ${batch.batchNo}`).toBeGreaterThan(0)
    }
  })

  it('has no related batch for a batch no Work order touched', () => {
    const created = api.createBatch('1004', { batchNo: 'TRACE-UNLINKED', description: '', attributes: {} })
    expect(created.ok).toBe(true)
    expect(api.relatedBatches('1004', 'TRACE-UNLINKED')).toEqual({ sources: [], results: [] })
  })
})

describe('storage locations', () => {
  it("splits a batch's warehouse stock across that warehouse's bins, summing back", () => {
    for (const { sku, batch } of stockedBatches().slice(0, 12)) {
      const position = api.batchStockPosition(sku, batch.batchNo)!
      for (const w of position.warehouses) {
        const locations = api.batchStorageLocations(sku, batch.batchNo, w.warehouseId)
        expect(locations.length, `${sku} ${batch.batchNo} ${w.warehouseId}`).toBeGreaterThan(0)
        expect(locations.every((l) => l.onHand > 0)).toBe(true)
        expect(locations.reduce((sum, l) => sum + l.onHand, 0)).toBe(w.onHandBase)
      }
    }
  })

  it('is empty for a warehouse the batch holds no stock in', () => {
    const { sku, batch } = stockedBatches()[0]!
    const held = new Set(api.batchStockPosition(sku, batch.batchNo)!.warehouses.map((w) => w.warehouseId))
    const other = api.activeWarehouses().find((w) => !held.has(w.id))!
    expect(api.batchStorageLocations(sku, batch.batchNo, other.id)).toEqual([])
  })
})

describe('attribute change trail', () => {
  it('explains a graded receipt snapshot with a regrade right after receipt', () => {
    const journey = api.batchJourney('1001', 'Batch #001')
    const changes = api.batchAttributeChanges('1001', 'Batch #001')
    expect(changes).toHaveLength(1)
    const regrade = changes[0]!
    expect(regrade.channel).toBe('web')
    expect(regrade.changes).toEqual([{
      key: 'grade',
      from: journey[0]!.attributes.grade,
      to: api.getProductBatches('1001')[0]!.attributes.grade,
    }])
    expect(regrade.date > journey[0]!.date).toBe(true)
    expect(regrade.date < journey[1]!.date).toBe(true)
  })

  it('places markers in the journey without moving the balance', () => {
    const timeline = api.batchJourneyTimeline('1001', 'Batch #001')
    const at = timeline.findIndex((e) => e.kind === 'change')
    const before = timeline[at - 1]!
    const marker = timeline[at]!
    expect(before.kind).toBe('movement')
    expect(marker.kind).toBe('change')
    if (before.kind === 'movement' && marker.kind === 'change') {
      expect(marker.balanceBase).toBe(before.row.balanceBase)
    }
    expect(timeline.filter((e) => e.kind === 'movement')).toHaveLength(api.batchJourney('1001', 'Batch #001').length)
  })

  it('adds the edits people save, with where they came from', () => {
    const batch = api.getProductBatches('1101')[0]!
    expect(api.batchAttributeChanges('1101', batch.batchNo)).toEqual([])
    expect(api.updateBatch('1101', batch.id, { attributes: { manufacturing_date: '2026-05-01' } }).ok).toBe(true)
    expect(api.updateBatch('1101', batch.id, { attributes: { best_before_date: '2026-12-01' } }, 'Dewi Rahayu', 'import').ok).toBe(true)
    const changes = api.batchAttributeChanges('1101', batch.batchNo)
    expect(changes.map((c) => [c.changes[0]!.key, c.channel])).toEqual([['manufacturing_date', 'web'], ['best_before_date', 'import']])
    expect(changes[1]!.user).toBe('Dewi Rahayu')
    expect(changes[1]!.changes[0]).toEqual({ key: 'best_before_date', from: null, to: '2026-12-01' })
  })

  it('leaves batch number and description edits out of the trail', () => {
    const batch = api.getProductBatches('1101')[0]!
    expect(api.updateBatch('1101', batch.id, { description: 'Roasted for the Jakarta café' }).ok).toBe(true)
    expect(api.batchAttributeChanges('1101', batch.batchNo)).toEqual([])
  })
})

describe('visual journey — flow by counterparty', () => {
  it('puts every in/out line in exactly one party node, and every neutral line in the batch', () => {
    for (const { sku, batch } of stockedBatches().slice(0, 15)) {
      const graph = api.batchFlowGraph(sku, batch.batchNo)
      const parties = [...graph.incoming, ...graph.outgoing]
      const journey = api.batchJourney(sku, batch.batchNo)
      const lines = parties.reduce((sum, p) => sum + p.transactions.length, 0) + graph.internal.length
      expect(lines, `${sku} ${batch.batchNo}`).toBe(journey.length)
      expect(new Set(parties.map((p) => p.key)).size).toBe(parties.length)
      expect(graph.internal.every((r) => r.direction === 'neutral')).toBe(true)
    }
  })

  it('balances: received minus issued is on hand, and parties are biggest first', () => {
    for (const { sku, batch } of stockedBatches().slice(0, 15)) {
      const graph = api.batchFlowGraph(sku, batch.batchNo)
      expect(graph.received - graph.issued, `${sku} ${batch.batchNo}`).toBe(batch.onHand)
      expect(graph.incoming.reduce((sum, p) => sum + p.qty, 0)).toBe(graph.received)
      expect(graph.outgoing.reduce((sum, p) => sum + p.qty, 0)).toBe(graph.issued)
      for (const side of [graph.incoming, graph.outgoing]) {
        expect(side.map((p) => p.qty)).toEqual([...side.map((p) => p.qty)].sort((a, b) => b - a))
      }
    }
  })

  it('names the party: a vendor or customer, not a transaction type', () => {
    const graph = api.batchFlowGraph('1001', 'Batch #001')
    const journey = api.batchJourney('1001', 'Batch #001')
    const delivery = journey.find((r) => r.type === 'Purchase delivery')!
    const vendorNode = graph.incoming.find((p) => p.kind === 'vendor' && p.refId === delivery.counterparty!.id)!
    expect(vendorNode.types).toContain('Purchase delivery')
    const sale = journey.find((r) => r.type === 'Sales delivery')!
    expect(graph.outgoing.some((p) => p.kind === 'customer' && p.refId === sale.counterparty!.id)).toBe(true)
  })

  it('gives each Work order its own node, carrying the batches on its other side', () => {
    const roasted = api.getProductBatches('1101')[0]!
    const output = api.batchFlowGraph('1101', roasted.batchNo).incoming.find((p) => p.kind === 'work-order')!
    const sources = api.relatedBatches('1101', roasted.batchNo).sources
    expect(output.batches).toEqual(sources.filter((b) => b.workOrderNumber === output.refId))

    const source = output.batches[0]!
    const consumed = api.batchFlowGraph(source.sku, source.batchNo).outgoing.filter((p) => p.kind === 'work-order')
    expect(consumed.some((p) => p.batches.some((b) => b.sku === '1101' && b.batchNo === roasted.batchNo))).toBe(true)
  })

  it('has no Work order coming in for a green bean — it is bought, not made', () => {
    const graph = api.batchFlowGraph('1004', 'Batch #001')
    expect(graph.incoming.some((p) => p.kind === 'work-order')).toBe(false)
    expect(graph.incoming.some((p) => p.kind === 'vendor')).toBe(true)
  })
})

describe('link from the product batch page (decision Q8)', () => {
  it('resolves product batches, but not a warehouse-scoped lot', async () => {
    const { getWarehouseDetail } = await import('~/data/warehouseDetails')
    const batch = api.getProductBatches('1001')[0]!
    expect(api.getBatchTrace('1001', batch.batchNo)?.batchNo).toBe(batch.batchNo)

    const productBatchNos = new Set(api.getProductBatches('1001').map((b) => b.batchNo))
    const lot = api.activeWarehouses()
      .flatMap((w) => getWarehouseDetail(w.id)?.stock.find((s) => s.sku === '1001')?.batches ?? [])
      .find((b) => !productBatchNos.has(b.batchNo))
    if (lot) expect(api.getBatchTrace('1001', lot.batchNo)).toBeUndefined()
  })
})

describe('report access (story 1)', () => {
  it('opens for Owner, Ultimate and Stockist only', () => {
    expect(api.canViewBatchTraceability(['owner'])).toBe(true)
    expect(api.canViewBatchTraceability(['ultimate'])).toBe(true)
    expect(api.canViewBatchTraceability(['sales', 'stockist'])).toBe(true)
    expect(api.canViewBatchTraceability(['sales'])).toBe(false)
    expect(api.canViewBatchTraceability(['report-reader'])).toBe(false)
    expect(api.canViewBatchTraceability([])).toBe(false)
  })
})
