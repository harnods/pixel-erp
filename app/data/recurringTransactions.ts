import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { SIM_SPAN_DAYS, simDay } from './simClock'
import type { RecurringSchedule } from './salesInvoices'
import { recurringSalesInvoices, persistRecurringSalesInvoices } from './salesInvoices'
import { recurringSalesOrders, persistRecurringSalesOrders } from './salesOrders'
import { recurringPurchaseInvoices, persistRecurringPurchaseInvoices } from './purchaseInvoices'
import { recurringPurchaseOrders, persistRecurringPurchaseOrders } from './purchaseOrders'
import { recurringBills, persistRecurringBills } from './bills'

/**
 * Recurring transactions — the cross-module index under "Other lists".
 *
 * Five types already own their own recurring store (sales invoices, sales
 * orders, purchase invoices, purchase orders, expenses) and their own detail
 * page; this module does NOT duplicate them, it reads them. The remaining six
 * cash/journal types have no module of their own, so their templates live here.
 */

export const RECURRING_TXN_TYPES = [
  'Sales invoice',
  'Sales order',
  'Purchase invoice',
  'Purchase order',
  'Expense',
  'Receive money',
  'Bank transfer',
  'Spend money',
  'Journal entry',
  'Receive payment',
  'Purchase payment',
] as const

export type RecurringTxnType = (typeof RECURRING_TXN_TYPES)[number]

/**
 * A template for one of the six types that have no module of their own.
 *
 * `party` is the customer or vendor the money moves to or from — the index
 * shows it in the Name column, same as every module-owned recurring list. Each
 * scenario below is one that genuinely has a counterparty; a party-less entry
 * (own-account sweeps, depreciation) would have nothing to put there.
 */
export interface RecurringOtherTxn {
  id: string
  templateName: string
  type: RecurringTxnType
  party: { id: string; name: string }
  frequency: string
  amount: number
  nextDate: string
  status: 'active' | 'completed'
  createdCount: number
  schedule?: RecurringSchedule
}

