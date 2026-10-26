// @vitest-environment happy-dom
/**
 * Render smoke tests for the Project accounting screens.
 *
 * `ssr: false` means a 200 from the dev server proves nothing about whether a page
 * actually renders — these mount each screen for real and assert the content that
 * distinguishes it, so a broken binding or a missing import fails here instead of
 * silently blanking the stage in the browser.
 *
 * The project detail page is exercised once per recognition method, because the
 * Revenue recognition tab is a different component tree in each case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick, inject, provide, useSlots } from 'vue'
import ProjectAccountingPage from '~/components/pages/ProjectAccountingPage.vue'
import ProjectEngagementDetailsPage from '~/components/pages/ProjectEngagementDetailsPage.vue'
import NewEngagementPage from '~/components/pages/NewEngagementPage.vue'
import ProjectExpensePage from '~/components/pages/ProjectExpensePage.vue'
import ProjectInvoicePage from '~/components/pages/ProjectInvoicePage.vue'
import VerifyMilestoneModal from '~/components/patterns/VerifyMilestoneModal.vue'
import { useTableState } from '~/composables/useTableState'
import { useProjectViewAs } from '~/composables/useProjectViewAs'
import {
  engagements, findEngagement, revenue, openEntries, daysAgo, methodLabel, closeHint, canClose, pendingVos,
  approvalFor, TODAY,
} from '~/data/projectAccounting'

// ── Nuxt auto-imports that vitest has no layer for ───────────────────────────
const push = vi.fn()
const replace = vi.fn()
const routeQuery = reactive<Record<string, string>>({})

vi.stubGlobal('useRouter', () => ({ push, replace }))
vi.stubGlobal('useRoute', () => ({ path: '/project-accounting', query: routeQuery }))
vi.stubGlobal('useTableState', useTableState)
// Nuxt auto-imports app/composables; NewEngagementPage relies on that for View as.
vi.stubGlobal('useProjectViewAs', useProjectViewAs)
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('nextTick', nextTick)
vi.stubGlobal('inject', inject)
vi.stubGlobal('provide', provide)
vi.stubGlobal('useSlots', useSlots)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

beforeEach(() => {
  push.mockClear()
  replace.mockClear()
  Object.keys(routeQuery).forEach(k => delete routeQuery[k])
})

async function mountPage(component: unknown, props: Record<string, unknown> = {}) {
  const wrapper = mount(component as never, { props })
  await flushPromises()
  return wrapper
}

/** The index shows a first-load skeleton for ~500ms before its rows render. */
async function mountIndex() {
  const w = await mountPage(ProjectAccountingPage)
  expect(w.find('.erp-tr--skeleton').exists()).toBe(true)
  await new Promise(r => setTimeout(r, 550))
  await flushPromises()
  expect(w.find('.erp-tr--skeleton').exists()).toBe(false)
  return w
}

describe('ProjectAccountingPage — the portfolio', () => {
  it('renders every seeded project with its recognition method', async () => {
    // Below 1400px the Method column starts hidden; render at a desktop width.
    const width = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
    const w = await mountIndex()
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
    const text = w.text()

    expect(text).toContain('Cikarang Warehouse Construction')
    expect(text).toContain('Financial Statement Audit 2025')
    // All three methods are visible side by side — the point of the table.
    expect([methodLabel('tm'), methodLabel('input'), methodLabel('output')]).toEqual(['Cost plus margin', 'Percentage of completion', 'Milestones'])
    expect(text).toContain('Cost plus margin')
    expect(text).toContain('Percentage of completion')
    expect(text).toContain('Milestones')
    w.unmount()
  })

  it('shows the portfolio stat strip', async () => {
    const w = await mountIndex()
    const text = w.text()
    expect(text).toContain('Revenue recognized')
    expect(text).toContain('Unpaid invoices')
    expect(text).toContain('Addenda awaiting approval')
    w.unmount()
  })

  it('filters by the search box', async () => {
    const w = await mountIndex()
    const input = w.find('.filter-search-input')
    await input.setValue('Cikarang')
    await flushPromises()

    expect(w.text()).toContain('Cikarang Warehouse Construction')
    expect(w.text()).not.toContain('Financial Statement Audit 2025')
    w.unmount()
  })

  it('links a row through to its project', async () => {
    const w = await mountIndex()
    await w.find('.cell-link').trigger('click')
    expect(push).toHaveBeenCalledWith(expect.stringContaining('/project-accounting/'))
    w.unmount()
  })

  it('opens the project from anywhere in the row, not just the title', async () => {
    const w = await mountIndex()
    const row = w.find('.erp-tr')
    expect(row.classes()).toContain('erp-tr--clickable')

    // A click on a plain figure cell — nowhere near the name link — still opens it.
    const amountCell = row.findAll('td').find(td => td.text().includes('Rp'))!
    await amountCell.trigger('click')

    expect(push).toHaveBeenCalledWith(expect.stringContaining('/project-accounting/'))
    w.unmount()
  })

  it('a click on a control inside the row does not double-navigate', async () => {
    const w = await mountIndex()
    // The name link handles its own click; the row handler must stand down so the
    // navigation happens once, from the link.
    await w.find('.cell-link').trigger('click')
    expect(push).toHaveBeenCalledTimes(1)
    w.unmount()
  })
})

