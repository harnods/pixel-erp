/**
 * Settings › Users & roles — CRM access & CRM seats (PRD "1-Pager: [Support]
 * Users & Roles – CRM Access and CRM User Seats in ERP").
 *
 * The seat maths lives in pure helpers (app/data/crmSubscription.ts), so these
 * tests drive them with explicit users + Billing snapshots — no module state:
 *  - the PRD §3b worked example (CRM Essential + 2 Basic + 1 Administrator),
 *  - the switch rules and order independence (US-003),
 *  - Owner counted once / CRM-only users outside the ERP count (US-004, US-010),
 *  - trial, over quota, Billing down and the no-CRM regression (US-012, US-006,
 *    US-008, US-010 AC-07).
 */
import { describe, expect, it } from 'vitest'
import {
  checkCrmChange, checkErpChange, crmAccessMode, crmCapacity, crmSeatSummary, crmUsage,
  defaultCrmSubscriptionState, effectiveCrmSnapshot, erpSeatSummary, erpUsage, seatUsageView, usesErpSeat,
  crmSeatBreakdown, formatCrmSeatBreakdown, formatCrmCapacityLine, formatCrmUpToLine, formatCrmUsageLine,
  crmOptionNote, crmRoleLabel,
  type CrmBillingSnapshot, type CrmRole, type CrmSubscriptionState, type SeatHolder,
} from '~/data/crmSubscription'
import {
  AUTHORITY_CATEGORIES, AUTHORITY_FEATURES, SYSTEM_ROLES, accountUsers, userRoleTypes,
} from '~/data/usersRoles'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const owner: SeatHolder = { isOwner: true, systemRoleIds: [], customRoleIds: [], crmRole: null }
const crmUser = (role: CrmRole, erp: string[] = ['sales']): SeatHolder =>
  ({ isOwner: false, systemRoleIds: erp, customRoleIds: [], crmRole: role })
const erpOnly = (roles = ['accountant']): SeatHolder =>
  ({ isOwner: false, systemRoleIds: roles, customRoleIds: [], crmRole: null })
const times = <T>(n: number, f: () => T): T[] => Array.from({ length: n }, f)

const essential = (basicAddons: number, adminAddons: number): CrmBillingSnapshot =>
  ({ package: 'essential', includedSeats: 5, basicAddons, adminAddons, trialSeats: null })

function state(patch: Partial<CrmSubscriptionState> = {}, snap: Partial<CrmBillingSnapshot> = {}): CrmSubscriptionState {
  const base = defaultCrmSubscriptionState()
  return { ...base, ...patch, snapshot: { ...base.snapshot, ...snap } }
}

/** Give `role` to a NEW user against the current users (what Invite does). */
function giveNew(users: SeatHolder[], snap: CrmBillingSnapshot, role: CrmRole) {
  return checkCrmChange(null, role, crmUsage(users), crmCapacity(snap), 'active')
}

// ─── PRD §3b worked example ─────────────────────────────────────────────────

