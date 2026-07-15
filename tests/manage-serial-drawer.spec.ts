// @vitest-environment happy-dom
/**
 * Regression guard for ManageSerialDrawer.vue's picking-mode status badge/row
 * styling — this component is shared across 4+ modes (count / transfer /
 * picking-planning / picking-execution) and two regressions slipped through in a
 * row because a fix aimed at execution mode silently changed planning mode too
 * (both share kind === 'picking'; only `executionMode` tells them apart).
 */
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageSerialDrawer from '~/components/patterns/ManageSerialDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
// Side-effect import: reserveAllPickableOrders() runs at outgoing.ts's module top
// level, which is what actually populates stockReservations (warehouseDetails.ts
// itself never imports outgoing.ts — no circular dep — so without this, reserved
// units in seed data never get created and every stock item reads unreserved).
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'
const SKU = '2004' // serial-tracked (Espresso Machine), has reserved units in seed data

function reservedSerials(): string[] {
  const item = getWarehouseDetail(WAREHOUSE_ID)?.stock.find((s) => s.sku === SKU)
  return item?.serials?.reserved.map((u) => u.serial) ?? []
}

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageSerialDrawer, {
    props: {
      open: true,
      sku: SKU,
      warehouseId: WAREHOUSE_ID,
      targetCount: 1,
      modelValue: [],
      ...props,
    },
  })
}

/** The status badge text for the table row belonging to `serial`, empty if the row isn't rendered. */
function rowStatus(wrapper: ReturnType<typeof mount>, serial: string): string {
  const rows = wrapper.findAll('tbody tr')
  for (const row of rows) {
    if (row.text().includes(serial)) return row.find('td.msn-td--status').text()
  }
  return ''
}

function rowCount(wrapper: ReturnType<typeof mount>): number {
  return wrapper.findAll('tbody tr').filter((r) => !r.classes().includes('msn-tr--empty')).length
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
}

async function clickResetCount(wrapper: ReturnType<typeof mount>) {
  const btn = wrapper.findAll('button').find((b) => b.text() === 'Reset count')
  await btn?.trigger('click')
}

