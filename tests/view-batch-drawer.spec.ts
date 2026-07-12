// @vitest-environment happy-dom
/**
 * ViewBatchDrawer.vue, packing mode ("View batch" on Picking details etc.).
 *
 * `pickedBatches` is ONE field, not a separate "plan" and "actual" — endPicking/
 * savePickingDraft overwrite it in place with the real per-batch result the moment
 * anything is actually picked. Callers that need BOTH numbers side by side (picking)
 * pass `plannedBatches` separately — a frozen snapshot of the original per-batch
 * plan taken at task creation, untouched by that overwrite. When plannedBatches is
 * given, the table renders TWO columns keyed by batchNo: "Qty to pick" (from the
 * plan) and the qtyLabel column (from pickedBatches, the real result) — a batch can
 * appear in only one of the two (a re-pinned pick, or an untouched planned batch).
 * When plannedBatches is NOT given (packing/delivery callers), the table keeps its
 * old single, dynamically-labeled column. The HEADER's own "Qty to pick" stat
 * (qtyToPick prop) is always fixed at the line's expectedQty regardless of progress.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'

const PICKED_BATCHES = [
  { batchNo: 'Batch #00001', expiryDate: '2026-12-01', desc: '', qty: 2, unit: 'Sack', location: 'Bin 01' },
  { batchNo: 'Batch #00002', expiryDate: '2026-11-01', desc: '', qty: 1, unit: 'Sack', location: 'Bin 02' },
]

function mountDrawer(props: Record<string, unknown>) {
  return mount(ViewBatchDrawer, {
    props: {
      open: true,
      sku: '1003',
      warehouseId: 'wh-006',
      kind: 'packing',
      pickedBatches: PICKED_BATCHES,
      productName: 'Green Beans Arabica Toraja Sapan',
      productImg: '',
      ...props,
    },
  })
}

function headerRow(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('thead th').map((th) => th.text())
}

function statValue(wrapper: ReturnType<typeof mount>, label: string): string | undefined {
  const stat = wrapper.findAll('.vbd-stat').find((s) => s.text().startsWith(label))
  return stat?.find('.vbd-stat-value').text()
}

function bodyRow(wrapper: ReturnType<typeof mount>, batchNo: string): string[] {
  const row = wrapper.findAll('tbody tr').find((tr) => tr.text().includes(batchNo))
  return row ? row.findAll('td').map((td) => td.text()) : []
}

describe('ViewBatchDrawer — without plannedBatches (packing/delivery callers): single column, unaffected', () => {
  it('static qtyLabel, table column unaffected by pickedQty concept', () => {
    const wrapper = mountDrawer({ qtyLabel: 'Packed qty' })
    expect(headerRow(wrapper).filter((h) => /qty/i.test(h))).toEqual(['Packed qty'])
    const row = bodyRow(wrapper, 'Batch #00001')
    expect(row[4]).toBe('2') // still just shows pickedBatches as-is
    wrapper.unmount()
  })

  it('task NOT started (pickedQty=0): table column reads "Qty to pick" and shows the plan numbers as-is', () => {
    const wrapper = mountDrawer({ qtyToPick: 3, pickedQty: 0 })
    expect(headerRow(wrapper)).toContain('Qty to pick')
    expect(headerRow(wrapper).filter((h) => h === 'Qty to pick' || h === 'Picked qty')).toEqual(['Qty to pick'])
    expect(statValue(wrapper, 'Qty to pick')).toBe('3')
    expect(statValue(wrapper, 'Picked qty')).toBe('0')
    const row1 = bodyRow(wrapper, 'Batch #00001')
    expect(row1[4]).toBe('2')
    wrapper.unmount()
  })

  it('task PARTIALLY picked (pickedQty=1 of 3): header "Qty to pick" stays 3, table switches to "Picked qty"', () => {
    const wrapper = mountDrawer({
      qtyToPick: 3,
      pickedQty: 1,
      pickedBatches: [{ batchNo: 'Batch #00001', expiryDate: '2026-12-01', desc: '', qty: 1, unit: 'Sack', location: 'Bin 01' }],
    })
    expect(statValue(wrapper, 'Qty to pick')).toBe('3')
    expect(statValue(wrapper, 'Picked qty')).toBe('1')
    expect(headerRow(wrapper)).toContain('Picked qty')
    expect(headerRow(wrapper)).not.toContain('Qty to pick')
    const row1 = bodyRow(wrapper, 'Batch #00001')
    expect(row1[4]).toBe('1')
    wrapper.unmount()
  })
})

describe('ViewBatchDrawer — with plannedBatches (picking task view): two columns, keyed by batchNo', () => {
  const PLANNED = [
    { batchNo: 'Batch #00001', expiryDate: '2026-12-01', desc: '', qty: 2, unit: 'Sack', location: 'Bin 01' },
    { batchNo: 'Batch #00002', expiryDate: '2026-11-01', desc: '', qty: 1, unit: 'Sack', location: 'Bin 02' },
  ]

  it('task NOT started: both "Qty to pick" and "Picked qty" columns present; plan shows the split, picked is all 0', () => {
    // Real data BEFORE any save: task.batchPicks is still the untouched creation-
    // time plan (savePickingDraft/endPicking haven't run to overwrite it with the
    // real result yet) — so pickedBatches arrives IDENTICAL to plannedBatches, not
    // empty. The "Picked qty" column must still read 0 per row, driven by pickedQty
    // (the header's real progress signal), not by what happens to be in pickedBatches.
    const wrapper = mountDrawer({
      qtyToPick: 3, pickedQty: 0,
      plannedBatches: PLANNED,
      pickedBatches: PLANNED,
    })
    expect(headerRow(wrapper).filter((h) => h === 'Qty to pick' || h === 'Picked qty')).toEqual(['Qty to pick', 'Picked qty'])
    expect(statValue(wrapper, 'Qty to pick')).toBe('3')
    expect(statValue(wrapper, 'Picked qty')).toBe('0')
    const row1 = bodyRow(wrapper, 'Batch #00001')
    expect(row1[4]).toBe('2') // planned qty for this batch
    expect(row1[5]).toBe('0') // nothing picked yet — NOT the plan's 2
    const row2 = bodyRow(wrapper, 'Batch #00002')
    expect(row2[4]).toBe('1')
    expect(row2[5]).toBe('0')
    wrapper.unmount()
  })

  it('PARTIALLY picked, matching the plan on one batch, untouched on the other: per-row split stays correct', () => {
    // Order qty 3 across 2 batches (2 + 1), operator only picked 1 of Batch #00001 so far.
    const wrapper = mountDrawer({
      qtyToPick: 3, pickedQty: 1,
      plannedBatches: PLANNED,
      pickedBatches: [{ batchNo: 'Batch #00001', expiryDate: '2026-12-01', desc: '', qty: 1, unit: 'Sack', location: 'Bin 01' }],
    })
    expect(statValue(wrapper, 'Qty to pick')).toBe('3') // header target — never changes
    expect(statValue(wrapper, 'Picked qty')).toBe('1')

    const row1 = bodyRow(wrapper, 'Batch #00001')
    expect(row1[4]).toBe('2') // plan for this batch — unchanged
    expect(row1[5]).toBe('1') // real result for this batch

    const row2 = bodyRow(wrapper, 'Batch #00002')
    expect(row2[4]).toBe('1') // plan for this batch — still shown even though untouched
    expect(row2[5]).toBe('0') // nothing picked from it yet
    wrapper.unmount()
  })

  it('operator re-pins to a batch NOT in the original plan: new row appears with Qty to pick = 0', () => {
    const wrapper = mountDrawer({
      qtyToPick: 3, pickedQty: 3,
      plannedBatches: PLANNED,
      pickedBatches: [{ batchNo: 'Batch #00099', expiryDate: '2027-01-01', desc: '', qty: 3, unit: 'Sack', location: 'Bin 09' }],
    })
    const row = bodyRow(wrapper, 'Batch #00099')
    expect(row[4]).toBe('0') // never part of the plan
    expect(row[5]).toBe('3') // but this is what was actually picked
    wrapper.unmount()
  })
})

describe('ViewBatchDrawer — delivery details ("Order qty" / "Picked qty" / "Packed qty" stats + table)', () => {
  // Delivery has no "not yet executed" ambiguity like picking does — its batch
  // data (from batchPicksForOrderSku) is always the real, already-settled result.
  // It reuses the exact same qtyToPick/plannedBatches plumbing as picking, just
  // relabeled via plannedQtyLabel, and doesn't pass pickedQty at all (so the
  // picking-only "not started yet" gate never applies here).
  it('header shows Order qty, then Picked qty, then Packed qty — Picked qty must match the real picked total', () => {
    const wrapper = mountDrawer({
      orderQty: 5,
      qtyLabel: 'Packed qty',
      plannedQtyLabel: 'Picked qty',
      qtyToPick: 3, // sum of PICKED_BATCHES qtys (2 + 1)
      plannedBatches: PICKED_BATCHES,
      // pickedBatches intentionally omitted -> defaults to PICKED_BATCHES via mountDrawer
    })
    const labels = wrapper.findAll('.vbd-stat-label').map((l) => l.text())
    expect(labels).toEqual(['Order qty', 'Picked qty', 'Packed qty'])
    expect(statValue(wrapper, 'Order qty')).toBe('5')
    expect(statValue(wrapper, 'Picked qty')).toBe('3')
    expect(statValue(wrapper, 'Packed qty')).toBe('3')
    wrapper.unmount()
  })

  it('table adds a "Picked qty" column after Storage location, matching "Packed qty" per batch exactly', () => {
    const wrapper = mountDrawer({
      orderQty: 5,
      qtyLabel: 'Packed qty',
      plannedQtyLabel: 'Picked qty',
      qtyToPick: 3,
      plannedBatches: PICKED_BATCHES,
    })
    expect(headerRow(wrapper)).toEqual(['Batch', 'Expiry date', 'Description', 'Storage location', 'Picked qty', 'Packed qty', 'Unit'])
    const row1 = bodyRow(wrapper, 'Batch #00001')
    expect(row1[4]).toBe('2') // Picked qty
    expect(row1[5]).toBe('2') // Packed qty — same source, must match exactly
    const row2 = bodyRow(wrapper, 'Batch #00002')
    expect(row2[4]).toBe('1')
    expect(row2[5]).toBe('1')
    wrapper.unmount()
  })

  it('shippedQty stat: shown ONLY when > 0 — a prior, independent cycle already shipped some of this order', () => {
    const withPrior = mountDrawer({
      orderQty: 5, qtyLabel: 'Packed qty', plannedQtyLabel: 'Picked qty', qtyToPick: 2,
      shippedQty: 3, // an earlier cycle already shipped 3 of the 5 — explains Order qty (5) != Picked/Packed (2)
    })
    const labelsWithPrior = withPrior.findAll('.vbd-stat-label').map((l) => l.text())
    expect(labelsWithPrior).toEqual(['Order qty', 'Picked qty', 'Packed qty', 'Previously shipped'])
    expect(statValue(withPrior, 'Previously shipped')).toBe('3')
    withPrior.unmount()

    // Normal, single-cycle order: shippedQty is 0/undefined — stat must NOT appear at all.
    const noPrior = mountDrawer({
      orderQty: 5, qtyLabel: 'Packed qty', plannedQtyLabel: 'Picked qty', qtyToPick: 5,
      shippedQty: 0,
    })
    const labelsNoPrior = noPrior.findAll('.vbd-stat-label').map((l) => l.text())
    expect(labelsNoPrior).toEqual(['Order qty', 'Picked qty', 'Packed qty'])
    noPrior.unmount()
  })
})
