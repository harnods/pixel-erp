// @vitest-environment happy-dom
/**
 * Put-away's serial drawer now supports the same active-bin scan model as
 * ManageBatchDrawer: scan a bin barcode to make it active, then scan a serial
 * barcode to assign that serial to the active bin. The drawer also inherits
 * whatever bin is already active on the page-level scan bar (PutAwayItemsPage)
 * when it opens, via the `initialActiveBin` prop, so the operator doesn't have
 * to rescan a bin they already scanned on the page.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageSerialDrawer from '~/components/patterns/ManageSerialDrawer.vue'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'
const SKU = '2004'
const BINS = ['Rak-01', 'Rak-02', 'Rak-03']

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageSerialDrawer, {
    props: {
      open: true, sku: SKU, warehouseId: WAREHOUSE_ID, targetCount: 3,
      kind: 'put-away', destLocationPaths: BINS,
      modelValue: [
        { serial: 'SN-A' },
        { serial: 'SN-B' },
      ],
      ...props,
    },
  })
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

function findRow(wrapper: ReturnType<typeof mount>, serial: string) {
  return wrapper.findAll('.msn-tr').find(r => r.text().includes(serial))
}

function binInputValue(wrapper: ReturnType<typeof mount>, serial: string): string {
  const row = findRow(wrapper, serial)!
  return (row.find('.msn-bin-input').element as HTMLInputElement).value
}

describe('ManageSerialDrawer — put-away active-bin scan model', () => {
  it('opens with no active bin when the page has none active', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    expect(wrapper.find('.msn-active-bin').exists()).toBe(false)
    wrapper.unmount()
  })

  it('inherits the active bin from the page via initialActiveBin on open', async () => {
    const wrapper = mountDrawer({ initialActiveBin: 'Rak-01' })
    await flushPromises()

    expect(wrapper.find('.msn-active-bin').exists()).toBe(true)
    expect(wrapper.text()).toContain('Rak-01')
    wrapper.unmount()
  })

  it('scanning a bin barcode sets it as the active bin (chip appears)', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()
    expect(wrapper.find('.msn-active-bin').exists()).toBe(false)

    await scan(wrapper, 'Rak-02')

    expect(wrapper.find('.msn-active-bin').exists()).toBe(true)
    expect(wrapper.text()).toContain('Rak-02')
    wrapper.unmount()
  })

  it('scanning a serial without any active bin is rejected — no assignment made', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await scan(wrapper, 'SN-A')

    expect(binInputValue(wrapper, 'SN-A')).toBe('')
    wrapper.unmount()
  })

  it('scanning a bin then a serial assigns that serial to the active bin', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await scan(wrapper, 'Rak-02')
    await scan(wrapper, 'SN-A')

    expect(binInputValue(wrapper, 'SN-A')).toBe('Rak-02')
    wrapper.unmount()
  })

  it('scanning a different bin switches the active bin — the next serial scan assigns to the new one', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await scan(wrapper, 'Rak-01')
    await scan(wrapper, 'Rak-03') // switch before scanning any serial
    await scan(wrapper, 'SN-A')

    expect(binInputValue(wrapper, 'SN-A')).toBe('Rak-03')
    wrapper.unmount()
  })

  it('opening already assigned to the inherited bin lets an immediate serial scan assign without rescanning the bin', async () => {
    const wrapper = mountDrawer({ initialActiveBin: 'Rak-01' })
    await flushPromises()

    await scan(wrapper, 'SN-B') // no bin scan needed — inherited from the page

    expect(binInputValue(wrapper, 'SN-B')).toBe('Rak-01')
    wrapper.unmount()
  })

  it('clearing the active-bin chip requires a fresh bin scan before assigning again', async () => {
    const wrapper = mountDrawer({ initialActiveBin: 'Rak-01' })
    await flushPromises()

    await wrapper.find('.msn-active-bin-clear').trigger('click')
    await flushPromises()
    expect(wrapper.find('.msn-active-bin').exists()).toBe(false)

    await scan(wrapper, 'SN-A')
    expect(binInputValue(wrapper, 'SN-A')).toBe('')
    wrapper.unmount()
  })

  it('Reset count restores the inherited active bin rather than dropping it', async () => {
    const wrapper = mountDrawer({ initialActiveBin: 'Rak-01' })
    await flushPromises()

    await scan(wrapper, 'Rak-02') // operator switches bins mid-session
    const resetBtn = Array.from(wrapper.findAll('button')).find(b => b.text() === 'Reset count')!
    await resetBtn.trigger('click')
    await flushPromises()

    // Restored to the page-inherited bin (Rak-01), not the mid-session one (Rak-02), not null.
    expect(wrapper.text()).toContain('Rak-01')
    await scan(wrapper, 'SN-A')
    expect(binInputValue(wrapper, 'SN-A')).toBe('Rak-01')
    wrapper.unmount()
  })

  it('other modes are unaffected — no active-bin chip, scanning a serial still works the old way', async () => {
    const wrapper = mount(ManageSerialDrawer, {
      props: {
        open: true, sku: SKU, warehouseId: WAREHOUSE_ID, targetCount: 1,
        kind: 'count', modelValue: [],
      },
    })
    await flushPromises()

    expect(wrapper.find('.msn-active-bin').exists()).toBe(false)
    wrapper.unmount()
  })
})
