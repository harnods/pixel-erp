// @vitest-environment happy-dom
/**
 * New recurring receive money — the Receive money branch of the Recurring
 * transactions type picker.
 *
 * What's pinned: the form saves a template that the cross-module index can
 * actually show. The index's Name column is the counterparty, so the payer must
 * land in `party` — the easy regression here is saving the account or the
 * message there instead. Totals follow the expense form's inclusive/exclusive
 * PPN rule, which is the other thing a refactor can quietly invert.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import {
  allRecurringTransactions, recurringOtherTransactions, frequencyLabel,
} from '~/data/recurringTransactions'

beforeAll(() => {
  Object.assign(globalThis, {
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
    useRoute: () => ({ path: '/recurring-transactions/new/receive-money', params: {}, query: {}, hash: '' }),
    useHead: () => {},
    definePageMeta: () => {},
    navigateTo: () => {},
    useState: (_k: string, f: () => unknown) => ref(f?.()),
  })
  class FakeObserver { observe() {} unobserve() {} disconnect() {} }
  Object.assign(globalThis, { ResizeObserver: FakeObserver })
})

beforeEach(() => { localStorage.clear() })

type Vm = {
  depositToId: string
  payerId: string
  rows: { id: number; accountId: string; taxId: string; amount: string; revealed: boolean; accountError: boolean; amountError: boolean }[]
  priceIncludesTax: boolean
  message: string
  subtotal: number
  ppnAmount: number
  total: number
  onAccountSelect: (r: Vm['rows'][number]) => void
  handleSave: () => void
}

async function mountForm() {
  const Page = (await import('~/components/pages/NewRecurringReceiveMoneyPage.vue')).default
  const w = mount(Page, { global: { stubs: { Teleport: true } } })
  return { w, vm: w.vm as unknown as Vm }
}

describe('frequencyLabel()', () => {
  it('matches the wording the seeded templates use', () => {
    expect(frequencyLabel(1, 'day')).toBe('Daily')
    expect(frequencyLabel(1, 'week')).toBe('Weekly')
    expect(frequencyLabel(1, 'month')).toBe('Monthly')
    expect(frequencyLabel(2, 'week')).toBe('Bi-weekly')
    expect(frequencyLabel(3, 'month')).toBe('Quarterly')
  })
})

describe('NewRecurringReceiveMoneyPage', () => {
  it('adds a trailing blank row once an account is picked, and never drops the last row', async () => {
    const { w, vm } = await mountForm()
    expect(vm.rows.length).toBe(1)

    vm.rows[0]!.accountId = 'CA002'
    vm.onAccountSelect(vm.rows[0]!)
    expect(vm.rows.length).toBe(2)
    expect(vm.rows[0]!.revealed).toBe(true)
    w.unmount()
  })

  it('adds PPN on top, and extracts it when prices include tax', async () => {
    const { w, vm } = await mountForm()
    vm.rows[0]!.accountId = 'CA002'
    vm.rows[0]!.taxId = 'ppn11'
    vm.rows[0]!.amount = '1000000'
    await w.vm.$nextTick()

    expect(vm.subtotal).toBe(1_000_000)
    expect(vm.ppnAmount).toBe(110_000)
    expect(vm.total).toBe(1_110_000)

    vm.priceIncludesTax = true
    await w.vm.$nextTick()
    // Gross stays what was typed; the tax is carved out of it.
    expect(vm.total).toBe(1_000_000)
    expect(vm.ppnAmount).toBe(Math.round(1_000_000 * 11 / 111))
    expect(vm.subtotal).toBe(1_000_000 - vm.ppnAmount)
    w.unmount()
  })

  it('saves a Receive money template whose party is the payer, so the index can name it', async () => {
    const before = recurringOtherTransactions.length
    const { w, vm } = await mountForm()

    vm.depositToId = 'CA005'
    vm.payerId = 'C001'
    vm.rows[0]!.accountId = 'CA002'
    vm.rows[0]!.amount = '250000'
    vm.message = 'Monthly retainer'
    await w.vm.$nextTick()

    vm.handleSave()

    expect(recurringOtherTransactions.length).toBe(before + 1)
    const created = recurringOtherTransactions[0]!
    expect(created.type).toBe('Receive money')
    expect(created.party.name).toBe('Anomali Coffee')
    expect(created.amount).toBe(250_000)
    expect(created.frequency).toBe('Monthly')
    expect(created.status).toBe('active')

    // It shows up in the cross-module index with the payer as Name.
    const row = allRecurringTransactions().find(r => r.id === created.id)!
    expect(row.name).toBe('Anomali Coffee')
    expect(row.type).toBe('Receive money')

    recurringOtherTransactions.splice(0, 1)
    w.unmount()
  })

  it('refuses to save without a deposit account', async () => {
    const before = recurringOtherTransactions.length
    const { w, vm } = await mountForm()

    vm.rows[0]!.accountId = 'CA002'
    vm.rows[0]!.amount = '250000'
    vm.handleSave()

    expect(recurringOtherTransactions.length).toBe(before)
    w.unmount()
  })
})
