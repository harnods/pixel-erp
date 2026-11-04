/**
 * Credit Memo report (Reports › Sales › Credit Memo) — data contract for the
 * Figma 4531-72195 layout:
 *   status        Open (remaining > 0) · Closed (remaining = 0)
 *   CM row        balance = openingBalanceOf(cm) — Case A Saldo Awal, Case B original
 *   entry rows    in-period applications / refunds / reversals (no "Issued"),
 *                 oldest first, running balance ending at remainingOf(cm)
 *   visibility    Closed CMs show by default; Status filter narrows; Case C and
 *                 voided / deleted CMs never show
 *   saved views   legacy views (showZero, no statuses) load as statuses: []
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  creditMemos, creditMemoApplications, creditMemoRefunds, syncInvoiceBalances,
  createRefund, createApplication, memoRemaining,
} from '~/data/creditMemos'
import {
  CM_STATUSES, statusOf, remainingOf, openingBalanceOf, entryRows,
  creditMemoLedger, creditMemoReport, reportFromLedger, emptyCmReportFilters,
  normalizeCmFilters, normalizeCmView, creditMemoViews, addCmView, updateCmView, deleteCmView,
  REPORT_PERIOD_START,
  type CreditMemo, type CmCustomer, type CmReportFilters,
} from '~/data/creditMemoReport'

const SNAP = {
  memos: JSON.parse(JSON.stringify(creditMemos)),
  apps: JSON.parse(JSON.stringify(creditMemoApplications)),
  refunds: JSON.parse(JSON.stringify(creditMemoRefunds)),
}
beforeEach(() => {
  creditMemos.splice(0, creditMemos.length, ...JSON.parse(JSON.stringify(SNAP.memos)))
  creditMemoApplications.splice(0, creditMemoApplications.length, ...JSON.parse(JSON.stringify(SNAP.apps)))
  creditMemoRefunds.splice(0, creditMemoRefunds.length, ...JSON.parse(JSON.stringify(SNAP.refunds)))
  syncInvoiceBalances()
})

const filters = (patch: Partial<CmReportFilters> = {}): CmReportFilters => ({ ...emptyCmReportFilters(), ...patch })
const allCms = (f: CmReportFilters = filters()) => creditMemoReport(f).flatMap((c) => c.cms)
const ledgerCm = (id: string) => creditMemoLedger().flatMap((c) => c.cms).find((cm) => cm.id === id)!

/** A hand-built CM for edge cases the mini-DB can't produce (reversals, Case C, voided). */
function mkCm(p: Partial<CreditMemo> & Pick<CreditMemo, 'id'>): CreditMemo {
  return {
    customerId: 'X1', cmNumber: `Credit Memo #${p.id}`, issueDate: '2026-07-01', description: 'Returned goods credit',
    originalAmount: 1_000, beginningBalance: 1_000, hasPriorData: true, mutations: [], ...p,
  }
}

describe('status — Open / Closed', () => {
  it('exposes exactly Open and Closed', () => {
    expect(CM_STATUSES).toEqual(['Open', 'Closed'])
  })
  it('remaining > 0 → Open, remaining = 0 → Closed', () => {
    expect(statusOf(mkCm({ id: 'a', beginningBalance: 1 }))).toBe('Open')
    expect(statusOf(mkCm({ id: 'b', beginningBalance: 0 }))).toBe('Closed')
    expect(statusOf(mkCm({ id: 'c', beginningBalance: 500, mutations: [{ id: 'm', date: '2026-08-02', type: 'Applied', transactionNo: 'x', description: '', amount: -500 }] }))).toBe('Closed')
  })
  it('matches the seed: unused / partly used memos are Open, used-up memos are Closed', () => {
    expect(statusOf(ledgerCm('cm-10088'))).toBe('Open')    // unused
    expect(statusOf(ledgerCm('cm-10089'))).toBe('Open')    // partly applied
    expect(statusOf(ledgerCm('cm-10087'))).toBe('Closed')  // applied in Jul + refunded in Aug
    expect(statusOf(ledgerCm('cm-10086'))).toBe('Closed')  // issued + used up in Aug
  })
})

