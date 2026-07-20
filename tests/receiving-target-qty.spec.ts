// @vitest-environment happy-dom
/**
 * Regression guard for the "Expected qty" feature: a new targetQty field on
 * receiving items, distinct from expectedQty ("Purchase qty", the hard
 * per-SKU ceiling copied from the PO line). Expected qty defaults to Purchase
 * qty, can be lowered (never raised past it) at task-creation time, and
 * becomes the new basis for outstanding-qty display, the scan threshold, and
 * "is this task complete" — while Purchase qty stays the unchanged hard cap
 * for received qty and the batch/serial drawers.
 *
 * Each test that creates a receiving task without ending it uses its OWN SKU
 * on rcv-004 — receivingTasks is a shared, persisted singleton across this
 * file, and an un-ended (open/in-progress) task now correctly claims its own
 * targetQty against the SKU's Purchase qty (see claimedQtyBySku), so reusing
 * one SKU across tests would let an earlier test's claim eat into a later
 * one's "outstanding" computation.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReceiveItemsPage from '~/components/pages/ReceiveItemsPage.vue'
import { createReceivingTask, startReceiving, receivingTasks } from '~/data/receivingTasks'
import { receipts } from '~/data/receipts'
import { DEMO_RECEIPT_ID } from '~/data/receiptLineItems'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// rcv-004: every SKU below is distinct, so no test's open (never-ended) task
// claim leaks into another's outstanding-qty computation. Tests that mount
// ReceiveItemsPage and scan/read the plain qty input specifically need an
// Accessory-category (plain, untracked) SKU — rcv-004 only has 3 of those
// with Purchase qty above the default scan threshold (50): 3001, 3004, 3007.
// The other, non-UI (data-layer only) tests can use any SKU regardless of
// category. Purchase qty 57 SKUs are used wherever a test hardcodes the exact
// "57". Tests 8/9 need a 4th/5th plain qty>50 SKU, which rcv-004 doesn't have
// spare — they use rcv-006 (3002/3005) instead.
const BIG_RECEIPT_ID = 'rcv-004'
const BIG_PLAIN_SKU = '3004'    // Purchase qty 57 — used by the demo-receipt test only, never left open on rcv-004

describe('createReceivingTask — targetQty ("Expected qty") clamping', () => {
  it('defaults every item\'s targetQty to its Purchase qty when no targetQtyBySku is given', () => {
    const receipt = receipts.find((r) => r.id === DEMO_RECEIPT_ID)!
    const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [BIG_PLAIN_SKU] })!
    const item = task.items.find((it) => it.sku === BIG_PLAIN_SKU)!
    expect(item.targetQty).toBe(item.expectedQty)
  })

  it('keeps an explicit targetQty below Purchase qty as given', () => {
    const sku = '2002' // Purchase qty 57
    const receipt = receipts.find((r) => r.id === BIG_RECEIPT_ID)!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 40 },
    })!
    const item = task.items.find((it) => it.sku === sku)!
    expect(item.expectedQty).toBe(57)
    expect(item.targetQty).toBe(40)
  })

  it('clamps a targetQty above Purchase qty down to Purchase qty', () => {
    const sku = '1005' // Purchase qty 57
    const receipt = receipts.find((r) => r.id === BIG_RECEIPT_ID)!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 999 },
    })!
    const item = task.items.find((it) => it.sku === sku)!
    expect(item.targetQty).toBe(item.expectedQty)
  })

  it('clamps a negative targetQty to 0', () => {
    const sku = '1103' // Purchase qty 64 — exact qty doesn't matter for this assertion
    const receipt = receipts.find((r) => r.id === BIG_RECEIPT_ID)!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: -5 },
    })!
    const item = task.items.find((it) => it.sku === sku)!
    expect(item.targetQty).toBe(0)
  })
})

describe('Seed data — targetQty invariants', () => {
  it('every seeded receiving task item has 0 <= targetQty <= expectedQty (Purchase qty)', () => {
    for (const t of receivingTasks) {
      for (const it of t.items) {
        expect(typeof it.targetQty).toBe('number')
        expect(it.targetQty).toBeGreaterThanOrEqual(0)
        expect(it.targetQty).toBeLessThanOrEqual(it.expectedQty)
      }
    }
  })

  it('seed variety: some items get a reduced targetQty and some default to the full Purchase qty', () => {
    const allItems = receivingTasks.flatMap((t) => t.items)
    expect(allItems.some((it) => it.targetQty < it.expectedQty)).toBe(true)
    expect(allItems.some((it) => it.targetQty === it.expectedQty)).toBe(true)
  })
})

describe('ReceiveItemsPage — scan threshold basis is Expected qty (targetQty), not Purchase qty', () => {
  it('a line with targetQty at/below the threshold requires scanning even though Purchase qty is above it', async () => {
    const sku = '3001' // Purchase qty 57
    const receipt = receipts.find((r) => r.id === BIG_RECEIPT_ID)!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 40 },
    })!
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    const input = wrapper.find('input.ri-qty-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('disabled')).toBeDefined()
    // The hard ceiling shown/enforced on the input stays Purchase qty, unchanged.
    expect(input.attributes('max')).toBe('57')
    wrapper.unmount()
  })

  it('a line whose targetQty defaults to a Purchase qty above the threshold does NOT require scanning', async () => {
    const sku = '3007' // Purchase qty 64 — exact qty doesn't matter, just needs to clear the threshold
    const receipt = receipts.find((r) => r.id === BIG_RECEIPT_ID)!
    const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [sku] })!
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    const input = wrapper.find('input.ri-qty-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('ReceiveItemsPage — the items table shows an Expected qty column next to Purchase qty', () => {
  it('renders the "Expected qty" header and the line\'s targetQty value, distinct from Purchase qty', async () => {
    const sku = '3004' // Purchase qty 57 — never left open elsewhere on rcv-004
    const receipt = receipts.find((r) => r.id === BIG_RECEIPT_ID)!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 40 },
    })!
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    const headers = wrapper.findAll('th.ri-th').map((h) => h.text())
    expect(headers).toContain('Expected qty')
    expect(headers.indexOf('Expected qty')).toBe(headers.indexOf('Purchase qty') + 1)

    const row = wrapper.find('tr.ri-row')
    const numCells = row.findAll('td.ri-td--num').map((c) => c.text())
    expect(numCells[0]).toBe('57') // Purchase qty
    expect(numCells[1]).toBe('40') // Expected qty (targetQty), distinct from Purchase qty
    wrapper.unmount()
  })
})

// The manual qty input is disabled below the scan threshold (targetQty <= 50
// forces "must scan"), so these use the scan bar — same as an operator would
// on the shop floor — rather than typing into a disabled input.
async function scanSku(wrapper: ReturnType<typeof mount>, sku: string, times: number) {
  const scanInput = wrapper.find('.scan-bar-input')
  for (let i = 0; i < times; i++) {
    await scanInput.setValue(sku)
    await scanInput.trigger('keydown.enter')
    await flushPromises()
  }
}

describe('ReceiveItemsPage — Outstanding qty is floored at 0 against Expected qty, not Purchase qty', () => {
  it('receiving more than Expected qty (but not more than Purchase qty) shows 0 outstanding, never negative', async () => {
    // rcv-004's own plain SKUs above the scan threshold are already spoken
    // for by other tests in this file — rcv-007 has spare, fully-unclaimed ones.
    const sku = '3001' // Plain (Accessory) SKU on rcv-007, Purchase qty 87
    const receipt = receipts.find((r) => r.id === 'rcv-007')!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 5 },
    })!
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scanSku(wrapper, sku, 8) // > targetQty (5), <= expectedQty/Purchase qty (87)

    const outstandingStat = wrapper.findAll('.ri-stat').find((s) => s.text().includes('Outstanding qty'))!
    expect(outstandingStat.find('.ri-stat-val').text()).toBe('0')
    wrapper.unmount()
  })

  it('receiving less than Expected qty shows the real (positive) shortfall against Expected qty', async () => {
    const sku = '3006' // Plain (Accessory) SKU on rcv-007, Purchase qty 66
    const receipt = receipts.find((r) => r.id === 'rcv-007')!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [sku],
      targetQtyBySku: { [sku]: 5 },
    })!
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scanSku(wrapper, sku, 3) // < targetQty (5)

    const outstandingStat = wrapper.findAll('.ri-stat').find((s) => s.text().includes('Outstanding qty'))!
    expect(outstandingStat.find('.ri-stat-val').text()).toBe('2')
    wrapper.unmount()
  })
})
