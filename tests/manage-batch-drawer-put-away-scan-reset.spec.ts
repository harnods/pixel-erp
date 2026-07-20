// @vitest-environment happy-dom
/**
 * Put-away's batch table splits qty across per-bin destLocRows rather than a
 * single counted number, so scanning needs an "active bin" two-step model
 * (same as the page-level scan bar in PutAwayItemsPage): scan a bin barcode to
 * make it active, then scan a batch barcode to assign 1 unit of that batch to
 * the active bin. Reset count must actually clear every row's bin
 * assignments — previously it just re-seeded from props (the already-saved
 * state), making it a no-op whenever assignments were already saved, the same
 * bug fixed in ManageSerialDrawer.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'
const SKU = 'BATCH-PUTAWAY-TEST-SKU'
const BINS = ['Rak-01', 'Rak-02', 'Rak-03']

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageBatchDrawer, {
    props: {
      open: true, sku: SKU, warehouseId: WAREHOUSE_ID,
      kind: 'put-away', destLocationPaths: BINS,
      modelValue: [
        { key: 'B-001', batchNo: 'B-001', expiryDate: '2026-01-01', desc: '', onHand: 10, counted: null, unit: 'kg', destLocations: [{ locationId: 'Rak-01', qty: 4 }] },
        { key: 'B-002', batchNo: 'B-002', expiryDate: '2026-02-01', desc: '', onHand: 2, counted: null, unit: 'kg' },
      ],
      ...props,
    },
  })
}

function resetButton(wrapper: ReturnType<typeof mount>) {
  return Array.from(wrapper.findAll('button')).find(b => b.text() === 'Reset count')!
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

function putAwayQtyStat(wrapper: ReturnType<typeof mount>): string {
  const stat = wrapper.findAll('.mbd-stat').find(s => s.text().includes('Put away qty'))!
  return stat.find('.mbd-stat-value').text()
}

function destLocRowsInDom(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('tbody tr.mbd-tr').map(tr => {
    const locInput = tr.find('.mbd-pa-loc-input')
    const qtyInput = tr.find('.mbd-qty-input')
    return {
      loc: locInput.exists() ? (locInput.element as HTMLInputElement).value : '',
      qty: qtyInput.exists() ? (qtyInput.element as HTMLInputElement).value : '',
    }
  })
}

describe('ManageBatchDrawer — put-away scan (active bin) and Reset count', () => {
  it('reopening the drawer shows the already-saved bin assignment (seeding path untouched)', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    expect(destLocRowsInDom(wrapper)).toContainEqual({ loc: 'Rak-01', qty: '4' })
    expect(putAwayQtyStat(wrapper)).toContain('4')
    wrapper.unmount()
  })

  it('scanning a batch before any bin is scanned is rejected, with no assignment made', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await scan(wrapper, 'B-002')

    expect(destLocRowsInDom(wrapper)).not.toContainEqual(expect.objectContaining({ qty: '1' }))
    wrapper.unmount()
  })

  it('scanning a bin then a batch assigns 1 unit of that batch to the active bin', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await scan(wrapper, 'Rak-02')
    expect(wrapper.text()).toContain('Rak-02') // active-bin chip shown

    await scan(wrapper, 'B-002')

    expect(destLocRowsInDom(wrapper)).toContainEqual({ loc: 'Rak-02', qty: '1' })
    wrapper.unmount()
  })

  it('scanning the same batch again while the bin is still active increments that bin\'s qty', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await scan(wrapper, 'Rak-02')
    await scan(wrapper, 'B-002')
    await scan(wrapper, 'B-002')

    expect(destLocRowsInDom(wrapper)).toContainEqual({ loc: 'Rak-02', qty: '2' })
    wrapper.unmount()
  })

  it('scanning past the batch\'s onHand qty is rejected, not over-assigned', async () => {
    // B-002 onHand is 2 — already fully assigned after 2 scans in the previous flow.
    const wrapper = mountDrawer({})
    await flushPromises()

    await scan(wrapper, 'Rak-02')
    await scan(wrapper, 'B-002')
    await scan(wrapper, 'B-002')
    await scan(wrapper, 'B-002') // 3rd scan — past onHand (2)

    expect(destLocRowsInDom(wrapper)).toContainEqual({ loc: 'Rak-02', qty: '2' })
    expect(destLocRowsInDom(wrapper)).not.toContainEqual({ loc: 'Rak-02', qty: '3' })
    wrapper.unmount()
  })

  it('scanning a different bin switches the active bin — the next batch scan assigns to the new one', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await scan(wrapper, 'Rak-02')
    await scan(wrapper, 'Rak-03') // switch active bin before ever scanning a batch
    await scan(wrapper, 'B-002')

    expect(destLocRowsInDom(wrapper)).toContainEqual({ loc: 'Rak-03', qty: '1' })
    expect(destLocRowsInDom(wrapper)).not.toContainEqual(expect.objectContaining({ loc: 'Rak-02', qty: '1' }))
    wrapper.unmount()
  })

  it('Reset count clears every row\'s bin assignment, even ones already saved via props', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()
    expect(putAwayQtyStat(wrapper)).toContain('4') // B-001's saved Rak-01/4 assignment

    await resetButton(wrapper).trigger('click')
    await flushPromises()

    expect(putAwayQtyStat(wrapper)).toContain('0')
    expect(destLocRowsInDom(wrapper)).not.toContainEqual(expect.objectContaining({ loc: 'Rak-01' }))
    wrapper.unmount()
  })

  it('the batch list itself survives Reset count — only the bin assignment is cleared', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await resetButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('B-001')
    expect(wrapper.text()).toContain('B-002')
    wrapper.unmount()
  })

  it('Reset count clears the active bin when none was inherited from the page', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await scan(wrapper, 'Rak-02')
    expect(wrapper.text()).toContain('Rak-02')

    await resetButton(wrapper).trigger('click')
    await flushPromises()

    await scan(wrapper, 'B-002') // no bin active anymore — should be rejected
    expect(destLocRowsInDom(wrapper)).not.toContainEqual(expect.objectContaining({ qty: '1' }))
    wrapper.unmount()
  })

  it('inherits the active bin from the page via initialActiveBin on open', async () => {
    const wrapper = mountDrawer({ initialActiveBin: 'Rak-01' })
    await flushPromises()

    expect(wrapper.find('.mbd-active-bin').exists()).toBe(true)
    expect(wrapper.text()).toContain('Rak-01')

    await scan(wrapper, 'B-002') // no bin scan needed — inherited from the page
    expect(destLocRowsInDom(wrapper)).toContainEqual({ loc: 'Rak-01', qty: '1' })
    wrapper.unmount()
  })

  it('opens with no active-bin chip when the page has none active', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    expect(wrapper.find('.mbd-active-bin').exists()).toBe(false)
    wrapper.unmount()
  })

  it('Reset count restores the inherited active bin rather than dropping it', async () => {
    const wrapper = mountDrawer({ initialActiveBin: 'Rak-01' })
    await flushPromises()

    await scan(wrapper, 'Rak-02') // operator switches bins mid-session
    await resetButton(wrapper).trigger('click')
    await flushPromises()

    // Restored to the page-inherited bin (Rak-01), not the mid-session one (Rak-02), not null.
    expect(wrapper.text()).toContain('Rak-01')
    await scan(wrapper, 'B-002')
    expect(destLocRowsInDom(wrapper)).toContainEqual({ loc: 'Rak-01', qty: '1' })
    wrapper.unmount()
  })
})