describe('CM row — description + opening balance', () => {
  it('description is the memo first-line reason', () => {
    expect(ledgerCm('cm-10086').description).toBe('Returned goods credit')
    expect(ledgerCm('cm-10080').description).toBe('Volume discount adjustment')
    expect(ledgerCm('cm-10090').description).toBe('Price adjustment')
  })
  it('Case A (issued before the period) opens at the Saldo Awal', () => {
    const cm = ledgerCm('cm-10087') // 20M, 16.5M applied on 20 Jul
    expect(cm.issueDate < REPORT_PERIOD_START).toBe(true)
    expect(openingBalanceOf(cm)).toBe(cm.beginningBalance)
    expect(openingBalanceOf(cm)).toBe(3_500_000)
    expect(openingBalanceOf(ledgerCm('cm-10080'))).toBe(2_000_000)
  })
  it('Case B (issued in the period) opens at the original amount', () => {
    for (const id of ['cm-10086', 'cm-10088', 'cm-10089', 'cm-10090', 'cm-10091']) {
      const cm = ledgerCm(id)
      expect(cm.issueDate >= REPORT_PERIOD_START).toBe(true)
      expect(cm.beginningBalance).toBe(0)
      expect(openingBalanceOf(cm)).toBe(cm.originalAmount)
    }
  })
})

