// @vitest-environment happy-dom
/**
 * Every recurring index (sales invoices, sales orders, purchase invoices,
 * purchase orders, expenses) exposes Delete as a BULK action.
 *
 * Two things are pinned here, because both are easy to regress:
 *  1. Delete is reachable from the shared ErpTablePage bulk bar once rows are
 *     selected — and is a dedicated button, NOT folded into an "Actions"
 *     dropdown (rule/bulk-actions-delete-confirmed keeps destructive ops out of that
 *     menu, so the button + its own confirm modal is the sanctioned shape).
 *  2. Confirming actually removes the selected templates from the backing
 *     store, so the bulk bar is not dead UI.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useTableState } from '~/composables/useTableState'

beforeAll(() => {
  Object.assign(globalThis, {
    useTableState,
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
    useRoute: () => ({ path: '/', params: {}, query: {}, hash: '' }),
    useHead: () => {},
    definePageMeta: () => {},
    navigateTo: () => {},
    useState: (_k: string, f: () => unknown) => ref(f?.()),
  })
})

type Store = { id: string }[]

const CASES = [
  {
    name: 'Recurring sales invoices',
    page: () => import('~/components/pages/RecurringSalesInvoicesPage.vue'),
    store: async () => (await import('~/data/salesInvoices')).recurringSalesInvoices as unknown as Store,
  },
  {
    name: 'Recurring sales orders',
    page: () => import('~/components/pages/RecurringSalesOrdersPage.vue'),
    store: async () => (await import('~/data/salesOrders')).recurringSalesOrders as unknown as Store,
  },
  {
    name: 'Recurring purchase invoices',
    page: () => import('~/components/pages/RecurringPurchaseInvoicesPage.vue'),
    store: async () => (await import('~/data/purchaseInvoices')).recurringPurchaseInvoices as unknown as Store,
  },
  {
    name: 'Recurring purchase orders',
    page: () => import('~/components/pages/RecurringPurchaseOrdersPage.vue'),
    store: async () => (await import('~/data/purchaseOrders')).recurringPurchaseOrders as unknown as Store,
  },
  {
    name: 'Recurring expenses',
    page: () => import('~/components/pages/RecurringBillsPage.vue'),
    store: async () => (await import('~/data/bills')).recurringBills as unknown as Store,
  },
]

beforeEach(() => { localStorage.clear() })

describe.each(CASES)('$name — bulk delete', ({ page, store }) => {
  async function mountIndex() {
    const Page = (await page()).default
    return mount(Page, { global: { stubs: { Teleport: true } } })
  }

  it('reveals a Delete button in the bulk bar once rows are selected', async () => {
    const w = await mountIndex()
    expect(w.find('.erp-bulk-bar').exists()).toBe(false)

    // MpCheckbox binds its Vue `change` emit straight to the native input's
    // onChange — dispatch the real DOM event rather than setValue.
    w.find('input#erp-select-all').element
      .dispatchEvent(new Event('change', { bubbles: true }))
    await w.vm.$nextTick()

    const bar = w.find('.erp-bulk-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('Delete')
    // Destructive actions stay out of the Actions dropdown.
    expect(bar.text()).not.toContain('Actions')
    w.unmount()
  })

  it('removes the selected templates from the store on confirm', async () => {
    const rows = await store()
    const before = rows.length
    expect(before).toBeGreaterThan(0)

    const w = await mountIndex()
    const vm = w.vm as unknown as {
      paginated: { id: string }[]
      openBulkDelete: (s: Set<number>, d: () => void) => void
      confirmBulkDelete: () => void
      bulkDeleteIds: string[]
    }

    const doomed = vm.paginated[0]!.id
    vm.openBulkDelete(new Set([0]), () => {})
    expect(vm.bulkDeleteIds).toEqual([doomed])

    vm.confirmBulkDelete()
    expect(rows.length).toBe(before - 1)
    expect(rows.some(r => r.id === doomed)).toBe(false)
    w.unmount()
  })
})
