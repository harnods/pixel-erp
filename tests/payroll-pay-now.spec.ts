import { describe, it, expect, beforeEach } from 'vitest'
import {
  payroll, resetPayroll, runs, setPayrollViewAs, setPayItemMapping, payItemKey, liveJournals, journalTotals, sendFigures, currentVersionOf,
  payablesTracker, payNowParties, payNowBanks, postRunAndPay, spendMoneyPayment, syncSpendMoneyPayment, lockPeriod, PARTY_NAME,
} from '../app/data/payrollStore'
import { ACC } from '../app/data/payrollMaster'
import { cashTransactions, getCashTx } from '../app/data/bankTransactions'
import { setApprovalWorkflowActive } from '../app/data/approvalWorkflows'

/**
 * Pay now at posting: per party the Post drawer offers Record as payable (default) or Paid now
 * from a bank account. Paid now adds a Spend money on the journal date for that party's full
 * amount and records it on the payable (same path as Payables > Pay).
 */
const SEP = '1212 / monthly / 2026-08-21 / 2026-09-20'
const sep = () => runs.value.find((r) => r.key === SEP)!
const BCA = 'CA003' // Cash management > Bank BCA (1-10003)
const MANDIRI = 'CA-MU' // a leaf Mandiri account
const net = (account: string) => (currentVersionOf(sep())!.draft!.lines).filter((l) => l.account === account).reduce((s, l) => s + l.credit - l.debit, 0)
const row = (party: string) => payablesTracker('2026-09').filter((r) => r.party === party)

beforeEach(() => {
  // The seeded payroll approval rule (if still there) would send the post for approval.
  setApprovalWorkflowActive('awf-007', false)
  resetPayroll()
  setPayrollViewAs('Owner')
  setPayItemMapping(payItemKey('Insentif Penjualan', 'allowance'), { role: 'Earning', debit: ACC.salesSalaries, credit: ACC.hutangGaji })
})

