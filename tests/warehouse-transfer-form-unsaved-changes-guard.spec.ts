// @vitest-environment happy-dom
/**
 * Same guard-bypass fix as the task-execution pages, applied to this one-shot
 * create form: hasUnsavedChanges() (rows.value.length > 0) never turns false
 * after Save persists the transfer, since nothing clears the added product
 * rows — only disableGuard(), called by handleSave() right before its own
 * router.push, prevents the shared "Leave without saving?" modal from firing
 * on that navigation. No saveDraft option here (one-shot form) — the modal
 * would only ever offer Leave/Cancel.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import WarehouseTransferFormPage from '~/components/pages/WarehouseTransferFormPage.vue'
import SelectProductDrawer from '~/components/patterns/SelectProductDrawer.vue'
import { resolveNavigationAttempt, useUnsavedChangesModalState } from '~/composables/useUnsavedChangesGuard'
import { getWarehouseDetail } from '~/data/warehouseDetails'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// wh-008 and wh-000 are both bin-less (no storage-location tree) — keeps the
// plain SKU row on the simple qty-input branch, avoiding the "Manage storage
// location" 2nd-drawer path that only appears when either side has bins.
const ORIGIN_ID = 'wh-008'
const DEST_ID = 'wh-000'

function firstPlainSkuWithStock(): string {
  const stock = getWarehouseDetail(ORIGIN_ID)!.stock
  const item = stock.find((s) => !s.batches?.length && !s.serials && s.available > 0)!
  return item.sku
}

describe('WarehouseTransferFormPage — unsaved-changes guard is disabled on intentional Save', () => {
  it('Save disables the guard before navigating away', async () => {
    const sku = firstPlainSkuWithStock()
    const wrapper = mount(WarehouseTransferFormPage, { props: { orderId: 'new' } })
    await flushPromises()

    const autocompletes = wrapper.findAllComponents({ name: 'MpAutocomplete' })
    expect(autocompletes.length).toBeGreaterThanOrEqual(2)
    await autocompletes[0]!.vm.$emit('update:modelValue', ORIGIN_ID)
    await autocompletes[1]!.vm.$emit('update:modelValue', DEST_ID)
    await flushPromises()

    await wrapper.findComponent(SelectProductDrawer).vm.$emit('save', [sku])
    await flushPromises()

    const qtyInput = wrapper.find('input.wtf-qty-input')
    expect(qtyInput.exists()).toBe(true)
    await qtyInput.setValue('1') // dirty — at least one product line, qty filled

    const saveBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Save')!
    await saveBtn.trigger('click')
    await flushPromises()
    // handleSave awaits a fake 600ms save delay before committing/navigating.
    await new Promise((r) => setTimeout(r, 700))

    const modal = useUnsavedChangesModalState()
    await expect(resolveNavigationAttempt()).resolves.toBe(true)
    expect(modal.isOpen.value).toBe(false)

    wrapper.unmount()
  })

  it('sanity: before Save is clicked, a genuinely dirty form still blocks navigation (guard not broken/always-off)', async () => {
    const sku = firstPlainSkuWithStock()
    const wrapper = mount(WarehouseTransferFormPage, { props: { orderId: 'new' } })
    await flushPromises()

    await wrapper.findComponent(SelectProductDrawer).vm.$emit('save', [sku]) // dirty, nothing saved yet
    await flushPromises()

    const modal = useUnsavedChangesModalState()
    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.isOpen.value).toBe(true) // still guarded — correctly blocks

    modal.chooseCancel()
    await pending
    wrapper.unmount()
  })
})