describe('PRD §3b — CRM Essential + 2 Basic add-ons + 1 Administrator add-on', () => {
  const snap = essential(2, 1)
  const cap = crmCapacity(snap)

  it('has 8 seats in total, 6 of them Administrator-capable', () => {
    expect(cap).toEqual({ total: 8, adminCapable: 6 })
  })

  it('Owner only → 1/8 total, 1/6 Administrator; 7 left, up to 5 Administrator', () => {
    const usage = crmUsage([owner])
    expect(usage).toEqual({ total: 1, admin: 1 })
    const sum = crmSeatSummary(usage, cap)
    expect(sum.left).toBe(7)
    expect(sum.adminLeft).toBe(5)
  })

  it('+5 CRM Basic → 6/8 total, 1/6 Administrator; 2 left, both can be Administrator', () => {
    const users = [owner, ...times(5, () => crmUser('basic'))]
    expect(crmUsage(users)).toEqual({ total: 6, admin: 1 })
    const sum = crmSeatSummary(crmUsage(users), cap)
    expect(sum).toMatchObject({ total: 8, used: 6, left: 2, adminLeft: 2 })
  })

  it('+2 CRM Administrators → 8/8 total, 3/6 Administrator; full', () => {
    const users = [owner, ...times(5, () => crmUser('basic')), crmUser('admin'), crmUser('admin')]
    expect(crmUsage(users)).toEqual({ total: 8, admin: 3 })
    expect(crmSeatSummary(crmUsage(users), cap)).toMatchObject({ left: 0, adminLeft: 0, overTotal: 0 })
    expect(giveNew(users, snap, 'basic')).toBe('crm-full')
    expect(giveNew(users, snap, 'admin')).toBe('crm-full')
  })

  it('alternative: Owner + 5 Administrators → 6/8 and 6/6; 2 seats left, Basic only (US-003 AC-07)', () => {
    const users = [owner, ...times(5, () => crmUser('admin'))]
    expect(crmUsage(users)).toEqual({ total: 6, admin: 6 })
    const sum = crmSeatSummary(crmUsage(users), cap)
    expect(sum).toMatchObject({ used: 6, left: 2, adminLeft: 0 })
    expect(giveNew(users, snap, 'admin')).toBe('crm-admin-full')
    expect(giveNew(users, snap, 'basic')).toBeNull()
  })
})

// ─── Switch rules (US-003 AC-04/05/08/09) ───────────────────────────────────

describe('switching and removing CRM roles', () => {
  const snap = essential(2, 1)
  const cap = crmCapacity(snap)
  const fullAdmins = [owner, ...times(5, () => crmUser('admin'))] // 6/8, 6/6

  it('Basic → Administrator runs only the Administrator check (total unchanged)', () => {
    // Total is FULL (8/8) but Administrator has room → allowed.
    const totalFull = [owner, ...times(6, () => crmUser('basic')), crmUser('admin')] // 8/8, 2/6
    expect(checkCrmChange('basic', 'admin', crmUsage(totalFull), cap, 'active')).toBeNull()
    // Administrator full → blocked even though the total has room.
    const withBasic = [...fullAdmins, crmUser('basic')] // 7/8, 6/6
    expect(checkCrmChange('basic', 'admin', crmUsage(withBasic), cap, 'active')).toBe('crm-admin-full')
  })

  it('Administrator → Basic and removing CRM are always allowed, even when full', () => {
    const full = [owner, ...times(7, () => crmUser('admin'))] // 8/8, 8/6 (over Administrator)
    expect(checkCrmChange('admin', 'basic', crmUsage(full), cap, 'active')).toBeNull()
    expect(checkCrmChange('admin', null, crmUsage(full), cap, 'active')).toBeNull()
    expect(checkCrmChange('basic', null, crmUsage(full), cap, 'active')).toBeNull()
  })

  it('an unchanged CRM role never uses another seat (editing other roles is free)', () => {
    const full = [owner, ...times(7, () => crmUser('basic'))]
    expect(checkCrmChange('basic', 'basic', crmUsage(full), cap, 'active')).toBeNull()
    expect(checkCrmChange(null, null, crmUsage(full), cap, 'active')).toBeNull()
  })

  it('an Administrator seat can be given as CRM Basic (US-003 AC-04)', () => {
    // 5 included + 0 Basic + 1 Administrator add-on; Owner + 4 Basic → only the
    // Administrator add-on seat is left, and a Basic user may take it.
    const snap2 = essential(0, 1)
    const users = [owner, ...times(4, () => crmUser('basic'))]
    expect(giveNew(users, snap2, 'basic')).toBeNull()
  })
})

describe('order independence (US-003 AC-10)', () => {
  it('the same users give the same result whatever order they were added in', () => {
    const snap = essential(2, 1)
    const people = [owner, crmUser('basic'), crmUser('admin'), crmUser('basic'), crmUser('admin'), crmUser('basic')]
    const shuffled = [people[4]!, people[1]!, people[0]!, people[5]!, people[2]!, people[3]!]
    expect(crmUsage(shuffled)).toEqual(crmUsage(people))
    for (const role of ['basic', 'admin'] as const) {
      expect(giveNew(shuffled, snap, role)).toBe(giveNew(people, snap, role))
    }
  })
})

