// @vitest-environment happy-dom
/**
 * Same bug/fix as ReceiveItemsPage, PickItemsPage, PackItemsPage:
 * hasUnsavedChanges() (countedTotal.value > 0) never turns false after
 * commit, since nothing resets the counted-qty state — only disableGuard(),
 * called by commitFinish()/saveDraft() right before their own router.push,
 * prevents the shared "Leave without saving?" modal from firing on that
 * navigation.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StockCountingPage from '~/components/pages/StockCountingPage.vue'
import { resolveNavigationAttempt, useUnsavedChangesModalState } from '~/composables/useUnsavedChangesGuard'
import { addWmsAdjustment, startWmsCount } from '~/data/wmsStockAdjustments'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WAREHOUSE_ID = 'wh-006'
const WAREHOUSE_NAME = 'Gudang Makassar Selatan'
const PLAIN_SKU = '3004' // plain/untracked

function mountCountingTask() {
  const adj = addWmsAdjustment({
    kind: 'count', date: '2026-07-10', warehouseId: WAREHOUSE_ID, warehouseName: WAREHOUSE_NAME,
    category: 'Stock count', tags: [], assignee: 'Test Operator',
    lines: [{ sku: PLAIN_SKU, qty: 0, prevQty: 10 }],
  })
  startWmsCount(adj.id)
  return mount(StockCountingPage, { props: { orderId: adj.id } })
}

function confirmModalButton(text: string): HTMLElement {
  const modal = document.querySelector('#modal-sco-confirm')!
  const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!btn) throw new Error(`Button "${text}" not found in confirm modal`)
  return btn as HTMLElement
}

describe('StockCountingPage — unsaved-changes guard is disabled on intentional Finish/Save', () => {
  it('Finish counting does not trigger the Leave-without-saving modal', async () => {
    const wrapper = mountCountingTask()
    await flushPromises()

    await wrapper.find('input.sc-qty-input').setValue('5') // dirty

    const finishBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Finish counting')!
    await finishBtn.trigger('click')
    await flushPromises()

    confirmModalButton('Finish counting').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('Save draft disables the guard before navigating away', async () => {
    const wrapper = mountCountingTask()
    await flushPromises()

    await wrapper.find('input.sc-qty-input').setValue('5')

    const saveDraftBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Save draft')!
    await saveDraftBtn.trigger('click')
    await flushPromises()

    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('sanity: before Finish/Save is clicked, a genuinely dirty page still blocks navigation (guard not broken/always-off)', async () => {
    const wrapper = mountCountingTask()
    await flushPromises()

    await wrapper.find('input.sc-qty-input').setValue('5') // dirty, nothing committed yet

    const modal = useUnsavedChangesModalState()
    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.isOpen.value).toBe(true) // still guarded — correctly blocks

    modal.chooseCancel()
    await pending
    wrapper.unmount()
  })
})