describe('ProjectEngagementDetailsPage — one tree per recognition method', () => {
  it('cost-plus (tm) shows the review queue and the margin build-up', async () => {
    routeQuery.tab = 'recognition'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e1' })
    const text = w.text()

    expect(text).toContain('Financial Statement Audit 2025')
    expect(text).toContain('Review queue')
    expect(text).toContain('Agreed margin on cost')
    expect(text).toContain('Value at cost + margin')
    // Its five unreviewed lines are waiting for a decision.
    expect(text).toContain('Awaiting review')
    w.unmount()
  })

  it('percentage of completion shows percentage complete, not a review queue', async () => {
    routeQuery.tab = 'recognition'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e5' })
    const text = w.text()

    expect(w.findAll('h2').map(h => h.text())).toContain('Percentage of completion')
    expect(text).toContain('Percentage complete')
    // 18.500.000 of a 30.000.000 budget → 62%, 27.750.000 of the 45.000.000 contract.
    expect(text).toContain('62%')
    expect(text).toContain('Rp27.750.000,00')
    expect(text).not.toContain('Review queue')
    w.unmount()
  })

  it('milestones lists weighted milestones with a verify action', async () => {
    routeQuery.tab = 'recognition'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e7' })
    const text = w.text()

    expect(w.findAll('h2').map(h => h.text())).toContain('Milestones')
    expect(text).toContain('Fabrication complete')
    expect(text).toContain('Rp960.000.000,00')
    // Weights sum to 100%, so no weight warning and every milestone can be verified.
    expect(text).not.toContain('Milestone weights total')
    const card = w.find('[data-tour="pa-output-milestones"]')
    expect(card.findAll('button').filter(b => b.text() === 'Verify milestone')).toHaveLength(3)
    w.unmount()
  })

  it('the Setup tab shows the frozen contract and the append-only trail', async () => {
    routeQuery.tab = 'setup'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e7' })
    const text = w.text()

    expect(text).toContain('Contract')
    expect(text).toContain('Budget plan')
    expect(text).toContain('Contract addenda')
    // The original contract is always row one of the history.
    expect(text).toContain('Original contract')
    // The seeded addendum is waiting on its Settings rule; the contract has not moved.
    expect(text).toContain('Two additional loading dock bays on the east wall')
    expect(text).toContain('Pending approval')
    expect(text).toContain('Addendum Rule 001')
    expect(findEngagement('e7')!.contractValue).toBe(2_400_000_000)

    // The scope question appears once the addendum form is opened, with no answer preselected.
    const open = w.findAll('button').find(b => b.text() === 'Submit addendum')!
    await open.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Is this new, separately priced work?')
    expect(w.text()).toContain('Extends existing work')
    expect(w.text()).toContain('Separate new work')
    expect(w.findAll('.pa-choice--picked')).toHaveLength(0)
    w.unmount()
  })

  it('the Costs tab rolls up tagged transaction lines read-only', async () => {
    routeQuery.tab = 'execution'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e7' })
    const text = w.text()

    expect(text).toContain('Cost lines')
    expect(text).toContain('WF 250 structural steel')
    expect(text).toContain('Total cost incurred')
    expect(text).toContain('Budget variance')
    w.unmount()
  })

  it('the Invoices tab shows the billing schedule and collected invoices', async () => {
    routeQuery.tab = 'billing'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e6' })
    const text = w.text()

    expect(text).toContain('Billing schedule')
    expect(text).toContain('Event delivered (single deliverable)')
    expect(text).toContain('INV-2205')
    expect(text).toContain('Rp36.000.000,00')
    w.unmount()
  })

  it('Project health shows margin and the closure gate with its reason', async () => {
    routeQuery.tab = 'closed'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e7' })
    const text = w.text()

    expect(text).toContain('Margin to date')
    expect(text).toContain('Not ready to close')
    // The seeded pending addendum is the first thing standing between e7 and closing.
    const e = findEngagement('e7')!
    expect(pendingVos(e)).toHaveLength(1)
    expect(canClose(e)).toBe(false)
    expect(text).toContain(closeHint(e))
    expect(closeHint(e)).toMatch(/pending addendum/)
    w.unmount()
  })

  it('verifying a milestone recognizes revenue through the UI', async () => {
    routeQuery.tab = 'recognition'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e6' })
    const before = revenue(findEngagement('e6')!)

    const verify = w.findAll('button').find(b => b.text() === 'Verify milestone')
    expect(verify).toBeTruthy()
    await verify!.trigger('click')
    await flushPromises()

    // The button opens the verification dialog; no rule gates e6, so it says nothing about approval.
    const modal = w.findComponent(VerifyMilestoneModal)
    expect(modal.exists()).toBe(true)
    expect(modal.props('needsApproval')).toBe(false)
    expect(modal.props('amount')).toBe(120_000_000)
    modal.vm.$emit('confirm', { date: TODAY, verifiedBy: 'Dewi Kusuma', document: 'BAST-001.pdf' })
    await flushPromises()

    const e = findEngagement('e6')!
    expect(revenue(e) - before).toBe(120_000_000)
    expect(e.milestones![0]!.verifiedBy).toBe('Dewi Kusuma')
    expect(e.milestones![0]!.document).toBe('BAST-001.pdf')
    w.unmount()
  })

  it('on Cikarang the verification waits for an approver, then recognizes revenue', async () => {
    routeQuery.tab = 'recognition'
    const { setViewAs } = useProjectViewAs()
    setViewAs('pm')
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e7' })
    const e = findEngagement('e7')!
    const before = revenue(e)

    const card = () => w.find('[data-tour="pa-output-milestones"]')
    await card().findAll('button').find(b => b.text() === 'Verify milestone')!.trigger('click')
    await flushPromises()
    const modal = w.findComponent(VerifyMilestoneModal)
    expect(modal.props('needsApproval')).toBe(true)
    expect(modal.props('approverNames')).toEqual(['Rizal Candra'])
    modal.vm.$emit('confirm', { date: TODAY, verifiedBy: 'Rina Wulandari', document: null })
    await flushPromises()

    // Pending: nothing recognized, and the submitter cannot approve her own request.
    const a = approvalFor(e, 'milestone-verification', 'm1')!
    expect(a.submittedBy).toBe('Rina Wulandari')
    expect(revenue(e)).toBe(before)
    expect(card().findAll('button').some(b => b.text() === 'Approve')).toBe(false)
    expect(card().text()).toContain('Pending approval')

    setViewAs('approver')
    await flushPromises()
    const approve = card().findAll('button').find(b => b.text() === 'Approve')
    expect(approve).toBeTruthy()
    await approve!.trigger('click')
    await flushPromises()

    expect(approvalFor(e, 'milestone-verification', 'm1')).toBeUndefined()
    expect(revenue(e) - before).toBe(960_000_000)
    expect(e.approvalLog!.at(-1)).toMatchObject({ action: 'milestone-verification', refId: 'm1', decision: 'approved', by: 'Rizal Candra' })
    setViewAs('pm')
    w.unmount()
  })
})

