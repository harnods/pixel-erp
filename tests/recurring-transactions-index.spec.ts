// @vitest-environment happy-dom
/**
 * Other lists > Recurring transactions — the cross-module index.
 *
 * What's pinned here is the aggregation contract, because it is the part a
 * refactor can silently break: the page must surface templates from ALL 11
 * transaction types, link each row back to its own module's recurring detail
 * page where one exists, and filter by transaction type independently of the
 * status filter (the two dropdowns are backed by different refs).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useTableState } from '~/composables/useTableState'
import {
  allRecurringTransactions, deleteRecurringTransaction, RECURRING_TXN_TYPES,
} from '~/data/recurringTransactions'

beforeAll(() => {
  Object.assign(globalThis, {
    useTableState,
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
    useRoute: () => ({ path: '/recurring-transactions', params: {}, query: {}, hash: '' }),
    useHead: () => {},
    definePageMeta: () => {},
    navigateTo: () => {},
    useState: (_k: string, f: () => unknown) => ref(f?.()),
  })
})

beforeEach(() => { localStorage.clear() })

type Row = { id: string; name: string; templateName: string; type: string; to?: string; status: string; endRepeat: string }

async function mountIndex() {
  const Page = (await import('~/components/pages/RecurringTransactionsPage.vue')).default
  const w = mount(Page, { global: { stubs: { Teleport: true } } })
  return { w, vm: w.vm as unknown as { rows: Row[]; typeFilter: string; paginated: Row[] } }
}

describe('allRecurringTransactions()', () => {
  it('covers every one of the 11 transaction types', () => {
    const present = new Set(allRecurringTransactions().map(r => r.type))
    for (const type of RECURRING_TXN_TYPES) {
      expect(present, `missing type: ${type}`).toContain(type)
    }
  })

  it('links the five module-owned types to their own recurring detail page', () => {
    const rows = allRecurringTransactions()
    const expected: Record<string, string> = {
      'Sales invoice': '/sales-invoices/recurring/',
      'Sales order': '/sales-orders/recurring/',
      'Purchase invoice': '/purchase-invoices/recurring/',
      'Purchase order': '/purchase-orders/recurring/',
      'Expense': '/expenses/recurring/',
    }
    for (const [type, prefix] of Object.entries(expected)) {
      const row = rows.find(r => r.type === type)!
      expect(row, `no row for ${type}`).toBeTruthy()
      expect(row.to).toBe(`${prefix}${row.id}`)
    }
  })

  it('shows the counterparty as Name, never the template name', async () => {
    const si = (await import('~/data/salesInvoices')).recurringSalesInvoices
    const bills = (await import('~/data/bills')).recurringBills
    const rows = allRecurringTransactions()

    const siRow = rows.find(r => r.type === 'Sales invoice' && r.id === si[0]!.id)!
    expect(siRow.name).toBe(si[0]!.customer.name)

    const billRow = rows.find(r => r.type === 'Expense' && r.id === bills[0]!.id)!
    expect(billRow.name).toBe(bills[0]!.beneficiary.name)

    // Every row's Name is a real party, and none falls back to the template name.
    for (const r of rows) {
      expect(r.name.length).toBeGreaterThan(0)
      expect(r.name).not.toBe(r.templateName)
    }
  })

  it('deletes a template from whichever store owns it', async () => {
    const store = (await import('~/data/recurringTransactions')).recurringOtherTransactions
    const before = allRecurringTransactions()
    const target = before.find(r => r.type === 'Journal entry')!
    const idx = store.findIndex(r => r.id === target.id)
    const snapshot = store[idx]!

    expect(deleteRecurringTransaction(target.type, target.id)).toBe(true)

    const after = allRecurringTransactions()
    expect(after.length).toBe(before.length - 1)
    expect(after.some(r => r.type === 'Journal entry' && r.id === target.id)).toBe(false)
    // Deleting again is a no-op rather than a crash.
    expect(deleteRecurringTransaction(target.type, target.id)).toBe(false)

    // The stores are module singletons — put it back so later cases see full data.
    store.splice(idx, 0, snapshot)
    expect(allRecurringTransactions().length).toBe(before.length)
  })

  it('leaves the six types with no module unlinked', () => {
    const unlinked = ['Receive money', 'Internal transfer', 'Spend money', 'Journal entry', 'Receive payment', 'Purchase payment']
    for (const type of unlinked) {
      const row = allRecurringTransactions().find(r => r.type === type)!
      expect(row, `no row for ${type}`).toBeTruthy()
      expect(row.to).toBeUndefined()
    }
  })
})

describe('RecurringTransactionsPage', () => {
  it('renders a row per template with an End repeat summary', async () => {
    const { w, vm } = await mountIndex()
    expect(vm.rows.length).toBe(allRecurringTransactions().length)
    // Every row gets a human End repeat string, never a raw enum.
    for (const r of vm.rows) {
      expect(r.endRepeat).not.toMatch(/^(never|after|on)$/)
      expect(r.endRepeat.length).toBeGreaterThan(0)
    }
    w.unmount()
  })

  it('bulk-deletes a selection that spans several stores', async () => {
    // The stores are module singletons shared with every other case here, so
    // snapshot them and put the contents back once the assertions are done.
    const stores = [
      (await import('~/data/salesInvoices')).recurringSalesInvoices,
      (await import('~/data/salesOrders')).recurringSalesOrders,
      (await import('~/data/purchaseInvoices')).recurringPurchaseInvoices,
      (await import('~/data/purchaseOrders')).recurringPurchaseOrders,
      (await import('~/data/bills')).recurringBills,
      (await import('~/data/recurringTransactions')).recurringOtherTransactions,
    ] as unknown as { splice: (...a: unknown[]) => unknown; length: number }[]
    const snapshots = stores.map(s => [...(s as unknown as unknown[])])

    const { w, vm } = await mountIndex()
    const bulk = w.vm as unknown as {
      openBulkDelete: (s: Set<number>, d: () => void) => void
      confirmBulkDelete: () => void
      bulkDeleteRows: Row[]
    }

    const before = vm.rows.length
    // Page 1 is sales invoices; pick two rows plus one of another type so the
    // delete has to route to more than one store.
    const otherIdx = vm.paginated.findIndex(r => r.type !== vm.paginated[0]!.type)
    expect(otherIdx).toBeGreaterThan(-1)

    const picked = new Set([0, 1, otherIdx])
    let deselected = false
    bulk.openBulkDelete(picked, () => { deselected = true })
    expect(bulk.bulkDeleteRows.length).toBe(3)
    const types = new Set(bulk.bulkDeleteRows.map(r => r.type))
    expect(types.size).toBeGreaterThan(1)

    bulk.confirmBulkDelete()
    await w.vm.$nextTick()

    expect(vm.rows.length).toBe(before - 3)
    expect(deselected).toBe(true)
    w.unmount()

    stores.forEach((s, i) => { s.splice(0, s.length, ...snapshots[i]!) })
    expect(allRecurringTransactions().length).toBe(before)
  })

  it('filters by transaction type independently of status', async () => {
    const { w, vm } = await mountIndex()
    const all = vm.rows.length

    vm.typeFilter = 'Journal entry'
    await w.vm.$nextTick()

    expect(vm.paginated.length).toBeGreaterThan(0)
    expect(vm.paginated.length).toBeLessThan(all)
    expect(vm.paginated.every(r => r.type === 'Journal entry')).toBe(true)
    w.unmount()
  })
})
