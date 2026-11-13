/**
 * Self-only purchase requests for restricted (outlet) users.
 *
 * Production parity: the per-role setting "Restrict access to view purchases
 * created by other users" (role flag `restricted_purchasing`) makes the
 * purchase lists self-only. Target behaviour here: list AND detail are
 * self-only; ops / HQ roles see every request.
 *
 * There is no sign-in in the prototype, so the header "View as" switch
 * (budgetStore `budget.viewAs`) decides who is acting. The `Requester` persona
 * stands in for the restricted outlet user; every other persona is unrestricted.
 */
import { budget, actingPerson, prForPurchaseRequest } from './budgetStore'
import type { BudgetRole } from './budgetMaster'
import type { PurchaseRequest } from './types'

/** Personas whose role has "Restrict access to view purchases created by other users" on. */
export const SELF_ONLY_PURCHASE_ROLES: ReadonlySet<BudgetRole> = new Set<BudgetRole>(['Requester'])

/** True when the acting persona only sees the purchase requests they created. */
export function isPurchaseRequestSelfOnly(): boolean {
  return SELF_ONLY_PURCHASE_ROLES.has(budget.viewAs)
}

/**
 * Who created a request. A budget-linked request records the acting person at
 * creation (`requester`); otherwise the "who raised it" field on the record.
 */
export function purchaseRequestCreator(pr: Pick<PurchaseRequest, 'id' | 'procurementStaff'>): string {
  return prForPurchaseRequest(pr.id)?.requester ?? pr.procurementStaff
}

/** Whether the acting persona may see this request (list row or detail page). */
export function canViewPurchaseRequest(pr: Pick<PurchaseRequest, 'id' | 'procurementStaff'>): boolean {
  return !isPurchaseRequestSelfOnly() || purchaseRequestCreator(pr) === actingPerson()
}
