/**
 * Settings → Payment methods (prod: /v3/payment_methods). The master list behind
 * the "Payment method" field on receive/send payment — seeded from the methods the
 * sales-invoice payment fixtures already use.
 */
import { reactive } from 'vue'
import { PAYMENT_METHODS } from './salesInvoiceDetails'

export interface PaymentMethod {
  id: string
  name: string
  updatedAt: string
  updatedBy: string
  /** Used by a payment — cannot be edited or deleted. */
  isUsed: boolean
  /** Linked to a cash account (built-in Cash) — cannot be edited or deleted. */
  isCashLink: boolean
}

export const PAYMENT_METHOD_NAME_MAX_LENGTH = 60

const SEED: PaymentMethod[] = [
  ...PAYMENT_METHODS.map((name, i) => ({
    id: `pm-${i + 1}`,
    name,
    updatedAt: `2026-0${3 + i}-1${i}T09:${10 + i * 7}:00`,
    updatedBy: 'Rizal Candra',
    isUsed: true,
    isCashLink: name === 'Cash',
  })),
  { id: 'pm-10', name: 'Credit card', updatedAt: '2026-07-22T14:05:00', updatedBy: 'Evelyn Bellinda', isUsed: false, isCashLink: false },
  { id: 'pm-11', name: 'QRIS', updatedAt: '2026-08-04T10:30:00', updatedBy: 'Evelyn Bellinda', isUsed: false, isCashLink: false },
  { id: 'pm-12', name: 'Cheque', updatedAt: '2026-08-19T16:45:00', updatedBy: 'Cinta Ayu', isUsed: false, isCashLink: false },
  { id: 'pm-13', name: 'Bank transfer via BCA Virtual Account for wholesale customers', updatedAt: '2026-09-01T08:15:00', updatedBy: 'Jessie Tan', isUsed: false, isCashLink: false },
]

export const paymentMethods = reactive<PaymentMethod[]>(SEED)

let seq = 100
function nowIso(): string { return new Date().toISOString().slice(0, 19) }

export function addPaymentMethod(name: string): PaymentMethod {
  const m: PaymentMethod = { id: `pm-${++seq}`, name: name.trim(), updatedAt: nowIso(), updatedBy: 'Rizal Candra', isUsed: false, isCashLink: false }
  paymentMethods.unshift(m)
  return m
}

export function renamePaymentMethod(id: string, name: string): void {
  const m = paymentMethods.find(x => x.id === id)
  if (!m) return
  m.name = name.trim()
  m.updatedAt = nowIso()
  m.updatedBy = 'Rizal Candra'
}

export function deletePaymentMethods(ids: string[]): void {
  for (const id of ids) {
    const i = paymentMethods.findIndex(m => m.id === id)
    if (i >= 0) paymentMethods.splice(i, 1)
  }
}

export function canChangePaymentMethod(m: PaymentMethod): boolean {
  return !m.isUsed && !m.isCashLink
}

export function paymentMethodNameTaken(name: string, excludeId?: string): boolean {
  const n = name.trim().toLowerCase()
  return paymentMethods.some(m => m.id !== excludeId && m.name.toLowerCase() === n)
}
