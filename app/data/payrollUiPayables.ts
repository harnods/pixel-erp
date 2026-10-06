/**
 * Payroll payables (FG-5): read helpers for the Payables screen, built on payrollStore.
 * No engine rule lives here; every figure comes from the store's journals and payments.
 * No employee names (LR-7): branch totals only.
 */
import { computed } from 'vue'
import {
  payroll, runById, versionOf, liveJournals, payablesTracker, setVarianceNote, can, rupiah, monthLabel, dateLabel,
  periodLabel, tagsLabel, accountLabel, journalById, runStatus, bpjsComparison,
  type PayableRow, type Result, type BpjsBody,
} from './payrollStore'
import type { PayableParty } from './payrollMaster'

const toCents = (n: number) => Math.round(n * 100)
const wholeRupiah = (c: number) => (c >= 0 ? Math.floor((c + 50) / 100) : -Math.floor((-c + 50) / 100))

/** Cash & Bank accounts a payment can credit. */
export const cashAccounts = computed(() => payroll.accounts.filter((a) => a.type === 'cash' && !a.archived))
/** Accounts an over-payment or BPJS difference may post to (PSAK 201: never the payable itself). */
export const differenceAccounts = computed(() => payroll.accounts.filter((a) => (a.type === 'expense' || a.type === 'asset') && !a.archived))

/** Take-home pay of the run's posted version (TN-33: shown beside the Hutang Gaji amount). */
export function runTakeHome(runId: string): number {
  const run = runById(runId)
  const v = run ? versionOf(run, run.ledgerVersion) : undefined
  return v ? wholeRupiah(v.payload.employees.reduce((s, e) => s + toCents(e.take_home_pay), 0)) : 0
}

/** Take-home pay per branch for a split salary payment. Staff with no branch form "No branch". */
export function branchTakeHome(runId: string): { branch: string; amount: number; headcount: number }[] {
  const run = runById(runId)
  const v = run ? versionOf(run, run.ledgerVersion) : undefined
  if (!v) return []
  const m = new Map<string, { c: number; n: number }>()
  for (const e of v.payload.employees) {
    const b = e.branch_name || 'No branch'
    const x = m.get(b) ?? { c: 0, n: 0 }
    x.c += toCents(e.take_home_pay); x.n += 1
    m.set(b, x)
  }
  return [...m.entries()].map(([branch, x]) => ({ branch, amount: wholeRupiah(x.c), headcount: x.n })).sort((a, b) => a.branch.localeCompare(b.branch))
}

/** Banks used for each branch on the run's last split payment, so next month fills in. */
export function lastBranchBanks(): Record<string, string> {
  const p = [...payroll.payments].reverse().find((x) => x.kind === 'Salary' && x.splits.length && !x.voidedBy)
  return p ? Object.fromEntries(p.splits.map((s) => [s.branch, s.bank])) : {}
}

/** "Payroll 21 Jul-20 Aug 2026 v1": the reference the salary payment journal carries. */
export function salaryReference(runId: string): string {
  const run = runById(runId)
  return run ? `Payroll ${periodLabel(run.start, run.end)} v${run.ledgerVersion ?? run.currentVersion ?? 1}` : ''
}

/** A newer version waiting for review on a posted run (FG-5.3). */
export function versionWaiting(runId: string | null): boolean {
  const run = runById(runId)
  return !!run && (run.revised || runStatus(run) === 'Revised')
}

/** Open rows of one statutory party, oldest period first, for a multi-period deposit. */
export function openPeriodsOf(party: PayableParty, account: string): PayableRow[] {
  return payablesTracker().filter((r) => r.party === party && r.account === account && !r.runId && r.balance > 0).sort((a, b) => a.month.localeCompare(b.month))
}

/** Notes that explain a balance left open. Stored with the month's reconciliation notes so they reset with the sample. */
const noteKey = (row: PayableRow) => `payable:${row.key}`
export function payableNote(row: PayableRow): { note: string; by: string; at: string } | null {
  return payroll.recon.find((r) => r.month === row.month)?.notes[noteKey(row)] ?? null
}
export function setPayableNote(row: PayableRow, note: string): Result {
  if (!can('recon.note')) return { ok: false, message: 'Only the Accountant adds notes.' }
  return setVarianceNote(row.month, noteKey(row), { reason: 'Open balance', note })
}

