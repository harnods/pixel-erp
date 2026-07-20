// @vitest-environment happy-dom
/**
 * Refinement: a put-away task can bundle 2+ receiving tasks. When the SAME SKU
 * appears across 2+ of them, put-away no longer tracks which specific
 * receiving task a unit came from — it's ONE merged row everywhere (New
 * put-away, Put-away details, Put-away start), with qty summed and every
 * contributing receiving task listed together for traceability only. Batch/
 * serial data merges the same way — one "Manage batch"/"Manage serial number"
 * button per SKU, showing everything combined, since the operator no longer
 * needs to care which task a specific batch/serial came from once it's all
 * going into the same bin(s).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PutAwayDetailsPage from '~/components/pages/PutAwayDetailsPage.vue'
import PutAwayItemsPage from '~/components/pages/PutAwayItemsPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { CATALOG } from '~/data/catalog'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'
import { addPutAwayTask, savePutAwayDraft, endPutAway, getPutAwayTask } from '~/data/putAwayTasks'
import { getPutAwayLineItems } from '~/data/putAwayTaskDetails'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('computed', computed) // ErpStatusBadge relies on the Nuxt auto-import
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const CATEGORY_BY_SKU = new Map(CATALOG.map(p => [p.sku, p.category]))

function freshFullCatalogReceipt(tag: string) {
  return addReceipt({
    purchaseNo: `PO-TEST-PA-MERGE-${tag}`,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: CATALOG.length, purchaseQty: 300, receivedQty: 0,
    status: 'on the way',
    estimatedArrival: '2026-08-01',
    trackingNos: [],
  })
}

/** Bundles 2 fresh receiving tasks (from 2 different receipts) that both cover
 *  `sku`, into ONE put-away task — the exact scenario the bug report describes. */
