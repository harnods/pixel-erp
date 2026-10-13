/**
 * Payroll settings screen helpers. Read-only views over payrollStore: values Talenta
 * has sent per field, the accounts a pay item row can pick from the chart, and the last send.
 * Nothing here writes the payroll state.
 */
import * as store from './payrollStore'
import {
  payroll, runs, currentVersionOf, payrollAccount, staffRows, fieldValue, accountLabel, isCostItem,
  type Run, type RunVersion, type PayItemMapping, type PayrollSettings, type Result,
} from './payrollStore'
import { SBU_KEY, TALENTA_FIELDS, type PayrollAccountType, type TalentaField } from './payrollMaster'
import { coaRecords, isHeader } from './chartOfAccounts'

// ── Groups ──────────────────────────────────────────────────────────────────

/**
 * The Talenta fields that may group staff, in TALENTA_FIELDS order. Job position and Job level are
 * left out: they describe a person, so a group can be one person and its ledger lines show that
 * person's pay. (The engine exports the same list as GROUP_FIELDS; this copy keeps the UI compiling
 * before that lands.)
 */
export const GROUP_FIELDS: TalentaField[] = TALENTA_FIELDS
  .map((f) => f.field)
  .filter((f) => ['organization_name', 'branch', 'cost_center', 'employment_status', `sbu:${SBU_KEY}`].includes(f))
export const isGroupField = (f: string) => (GROUP_FIELDS as string[]).includes(f)
export const groupFieldLabel = (f: string) => TALENTA_FIELDS.find((x) => x.field === f)?.label ?? f

/** 1 or 2 when a group row covers that few staff (their pay can be read from the ledger), else 0. */
export function fewStaff(row: { staff: number; fewStaff?: number }): 0 | 1 | 2 {
  const n = typeof row.fewStaff === 'number' ? row.fewStaff : row.staff
  return n === 1 || n === 2 ? n : 0
}
export function fewStaffMessage(n: 1 | 2): string {
  return `Covers ${n} staff, so their pay can be read from the ledger.`
}
/** True when any of the row's Talenta values contains the search text (case-insensitive). */
export function groupMatches(values: string[], query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || values.some((v) => v.toLowerCase().includes(q))
}

/** The send a run is read from: its current version, else its latest. */
export function sendOf(run: Run): RunVersion | undefined {
  return currentVersionOf(run) ?? run.versions[run.versions.length - 1]
}
/** The newest regular run Talenta has sent. */
export function latestRegularRun(): Run | undefined {
  return runs.value.find((r) => r.kind === 'Regular' && !!sendOf(r))
}

/** Every value Talenta has sent for a field, across all runs. */
export function valuesSeen(field: string): string[] {
  const out = new Set<string>()
  for (const r of payroll.runs) for (const v of r.versions) for (const e of staffRows(v.payload, { all: true })) { const x = fieldValue(e, field).trim(); if (x) out.add(x) }
  return [...out].sort((a, b) => a.localeCompare(b))
}
/** True when Talenta has sent at least one non-empty value for the field. */
export function fieldSent(field: string): boolean { return valuesSeen(field).length > 0 }

// ── Accounts from the chart ─────────────────────────────────────────────────

const COA_TYPE: Record<number, PayrollAccountType> = { 3: 'cash', 1: 'asset', 2: 'asset', 8: 'liability', 10: 'liability', 11: 'liability', 15: 'cogs', 16: 'expense', 17: 'expense' }
export interface AccountOption { value: string; label: string; type: PayrollAccountType; name: string }
/** Postable accounts of the given types: the payroll set plus every chart account (headers left out). */
export function accountChoices(types: PayrollAccountType[]): AccountOption[] {
  const out = new Map<string, AccountOption>()
  for (const a of payroll.accounts) if (!a.archived && types.includes(a.type)) out.set(a.code, { value: a.code, label: `${a.code} ${a.name}`, type: a.type, name: a.name })
  for (const c of coaRecords) {
    const type = COA_TYPE[c.categoryId]
    if (!type || !types.includes(type) || c.archived || out.has(c.code) || payrollAccount(c.code) || isHeader(c.id)) continue
    out.set(c.code, { value: c.code, label: `${c.code} ${c.name}`, type, name: c.name })
  }
  return [...out.values()].sort((a, b) => a.value.localeCompare(b.value))
}

