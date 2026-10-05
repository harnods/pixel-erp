/**
 * Advanced Budgeting: what the Commitments page and the purchase order and
 * purchase invoice screens read from the budget store. Every figure comes from
 * the ledger in budgetStore.ts; this file only maps records and options.
 */
import {
  budget, prForPurchaseRequest, poById, lineById, lineTitle, BUDGET_TODAY,
  type BudgetPR, type BudgetPO,
} from './budgetStore'
import { BUDGET_ACCOUNTS, BUDGET_DEPARTMENTS, BUDGET_PROJECTS } from './budgetMaster'

/** "05/10/2026" — the house short date. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
export const BUDGET_AS_OF = shortDate(BUDGET_TODAY)

/** The budget record behind a Purchases request, when it has one. */
export function budgetRequestFor(purchaseRequestId: string): BudgetPR | undefined {
  return prForPurchaseRequest(purchaseRequestId)
}

/** The budget PO behind a Purchases purchase order record, when it has one. */
export function budgetPOForRecord(purchaseOrderId: string): BudgetPO | undefined {
  return budget.pos.find((p) => p.purchaseOrderId === purchaseOrderId)
}

/** Budget line label for a line id ("Networking × Project A × Accommodation"). */
export function budgetLineLabel(lineId: string | null): string {
  const l = lineById(lineId)
  return l ? lineTitle(l) : 'No budget line'
}

/** Open budget POs a purchase invoice can bill against. */
export function billablePOOptions(): { value: string; label: string }[] {
  return budget.pos.filter((p) => p.status === 'Open').map((p) => ({ value: p.id, label: `${p.number} · ${p.vendor}` }))
}
export function poLineOptions(poId: string): { value: string; label: string }[] {
  const po = poById(poId)
  return po ? po.lines.map((l, i) => ({ value: String(i), label: `${i + 1}. ${l.description}` })) : []
}

export const DEPARTMENT_OPTIONS = BUDGET_DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))
export const PROJECT_OPTIONS = [{ value: '', label: '(no project)' }, ...BUDGET_PROJECTS.map((p) => ({ value: p.id, label: p.name }))]
export const ACCOUNT_OPTIONS = BUDGET_ACCOUNTS.filter((a) => !a.savingOnly).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` }))
