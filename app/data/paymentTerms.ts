/**
 * Settings → Payment terms (prod: /v3/terms). The master list behind every
 * "Payment terms" picker in the app — seeded from the term names the contact,
 * purchase-order and sales-invoice fixtures already use, so the picker values and
 * this list are the same set.
 */
import { reactive } from 'vue'
import { PAYMENT_TERMS_OPTIONS } from './contacts'
import { PAYMENT_TERMS as PO_PAYMENT_TERMS } from './purchaseOrderDetails'

export interface PaymentTerm {
  id: string
  name: string
  /** Days after the invoice date. 0 = due on receipt. */
  days: number
  /** Built-in term — cannot be deleted. */
  system: boolean
  isDefault: boolean
  /** Used by a transaction or contact — cannot be deleted. */
  isUsed: boolean
}

export const PAYMENT_TERM_NAME_MAX_LENGTH = 60

function daysFor(name: string): number {
  const m = /Net (\d+)/i.exec(name)
  return m ? Number(m[1]) : 0
}

// Names already in use across the mock DB, deduped, in first-seen order.
const USED_NAMES = [...new Set<string>([...PAYMENT_TERMS_OPTIONS, ...PO_PAYMENT_TERMS, 'Due on receipt'])]

const SYSTEM_NAMES = new Set(['Net 15', 'Net 30', 'Net 60', 'Cash on delivery', 'Custom'])

const SEED: PaymentTerm[] = [
  ...USED_NAMES.map((name, i) => ({
    id: `term-${i + 1}`,
    name,
    days: daysFor(name),
    system: SYSTEM_NAMES.has(name),
    isDefault: name === 'Net 30',
    isUsed: true,
  })),
  { id: 'term-90', name: 'Net 15', days: 15, system: true, isDefault: false, isUsed: false },
  { id: 'term-91', name: 'Custom', days: 0, system: true, isDefault: false, isUsed: false },
  { id: 'term-92', name: 'Net 90', days: 90, system: false, isDefault: false, isUsed: false },
  { id: 'term-93', name: 'Due end of next month after goods received at warehouse', days: 60, system: false, isDefault: false, isUsed: false },
  { id: 'term-94', name: 'Same day', days: 0, system: false, isDefault: false, isUsed: false },
]

export const paymentTerms = reactive<PaymentTerm[]>(SEED)

let seq = 100
export function addPaymentTerm(name: string, days: number): PaymentTerm {
  const term: PaymentTerm = { id: `term-${++seq}`, name: name.trim(), days, system: false, isDefault: false, isUsed: false }
  paymentTerms.unshift(term)
  return term
}

export function deletePaymentTerms(ids: string[]): void {
  for (const id of ids) {
    const i = paymentTerms.findIndex(t => t.id === id)
    if (i >= 0) paymentTerms.splice(i, 1)
  }
}

export function canDeletePaymentTerm(t: PaymentTerm): boolean {
  return !t.isUsed && !t.isDefault && !t.system
}

export function paymentTermNameTaken(name: string): boolean {
  const n = name.trim().toLowerCase()
  return paymentTerms.some(t => t.name.toLowerCase() === n)
}
