// @vitest-environment happy-dom
/**
 * Same bug/fix as ReceiveItemsPage, PickItemsPage, PutAwayItemsPage:
 * hasUnsavedChanges() (draftPackedTotal.value > 0) never turns false after
 * commit, since nothing resets the packed-qty state — only disableGuard(),
 * called by commit()/saveDraft() right before their own router.push, prevents
 * the shared "Leave without saving?" modal from firing on that navigation.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PackItemsPage from '~/components/pages/PackItemsPage.vue'
import { resolveNavigationAttempt, useUnsavedChangesModalState } from '~/composables/useUnsavedChangesGuard'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPackingTaskFromOrder, startPacking } from '~/data/packingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const PLAIN_SKU = '3004' // plain/untracked

function mountDirectPacking(qty: number) {
  const order: OutgoingOrder = addOutgoing({
    salesNo: `Test Pack Guard ${Math.random()}`, source: 'Manual',
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    skuQty: 1, orderQty: qty,
    shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: PLAIN_SKU, productName: PLAIN_SKU, desc: '', img: '', unit: 'Unit', qty }],
  })
  const task = addPackingTaskFromOrder({
    salesOrderId: order.id, salesNo: order.salesNo,
    warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME, assignee: 'Test Operator',
  })
  startPacking(task.id)
  return mount(PackItemsPage, { props: { orderId: task.id } })
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

function confirmModalButton(text: string): HTMLElement {
  const modal = document.querySelector('#modal-pak-confirm')!
  const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!btn) throw new Error(`Button "${text}" not found in confirm modal`)
  return btn as HTMLElement
}

describe('PackItemsPage — unsaved-changes guard is disabled on intentional Finish/Save', () => {
  it('Finish packing does not trigger the Leave-without-saving modal', async () => {
    const wrapper = mountDirectPacking(60) // above scan threshold — manual entry allowed too, but scan works regardless
    await flushPromises()

    await scan(wrapper, PLAIN_SKU) // partial pack — dirty

    const finishBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Finish packing')!
    await finishBtn.trigger('click')
    await flushPromises()

    confirmModalButton('Finish packing').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('Save draft also disables the guard before navigating away', async () => {
    const wrapper = mountDirectPacking(60)
    await flushPromises()

    await scan(wrapper, PLAIN_SKU)

    const saveDraftBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Save draft')!
    await saveDraftBtn.trigger('click')
    await flushPromises()

    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('sanity: before Finish/Save is clicked, a genuinely dirty page still blocks navigation (guard not broken/always-off)', async () => {
    const wrapper = mountDirectPacking(60)
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
