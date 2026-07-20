// @vitest-environment happy-dom
/**
 * Same bug/fix as ReceiveItemsPage and PickItemsPage: hasUnsavedChanges()
 * (draftHandled.value > 0) never turns false after commit, since nothing
 * resets the assigned-qty state — only disableGuard(), called by
 * postPutAway()/saveDraft() right before their own router.push, prevents the
 * shared "Leave without saving?" modal from firing on that navigation.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PutAwayItemsPage from '~/components/pages/PutAwayItemsPage.vue'
import { resolveNavigationAttempt, useUnsavedChangesModalState } from '~/composables/useUnsavedChangesGuard'
import { receipts } from '~/data/receipts'
import { DEMO_RECEIPT_ID } from '~/data/receiptLineItems'
import { createReceivingTask, startReceiving, endReceiving } from '~/data/receivingTasks'
import { addPutAwayTask, startPutAway } from '~/data/putAwayTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const PLAIN_SKU = '3004' // plain/untracked — a qty-only input suffices, no batch/serial drawer needed

// binLocation defaults to the SKU's real storage bin (binForSku) already, so
// scanning the SKU to reach the exact received qty alone satisfies put-away's
// completeness check — no popover/location interaction needed to reach
// postPutAway()'s commit path. Scanning (not typing) because qty=1 is well
// below the warehouse's scan-required threshold, so the manual input is disabled.
function mountReceivedPutAway() {
  const receipt = receipts.find((r) => r.id === DEMO_RECEIPT_ID)!
  const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [PLAIN_SKU] })!
  startReceiving(task.id)
  endReceiving(task.id, { [PLAIN_SKU]: 1 }, {})
  const pa = addPutAwayTask({
    receivingTaskIds: [task.id], receivingTaskNos: [task.taskNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  startPutAway(pa.id)
  return mount(PutAwayItemsPage, { props: { orderId: pa.id } })
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('PutAwayItemsPage — unsaved-changes guard is disabled on intentional Finish/Save', () => {
  it('Finish put-away does not trigger the Leave-without-saving modal', async () => {
    const wrapper = mountReceivedPutAway()
    await flushPromises()

    await scan(wrapper, PLAIN_SKU) // matches received qty (1) — dirty, and complete

    const finishBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Finish put-away')!
    await finishBtn.trigger('click')
    await flushPromises()

    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('Save as draft also disables the guard before navigating away', async () => {
    const wrapper = mountReceivedPutAway()
    await flushPromises()

    await scan(wrapper, PLAIN_SKU)

    const saveDraftBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Save as draft')!
    await saveDraftBtn.trigger('click')
    await flushPromises()

    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('sanity: before Finish/Save is clicked, a genuinely dirty page still blocks navigation (guard not broken/always-off)', async () => {
    const wrapper = mountReceivedPutAway()
    await flushPromises()

    await scan(wrapper, PLAIN_SKU) // dirty, nothing committed yet

    const modal = useUnsavedChangesModalState()
    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.isOpen.value).toBe(true) // still guarded — correctly blocks

    modal.chooseCancel()
    await pending
    wrapper.unmount()
  })
})
