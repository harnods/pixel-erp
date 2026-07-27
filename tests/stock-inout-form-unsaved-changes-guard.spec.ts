// @vitest-environment happy-dom
/**
 * Same guard-bypass fix as the task-execution pages, applied to this one-shot
 * create form: hasUnsavedChanges() (rows.value.length > 0) never turns false
 * after Save persists the adjustment, since nothing clears the added product
 * rows — only disableGuard(), called by handleSave() right before its own
 * router.push, prevents the shared "Leave without saving?" modal from firing
 * on that navigation. No saveDraft option here (one-shot form) — the modal
 * would only ever offer Leave/Cancel.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import StockInOutFormPage from '~/components/pages/StockInOutFormPage.vue'
import SelectProductDrawer from '~/components/patterns/SelectProductDrawer.vue'
import { resolveNavigationAttempt, useUnsavedChangesModalState } from '~/composables/useUnsavedChangesGuard'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('useScenario', () => ({ activeScenario: { value: 'ERP' } }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const PLAIN_SKU = '3004' // plain/untracked — no per-row qty/serial requirement in this form's validation

async function addProductRow(wrapper: ReturnType<typeof mount>) {
  await wrapper.findComponent(SelectProductDrawer).vm.$emit('save', [PLAIN_SKU])
  await flushPromises()
}

describe('StockInOutFormPage — unsaved-changes guard is disabled on intentional Save', () => {
  it('Save disables the guard before navigating away', async () => {
    const wrapper = mount(StockInOutFormPage, {})
    await flushPromises()
    await addProductRow(wrapper) // dirty — at least one product line added

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
    const wrapper = mount(StockInOutFormPage, {})
    await flushPromises()
    await addProductRow(wrapper) // dirty, nothing saved yet

    const modal = useUnsavedChangesModalState()
    const pending = resolveNavigationAttempt()
    await Promise.resolve()
    expect(modal.isOpen.value).toBe(true) // still guarded — correctly blocks

    modal.chooseCancel()
    await pending
    wrapper.unmount()
  })
})