// ─── Owner, ERP vs CRM seats (US-004, US-010) ───────────────────────────────

describe('the Owner holds one included seat', () => {
  it('counts the Owner as CRM Administrator exactly once, whatever their stored role', () => {
    expect(crmUsage([owner])).toEqual({ total: 1, admin: 1 })
    expect(crmUsage([{ ...owner, crmRole: 'basic' }])).toEqual({ total: 1, admin: 1 })
    expect(crmUsage([{ ...owner, crmRole: null, systemRoleIds: ['ultimate'] }])).toEqual({ total: 1, admin: 1 })
  })

  it('also uses an ERP seat', () => {
    expect(usesErpSeat(owner)).toBe(true)
  })
})

describe('ERP seats are counted only for users with an ERP role', () => {
  it('a CRM-only user uses a CRM seat but no ERP seat; an ERP-only user no CRM seat', () => {
    const crmOnly = crmUser('basic', [])
    const users = [owner, crmOnly, erpOnly()]
    expect(erpUsage(users)).toBe(2) // Owner + ERP-only
    expect(crmUsage(users).total).toBe(2) // Owner + CRM-only
  })

  it('Partner users (outside accountants) never use an ERP seat, as today', () => {
    expect(usesErpSeat({ isOwner: false, systemRoleIds: ['accountant'], customRoleIds: [], accountType: 'partner' })).toBe(false)
    expect(usesErpSeat({ isOwner: false, systemRoleIds: ['accountant'], customRoleIds: [], accountType: 'member' })).toBe(true)
    expect(accountUsers.some((u) => u.accountType === 'partner'), 'seed has a Partner').toBe(true)
  })

  it('custom roles count as ERP roles', () => {
    expect(usesErpSeat({ isOwner: false, systemRoleIds: [], customRoleIds: ['cr-1'] })).toBe(true)
  })

  it('a CRM-only invite is allowed while the ERP limit is full (#3b)', () => {
    // ERP limit 3, 3 used. New user with CRM only → no ERP seat needed.
    expect(checkErpChange(false, false, 3, 3, false)).toBeNull()
    // New user with an ERP role → blocked by the ERP limit.
    expect(checkErpChange(false, true, 3, 3, false)).toBe('erp-full')
  })

  it('adding ERP roles to a CRM-only user needs a free ERP seat (US-010 AC-04)', () => {
    expect(checkErpChange(false, true, 3, 3, false)).toBe('erp-full')
    expect(checkErpChange(false, true, 2, 3, false)).toBeNull()
  })

  it('users already on an ERP seat, and ERP trial companies, are never ERP-blocked', () => {
    expect(checkErpChange(true, true, 9, 3, false)).toBeNull()
    expect(checkErpChange(false, true, 9, 3, true)).toBeNull()
  })

  it('no CRM add-on → the ERP count is every user with a role, exactly as before (US-010 AC-07)', () => {
    const users = [owner, erpOnly(), erpOnly(['sales']), { ...erpOnly([]), customRoleIds: ['cr-2'] }]
    expect(erpUsage(users)).toBe(users.length)
    // And with no add-on the CRM option is hidden entirely.
    expect(crmAccessMode(state({}, { package: 'none' }))).toBe('hidden')
  })
})

// ─── Add-on states (US-001) ─────────────────────────────────────────────────

