/**
 * Payroll payables (FG-5): read helpers for the Payables screen, built on payrollStore.
 * No engine rule lives here; every figure comes from the store's journals and bank-matched payments.
 * No employee names (LR-7).
 */
import { computed } from 'vue'
import {
  payroll, runById, liveJournals, payablesTracker, monthLabel, dateLabel, periodLabel, tagsLabel, accountLabel, journalById,
  type PayableRow,
} from './payrollStore'

/** Journal lines behind a tracker row, by dimension: what was owed and the bank matches that paid it. */
export function payableDrill(row: PayableRow) {
  const owed = payroll.journals
    .filter((j) => j.taxMonth === row.month && j.source === 'Talenta payroll' && (!row.runId || j.runId === row.runId) && ['Payroll', 'Reversal'].includes(j.type))
    .flatMap((j) => j.lines.filter((l) => l.account === row.account).map((l) => ({ number: j.number, date: dateLabel(j.date), type: j.type, tags: tagsLabel(l.tags) || 'No dimension', amount: l.credit - l.debit, runId: j.runId })))
  const paid = row.payments.map((p) => ({ ...p, date: dateLabel(p.date) }))
  return { owed, paid }
}

/** Every bank-matched payment, newest first, with its journal number and bank statement line. */
export const paymentHistory = computed(() => [...payroll.payments].reverse().map((p) => {
  const j = journalById(p.journalId)
  const run = runById(p.runId)
  const line = payroll.bankLines.find((b) => b.id === p.statementLineId)
  return {
    id: p.id,
    number: j?.number ?? '',
    date: p.date,
    dateLabel: dateLabel(p.date),
    payable: p.kind === 'Salary' ? `Salary ${run ? periodLabel(run.start, run.end) : ''}` : `${p.party === 'Other' ? accountLabel(p.account) : p.party} ${monthLabel(p.month)}`,
    bank: accountLabel(p.bank),
    statement: line?.description ?? '',
    amount: p.amount,
  }
}))

/** dd/mm/yyyy (date picker) <-> yyyy-mm-dd (store). */
export function toIso(d: string): string { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }
export function fromIso(d: string): string { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}` }

/** Months with a posted payroll journal, newest first. */
export const payableMonths = computed(() => [...new Set(payablesTracker().map((r) => r.month))].sort().reverse())

/** Has the run a live journal? */
export function isPosted(runId: string | null): boolean { return !!runId && liveJournals(runId).length > 0 }
