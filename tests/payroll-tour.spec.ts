import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  payroll, runs, runStatus, runHolds, draftOf, runWarnings, headcountChanges, liveJournals, journalsOf, journalTotals,
  payablesTracker, accountLabel, revisionOf, sourceSummary, sendLog, connection, settings, payItemKey, mappingFor,
  payItemType, payItemAccount, groupRows, can, defaultEntryDate, checkEntryDate, draftSavedNote, noticesFor,
  claimsSummary, snapshotById, rupiah, dateLabel, wib, staffRows, currentVersionOf, manualJournalWarnings,
  payablePrefill, journalById, today, setGroupAccount, reverseAndRepost, postRun, type Run,
} from '../app/data/payrollStore'
import { ACC } from '../app/data/payrollMaster'
import { awaitingApprovalTasks } from '../app/data/tasks'
import { approvalWorkflows, TRANSACTION_TYPE_OPTIONS } from '../app/data/approvalWorkflows'
import { monthHeadcount } from '../app/data/payrollUiIntake'
import { paymentHistory } from '../app/data/payrollUiPayables'
import { cashTransactions } from '../app/data/bankTransactions'
import { cashAccounts } from '../app/data/cashAccounts'
import {
  PAYROLL_TOURS, PAYROLL_SETUP_TOUR, PAYROLL_RUN_TOUR, PAYROLL_RESEND_TOUR, PAYROLL_TOUR_MARKERS, PAYROLL_FEATURES,
  TOUR_WORK, tourCtx, sepId, SEP_KEY, SEP_LABEL, SEP_MONTH, NEW_ITEM, NEW_GROUP, AUG_MONTH, AUG_BPJS_KES, PAY_FROM,
  CASH_FORM_TARGET, augBpjsKey,
} from '../app/tours/payrollTours'
import type { AssetTour } from '../app/tours/assetTours'

const copyOf = (t: AssetTour, i: number) => { const s = t.steps[i]!; return `${s.title} ${s.body} ${s.watch ?? ''}` }
const allCopyOf = (t: AssetTour) => [t.blurb, t.closing, ...t.steps.map((_, i) => copyOf(t, i))].join(' ')
const sep = (): Run => runs.value.find((r) => r.key === SEP_KEY)!
const net = (lines: { account: string; debit: number; credit: number }[], acct: string) => lines.filter((l) => l.account === acct).reduce((s, l) => s + l.credit - l.debit, 0)

/**
 * Replays one tour's auto-play work through the payroll engine, step by step, as the runner does:
 * View as of the step (the last role named so far), then the step's run. `q` asserts the engine's
 * figure and that the step quotes it; `done` checks every Rp figure the tour quotes was proved.
 */
function player(t: AssetTour) {
  const work = TOUR_WORK[t.code]!
  const proved = new Set<string>()
  const roleAt = (i: number) => t.steps.slice(0, i + 1).map((s) => s.role).filter(Boolean).pop() ?? t.role
  return {
    at(i: number) { t.applyRole!(roleAt(i) as string); work[i]?.() },
    q(i: number, n: number, expected: number, sign = false) {
      expect(n, `step ${i + 1}`).toBe(expected)
      const s = (sign && n > 0 ? '+' : '') + rupiah(n)
      expect(copyOf(t, i), `step ${i + 1} quotes ${s}`).toContain(s)
      proved.add(s)
    },
    says(i: number, text: string) { expect(copyOf(t, i), `step ${i + 1}`).toContain(text) },
    done() {
      const quoted = new Set([...allCopyOf(t).matchAll(/[+-]?Rp[\d.]*\d/g)].map((m) => m[0]))
      expect([...quoted].filter((x) => !proved.has(x)), `${t.code} quotes figures no step proves`).toEqual([])
    },
  }
}

