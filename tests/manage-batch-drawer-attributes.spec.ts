// @vitest-environment happy-dom
/**
 * Batch attributes in every kind of the shared Manage batch drawer (ATINV-9082, spec
 * §5.1 / §5.3). Receiving kinds (in-out, receiving) take inputs for a new batch and for
 * an existing batch's EMPTY attributes, and block Save on an empty required one; issuing
 * kinds (transfer, put-away, picking) show the values read-only and never block.
 *
 * Fixture: SKU 1001 (Vendor required, Grade, Expiry) in wh-001, whose lots are
 * Batch #00001 (Vendor empty — the demo's "still empty" lot) and Batch #00002 (V002, B).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { MpAutocomplete } from '@mekari/pixel3'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { vendors } from '~/data/vendors'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-001'
const SKU = '1001'

function lot(batchNo: string) {
  const b = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === SKU)!.batches!.find((x) => x.batchNo === batchNo)!
  return {
    key: b.batchNo, batchNo: b.batchNo, expiryDate: b.expiryDate,
    desc: '', onHand: b.onHand, counted: 1, unit: 'Kg', location: b.location,
  }
}

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageBatchDrawer, {
    props: { open: true, sku: SKU, warehouseId: WAREHOUSE_ID, modelValue: [], targetCount: 100, ...props },
    attachTo: document.body,
  })
}

const headers = (w: ReturnType<typeof mount>) => w.findAll('thead th').map((th) => th.text())

async function openSelectBatch() {
  ;(document.body.querySelector('.mbd-batch-trigger') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}

async function clickSave(w: ReturnType<typeof mount>) {
  await w.findAll('button').find((b) => b.text() === 'Save')!.trigger('click')
  await new Promise((r) => setTimeout(r, 650)) // handleSave's 600ms "Saving…" delay
  await flushPromises()
}

describe('ManageBatchDrawer — batch attributes', () => {
  // Portaled popover content outlives an unmount.
  afterEach(() => { document.body.innerHTML = '' })

  it('shows Vendor and Grade columns for kind in-out', async () => {
    const w = mountDrawer({ kind: 'in-out', modelValue: [lot('Batch #00002')] })
    await flushPromises()
    expect(headers(w)).toEqual(expect.arrayContaining(['Vendor', 'Grade']))
    expect(w.find('[data-devchange="batch-drawer-attributes"]').exists()).toBe(true)
    const v002 = vendors.find((v) => v.id === 'V002')!.name
    expect(w.find('tbody').text()).toContain(v002)
    expect(w.find('tbody').text()).toContain('· Rank')
    w.unmount()
  })

  it('shows read-only attribute text for kind transfer', async () => {
    // Batch #00001 has an empty Vendor — still text ("—"), never an input, when issuing.
    const w = mountDrawer({ kind: 'transfer', modelValue: [lot('Batch #00001'), lot('Batch #00002')] })
    await flushPromises()
    expect(headers(w)).toEqual(expect.arrayContaining(['Vendor', 'Grade']))
    expect(w.findAll('td.mbd-td--attr').length).toBe(0)
    expect(w.findAllComponents(MpAutocomplete).length).toBe(0)
    expect(w.findAll('td.mbd-td--attr-text').length).toBe(4)
    w.unmount()
  })

  it('shows read-only attribute columns in the put-away table', async () => {
    const w = mountDrawer({ kind: 'put-away', modelValue: [lot('Batch #00002')], destLocationPaths: ['Bin 01'] })
    await flushPromises()
    expect(headers(w)).toEqual(expect.arrayContaining(['Vendor', 'Grade']))
    expect(w.findAllComponents(MpAutocomplete).length).toBe(0)
    w.unmount()
  })

  it('offers an input only for an existing batch\'s empty attribute in receiving mode', async () => {
    const w = mountDrawer({ kind: 'receiving', modelValue: [lot('Batch #00001'), lot('Batch #00002')] })
    await flushPromises()
    // #00001: Vendor empty → input; Grade A → text. #00002: both set → text.
    expect(w.findAll('td.mbd-td--attr').length).toBe(1)
    expect(w.findAllComponents(MpAutocomplete).length).toBe(1)
    w.unmount()
  })

  it('blocks save in receiving mode when a new row has no required Vendor', async () => {
    const w = mountDrawer({ kind: 'in-out' })
    await flushPromises()
    await openSelectBatch()
    const add = [...document.body.querySelectorAll('.mbd-popover-add-row')].pop() as HTMLElement
    add.click()
    await flushPromises()
    await w.find('tbody input.mbd-cell-input').setValue('NEWBATCH-ATTR-1')
    await w.find('td.mbd-td--counted input.mbd-qty-input').setValue('3')
    await clickSave(w)
    expect(w.text()).toContain('must be filled')
    expect(w.text()).toContain('Vendor')
    expect(w.emitted('save')).toBeUndefined()
    w.unmount()
  })

  it('blocks save in receiving mode on an existing batch with an empty required Vendor', async () => {
    const w = mountDrawer({ kind: 'receiving', modelValue: [lot('Batch #00001')] })
    await flushPromises()
    await clickSave(w)
    expect(w.find('.mbd-delivery-error').text()).toContain('must be filled')
    expect(w.emitted('save')).toBeUndefined()
    w.unmount()
  })

  it('lets an issuing drawer save a batch with an empty required attribute', async () => {
    const w = mountDrawer({ kind: 'transfer', modelValue: [lot('Batch #00001')] })
    await flushPromises()
    await clickSave(w)
    const saved = w.emitted('save')![0]![0] as Array<{ batchNo: string; batchId?: string; attributes?: Record<string, string> }>
    expect(saved[0]!.batchNo).toBe('Batch #00001')
    expect(saved[0]!.batchId).toBeTruthy()
    expect(saved[0]!.attributes).toMatchObject({ grade: 'grade-a', expiry_date: '2026-09-26' })
    expect(saved[0]!.attributes!.supplier).toBeUndefined()
    w.unmount()
  })

  it('shows attribute values under each option in the batch dropdown', async () => {
    const w = mountDrawer({ kind: 'transfer' })
    await flushPromises()
    await openSelectBatch()
    const subs = [...document.body.querySelectorAll('.mbd-option-attrs')].map((e) => e.textContent ?? '')
    const v002 = vendors.find((v) => v.id === 'V002')!.name
    expect(subs.some((s) => s.includes(v002) && s.includes('·'))).toBe(true)
    // #00001 has no Vendor — the line still renders, with "—" in its place.
    expect(subs.some((s) => s.startsWith('—'))).toBe(true)
    w.unmount()
  })

  it('shows no attribute columns or option lines for an expiry-only product', async () => {
    const w = mount(ManageBatchDrawer, {
      props: { open: true, sku: '1003', warehouseId: WAREHOUSE_ID, modelValue: [], kind: 'transfer' },
      attachTo: document.body,
    })
    await flushPromises()
    expect(headers(w)).not.toContain('Vendor')
    await openSelectBatch()
    expect(document.body.querySelectorAll('.mbd-option-attrs').length).toBe(0)
    w.unmount()
  })
})
