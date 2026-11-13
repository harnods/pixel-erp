import { describe, it, expect, beforeEach } from 'vitest'
import { resetBudget, setBudgetViewAs, actingPerson } from '../app/data/budgetStore'
import { purchaseRequests } from '../app/data/purchaseRequests'
import { canViewPurchaseRequest, isPurchaseRequestSelfOnly, purchaseRequestCreator } from '../app/data/purchaseRequestAccess'

// Sales 12 Nov: an outlet user only sees the purchase requests they created (list + detail).
describe('purchase requests: self-only for the restricted outlet persona', () => {
  beforeEach(() => { resetBudget(); setBudgetViewAs('Budget Controller') })

  it('unrestricted personas see every request', () => {
    expect(isPurchaseRequestSelfOnly()).toBe(false)
    expect(purchaseRequests.filter(canViewPurchaseRequest).length).toBe(purchaseRequests.length)
  })

  it('the Requester sees only their own requests (at least 2), and not other users\'', () => {
    setBudgetViewAs('Requester')
    expect(isPurchaseRequestSelfOnly()).toBe(true)
    const me = actingPerson()
    const visible = purchaseRequests.filter(canViewPurchaseRequest)
    expect(visible.length).toBeGreaterThanOrEqual(2)
    expect(visible.every((pr) => purchaseRequestCreator(pr) === me)).toBe(true)
    const other = purchaseRequests.find((pr) => purchaseRequestCreator(pr) !== me)!
    expect(other).toBeTruthy()
    expect(canViewPurchaseRequest(other)).toBe(false) // detail by URL → no-access state
  })
})