describe('payroll guided tours: shape', () => {
  it('three tours in the Payroll group of the one Guided tours menu', async () => {
    expect(PAYROLL_TOURS.map((t) => [t.code, t.name])).toEqual([
      ['PAY-1', 'Set up payroll'], ['PAY-2', 'Monthly payroll run'], ['PAY-3', 'When Talenta sends again'],
    ])
    const { TOUR_GROUPS, orderedGroups } = await import('../app/tours/tourRegistry')
    expect(TOUR_GROUPS.find((g) => g.key === 'payroll')!.tours).toEqual(PAYROLL_TOURS)
    expect(orderedGroups('/payroll-inbox')[0]!.tours.map((t) => t.code)).toEqual(['PAY-1', 'PAY-2', 'PAY-3'])
  })

  it('every step auto-plays: no step asks the reader to act', () => {
    for (const t of PAYROLL_TOURS) {
      expect(t.steps.every((s) => !s.action), t.code).toBe(true)
      expect(TOUR_WORK[t.code]).toHaveLength(t.steps.length)
    }
  })

  it('every step lands on a payroll route and one of the agreed payroll markers', () => {
    for (const t of PAYROLL_TOURS) {
      t.onReset!()
      for (const s of t.steps) {
        const route = typeof s.route === 'function' ? s.route() : s.route!
        // The one step Pay hands to Cash management: New spend money, prefilled with the payable.
        if (s.target === CASH_FORM_TARGET) {
          expect(route, `${t.code}: ${s.title}`).toBe(`/bank-withdrawals/new?payable=${encodeURIComponent(augBpjsKey())}`)
          expect(augBpjsKey()).not.toBe('')
          continue
        }
        expect(PAYROLL_TOUR_MARKERS as readonly string[], `${t.code}: ${s.title}`).toContain(s.target)
        expect(route, `${t.code}: ${s.title}`).toMatch(/^\/payroll-(inbox|payables|settings|runs\/run\d+)(\?.*)?$/)
      }
    }
  })

  it('every role a step names is a View as role', () => {
    const roles = ['Owner or LM', 'Other user']
    for (const t of PAYROLL_TOURS) for (const r of [t.role, ...t.steps.map((s) => s.role).filter(Boolean)]) expect(roles, t.code).toContain(r)
  })

  /**
   * Markers can be static (data-tour="x") or bound at runtime (:data-tour, or a lookup map such as
   * the Payables row markers); any quoted 'payroll-…' name in a payroll screen counts.
   * Enabled by the parent after the screen branch (DES) merges.
   */
  it('every marker the tours use is on a payroll screen', () => {
    const root = resolve(__dirname, '..', 'app', 'components')
    const files = [
      ...['pages', 'payroll'].flatMap((d) => readdirSync(join(root, d)).filter((f) => /^Payroll.*\.vue$/.test(f)).map((f) => join(root, d, f))),
      join(root, 'PayrollViewAsSwitcher.vue'),
    ]
    const src = files.map((f) => readFileSync(f, 'utf8')).join('\n')
    const markers = new Set([
      ...[...src.matchAll(/ data-tour="([^"]+)"/g)].map((m) => m[1]!),
      ...[...src.matchAll(/'(payroll-[a-z0-9-]+)'/g)].map((m) => m[1]!),
    ])
    for (const t of PAYROLL_TOURS) for (const s of t.steps) if (s.target !== CASH_FORM_TARGET) expect(markers, `${t.code}: ${s.title}`).toContain(s.target)
    // New spend money carries the payable banner the Pay step points at.
    expect(readFileSync(join(root, 'pages', 'CashTransactionFormPage.vue'), 'utf8')).toContain(`data-testid="${CASH_FORM_TARGET}"`)
  })

  it('copy follows the house rules and the glossary', () => {
    for (const t of PAYROLL_TOURS) {
      const copy = allCopyOf(t)
      expect(copy, t.code).not.toMatch(/\u2014|\bMVP\b|prototype|\bengine\b|undefined|NaN|\bsimulat|\bsnapshot|\brun key\b|\bpayload\b|\bwebhook\b/i)
      // The demo never narrates its own clicks, and never asks the reader to act.
      expect(copy, t.code).not.toMatch(/\bthe tour\b|\bclick\b|\bpress\b/i)
      // Glossary: staff not employees, no revision / acknowledge / holds / entry date / tag / cost center.
      expect(copy, t.code).not.toMatch(/\bemployees?\b|\brevision\b|\backnowledg|\bentry date\b|\btags?\b|\bcost cent(er|re)\b|\bDry run\b/i)
      expect(copy, t.code).not.toMatch(/\bHolds\b/)
      // Menu paths read like the screens: Cash management > New spend money, not 'Cash management, New'.
      expect(copy, t.code).not.toMatch(/\b(Inbox|Settings|Cash management), (Awaiting|Approval|New)\b/)
      // No payroll approval and no Jurnal role names other than the two access types (2026-10-13).
      expect(copy, t.code).not.toMatch(/Approve and post|Send for approval|Awaiting approval|Approval workflows|\bUltimate\b|\bAccountant\b|View only|\bBayu\b|\bRizal\b/)
      // No employee identifier, ever.
      expect(copy, t.code).not.toMatch(/EMP-\d|\b510\d\d\b|user_id|employee_id/)
      for (const s of t.steps) expect(s.title.length, `${t.code}: ${s.title}`).toBeLessThanOrEqual(80)
    }
  })

  it('quotes glossary labels exactly as the screens name them', () => {
    const all = PAYROLL_TOURS.map(allCopyOf).join(' ')
    for (const label of ['To fix before posting', 'Mark as checked', 'Post journal', 'Save draft', 'Only the Owner or a user with LM can post.', 'Owner or LM', 'Other user', 'Use v2 and repost', 'Journal date', 'Use group account', 'Use default account', 'Cash management > New spend money', 'Set up group', 'Talenta sent this period again', 'Groups', 'New spend money', 'Pay from', 'Spend money', 'Bank reconciliation', 'Source', 'Payments', 'Overdue', 'Paid late'])
      expect(all).toContain(label)
  })
})

