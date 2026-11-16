/**
 * Credit Memo Report v3 — data contract (app/data/creditMemoReport.ts).
 * As-of semantics (POC + RFC §6.1), CM + DM, groups, ranges, number search,
 * show-zero toggles, export builder, presets, stored-filter normalization. No saved views (removed).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  creditMemoReport, emptyCmReportFilters, activeFilterCount, validateFilters, buildExport, amountPasses, EXPORT_DETAIL_HEADER,
  contactGroupsOf, contactOptions, CONTACT_GROUPS, PERIOD_PRESETS, resolvePreset,
  normalizeCmViewFilters, normalizeCmFilters,
  type CmReportFilters, type ReportMemo,
} from '~/data/creditMemoReport'
import { memoRemaining } from '~/data/creditMemos'
import { memoRemaining as dmRemaining } from '~/data/debitMemos'

const F = (p: Partial<CmReportFilters> = {}): CmReportFilters => ({ ...emptyCmReportFilters(), ...p })
const memos = (f: CmReportFilters): ReportMemo[] => creditMemoReport(f).flatMap((c) => c.memos)
const memo = (id: string, f = F()) => memos(f).find((m) => m.id === id)

describe('defaults', () => {
  it('as of SIM today, all types, show-zero toggles on', () => {
    const f = emptyCmReportFilters()
    expect(f.asOf).toBe('2026-08-22')
    expect(f.docType).toBe('all')
    expect(f.showZeroContacts).toBe(true)
    expect(f.showZeroMemos).toBe(true)
    expect(activeFilterCount(f)).toBe(0)
  })
  it('default as-of covers Open CM with entries, Closed CM, refund, DM vendor, 2-group customer', () => {
    const all = memos(F())
    expect(all.some((m) => m.docType === 'CM' && m.status === 'Open' && m.entries.length)).toBe(true)
    expect(all.some((m) => m.docType === 'CM' && m.status === 'Closed')).toBe(true)
    expect(all.some((m) => m.entries.some((e) => e.type === 'Refund'))).toBe(true)
    expect(creditMemoReport(F()).some((c) => c.kind === 'vendor')).toBe(true)
    expect(creditMemoReport(F()).some((c) => contactGroupsOf(c.id).length === 2)).toBe(true)
  })
})

describe('as-of semantics', () => {
  it('excludes memos issued after asOf; includes those on asOf', () => {
    expect(memo('cm-10091', F({ asOf: '2026-08-19' }))).toBeUndefined()
    expect(memo('cm-10091', F({ asOf: '2026-08-20' }))).toBeDefined()
  })
  it('entries dated after asOf are excluded and the balance is as it stood', () => {
    const m = memo('cm-10086', F({ asOf: '2026-08-13' }))!
    expect(m.entries.map((e) => e.date)).toEqual(['2026-08-06', '2026-08-13'])
    expect(m.remaining).toBe(5_000_000)
    expect(m.status).toBe('Open')
  })
  it('running balance starts at the original amount and ends at remaining', () => {
    for (const m of memos(F())) {
      let bal = m.originalAmount
      for (const e of m.entries) { expect(e.movement).toBeLessThan(0); bal += e.movement; expect(e.balance).toBe(bal) }
      expect(m.entries.at(-1)?.balance ?? m.originalAmount).toBe(m.remaining)
      expect(m.remaining).toBe(m.docType === 'CM' ? memoRemaining(m.id) : dmRemaining(m.id))
    }
  })
  it('no Saldo Awal / Issued / Reversal rows', () => {
    for (const m of memos(F())) for (const e of m.entries) expect(['Applied', 'Refund']).toContain(e.type)
  })
  it('status: Open while remaining > 0, Closed at 0', () => {
    expect(memo('cm-10086')!.status).toBe('Closed')
    expect(memo('cm-10089')!.status).toBe('Open')
    for (const m of memos(F())) expect(m.status).toBe(m.remaining > 0 ? 'Open' : 'Closed')
  })
  it('entry titles, links and hrefs', () => {
    const m = memo('cm-10089')!
    expect(m.number).toBe('Credit Memo #10089')
    expect(m.href).toBe('/credit-memos/cm-10089')
    expect(m.entries[0]).toMatchObject({ type: 'Applied', title: 'Credit Memo Applied #90100', titleHref: '/credit-memo-applications/cma-90100', linkedNo: 'Sales Invoice #40031, Sales Invoice #40131', linkedHref: '/sales-invoices/SI031' })
    const r = memo('cm-10090')!.entries.find((e) => e.type === 'Refund')!
    expect(r).toMatchObject({ title: 'Credit Memo Refund #10020', titleHref: '/credit-memo-refunds/cmr-10020', linkedNo: 'Customer requested cash refund' })
    const d = memo('dm-20090')!
    expect(d).toMatchObject({ docType: 'DM', number: 'Debit Memo #20090', href: '/debit-memos/dm-20090', contactId: 'V006' })
    expect(d.entries[0]).toMatchObject({ title: 'Debit Memo Refund #20020', titleHref: '/debit-memo-refunds/dmr-20020' })
  })
})

describe('doc type', () => {
  it('CM → customers only; DM → vendors only; all → both', () => {
    expect(creditMemoReport(F({ docType: 'CM' })).every((c) => c.kind === 'customer' && c.memos.every((m) => m.docType === 'CM'))).toBe(true)
    expect(creditMemoReport(F({ docType: 'DM' })).every((c) => c.kind === 'vendor' && c.memos.every((m) => m.docType === 'DM'))).toBe(true)
    const kinds = new Set(creditMemoReport(F()).map((c) => c.kind))
    expect(kinds).toEqual(new Set(['customer', 'vendor']))
  })
  it('contactOptions follows docType', () => {
    expect(contactOptions({ docType: 'CM' }).every((o) => o.value.startsWith('C'))).toBe(true)
    expect(contactOptions({ docType: 'DM' }).every((o) => o.value.startsWith('V'))).toBe(true)
    expect(contactOptions().length).toBe(contactOptions({ docType: 'CM' }).length + contactOptions({ docType: 'DM' }).length)
  })
})

describe('contacts and groups', () => {
  it('contactIds restricts the contacts', () => {
    expect(creditMemoReport(F({ contactIds: ['C006', 'V003'] })).map((c) => c.id).sort()).toEqual(['C006', 'V003'])
  })
  it('groups: mock mapping, vendors have none', () => {
    expect(CONTACT_GROUPS.map((g) => g.name)).toEqual(['Trading', 'F&B', 'Manufacturing'])
    expect(contactGroupsOf('C006')).toEqual(['grp-trading', 'grp-fnb'])
    expect(contactGroupsOf('V001')).toEqual([])
  })
  it("group mode 'all' (AND) vs 'either' (OR)", () => {
    const all = creditMemoReport(F({ groupIds: ['grp-trading', 'grp-fnb'], groupMode: 'all' })).map((c) => c.id)
    expect(all).toEqual(['C006'])
    const either = creditMemoReport(F({ groupIds: ['grp-trading', 'grp-fnb'], groupMode: 'either' })).map((c) => c.id)
    expect(either).toEqual(expect.arrayContaining(['C006', 'C013', 'C025', 'C001']))
    expect(either.some((id) => id.startsWith('V'))).toBe(false)
    expect(either).not.toContain('C017')
  })
})

describe('ranges and number search', () => {
  it('memo range filters on per-memo remaining', () => {
    const ms = memos(F({ memoCmp: 'between', memoMin: 5_000_000, memoMax: 8_000_000 }))
    expect(ms.length).toBeGreaterThan(0)
    for (const m of ms) { expect(m.remaining).toBeGreaterThanOrEqual(5_000_000); expect(m.remaining).toBeLessThanOrEqual(8_000_000) }
  })
  it('contact range filters on the contact total', () => {
    const cs = creditMemoReport(F({ contactCmp: 'between', contactMin: 8_000_000 }))
    expect(cs.map((c) => c.id).sort()).toEqual(['C013', 'C025', 'V001', 'V007'])
    expect(creditMemoReport(F({ contactCmp: 'between', contactMax: 0 })).every((c) => c.total === 0)).toBe(true)
  })
  it('AmountComparatorField comparators: gt / lt exclusive, between inclusive, unset passes', () => {
    expect(amountPasses(10, 'gt', 10, null)).toBe(false)
    expect(amountPasses(11, 'gt', 10, null)).toBe(true)
    expect(amountPasses(10, 'lt', null, 10)).toBe(false)
    expect(amountPasses(9, 'lt', null, 10)).toBe(true)
    expect(amountPasses(10, 'between', 10, 10)).toBe(true)
    expect(amountPasses(5, 'gt', null, null)).toBe(true)
    // gt reads only Min, lt only Max — a stale other bound is ignored.
    expect(amountPasses(50, 'gt', 10, 20)).toBe(true)
    const gt = creditMemoReport(F({ contactCmp: 'gt', contactMin: 8_000_000 }))
    expect(gt.every((c) => c.total > 8_000_000)).toBe(true)
  })
  it('memoNumber is a substring on the digits (leading # stripped); non-matching contacts dropped', () => {
    expect(memos(F({ memoNumber: '#10089' })).map((m) => m.id)).toEqual(['cm-10089'])
    expect(memos(F({ memoNumber: '1008' })).map((m) => m.id).sort()).toEqual(['cm-10080', 'cm-10086', 'cm-10087', 'cm-10088', 'cm-10089'])
    expect(creditMemoReport(F({ memoNumber: '2009' })).every((c) => c.kind === 'vendor')).toBe(true)
    expect(creditMemoReport(F({ memoNumber: '99999' }))).toEqual([])
  })
  it('validateFilters flags an inverted "Is between" range inline', () => {
    expect(validateFilters(F({ contactCmp: 'between', contactMin: 10, contactMax: 5 }))).toEqual({ contact: "Min can't be greater than max." })
    expect(validateFilters(F({ memoCmp: 'between', memoMin: 10, memoMax: 5 }))).toEqual({ memo: "Min can't be greater than max." })
    expect(validateFilters(F({ contactCmp: 'between', contactMin: 5, contactMax: 5, memoMin: null, memoMax: 1 }))).toEqual({})
    // gt / lt use one value, so they can't be inverted.
    expect(validateFilters(F({ contactCmp: 'gt', contactMin: 10, contactMax: 5 }))).toEqual({})
  })
})

describe('show-zero toggles', () => {
  it('default shows Rp0 contacts and memos', () => {
    expect(creditMemoReport(F()).find((c) => c.id === 'C017')?.total).toBe(0)
  })
  it('showZeroMemos=false drops closed memos (and contacts left empty)', () => {
    const ms = memos(F({ showZeroMemos: false }))
    expect(ms.every((m) => m.remaining > 0)).toBe(true)
    expect(creditMemoReport(F({ showZeroMemos: false })).some((c) => c.id === 'C017')).toBe(false)
  })
  it('showZeroContacts=false drops Rp0 contacts but keeps their closed memos elsewhere', () => {
    const cs = creditMemoReport(F({ showZeroContacts: false }))
    expect(cs.every((c) => c.total > 0)).toBe(true)
    expect(cs.map((c) => c.id)).not.toContain('C002')
  })
})

describe('totals and sorting', () => {
  it('contact total = Σ remaining of visible memos', () => {
    for (const c of creditMemoReport(F())) expect(c.total).toBe(c.memos.reduce((s, m) => s + Math.max(m.remaining, 0), 0))
  })
  it('contacts sorted by total desc then name; memos by remaining desc then issue date', () => {
    const cs = creditMemoReport(F())
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i - 1]!, b = cs[i]!
      expect(a.total > b.total || (a.total === b.total && a.name.localeCompare(b.name) <= 0)).toBe(true)
    }
    for (const c of cs) for (let i = 1; i < c.memos.length; i++) {
      const a = c.memos[i - 1]!, b = c.memos[i]!
      expect(a.remaining > b.remaining || (a.remaining === b.remaining && a.issueDate <= b.issueDate)).toBe(true)
    }
    expect(creditMemoReport(F()).find((c) => c.id === 'C013')!.memos.map((m) => m.id)).toEqual(['cm-10088', 'cm-10080'])
  })
})

describe('activeFilterCount (rule/filter-all-filters-active-count)', () => {
  it('counts ONE per active filter row, including each Hide Rp 0 toggle; not asOf', () => {
    expect(activeFilterCount(F({ asOf: '2026-01-01' }))).toBe(0)
    expect(activeFilterCount(F({ showZeroContacts: false, showZeroMemos: false }))).toBe(2)
    // 2 customers + 1 group still count one row each.
    expect(activeFilterCount(F({ contactIds: ['C001', 'C002'], groupIds: ['grp-fnb', 'grp-mfg'], contactCmp: 'gt', contactMin: 1, memoCmp: 'lt', memoMax: 2, memoNumber: '10', docType: 'CM' }))).toBe(6)
    // A comparator with no value is not an active filter.
    expect(activeFilterCount(F({ contactCmp: 'lt', contactMin: 5 }))).toBe(0)
  })
})

describe('export', () => {
  it('ExportModal column choice trims the detail sheet; Contact + Number always kept', () => {
    const x = buildExport(F(), ['Balance'])
    const dh = x.detail.findIndex((r) => r[0] === 'Contact')
    expect(x.detail[dh]).toEqual(['Contact', 'Number', 'Balance'])
    expect(x.detail.slice(dh + 1).every((r) => r.length === 3)).toBe(true)
    expect(buildExport(F()).detail[dh]).toEqual(EXPORT_DETAIL_HEADER)
  })
  it('summary + detail with header rows, IDR currency, integer amounts', () => {
    const x = buildExport(F())
    const sh = x.summary.findIndex((r) => r[0] === 'Contact')
    const dh = x.detail.findIndex((r) => r[0] === 'Contact')
    expect(sh).toBeGreaterThanOrEqual(0)
    expect(dh).toBeGreaterThanOrEqual(0)
    expect(x.summary[sh]).toContain('Currency')
    const body = x.summary.slice(sh + 1)
    expect(body.length).toBe(creditMemoReport(F()).length)
    for (const r of body) { expect(r.at(-1)).toBe('IDR'); expect(Number.isInteger(r[3])).toBe(true) }
    const dBody = x.detail.slice(dh + 1)
    expect(dBody.some((r) => r[4] === 'Credit Memo #10086')).toBe(true)
    expect(dBody.some((r) => r[4] === 'Credit Memo Applied #90098')).toBe(true)
  })
  it('zero-balance memos and contacts are always exported, whatever the toggles', () => {
    const x = buildExport(F({ showZeroContacts: false, showZeroMemos: false }))
    expect(x.summary.some((r) => r[0] === 'Santika Premiere Hotel' && r[3] === 0)).toBe(true)
    expect(x.detail.some((r) => r[4] === 'Credit Memo #10086' && r[7] === 'Closed')).toBe(true)
  })
  it('other filters still apply', () => {
    const x = buildExport(F({ docType: 'DM' }))
    expect(x.detail.some((r) => String(r[4]).startsWith('Credit Memo'))).toBe(false)
    expect(x.detail.some((r) => String(r[4]).startsWith('Debit Memo'))).toBe(true)
  })
})

describe('period presets', () => {
  it('labels and resolution against today', () => {
    expect(PERIOD_PRESETS.map((p) => p.label)).toEqual(['Custom', 'Today', 'End of this month', 'End of last month', 'End of this quarter', 'End of last year'])
    expect(resolvePreset('custom')).toBeNull()
    expect(resolvePreset('today')).toBe('2026-08-22')
    expect(resolvePreset('endThisMonth')).toBe('2026-08-31')
    expect(resolvePreset('endLastMonth')).toBe('2026-07-31')
    expect(resolvePreset('endThisQuarter')).toBe('2026-09-30')
    expect(resolvePreset('endLastYear')).toBe('2025-12-31')
    expect(resolvePreset('endLastMonth', '2026-01-15')).toBe('2025-12-31')
    expect(resolvePreset('endThisMonth', '2028-02-10')).toBe('2028-02-29')
    expect(resolvePreset('endThisQuarter', '2026-12-01')).toBe('2026-12-31')
  })
})

describe('stored filter normalization', () => {
  it('legacy shapes (keyword/txnTypes/statuses/showZero) normalize to defaults', () => {
    const { asOf: _a, ...defaults } = emptyCmReportFilters()
    expect(normalizeCmViewFilters({ keyword: 'abc', keywordColumn: 'all', customers: ['Kopi'], txnTypes: ['Issued'], statuses: ['Open'], showZero: false })).toEqual(defaults)
    expect(normalizeCmViewFilters(undefined)).toEqual(defaults)
  })
  it('views never store asOf; v3 fields round-trip; junk values dropped', () => {
    const f = normalizeCmViewFilters({ ...F({ docType: 'DM', contactIds: ['V001'], groupIds: ['grp-fnb', 'nope'], groupMode: 'either', memoMin: 1, memoNumber: '20', showZeroMemos: false }), asOf: '2026-01-01' })
    expect('asOf' in f).toBe(false)
    expect(f).toMatchObject({ docType: 'DM', contactIds: ['V001'], groupIds: ['grp-fnb'], groupMode: 'either', memoMin: 1, memoNumber: '20', showZeroMemos: false, showZeroContacts: true })
    expect(normalizeCmViewFilters({ docType: 'XX', contactMin: '5' })).toMatchObject({ docType: 'all', contactMin: null })
    // Legacy min/max-only views get an inferred comparator.
    expect(normalizeCmViewFilters({ contactMin: 1, contactMax: 9 })).toMatchObject({ contactCmp: 'between' })
    expect(normalizeCmViewFilters({ memoMax: 9 })).toMatchObject({ memoCmp: 'lt' })
    expect(normalizeCmViewFilters({ memoMin: 1 })).toMatchObject({ memoCmp: 'gt' })
    expect(normalizeCmViewFilters({ memoCmp: 'between', memoMin: 1 })).toMatchObject({ memoCmp: 'between' })
    expect(normalizeCmFilters({ docType: 'CM' }, '2026-08-01')).toMatchObject({ asOf: '2026-08-01', docType: 'CM' })
  })
})

describe('report page — no saved views, full screen in the toolbar', () => {
  const src = readFileSync(resolve(__dirname, '../app/components/pages/CreditMemoReportPage.vue'), 'utf8')
  it('renders no view tabs / All views drawer / view store', () => {
    for (const s of ['cmr-viewbar', "t('Add view')", "t('All views')", "t('Default view')", 'creditMemoViews', 'addCmView']) expect(src).not.toContain(s)
  })
  it('full-screen button sits in the toolbar icon group, before Export', () => {
    const tools = src.slice(src.indexOf('<MpButtonGroup class="cmr-tools">'), src.indexOf('</MpButtonGroup>'))
    expect(tools).toContain('ColumnSettingsMenu')
    expect(tools).toContain('left-icon="full-screen"')
    expect(tools.indexOf('ColumnSettingsMenu')).toBeLessThan(tools.indexOf('left-icon="full-screen"'))
  })
})