describe('entry rows', () => {
  it('never include the Issued mutation and run from the opening balance down to remaining', () => {
    for (const c of creditMemoLedger()) for (const cm of c.cms) {
      const rows = entryRows(cm)
      expect(rows.every((r) => (r.type as string) !== 'Issued')).toBe(true)
      expect(rows.map((r) => r.date)).toEqual([...rows.map((r) => r.date)].sort())
      let bal = openingBalanceOf(cm)
      for (const r of rows) { bal += r.movement; expect(r.balance).toBe(bal) }
      expect(rows.length ? rows.at(-1)!.balance : openingBalanceOf(cm)).toBe(remainingOf(cm))
      expect(remainingOf(cm)).toBe(memoRemaining(cm.id))
    }
  })
  it('a memo used up by several applications across invoices (Figma Closed example)', () => {
    const rows = entryRows(ledgerCm('cm-10086'))
    expect(rows.map((r) => ({ title: r.title, linkedNo: r.linkedNo, movement: r.movement, balance: r.balance }))).toEqual([
      { title: 'Credit Memo Applied #90096', linkedNo: 'Sales Invoice #40067', movement: -2_500_000, balance: 7_500_000 },
      { title: 'Credit Memo Applied #90097', linkedNo: 'Sales Invoice #40092', movement: -2_500_000, balance: 5_000_000 },
      { title: 'Credit Memo Applied #90098', linkedNo: 'Sales Invoice #40067, Sales Invoice #40092', movement: -5_000_000, balance: 0 },
    ])
    expect(rows[0]).toMatchObject({
      type: 'Applied', status: 'Closed', date: '2026-08-06',
      titleHref: '/credit-memo-applications/cma-90096', linkedHref: '/sales-invoices/SI067',
    })
    expect(rows[2]!.linkedHref).toBe('/sales-invoices/SI067') // first linked invoice
  })
  it('refund rows link to the refund and carry the reason as the second line', () => {
    const [r] = entryRows(ledgerCm('cm-10090'))
    expect(r).toMatchObject({
      type: 'Refund', status: 'Closed', title: 'Credit Memo Refund #10020', titleHref: '/credit-memo-refunds/cmr-10020',
      linkedNo: 'Customer requested cash refund', movement: -5_000_000, balance: 10_000_000,
    })
    expect(r!.linkedHref).toBeUndefined()
  })
  it('a refund without a reason reads "Refund to customer"', () => {
    const res = createRefund({ customerId: 'C013', payFromAccountId: 'CA003', date: '2026-08-22', memo: '', attachments: [], lines: [{ creditMemoId: 'cm-10088', reason: '  ', amount: 1_000_000 }] })
    expect(res.ok).toBe(true)
    expect(entryRows(ledgerCm('cm-10088')).at(-1)).toMatchObject({ type: 'Refund', linkedNo: 'Refund to customer', movement: -1_000_000, balance: 9_000_000 })
  })
  it('a Case A memo starts from its Saldo Awal and only lists in-period usage', () => {
    const rows = entryRows(ledgerCm('cm-10087')) // Jul application is before the period
    expect(rows.map((r) => [r.type, r.title, r.movement, r.balance])).toEqual([['Refund', 'Credit Memo Refund #10019', -3_500_000, 0]])
  })
  it('sorts ascending and adds reversals back (positive movement)', () => {
    const cm = mkCm({
      id: 'rev', beginningBalance: 1_000, mutations: [
        { id: 'r2', date: '2026-08-20', type: 'Reversal', transactionNo: 'Reversal #2', description: '', amount: 300 },
        { id: 'r1', date: '2026-08-10', type: 'Applied', transactionNo: 'Applied #1', description: '', amount: -600 },
        { id: 'r3', date: '2026-08-25', type: 'Refund', transactionNo: 'Refund #3', description: '', amount: -700 },
      ],
    })
    expect(entryRows(cm).map((r) => [r.id, r.movement, r.balance])).toEqual([['r1', -600, 400], ['r2', 300, 700], ['r3', -700, 0]])
    expect(entryRows(cm).at(-1)!.balance).toBe(remainingOf(cm))
  })
  it('a new application shows up as an entry row with its invoice', () => {
    createApplication({ customerId: 'C013', creditMemoId: 'cm-10080', date: '2026-08-22', memo: '', attachments: [], allocations: [{ invoiceId: 'SI138', amount: 2_000_000 }] })
    const cm = ledgerCm('cm-10080')
    expect(entryRows(cm)).toHaveLength(1)
    expect(entryRows(cm)[0]).toMatchObject({ linkedNo: 'Sales Invoice #40138', linkedHref: '/sales-invoices/SI138', balance: 0 })
    expect(statusOf(cm)).toBe('Closed')
  })
})

describe('report — default view', () => {
  it('shows Closed (zero-balance) memos by default', () => {
    const cms = allCms()
    expect(cms.map((c) => c.id)).toEqual(expect.arrayContaining(['cm-10086', 'cm-10087']))
    expect(cms.filter((c) => statusOf(c) === 'Closed').length).toBeGreaterThanOrEqual(2)
  })
  it('seeds what the Figma frame shows: an Open memo with an applied row, a Closed memo with several applied rows across invoices, a refund', () => {
    const cms = allCms()
    expect(cms.some((c) => statusOf(c) === 'Open' && entryRows(c).some((r) => r.type === 'Applied'))).toBe(true)
    const closedMulti = cms.find((c) => statusOf(c) === 'Closed' && entryRows(c).filter((r) => r.type === 'Applied').length >= 2)!
    expect(closedMulti).toBeDefined()
    expect(new Set(entryRows(closedMulti).flatMap((r) => (r.linkedNo ?? '').split(', '))).size).toBeGreaterThanOrEqual(2)
    expect(cms.some((c) => entryRows(c).some((r) => r.type === 'Refund'))).toBe(true)
  })
  it('customer total = Σ remaining of Open memos only; customers sorted by total desc', () => {
    const groups = creditMemoReport(filters())
    for (const g of groups) {
      expect(g.total).toBe(g.cms.reduce((s, cm) => s + Math.max(0, remainingOf(cm)), 0))
      expect(g.activeCount).toBe(g.cms.filter((cm) => statusOf(cm) === 'Open').length)
    }
    const totals = groups.map((g) => g.total)
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
    const santika = groups.find((g) => g.cms.some((cm) => cm.id === 'cm-10086'))!
    expect(santika.total).toBe(0)
    expect(santika.activeCount).toBe(0)
  })
  it('emptyCmReportFilters has no status filter and no legacy toggle', () => {
    const f = emptyCmReportFilters()
    expect(f.statuses).toEqual([])
    expect('showZero' in f).toBe(false)
  })
})

