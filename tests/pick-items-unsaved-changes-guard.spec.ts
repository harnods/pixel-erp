// @vitest-environment happy-dom
/**
 * Bug: clicking "Finish picking" (or "Save draft") commits the pick and
 * navigates away — but hasUnsavedChanges() (draftPickedTotal.value > 0) never
 * turns false afterward, since nothing resets the picked-qty state post-commit.
 * Without disableGuard(), the shared "Leave without saving?" modal would fire
 * on that very router.push, right after the operator's own intentional
 * Finish/Save action. This verifies disableGuard() actually prevents that.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PickItemsPage from '~/components/pages/PickItemsPage.vue'
import { resolveNavigationAttempt, useUnsavedChangesModalState } from '~/composables/useUnsavedChangesGuard'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask } from '~/data/pickingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const PLAIN_SKU = '3004' // Coffee Scale 2kg / 0.1g — plain, non-tracked

function makeOrderAndTask(qty: number): string {
  const order: OutgoingOrder = addOutgoing({
    salesNo: `Test Guard ${qty}-${Math.random()}`, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty,
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: PLAIN_SKU, productName: PLAIN_SKU, desc: '', img: '', unit: 'Unit', qty }],
  })
  const task = addPickingTask({
    salesOrderIds: [order.id], salesNos: [order.salesNo],
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  return task.id
}

function confirmModalButton(text: string): HTMLElement {
  const modal = document.querySelector('#modal-pik-confirm')!
  const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!btn) throw new Error(`Button "${text}" not found in confirm modal`)
  return btn as HTMLElement
}

describe('PickItemsPage — unsaved-changes guard is disabled on intentional Finish/Save', () => {
  it('Finish picking (even with items still picked in memory) does not trigger the Leave-without-saving modal', async () => {
    const taskId = makeOrderAndTask(60) // above scan threshold — manual qty entry allowed
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await wrapper.find('input.pik-qty-input').setValue('30') // partial pick — dirty

    const finishBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Finish picking')!
    await finishBtn.trigger('click')
    await flushPromises()

    confirmModalButton('Finish picking').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    // The page's own commit just ran; a subsequent navigation attempt (as the
    // real router.beforeEach would issue for the router.push it just called)
    // must resolve cleanly, with no blocking modal — the bug would show it here.
    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('Save draft also disables the guard before navigating away', async () => {
    const taskId = makeOrderAndTask(60)
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await wrapper.find('input.pik-qty-input').setValue('15')

    const saveDraftBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Save draft')!
    await saveDraftBtn.trigger('click')
    await flushPromises()

    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('sanity: before Finish/Save is clicked, a genuinely dirty page still blocks navigation (guard not broken/always-off)', async () => {
    const taskId = makeOrderAndTask(60)
    const wrapper = mount(PickItemsPage, { props: { orderId: taskId } })
    await flushPromises()

    await wrapper.find('input.pik-qty-input').setValue('10') // dirty, nothing committed yet

    const modal = useUnsavedChangesModalState()
    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.isOpen.value).toBe(true) // still guarded — correctly blocks

    modal.chooseCancel()
    await pending
    wrapper.unmount()
  })
})
