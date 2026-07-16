// @vitest-environment happy-dom
/**
 * A serial reserved by ANOTHER order (picking/transfer only) is not something
 * this task can ever act on, so it's hidden from the table entirely instead
 * of shown as a dead "Not available" row. It stays in rows.value itself
 * (never filtered there) — scanning it must still resolve to the real
 * "already reserved for another order" rejection, not a misleading "not
 * found" (which is what a naive full removal from the data would cause).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { toast } from '@mekari/pixel3'
import ManageSerialDrawer from '~/components/patterns/ManageSerialDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'
const SKU = '2004' // serial-tracked (Espresso Machine), has reserved units in seed data

function reservedSerials(): string[] {
  const item = getWarehouseDetail(WAREHOUSE_ID)?.stock.find((s) => s.sku === SKU)
  return item?.serials?.reserved.map((u) => u.serial) ?? []
}

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageSerialDrawer, {
    props: { open: true, sku: SKU, warehouseId: WAREHOUSE_ID, targetCount: 1, modelValue: [], ...props },
  })
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
}

describe('ManageSerialDrawer — picking mode hides serials reserved by other orders', () => {
  it('a foreign-reserved serial (not this task\'s own) never appears as a table row', async () => {
    const reserved = reservedSerials()
    expect(reserved.length).toBeGreaterThan(0) // sanity: seed data must have real foreign reservations

    // Nothing of this task's own is reserved/planned — every reserved unit found is foreign.
    const wrapper = mountDrawer({ kind: 'picking', targetCount: 1, modelValue: [] })
    await flushPromises()

    expect(wrapper.text()).not.toContain(reserved[0])
    wrapper.unmount()
  })

  it('scanning a foreign-reserved serial still rejects it with the real reason, not "not found"', async () => {
    const reserved = reservedSerials()
    const wrapper = mountDrawer({ kind: 'picking', targetCount: 1, modelValue: [] })
    await flushPromises()

    const notifySpy = vi.spyOn(toast, 'notify')
    await scan(wrapper, reserved[0]!)

    expect(notifySpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('already reserved for another order') }),
    )
    // Still never added as a visible/selectable row.
    expect(wrapper.text()).not.toContain(reserved[0])
    notifySpy.mockRestore()
    wrapper.unmount()
  })

  it('a unit reserved for THIS task\'s own order still shows normally (only foreign reservations are hidden)', async () => {
    const reserved = reservedSerials()
    const wrapper = mountDrawer({ kind: 'picking', targetCount: 1, modelValue: [{ serial: reserved[0] }] })
    await flushPromises()

    expect(wrapper.text()).toContain(reserved[0])
    wrapper.unmount()
  })

  it('when every unit for this SKU is reserved elsewhere, shows a dedicated empty state, not "try adjusting your search"', async () => {
    // A different SKU/warehouse with zero available units — every reserved
    // unit here is necessarily foreign, since this task reserves nothing.
    const NO_AVAILABLE_WAREHOUSE_ID = 'wh-001'
    const NO_AVAILABLE_SKU = '2103'
    const item = getWarehouseDetail(NO_AVAILABLE_WAREHOUSE_ID)?.stock.find((s) => s.sku === NO_AVAILABLE_SKU)
    expect(item?.serials?.available.length).toBe(0)
    expect(item?.serials?.reserved.length ?? 0).toBeGreaterThan(0)

    const wrapper = mountDrawer({
      sku: NO_AVAILABLE_SKU, warehouseId: NO_AVAILABLE_WAREHOUSE_ID, kind: 'picking', targetCount: 1, modelValue: [],
    })
    await flushPromises()

    expect(wrapper.text()).toContain('No serial numbers available')
    expect(wrapper.text()).toContain('Every serial number for this SKU is already reserved by other orders.')
    expect(wrapper.text()).not.toContain('Try adjusting your search')
    wrapper.unmount()
  })

  it('a real empty search result (some selectable rows exist, search matches none) still shows the search-specific message', async () => {
    const reserved = reservedSerials()
    // This task owns the reservation, so it's selectable — search for gibberish instead.
    const wrapper = mountDrawer({ kind: 'picking', targetCount: 1, modelValue: [{ serial: reserved[0] }] })
    await flushPromises()

    await wrapper.find('.msn-search-input').setValue('this-will-never-match-anything')
    await flushPromises()

    expect(wrapper.text()).toContain('No serial numbers found')
    expect(wrapper.text()).toContain('Try adjusting your search')
    wrapper.unmount()
  })
})
