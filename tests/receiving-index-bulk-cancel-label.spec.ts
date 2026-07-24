// @vitest-environment happy-dom
/**
 * The bulk-select action bar's Cancel button just said "Cancel" — ambiguous
 * standalone (cancel the selection? cancel the tasks?). Relabeled to "Cancel
 * receiving task", mirroring ReceiptIndexPage's bulk action which already
 * qualifies its own "Cancel" as "Cancel receipt" for the same reason.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, useSlots } from 'vue'
import ReceivingIndexPage from '~/components/pages/ReceivingIndexPage.vue'

vi.stubGlobal('inject', () => undefined)
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('nextTick', nextTick)
vi.stubGlobal('useSlots', useSlots)
vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('useWarehouseContext', () => ({ assignedWarehouses: computed(() => []) }))
vi.stubGlobal('useActiveWarehouseFilter', () => ref([]))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountLoaded() {
  vi.useFakeTimers()
  const wrapper = mount(ReceivingIndexPage as never)
  await vi.advanceTimersByTimeAsync(1300) // demoState's loading-skeleton timeout
  await flushPromises()
  vi.useRealTimers()
  return wrapper
}

describe('ReceivingIndexPage — bulk action bar Cancel button is unambiguously labeled', () => {
  it('shows "Cancel receiving task", not bare "Cancel", once tasks are bulk-selected', async () => {
    const wrapper = await mountLoaded()

    // MpCheckbox binds its Vue `change` emit straight to the native input's
    // onChange — dispatch the real DOM event rather than @vue/test-utils' setValue.
    wrapper.find('input#rcvg-head-all').element
      .dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const bulkBar = wrapper.find('.rcvg-bulk-bar')
    expect(bulkBar.exists()).toBe(true)
    expect(bulkBar.text()).toContain('Cancel receiving task')
    expect(bulkBar.text()).not.toMatch(/(?<!\w)Cancel(?! receiving task)/)
    wrapper.unmount()
  })
})
