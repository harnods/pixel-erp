/**
 * Payroll payables tracker (FG-5): display helpers for the Payables screen and its
 * Simulate menu. No engine rule lives here; figures come from payrollStore.
 */
import {
  payroll, paymentsFor, runById, journalById, accountLabel, BANK_PAYMENT_KINDS,
  type PayableRow, type PayableFlag, type BankPaymentKind,
} from './payrollStore'

/** Chip label per flag code. */
export const FLAG_CHIP: Record<PayableFlag['code'], string> = {
  'bank-differs': 'Bank paid differs',
  'ebupot-differs': 'e-Bupot differs',
  'manual-journal': 'Manual journal',
}

/** Simulate menu entries: every bank reconciliation match the engine knows, in menu order. */
export const SIMULATE_BANK: { kind: BankPaymentKind; label: string }[] = BANK_PAYMENT_KINDS.map((k) => ({
  kind: k.kind,
  label: ({
    salary: 'Salary transfer',
    pph21: 'PPh 21 deposit',
    pph26: 'PPh 26 deposit',
    'bpjs-kesehatan': 'BPJS Kesehatan payment',
    'bpjs-ketenagakerjaan': 'BPJS Ketenagakerjaan payment',
    dplk: 'DPLK payment',
    partial: 'Salary transfer, half the balance',
    overpaid: 'Salary transfer, Rp250.000 over',
  } as Record<BankPaymentKind, string>)[k.kind] ?? k.label,
}))

export const isPph21Row = (r: PayableRow) => !r.runId && r.account === payroll.settings.taxPresets.pph21

/** Key of the salary row of the latest posted run. */
export function latestSalaryKey(rows: PayableRow[]): string | null {
  const salary = rows.filter((r) => r.runId)
  salary.sort((a, b) => (runById(b.runId!)?.end ?? b.month).localeCompare(runById(a.runId!)?.end ?? a.month))
  return salary[0]?.key ?? null
}
/** Key of the newest PPh 21 row. */
export function latestPph21Key(rows: PayableRow[]): string | null {
  return rows.filter(isPph21Row).sort((a, b) => b.month.localeCompare(a.month))[0]?.key ?? null
}

/** Bank reconciliation matches behind a row's \"paid\", from paymentsFor (salary by run, statutory by month). */
export function matchedPayments(r: PayableRow) {
  const pays = r.runId
    ? paymentsFor(r.runId).filter((p) => p.account === r.account && p.runId === r.runId)
    : payroll.payments.filter((p) => p.account === r.account && p.month === r.month && !p.runId)
  return [...pays].sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({
    id: p.id,
    number: journalById(p.journalId)?.number ?? '',
    date: p.date,
    bank: accountLabel(p.bank),
    statement: payroll.bankLines.find((b) => b.id === p.statementLineId)?.description ?? '',
    amount: p.amount,
  }))
}

/** Unique flags of a row, one chip per code. */
export function flagChips(r: PayableRow): { code: PayableFlag['code']; label: string; count: number }[] {
  const by = new Map<PayableFlag['code'], number>()
  for (const f of r.flags) by.set(f.code, (by.get(f.code) ?? 0) + 1)
  return [...by].map(([code, count]) => ({ code, label: FLAG_CHIP[code], count }))
}

/** \"16.644.111\", \"Rp16.644.111\" or \"16644111\" -> 16644111; null when empty or not a number. */
export function parseRupiahInput(s: string): number | null {
  const digits = s.replace(/,\d{1,2}$/, '').replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}