describe('NewEngagementPage', () => {
  it('renders the three ways of earning with none preselected', async () => {
    const w = await mountPage(NewEngagementPage)
    const text = w.text()

    expect(text).toContain('Revenue recognition method')
    expect(w.findAll('.ne-method-title').map(x => x.text())).toEqual(['Cost plus margin', 'Percentage of completion', 'Milestones'])
    // The method is irreversible, so nothing is picked and no method-specific field shows yet.
    expect(w.findAll('.ne-method--picked')).toHaveLength(0)
    expect(text).not.toContain('Agreed margin on cost')

    // Picking cost plus margin brings its margin field in.
    await w.findAll('.ne-method').find(b => b.text().includes('Cost plus margin'))!.trigger('click')
    await flushPromises()
    expect(w.findAll('.ne-method--picked')).toHaveLength(1)
    expect(w.text()).toContain('Agreed margin on cost')
    w.unmount()
  })

  it('swapping to Milestones reveals the weighted milestone editor', async () => {
    const w = await mountPage(NewEngagementPage)
    const pick = w.findAll('.ne-method').find(b => b.text().includes('Milestones'))
    await pick!.trigger('click')
    await flushPromises()

    expect(w.findAll('h2').map(h => h.text())).toContain('Milestones')
    expect(w.text()).toContain('Weights add up to 100%')
    expect(w.text()).not.toContain('Agreed margin on cost')
    w.unmount()
  })

  it('refuses to save without a name and does not create anything', async () => {
    const w = await mountPage(NewEngagementPage)
    const before = engagements.length

    const save = w.findAll('button').find(b => b.text() === 'Save')
    await save!.trigger('click')
    await flushPromises()

    expect(engagements.length).toBe(before)
    expect(push).not.toHaveBeenCalled()
    expect(w.text()).toContain('You must fill in project name')
    expect(w.text()).toContain('You must choose a revenue recognition method')
    w.unmount()
  })

  it('refuses to save without a method, and without a contract value for percentage of completion', async () => {
    const w = await mountPage(NewEngagementPage)
    const before = engagements.length
    await w.find('input#ne-name').setValue('Method required check')
    const save = () => w.findAll('button').find(b => b.text() === 'Save')!.trigger('click')

    await save()
    await flushPromises()
    expect(w.text()).toContain('You must choose a revenue recognition method')

    await w.findAll('.ne-method').find(b => b.text().includes('Percentage of completion'))!.trigger('click')
    await save()
    await flushPromises()
    expect(w.text()).not.toContain('You must choose a revenue recognition method')
    expect(w.text()).toContain('You must fill in contract value')

    expect(engagements.length).toBe(before)
    expect(push).not.toHaveBeenCalled()
    w.unmount()
  })
})

