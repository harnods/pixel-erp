/**
 * CRM paywall access gate — useCrmAccess.
 *
 * The /crm router (app/pages/[...slug].vue) swaps in CrmPaywallPage whenever
 * hasCrmAccess is false, and the account-menu switch + the paywall's "Activate
 * CRM" CTA both write through setCrmAccess. This proves the grant's contract:
 * default ON, togglable, and a shared singleton so the router and the menu agree.
 *
 * (The localStorage side-effect is client-only — gated on import.meta.client, as
 * in useLineManagerAccess — so it doesn't run under the node test env; the ref
 * value is what the router reads, so that is what's pinned here.)
 */
import { describe, it, expect } from 'vitest'
import { useCrmAccess } from '~/composables/useCrmAccess'

describe('useCrmAccess', () => {
  it('defaults to ON — CRM ships unlocked so the built workspace is reachable', () => {
    const { hasCrmAccess } = useCrmAccess()
    expect(hasCrmAccess.value).toBe(true)
  })

  it('setCrmAccess(false) locks CRM → the router renders the paywall', () => {
    const { hasCrmAccess, setCrmAccess } = useCrmAccess()
    setCrmAccess(false)
    expect(hasCrmAccess.value).toBe(false)
  })

  it('setCrmAccess(true) — the paywall CTA / menu switch unlocks CRM again', () => {
    const { hasCrmAccess, setCrmAccess } = useCrmAccess()
    setCrmAccess(false)
    setCrmAccess(true)
    expect(hasCrmAccess.value).toBe(true)
  })

  it('is a shared singleton — the router and the account menu read one ref', () => {
    const a = useCrmAccess()
    const b = useCrmAccess()
    a.setCrmAccess(false)
    expect(b.hasCrmAccess.value).toBe(false)
    expect(a.hasCrmAccess).toBe(b.hasCrmAccess)
    a.setCrmAccess(true)
  })

  it('setCrmStatus drives the three paywall faces; only "active" grants access', () => {
    const { crmStatus, hasCrmAccess, setCrmStatus } = useCrmAccess()

    setCrmStatus('expired')
    expect(crmStatus.value).toBe('expired')
    expect(hasCrmAccess.value).toBe(false) // trial-expired → paywall, not the workspace

    setCrmStatus('none')
    expect(hasCrmAccess.value).toBe(false)

    setCrmStatus('active')
    expect(hasCrmAccess.value).toBe(true)
  })

  it('setCrmAccess maps onto the status model (back-compat)', () => {
    const { crmStatus, setCrmAccess } = useCrmAccess()
    setCrmAccess(false)
    expect(crmStatus.value).toBe('none')
    setCrmAccess(true)
    expect(crmStatus.value).toBe('active')
  })
})