function bundleTwoReceivingTasksSharingSku(sku: string, qtyA: number, qtyB: number, detail?: { batchLines?: unknown; serialNumbers?: unknown }) {
  const receiptA = freshFullCatalogReceipt(`${sku}-A`)
  const receiptB = freshFullCatalogReceipt(`${sku}-B`)
  const rtA = createReceivingTask({ receiptId: receiptA.id, assignee: 'Operator A', skus: [sku] })!
  const rtB = createReceivingTask({ receiptId: receiptB.id, assignee: 'Operator B', skus: [sku] })!
  startReceiving(rtA.id)
  startReceiving(rtB.id)
  endReceiving(rtA.id, { [sku]: qtyA }, detail ? { [sku]: detail as never } : undefined)
  endReceiving(rtB.id, { [sku]: qtyB }, detail ? { [sku]: detail as never } : undefined)
  const pa = addPutAwayTask({
    receivingTaskIds: [rtA.id, rtB.id], receivingTaskNos: [rtA.taskNo, rtB.taskNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  return { pa, rtA, rtB }
}

describe('Put-away — same SKU bundled from 2+ receiving tasks is ONE merged row everywhere', () => {
  it('data layer: getPutAwayLineItems returns ONE row per SKU, qty summed', () => {
    const receiptA = freshFullCatalogReceipt('data-A')
    const sku = lineItemsForReceipt(receiptA)[0]!.sku
    const { pa } = bundleTwoReceivingTasksSharingSku(sku, 12, 7)

    const lineItems = getPutAwayLineItems(pa.id)
    const rowsForSku = lineItems.filter(it => it.skuCode === sku)
    expect(rowsForSku).toHaveLength(1)
    expect(rowsForSku[0]!.qty).toBe(19) // 12 + 7
  })

  it('execution page (PutAwayItemsPage.vue): shows ONE row for the shared SKU, qty summed — no "Receiving task" column at all', async () => {
    const receiptA = freshFullCatalogReceipt('exec-col-A')
    const sku = lineItemsForReceipt(receiptA)[0]!.sku
    const { pa } = bundleTwoReceivingTasksSharingSku(sku, 13, 8)

    const wrapper = mount(PutAwayItemsPage, { props: { orderId: pa.id } })
    await flushPromises()

    const headers = wrapper.findAll('th.pi-th').map(h => h.text())
    expect(headers).not.toContain('Receiving task')

    // SKU cell renders exactly once — no split rows for this SKU at all.
    const skuCells = wrapper.findAll('td.pi-td--merged').filter(td => td.text() === sku)
    expect(skuCells).toHaveLength(1)
    const bodyText = wrapper.find('tbody').text()
    expect(bodyText).toContain('21') // 13 + 8, the merged Received qty
    wrapper.unmount()
  })

  it('details page: renders ONE row (Received qty merged, qty summed), Product/SKU/Unit merged, no "Receiving task" column, no duplicate Vue keys', async () => {
    const receiptA = freshFullCatalogReceipt('details-A')
    const sku = lineItemsForReceipt(receiptA)[0]!.sku
    const { pa } = bundleTwoReceivingTasksSharingSku(sku, 15, 9)

    const wrapper = mount(PutAwayDetailsPage, { props: { orderId: pa.id } })
    await flushPromises()

    const headers = wrapper.findAll('th.detail-th').map(h => h.text())
    expect(headers).not.toContain('Receiving task')

    const skuCells = wrapper.findAll('td.detail-td').filter(td => td.text() === sku)
    expect(skuCells).toHaveLength(1)

    const bodyText = wrapper.find('tbody').text()
    expect(bodyText).toContain('24') // 15 + 9, the merged Received qty
    wrapper.unmount()
  })

  it('batch-tracked SKU shared across 2 receiving tasks: ONE merged "Manage batch" button opens a drawer showing BOTH sources\' batches combined', async () => {
    const receiptA = freshFullCatalogReceipt('batch-A')
    const lines = lineItemsForReceipt(receiptA)
    const batchSku = lines.find(l => CATEGORY_BY_SKU.get(l.sku) === 'Green Beans' || CATEGORY_BY_SKU.get(l.sku) === 'Roasted Beans')?.sku
    expect(batchSku).toBeTruthy()

    const receiptB = freshFullCatalogReceipt('batch-B')
    const rtA = createReceivingTask({ receiptId: receiptA.id, assignee: 'Operator A', skus: [batchSku!] })!
    const rtB = createReceivingTask({ receiptId: receiptB.id, assignee: 'Operator B', skus: [batchSku!] })!
    startReceiving(rtA.id); startReceiving(rtB.id)
    endReceiving(rtA.id, { [batchSku!]: 10 }, { [batchSku!]: { batchLines: [{ batchNo: 'BATCH-FROM-A', expiryDate: '2027-01-01', desc: 'From task A', qty: 10, unit: 'Sack' }] } })
    endReceiving(rtB.id, { [batchSku!]: 6 }, { [batchSku!]: { batchLines: [{ batchNo: 'BATCH-FROM-B', expiryDate: '2027-02-01', desc: 'From task B', qty: 6, unit: 'Sack' }] } })
    const pa = addPutAwayTask({
      receivingTaskIds: [rtA.id, rtB.id], receivingTaskNos: [rtA.taskNo, rtB.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    const lineItems = getPutAwayLineItems(pa.id)
    const row = lineItems.find(it => it.skuCode === batchSku)!
    expect(row.batchLines?.map(b => b.batchNo).sort()).toEqual(['BATCH-FROM-A', 'BATCH-FROM-B'])

    // ONE "Manage batch" button for the whole SKU — opening it shows BOTH
    // sources' batches combined, no per-source distinction needed.
    const wrapper = mount(PutAwayItemsPage, { props: { orderId: pa.id } })
    await flushPromises()
    const buttons = wrapper.findAll('button[aria-label="Manage batch"]')
    expect(buttons).toHaveLength(1)
    await buttons[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('BATCH-FROM-A')
    expect(wrapper.text()).toContain('BATCH-FROM-B')
    wrapper.unmount()
  })

  it('the SAME batch number reported by 2 bundled receiving tasks is ONE row with qty summed, not duplicated', async () => {
    const receiptA = freshFullCatalogReceipt('same-batch-A')
    const lines = lineItemsForReceipt(receiptA)
    const batchSku = lines.find(l => CATEGORY_BY_SKU.get(l.sku) === 'Green Beans' || CATEGORY_BY_SKU.get(l.sku) === 'Roasted Beans')?.sku
    expect(batchSku).toBeTruthy()

    const receiptB = freshFullCatalogReceipt('same-batch-B')
    const rtA = createReceivingTask({ receiptId: receiptA.id, assignee: 'Operator A', skus: [batchSku!] })!
    const rtB = createReceivingTask({ receiptId: receiptB.id, assignee: 'Operator B', skus: [batchSku!] })!
    startReceiving(rtA.id); startReceiving(rtB.id)
    endReceiving(rtA.id, { [batchSku!]: 10 }, { [batchSku!]: { batchLines: [{ batchNo: 'BATCH-00001', expiryDate: '2027-01-01', desc: 'Same physical batch', qty: 10, unit: 'Sack' }] } })
    endReceiving(rtB.id, { [batchSku!]: 6 }, { [batchSku!]: { batchLines: [{ batchNo: 'BATCH-00001', expiryDate: '2027-01-01', desc: 'Same physical batch', qty: 6, unit: 'Sack' }] } })
    const pa = addPutAwayTask({
      receivingTaskIds: [rtA.id, rtB.id], receivingTaskNos: [rtA.taskNo, rtB.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    const lineItems = getPutAwayLineItems(pa.id)
    const row = lineItems.find(it => it.skuCode === batchSku)!
    expect(row.batchLines).toHaveLength(1) // not 2 duplicate rows
    expect(row.batchLines![0]!.batchNo).toBe('BATCH-00001')
    expect(row.batchLines![0]!.qty).toBe(16) // 10 + 6, summed

    const wrapper = mount(PutAwayItemsPage, { props: { orderId: pa.id } })
    await flushPromises()
    await wrapper.find('button[aria-label="Manage batch"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('td').filter(td => td.text() === 'BATCH-00001')).toHaveLength(1)
    wrapper.unmount()
  })

  it('saving a put-away draft merges a plain SKU\'s qty across its bundled receiving tasks into one completedItems entry', async () => {
    const receiptA = freshFullCatalogReceipt('plain-A')
    const lines = lineItemsForReceipt(receiptA)
    const plainSku = lines.find(l => CATEGORY_BY_SKU.get(l.sku) === 'Accessory')?.sku
    expect(plainSku).toBeTruthy()

    const receiptB = freshFullCatalogReceipt('plain-B')
    const rtA = createReceivingTask({ receiptId: receiptA.id, assignee: 'Operator A', skus: [plainSku!] })!
    const rtB = createReceivingTask({ receiptId: receiptB.id, assignee: 'Operator B', skus: [plainSku!] })!
    startReceiving(rtA.id); startReceiving(rtB.id)
    endReceiving(rtA.id, { [plainSku!]: 20 })
    endReceiving(rtB.id, { [plainSku!]: 5 })
    const pa = addPutAwayTask({
      receivingTaskIds: [rtA.id, rtB.id], receivingTaskNos: [rtA.taskNo, rtB.taskNo],
      warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
    })

    savePutAwayDraft(pa.id, [{ skuCode: plainSku!, qty: 25, binLocation: 'A-01-01' }])

    const saved = getPutAwayTask(pa.id)!
    expect(saved.completedItems).toHaveLength(1)
    expect(saved.completedItems![0]).toMatchObject({ skuCode: plainSku, qty: 25, binLocation: 'A-01-01' })

    // Reload via getPutAwayLineItems — still one merged row.
    const reloaded = getPutAwayLineItems(pa.id)
    const row = reloaded.find(it => it.skuCode === plainSku)!
    expect(row.qty).toBe(25)
  })
})
