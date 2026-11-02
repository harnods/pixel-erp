/**
 * useCrmSubscriptionScenario — the CRM add-on + seat pool as seen by Settings ›
 * Users & roles, the Invite / Edit user form and the product switcher.
 *
 * Wraps the persisted mock-Billing singleton in `~/data/crmSubscription` with
 * the derived numbers every surface needs (access mode, capacity, usage, the
 * ERP / CRM seat summaries) and the demo presets the Users & roles scenario FAB
 * flips between. Persisted (unlike most FAB toggles) because the invite form
 * and the user list are separate routes and must agree after a refresh; "Reset
 * demo data" restores the default (ERP limit 10, CRM Essential 5 seats).
 */
import { computed } from 'vue'
import {
  crmSubscription, setCrmSubscription, saveCrmSubscription, defaultCrmSubscriptionState,
  crmAccessMode, crmCapacity, crmUsage, crmSeatSummary, effectiveCrmSnapshot,
  erpUsage, erpSeatSummary, checkCrmChange, checkErpChange, effectiveCrmRole, usesErpSeat,
  seatUsageView, type SeatHolder, type SeatUsageView,
  type CrmRole, type CrmBlockReason, type CrmSubscriptionState, type CrmBillingSnapshot,
} from '~/data/crmSubscription'
import {
  accountUsers, getAccountUser, setAccountUserCrmRoles, addPresetAccountUsers, removeAccountUsers,
  type AccountUser,
} from '~/data/usersRoles'

export interface CrmScenarioPreset { value: string; label: string }

/** FAB presets — each is a full Billing state, so switching is deterministic. */
export const CRM_SCENARIO_PRESETS: CrmScenarioPreset[] = [
  { value: 'essential', label: 'CRM Essential (5 seats)' },
  { value: 'essential-addons', label: 'CRM Essential + 2 Basic + 1 Administrator add-on' },
  { value: 'prd-admins', label: 'Owner + 5 CRM Administrators (PRD example)' },
  { value: 'crm-full', label: 'No CRM seats left (5 of 5 used)' },
  { value: 'basic-only', label: 'Only CRM Basic seats left (+ 2 Basic add-ons)' },
  { value: 'over-quota', label: 'Over quota (7 used of 5)' },
  { value: 'reduced', label: 'Seats reduced to 3 (over quota)' },
  { value: 'trial', label: 'CRM Free Trial (5 seats)' },
  { value: 'trial-no-count', label: 'CRM Free Trial (no seat count)' },
  { value: 'trial-erp-trial', label: 'CRM Free Trial on ERP trial' },
  { value: 'expired', label: 'CRM expired' },
  { value: 'seat-addon-only', label: 'Seat add-on only' },
  { value: 'none', label: 'No CRM' },
  { value: 'billing-down', label: 'Billing down (last confirmed)' },
  { value: 'billing-down-never', label: 'Billing down (never confirmed)' },
  { value: 'erp-full', label: 'ERP user limit full (10 of 10)' },
]

function presetState(value: string): CrmSubscriptionState {
  const base = defaultCrmSubscriptionState()
  const snap = (patch: Partial<CrmBillingSnapshot>): CrmBillingSnapshot => ({ ...base.snapshot, ...patch })
  const s: CrmSubscriptionState = { ...base, preset: value }
  switch (value) {
    case 'essential-addons': s.snapshot = snap({ basicAddons: 2, adminAddons: 1 }); break
    // 5 included + 2 Basic add-ons = 7 seats, 5 Administrator-capable. Users
    // (applyPreset) fill the 5 Administrator seats → only Basic seats are left.
    case 'basic-only': s.snapshot = snap({ basicAddons: 2 }); break
    // PRD §3b "Owner + 5 Administrators": 8 total · 6 used · 2 left, Administrator
    // 6 of 6 → the 2 seats left are Basic only. Users are set in applyPreset.
    case 'prd-admins': s.snapshot = snap({ basicAddons: 2, adminAddons: 1 }); break
    // Billing now reports fewer seats than are in use (4 held vs 3) → over
    // quota (US-006): everyone keeps access, new access is blocked. The add-on
    // steppers show the same thing from the add-on side.
    case 'reduced': s.snapshot = snap({ includedSeats: 3 }); break
    case 'trial': s.snapshot = snap({ package: 'trial', trialSeats: 5 }); break
    case 'trial-no-count': s.snapshot = snap({ package: 'trial', trialSeats: null }); break
    case 'trial-erp-trial':
      s.snapshot = snap({ package: 'trial', trialSeats: 5 })
      s.erpOnTrial = true
      break
    case 'expired': s.snapshot = snap({ package: 'expired' }); break
    case 'seat-addon-only': s.snapshot = snap({ package: 'seat-addon-only', basicAddons: 2 }); break
    case 'none': s.snapshot = snap({ package: 'none' }); break
    case 'billing-down': s.billing = 'down'; break
    case 'billing-down-never': s.billing = 'down'; s.confirmedAt = null; break
    // The ERP limit stays 10; applyPreset adds two pending ERP invites → 10 of 10.
    case 'erp-full': break
  }
  return s
}