describe('feature coverage', () => {
  it('every payroll feature names a step that exists', () => {
    const byCode = Object.fromEntries(PAYROLL_TOURS.map((t) => [t.code, t]))
    for (const f of PAYROLL_FEATURES) {
      const t = byCode[f.tour]
      expect(t, f.feature).toBeTruthy()
      expect(f.step, f.feature).toBeGreaterThanOrEqual(1)
      expect(f.step, f.feature).toBeLessThanOrEqual(t!.steps.length)
    }
  })

  it('the list holds every feature the brief asks the tours to touch', () => {
    const required = [
      'Connection status and Talenta company', 'How to send from Talenta', 'Payable accounts per party',
      'Pay item type from Talenta, with the header tip', 'Map a pay item to any expense account', 'Use group account',
      'Settings > Groups tab', 'Group by Talenta fields', 'Add dimension to groups, values prefilled by name', 'Group expense account and dimension value',
      'View as: Owner or LM and Other user', 'Save draft: Other user keeps the draft for someone who can post', 'Post journal: Owner or LM only, no approval',
      'Inbox runs', 'Sync log', 'To fix before posting: unmapped pay item', 'Map from the hold; the hold clears',
      'No group warning: new group posts to default accounts', 'Set up group clears the No group warning', 'Draft review lines by account and dimension',
      'Warnings and Mark as checked', 'Month headcount', 'Saved by note on the run', 'Journal date: default and locked period',
      'Post journal posts at once', 'Journals tab', 'Mapping used tab', 'Claims',
      'Payables: bank match pays salary', 'Payables: bank payment menu', 'Payables: bank differs flag',
      'Payables: overdue statutory payable', 'Pay opens New spend money prefilled', 'Saving the spend money pays the payable',
      'Payments: Source column', 'Manual journal on Salaries Payable warning', 'Simulate Talenta send (inbox menu)', 'Talenta sent this period again',
      'Versions: what changed', 'Save draft of a new version', 'Use v2 and repost on one journal date', 'Old journal reversed, new one posted',
      'Payables follow the repost', 'Missing pay item books and warns', 'Old Talenta to Expense sync blocked',
    ]
    const listed = PAYROLL_FEATURES.map((f) => f.feature)
    const missing = required.filter((r) => !listed.includes(r))
    expect(missing, 'features with no step').toEqual([])
    expect(new Set(listed).size).toBe(listed.length)
  })

  it('every step touches at least one feature, and each feature step points where the feature is', () => {
    for (const t of PAYROLL_TOURS) {
      const covered = new Set(PAYROLL_FEATURES.filter((f) => f.tour === t.code).map((f) => f.step))
      // PAY-3 step 1 only sets the scene (September posted and paid); every other step is a feature.
      const scene = t.code === 'PAY-3' ? [1] : []
      t.steps.forEach((_, i) => { if (!scene.includes(i + 1)) expect(covered.has(i + 1), `${t.code} step ${i + 1} touches no feature`).toBe(true) })
    }
    const target = (code: string, step: number) => PAYROLL_TOURS.find((t) => t.code === code)!.steps[step - 1]!.target
    const expectAt: Record<string, string> = {
      'How to send from Talenta': 'payroll-how-to-send', 'Payable accounts per party': 'payroll-payable-accounts',
      'Pay item type from Talenta, with the header tip': 'payroll-type-tip', 'Use group account': 'payroll-groups-can-change',
      'Group by Talenta fields': 'payroll-groupby', 'Add dimension to groups, values prefilled by name': 'payroll-group-dims',
      'Sync log': 'payroll-synclog', 'Month headcount': 'payroll-month-headcount', 'Journal date: default and locked period': 'payroll-journal-date',
      'View as: Owner or LM and Other user': 'payroll-viewas', 'Save draft: Other user keeps the draft for someone who can post': 'payroll-saved-draft',
      'Post journal: Owner or LM only, no approval': 'payroll-post', 'Saved by note on the run': 'payroll-saved-draft', 'Save draft of a new version': 'payroll-saved-draft',
      'Post journal posts at once': 'payroll-run-journals', 'Mapping used tab': 'payroll-mapping-used', 'Claims': 'payroll-claims',
      'Payables: bank payment menu': 'payroll-payables-simulate', 'Payables: bank differs flag': 'payroll-payables-flags',
      'Simulate Talenta send (inbox menu)': 'payroll-simulate-send', 'Talenta sent this period again': 'payroll-revision',
      'Versions: what changed': 'payroll-versions', 'Use v2 and repost on one journal date': 'payroll-repost',
      'Settings > Groups tab': 'payroll-groupby', 'Pay opens New spend money prefilled': CASH_FORM_TARGET,
      'Payables: overdue statutory payable': 'payroll-payables', 'Saving the spend money pays the payable': 'payroll-payables',
      'Payments: Source column': 'payroll-payables',
    }
    for (const f of PAYROLL_FEATURES) if (expectAt[f.feature]) expect(target(f.tour, f.step), f.feature).toBe(expectAt[f.feature])
  })
})