describe('report — Status filter', () => {
  it('Open keeps only memos with remaining credit', () => {
    const cms = allCms(filters({ statuses: ['Open'] }))
    expect(cms.length).toBeGreaterThan(0)
    expect(cms.every((c) => statusOf(c) === 'Open')).toBe(true)
    expect(cms.map((c) => c.id)).not.toContain('cm-10086')
  })
  it('Closed keeps only used-up memos (and drops customers left empty)', () => {
    const groups = creditMemoReport(filters({ statuses: ['Closed'] }))
    expect(groups.flatMap((g) => g.cms).map((c) => c.id).sort()).toEqual(['cm-10086', 'cm-10087'])
    expect(groups.every((g) => g.cms.length > 0 && g.total === 0)).toBe(true)
  })
  it('both statuses = no status filter', () => {
    expect(allCms(filters({ statuses: ['Open', 'Closed'] })).map((c) => c.id)).toEqual(allCms().map((c) => c.id))
  })
  it('combines with the transaction-type and customer filters', () => {
    expect(allCms(filters({ statuses: ['Closed'], txnTypes: ['Refund'] })).map((c) => c.id)).toEqual(['cm-10087'])
    expect(allCms(filters({ statuses: ['Open'], txnTypes: ['Refund'] })).map((c) => c.id)).toEqual(['cm-10090'])
    expect(allCms(filters({ statuses: ['Closed'], customers: ['santika'] })).map((c) => c.id)).toEqual(['cm-10086'])
  })
  it('keyword search on Description matches the CM description; on Number matches linked invoices', () => {
    expect(allCms(filters({ keyword: 'volume discount', keywordColumn: 'description' })).map((c) => c.id)).toEqual(['cm-10080'])
    expect(allCms(filters({ keyword: '#40092', keywordColumn: 'number' })).map((c) => c.id)).toEqual(['cm-10086'])
  })
})

describe('report — exclusions', () => {
  const ledger = (): CmCustomer[] => [{
    id: 'X1', name: 'Edge Co', cms: [
      mkCm({ id: 'open' }),
      mkCm({ id: 'closed', beginningBalance: 0 }),
      mkCm({ id: 'caseC', hasPriorData: false, beginningBalance: 0 }),
      mkCm({ id: 'voided', voided: true }),
      mkCm({ id: 'deleted', deleted: true }),
    ],
  }, {
    id: 'X2', name: 'Only Case C', cms: [mkCm({ id: 'caseC2', hasPriorData: false, beginningBalance: 0 })],
  }]
  it('Case C and voided / deleted memos never show; Closed memos do', () => {
    const groups = reportFromLedger(ledger(), filters())
    expect(groups.map((g) => g.id)).toEqual(['X1'])
    expect(groups[0]!.cms.map((c) => c.id)).toEqual(['open', 'closed'])
    expect(groups[0]!.total).toBe(1_000)
  })
  it('stay excluded under any Status filter', () => {
    expect(reportFromLedger(ledger(), filters({ statuses: ['Closed'] })).flatMap((g) => g.cms).map((c) => c.id)).toEqual(['closed'])
    expect(reportFromLedger(ledger(), filters({ statuses: ['Open', 'Closed'] })).flatMap((g) => g.cms).map((c) => c.id)).toEqual(['open', 'closed'])
  })
  it('a Case-B-like memo without prior data but with in-period activity is not Case C', () => {
    const cm = mkCm({ id: 'b', hasPriorData: false, beginningBalance: 0, mutations: [{ id: 'i', date: '2026-08-05', type: 'Issued', transactionNo: 'CM', description: '', amount: 1_000 }] })
    expect(reportFromLedger([{ id: 'X3', name: 'B', cms: [cm] }], filters()).flatMap((g) => g.cms).map((c) => c.id)).toEqual(['b'])
    expect(openingBalanceOf(cm)).toBe(1_000)
    expect(entryRows(cm)).toEqual([])
  })
})