describe('when the CRM option is shown', () => {
  it('shows CRM for Trial and Essential, hides it for none / seat add-on only, read-only when expired', () => {
    expect(crmAccessMode(state({}, { package: 'essential' }))).toBe('active')
    expect(crmAccessMode(state({}, { package: 'trial' }))).toBe('active')
    expect(crmAccessMode(state({}, { package: 'none' }))).toBe('hidden')
    expect(crmAccessMode(state({}, { package: 'seat-addon-only' }))).toBe('hidden')
    expect(crmAccessMode(state({}, { package: 'expired' }))).toBe('read-only')
  })

  it('blocks every CRM change while expired, but nothing is taken away', () => {
    const cap = crmCapacity(essential(2, 1))
    const usage = crmUsage([owner, crmUser('basic')])
    expect(checkCrmChange(null, 'basic', usage, cap, 'read-only')).toBe('crm-read-only')
    expect(checkCrmChange('basic', 'admin', usage, cap, 'read-only')).toBe('crm-read-only')
    // Keeping the role as-is (editing other roles) still saves.
    expect(checkCrmChange('basic', 'basic', usage, cap, 'read-only')).toBeNull()
  })
})

// ─── Trial (US-012) ─────────────────────────────────────────────────────────

describe('CRM Free Trial', () => {
  const trial = (trialSeats: number | null): CrmBillingSnapshot =>
    ({ package: 'trial', includedSeats: 5, basicAddons: 0, adminAddons: 0, trialSeats })

  it('enforces the trial seat count from Billing', () => {
    const snap = trial(3)
    expect(crmCapacity(snap)).toEqual({ total: 3, adminCapable: 3 })
    const users = [owner, crmUser('basic'), crmUser('admin')]
    expect(giveNew(users, snap, 'basic')).toBe('crm-full')
  })

  it('no trial seat count → Owner only (AC-03)', () => {
    const snap = trial(null)
    expect(crmCapacity(snap)).toEqual({ total: 1, adminCapable: 1 })
    expect(giveNew([owner], snap, 'basic')).toBe('crm-full')
  })

  it('ignores add-on quantities during the trial (AC-04)', () => {
    expect(crmCapacity({ ...trial(3), basicAddons: 4, adminAddons: 2 })).toEqual({ total: 3, adminCapable: 3 })
  })

  it('is enforced even when the ERP company is itself on trial (AC-02)', () => {
    // The ERP check is skipped on ERP trial; the CRM check doesn't read that flag at all.
    expect(checkErpChange(false, true, 50, 3, true)).toBeNull()
    expect(giveNew([owner, crmUser('basic'), crmUser('basic')], trial(3), 'basic')).toBe('crm-full')
  })
})

// ─── Over quota (US-006) ────────────────────────────────────────────────────

describe('over quota after a reduction', () => {
  it('keeps all 7 users and reports 2 over when seats drop to 5 (AC-01)', () => {
    const users = [owner, ...times(6, () => crmUser('basic'))]
    const cap = crmCapacity(essential(0, 0))
    const sum = crmSeatSummary(crmUsage(users), cap)
    expect(sum).toMatchObject({ used: 7, total: 5, left: 0, overTotal: 2 })
    // Every user is still counted — nothing removed.
    expect(crmUsage(users).total).toBe(7)
  })

  it('blocks new access while over, and allows it again once usage fits (AC-02/03)', () => {
    const cap = crmCapacity(essential(0, 0))
    const users = [owner, ...times(6, () => crmUser('basic'))]
    expect(giveNew(users, essential(0, 0), 'basic')).toBe('crm-full')
    const fits = users.slice(0, 4) // 4/5
    expect(checkCrmChange(null, 'basic', crmUsage(fits), cap, 'active')).toBeNull()
  })

  it('Administrator add-on removed → 1 Administrator over; Basic still allowed while the total has room (AC-01b)', () => {
    const users = [owner, ...times(5, () => crmUser('admin'))] // 6 used, 6 Administrators
    const snap = essential(2, 0) // total 7, Administrator-capable 5
    const sum = crmSeatSummary(crmUsage(users), crmCapacity(snap))
    expect(sum).toMatchObject({ overAdmin: 1, overTotal: 0, left: 1, adminLeft: 0 })
    expect(giveNew(users, snap, 'admin')).toBe('crm-admin-full')
    expect(giveNew(users, snap, 'basic')).toBeNull()
  })
})

