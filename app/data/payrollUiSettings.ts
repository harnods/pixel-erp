/**
 * Payroll settings screen helpers. Read-only views over payrollStore: values Talenta
 * has sent per field, the accounts a pay item row can pick from the chart, and the last send.
 * Nothing here writes the payroll state.
 */
import {
  payroll, runs, currentVersionOf, payrollAccount, staffRows, fieldValue, dimensionFor, dimensionValue,
  type Run, type RunVersion,
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
/** Values of a linked field and the dimension value each lands on (null = unmatched). */
export function valueMatches(field: string): { value: string; tag: string | null; explicit: boolean }[] {
  const dim = dimensionFor(field)
  return valuesSeen(field).map((value) => ({ value, tag: dim ? dimensionValue(dim, value) : null, explicit: !!(dim && payroll.settings.groupMaps[dim]?.[value]) }))
}

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
