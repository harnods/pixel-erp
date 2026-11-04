// @vitest-environment happy-dom
/**
 * The approval workflow form for a tenant without the Project accounting component
 * (the Approval workflows scenario switch set to off).
 *
 * A new rule shows no project fields at all. A saved rule that already uses projects
 * keeps them, so saving it never quietly turns a Project action rule into a
 * transaction rule or widens a rule scoped to some projects to every project.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { approvalWorkflows } from '~/data/approvalWorkflows'

// The composable uses Nuxt's auto-imported ref, so provide it before the module loads.
vi.hoisted(async () => {
  const { ref } = await import('vue')
  ;(globalThis as unknown as { ref: typeof ref }).ref = ref
})
const { useApprovalWorkflowScenario } = await import('~/composables/useApprovalWorkflowScenario')

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.stubGlobal('useApprovalWorkflowScenario', useApprovalWorkflowScenario)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const { setProjectAccountingEnabled } = useApprovalWorkflowScenario()

async function mountForm(orderId?: string) {
  const { default: CreateApprovalWorkflowPage } = await import('~/components/pages/CreateApprovalWorkflowPage.vue')
  const w = mount(CreateApprovalWorkflowPage, { props: orderId ? { orderId } : {} })
  await flushPromises()
  return w
}

afterEach(() => setProjectAccountingEnabled(true))

describe('approval workflow form — Project accounting component off', () => {
  it('a new rule has no Applies to and no project scope', async () => {
    setProjectAccountingEnabled(false)
    const w = await mountForm()
    expect(w.find('#awf-applies-to-transaction').exists()).toBe(false)
    expect(w.text().includes('Applies to projects')).toBe(false)
    expect(w.text()).toContain('Transaction type')
    w.unmount()
  })

  it('a new rule shows both when the component is on', async () => {
    const w = await mountForm()
    expect(w.find('#awf-applies-to-transaction').exists()).toBe(true)
    expect(w.text().includes('Applies to projects')).toBe(true)
    w.unmount()
  })

  it('a saved Project action rule keeps Applies to, so it stays a Project action rule', async () => {
    setProjectAccountingEnabled(false)
    const rule = approvalWorkflows.find(r => r.appliesTo === 'project' && r.projectAction === 'project-creation')!
    const w = await mountForm(rule.id)
    expect(w.find('#awf-applies-to-transaction').exists()).toBe(true)
    expect((w.find('#awf-applies-to-project').element as HTMLInputElement).checked).toBe(true)
    w.unmount()
  })

  it('a saved rule scoped to some projects keeps its project scope', async () => {
    setProjectAccountingEnabled(false)
    const rule = approvalWorkflows.find(r => r.projectScope === 'some')!
    const w = await mountForm(rule.id)
    expect(w.text().includes('Applies to projects')).toBe(true)
    w.unmount()
  })
})