// ─── Billing down (US-008) ──────────────────────────────────────────────────

describe('Billing down', () => {
  it('uses the last confirmed snapshot — never zero seats or no CRM (AC-01/02)', () => {
    const s = state({ billing: 'down' })
    expect(effectiveCrmSnapshot(s)).toEqual(s.snapshot)
    expect(crmAccessMode(s)).toBe('active')
    expect(crmCapacity(effectiveCrmSnapshot(s)).total).toBe(5) // default: CRM Essential, 5 included
  })

  it('with nothing ever confirmed, CRM changes are blocked with "try again later" (AC-03)', () => {
    const s = state({ billing: 'down', confirmedAt: null })
    expect(effectiveCrmSnapshot(s)).toBeNull()
    expect(crmAccessMode(s)).toBe('unknown')
    expect(checkCrmChange(null, 'basic', crmUsage([owner]), crmCapacity(null), 'unknown')).toBe('billing-unknown')
    // …but a save that doesn't touch CRM still goes through.
    expect(checkCrmChange('basic', 'basic', crmUsage([owner]), crmCapacity(null), 'unknown')).toBeNull()
  })

  it('picks the current package back up once Billing answers (AC-04)', () => {
    expect(crmAccessMode(state({ billing: 'ok', confirmedAt: null }))).toBe('active')
  })
})

// ─── Role model in Users & roles (US-011) ───────────────────────────────────

describe('CRM is a standalone role, never inside custom roles', () => {
  it('has no CRM category or CRM feature in the custom-role matrix (AC-04)', () => {
    expect(AUTHORITY_CATEGORIES.some((c) => (c.value as string) === 'crm')).toBe(false)
    expect(AUTHORITY_FEATURES.some((f) => /crm/i.test(f.id) || /crm/i.test(f.label))).toBe(false)
  })

  it('is not an Existing (system) role either', () => {
    expect(SYSTEM_ROLES.some((r) => r.id === 'crm')).toBe(false)
  })

  it('seeds the demo with Ultimate + CRM, custom + CRM and a CRM-only user', () => {
    expect(accountUsers.some((u) => u.systemRoleIds.includes('ultimate') && u.crmRole)).toBe(true)
    expect(accountUsers.some((u) => u.customRoleIds.length && !u.systemRoleIds.length && u.crmRole)).toBe(true)
    const crmOnly = accountUsers.filter((u) => !usesErpSeat(u) && u.accountType !== 'partner')
    expect(crmOnly.length).toBeGreaterThan(0)
    for (const u of crmOnly) expect(userRoleTypes(u)).toEqual(['crm-only'])
  })

  it('seed fits the default package (ERP 10, CRM Essential 5 seats) with room to spare', () => {
    const cap = crmCapacity(defaultCrmSubscriptionState().snapshot)
    const sum = crmSeatSummary(crmUsage(accountUsers), cap)
    expect(sum.overTotal).toBe(0)
    expect(sum.left).toBeGreaterThan(0)
    expect(erpUsage(accountUsers)).toBeLessThan(defaultCrmSubscriptionState().erpUserLimit)
    // The demo's first-load numbers: ERP 8 of 10, CRM 4 of 5 (Owner + 3).
    expect(cap).toEqual({ total: 5, adminCapable: 5 })
    expect(erpUsage(accountUsers)).toBe(8)
    expect(crmUsage(accountUsers).total).toBe(4)
  })

  it('keeps an invited user holding a CRM seat in the seed (default #4)', () => {
    expect(accountUsers.some((u) => u.status === 'invited' && u.crmRole)).toBe(true)
  })
})

// ─── "Seat usage" dialog (US-002) ────────────────────────────────────────────

