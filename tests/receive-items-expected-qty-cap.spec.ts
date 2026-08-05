// @vitest-environment happy-dom
/**
 * Expected qty (targetQty) is the hard cap for receiving — a task may never
 * receive past what it expects (PRD over-receipt guard, with
 * allow_receive_exceed_order = FALSE). Scanning past Expected qty is a hard
 * block: no confirm, no increment. Purchase qty (expectedQty) is only a
 * reference number, not a receivable ceiling.
 *
 * Each test creates its OWN brand-new receipt (via addReceipt) rather than
 * reusing a seeded one — the seed data already has existing receiving-task
 * claims on nearly every SKU, so a seeded receipt/SKU pair can't reliably offer
 * a clean Purchase qty of exactly 3 with zero prior claim. A fresh single-line
 * receipt always can.
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
      purchaseNo: `PO-TEST-CAP-${i}-${Math.random()}`,
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

describe('ReceiveItemsPage — Expected qty is the hard receiving cap', () => {
  it('scans freely up to Expected qty', async () => {
    const { receiptId, sku } = freshPlainSkuReceiving(3)
    const task = createReceivingTask({
      receiptId, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 2 },
    })!
    expect(task.items[0]!.expectedQty).toBe(3) // Purchase qty (reference only)
    expect(task.items[0]!.targetQty).toBe(2)   // Expected qty (the hard cap)
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, sku)
    expect(qtyValue(wrapper)).toBe('1')
    await scan(wrapper, sku)
    expect(qtyValue(wrapper)).toBe('2') // reached Expected qty
    wrapper.unmount()
  })

  it('scanning past Expected qty is rejected — never counted, even within Purchase qty', async () => {
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
    expect(qtyValue(wrapper)).toBe('2')

    // 3rd scan — past Expected qty (2) though still within Purchase qty (3):
    // hard block, no increment, no confirm modal exists anymore.
    await scan(wrapper, sku)
    expect(qtyValue(wrapper)).toBe('2')
    expect(document.querySelector('#modal-ri-exceed-target')).toBeNull()
    wrapper.unmount()
  })
})
