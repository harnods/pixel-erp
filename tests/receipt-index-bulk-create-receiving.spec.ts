// @vitest-environment happy-dom
/**
 * The inbound receipts index bulk-action "Actions" menu offers "Create purchase
 * receiving". A receiving task is inherently per-order (its form walks the
 * operator through ONE receipt's SKUs/assignee), so that item appears in the
 * menu ONLY when exactly one row is selected (and that receipt can start a
 * task). A multi-select drops it from the menu and shows an explanatory caption
 * in the bulk bar instead (mirrors the outbound single-warehouse hint). Edit
 * tracking no. / Cancel still work across the selection.
 *
 * Mounts the real index page, so every Nuxt auto-import the page (or a pattern
 * it uses) relies on without its own `import ... from 'vue'` is stubbed here.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, useSlots } from 'vue'
import ReceiptIndexPage from '~/components/pages/ReceiptIndexPage.vue'

const push = vi.fn()
vi.stubGlobal('inject', () => undefined)
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('nextTick', nextTick)
vi.stubGlobal('useSlots', useSlots)
vi.stubGlobal('useRouter', () => ({ push }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('useWarehouseContext', () => ({ assignedWarehouses: computed(() => []) }))
vi.stubGlobal('useActiveWarehouseFilter', () => ref([]))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountLoaded() {
  vi.useFakeTimers()
  const wrapper = mount(ReceiptIndexPage)
  await vi.advanceTimersByTimeAsync(1300) // demoState's loading-skeleton timeout
  await flushPromises()
  vi.useRealTimers()
  return wrapper
}

/** MpCheckbox binds its Vue `change` emit straight to the native input's onChange. */
function check(row: ReturnType<typeof mount>) {
  row.find('input[type="checkbox"]').element.dispatchEvent(new Event('change', { bubbles: true }))
}

/** Open the bulk "Actions" popover and return the "Create purchase receiving"
 *  list item from wherever it renders (the popover uses use-portal → body). */
async function openActionsAndFindCreate(wrapper: ReturnType<typeof mount>) {
  const trigger = wrapper.findAll('button').find((b) => b.text().includes('Actions'))!
  await trigger.trigger('click')
  await flushPromises()
  const items = [...document.querySelectorAll('*')].filter(
    (el) => el.children.length === 0 && el.textContent?.trim() === 'Create purchase receiving',
  )
  // The clickable list item is the closest ancestor with role/li semantics; fall
  // back to the text node's own element (enough to read text + disabled state).
  return items[0]?.closest('li, [role="menuitem"], [role="option"], button') ?? items[0] ?? null
}

describe('ReceiptIndexPage — bulk "Create purchase receiving" is per-order only', () => {
  it('single-select: the item is present in the Actions menu, no caption', async () => {
    const wrapper = await mountLoaded()
    const rows = wrapper.findAll('tr.erp-tr')
    check(rows[0]!)
    await flushPromises()

    // No multi-select caption on a single selection.
    expect(wrapper.find('thead').text()).not.toContain('A receiving task can only be created for one order at a time.')

    const item = await openActionsAndFindCreate(wrapper)
    expect(item).not.toBeNull()
    wrapper.unmount()
  })

  it('multi-select: the item is gone from the menu, and a caption explains why', async () => {
    const wrapper = await mountLoaded()
    const rows = wrapper.findAll('tr.erp-tr')
    check(rows[0]!)
    await flushPromises()
    check(rows[1]!)
    await flushPromises()

    // Caption renders inline in the bulk bar (thead), next to the count label.
    expect(wrapper.find('thead').text()).toContain('A receiving task can only be created for one order at a time.')

    // And the menu item itself is no longer offered.
    const item = await openActionsAndFindCreate(wrapper)
    expect(item).toBeNull()
    wrapper.unmount()
  })
})