describe('saved views — legacy tolerance', () => {
  const legacy = { keyword: 'grinder', keywordColumn: 'description', customerComparator: 'isAnyOf', customers: ['Kopi'], txnTypes: ['Applied'], showZero: true }

  it('normalizeCmFilters drops showZero and defaults statuses to []', () => {
    const f = normalizeCmFilters(legacy as never)
    expect(f).toEqual({ keyword: 'grinder', keywordColumn: 'description', customerComparator: 'isAnyOf', customers: ['Kopi'], txnTypes: ['Applied'], statuses: [] })
    expect('showZero' in f).toBe(false)
    expect(normalizeCmFilters({ ...legacy, showZero: false } as never).statuses).toEqual([])
  })
  it('keeps valid statuses, discards unknown values and fills missing fields', () => {
    expect(normalizeCmFilters({ statuses: ['Closed', 'Habis', 'Open'] } as never)).toEqual({ ...emptyCmReportFilters(), statuses: ['Closed', 'Open'] })
    expect(normalizeCmFilters(undefined)).toEqual(emptyCmReportFilters())
    expect(normalizeCmFilters({ txnTypes: ['Applied', 'Bogus'], customerComparator: 'nope' } as never)).toMatchObject({ txnTypes: ['Applied'], customerComparator: 'isAnyOf' })
  })
  it('a legacy view runs through the report like an unfiltered-status view', () => {
    const v = normalizeCmView({ id: 'v1', name: 'Old', filters: legacy as never })
    expect(v).toMatchObject({ id: 'v1', name: 'Old' })
    expect(() => creditMemoReport(v.filters)).not.toThrow()
  })
  it('add / update normalise what they store', () => {
    const v = addCmView({ name: 'Mine', filters: legacy as never })
    try {
      expect(v.filters.statuses).toEqual([])
      expect('showZero' in v.filters).toBe(false)
      updateCmView(v.id, { filters: { ...emptyCmReportFilters(), statuses: ['Closed'] } })
      expect(creditMemoViews.find((x) => x.id === v.id)!.filters.statuses).toEqual(['Closed'])
      updateCmView(v.id, { name: 'Renamed' })
      expect(creditMemoViews.find((x) => x.id === v.id)!).toMatchObject({ name: 'Renamed', filters: { statuses: ['Closed'] } })
    } finally { deleteCmView(v.id) }
  })

  describe('loading a persisted legacy snapshot', () => {
    afterEach(() => { vi.doUnmock('~/data/persist'); vi.resetModules() })
    it('the module loader upgrades views saved with showZero', async () => {
      vi.resetModules()
      vi.doMock('~/data/persist', async (orig) => ({
        ...(await orig<typeof import('~/data/persist')>()),
        loadSnapshot: (key: string) => (key === 'credit-memo-views-v2' ? [{ id: 'cmview-1', name: 'Legacy', filters: legacy }] : null),
        saveSnapshot: () => {},
      }))
      const mod = await import('~/data/creditMemoReport')
      expect(mod.creditMemoViews).toHaveLength(1)
      expect(mod.creditMemoViews[0]!.filters.statuses).toEqual([])
      expect('showZero' in mod.creditMemoViews[0]!.filters).toBe(false)
      expect(() => mod.creditMemoReport(mod.creditMemoViews[0]!.filters)).not.toThrow()
    })
  })
})