/** Journal lines behind a tracker row, by dimension: what was owed and what paid it. */
export function payableDrill(row: PayableRow) {
  const owed = payroll.journals
    .filter((j) => j.taxMonth === row.month && (!row.runId || j.runId === row.runId) && ['Payroll', 'Difference', 'Reversal'].includes(j.type))
    .flatMap((j) => j.lines.filter((l) => l.account === row.account).map((l) => ({ number: j.number, date: dateLabel(j.date), type: j.type, tags: tagsLabel(l.tags) || 'No dimension', amount: l.credit - l.debit, runId: j.runId })))
  const paid = payroll.payments
    .filter((p) => p.account === row.account && p.periods.some((x) => x.month === row.month) && (!row.runId || p.runId === row.runId))
    .map((p) => {
      const j = journalById(p.journalId)
      const void_ = journalById(p.voidedBy)
      const line = p.periods.find((x) => x.month === row.month)!
      return { id: p.id, number: j?.number ?? '', date: dateLabel(p.date), bank: accountLabel(p.bank), amount: line.amount, billingCode: line.billingCode, ntpn: line.ntpn, voided: void_ ? `Voided by ${void_.number}` : null, warnings: p.warnings, splits: p.splits }
    })
  return { owed, paid }
}

/** Every payment, newest first, with its journal number and void state. */
export const paymentHistory = computed(() => [...payroll.payments].reverse().map((p) => {
  const j = journalById(p.journalId)
  const v = journalById(p.voidedBy)
  const run = runById(p.runId)
  return {
    id: p.id,
    number: j?.number ?? '',
    date: p.date,
    dateLabel: dateLabel(p.date),
    payable: p.kind === 'Salary' ? `Salary ${run ? periodLabel(run.start, run.end) : ''}` : `${p.party === 'Other' ? accountLabel(p.account) : p.party} ${p.periods.map((x) => monthLabel(x.month)).join(', ')}`,
    bank: p.splits.length ? `${p.splits.length} banks by branch` : accountLabel(p.bank),
    amount: p.amount,
    reference: j?.reference ?? '',
    billing: p.periods.map((x) => [x.billingCode, x.ntpn].filter(Boolean).join(' / ')).filter(Boolean).join('; '),
    bankDiffers: p.bankDiffers,
    warnings: p.warnings,
    voided: v ? `Voided by ${v.number}` : null,
    status: v ? 'Voided' : 'Posted',
  }
}))

/** After review, BPJS Pay offers the invoice amount for the month (FG-5.2). */
export function bpjsInvoiceTotal(month: string, party: PayableParty): number | null {
  if (party !== 'BPJS Kesehatan' && party !== 'BPJS Ketenagakerjaan') return null
  const c = bpjsComparison(month, party as BpjsBody)
  if (!c.invoice || !c.invoice.reviewed) return null
  return c.invoice.lines.reduce((s, l) => s + l.amount, 0)
}

/**
 * FG-5.3 / FG5-AC6: when a run in the period has an unfixed revision, the latest Talenta
 * figure for a statutory payable (from the newest version's draft) beside the ledger.
 * null when no run in the period is revised or the revision has no draft yet.
 */
export function latestTalentaFor(account: string, month: string): number | null {
  const runsM = payroll.runs.filter((r) => r.month === month && r.mode === 'Live')
  if (!runsM.some((r) => r.revised)) return null
  let total = 0
  for (const r of runsM) {
    if (r.revised) {
      const d = versionOf(r, r.currentVersion)?.draft
      if (!d) return null
      total += d.lines.filter((l) => l.account === account).reduce((x, l) => x + l.credit - l.debit, 0)
    } else {
      total += payroll.journals.filter((j) => j.runId === r.id && j.taxMonth === month && ['Payroll', 'Difference', 'Reversal'].includes(j.type))
        .flatMap((j) => j.lines).filter((l) => l.account === account).reduce((x, l) => x + l.credit - l.debit, 0)
    }
  }
  return total
}

/** dd/mm/yyyy (date picker) <-> yyyy-mm-dd (store). */
export function toIso(d: string): string { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }
export function fromIso(d: string): string { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}` }

/** Months with a posted payroll journal, newest first. */
export const payableMonths = computed(() => [...new Set(payablesTracker().map((r) => r.month))].sort().reverse())

/** Has the run a live journal (salary payments work on posted runs only)? */
export function isPosted(runId: string | null): boolean { return !!runId && liveJournals(runId).length > 0 }

export { rupiah }