describe('PAY-1 Set up payroll (replay)', () => {
  const t = PAYROLL_SETUP_TOUR
  beforeEach(() => t.onReset!())

  it('replays with the quoted figures', () => {
    const p = player(t)
    // 1. Connection.
    p.at(0)
    expect(payroll.viewAs).toBe('Owner or LM')
    expect(can('connection')).toBe(true)
    expect(connection.value.status).toBe('Connected')
    expect(connection.value.companyId).toBe(1212)
    p.says(0, 'company 1212')
    expect(connection.value.sends).toBe(4)
    p.says(0, 'sent payroll 4 times')
    expect(wib(connection.value.lastAcceptedAt!)).toContain('21 Sep 2026')
    p.says(0, 'arrived on 21 Sep 2026')
    // 2. How to send: no work.
    p.at(1)
    // 3. Payable accounts per party.
    p.at(2)
    const pay = settings.value.payables
    for (const [party, acct] of [['Staff', ACC.hutangGaji], ['DJP PPh 21', ACC.pph21], ['Other', ACC.dplk]] as const) {
      expect(pay[party]).toBe(acct)
      p.says(2, accountLabel(acct))
    }
    // 4. Type from Talenta; the new item has no account.
    p.at(3)
    expect(settings.value.mapping).toHaveLength(20)
    p.says(3, '20 pay items')
    const ins = mappingFor(NEW_ITEM, 'allowance')!
    expect(ins.addedBy).toBe('Talenta')
    expect(payItemAccount(ins)).toBeNull()
    expect(payItemType(ins)).toBe('allowance')
    expect(runStatus(sep())).toBe('Held')
    // 5. Map it: Salaries, credit Salaries Payable; September builds.
    p.at(4)
    const m = mappingFor(NEW_ITEM, 'allowance')!
    expect([accountLabel(m.debit), accountLabel(m.credit)]).toEqual(['6-60101 Salaries', '2-20201 Salaries Payable'])
    p.says(4, 'debits 6-60101 Salaries and credits 2-20201 Salaries Payable')
    expect(runStatus(sep())).toBe('Ready to post')
    const d = draftOf(sep())!
    p.q(4, journalTotals(d).debit, 554_203_941)
    expect(d.lines).toHaveLength(26)
    p.says(4, '26 lines')
    // 6. Use group account: the Sales staff's incentive lands on the Sales groups' account.
    p.at(5)
    expect(mappingFor(NEW_ITEM, 'allowance')!.groupsCanChange).toBe(true)
    const src = draftOf(sep())!.lines.flatMap((l) => l.sources.filter((s) => s.item === NEW_ITEM && s.side === 'D').map((s) => ({ account: l.account, staff: s.staff.length })))
    expect([...new Set(src.map((x) => accountLabel(x.account)))]).toEqual(['6-60004 Sales Salaries'])
    expect(src.reduce((s, x) => s + x.staff, 0)).toBe(7)
    p.says(5, 'paid to 7 Sales staff')
    p.says(5, '6-60004 Sales Salaries')
    // 7. Group by Organization and Branch.
    p.at(6)
    expect(settings.value.groupBy).toEqual(['organization_name', 'branch'])
    const rows = groupRows()
    expect(rows).toHaveLength(9)
    p.says(6, '9 groups')
    expect(rows.find((g) => g.label === 'Operations, Jakarta HQ')!.staff).toBe(10)
    p.says(6, 'Operations, Jakarta HQ has 10 staff')
    expect(rows.every((g) => !g.isNew)).toBe(true)
    // 8. Add the dimensions you report on: Organization and Branch; values fill in by name.
    p.at(7)
    expect(settings.value.groupDimensions).toEqual(['Organization', 'Branch'])
    p.says(7, 'Organization and Branch are added')
    expect(groupRows().find((g) => g.label === 'Sales, Bandung')!.dimensions.find((x) => x.dimension === 'Branch')).toEqual({ dimension: 'Branch', value: 'Bandung', explicit: false })
    p.says(7, 'Sales, Bandung gets Branch Bandung by name')
    expect(settings.value).not.toHaveProperty('dimensionLinks')
    // 9. A group's account and a group's dimension value.
    p.at(8)
    const ops = groupRows().find((g) => g.label === 'Operations, Jakarta HQ')!
    expect(ops.account).toBe(ACC.directLabour)
    p.says(8, `Operations, Jakarta HQ posts to ${accountLabel(ACC.directLabour)}`)
    const kemang = staffRows(currentVersionOf(sep())!.payload).filter((e) => e.organization_name === 'Operations' && e.branch === 'Jakarta HQ')
    expect(kemang).toHaveLength(10)
    expect(kemang.filter((e) => /Kemang/.test(e.cost_center))).toHaveLength(9)
    p.says(8, '9 of the 10 Operations staff at Jakarta HQ work in the Kemang store')
    const hc = groupRows().find((g) => g.label === 'Human Capital, Surabaya')!
    expect(hc.staff).toBe(1)
    expect(hc.dimensions.find((x) => x.dimension === 'Branch')).toMatchObject({ value: 'Jakarta HQ', explicit: true })
    p.says(8, 'Human Capital, Surabaya carries Branch Jakarta HQ')
    // 10. Two access types; Other user can still change settings.
    p.at(9)
    expect(payroll.viewAs).toBe('Other user')
    expect([can('view'), can('setup'), can('review'), can('simulate'), can('post'), can('connection')]).toEqual([true, true, true, true, false, false])
    expect(setGroupAccount(groupRows().find((g) => g.label === 'Operations, Jakarta HQ')!.key, ACC.directLabour).ok).toBe(true)
    p.says(9, 'Groups can still be changed')
    // No Payroll journal approval type or rule is left in Settings > Approval workflows.
    expect(TRANSACTION_TYPE_OPTIONS.map((o) => o.label)).not.toContain('Payroll journal')
    expect(approvalWorkflows.some((r) => (r.transactionType as string) === 'payroll-journal')).toBe(false)
    // 11. Save draft: still Ready to post, saved-by note, the Owner or LM told.
    p.at(10)
    expect(runStatus(sep())).toBe('Ready to post')
    expect(liveJournals(sep().id)).toEqual([])
    const note = draftSavedNote(sep())!
    expect(note).toBe('Saved by Other user on 5 Oct 2026. Waiting for someone who can post.')
    p.says(10, note)
    p.q(10, journalTotals(draftOf(sep())!).debit, 554_203_941)
    expect(noticesFor('Owner or LM')[0]!.text).toContain('draft saved by Other user')
    expect(postRun(sep().id)).toMatchObject({ ok: false, status: 403, message: 'Only the Owner or a user with LM can post.' })
    p.says(11, 'Only the Owner or a user with LM can post.')
    // 12. Owner or LM: Post journal is there and posts directly.
    p.at(11)
    expect(payroll.viewAs).toBe('Owner or LM')
    expect(can('post')).toBe(true)
    p.done()
  })
})

