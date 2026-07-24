// @vitest-environment happy-dom
/**
 * Received qty may exceed Expected qty (targetQty) but never Purchase qty
 * (expectedQty). Scanning a unit that would push received past Expected qty
 * (while still within Purchase qty) must confirm with the operator first,
 * rather than silently counting it. Scanning past Purchase qty stays a hard
 * block, unchanged.
 *
 * Each test creates its OWN brand-new receipt (via addReceipt) rather than
 * reusing a seeded one — the seed data already has existing receiving-task
 * claims on nearly every SKU (claimedQtyBySku now correctly counts those),
 * so a seeded receipt/SKU pair can't reliably offer a clean Purchase qty of
 * exactly 3 with zero prior claim. A fresh single-line receipt always can.
 *
 * Note: this MpModal's root node stays in the DOM once opened once in this
 * test environment (the closing transition never fires without real
 * rendering), so these assertions check the functional side effect (the
 * counted qty) rather than the modal's DOM presence/absence.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReceiveItemsPage from '~/components/pages/ReceiveItemsPage.vue'
import { addReceipt } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { createReceivingTask, startReceiving } from '~/data/receivingTasks'
import { CATALOG } from '~/data/catalog'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const catMap = new Map(CATALOG.map((p) => [p.sku, p.category]))
const BATCH_CATS = new Set(['Green Beans', 'Roasted Beans'])
const SERIAL_CATS = new Set(['Espresso Machine', 'Grinder', 'Equipment'])

// A brand-new, single-line receipt always lands its one line's Purchase qty
// at the full requested amount (see lineItemsForReceipt's "last line gets the
// remainder" rule) — but WHICH SKU it picks is hash-derived from the fresh
// receipt id, so retry until it's a plain (non-batch, non-serial) one, since
// these tests scan expecting simple qty-increment behavior.
function freshPlainSkuReceiving(purchaseQty: number): { receiptId: string; sku: string } {
  for (let i = 0; i < 30; i++) {
    const receipt = addReceipt({
      purchaseNo: `PO-TEST-EXC-${i}-${Math.random()}`,
      warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan',
      skuQty: 1, purchaseQty, receivedQty: 0,
      status: 'on the way',
      estimatedArrival: '2026-08-01',
      trackingNos: [],
    })
    const line = lineItemsForReceipt(receipt)[0]!
    const cat = catMap.get(line.sku)
    if (cat && !BATCH_CATS.has(cat) && !SERIAL_CATS.has(cat)) {
      return { receiptId: receipt.id, sku: line.sku }
    }
  }
  throw new Error('Could not find a plain SKU after 30 tries')
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

function qtyValue(wrapper: ReturnType<typeof mount>): string {
  return (wrapper.find('input.ri-qty-input').element as HTMLInputElement).value
}

// Scoped to the confirm modal's own DOM subtree — the page has its own
// "Cancel" button (goBack) that would otherwise collide with a page-wide search.
function findModalButton(text: string): HTMLElement {
  const modal = document.querySelector('#modal-ri-exceed-target')!
  const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!btn) throw new Error(`Button "${text}" not found in confirm modal`)
  return btn as HTMLElement
}

describe('ReceiveItemsPage — confirm before counting a scan past Expected qty', () => {
  it('scans up to Expected qty freely, without ever opening the confirm modal', async () => {
    const { receiptId, sku } = freshPlainSkuReceiving(3)
    const task = createReceivingTask({
      receiptId, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 2 },
    })!
    expect(task.items[0]!.expectedQty).toBe(3) // Purchase qty
    expect(task.items[0]!.targetQty).toBe(2)   // Expected qty
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(document.querySelector('#modal-ri-exceed-target')).toBeNull()
    await scan(wrapper, sku)
    expect(document.querySelector('#modal-ri-exceed-target')).toBeNull()
    await scan(wrapper, sku)
    expect(document.querySelector('#modal-ri-exceed-target')).toBeNull() // never opened yet
    expect(qtyValue(wrapper)).toBe('2')
    wrapper.unmount()
  })

  it('scanning past Expected qty opens a confirm modal with the right numbers, and does not count it until confirmed', async () => {
    const { receiptId, sku } = freshPlainSkuReceiving(3)
    const task = createReceivingTask({
      receiptId, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 2 },
    })!
    startReceiving(task.id)
    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, sku)
    await scan(wrapper, sku)
    await scan(wrapper, sku) // 3rd scan — past Expected qty (2), within Purchase qty (3)

    const modal = document.querySelector('#modal-ri-exceed-target')
    expect(modal).not.toBeNull()
    expect(modal!.textContent).toContain('expected qty of 2')
    expect(qtyValue(wrapper)).toBe('2') // not counted yet — awaiting confirmation
    wrapper.unmount()
  })

  it('canceling the confirm modal does not count the unit', async () => {
    const { receiptId, sku } = freshPlainSkuReceiving(3)
    const task = createReceivingTask({
      receiptId, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 2 },
    })!
    startReceiving(task.id)
    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, sku)
    await scan(wrapper, sku)
    await scan(wrapper, sku)

    findModalButton('Cancel').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(qtyValue(wrapper)).toBe('2')
    wrapper.unmount()
  })

  it('confirming the modal counts the unit (up to, but never past, Purchase qty)', async () => {
    const { receiptId, sku } = freshPlainSkuReceiving(3)
    const task = createReceivingTask({
      receiptId, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 2 },
    })!
    startReceiving(task.id)
    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, sku)
    await scan(wrapper, sku)
    await scan(wrapper, sku)

    findModalButton('Count it').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(qtyValue(wrapper)).toBe('3') // now at Purchase qty — the hard ceiling

    // 4th scan: past Purchase qty (3) — hard block, no confirm modal, no increment.
    await scan(wrapper, sku)
    expect(qtyValue(wrapper)).toBe('3')
    wrapper.unmount()
  })
})