const OTHER_TEMPLATES: RecurringOtherTxn[] = [
  {
    id: 'RTXN001', templateName: 'Daily store settlement deposit', type: 'Receive money',
    party: { id: 'C006', name: 'Kopi Kenangan Pusat' },
    frequency: 'Daily', amount: 12_500_000, nextDate: simDay(SIM_SPAN_DAYS + 1), status: 'active', createdCount: 120,
    schedule: { repeatInterval: 1, repeatUnit: 'day', endRepeat: 'never', startDate: simDay(-150), sendAutoEmail: false },
  },
  {
    id: 'RTXN002', templateName: 'Weekly consignment deposit', type: 'Receive money',
    party: { id: 'C003', name: 'Hotel Mulia Senayan' },
    frequency: 'Weekly', amount: 35_000_000, nextDate: simDay(SIM_SPAN_DAYS + 4), status: 'active', createdCount: 26,
    schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-182), sendAutoEmail: false },
  },
  {
    id: 'RTXN003', templateName: 'Monthly service fee transfer', type: 'Bank transfer',
    party: { id: 'V011', name: 'PT Konsultan Prima' },
    frequency: 'Monthly', amount: 42_000_000, nextDate: simDay(SIM_SPAN_DAYS + 6), status: 'active', createdCount: 12,
    schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'never', startDate: simDay(-365), sendAutoEmail: true },
  },
  {
    id: 'RTXN004', templateName: 'Bi-weekly logistics settlement', type: 'Bank transfer',
    party: { id: 'V010', name: 'PT Catering Nusantara' },
    frequency: 'Bi-weekly', amount: 5_000_000, nextDate: simDay(SIM_SPAN_DAYS + 2), status: 'active', createdCount: 24,
    schedule: { repeatInterval: 2, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-336), sendAutoEmail: false },
  },
  {
    id: 'RTXN005', templateName: 'Weekly cash advance withdrawal', type: 'Spend money',
    party: { id: 'V007', name: 'Toko ATK Sinar Jaya' },
    frequency: 'Weekly', amount: 5_000_000, nextDate: simDay(SIM_SPAN_DAYS + 3), status: 'active', createdCount: 30,
    schedule: { repeatInterval: 1, repeatUnit: 'week', endRepeat: 'never', startDate: simDay(-210), sendAutoEmail: false },
  },
  {
    id: 'RTXN006', templateName: 'Monthly caretaker payout', type: 'Spend money',
    party: { id: 'V006', name: 'CV Bersih Sejahtera' },
    frequency: 'Monthly', amount: 18_000_000, nextDate: simDay(SIM_SPAN_DAYS + 9), status: 'completed', createdCount: 12,
    schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 12, startDate: simDay(-365), sendAutoEmail: false },
  },
  {
    id: 'RTXN007', templateName: 'Monthly rebate accrual', type: 'Journal entry',
    party: { id: 'C002', name: 'Tanamera Coffee Roastery' },
    frequency: 'Monthly', amount: 27_400_000, nextDate: simDay(SIM_SPAN_DAYS + 7), status: 'active', createdCount: 18,
    schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'never', startDate: simDay(-547), sendAutoEmail: false },
  },
  {
    id: 'RTXN008', templateName: 'Monthly rent accrual', type: 'Journal entry',
    party: { id: 'V005', name: 'PT Graha Perkantoran Sudirman' },
    frequency: 'Monthly', amount: 4_200_000, nextDate: simDay(SIM_SPAN_DAYS + 11), status: 'active', createdCount: 8,
    schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'on', endOnDate: simDay(365), startDate: simDay(-240), sendAutoEmail: false },
  },
  {
    id: 'RTXN009', templateName: 'Monthly retainer collection', type: 'Receive payment',
    party: { id: 'C001', name: 'Anomali Coffee' },
    frequency: 'Monthly', amount: 12_000_000, nextDate: simDay(SIM_SPAN_DAYS + 5), status: 'active', createdCount: 9,
    schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'never', startDate: simDay(-270), sendAutoEmail: true },
  },
  {
    id: 'RTXN010', templateName: 'Monthly subscription collection', type: 'Receive payment',
    party: { id: 'C008', name: 'Titik Temu Coffee' },
    frequency: 'Monthly', amount: 23_750_000, nextDate: simDay(SIM_SPAN_DAYS + 14), status: 'active', createdCount: 4,
    schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 24, startDate: simDay(-120), sendAutoEmail: true },
  },
  {
    id: 'RTXN011', templateName: 'Quarterly retainer payment', type: 'Purchase payment',
    party: { id: 'V011', name: 'PT Konsultan Prima' },
    frequency: 'Quarterly', amount: 11_000_000, nextDate: simDay(SIM_SPAN_DAYS + 30), status: 'active', createdCount: 3,
    schedule: { repeatInterval: 3, repeatUnit: 'month', endRepeat: 'never', startDate: simDay(-270), sendAutoEmail: false },
  },
  {
    id: 'RTXN012', templateName: 'Monthly office rent payment', type: 'Purchase payment',
    party: { id: 'V005', name: 'PT Graha Perkantoran Sudirman' },
    frequency: 'Monthly', amount: 28_000_000, nextDate: simDay(SIM_SPAN_DAYS + 1), status: 'active', createdCount: 7,
    schedule: { repeatInterval: 1, repeatUnit: 'month', endRepeat: 'after', endAfterCount: 12, startDate: simDay(-210), sendAutoEmail: true },
  },
]

const K_RTXN = 'recurring-other-transactions-v1'

export const recurringOtherTransactions = reactive<RecurringOtherTxn[]>(
  loadSnapshot<RecurringOtherTxn>(K_RTXN) ?? [...OTHER_TEMPLATES],
)
export function persistRecurringOtherTransactions(): void {
  saveSnapshot(K_RTXN, recurringOtherTransactions)
}

let otherSeq = 0
/** Create a template for one of the six module-less types (e.g. the Receive money form). */
export function addRecurringOtherTransaction(input: Omit<RecurringOtherTxn, 'id'>): RecurringOtherTxn {
  const txn: RecurringOtherTxn = { ...input, id: `RTXN-NEW-${++otherSeq}-${Date.now()}` }
  recurringOtherTransactions.unshift(txn)
  persistRecurringOtherTransactions()
  return txn
}

