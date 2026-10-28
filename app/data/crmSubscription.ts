/**
 * CRM add-on subscription + seat pool — the mock "Billing" behind Settings ›
 * Users & roles (PRD: "1-Pager: [Support] Users & Roles – CRM Access and CRM
 * User Seats in ERP").
 *
 * CRM is an ERP add-on with its OWN seat pool, separate from the ERP user limit:
 *   total CRM seats       = included (5, from Billing) + Basic add-ons + Administrator add-ons
 *   Administrator-capable = included + Administrator add-ons
 * Only two checks ever run (PRD §3b), so the order users were added in never
 * matters and nobody is shuffled between seats:
 *   give CRM Basic            → total
 *   give CRM Administrator    → total + Administrator
 *   switch Basic → Admin      → Administrator only (total unchanged)
 *   switch Admin → Basic      → always allowed
 *   remove CRM access         → always allowed (frees a seat)
 *
 * ERP seats are counted from users with ≥1 ERP role (system or custom) — a
 * CRM-only user never uses one, an ERP-only user never uses a CRM seat.
 *
 * Everything below the state section is a PURE helper (explicit inputs, no
 * module state) so the seat maths is unit-testable on its own. The reactive
 * `crmSubscription` singleton is the demo's "Billing" — flipped from the
 * Users & roles scenario FAB (useCrmSubscriptionScenario) and persisted under
 * the `erp-db:` prefix so "Reset demo data" restores the default.
 *
 * Defaults for the PRD's open questions (shown in the scenario FAB footnote):
 *   #2  included seats are role-neutral (either role can use them)
 *   #4  a pending invite with CRM access holds a CRM seat
 *   #5  a deactivated user keeps their CRM seat
 *   #3b CRM-only invites are allowed while the ERP limit is full
 *   #9  over quota keeps everyone and blocks only NEW assignments
 *   #6  Ultimate doesn't get CRM automatically (agreed 26 Oct)
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * The company's CRM add-on on its ERP subscription, as Billing reports it.
 *  - none            no CRM add-on → no CRM option anywhere
 *  - trial           CRM Free Trial — Essential (seat count from Billing, no add-ons)
 *  - essential       CRM Essential (5 included + Basic / Administrator add-ons)
 *  - seat-addon-only seat add-ons but no active Essential → no CRM option
 *  - expired         expired / cancelled → existing assignments read-only
 */
export type CrmPackage = 'none' | 'trial' | 'essential' | 'seat-addon-only' | 'expired'

/**
 * ERP's CRM role tier. Internal ids stay 'admin' / 'basic' (the PRD's CRM
 * Administrator / CRM Basic); the UI uses production's labels — "CRM Manager"
 * (the Administrator-capable tier, with CRM Settings) and "CRM Basic".
 */
export type CrmRole = 'admin' | 'basic'

/** One Billing read — what ERP last confirmed about the CRM add-on. */
export interface CrmBillingSnapshot {
  package: CrmPackage
  /** Included seats (5 today) — always read from Billing, never hard-coded in logic. */
  includedSeats: number
  /** "Additional Staff Seat — Basic User" quantity. */
  basicAddons: number
  /** "Additional Staff Seat — Administrator" quantity. */
  adminAddons: number
  /** Trial seat count from Billing; null = Billing gave none → Owner only. */
  trialSeats: number | null
}

export interface CrmSubscriptionState {
  /** Whether Billing answered the last read. */
  billing: 'ok' | 'down'
  /** What Billing says (ok) or the LAST CONFIRMED read (down). */
  snapshot: CrmBillingSnapshot
  /** When the snapshot was confirmed; null = never confirmed (only matters while down). */
  confirmedAt: string | null
  /** ERP package user limit (package + "additional user" add-ons). */
  erpUserLimit: number
  /** ERP trial companies skip the ERP user limit — never the CRM seat check. */
  erpOnTrial: boolean
  /** Demo only — the signed-in user (Owner) is previewed as someone without the CRM role. */
  viewAsNoCrmRole: boolean
  /** Demo only — which scenario-FAB preset produced this state ('custom' once tweaked). */
  preset: string
  /**
   * Demo only — CRM roles a preset temporarily changed on seed users, keyed by
   * user id → the role they had before. Applying any other preset puts them back,
   * so the default seed (ERP 8/10, CRM 4/5) returns. null = nothing changed.
   */
  crmRoleOverlay: Record<string, CrmRole | null> | null
}

