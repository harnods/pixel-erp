// @vitest-environment happy-dom
/**
 * ViewSerialDrawer.vue, packing mode ("View serial number" on Picking details).
 *
 * Normally packing mode just lists pickedSerials as-is (no status concept — the
 * packing/delivery callers only ever have a flat "what was packed" list). The
 * picking task view additionally passes plannedSerials — the frozen per-line serial
 * reservation plan from task creation (full rows, WITH location — a serial that's
 * only reserved, never picked, has no pickedSerials entry to source a location
 * from, so the plan is the only place it survives) — so a serial that's held for
 * this task but not yet actually scanned can be told apart from one that's
 * genuinely been picked. Rows are the union of planned + picked, each carrying a
 * status badge mirroring ManageSerialDrawer's picking-execution badges: "Reserved"
 * (planned, not yet picked) or "Picked" (also in pickedSerials).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'

function mountDrawer(props: Record<string, unknown>) {
  return mount(ViewSerialDrawer, {
    props: {
      open: true,
      sku: '2004',
      warehouseId: 'wh-006',
      kind: 'packing',
      countedTotal: 0,
      productName: 'Some Product',
      productImg: '',
      ...props,
    },
  })
}

function headerRow(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('thead th').map((th) => th.text())
}

function bodyRow(wrapper: ReturnType<typeof mount>, serial: string): ReturnType<typeof mount> | undefined {
  return wrapper.findAll('tbody tr').find((tr) => tr.text().includes(serial))
}

function statValue(wrapper: ReturnType<typeof mount>, label: string): string | undefined {
  const stat = wrapper.findAll('.vsd-stat').find((s) => s.text().startsWith(label))
  return stat?.find('.vsd-stat-value').text()
}

describe('ViewSerialDrawer — without plannedSerials (packing/delivery callers): no status column', () => {
  it('flat list, as-is, no Status column', () => {
    const wrapper = mountDrawer({
      pickedSerials: [{ serial: 'SN001', location: 'Bin 01' }],
    })
    expect(headerRow(wrapper)).not.toContain('Status')
    wrapper.unmount()
  })
})

describe('ViewSerialDrawer — with plannedSerials (picking task view): Reserved/Picked status per row', () => {
  it('task NOT started: every planned serial shows "Reserved", none "Picked" — even though pickedSerials arrives identical to the plan', () => {
    // Real data BEFORE any save: task.serialPicks is still the untouched creation-
    // time plan (savePickingDraft/endPicking haven't overwritten it with the real
    // scanned result yet), so pickedSerials arrives IDENTICAL to plannedSerials —
    // not empty. Status must still read "Reserved" for all, driven by pickedQty
    // (the header's real progress signal, 0 here), not by what's in pickedSerials.
    const wrapper = mountDrawer({
      pickedQty: 0,
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: 'Bin 02' }],
      pickedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: 'Bin 02' }],
    })
    expect(headerRow(wrapper)).toContain('Status')
    expect(bodyRow(wrapper, 'SN001')?.text()).toContain('Reserved')
    expect(bodyRow(wrapper, 'SN001')?.text()).not.toContain('Picked')
    expect(bodyRow(wrapper, 'SN002')?.text()).toContain('Reserved')
    wrapper.unmount()
  })

  it('reserved-but-unscanned serial still shows its bin location — sourced from the plan, not pickedSerials', () => {
    // Bug: plannedSerials used to be passed as bare serial strings (no location),
    // so a "Reserved" row (no pickedSerials entry to source a location from) always
    // rendered a blank Location cell, even though the warehouse has a real bin for
    // it. plannedSerials now carries full {serial, location} rows.
    const wrapper = mountDrawer({
      pickedQty: 0,
      plannedSerials: [{ serial: 'SN001', location: 'Bin 07' }],
      pickedSerials: [{ serial: 'SN001', location: 'Bin 07' }],
    })
    const row = bodyRow(wrapper, 'SN001')
    expect(row?.text()).toContain('Reserved')
    expect(row?.text()).toContain('Bin 07')
    wrapper.unmount()
  })

  it('PARTIALLY picked: scanned serial shows "Picked", untouched planned serial still shows "Reserved" with its bin', () => {
    const wrapper = mountDrawer({
      pickedQty: 1,
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: 'Bin 02' }],
      pickedSerials: [{ serial: 'SN001', location: 'Bin 01' }],
    })
    expect(bodyRow(wrapper, 'SN001')?.text()).toContain('Picked')
    expect(bodyRow(wrapper, 'SN001')?.text()).not.toContain('Reserved')
    const row2 = bodyRow(wrapper, 'SN002')
    expect(row2?.text()).toContain('Reserved')
    expect(row2?.text()).toContain('Bin 02') // location from the plan, since it's never been picked
    wrapper.unmount()
  })

  it('operator re-scans a serial NOT in the original plan: still shows up, marked "Picked"', () => {
    const wrapper = mountDrawer({
      pickedQty: 1,
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }],
      pickedSerials: [{ serial: 'SN099', location: 'Bin 09' }],
    })
    expect(bodyRow(wrapper, 'SN099')?.text()).toContain('Picked')
    expect(bodyRow(wrapper, 'SN001')?.text()).toContain('Reserved')
    wrapper.unmount()
  })

  it('BUG regression — task FINISHED with a re-pin (planned SN never actually picked): the released serial must NOT show up as "Reserved" at all', () => {
    // Reported bug: order qty 1 for a serial-tracked SKU, SN001 reserved at order
    // creation. Operator starts picking but scans SN002 instead (not the reserved
    // one), then finishes picking. endPicking() releases SN001's reservation for
    // this order+sku and re-reserves SN002 in its place (picksByOrder + release/
    // reserveStock) — so SN001 is genuinely free stock again, not held for this
    // line anymore. Before this fix, the drawer still merged plannedSerials in
    // unconditionally and showed SN001 as "Reserved" even though it wasn't.
    const wrapper = mountDrawer({
      pickedQty: 1,
      taskFinished: true,
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }],
      pickedSerials: [{ serial: 'SN002', location: 'Bin 02' }],
    })
    // SN001 must not appear anywhere in the table at all — it's not reserved for
    // this line anymore, so it has nothing to do with this drawer once finished.
    expect(bodyRow(wrapper, 'SN001')).toBeUndefined()
    expect(bodyRow(wrapper, 'SN002')?.text()).toContain('Picked')
    wrapper.unmount()
  })

  it('task still IN PROGRESS (not finished) with the same re-pinned draft: SN001 legitimately still shows "Reserved" — nothing released yet', () => {
    // savePickingDraft() never releases/re-reserves (only endPicking does), so
    // while the task is still open/in progress, a planned-but-unscanned serial
    // really is still held — taskFinished must default to false/undefined here.
    const wrapper = mountDrawer({
      pickedQty: 1,
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }],
      pickedSerials: [{ serial: 'SN002', location: 'Bin 02' }],
    })
    expect(bodyRow(wrapper, 'SN001')?.text()).toContain('Reserved')
    expect(bodyRow(wrapper, 'SN002')?.text()).toContain('Picked')
    wrapper.unmount()
  })
})

describe('ViewSerialDrawer — delivery details ("Order qty" / "Picked qty" / "Packed qty" stats + Status: Picked)', () => {
  // Delivery has no "not yet executed" ambiguity like picking does — its serial
  // data is always the real, already-settled result. It reuses the exact same
  // qtyToPick/plannedSerials plumbing as picking, just relabeled, and doesn't pass
  // pickedQty at all (so the picking-only "not started yet" gate never applies).
  it('header shows Order qty, then Picked qty, then Packed qty — Picked qty must match the real picked total', () => {
    const wrapper = mountDrawer({
      orderQty: 5,
      qtyLabel: 'Packed qty',
      plannedQtyLabel: 'Picked qty',
      qtyToPick: 2,
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: 'Bin 02' }],
      pickedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: 'Bin 02' }],
    })
    const labels = wrapper.findAll('.vsd-stat-label').map((l) => l.text())
    expect(labels).toEqual(['Order qty', 'Picked qty', 'Packed qty'])
    expect(statValue(wrapper, 'Order qty')).toBe('5')
    expect(statValue(wrapper, 'Picked qty')).toBe('2')
    expect(statValue(wrapper, 'Packed qty')).toBe('2')
    wrapper.unmount()
  })

  it('table Status column reads "Picked" for every row — nothing "Reserved" once shipped', () => {
    const wrapper = mountDrawer({
      orderQty: 5,
      qtyLabel: 'Packed qty',
      plannedQtyLabel: 'Picked qty',
      qtyToPick: 2,
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: 'Bin 02' }],
      pickedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: 'Bin 02' }],
    })
    expect(headerRow(wrapper)).toContain('Status')
    expect(bodyRow(wrapper, 'SN001')?.text()).toContain('Picked')
    expect(bodyRow(wrapper, 'SN001')?.text()).not.toContain('Reserved')
    expect(bodyRow(wrapper, 'SN002')?.text()).toContain('Picked')
    expect(bodyRow(wrapper, 'SN002')?.text()).not.toContain('Reserved')
    wrapper.unmount()
  })

  it('shippedQty stat: shown ONLY when > 0 — a prior, independent cycle already shipped some of this order', () => {
    const withPrior = mountDrawer({
      orderQty: 5, qtyLabel: 'Packed qty', plannedQtyLabel: 'Picked qty', qtyToPick: 2,
      shippedQty: 3,
    })
    const labelsWithPrior = withPrior.findAll('.vsd-stat-label').map((l) => l.text())
    expect(labelsWithPrior).toEqual(['Order qty', 'Picked qty', 'Packed qty', 'Previously shipped'])
    expect(statValue(withPrior, 'Previously shipped')).toBe('3')
    withPrior.unmount()

    const noPrior = mountDrawer({
      orderQty: 5, qtyLabel: 'Packed qty', plannedQtyLabel: 'Picked qty', qtyToPick: 5,
      shippedQty: 0,
    })
    const labelsNoPrior = noPrior.findAll('.vsd-stat-label').map((l) => l.text())
    expect(labelsNoPrior).toEqual(['Order qty', 'Picked qty', 'Packed qty'])
    noPrior.unmount()
  })
})

describe('ViewSerialDrawer — packing task details (View SN details for a serial-tracked SKU)', () => {
  // Reported bug: a new packing task created from a finished picking task showed
  // no status at all for its serials — the operator couldn't tell which SN was
  // actually scanned during picking just by looking at the drawer. Same fix as
  // delivery: pass plannedSerials = pickedSerials (packing's serialPicks is always
  // the real, settled result — no "not yet executed" ambiguity), which turns the
  // Status column on without touching the header stats at all (no orderQty/
  // qtyToPick/qtyLabel passed here, unlike the delivery case).
  it('table Status column reads "Picked" for the serials actually scanned during picking', () => {
    const wrapper = mountDrawer({
      countedTotal: 2,
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: 'Bin 02' }],
      pickedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: 'Bin 02' }],
    })
    expect(headerRow(wrapper)).toContain('Status')
    expect(bodyRow(wrapper, 'SN001')?.text()).toContain('Picked')
    expect(bodyRow(wrapper, 'SN002')?.text()).toContain('Picked')
    wrapper.unmount()
  })
})

describe('ViewSerialDrawer — statusPlannedLabel/statusPickedLabel (put-away details)', () => {
  // Put-away reuses this same plannedSerials/pickedSerials union+badge plumbing
  // for a different fact than picking: a serial already RECEIVED (plannedSerials)
  // vs. already ASSIGNED to a storage bin (pickedSerials) — "Reserved"/"Picked"
  // (picking's own vocabulary) don't fit; nothing is "reserved" in put-away.
  it('defaults stay "Reserved"/"Picked" when the new labels are not passed (picking/packing/delivery unaffected)', () => {
    const wrapper = mountDrawer({
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: '' }],
      pickedSerials: [{ serial: 'SN001', location: 'Bin 01' }],
    })
    expect(bodyRow(wrapper, 'SN001')?.text()).toContain('Picked')
    expect(bodyRow(wrapper, 'SN002')?.text()).toContain('Reserved')
    wrapper.unmount()
  })

  it('put-away passes "Received"/"Assigned" instead — a not-yet-binned serial reads "Received", a binned one reads "Assigned"', () => {
    const wrapper = mountDrawer({
      plannedSerials: [{ serial: 'SN001', location: 'Bin 01' }, { serial: 'SN002', location: '' }],
      pickedSerials: [{ serial: 'SN001', location: 'Bin 01' }],
      statusPlannedLabel: 'Received',
      statusPickedLabel: 'Assigned',
    })
    expect(bodyRow(wrapper, 'SN001')?.text()).toContain('Assigned')
    expect(bodyRow(wrapper, 'SN001')?.text()).not.toContain('Picked')
    expect(bodyRow(wrapper, 'SN002')?.text()).toContain('Received')
    expect(bodyRow(wrapper, 'SN002')?.text()).not.toContain('Reserved')
    wrapper.unmount()
  })
})