describe('Control wiring — regressions found by driving the real browser', () => {
  /**
   * MpCheckbox takes `is-checked` + `@change`, NOT `model-value` +
   * `@update:model-value`. Bound the wrong way it renders fine and toggles its own
   * box, so it looks correct — but the handler never fires and nothing is selected.
   * That silently disabled the entire cost-plus review queue.
   */
  it('the select-all checkbox actually selects every open line', async () => {
    routeQuery.tab = 'recognition'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e1' })

    const open = openEntries(findEngagement('e1')!).length
    expect(open).toBeGreaterThan(1)
    expect(w.text()).not.toContain('cost lines selected')

    const selectAll = w.find('#erp-select-all')
    expect(selectAll.exists()).toBe(true)
    await (selectAll.element.tagName === 'INPUT' ? selectAll : selectAll.find('input')).trigger('change')
    await flushPromises()

    // The bulk bar only appears when the handler really ran.
    expect(w.text()).toContain(`${open} cost lines selected`)

    // And its action carries the whole selection into the decision card.
    await w.findAll('button').find(b => b.text() === 'Charge cost + margin')!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain(`${open} selected · Rp20.160.000,00`)
    w.unmount()
  })

  it('an individual row checkbox toggles just that line', async () => {
    routeQuery.tab = 'recognition'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e1' })

    const box = w.find('#erp-row-0')
    const first = box.element.tagName === 'INPUT' ? box : box.find('input')
    expect(first.exists()).toBe(true)
    await first.trigger('change')
    await flushPromises()
    expect(w.text()).toContain('1 cost line selected')

    await first.trigger('change')
    await flushPromises()
    expect(w.text()).not.toContain('1 cost line selected')
    w.unmount()
  })

  /**
   * MpDatePicker is driven in the display format (`DD/MM/YYYY`) per the repo's
   * date convention, while the data layer stores ISO. Saving must convert back, or
   * every posted cost line carries an unparseable date and the ageing buckets break.
   */
  it('a saved expense stores an ISO date, not the display format', async () => {
    routeQuery.project = 'e2'
    const w = await mountPage(ProjectExpensePage)
    const before = findEngagement('e2')!.entries.length

    await w.find('#px-beneficiary').setValue('PT Date Check')
    const amount = w.findAll('input[id^="px-amt-"]').at(0)!
    await amount.setValue('1500000')
    await flushPromises()

    const save = w.findAll('button').find(b => b.text() === 'Save')!
    await save.trigger('click')
    await new Promise(r => setTimeout(r, 400))
    await flushPromises()

    const entries = findEngagement('e2')!.entries
    expect(entries.length).toBe(before + 1)
    expect(entries.at(-1)!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(daysAgo(entries.at(-1)!.date)).not.toBeNaN()
    w.unmount()
  })
})

describe('ProjectExpensePage', () => {
  it('renders the per-line Project and Hours columns this form exists for', async () => {
    const w = await mountPage(ProjectExpensePage)
    const text = w.text()

    expect(text).toContain('New expense')
    // Project is a per-line column, not a document-level field.
    const headers = w.findAll('th').map(th => th.text())
    expect(headers).toContain('Project')
    expect(headers).toContain('Hours')
    // OCR autofill drop zone — the four-line pattern, each line a full sentence.
    expect(text).toContain('Drop your file here or')
    expect(text).toContain('Airene will read your file and fill in the details automatically.')
    expect(text).toContain('Supported formats: PDF, PNG, JPG.')
    expect(text).toContain('Maximum file size: 10 MB.')
    w.unmount()
  })

  it('shows the live budget strip once a line is tagged to a project', async () => {
    routeQuery.project = 'e7'
    const w = await mountPage(ProjectExpensePage)

    expect(w.text()).toContain('Cikarang Warehouse Construction')
    expect(w.text()).toContain('Remaining after saving')
    w.unmount()
  })
})

describe('ProjectInvoicePage', () => {
  it('prefills every reviewed, uninvoiced line for a cost-plus project', async () => {
    routeQuery.project = 'e3'
    routeQuery.kind = 'tm'
    routeQuery.label = 'Progress billing'

    const w = await mountPage(ProjectInvoicePage)
    const text = w.text()

    expect(text).toContain('New invoice')
    expect(text).toContain('Prefilled with reviewed cost lines not yet invoiced')
    // e3's two decided-but-uninvoiced lines are already reflected in the totals.
    expect(text).toContain('Balance due')
    w.unmount()
  })

  it('carries the customer through and tags the line to its project', async () => {
    routeQuery.project = 'e7'
    routeQuery.kind = 'adhoc'

    const w = await mountPage(ProjectInvoicePage)
    expect(w.text()).toContain('Cikarang Warehouse Construction')
    // The project's customer is carried onto the invoice.
    const values = w.findAll('input').map(i => (i.element as HTMLInputElement).value)
    expect(values).toContain('PT Anugerah Logistik')
    w.unmount()
  })

  it('starts every line on No tax', async () => {
    routeQuery.project = 'e3'
    routeQuery.kind = 'tm'
    const w = await mountPage(ProjectInvoicePage)
    const taxInputs = w.findAll('input[id^="pi-tax-"]')
    expect(taxInputs.length).toBeGreaterThan(0)
    expect(taxInputs.map(i => (i.element as HTMLInputElement).value).every(v => v === 'No tax')).toBe(true)
    w.unmount()
  })

  it('billing more than the schedule row blocks the save', async () => {
    routeQuery.project = 'e5'
    routeQuery.kind = 'billing'
    routeQuery.label = 'Final payment (70%)'
    routeQuery.milestone = 'b2'
    const w = await mountPage(ProjectInvoicePage)
    const e = findEngagement('e5')!
    const before = e.invoices.length

    // 70% of Rp45.000.000 is Rp31.500.000; raise the line above it.
    const price = w.findAll('input[id^="pi-price-"]').at(0)!
    expect((price.element as HTMLInputElement).value).toBe('31500000')
    await price.setValue('40000000')
    await flushPromises()
    await w.findAll('button').find(b => b.text() === 'Save')!.trigger('click')
    await new Promise(r => setTimeout(r, 400))
    await flushPromises()

    expect(e.invoices.length).toBe(before)
    expect(push).not.toHaveBeenCalled()
    expect(w.text()).toContain('more than the billing schedule amount of Rp31.500.000,00')
    w.unmount()
  })
})