/**
 * Seed CRM roles each preset changes (user id → role), on top of the default
 * seed (Owner + Fajar CRM Administrator, Bayu + Dewi CRM Basic = 4 of 5). All of
 * these users already use an ERP seat or are CRM-only, so ERP stays 8 of 10.
 */
const PRESET_CRM_ROLES: Record<string, Record<string, CrmRole>> = {
  // Owner + 5 CRM Administrators (PRD §3b): 8 total · 6 used, Administrator 6 of 6.
  'prd-admins': { 'au-3': 'admin', 'au-5': 'admin', 'au-9': 'admin', 'au-12': 'admin' },
  // + Cinta as CRM Basic → 5 total · 5 used · 0 left.
  'crm-full': { 'au-3': 'basic' },
  // Owner + 4 CRM Administrators fill the 5 Administrator-capable seats; the 2
  // Basic add-on seats are left → 7 total · 5 used · 2 left, Basic only.
  'basic-only': { 'au-3': 'admin', 'au-5': 'admin', 'au-12': 'admin' },
  // + 3 CRM Basic users after a reduction → 5 total · 7 used · 2 over.
  'over-quota': { 'au-2': 'basic', 'au-3': 'basic', 'au-9': 'basic' },
}

/** Users a preset adds to the seed — removed again by any other preset. */
const PRESET_USERS: Record<string, AccountUser[]> = {
  // Two pending ERP invites → ERP 10 total · 10 used · 0 left (CRM unchanged).
  'erp-full': [
    {
      id: 'au-demo-1', name: 'Gita Pratiwi', email: 'gita.pratiwi@mekari.com', isOwner: false,
      systemRoleIds: ['sales'], customRoleIds: [], crmRole: null, isListManager: false, timeLimit: null,
      status: 'invited', lastActiveAt: null, joinedAt: '2026-10-27',
    },
    {
      id: 'au-demo-2', name: 'Joko Susilo', email: 'joko.susilo@mekari.com', isOwner: false,
      systemRoleIds: ['stockist'], customRoleIds: [], crmRole: null, isListManager: false, timeLimit: null,
      status: 'invited', lastActiveAt: null, joinedAt: '2026-10-27',
    },
  ],
}

/** Seed users the PRD-example preset makes CRM Administrator (with the Owner and Fajar: Owner + 5). */
export const PRD_EXAMPLE_ADMIN_IDS = Object.keys(PRESET_CRM_ROLES['prd-admins']!)

/**
 * What the Invite / Edit form may offer BEFORE saving (the spec's proactive
 * disabling). Counts come from the saved users, so the user's own saved seat is
 * included and an option they already hold is never blocked:
 *  - crm    can CRM be ticked at all (as CRM Basic)? read-only → always blocked
 *  - admin  can CRM Administrator be picked?
 *  - erp    can ERP roles be ticked (only gated for a user without an ERP seat yet)?
 */
export interface FormOptionGate {
  crm: CrmBlockReason | null
  admin: CrmBlockReason | null
  erp: 'erp-full' | null
  /** CRM usage is above the total (after a reduction) — picks the over-quota note. */
  overQuota: boolean
}

export interface SeatCheckResult {
  erp: 'erp-full' | null
  crm: CrmBlockReason | null
}

