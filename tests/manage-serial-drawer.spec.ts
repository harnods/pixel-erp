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
