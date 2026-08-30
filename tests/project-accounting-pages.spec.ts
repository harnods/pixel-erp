// @vitest-environment happy-dom
/**
 * Render smoke tests for the Project accounting screens.
 *
 * `ssr: false` means a 200 from the dev server proves nothing about whether a page
 * actually renders — these mount each screen for real and assert the content that
 * distinguishes it, so a broken binding or a missing import fails here instead of
 * silently blanking the stage in the browser.
 *
 * The engagement detail page is exercised once per recognition method, because the
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
import { useTableState } from '~/composables/useTableState'
import { engagements, findEngagement, revenue } from '~/data/projectAccounting'

// ── Nuxt auto-imports that vitest has no layer for ───────────────────────────
const push = vi.fn()
const replace = vi.fn()
const routeQuery = reactive<Record<string, string>>({})

vi.stubGlobal('useRouter', () => ({ push, replace }))
vi.stubGlobal('useRoute', () => ({ path: '/project-accounting', query: routeQuery }))
vi.stubGlobal('useTableState', useTableState)
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

describe('ProjectAccountingPage — the portfolio', () => {
  it('renders every seeded engagement with its recognition method', async () => {
    const w = await mountPage(ProjectAccountingPage)
    const text = w.text()

    expect(text).toContain('Cikarang Warehouse Construction')
    expect(text).toContain('Financial Statement Audit 2025')
    // All three engines are visible side by side — the point of the table.
    expect(text).toContain('Input by Simplified Cost')
    expect(text).toContain('Input by Cost')
    expect(text).toContain('Output by Milestone')
    w.unmount()
  })

  it('shows the portfolio stat strip', async () => {
    const w = await mountPage(ProjectAccountingPage)
    const text = w.text()
    expect(text).toContain('Revenue recognised')
    expect(text).toContain('Outstanding invoices')
    expect(text).toContain('Contract addenda pending')
    w.unmount()
  })

  it('filters by the search box', async () => {
    const w = await mountPage(ProjectAccountingPage)
    const input = w.find('input')
    await input.setValue('Cikarang')
    await flushPromises()

    expect(w.text()).toContain('Cikarang Warehouse Construction')
    expect(w.text()).not.toContain('Financial Statement Audit 2025')
    w.unmount()
  })

  it('links a row through to its engagement', async () => {
    const w = await mountPage(ProjectAccountingPage)
    await w.find('.cell-link').trigger('click')
    expect(push).toHaveBeenCalledWith(expect.stringContaining('/project-accounting/'))
    w.unmount()
  })

  it('opens the engagement from anywhere in the row, not just the title', async () => {
    const w = await mountPage(ProjectAccountingPage)
    const row = w.find('.erp-tr')
    expect(row.classes()).toContain('erp-tr--clickable')

    // A click on a plain figure cell — nowhere near the name link — still opens it.
    const amountCell = row.findAll('td').find(td => td.text().includes('Rp'))!
    await amountCell.trigger('click')

    expect(push).toHaveBeenCalledWith(expect.stringContaining('/project-accounting/'))
    w.unmount()
  })

  it('a click on a control inside the row does not double-navigate', async () => {
    const w = await mountPage(ProjectAccountingPage)
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

  it('input by cost shows percentage complete, not a review queue', async () => {
    routeQuery.tab = 'recognition'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e5' })
    const text = w.text()

    expect(text).toContain('Input by Cost — the money spent is the measure of progress')
    expect(text).toContain('Percentage complete')
    expect(text).not.toContain('Review queue')
    w.unmount()
  })

  it('output by milestone lists weighted milestones with a verify action', async () => {
    routeQuery.tab = 'recognition'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e7' })
    const text = w.text()

    expect(text).toContain('Output method — verified milestones')
    expect(text).toContain('Fabrication complete')
    expect(text).toContain('Milestone weights sum to 100%.')
    expect(text).toContain('Mark physically verified')
    w.unmount()
  })

  it('the Setup tab shows the frozen contract and the append-only trail', async () => {
    routeQuery.tab = 'setup'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e7' })
    const text = w.text()

    expect(text).toContain('Contract')
    expect(text).toContain('Budget plan')
    expect(text).toContain('Edit contract')
    expect(text).toContain('Is the added scope distinct?')
    // The original contract is always row one of the history.
    expect(text).toContain('Original contract as entered at Setup')
    w.unmount()
  })

  it('the Costs tab rolls up tagged transaction lines read-only', async () => {
    routeQuery.tab = 'execution'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e7' })
    const text = w.text()

    expect(text).toContain('Tagged transaction lines')
    expect(text).toContain('WF 250 structural steel')
    expect(text).toContain('Total cost incurred')
    expect(text).toContain('Budget variance')
    w.unmount()
  })

  it('the Invoices tab shows the billing schedule and collected invoices', async () => {
    routeQuery.tab = 'billing'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e6' })
    const text = w.text()

    expect(text).toContain('Milestone billing schedule')
    expect(text).toContain('INV-2205')
    w.unmount()
  })

  it('Project health shows margin and the closure gate with its reason', async () => {
    routeQuery.tab = 'closed'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e7' })
    const text = w.text()

    expect(text).toContain('Margin to date')
    expect(text).toContain('Closure gate')
    expect(text).toContain('Every milestone must be verified and every invoice collected.')
    w.unmount()
  })

  it('verifying a milestone recognizes revenue through the UI', async () => {
    routeQuery.tab = 'recognition'
    const w = await mountPage(ProjectEngagementDetailsPage, { orderId: 'e6' })
    const before = revenue(findEngagement('e6')!)

    const verify = w.findAll('button').find(b => b.text().includes('Mark physically verified'))
    expect(verify).toBeTruthy()
    await verify!.trigger('click')
    await flushPromises()

    expect(revenue(findEngagement('e6')!)).toBeGreaterThan(before)
    w.unmount()
  })
})

describe('NewEngagementPage', () => {
  it('renders the three ways of earning and defaults to cost-plus', async () => {
    const w = await mountPage(NewEngagementPage)
    const text = w.text()

    expect(text).toContain('How this project earns its revenue')
    expect(text).toContain('Input by Simplified Cost')
    expect(text).toContain('Input by Cost')
    expect(text).toContain('Output by Milestone')
    // Cost-plus is the default, so its margin field is on screen from the start.
    expect(text).toContain('Agreed margin on cost')
    w.unmount()
  })

  it('swapping to Output by Milestone reveals the weighted milestone editor', async () => {
    const w = await mountPage(NewEngagementPage)
    const pick = w.findAll('.ne-method').find(b => b.text().includes('Output by Milestone'))
    await pick!.trigger('click')
    await flushPromises()

    expect(w.text()).toContain('Output milestones')
    expect(w.text()).toContain('Weights sum to 100%.')
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
    w.unmount()
  })
})

describe('ProjectExpensePage', () => {
  it('renders the per-line Project and Hours columns this form exists for', async () => {
    const w = await mountPage(ProjectExpensePage)
    const text = w.text()

    expect(text).toContain('New expense')
    expect(text).toContain('Project is tagged per line item')
    expect(text).toContain('Hours')
    expect(text).toContain('Drop your receipt file here')
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
  it('prefills every reviewed, uninvoiced line for a cost-plus engagement', async () => {
    routeQuery.project = 'e3'
    routeQuery.kind = 'tm'
    routeQuery.label = 'Progress billing'

    const w = await mountPage(ProjectInvoicePage)
    const text = w.text()

    expect(text).toContain('New invoice')
    expect(text).toContain('Lines are prefilled from the reviewed, uninvoiced work on this engagement.')
    // e3's two decided-but-uninvoiced lines are already reflected in the totals.
    expect(text).toContain('Balance due')
    w.unmount()
  })

  it('carries the client through and tags the line to its project', async () => {
    routeQuery.project = 'e7'
    routeQuery.kind = 'adhoc'

    const w = await mountPage(ProjectInvoicePage)
    expect(w.text()).toContain('Cikarang Warehouse Construction')
    // The engagement's client is carried onto the invoice as the customer.
    const values = w.findAll('input').map(i => (i.element as HTMLInputElement).value)
    expect(values).toContain('PT Anugerah Logistik')
    w.unmount()
  })
})
