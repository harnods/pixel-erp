/**
 * Payroll settings screen helpers. Read-only views over payrollStore: values Talenta
 * has sent per field, the accounts a pay item row can pick from the chart, and the last send.
 * Nothing here writes the payroll state.
 */
import {
  payroll, runs, currentVersionOf, payrollAccount, staffRows, fieldValue, dimensionFor, dimensionValue,
  type Run, type RunVersion,
} from './payrollStore'
import type { PayrollAccountType } from './payrollMaster'
import { coaRecords, isHeader } from './chartOfAccounts'

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
