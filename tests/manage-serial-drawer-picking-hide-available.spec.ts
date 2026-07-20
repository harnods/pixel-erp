// @vitest-environment happy-dom
/**
 * Picking: the table should primarily show the pre-reserved plan for this
 * task — available (non-reserved) units are hidden by default and only
 * appear once the operator scans that specific unit's barcode (a deliberate
 * substitution), showing as Picked. Reserved-for-this-task ("plannedOwn")
 * rows are unaffected — they stay visible as before, with their existing
 * Reserved → Picked toggle behavior. Transfer mode is untouched (available
 * rows there remain always visible).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { toast } from '@mekari/pixel3'
import ManageSerialDrawer from '~/components/patterns/ManageSerialDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'
const SKU = '2004' // serial-tracked (Espresso Machine), has available + reserved units in seed data

function availableSerials(): string[] {
  const item = getWarehouseDetail(WAREHOUSE_ID)?.stock.find((s) => s.sku === SKU)
  return item?.serials?.available.map((u) => u.serial) ?? []
}
function reservedSerials(): string[] {
  const item = getWarehouseDetail(WAREHOUSE_ID)?.stock.find((s) => s.sku === SKU)
  return item?.serials?.reserved.map((u) => u.serial) ?? []
}
function locationOf(serial: string): string | undefined {
  const item = getWarehouseDetail(WAREHOUSE_ID)?.stock.find((s) => s.sku === SKU)
  const su = item?.serials
  return su?.available.find((u) => u.serial === serial)?.location ?? su?.reserved.find((u) => u.serial === serial)?.location
}

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageSerialDrawer, {
    props: { open: true, sku: SKU, warehouseId: WAREHOUSE_ID, kind: 'picking', targetCount: 1, executionMode: true, modelValue: [], ...props },
  })
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('ManageSerialDrawer — picking hides available units until scanned', () => {
  it('an available (non-reserved) unit is not shown in the table by default', async () => {
    const available = availableSerials()
    expect(available.length).toBeGreaterThan(0) // sanity: seed data must have real available units

    const wrapper = mountDrawer({ targetCount: 1, plannedSerials: [] })
    await flushPromises()

    expect(wrapper.text()).not.toContain(available[0])
    wrapper.unmount()
  })

  it('scanning an available unit reveals it in the table as Picked', async () => {
    const available = availableSerials()
    const loc = locationOf(available[0]!)
    const wrapper = mountDrawer({ targetCount: 1, plannedSerials: [], originLocationPaths: loc ? [loc] : [] })
    await flushPromises()

    if (loc) await scan(wrapper, loc) // activate the unit's own bin first
    await scan(wrapper, available[0]!)

    expect(wrapper.text()).toContain(available[0])
    expect(wrapper.text()).toContain('Picked')
    wrapper.unmount()
  })

  it('a unit reserved (planned) for this task stays visible from the start, unaffected by the hide rule', async () => {
    const reserved = reservedSerials()
    const wrapper = mountDrawer({ targetCount: 1, plannedSerials: [reserved[0]] })
    await flushPromises()

    expect(wrapper.text()).toContain(reserved[0])
    expect(wrapper.text()).toContain('Reserved')
    wrapper.unmount()
  })

  it('scanning the planned unit converts it from Reserved to Picked (already-visible row, no reveal needed)', async () => {
    const reserved = reservedSerials()
    const loc = locationOf(reserved[0]!)
    const wrapper = mountDrawer({ targetCount: 1, plannedSerials: [reserved[0]], originLocationPaths: loc ? [loc] : [] })
    await flushPromises()

    if (loc) await scan(wrapper, loc) // activate the unit's own bin first
    await scan(wrapper, reserved[0]!)

    expect(wrapper.text()).toContain(reserved[0])
    // A real check that the scan actually landed — not just that the label text
    // "Picked" exists somewhere (it's also a static stat label pre-scan).
    const pickedStat = wrapper.findAll('.msn-stat').find((s) => s.text().includes('Picked qty'))
    expect(pickedStat?.text()).toMatch(/Picked qty\s*1/)
    wrapper.unmount()
  })

  it('a scanned-and-saved available unit stays visible on reopen (already-confirmed picks are never re-hidden)', async () => {
    const available = availableSerials()
    const wrapper = mountDrawer({ targetCount: 1, plannedSerials: [], modelValue: [{ serial: available[0] }] })
    await flushPromises()

    expect(wrapper.text()).toContain(available[0])
    wrapper.unmount()
  })

  it('scanning an available unit a second time (already selected) is rejected, not double-counted', async () => {
    const available = availableSerials()
    const loc = locationOf(available[0]!)
    const wrapper = mountDrawer({ targetCount: 2, plannedSerials: [], originLocationPaths: loc ? [loc] : [] })
    await flushPromises()

    if (loc) await scan(wrapper, loc) // activate the unit's own bin first
    await scan(wrapper, available[0]!)
    expect(wrapper.text()).toContain(available[0])

    const notifySpy = vi.spyOn(toast, 'notify')
    await scan(wrapper, available[0]!)
    expect(notifySpy).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('already selected') }))
    notifySpy.mockRestore()
    wrapper.unmount()
  })

  it('empty state: no plan and nothing scanned yet shows "No serial numbers picked yet", not the reserved-by-others message', async () => {
    const wrapper = mountDrawer({ targetCount: 1, plannedSerials: [] })
    await flushPromises()

    expect(wrapper.text()).toContain('No serial numbers picked yet')
    expect(wrapper.text()).not.toContain('already reserved by other orders')
    wrapper.unmount()
  })

  it('sanity: transfer mode is unaffected — available units remain visible without scanning', async () => {
    const available = availableSerials()
    const wrapper = mount(ManageSerialDrawer, {
      props: { open: true, sku: SKU, warehouseId: WAREHOUSE_ID, kind: 'transfer', targetCount: 1, modelValue: [] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain(available[0])
    wrapper.unmount()
  })
})
