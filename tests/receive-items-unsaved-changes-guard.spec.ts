// @vitest-environment happy-dom
/**
 * Bug report: finishing a partial receiving task ("Finish receiving" →
 * "Finish as incomplete") incorrectly popped the shared "Leave without
 * saving?" modal, even though the operator was intentionally completing the
 * task. Root cause (confirmed via the identical, already-fixed bug in
 * PickItemsPage): hasUnsavedChanges() (draftReceivedTotal.value > 0) never
 * turns false after commit, since nothing resets the received-qty state —
 * only disableGuard(), called by commitReceiving()/saveDraft() right before
 * their own router.push, prevents the guard from firing on that navigation.
 *
 * Uses a brand-new receipt (via addReceipt) rather than a seeded one — the
 * seed data already has existing receiving-task claims on nearly every SKU
 * (claimedQtyBySku now correctly counts those), so a seeded receipt/SKU pair
 * can't reliably offer a clean, fully-outstanding Purchase qty. A fresh
 * single-line receipt always can.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReceiveItemsPage from '~/components/pages/ReceiveItemsPage.vue'
import { resolveNavigationAttempt, useUnsavedChangesModalState } from '~/composables/useUnsavedChangesGuard'
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
// at the full requested amount — but WHICH SKU it picks is hash-derived from
// the fresh receipt id, so retry until it's a plain (non-batch, non-serial)
// one, since this test scans expecting simple qty-increment behavior.
function freshPlainSkuReceipt(purchaseQty: number): { receiptId: string; sku: string } {
  for (let i = 0; i < 30; i++) {
    const receipt = addReceipt({
      purchaseNo: `PO-TEST-GUARD-${i}-${Math.random()}`,
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

function confirmModalButton(text: string): HTMLElement {
  const modal = document.querySelector('#modal-ri-confirm')!
  const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!btn) throw new Error(`Button "${text}" not found in confirm modal`)
  return btn as HTMLElement
}

function mountPartialReceipt() {
  const { receiptId, sku } = freshPlainSkuReceipt(3) // Purchase qty 3 — scanning once leaves it genuinely partial
  const task = createReceivingTask({ receiptId, assignee: 'Test Operator', skus: [sku] })!
  startReceiving(task.id)
  return { wrapper: mount(ReceiveItemsPage, { props: { orderId: task.id } }), sku }
}

describe('ReceiveItemsPage — unsaved-changes guard is disabled on intentional Finish/Save', () => {
  it('finishing a partial receipt ("Finish as incomplete") does not trigger the Leave-without-saving modal', async () => {
    const { wrapper, sku } = mountPartialReceipt()
    await flushPromises()

    await scan(wrapper, sku) // 1 of 3 — partial, dirty

    const finishBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Finish receiving')!
    await finishBtn.trigger('click')
    await flushPromises()

    expect(document.querySelector('#modal-ri-confirm')?.textContent).toContain('Finish receiving with outstanding items?')
    confirmModalButton('Finish as incomplete').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // A subsequent navigation attempt (as the real router.beforeEach would issue
    // for the router.push commitReceiving() just called) must resolve cleanly.
    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('Save draft also disables the guard before navigating away', async () => {
    const { wrapper, sku } = mountPartialReceipt()
    await flushPromises()

    await scan(wrapper, sku)

    const saveDraftBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Save draft')
    expect(saveDraftBtn).toBeTruthy()
    await saveDraftBtn!.trigger('click')
    await flushPromises()

    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('sanity: before Finish/Save is clicked, a genuinely dirty page still blocks navigation (guard not broken/always-off)', async () => {
    const { wrapper, sku } = mountPartialReceipt()
    await flushPromises()

    await scan(wrapper, sku) // dirty, nothing committed yet

    const modal = useUnsavedChangesModalState()
    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.isOpen.value).toBe(true) // still guarded — correctly blocks

    modal.chooseCancel()
    await pending
    wrapper.unmount()
  })
})
