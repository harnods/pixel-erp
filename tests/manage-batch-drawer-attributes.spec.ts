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
import { MpAutocomplete, MpDatePicker } from '@mekari/pixel3'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { ensureProductBatch } from '~/data/productDetails'
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
    // Read-only cells read like Stock by batches (ruling R6).
    expect(w.find('tbody').text()).toContain('B (Rank')
    expect(w.find('tbody').text()).not.toContain('· Rank')
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

  it('a typed number matching an existing batch keeps its set values read-only', async () => {
    const w = mountDrawer({ kind: 'in-out' })
    await flushPromises()
    await openSelectBatch()
    ;([...document.body.querySelectorAll('.mbd-popover-add-row')].pop() as HTMLElement).click()
    await flushPromises()
    // The operator picks an expiry first, then types a number that already exists.
    w.findComponent(MpDatePicker).vm.$emit('update:modelValue', '01/01/2030')
    await flushPromises()
    await w.find('tbody input.mbd-cell-input').setValue('Batch #00002') // seeded record: V002, grade B, exp 26/02/2027
    await w.find('td.mbd-td--counted input.mbd-qty-input').setValue('2')
    await flushPromises()
    expect(w.findAllComponents(MpAutocomplete).length).toBe(0)
    const v002 = vendors.find((v) => v.id === 'V002')!.name
    expect(w.find('tbody').text()).toContain(v002)
    // Expiry is read-only too and shows the batch's own value, not the typed one.
    expect(w.findAllComponents(MpDatePicker).length).toBe(0)
    expect(w.find('tbody').text()).toContain('26/02/2027')
    expect(w.find('tbody').text()).not.toContain('01/01/2030')
    await clickSave(w)
    const saved = w.emitted('save')![0]![0] as Array<{ expiryDate: string; attributes?: Record<string, string> }>
    expect(saved[0]!.attributes).toMatchObject({ supplier: 'V002', grade: 'grade-b', expiry_date: '2027-02-26' })
    expect(saved[0]!.expiryDate).toBe('2027-02-26')
    w.unmount()
  })

  it('a typed number matching a batch with no expiry keeps Expiry fillable', async () => {
    ensureProductBatch(SKU, 'NOEXP-ATTR-1') // a record with no expiry yet
    const w = mountDrawer({ kind: 'in-out' })
    await flushPromises()
    await openSelectBatch()
    ;([...document.body.querySelectorAll('.mbd-popover-add-row')].pop() as HTMLElement).click()
    await flushPromises()
    await w.find('tbody input.mbd-cell-input').setValue('NOEXP-ATTR-1')
    await flushPromises()
    expect(w.findAllComponents(MpDatePicker).length).toBe(1)
    w.unmount()
  })

  it('scanning a number recorded only in another warehouse in a transfer adds a new row, not a 0-stock existing one', async () => {
    // Batch #00051 has a product record (V003) but no lot in wh-001 (and no other SKU's lot there).
    const w = mountDrawer({ kind: 'transfer' })
    await flushPromises()
    const input = document.body.querySelector('.scan-bar-input') as HTMLInputElement
    input.value = 'Batch #00051'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    // Not the existing record: its vendor and expiry do not ride along.
    expect(w.find('tbody').text()).not.toContain(vendors.find((v) => v.id === 'V003')!.name)
    await clickSave(w)
    const saved = w.emitted('save')?.[0]?.[0] as Array<{ batchNo: string; batchId?: string; expiryDate: string; attributes?: Record<string, string> }> | undefined
    const row = saved?.find((r) => r.batchNo === 'Batch #00051')
    expect(row).toBeTruthy()
    expect(row!.batchId).toBeUndefined()
    expect(row!.expiryDate).toBe('')
    expect(row!.attributes?.supplier).toBeUndefined()
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

  it('shows attributes for both the suggested and the scanned batch when they differ', async () => {
    // Suggested A (Batch #00002, V002) was not picked; the operator scanned B (Batch #00085, V003).
    const row = (batchNo: string, expiryDate: string, counted: number | null) => ({
      key: batchNo, batchNo, expiryDate, desc: '', onHand: 5, counted, unit: 'Kg', location: 'Bin 01',
    })
    const w = mountDrawer({
      kind: 'picking', executionMode: true, targetCount: 1,
      plannedBatches: [{ batchNo: 'Batch #00002', qty: 1 }],
      modelValue: [row('Batch #00085', '2026-11-26', 1)],
    })
    await flushPromises()
    const text = w.find('tbody').text()
    expect(text).toContain(vendors.find((v) => v.id === 'V002')!.name) // suggested
    expect(text).toContain(vendors.find((v) => v.id === 'V003')!.name) // scanned
    // The suggested row is read-only and never counted as picked.
    const suggested = w.findAll('tbody tr').find((r) => r.text().includes('Batch #00002'))!
    expect(suggested.find('td.mbd-td--planned').text()).toBe('1')
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
