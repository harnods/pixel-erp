// @vitest-environment happy-dom
/**
 * Other lists > Activity log — the index contract.
 *
 * What's pinned here is what a refactor can silently break: the six columns in
 * the Figma's order, the three filters working independently of each other
 * (Actions is the shared statusFilter, Feature and the drawer's User/Date are
 * the page's own refs), and the detail cell capping at three lines with a
 * "+N more" toggle rather than expanding by default (rule/activity-log-structure).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { useTableState } from '~/composables/useTableState'
import { activityLog, type ActivityEntry, type ActivityDetail } from '~/data/activityLog'

beforeAll(() => {
  Object.assign(globalThis, {
    useTableState,
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
    useRoute: () => ({ path: '/activity-log', params: {}, query: {}, hash: '' }),
    useHead: () => {},
    definePageMeta: () => {},
    navigateTo: () => {},
    useState: (_k: string, f: () => unknown) => ref(f?.()),
  })
})
beforeEach(() => { localStorage.clear() })

type Column = { key: string; label: string; kind?: string; flexible?: boolean }
type Vm = {
  paginated: ActivityEntry[]
  total: number
  columns: Column[]
  statusFilter: string
  featureFilter: string
  search: string
  users: string[]
  visibleDetails: (row: ActivityEntry) => ActivityDetail[]
  toggleExpand: (id: string) => void
  hasActiveFilter: boolean
  clearFilters: () => void
}

async function mountPage() {
  const Page = (await import('~/components/pages/ActivityLogPage.vue')).default
  const w = mount(Page, { global: { stubs: { Teleport: true } } })
  return w.vm as unknown as Vm
}

describe('Activity log index', () => {
  it('shows the Figma\'s six columns, in order', async () => {
    const vm = await mountPage()
    expect(vm.columns.map(c => c.key))
      .toEqual(['date', 'user', 'action', 'feature', 'number', 'details'])
  })

  it('takes every width from the shared kinds, none hand-set', async () => {
    const vm = await mountPage()
    const kindOf = (k: string) => vm.columns.find(c => c.key === k)!.kind
    expect(kindOf('date')).toBe('datetime')     // "30/01/2026, 11:00" clips at 160
    expect(kindOf('user')).toBe('name')
    expect(kindOf('number')).toBe('number')
    expect(kindOf('details')).toBe('address')   // wraps to several lines
    // ACTIONS is plain text, not an ErpStatusBadge — `status` (128px) would be
    // borrowing a badge column's width for a category label.
    expect(kindOf('action')).toBeUndefined()
    expect(kindOf('feature')).toBeUndefined()
    // No column may carry a pixel width of its own.
    expect(vm.columns.every(c => !('width' in c))).toBe(true)
    // Details is last with nothing to its right, so it takes the slack that
    // would otherwise sit in an empty spacer.
    expect(vm.columns.filter(c => c.flexible).map(c => c.key)).toEqual(['details'])
  })

  it('lists every seeded entry, newest first', async () => {
    const vm = await mountPage()
    expect(vm.total).toBe(activityLog.length)
    const dates = vm.paginated.map(r => new Date(r.date).getTime())
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)
  })

  it('filters by action and by feature independently', async () => {
    const vm = await mountPage()

    vm.statusFilter = 'Login'
    await Promise.resolve()
    expect(vm.paginated.every(r => r.action === 'Login')).toBe(true)
    // A Login has no feature — proof the two filters are separate refs.
    expect(vm.paginated.every(r => r.feature === '')).toBe(true)

    vm.statusFilter = ''
    vm.featureFilter = 'Sales invoice'
    await Promise.resolve()
    expect(vm.paginated.length).toBeGreaterThan(0)
    expect(vm.paginated.every(r => r.feature === 'Sales invoice')).toBe(true)
  })

  it('searches across user, feature, number and detail text', async () => {
    const vm = await mountPage()
    // "Tanjung Priok Warehouse" only exists inside a detail line's `to`.
    vm.search = 'tanjung priok'
    await Promise.resolve()
    expect(vm.paginated).toHaveLength(1)
    expect(vm.paginated[0]!.feature).toBe('Warehouse transfer')
  })

  it('caps the detail cell at three lines until expanded', async () => {
    const vm = await mountPage()
    const busy = activityLog.find(e => e.details.length > 3)!
    expect(busy).toBeTruthy()

    expect(vm.visibleDetails(busy)).toHaveLength(3)
    vm.toggleExpand(busy.id)
    expect(vm.visibleDetails(busy)).toHaveLength(busy.details.length)
    vm.toggleExpand(busy.id)
    expect(vm.visibleDetails(busy)).toHaveLength(3)
  })

  it('clearing resets every filter at once', async () => {
    const vm = await mountPage()
    vm.statusFilter = 'Create'
    vm.featureFilter = 'Product'
    vm.search = 'coffee'
    vm.users = ['Rizal Candra']
    await Promise.resolve()
    expect(vm.hasActiveFilter).toBe(true)

    vm.clearFilters()
    await Promise.resolve()
    expect(vm.hasActiveFilter).toBe(false)
    expect(vm.total).toBe(activityLog.length)
  })
})
