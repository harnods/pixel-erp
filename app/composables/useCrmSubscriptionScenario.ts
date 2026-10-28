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
import { accountUsers, getAccountUser, setAccountUserCrmRoles } from '~/data/usersRoles'

export interface CrmScenarioPreset { value: string; label: string }

/** FAB presets — each is a full Billing state, so switching is deterministic. */
export const CRM_SCENARIO_PRESETS: CrmScenarioPreset[] = [
  { value: 'essential', label: 'CRM Essential (5 seats)' },
  { value: 'essential-addons', label: 'CRM Essential + 2 Basic + 1 Manager add-on' },
  { value: 'prd-admins', label: 'Owner + 5 CRM Managers (PRD example)' },
  { value: 'reduced', label: 'Seats reduced to 3 (over quota)' },
  { value: 'trial', label: 'CRM Free Trial (5 seats)' },
  { value: 'trial-no-count', label: 'CRM Free Trial (no seat count)' },
  { value: 'trial-erp-trial', label: 'CRM Free Trial on ERP trial' },
  { value: 'expired', label: 'CRM expired' },
  { value: 'seat-addon-only', label: 'Seat add-on only' },
  { value: 'none', label: 'No CRM' },
  { value: 'billing-down', label: 'Billing down (last confirmed)' },
  { value: 'billing-down-never', label: 'Billing down (never confirmed)' },
  { value: 'erp-full', label: 'ERP user limit full' },
]

function presetState(value: string): CrmSubscriptionState {
  const base = defaultCrmSubscriptionState()
  const snap = (patch: Partial<CrmBillingSnapshot>): CrmBillingSnapshot => ({ ...base.snapshot, ...patch })
  const s: CrmSubscriptionState = { ...base, preset: value }
  switch (value) {
    case 'essential-addons': s.snapshot = snap({ basicAddons: 2, adminAddons: 1 }); break
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
    case 'erp-full': s.erpUserLimit = erpUsage(accountUsers); break
  }
  return s
}

/**
 * Seed users the PRD-example preset makes CRM Administrator (with the Owner and
 * Fajar, already an Administrator, that's Owner + 5). All of them already hold
 * an ERP seat or are CRM-only, so the ERP count stays 8 of 10.
 */
export const PRD_EXAMPLE_ADMIN_IDS = ['au-3', 'au-5', 'au-9', 'au-12']

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
    const next = presetState(value)
    if (value === 'prd-admins') {
      const ids = PRD_EXAMPLE_ADMIN_IDS.filter((id) => getAccountUser(id))
      next.crmRoleOverlay = Object.fromEntries(ids.map((id) => [id, getAccountUser(id)!.crmRole]))
      setAccountUserCrmRoles(Object.fromEntries(ids.map((id) => [id, 'admin' as CrmRole])))
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
  /** The Seat usage view for the saved users (no pending change). */
  const currentView = computed(() => seatUsageView(mode.value, crmSummary.value, erpSummary.value, snapshot.value))

  return {
    state: crmSubscription,
    previewView, currentView,
    snapshot, mode, capacity, usage, crmSummary, erpUsed, erpSummary,
    crmVisible, isTrial, isOverQuota, currentUserHasCrmRole,
    presets: CRM_SCENARIO_PRESETS,
    applyPreset, setBasicAddons, setAdminAddons, setErpUserLimit, setViewAsNoCrmRole,
    checkSave,
  }
}