describe('ManageSerialDrawer — picking mode, row status by executionMode', () => {
  it('planning (kind=picking, no executionMode): a row already in modelValue reads "Reserved", never "Picked"', async () => {
    const serials = reservedSerials()
    expect(serials.length).toBeGreaterThan(0) // sanity: seed data must have something to assert on

    const wrapper = mountDrawer({
      kind: 'picking',
      targetCount: 1,
      modelValue: [{ serial: serials[0] }],
    })
    await flushPromises()

    expect(rowStatus(wrapper, serials[0]!)).toBe('Reserved')
    wrapper.unmount()
  })

  it('execution (kind=picking, executionMode=true): a reserved-but-unscanned row reads "Reserved", not "Picked"', async () => {
    const serials = reservedSerials()
    const wrapper = mountDrawer({
      kind: 'picking',
      executionMode: true,
      targetCount: 1,
      modelValue: [], // nothing scanned yet
      plannedSerials: [serials[0]], // held for this task, not yet confirmed
    })
    await flushPromises()

    expect(rowStatus(wrapper, serials[0]!)).toBe('Reserved')
    wrapper.unmount()
  })

  it('execution (kind=picking, executionMode=true): a scanned/confirmed row reads "Picked", not "Reserved"', async () => {
    const serials = reservedSerials()
    const wrapper = mountDrawer({
      kind: 'picking',
      executionMode: true,
      targetCount: 1,
      modelValue: [{ serial: serials[0] }], // already scanned/confirmed
      plannedSerials: [serials[0]],
    })
    await flushPromises()

    expect(rowStatus(wrapper, serials[0]!)).toBe('Picked')
    wrapper.unmount()
  })

  it('picked-qty header stat: starts at 0 in execution mode until something is actually scanned', async () => {
    const serials = reservedSerials()
    const wrapper = mountDrawer({
      kind: 'picking',
      executionMode: true,
      targetCount: 1,
      modelValue: [],
      plannedSerials: [serials[0]],
      qtyToPick: 1,
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Qty to pick')
    expect(wrapper.text()).toContain('Picked qty')
    // the stat value for Picked qty must be 0 — nothing was actually scanned
    const stats = wrapper.findAll('.msn-stat')
    const pickedStat = stats.find((s) => s.text().includes('Picked qty'))
    expect(pickedStat?.text()).toMatch(/Picked qty0|Picked qty\s*0/)
    wrapper.unmount()
  })
})

describe('ManageSerialDrawer — scan bar available in every mode, with correct per-mode behavior', () => {
  it('count mode: scanning a genuinely unrecognized serial adds it as a new counted row (an "extra" found during count)', async () => {
    const wrapper = mountDrawer({ kind: 'count', targetCount: 0, modelValue: [] })
    await flushPromises()
    const before = rowCount(wrapper)

    await scan(wrapper, 'FAKE-NEW-COUNT-001')
    await flushPromises()

    expect(rowCount(wrapper)).toBe(before + 1)
    expect(wrapper.text()).toContain('FAKE-NEW-COUNT-001')
    wrapper.unmount()
  })

  it('receiving mode: scanning a genuinely new serial registers it; a serial already received in a prior task is rejected', async () => {
    const wrapper = mountDrawer({
      kind: 'receiving',
      targetCount: 0,
      modelValue: [],
      blockedSerials: ['ALREADY-RECEIVED-001'],
    })
    await flushPromises()
    const before = rowCount(wrapper)

    await scan(wrapper, 'FAKE-NEW-RECEIVING-001')
    await flushPromises()
    expect(rowCount(wrapper)).toBe(before + 1)
    expect(wrapper.text()).toContain('FAKE-NEW-RECEIVING-001')

    const afterFirstScan = rowCount(wrapper)
    await scan(wrapper, 'ALREADY-RECEIVED-001')
    await flushPromises()
    // Rejected — row count must NOT increase, and the blocked serial must not
    // silently get added to the list.
    expect(rowCount(wrapper)).toBe(afterFirstScan)
    wrapper.unmount()
  })

  it('in-out mode: scanning a genuinely new serial registers it (stock coming in)', async () => {
    const wrapper = mountDrawer({ kind: 'in-out', targetCount: 0, modelValue: [] })
    await flushPromises()
    const before = rowCount(wrapper)

    await scan(wrapper, 'FAKE-NEW-INOUT-001')
    await flushPromises()

    expect(rowCount(wrapper)).toBe(before + 1)
    expect(wrapper.text()).toContain('FAKE-NEW-INOUT-001')
    wrapper.unmount()
  })

  it('put-away mode: scanning an already-listed serial does not error or duplicate the row (fixed, already-known set)', async () => {
    const wrapper = mountDrawer({
      kind: 'put-away',
      targetCount: 1,
      modelValue: [{ serial: 'PA-SN-001' }],
    })
    await flushPromises()
    const before = rowCount(wrapper)

    await scan(wrapper, 'PA-SN-001')
    await flushPromises()

    expect(rowCount(wrapper)).toBe(before) // no duplicate row
    wrapper.unmount()
  })

  it('put-away mode: scanning a serial NOT in the fixed set is rejected, not silently added', async () => {
    const wrapper = mountDrawer({
      kind: 'put-away',
      targetCount: 1,
      modelValue: [{ serial: 'PA-SN-001' }],
    })
    await flushPromises()
    const before = rowCount(wrapper)

    await scan(wrapper, 'PA-SN-UNKNOWN-999')
    await flushPromises()

    expect(rowCount(wrapper)).toBe(before) // put-away's set is fixed — never grows via scan
    expect(wrapper.text()).not.toContain('PA-SN-UNKNOWN-999')
    wrapper.unmount()
  })

  it('"Reset count" undoes scans by re-seeding from props — an extra found during count disappears again', async () => {
    const wrapper = mountDrawer({ kind: 'count', targetCount: 0, modelValue: [] })
    await flushPromises()
    const before = rowCount(wrapper)

    await scan(wrapper, 'FAKE-NEW-RESET-001')
    await flushPromises()
    expect(rowCount(wrapper)).toBe(before + 1)

    await clickResetCount(wrapper)
    await flushPromises()

    expect(rowCount(wrapper)).toBe(before)
    expect(wrapper.text()).not.toContain('FAKE-NEW-RESET-001')
    wrapper.unmount()
  })

  it('"Reset count" in receiving mode restores blockedSerials rows correctly, without wiping them', async () => {
    const wrapper = mountDrawer({
      kind: 'receiving',
      targetCount: 0,
      modelValue: [],
      blockedSerials: ['PRIOR-TASK-SN-001'],
    })
    await flushPromises()
    expect(wrapper.text()).toContain('PRIOR-TASK-SN-001')

    await scan(wrapper, 'FAKE-NEW-RESET-RECEIVING-001')
    await flushPromises()
    expect(wrapper.text()).toContain('FAKE-NEW-RESET-RECEIVING-001')

    await clickResetCount(wrapper)
    await flushPromises()

    expect(wrapper.text()).not.toContain('FAKE-NEW-RESET-RECEIVING-001')
    expect(wrapper.text()).toContain('PRIOR-TASK-SN-001') // real baseline data survives reset
    wrapper.unmount()
  })

  // Regression: seedRows() had a kind-agnostic "modelValue.length > 0" branch that
  // padded the row list with the SKU's entire existing warehouse serial pool
  // (available + reserved units from unrelated already-in-stock units), marked
  // "not counted". Harmless for count/in-out (a real pool genuinely exists there),
  // but wrong for receiving — brand-new units have no existing pool. It only
  // surfaced once modelValue stopped being empty: reopening the drawer again after
  // an earlier scan+save within the same task (not just across a "continue draft").
  it('receiving mode: reopening with a non-empty modelValue shows ONLY what was scanned, never the SKU\'s unrelated existing warehouse stock', async () => {
    const reserved = reservedSerials()
    expect(reserved.length).toBeGreaterThan(0) // sanity: seed data must have real unrelated stock to assert against

    const wrapper = mountDrawer({
      kind: 'receiving',
      targetCount: 5,
      modelValue: [{ serial: 'MY-SCANNED-SN-001' }],
    })
    await flushPromises()

    expect(rowCount(wrapper)).toBe(1)
    expect(wrapper.text()).toContain('MY-SCANNED-SN-001')
    expect(wrapper.text()).not.toContain(reserved[0])
    wrapper.unmount()
  })
})

describe('ManageSerialDrawer — barcode scan threshold gates the bulk-paste textarea (receiving only)', () => {
  it('targetCount at the default threshold (50): the textarea is disabled and "Add to list" is blocked', async () => {
    const wrapper = mountDrawer({ kind: 'receiving', targetCount: 50, modelValue: [] })
    await flushPromises()

    const textarea = wrapper.find('textarea.msn-textarea')
    expect(textarea.exists()).toBe(true)
    expect(textarea.attributes('disabled')).toBeDefined()

    const before = rowCount(wrapper)
    // "Add to list" stays clickable (no disabled action buttons in this codebase) —
    // clicking it while blocked must be a no-op, not add anything.
    const addBtn = wrapper.findAll('button').find((b) => b.text() === 'Add to list')!
    expect(addBtn.attributes('disabled')).toBeUndefined()
    await addBtn.trigger('click')
    await flushPromises()

    expect(rowCount(wrapper)).toBe(before)
    wrapper.unmount()
  })

  it('targetCount above the threshold (51): the textarea stays enabled and "Add to list" works normally', async () => {
    const wrapper = mountDrawer({ kind: 'receiving', targetCount: 51, modelValue: [] })
    await flushPromises()

    const textarea = wrapper.find('textarea.msn-textarea')
    expect(textarea.exists()).toBe(true)
    expect(textarea.attributes('disabled')).toBeUndefined()

    await textarea.setValue('FAKE-NEW-TEXTAREA-001')
    const addBtn = wrapper.findAll('button').find((b) => b.text() === 'Add to list')!
    await addBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('FAKE-NEW-TEXTAREA-001')
    wrapper.unmount()
  })
})
