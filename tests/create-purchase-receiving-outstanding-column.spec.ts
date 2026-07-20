// @vitest-environment happy-dom
/**
 * Reported bug: after creating a first receiving task for some SKUs on a
 * receipt (left still open/in-progress — not ended yet), drafting a SECOND
 * receiving task for the same receipt showed no "Outstanding qty" (or
 * "Received qty") column at all, even though a SKU already partly claimed by
 * task 1 has a real, non-obvious remainder — leaving the user with no way to
 * tell how much of each SKU is still available to receive.
 *
 * Root cause: both columns were gated on `receipt.status === 'partial
 * reception'`, but a receipt only flips to that status once a task has ENDED
 * ("pending put-away"/"completed") — recomputeReceiptStatus() only reacts to
 * ended tasks. A first task that's merely open/in-progress leaves the receipt
 * at "on the way", hiding the columns despite claimedQtyBySku() already
 * correctly reserving qty for it. Fixed by gating on "this receipt already
 * has ANY earlier receiving task" instead of the receipt's own status.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CreatePurchaseReceivingPage from '~/components/pages/CreatePurchaseReceivingPage.vue'
import { createReceivingTask, receivingTasksForReceipt } from '~/data/receivingTasks'
import { receipts } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

function headerRow(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('thead th').map((th) => th.text())
}

// A receipt with NO receiving task at all yet, still "on the way", AND at
// least one line with enough Purchase qty to leave a real remainder after
// claiming 5 — so creating one task on it below is a clean, deterministic
// first claim (no pre-existing seed task's own claim to account for).
function freshOpenReceiptWithRoomySku(): { receiptId: string; sku: string; purchaseQty: number } {
  for (const r of receipts) {
    if (r.status !== 'on the way' || receivingTasksForReceipt(r.id).length > 0) continue
    const line = lineItemsForReceipt(r).find((l) => l.purchaseQty > 5)
    if (line) return { receiptId: r.id, sku: line.sku, purchaseQty: line.purchaseQty }
  }
  throw new Error('no fixture receipt found')
}

describe('CreatePurchaseReceivingPage — Outstanding/Received qty columns while an earlier task is still open', () => {
  it('shows the columns for a second draft even though task 1 has not ended (receipt still "on the way")', async () => {
    const { receiptId, sku, purchaseQty } = freshOpenReceiptWithRoomySku()
    const receipt = { id: receiptId }
    const line = { sku, purchaseQty }

    createReceivingTask({ receiptId: receipt.id, assignee: 'Operator A', skus: [line.sku], targetQtyBySku: { [line.sku]: 5 } })
    expect(receipts.find((r) => r.id === receipt.id)!.status).toBe('on the way') // task 1 never started

    const wrapper = mount(CreatePurchaseReceivingPage, { props: { orderId: receipt.id } })
    await flushPromises()

    expect(headerRow(wrapper)).toContain('Outstanding qty')
    expect(headerRow(wrapper)).toContain('Received qty')

    // Narrow via search so the SKU's row is guaranteed on-screen regardless of
    // where it falls in the progressively-paginated (10-per-page) table.
    await wrapper.find('input.pr-filter-search-input').setValue(line.sku)
    await flushPromises()

    const row = wrapper.findAll('tr.pr-item-row').find((r) => r.text().includes(line.sku))!
    const cells = row.findAll('td')
    // Product, SKU, Purchase qty, Expected qty (input), Received qty, Outstanding qty, Unit, Action
    expect(cells[4]!.text()).toBe('0') // Received qty — task 1 hasn't ended, nothing physically received yet
    expect(cells[5]!.text()).toBe((line.purchaseQty - 5).toLocaleString('id-ID')) // real remainder, not hidden/zeroed
    wrapper.unmount()
  })
})