describe('Seat usage card content per state', () => {
  // Mirrors the demo default: Owner + 3 CRM users (2 Administrators), 8 ERP users.
  const users = [owner, crmUser('basic'), crmUser('basic', []), crmUser('admin')]
  const view = (s: CrmSubscriptionState, erpUsed = 8) =>
    seatUsageView(
      crmAccessMode(s),
      crmSeatSummary(crmUsage(users), crmCapacity(effectiveCrmSnapshot(s))),
      erpSeatSummary(erpUsed, s.erpUserLimit, s.erpOnTrial),
      effectiveCrmSnapshot(s),
    )

  it('default (ERP 10, CRM Essential 5): total · used · left, plus Administrator headroom', () => {
    expect(view(state())).toMatchObject({
      erp: { used: 8, total: 10, left: 2 },
      crm: { kind: 'usage', used: 4, total: 5, left: 1, adminLeft: 1, over: 0 },
    })
  })

  it('no CRM add-on / seat add-on only: ERP row only', () => {
    for (const pkg of ['none', 'seat-addon-only'] as const) {
      const v = view(state({}, { package: pkg }))
      expect(v.crm).toBeNull()
      expect(v.erp).toEqual({ used: 8, total: 10, left: 2 })
    }
  })

  it('ERP trial: ERP shows "No limit on trial"', () => {
    expect(view(state({ erpOnTrial: true })).erp).toBe('no-limit-trial')
  })

  it('CRM expired: CRM row is "CRM expired" (read-only)', () => {
    expect(view(state({}, { package: 'expired' })).crm).toEqual({ kind: 'expired' })
  })

  it('over quota: the CRM row reports how many seats over', () => {
    expect(view(state({}, { includedSeats: 3 })).crm).toMatchObject({ kind: 'usage', total: 3, left: 0, over: 1 })
  })

  it('Billing down, never confirmed: CRM "can\'t be checked"; last confirmed: normal usage', () => {
    expect(view(state({ billing: 'down', confirmedAt: null })).crm).toEqual({ kind: 'unknown' })
    expect(view(state({ billing: 'down' })).crm).toMatchObject({ kind: 'usage', total: 5 })
  })
})

// ─── Seat usage card lines (Invite / Edit user CRM add-on spec) ─────────────
// UI label: CRM Administrator = internal crmRole 'admin'.