describe('PAY-2 Monthly payroll run (replay)', () => {
  const t = PAYROLL_RUN_TOUR
  beforeEach(() => t.onReset!())

  it('starts grouped by Organization and Branch, as Set up payroll leaves it', () => {
    expect(settings.value.groupBy).toEqual(['organization_name', 'branch'])
    t.applyRole!(t.role as string)
    expect(payroll.viewAs).toBe('Other user')
  })

  it('replays with the quoted figures', () => {
    const p = player(t)
    const run = sep()
    expect(sepId()).toBe(run.id)
    // 1. Inbox: September held; July and August posted.
    p.at(0)
    expect(runStatus(run)).toBe('Held')
    const sum = sourceSummary(run.id)!
    expect(sum.headcount).toBe(40)
    p.says(0, '40 staff')
    p.q(0, sum.takeHome, 446_901_849)
    expect(payablesTracker('2026-07').every((r) => r.balance === 0)).toBe(true)
    expect(payablesTracker('2026-08').filter((r) => r.balance !== 0).map((r) => r.party)).toEqual(['BPJS Kesehatan'])
    p.says(0, 'only August\'s BPJS Kesehatan is still unpaid')
    // 2. Sync log.
    p.at(1)
    const row = sendLog.value[0]!
    expect([row.period, row.version, row.staff, row.payItems]).toEqual([SEP_LABEL, 'v1', 40, 23])
    p.says(1, 'v1 with 40 staff and 23 pay items')
    // 3. To fix before posting: the unmapped pay item.
    p.at(2)
    const hold = runHolds(run)
    expect(hold.map((h) => h.code)).toEqual(['unmapped-item'])
    const item = (hold[0]!.details as { items: { name: string; amount: number; employees: number }[] }).items[0]!
    expect(item.name).toBe(NEW_ITEM)
    p.q(2, item.amount, 10_500_000)
    expect(item.employees).toBe(7)
    p.says(2, 'for 7 staff')
    // 4. Map from the hold: it clears and the draft builds.
    p.at(3)
    expect(runHolds(run)).toEqual([])
    expect(runStatus(run)).toBe('Ready to post')
    p.q(3, journalTotals(draftOf(run)!).debit, 554_203_941)
    expect(draftOf(run)!.lines).toHaveLength(25)
    p.says(3, 'on 25 lines')
    // 5. Talenta sends again with a New group: v2 builds and warns, nothing holds.
    p.at(4)
    expect(run.currentVersion).toBe(2)
    expect(runHolds(run).map((h) => h.code)).not.toContain('new-group')
    const ng = runWarnings(run.id).filter((w) => w.code === 'no-group')
    expect(ng).toHaveLength(1)
    expect((ng[0]!.details as { groups: { label: string; staff: number }[] }).groups).toEqual([{ key: 'organization_name=operations|branch=medan', label: NEW_GROUP, staff: 2 }])
    p.says(4, `${NEW_GROUP} with 2 staff`)
    // 6. Set up group: the warning clears.
    p.at(5)
    const g = groupRows().find((x) => x.label === NEW_GROUP)!
    expect([g.isNew, g.staff, g.account]).toEqual([false, 2, ACC.directLabour])
    // Medan fills the group's Branch by name once the value exists; nothing is picked by hand.
    expect(g.dimensions.find((x) => x.dimension === 'Branch')).toEqual({ dimension: 'Branch', value: 'Medan', explicit: false })
    p.says(5, `${NEW_GROUP}: 2 staff, ${accountLabel(ACC.directLabour)}, Branch Medan`)
    expect(runWarnings(run.id).some((w) => w.code === 'no-dimension-value')).toBe(false)
    expect(runHolds(run)).toEqual([])
    expect(runStatus(run)).toBe('Ready to post')
    // 7. Draft review lines by account and dimension.
    p.at(6)
    const d = draftOf(run)!
    p.q(6, journalTotals(d).debit, 554_203_941)
    expect(d.lines).toHaveLength(26)
    const medan = d.lines.find((l) => l.account === ACC.directLabour && l.tags.Organization === 'Operations' && l.tags.Branch === 'Medan')!
    p.q(6, medan.debit, 36_204_342)
    // 8. Warnings, all marked as checked: every access type gets the headcount warning now.
    p.at(7)
    const w = runWarnings(run.id)
    expect(w.map((x) => x.code)).toEqual([...Array(8).fill('large-change'), 'headcount'])
    p.says(7, '9 warnings')
    p.says(7, '8 lines that moved and a headcount change')
    expect(w.every((x) => !!x.acknowledged)).toBe(true)
    expect(payroll.settings.limits.largeChangePct).toBe(10)
    p.says(7, 'more than 10%')
    p.q(7, payroll.settings.limits.largeChangeAmount, 1_000_000)
    // 9. Month headcount: everyone who reaches Payroll sees it.
    p.at(8)
    expect(payroll.viewAs).toBe('Other user')
    const mh = monthHeadcount(SEP_MONTH)
    expect([mh.current, mh.joined, mh.left, mh.moved.length]).toEqual([40, 1, 1, 3])
    p.says(8, '40 staff in September: 1 joined, 1 left and 3 moved')
    expect(JSON.stringify(headcountChanges(run.id))).not.toMatch(/EMP-\d|\b510\d\d\b/)
    // 10. Other user saves the draft: nothing posts.
    p.at(9)
    expect(runStatus(run)).toBe('Ready to post')
    expect(liveJournals(run.id)).toEqual([])
    p.says(9, draftSavedNote(run)!)
    // 11. Journal date: default period end; a locked period is refused.
    p.at(10)
    expect(payroll.viewAs).toBe('Owner or LM')
    expect(dateLabel(defaultEntryDate(run))).toBe('20 Sep 2026')
    p.says(10, 'Journal date 20 Sep 2026')
    expect(checkEntryDate('2026-07-31')).toMatch(/locked/)
    p.says(10, 'July is locked')
    // 12. Post journal posts at once: PAY-0003, no approval, no Inbox task.
    p.at(11)
    expect(runStatus(run)).toBe('Posted')
    const j = liveJournals(run.id)[0]!
    expect([j.number, dateLabel(j.date), j.postedBy]).toEqual(['PAY-0003', '20 Sep 2026', 'Rizal Candra'])
    p.says(11, 'PAY-0003, 20 Sep 2026')
    p.q(11, journalTotals(j).debit, 554_203_941)
    expect(draftSavedNote(run)).toBeNull()
    expect(awaitingApprovalTasks.some((x) => x.link === `/payroll-runs/${run.id}`)).toBe(false)
    // 13. Mapping used: the settings the journal was built from.
    p.at(12)
    const snap = snapshotById(j.snapshotId)!
    const used = snap.settings.mapping.find((x) => x.key === payItemKey(NEW_ITEM, 'allowance'))!
    expect(accountLabel(used.debit)).toBe('6-60004 Sales Salaries')
    p.says(12, 'Insentif Penjualan went to 6-60004 Sales Salaries')
    // 14. Claims.
    p.at(13)
    const cl = claimsSummary(run.id)
    p.q(13, cl.total, 3_000_000)
    expect(cl.rows.reduce((s, r) => s + r.employees, 0)).toBe(6)
    expect([...new Set(cl.rows.map((r) => [r.item, r.account].join(' | ')))]).toEqual(['Reimbursement Medical | 6-60106 Medical Expense'])
    p.says(13, 'Reimbursement Medical: Rp3.000.000 for 6 staff on 6-60106 Medical Expense')
    // 15. Bank match pays the salary.
    p.at(14)
    const sal = () => payablesTracker(SEP_MONTH).find((r) => r.runId === run.id)!
    const s16 = sal()
    p.q(14, s16.owed, 446_901_849); p.q(14, s16.balance, 0)
    expect(s16.payments.map((x) => [x.number, dateLabel(x.date)])).toEqual([['BNK-0012', '25 Sep 2026']])
    p.says(14, 'paid by BNK-0012 on 25 Sep 2026')
    expect(net(j.lines, ACC.hutangGaji)).toBe(446_901_849)
    // 16. A second bank line over the run.
    p.at(15)
    const s17 = sal()
    expect(s17.payments.map((x) => x.number)).toEqual(['BNK-0012', 'BNK-0013'])
    p.q(15, s17.payments[1]!.amount, 250_000)
    expect(dateLabel(s17.payments[1]!.date)).toBe('26 Sep 2026')
    p.says(15, 'BNK-0013 pays Rp250.000 more on 26 Sep 2026')
    // 17. Bank differs flag on the row.
    p.at(16)
    const s18 = sal()
    expect(s18.flags.map((f) => f.code)).toEqual(['bank-differs'])
    p.q(16, s18.paid, 447_151_849); p.q(16, s18.owed, 446_901_849); p.q(16, s18.paid - s18.owed, 250_000)
    // 18. August BPJS Kesehatan: still owed, past its due date (the sample data leaves it unpaid).
    p.at(17)
    const kes = () => payablesTracker(AUG_MONTH).find((r) => r.party === 'BPJS Kesehatan')!
    const k19 = kes()
    expect([k19.label, k19.account, k19.paid, k19.status, k19.dueLabel]).toEqual([AUG_BPJS_KES, ACC.bpjsKes, 0, 'Overdue', '10 Sep 2026'])
    p.q(17, k19.balance, 16_102_029)
    p.says(17, `${AUG_BPJS_KES}: Rp16.102.029 still owed, due ${k19.dueLabel}, ${k19.statusLabel}.`)
    expect(k19.statusLabel).toBe('Overdue 25 days')
    expect(payablesTracker().filter((r) => r.overdueDays > 0).map((r) => r.key)).toEqual([k19.key])
    // 19. Pay: New spend money prefilled with the payee, the payable account and the open amount.
    p.at(18)
    const pre = payablePrefill(augBpjsKey())!
    expect([pre.payee, pre.account, pre.label]).toEqual(['BPJS Kesehatan', ACC.bpjsKes, AUG_BPJS_KES])
    p.q(18, pre.amount, 16_102_029)
    expect(cashAccounts.some((a) => a.name === PAY_FROM && !a.isArchived)).toBe(true)
    p.says(18, `Pay from ${PAY_FROM} to ${pre.payee}: one line on ${accountLabel(pre.account)}`)
    // 20. Saving the spend money pays the payable: paid in full, after the due date.
    const before = cashTransactions.length
    p.at(19)
    const k21 = kes()
    p.q(19, k21.paid, 16_102_029); p.q(19, k21.balance, 0)
    expect([k21.status, k21.statusLabel]).toEqual(['Paid late', 'Paid late, 25 days'])
    p.says(19, `paid Rp16.102.029, balance Rp0, ${k21.statusLabel}.`)
    const tx = cashTransactions.find((x) => x.kind === 'withdrawal' && x.memo === pre.memo)!
    expect(cashTransactions.length - before).toBeLessThanOrEqual(1)
    expect([tx.contact, tx.lines.map((l) => [l.accountCode, l.amount])]).toEqual(['BPJS Kesehatan', [[ACC.bpjsKes, 16_102_029]]])
    const pj = journalById(payroll.payments.at(-1)!.journalId)!
    expect([pj.source, pj.type, pj.number, pj.date]).toEqual(['Spend money', 'Statutory payment', `Spend money #${tx.number}`, today()])
    expect(pj.lines.map((l) => [l.account, l.debit, l.credit])).toEqual([[ACC.bpjsKes, 16_102_029, 0], [cashAccounts.find((a) => a.name === PAY_FROM)!.code, 0, 16_102_029]])
    // 21. Payments: Source says where each came from.
    p.at(20)
    const ph = paymentHistory.value
    expect(ph[0]).toMatchObject({ payable: AUG_BPJS_KES, statement: 'Spend money', amount: 16_102_029 })
    p.q(20, ph[0]!.amount, 16_102_029)
    for (const n of ['BNK-0012', 'BNK-0013']) expect(ph.find((x) => x.number === n)!.statement, n).toBe('Bank reconciliation')
    p.says(20, 'BNK-0012 and BNK-0013 came from Bank reconciliation')
    // 22. Manual journal on Salaries Payable: the run and the row warn.
    p.at(21)
    const mj = manualJournalWarnings(SEP_MONTH)
    expect(mj.map((x) => [x.number, dateLabel(x.date)])).toEqual([['JV-0001', '20 Sep 2026']])
    p.q(21, mj[0]!.amount, 1_500_000)
    expect(mj[0]!.accounts).toEqual([ACC.salaries, ACC.hutangGaji])
    p.says(21, 'JV-0001 posts Rp1.500.000 to Salaries and Salaries Payable on 20 Sep 2026')
    expect(runWarnings(run.id).some((x) => x.code === 'manual-journal' && !x.acknowledged)).toBe(true)
    expect(sal().flags.map((f) => f.code)).toEqual(['bank-differs', 'manual-journal'])
    p.done()
  })
})