// ── Cost accounts: one place (Groups own them, Pay items may pin) ──────────────
/*
 * Adapter over the engine's cost-account API (everyoneElseAccount, setEveryoneElseAccount,
 * costFollowsGroups, payItemPinned, setPayItemAccount(key, code | null)). When the engine has
 * them, these call through; until then they fall back to the old groupsCanChange flag so the
 * screens keep compiling and working on either engine.
 */
type Fn = (...a: any[]) => any
const api = store as unknown as Record<string, Fn | undefined>
/** The 'Everyone else' account when nothing is saved yet: 6-60101 Salaries. */
export const EVERYONE_ELSE_SEED = '6-60101'
/** Option value for "Group's expense account" in a cost item's account select. */
export const FOLLOW_GROUPS = '__groups'
/** Option value for 'Everyone else (…)' in a group's account select. */
export const EVERYONE_ELSE = '__everyone'

/** The account for staff in no group and for groups with no account of their own. */
export function everyoneElseAccount(s?: PayrollSettings): string {
  const own = (s ?? payroll.settings) as { everyoneElseAccount?: string | null }
  if (!s && api.everyoneElseAccount) return api.everyoneElseAccount() ?? EVERYONE_ELSE_SEED
  return own.everyoneElseAccount ?? EVERYONE_ELSE_SEED
}
export function setEveryoneElseAccount(code: string): Result {
  if (api.setEveryoneElseAccount) return api.setEveryoneElseAccount(code)
  ;(payroll.settings as { everyoneElseAccount?: string }).everyoneElseAccount = code
  return { ok: true }
}
/** 'Everyone else (6-60101 Salaries)': the group account select's empty choice. */
export function everyoneElseLabel(s?: PayrollSettings): string {
  return `Everyone else (${accountLabel(everyoneElseAccount(s))})`
}
/** A cost item's pinned account, or null when it follows each group's expense account. */
export function payItemPinned(m: PayItemMapping): string | null {
  if (api.payItemPinned) return api.payItemPinned(m) ?? null
  if (!isCostItem(m)) return null
  const pinned = (m as { pinned?: string | null }).pinned
  if (pinned !== undefined) return pinned
  return (m as { groupsCanChange?: boolean }).groupsCanChange ? null : m.debit
}
/** True when a cost item posts to each group's expense account (nothing pinned). */
export function costFollowsGroups(m: PayItemMapping): boolean {
  if (api.costFollowsGroups) return !!api.costFollowsGroups(m)
  return isCostItem(m) && !payItemPinned(m)
}
/**
 * Pick a pay item's account. For a cost item: a code pins it, null (or FOLLOW_GROUPS) follows the
 * groups. Deductions and tax items take their payable or receivable as before.
 */
export function setCostAccount(key: string, code: string | null): Result {
  const value = code === FOLLOW_GROUPS ? null : code
  const setAcc = api.setPayItemAccount as Fn
  if (api.payItemPinned) return setAcc(key, value)
  // Old engine: pin = flag off + account; follow = flag on (+ an account so the row is mapped).
  // Flip the flag first: the account write rebuilds the drafts, which must see the new flag.
  const row = payroll.settings.mapping.find((m) => m.key === key)
  const flag = api.setPayItemGroupsCanChange as Fn
  if (row && isCostItem(row)) { const f = flag(key, !value) as Result; if (!f.ok) return f }
  if (value) return setAcc(key, value)
  if (row && !row.debit) return setAcc(key, everyoneElseAccount())
  return { ok: true }
}
/** A pay item still holds the run: no type yet, or no account (a cost item that follows groups needs none). */
export function payItemNeedsAccount(m: PayItemMapping): boolean {
  if (!m.roleConfirmed || !m.role || !m.credit) return true
  return isCostItem(m) && costFollowsGroups(m) ? false : !m.debit
}