describe('CRM seat lines (Seat usage card)', () => {
  const trialSnap = (seats: number): CrmBillingSnapshot =>
    ({ package: 'trial', includedSeats: 5, basicAddons: 0, adminAddons: 0, trialSeats: seats })
  const lines = (users: SeatHolder[], snap: CrmBillingSnapshot) => {
    const sum = crmSeatSummary(crmUsage(users), crmCapacity(snap))
    return formatCrmSeatBreakdown({
      ...crmSeatBreakdown(snap, sum), total: sum.total, used: sum.used, left: sum.left, over: sum.overTotal, adminLeft: sum.adminLeft,
    })
  }
  // The demo default seed: Owner + Administrator + 2 Basic.
  const seed = [owner, crmUser('admin'), crmUser('basic'), crmUser('basic', [])]
  const prd = [owner, ...times(5, () => crmUser('admin'))] // Owner + 5 Administrators

  it('default: "5 total · 4 used · 1 left", "5 included", "Up to 1 can be CRM Administrator"', () => {
    expect(lines(seed, essential(0, 0))).toEqual({
      usage: { text: '5 total · 4 used · 1 left', isOver: false },
      capacity: '5 included',
      upTo: 'Up to 1 can be CRM Administrator',
    })
  })

  it('never has a "CRM Administrator: N of M used" line', () => {
    expect(Object.values(lines(seed, essential(2, 1))).join(' ')).not.toMatch(/of \d+ used/)
  })

  describe('capacity line — add-ons appended only when they exist', () => {
    const cap = (basic: number, admin: number) =>
      formatCrmCapacityLine({ kind: 'essential', included: 5, basic, admin })
    it('no add-ons → "5 included"', () => expect(cap(0, 0)).toBe('5 included'))
    it('the spec example → "5 included + 2 Basic, + 1 Administrator add-on"', () =>
      expect(cap(2, 1)).toBe('5 included + 2 Basic, + 1 Administrator add-on'))
    it('Basic only, plural → "5 included + 2 Basic add-ons"', () => expect(cap(2, 0)).toBe('5 included + 2 Basic add-ons'))
    it('Basic only, singular → "5 included + 1 Basic add-on"', () => expect(cap(1, 0)).toBe('5 included + 1 Basic add-on'))
    it('Administrator only → "5 included + 1 Administrator add-on"', () =>
      expect(cap(0, 1)).toBe('5 included + 1 Administrator add-on'))
    it('the noun agrees with the last count → "+ 1 Basic, + 2 Administrator add-ons"', () =>
      expect(cap(1, 2)).toBe('5 included + 1 Basic, + 2 Administrator add-ons'))
  })

  describe('"Up to N can be CRM Administrator" — hidden at 0', () => {
    it('null when no Administrator seat is left', () => expect(formatCrmUpToLine(0)).toBeNull())
    it('shows N otherwise', () => {
      expect(formatCrmUpToLine(1)).toBe('Up to 1 can be CRM Administrator')
      expect(formatCrmUpToLine(3)).toBe('Up to 3 can be CRM Administrator')
    })
    it('PRD example (Owner + 5 Administrators, 6 of 6): hidden though 2 seats are left', () => {
      const l = lines(prd, essential(2, 1))
      expect(l.usage.text).toBe('8 total · 6 used · 2 left')
      expect(l.upTo).toBeNull()
    })
    it('hidden when the CRM seats are used up', () => {
      expect(lines([...seed, crmUser('basic')], essential(0, 0)).upTo).toBeNull()
    })
  })

  describe('over quota → "N over" in the warning colour', () => {
    it('"5 total · 7 used · 2 over" after a reduction', () => {
      const users = [...seed, ...times(3, () => crmUser('basic'))]
      expect(lines(users, essential(0, 0)).usage).toEqual({ text: '5 total · 7 used · 2 over', isOver: true })
    })
    it('"3 total · 4 used · 1 over" and no "left" part', () => {
      const u = formatCrmUsageLine({ total: 3, used: 4, left: 0, over: 1 })
      expect(u).toEqual({ text: '3 total · 4 used · 1 over', isOver: true })
    })
    it('exactly full is "0 left", not over', () => {
      expect(formatCrmUsageLine({ total: 5, used: 5, left: 0, over: 0 })).toEqual({ text: '5 total · 5 used · 0 left', isOver: false })
    })
  })

  it('trial: "5 trial seats" instead of included / add-ons', () => {
    expect(lines(seed, trialSnap(5)).capacity).toBe('5 trial seats')
    expect(lines([owner], trialSnap(1)).capacity).toBe('1 trial seat')
  })
})

describe('why a CRM option is disabled (inline note + tooltip copy)', () => {
  it('no CRM seat left', () => {
    expect(crmOptionNote('crm-full', false)).toEqual({
      full: 'No CRM seats left. Contact Sales to add seats.', before: 'No CRM seats left.', link: 'Contact Sales', after: 'to add seats.',
    })
  })
  it('over quota', () => {
    expect(crmOptionNote('crm-full', true).full).toBe('Remove CRM from some users or contact Sales to add seats.')
    expect(crmOptionNote('crm-full', true).link).toBe('contact Sales')
  })
  it('CRM expired', () => {
    expect(crmOptionNote('crm-read-only', false).full).toBe('CRM subscription has ended. Contact Sales to renew.')
  })
  it('no Administrator seat left (radio helper, no link)', () => {
    expect(crmOptionNote('crm-admin-full', false)).toMatchObject({ full: 'No CRM Administrator seat left', link: null })
  })
  it('labels the levels CRM Administrator / CRM Basic', () => {
    expect(crmRoleLabel('admin')).toBe('CRM Administrator')
    expect(crmRoleLabel('basic')).toBe('CRM Basic')
  })
})