describe('pay now at posting', () => {
  it('lists only the parties this journal owes, with the amount the journal credits them', () => {
    const parties = payNowParties(sep().id)
    expect(parties.length).toBeGreaterThan(0)
    for (const p of parties) {
      expect(p.payee).toBe(PARTY_NAME[p.party])
      expect(p.amount).toBe(p.accounts.reduce((s, a) => s + net(a.account), 0))
      expect(p.amount).toBeGreaterThan(0)
    }
    const staff = parties.find((p) => p.party === 'Staff')!
    expect(staff.amount).toBe(sendFigures(currentVersionOf(sep())).takeHome)
    expect(staff.accounts).toEqual([{ account: ACC.hutangGaji, amount: net(ACC.hutangGaji) }])
    // No PPh 26 in the sample: not offered.
    expect(parties.some((p) => p.party === 'DJP PPh 26')).toBe(net(ACC.pph26) > 0)
    // Banks: open rupiah cash and bank accounts only, no archived or parent accounts.
    const banks = payNowBanks().map((b) => b.id)
    expect(banks).toContain(BCA)
    expect(banks).not.toContain('CA006') // archived
    expect(banks).not.toContain('CA004') // SGD
    expect(banks).not.toContain('CA-MO') // has sub-accounts
    expect(banks).not.toContain('CA005') // credit card (liability)
  })

  it('Record as payable for every party: posts like Post journal, no Spend money', () => {
    const before = cashTransactions.length
    const r = postRunAndPay(sep().id, {})
    expect(r.ok).toBe(true)
    expect(r.message).toBe(`${r.number} posted.`)
    expect(cashTransactions.length).toBe(before)
    expect(row('Staff')[0]).toMatchObject({ paid: 0, balance: row('Staff')[0]!.owed })
  })

  it('Paid now: posts, adds one Spend money per party on the journal date, and the payable shows Paid', () => {
    const parties = payNowParties(sep().id)
    const staff = parties.find((p) => p.party === 'Staff')!
    const kes = parties.find((p) => p.party === 'BPJS Kesehatan')!
    const before = cashTransactions.length
    const r = postRunAndPay(sep().id, { payNow: { Staff: BCA, 'BPJS Kesehatan': MANDIRI } })
    expect(r.ok).toBe(true)
    const rp = (n: number) => `Rp${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
    expect(r.message).toBe(`${r.number} posted. Paid now: Staff ${rp(staff.amount)} from Bank BCA, BPJS Kesehatan ${rp(kes.amount)} from Mandiri Utilities.`)
    expect(liveJournals(sep().id).map((j) => j.number)).toEqual([r.number])
    expect(cashTransactions.length).toBe(before + 2)

    const s = row('Staff')[0]!
    expect(s).toMatchObject({ owed: staff.amount, paid: staff.amount, balance: 0, status: 'Paid' })
    expect(s.payments).toHaveLength(1)
    const tx = getCashTx(s.payments[0]!.cashTxId!)!
    expect(tx).toMatchObject({ kind: 'withdrawal', cashAccountId: BCA, contact: 'Staff', transactionDate: sep().end })
    expect(tx.lines).toEqual([{ accountCode: ACC.hutangGaji, description: s.label, taxId: '', amount: staff.amount }])
    expect(s.payments[0]!.number).toBe(`Spend money #${tx.number}`)
    const pj = payroll.journals.find((j) => j.number === `Spend money #${tx.number}`)!
    expect(pj).toMatchObject({ source: 'Spend money', type: 'Salary payment', date: sep().end, runId: sep().id })
    expect(pj.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([[ACC.hutangGaji, staff.amount, 0], ['1-10003', 0, staff.amount]])
    expect(journalTotals(pj).debit).toBe(staff.amount)

    const k = row('BPJS Kesehatan')[0]!
    expect(k).toMatchObject({ paid: kes.amount, balance: 0, status: 'Paid' })
    expect(getCashTx(k.payments[0]!.cashTxId!)).toMatchObject({ cashAccountId: MANDIRI, contact: 'BPJS Kesehatan' })

    // Parties left on Record as payable stay owed.
    for (const p of parties.filter((x) => x.party !== 'Staff' && x.party !== 'BPJS Kesehatan')) {
      expect(row(p.party).reduce((sum, x) => sum + x.paid, 0)).toBe(0)
    }
  })

  it('a party with two payable accounts gets one Spend money per account, the toast names the party total', () => {
    const tax = payNowParties(sep().id).find((p) => p.party === 'DJP PPh 21')!
    const r = postRunAndPay(sep().id, { payNow: { 'DJP PPh 21': BCA } })
    expect(r.ok).toBe(true)
    const rows = row('DJP PPh 21').filter((x) => tax.accounts.some((a) => a.account === x.account))
    expect(rows).toHaveLength(tax.accounts.length)
    for (const x of rows) expect(x).toMatchObject({ balance: 0, status: 'Paid' })
    expect(r.paid).toEqual([expect.objectContaining({ party: 'DJP PPh 21', amount: tax.amount, bank: 'Bank BCA' })])
  })

  it('edits and deletes of the Spend money follow the payable (OQ20)', () => {
    postRunAndPay(sep().id, { payNow: { Staff: BCA } })
    const s = () => row('Staff')[0]!
    const id = s().payments[0]!.cashTxId!
    expect(spendMoneyPayment(id)).toMatchObject({ key: s().key, amount: s().owed })
    expect(syncSpendMoneyPayment(id, null)).toMatchObject({ ok: true, removed: true })
    expect(s()).toMatchObject({ paid: 0, balance: s().owed })
    expect(s().status).not.toMatch(/Paid/)
  })

  it('refuses before anything posts: a party the journal does not owe, an unknown bank, a locked date', () => {
    const before = { cash: cashTransactions.length, journals: payroll.journals.length }
    if (!payNowParties(sep().id).some((p) => p.party === 'DJP PPh 26')) {
      expect(postRunAndPay(sep().id, { payNow: { 'DJP PPh 26': BCA } })).toMatchObject({ ok: false, message: 'This journal owes nothing to Tax office (PPh 26). Record it as payable.' })
    }
    expect(postRunAndPay(sep().id, { payNow: { Staff: 'CA006' } })).toMatchObject({ ok: false, message: 'Pick a bank account to pay Staff from.' })
    lockPeriod('2026-09', { confirm: true })
    expect(postRunAndPay(sep().id, { date: '2026-09-20', payNow: { Staff: BCA } }).ok).toBe(false)
    expect(cashTransactions.length).toBe(before.cash)
    expect(payroll.journals.length).toBe(before.journals)
    expect(liveJournals(sep().id)).toHaveLength(0)
  })
})