export function useCrmSubscriptionScenario() {
  const snapshot = computed(() => effectiveCrmSnapshot(crmSubscription))
  const mode = computed(() => crmAccessMode(crmSubscription))
  const capacity = computed(() => crmCapacity(snapshot.value))
  const usage = computed(() => crmUsage(accountUsers))
  const crmSummary = computed(() => crmSeatSummary(usage.value, capacity.value))
  const erpUsed = computed(() => erpUsage(accountUsers))
  const erpSummary = computed(() =>
    erpSeatSummary(erpUsed.value, crmSubscription.erpUserLimit, crmSubscription.erpOnTrial))
  /** The CRM role is part of the role editor (active, read-only or unknown). */
  const crmVisible = computed(() => mode.value !== 'hidden')
  const isTrial = computed(() => snapshot.value?.package === 'trial')
  const isOverQuota = computed(() =>
    mode.value === 'active' && (crmSummary.value.overTotal > 0 || crmSummary.value.overAdmin > 0))

  /** Can the signed-in user (always the Owner in this demo) open CRM? */
  const currentUserHasCrmRole = computed(() => !crmSubscription.viewAsNoCrmRole)

  function applyPreset(value: string) {
    // Undo whatever a previous preset did to seed users first, so every preset
    // starts from the default seed.
    if (crmSubscription.crmRoleOverlay) setAccountUserCrmRoles(crmSubscription.crmRoleOverlay)
    if (crmSubscription.presetUserIds?.length) removeAccountUsers(crmSubscription.presetUserIds)
    const next = presetState(value)
    const roles = PRESET_CRM_ROLES[value]
    if (roles) {
      const ids = Object.keys(roles).filter((id) => getAccountUser(id))
      next.crmRoleOverlay = Object.fromEntries(ids.map((id) => [id, getAccountUser(id)!.crmRole]))
      setAccountUserCrmRoles(Object.fromEntries(ids.map((id) => [id, roles[id]!])))
    }
    const users = PRESET_USERS[value]
    if (users) {
      addPresetAccountUsers(users)
      next.presetUserIds = users.map((u) => u.id)
    }
    setCrmSubscription(next)
  }

  function tweak(mutator: (s: CrmSubscriptionState) => void) {
    mutator(crmSubscription)
    crmSubscription.preset = 'custom'
    saveCrmSubscription()
  }
  const clamp = (n: number) => Math.max(0, Math.min(99, n))
  function setBasicAddons(n: number) { tweak((s) => { s.snapshot.basicAddons = clamp(n) }) }
  function setAdminAddons(n: number) { tweak((s) => { s.snapshot.adminAddons = clamp(n) }) }
  function setErpUserLimit(n: number) { tweak((s) => { s.erpUserLimit = Math.max(1, clamp(n)) }) }
  function setViewAsNoCrmRole(on: boolean) {
    crmSubscription.viewAsNoCrmRole = on
    saveCrmSubscription()
  }

  /**
   * Run both seat checks for a save. `userId` null = a new invite. Counts come
   * from the saved users (the edited user's current seat is included), so the
   * PRD §3b switch rules fall out of checkCrmChange.
   */
  function checkSave(
    userId: string | null,
    next: { systemRoleIds: string[]; customRoleIds: string[]; crmRole: CrmRole | null },
  ): SeatCheckResult {
    const current = userId ? getAccountUser(userId) : undefined
    const fromCrm = current ? effectiveCrmRole(current) : null
    const toCrm = current?.isOwner ? 'admin' : next.crmRole
    const usedErpBefore = current ? usesErpSeat(current) : false
    const usesErpAfter = usesErpSeat({ isOwner: !!current?.isOwner, ...next })
    return {
      erp: checkErpChange(usedErpBefore, usesErpAfter, erpUsed.value, crmSubscription.erpUserLimit, crmSubscription.erpOnTrial),
      crm: checkCrmChange(fromCrm, toCrm, usage.value, capacity.value, mode.value),
    }
  }

  /**
   * The Seat usage view AFTER saving this user with `next` roles — the Invite /
   * Edit card previews it live while roles are ticked. `userId` null = a new
   * invite. A user with no roles yet adds nothing, so the preview equals the
   * current counts until something is ticked.
   */
  function previewView(
    userId: string | null,
    next: { systemRoleIds: string[]; customRoleIds: string[]; crmRole: CrmRole | null },
  ): SeatUsageView {
    const current = userId ? getAccountUser(userId) : undefined
    const others = accountUsers.filter((u) => u.id !== userId)
    const me: SeatHolder = {
      isOwner: !!current?.isOwner, accountType: current?.accountType, ...next,
      crmRole: current?.isOwner ? 'admin' : next.crmRole,
    }
    const users = [...others, me]
    return seatUsageView(
      mode.value,
      crmSeatSummary(crmUsage(users), capacity.value),
      erpSeatSummary(erpUsage(users), crmSubscription.erpUserLimit, crmSubscription.erpOnTrial),
      snapshot.value,
    )
  }
  /** Which options the Invite / Edit form offers for `userId` (null = a new invite). */
  function formGate(userId: string | null): FormOptionGate {
    const current = userId ? getAccountUser(userId) : undefined
    const saved = current ? effectiveCrmRole(current) : null
    const crm = mode.value === 'read-only'
      ? 'crm-read-only'
      : checkCrmChange(saved, saved ?? 'basic', usage.value, capacity.value, mode.value)
    return {
      crm,
      admin: checkCrmChange(saved, 'admin', usage.value, capacity.value, mode.value),
      erp: checkErpChange(current ? usesErpSeat(current) : false, true, erpUsed.value, crmSubscription.erpUserLimit, crmSubscription.erpOnTrial),
      overQuota: crmSummary.value.overTotal > 0,
    }
  }

  /** The Seat usage view for the saved users (no pending change). */
  const currentView = computed(() => seatUsageView(mode.value, crmSummary.value, erpSummary.value, snapshot.value))

  return {
    state: crmSubscription,
    previewView, currentView,
    snapshot, mode, capacity, usage, crmSummary, erpUsed, erpSummary,
    crmVisible, isTrial, isOverQuota, currentUserHasCrmRole,
    presets: CRM_SCENARIO_PRESETS,
    applyPreset, setBasicAddons, setAdminAddons, setErpUserLimit, setViewAsNoCrmRole,
    checkSave, formGate,
  }
}
