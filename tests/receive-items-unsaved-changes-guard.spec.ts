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
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReceiveItemsPage from '~/components/pages/ReceiveItemsPage.vue'
import { resolveNavigationAttempt, useUnsavedChangesModalState } from '~/composables/useUnsavedChangesGuard'
import { receipts } from '~/data/receipts'
import { createReceivingTask, startReceiving } from '~/data/receivingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const RECEIPT_ID = 'rcv-001'
const SKU = '3002' // Purchase qty 3 — scanning once leaves it genuinely partial

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
  const receipt = receipts.find((r) => r.id === RECEIPT_ID)!
  const task = createReceivingTask({ receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU] })!
  startReceiving(task.id)
  return mount(ReceiveItemsPage, { props: { orderId: task.id } })
}

describe('ReceiveItemsPage — unsaved-changes guard is disabled on intentional Finish/Save', () => {
  it('finishing a partial receipt ("Finish as incomplete") does not trigger the Leave-without-saving modal', async () => {
    const wrapper = mountPartialReceipt()
    await flushPromises()

    await scan(wrapper, SKU) // 1 of 3 — partial, dirty

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
    const wrapper = mountPartialReceipt()
    await flushPromises()

    await scan(wrapper, SKU)

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
    const wrapper = mountPartialReceipt()
    await flushPromises()

    await scan(wrapper, SKU) // dirty, nothing committed yet

    const modal = useUnsavedChangesModalState()
    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.isOpen.value).toBe(true) // still guarded — correctly blocks

    modal.chooseCancel()
    await pending
    wrapper.unmount()
  })
})