describe('PAY-3 When Talenta sends again (replay)', () => {
  const t = PAYROLL_RESEND_TOUR
  beforeEach(() => t.onReset!())

  it('replays with the quoted figures', () => {
    const p = player(t)
    const run = sep()
    // 1. September posted (no approval), salary paid.
    p.at(0)
    expect(runStatus(run)).toBe('Posted')
    const j1 = liveJournals(run.id)[0]!
    expect([j1.number, dateLabel(j1.date), j1.postedBy]).toEqual(['PAY-0003', '20 Sep 2026', 'Rizal Candra'])
    p.q(0, journalTotals(j1).debit, 554_203_941)
    expect(payablesTracker(SEP_MONTH).find((r) => r.runId === run.id)!.payments.map((x) => x.number)).toEqual(['BNK-0012'])
    // 2. Talenta sends September again (the inbox menu).
    p.at(1)
    expect([run.currentVersion, run.ledgerVersion]).toEqual([2, 1])
    const row = sendLog.value[0]!
    expect([row.period, row.version, row.staff]).toEqual([SEP_LABEL, 'v2', 40])
    p.says(1, `${SEP_LABEL} v2 arrives with 40 staff`)
    // 3. What v2 changes.
    p.at(2)
    expect(runStatus(run)).toBe('Revision ready')
    const s = revisionOf(run.id)!.summary
    p.q(2, s.takeHome.change, 1_732_959, true)
    p.q(2, s.pph21.change, 197_041, true)
    p.q(2, s.bpjs.change, 244_800, true)
    expect(s.joined + s.left + s.amountChanged).toBe(4)
    p.says(2, '4 staff changed')
    expect(liveJournals(run.id).map((x) => x.number)).toEqual(['PAY-0003'])
    // 4. Versions: the lines that move.
    p.at(3)
    const moved = (label: string) => s.moved.find((x) => x.label === label)!.change
    p.q(3, moved('6-60101 Salaries | Human Capital, Jakarta HQ'), 1_648_600, true)
    p.q(3, moved('6-60101 Salaries | Human Capital, Surabaya'), 551_200, true)
    // 5. Other user saves v2: reposting is posting, so it waits.
    p.at(4)
    expect(payroll.viewAs).toBe('Other user')
    expect(reverseAndRepost(run.id)).toMatchObject({ ok: false, status: 403, message: 'Only the Owner or a user with LM can post.' })
    expect(runStatus(run)).toBe('Revision ready')
    p.says(4, draftSavedNote(run)!)
    expect(liveJournals(run.id).map((x) => x.number)).toEqual(['PAY-0003'])
    // 6. Use v2 and repost: one date.
    p.at(5)
    expect(payroll.viewAs).toBe('Owner or LM')
    expect(can('post')).toBe(true)
    expect(dateLabel(defaultEntryDate(run))).toBe('20 Sep 2026')
    p.says(5, 'Journal date 20 Sep 2026 for both journals')
    p.q(5, journalTotals(draftOf(run)!).debit, 556_403_741)
    // 7. PAY-0003 reversed in full, PAY-0005 posted in full, one date.
    p.at(6)
    const js = journalsOf(run.id).filter((x) => x.source === 'Talenta payroll')
    expect(js.map((x) => [x.number, x.type, dateLabel(x.date)])).toEqual([
      ['PAY-0003', 'Payroll', '20 Sep 2026'], ['PAY-0004', 'Reversal', '20 Sep 2026'], ['PAY-0005', 'Payroll', '20 Sep 2026'],
    ])
    p.says(6, 'PAY-0004 reverses')
    p.q(6, journalTotals(js[1]!).debit, 554_203_941)
    p.q(6, journalTotals(js[2]!).debit, 556_403_741)
    p.says(6, 'both on 20 Sep 2026')
    expect(liveJournals(run.id).map((x) => x.number)).toEqual(['PAY-0005'])
    expect([run.ledgerVersion, runStatus(run)]).toEqual([2, 'Posted'])
    expect(draftSavedNote(run)).toBeNull()
    // 8. Payables follow.
    p.at(7)
    const sal = payablesTracker(SEP_MONTH).find((r) => r.runId === run.id)!
    p.q(7, sal.owed, 448_634_808); p.q(7, sal.paid, 446_901_849); p.q(7, sal.balance, 1_732_959)
    expect(sal.flags.map((f) => f.code)).toEqual(['bank-differs'])
    // 9. October without the meal allowance: books and warns.
    p.at(8)
    const oct = runs.value.find((r) => r.id === tourCtx.octId)!
    expect(oct.end).toBe('2026-10-20')
    expect(runHolds(oct)).toEqual([])
    expect(runStatus(oct)).toBe('Ready to post')
    const miss = runWarnings(oct.id).filter((x) => x.code === 'missing-component')
    expect(miss.map((x) => (x.details as { name: string }).name)).toEqual(['Uang Makan'])
    p.q(8, (miss[0]!.details as { lastAmount: number }).lastAmount, 18_375_000)
    p.q(8, journalTotals(draftOf(oct)!).debit, 535_367_866)
    // 10. The old Talenta to Expense sync is blocked.
    p.at(9)
    const call = payroll.oldSync.at(-1)!
    expect([call.outcome, dateLabel(call.date), call.pattern]).toEqual(['Blocked', '20 Sep 2026', 'Payroll'])
    p.q(9, call.amount, 480_000_000)
    p.says(9, 'dated 20 Sep 2026 is blocked')
    p.done()
  })

  it('reset clears the previous run', () => {
    t.applyRole!(t.role as string)
    TOUR_WORK['PAY-3']![0]!()
    expect(runStatus(sep())).toBe('Posted')
    t.onReset!()
    expect(tourCtx).toEqual({ runId: '', octId: '' })
    expect(runStatus(sep())).toBe('Held')
  })
})