/** How the CRM role behaves in the role editor for the current company. */
export type CrmAccessMode =
  | 'hidden'     // no add-on / seat add-on only → no CRM option at all
  | 'active'     // trial or essential → CRM role can be given
  | 'read-only'  // expired / cancelled → assignments shown, no changes
  | 'unknown'    // Billing down and nothing ever confirmed → "try again later"

export type CrmBlockReason =
  | 'crm-unavailable'   // no CRM add-on
  | 'crm-read-only'     // expired / cancelled
  | 'billing-unknown'   // Billing down, nothing confirmed
  | 'crm-full'          // total CRM seats used up
  | 'crm-admin-full'    // Administrator-capable seats used up

export interface CrmCapacity { total: number; adminCapable: number }
export interface CrmUsage { total: number; admin: number }

/** The minimal user shape the seat maths needs (AccountUser satisfies it). */
export interface SeatHolder {
  isOwner: boolean
  /** Production's account type. Partner users are excluded from the ERP user count, as today. */
  accountType?: 'member' | 'partner'
  systemRoleIds: string[]
  customRoleIds: string[]
  crmRole: CrmRole | null
}

// ─── Defaults ────────────────────────────────────────────────────────────────

/** Billing's included-seat count for CRM Essential today (PRD: "5 (1 Owner and 4 open)"). */
export const CRM_INCLUDED_SEATS_DEFAULT = 5
/** Mock ERP package user limit. */
export const ERP_USER_LIMIT_DEFAULT = 10

/** Demo default: CRM Essential with only the 5 included seats (no add-ons). */
export function defaultCrmSnapshot(): CrmBillingSnapshot {
  return {
    package: 'essential',
    includedSeats: CRM_INCLUDED_SEATS_DEFAULT,
    basicAddons: 0,
    adminAddons: 0,
    trialSeats: null,
  }
}