/**
 * A human frequency label from the schedule, matching the seeded wording so the
 * index's Frequency column reads the same for created and seeded templates.
 */
export function frequencyLabel(interval: number, unit: 'day' | 'week' | 'month' | 'year'): string {
  if (interval === 1) {
    return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[unit]
  }
  if (interval === 2 && unit === 'week') return 'Bi-weekly'
  if (interval === 3 && unit === 'month') return 'Quarterly'
  if (interval === 6 && unit === 'month') return 'Semi-annually'
  return `Every ${interval} ${unit}s`
}

/**
 * One row of the cross-module index.
 *
 * `name` is the counterparty — customer, vendor or beneficiary depending on the
 * type — matching what every module-owned recurring list shows. `to` is
 * undefined for the types that have no detail page of their own.
 */
export interface RecurringTxnRow {
  id: string
  name: string
  templateName: string
  type: RecurringTxnType
  frequency: string
  amount: number
  nextDate: string
  status: 'active' | 'completed'
  createdCount: number
  schedule?: RecurringSchedule
  to?: string
}

/** Every recurring template across all 11 transaction types, newest module first. */
export function allRecurringTransactions(): RecurringTxnRow[] {
  const rows: RecurringTxnRow[] = []

  for (const r of recurringSalesInvoices) {
    rows.push({ ...base(r, r.customer.name), type: 'Sales invoice', to: `/sales-invoices/recurring/${r.id}` })
  }
  for (const r of recurringSalesOrders) {
    rows.push({ ...base(r, r.customer.name), type: 'Sales order', to: `/sales-orders/recurring/${r.id}` })
  }
  for (const r of recurringPurchaseInvoices) {
    rows.push({ ...base(r, r.vendor.name), type: 'Purchase invoice', to: `/purchase-invoices/recurring/${r.id}` })
  }
  for (const r of recurringPurchaseOrders) {
    rows.push({ ...base(r, r.vendor.name), type: 'Purchase order', to: `/purchase-orders/recurring/${r.id}` })
  }
  for (const r of recurringBills) {
    rows.push({ ...base(r, r.beneficiary.name), type: 'Expense', to: `/expenses/recurring/${r.id}` })
  }
  for (const r of recurringOtherTransactions) {
    rows.push({ ...base(r, r.party.name), type: r.type })
  }

  return rows
}

/**
 * Delete one template from whichever store owns it, and persist that store.
 * Returns false when the id is no longer there (already deleted elsewhere).
 */
export function deleteRecurringTransaction(type: RecurringTxnType, id: string): boolean {
  const store = storeFor(type)
  const idx = store.list.findIndex((r: { id: string }) => r.id === id)
  if (idx === -1) return false
  store.list.splice(idx, 1)
  store.persist()
  return true
}

function storeFor(type: RecurringTxnType): { list: { id: string }[]; persist: () => void } {
  switch (type) {
    case 'Sales invoice':    return { list: recurringSalesInvoices, persist: persistRecurringSalesInvoices }
    case 'Sales order':      return { list: recurringSalesOrders, persist: persistRecurringSalesOrders }
    case 'Purchase invoice': return { list: recurringPurchaseInvoices, persist: persistRecurringPurchaseInvoices }
    case 'Purchase order':   return { list: recurringPurchaseOrders, persist: persistRecurringPurchaseOrders }
    case 'Expense':          return { list: recurringBills, persist: persistRecurringBills }
    default:                 return { list: recurringOtherTransactions, persist: persistRecurringOtherTransactions }
  }
}

type TemplateLike = {
  id: string
  templateName: string
  frequency: string
  amount: number
  nextDate: string
  status: 'active' | 'completed'
  createdCount: number
  schedule?: RecurringSchedule
}

function base(r: TemplateLike, partyName: string): Omit<RecurringTxnRow, 'type'> {
  return {
    id: r.id,
    name: partyName,
    templateName: r.templateName,
    frequency: r.frequency,
    amount: r.amount,
    nextDate: r.nextDate,
    status: r.status,
    createdCount: r.createdCount,
    schedule: r.schedule,
  }
}
