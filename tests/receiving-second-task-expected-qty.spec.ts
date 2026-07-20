// @vitest-environment happy-dom
/**
 * Reported bug: partially receive a SKU in one receiving task, then create a
 * SECOND receiving task (covering the outstanding remainder) for the same
 * receipt — that new task's "Expected qty" showed the full Purchase qty
 * again, as if nothing had been received yet.
 *
 * Root cause: createReceivingTask() defaulted/clamped targetQty ("Expected
 * qty") against the whole-PO Purchase qty, ignoring what prior ended tasks on
 * the same receipt already received (a `priorReceived` figure it already
 * computed but never used). Fixed to default/clamp against the outstanding
 * qty (Purchase qty minus prior received) instead — mirroring how the plain
 * qty input's own hard ceiling on the Receive Items page already correctly
 * subtracts prior received from Purchase qty.
 *
 * Because targetQty is now already net of prior received at creation time,
 * every downstream consumer that used to separately subtract prior received
 * from targetQty (draftOutstanding, shortItemsCount, the scan-threshold
 * check) had to stop doing so — otherwise prior received would be subtracted
 * twice. Purchase-qty (expectedQty) based consumers are untouched — that
 * field stays whole-PO-scoped by design.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReceiveItemsPage from '~/components/pages/ReceiveItemsPage.vue'
import CreatePurchaseReceivingPage from '~/components/pages/CreatePurchaseReceivingPage.vue'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'
import { receipts } from '~/data/receipts'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// Each test uses its OWN receipt/SKU pair — receivingTasks is a shared,
// persisted singleton across the whole file, so reusing one SKU across tests
// would let an earlier test's "prior received" leak into a later one.
// All four are plain (untracked) Accessory lines, so this is pure qty
// arithmetic — no batch/serial noise.
function partiallyReceiveFirstTask(receiptId: string, sku: string, receivedQty: number) {
  const receipt = receipts.find((r) => r.id === receiptId)!
  const task1 = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator A', skus: [sku] })!
  startReceiving(task1.id)
  endReceiving(task1.id, { [sku]: receivedQty })
  return task1
}

describe('createReceivingTask — a second task on the same receipt defaults Expected qty to the outstanding remainder', () => {
  it('defaults targetQty to (Purchase qty − prior received), not the full Purchase qty', () => {
    const receiptId = 'rcv-004'
    const sku = '3004' // Purchase qty 57
    const task1 = partiallyReceiveFirstTask(receiptId, sku, 30)
    expect(task1.items[0]!.receivedQty).toBe(30)
    expect(['pending put-away', 'completed']).toContain(task1.status) // "ended" — counts toward prior received

    const receipt = receipts.find((r) => r.id === receiptId)!
    const task2 = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator B', skus: [sku] })!
    const item2 = task2.items.find((it) => it.sku === sku)!

    expect(item2.expectedQty).toBe(57) // Purchase qty — unchanged, still whole-PO-scoped
    expect(item2.targetQty).toBe(27)   // 57 - 30, NOT 57 (the reported bug)
  })

  it('clamps an explicit targetQtyBySku override against the outstanding remainder, not the full Purchase qty', () => {
    const receiptId = 'rcv-004'
    const sku = '3007' // Purchase qty 64 — distinct from the test above
    partiallyReceiveFirstTask(receiptId, sku, 30)
    const receipt = receipts.find((r) => r.id === receiptId)!
    const task2 = createReceivingTask({
      receiptId: receipt.id, assignee: 'Operator B', skus: [sku],
      targetQtyBySku: { [sku]: 999 },
    })!
    const item2 = task2.items.find((it) => it.sku === sku)!
    expect(item2.targetQty).toBe(34) // clamped to outstanding (64-30), not Purchase qty (64)
  })
})

describe('CreatePurchaseReceivingPage — Expected qty input for a second task defaults to the outstanding remainder', () => {
  it('pre-fills and caps the Expected qty input at the outstanding qty, not the full Purchase qty', async () => {
    const receiptId = 'rcv-004'
    const sku = '3002' // Purchase qty 23, rendered on the table's first page (no scroll needed)
    partiallyReceiveFirstTask(receiptId, sku, 10)
    const receipt = receipts.find((r) => r.id === receiptId)!

    const wrapper = mount(CreatePurchaseReceivingPage, { props: { orderId: receipt.id } })
    await flushPromises()

    // The receipt has other uncovered SKUs too (untouched by this test) — scope
    // to SKU 3002's own row, not just the first qty input on the page.
    const row = wrapper.findAll('tr.pr-item-row').find((r) => r.text().includes(sku))!
    const input = row.find('input.pr-qty-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('max')).toBe('13')
    expect((input.element as HTMLInputElement).value).toBe('13')
    wrapper.unmount()
  })
})

describe('ReceiveItemsPage — a second task\'s Outstanding qty is correct once, not double-subtracted', () => {
  it('shows the real outstanding remainder for the second task at the start (nothing received in it yet)', async () => {
    const receiptId = 'rcv-007'
    const sku = '3007' // Purchase qty 98 — genuinely unclaimed by any seed task on this receipt (unlike
    // rcv-006, whose seed data already has an existing receiving task touching nearly every SKU —
    // claimedQtyBySku() now correctly counts that too, so reusing rcv-006 here would double-claim)
    partiallyReceiveFirstTask(receiptId, sku, 30)
    const receipt = receipts.find((r) => r.id === receiptId)!
    const task2 = createReceivingTask({ receiptId: receipt.id, assignee: 'Operator B', skus: [sku] })!
    startReceiving(task2.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task2.id } })
    await flushPromises()

    const outstandingStat = wrapper.findAll('.ri-stat').find((s) => s.text().includes('Outstanding qty'))!
    expect(outstandingStat.find('.ri-stat-val').text()).toBe('68') // 98 - 30, not 0 (double-subtracted) or 98 (unsubtracted)
    wrapper.unmount()
  })
})