export function defaultCrmSubscriptionState(): CrmSubscriptionState {
  return {
    billing: 'ok',
    snapshot: defaultCrmSnapshot(),
    confirmedAt: '2026-10-27T08:00:00+07:00',
    erpUserLimit: ERP_USER_LIMIT_DEFAULT,
    erpOnTrial: false,
    viewAsNoCrmRole: false,
    preset: 'essential',
    crmRoleOverlay: null,
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * The snapshot ERP may act on: the live read when Billing is up, the last
 * confirmed one when it's down, or null when it's down and nothing was ever
 * confirmed. A failed read is NEVER treated as "zero seats" (PRD point 8 /
 * ATVAL-4330).
 */
export function effectiveCrmSnapshot(state: CrmSubscriptionState): CrmBillingSnapshot | null {
  if (state.billing === 'ok') return state.snapshot
  return state.confirmedAt ? state.snapshot : null
}

export function crmAccessMode(state: CrmSubscriptionState): CrmAccessMode {
  const snap = effectiveCrmSnapshot(state)
  if (!snap) return 'unknown'
  if (snap.package === 'trial' || snap.package === 'essential') return 'active'
  if (snap.package === 'expired') return 'read-only'
  return 'hidden'
}

/**
 * Seats the company has. Trial: Billing's trial count (role-neutral, no
 * add-ons), or Owner only when Billing gives none. Expired keeps the last
 * package's quantities so usage still reads against them.
 */
export function crmCapacity(snap: CrmBillingSnapshot | null): CrmCapacity {
  if (!snap) return { total: 0, adminCapable: 0 }
  if (snap.package === 'trial') {
    const seats = snap.trialSeats ?? 1
    return { total: seats, adminCapable: seats }
  }
  if (snap.package === 'essential' || snap.package === 'expired') {
    return {
      total: snap.includedSeats + snap.basicAddons + snap.adminAddons,
      adminCapable: snap.includedSeats + snap.adminAddons,
    }
  }
  return { total: 0, adminCapable: 0 }
}

/** The Owner always holds one included seat as CRM Administrator — derived, not stored. */
export function effectiveCrmRole(user: Pick<SeatHolder, 'isOwner' | 'crmRole'>): CrmRole | null {
  return user.isOwner ? 'admin' : user.crmRole
}

/**
 * Seats in use. Counts every user row with a CRM role — active, invited
 * (default #4) and deactivated (default #5). The Owner is one row, so they are
 * counted exactly once whatever their other roles are.
 */
export function crmUsage(users: SeatHolder[]): CrmUsage {
  let total = 0
  let admin = 0
  for (const u of users) {
    const role = effectiveCrmRole(u)
    if (!role) continue
    total++
    if (role === 'admin') admin++
  }
  return { total, admin }
}

/** A user uses an ERP seat when they hold ≥1 ERP role. The Owner always does; Partner users never do. */
export function usesErpSeat(user: Pick<SeatHolder, 'isOwner' | 'systemRoleIds' | 'customRoleIds' | 'accountType'>): boolean {
  if (user.accountType === 'partner') return false
  return user.isOwner || user.systemRoleIds.length > 0 || user.customRoleIds.length > 0
}

/** ERP user count = users and pending invites with ≥1 ERP role (CRM-only and Partner users excluded). */
export function erpUsage(users: SeatHolder[]): number {
  return users.filter(usesErpSeat).length
}

/**
 * Can a user's CRM role move from `from` to `to`? Pass usage EXCLUDING nothing —
 * the user's own current seat is already in `usage`, which is what makes the
 * switch rules fall out naturally (Basic→Admin only grows the Administrator
 * count; a new Basic only grows the total). Returns null when allowed.
 */
export function checkCrmChange(
  from: CrmRole | null,
  to: CrmRole | null,
  usage: CrmUsage,
  capacity: CrmCapacity,
  mode: CrmAccessMode,
): CrmBlockReason | null {
  if (from === to) return null // no CRM change — other role edits never use a seat
  if (mode === 'unknown') return 'billing-unknown'
  if (mode === 'read-only') return 'crm-read-only'
  if (mode === 'hidden') return 'crm-unavailable'
  if (to === null) return null // remove → always allowed
  if (from === 'admin' && to === 'basic') return null // Admin → Basic → always allowed
  if (from === 'basic' && to === 'admin') {
    return usage.admin + 1 > capacity.adminCapable ? 'crm-admin-full' : null
  }
  // A new CRM seat.
  if (usage.total + 1 > capacity.total) return 'crm-full'
  if (to === 'admin' && usage.admin + 1 > capacity.adminCapable) return 'crm-admin-full'
  return null
}

/**
 * Does gaining ERP roles fit the ERP limit? Only a user who doesn't use an ERP
 * seat yet (new invite with ERP roles, or a CRM-only user getting ERP roles)
 * needs a free one. ERP trial companies skip the ERP limit, as today.
 */
export function checkErpChange(
  usedErpBefore: boolean,
  usesErpAfter: boolean,
  used: number,
  limit: number,
  erpOnTrial: boolean,
): 'erp-full' | null {
  if (usedErpBefore || !usesErpAfter || erpOnTrial) return null
  return used + 1 > limit ? 'erp-full' : null
}

/** "8 total · 6 used · 2 left. Up to 2 can be CRM Administrator" — the numbers behind it. */
export interface CrmSeatSummary {
  total: number
  used: number
  left: number
  /** How many of the seats left can be CRM Administrator. */
  adminLeft: number
  /** Seats over the total (0 when within quota). */
  overTotal: number
  /** Administrators over the Administrator-capable limit (0 when within quota). */
  overAdmin: number
  /** Owner + CRM Administrators. */
  adminUsed: number
  /** Administrator-capable seats (included + Administrator add-ons; trial seats on trial). */
  adminTotal: number
}

export function crmSeatSummary(usage: CrmUsage, capacity: CrmCapacity): CrmSeatSummary {
  const left = Math.max(0, capacity.total - usage.total)
  const adminLeft = Math.min(left, Math.max(0, capacity.adminCapable - usage.admin))
  return {
    total: capacity.total,
    used: usage.total,
    left,
    adminLeft,
    overTotal: Math.max(0, usage.total - capacity.total),
    overAdmin: Math.max(0, usage.admin - capacity.adminCapable),
    adminUsed: usage.admin,
    adminTotal: capacity.adminCapable,
  }
}

export interface ErpSeatSummary { total: number; used: number; left: number; over: number; unlimited: boolean }

export function erpSeatSummary(used: number, limit: number, erpOnTrial: boolean): ErpSeatSummary {
  return {
    total: limit,
    used,
    left: Math.max(0, limit - used),
    over: Math.max(0, used - limit),
    unlimited: erpOnTrial,
  }
}

/**
 * Why a save was blocked — always names WHICH limit (ERP / CRM / CRM
 * Administrator) so the admin knows what to fix (PRD US-002 AC-04). The UI
 * appends a "Contact Sales" link to the seat-limit ones.
 */
export const SEAT_BLOCK_MESSAGES: Record<CrmBlockReason | 'erp-full', string> = {
  'erp-full': 'Your ERP user limit is full. Remove ERP roles from another user, or contact Sales to add ERP seats.',
  'crm-full': 'No CRM seats left. Remove CRM access from another user, or contact Sales to add CRM seats.',
  'crm-admin-full': 'No CRM Manager seats left. Choose CRM Basic instead, or contact Sales to add CRM Manager seats.',
  'crm-read-only': "Your CRM add-on has expired, so CRM access can't be changed. Existing access is kept until CRM is renewed.",
  'billing-unknown': "We can't check your CRM seats right now. Try again later.",
  'crm-unavailable': "Your company doesn't have the CRM add-on.",
}

/** Blocks that a bigger package fixes — these get the "Contact Sales" link. */
export function isSeatLimitBlock(reason: CrmBlockReason | 'erp-full' | null): boolean {
  return reason === 'erp-full' || reason === 'crm-full' || reason === 'crm-admin-full'
}

/**
 * What the "Seat usage" dialog on Users & roles shows, per state (numbers only —
 * the component owns the copy and runs it through t()).
 *  - CRM hidden (no add-on / seat add-on only)  → ERP row only
 *  - ERP trial                                  → ERP "No limit on trial"
 *  - CRM expired                                → CRM "CRM expired" (read-only)
 *  - Billing down, never confirmed              → CRM "Can't be checked right now"
 * Adding seats is a Contact Sales conversation for ERP and CRM alike, so the
 * dialog always offers it.
 */
export interface SeatUsageView {
  erp: { used: number; total: number; left: number } | 'no-limit-trial'
  crm:
    | null
    | ({ kind: 'usage'; used: number; total: number; left: number; adminLeft: number; over: number } & CrmSeatBreakdown)
    | { kind: 'expired' }
    | { kind: 'unknown' }
}

/**
 * Why "Up to N can be CRM Administrator" is what it is — the two pools behind
 * the CRM seat count (PRD §3b). Without this a Basic and an Administrator
 * add-on look identical whenever the TOTAL is the tighter limit.
 */
export interface CrmSeatBreakdown {
  /** Where the seats come from: Essential parts, or a flat trial count. */
  source: { kind: 'essential'; included: number; basic: number; admin: number } | { kind: 'trial'; seats: number }
  adminUsed: number
  adminTotal: number
  adminOver: number
  /** Seats left that can ONLY be CRM Basic (Administrator pool full, total has room). */
  basicOnly: number
}

export function crmSeatBreakdown(snap: CrmBillingSnapshot, crm: CrmSeatSummary): CrmSeatBreakdown {
  return {
    source: snap.package === 'trial'
      ? { kind: 'trial', seats: crm.total }
      : { kind: 'essential', included: snap.includedSeats, basic: snap.basicAddons, admin: snap.adminAddons },
    adminUsed: crm.adminUsed,
    adminTotal: crm.adminTotal,
    adminOver: crm.overAdmin,
    basicOnly: crm.adminLeft === 0 ? crm.left : 0,
  }
}

export function seatUsageView(
  mode: CrmAccessMode,
  crm: CrmSeatSummary,
  erp: ErpSeatSummary,
  snap: CrmBillingSnapshot | null,
): SeatUsageView {
  const erpRow: SeatUsageView['erp'] = erp.unlimited
    ? 'no-limit-trial'
    : { used: erp.used, total: erp.total, left: erp.left }
  if (mode === 'hidden') return { erp: erpRow, crm: null }
  if (mode === 'read-only') return { erp: erpRow, crm: { kind: 'expired' } }
  if (mode === 'unknown' || !snap) return { erp: erpRow, crm: { kind: 'unknown' } }
  return {
    erp: erpRow,
    crm: {
      kind: 'usage', used: crm.used, total: crm.total, left: crm.left, adminLeft: crm.adminLeft, over: crm.overTotal,
      ...crmSeatBreakdown(snap, crm),
    },
  }
}

/**
 * The breakdown as display lines. `t` translates the word fragments (numbers
 * are interpolated around them, so the copy keys stay stable):
 *   capacity  "5 included · 2 Basic add-ons · 1 Manager add-on"  (0-parts omitted)
 *             "5 trial seats"                                           (trial)
 *   admin     "CRM Manager: 2 of 6 used"  /  "… · 1 over"
 *   basicOnly "Remaining 2 seats are for CRM Basic only"  (or null)
 */
export function formatCrmSeatBreakdown(b: CrmSeatBreakdown, t: (en: string) => string = (x) => x) {
  const n = (count: number, one: string, many: string) => `${count} ${t(count === 1 ? one : many)}`
  const capacity = b.source.kind === 'trial'
    ? n(b.source.seats, 'trial seat', 'trial seats')
    : [
        `${b.source.included} ${t('included')}`,
        ...(b.source.basic ? [n(b.source.basic, 'Basic add-on', 'Basic add-ons')] : []),
        ...(b.source.admin ? [n(b.source.admin, 'Manager add-on', 'Manager add-ons')] : []),
      ].join(' · ')
  const admin = `${t('CRM Manager')}: ${b.adminUsed} ${t('of')} ${b.adminTotal} ${t('used')}`
    + (b.adminOver ? ` · ${b.adminOver} ${t('over')}` : '')
  const basicOnly = b.basicOnly
    ? `${t('Remaining')} ${b.basicOnly} ${t(b.basicOnly === 1 ? 'seat is for CRM Basic only' : 'seats are for CRM Basic only')}`
    : null
  return { capacity, admin, basicOnly }
}

/** Display label for a CRM role — the CRM access column / chips. */
export function crmRoleLabel(role: CrmRole | null): string {
  if (role === 'admin') return 'CRM Manager'
  if (role === 'basic') return 'CRM Basic'
  return ''
}

/** Display label for the package (scenario FAB + quota strip). */
export function crmPackageLabel(pkg: CrmPackage): string {
  switch (pkg) {
    case 'trial': return 'CRM Free Trial'
    case 'essential': return 'CRM Essential'
    case 'seat-addon-only': return 'Seat add-on only'
    case 'expired': return 'CRM expired'
    default: return 'No CRM'
  }
}

// ─── Reactive "Billing" state (persisted) ────────────────────────────────────

const STORE_KEY = 'crm-subscription-v2' // v2: default became Essential 5 seats / ERP 10

function loadState(): CrmSubscriptionState {
  const saved = loadSnapshot<CrmSubscriptionState>(STORE_KEY)?.[0]
  const base = defaultCrmSubscriptionState()
  return saved ? { ...base, ...saved, snapshot: { ...base.snapshot, ...saved.snapshot } } : base
}

/** The demo's Billing — one shared singleton across the Users & roles pages and the product switcher. */
export const crmSubscription = reactive<CrmSubscriptionState>(loadState())

export function saveCrmSubscription(): void {
  saveSnapshot(STORE_KEY, [JSON.parse(JSON.stringify(crmSubscription)) as CrmSubscriptionState])
}

/** Replace the whole state (scenario presets) and persist. */
export function setCrmSubscription(next: CrmSubscriptionState): void {
  Object.assign(crmSubscription, next, { snapshot: { ...next.snapshot } })
  saveCrmSubscription()
}