/** Holds regardless of the tours: what the payroll screens render carries counts, never employee ids. */
describe('payroll payloads the screens render carry no employee data', () => {
  beforeEach(() => PAYROLL_RUN_TOUR.onReset!())
  it('headcount, warnings, holds, group rows and the change summary have no EMP- or user_id values', () => {
    const leak = /EMP-\d|\b510\d\d\b|employee_id|user_id/
    const run = sep()
    for (const [i, w] of TOUR_WORK['PAY-2']!.entries()) { PAYROLL_RUN_TOUR.applyRole!(PAYROLL_RUN_TOUR.steps.slice(0, i + 1).map((s) => s.role).filter(Boolean).pop() ?? PAYROLL_RUN_TOUR.role); w?.() }
    const hc = headcountChanges(run.id)
    expect(hc.groups.find((g) => g.label === 'Sales, Bandung')).toMatchObject({ joined: 1, left: 0 })
    expect(JSON.stringify([hc, runWarnings(run.id), runHolds(run), sourceSummary(run.id), groupRows(), monthHeadcount(SEP_MONTH), sendLog.value])).not.toMatch(leak)
    const s = revisionOf(run.id)?.summary ?? null
    expect(s === null || (typeof s.joined === 'number' && typeof s.amountChanged === 'number')).toBe(true)
  })
})
