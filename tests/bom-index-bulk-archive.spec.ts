// @vitest-environment happy-dom
/**
 * Bill of materials index — the bulk action.
 *
 * This bulk control shipped wired to nothing: a Delete button with no @click,
 * so selecting rows and pressing it did nothing at all. What is pinned here is
 * that it now does something, and that it does the RIGHT something — this
 * module has no hard delete. The row menu archives (`archived = true`, still
 * reachable through "Show archived BOM"), so the bulk action archives too.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import { useTableState } from '~/composables/useTableState'
import { billOfMaterials, type BillOfMaterials } from '~/data/billOfMaterials'

beforeAll(() => {
  Object.assign(globalThis, {
    useTableState,
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
    useRoute: () => ({ path: '/bill-of-materials', params: {}, query: {}, hash: '' }),
    useHead: () => {},
    definePageMeta: () => {},
    navigateTo: () => {},
    useState: (_k: string, f: () => unknown) => ref(f?.()),
  })
})

// The store is module-level and shared with every other spec importing ~/data,
// so the archived flags these tests set are rolled back after each one.
let pristine: { id: string; archived?: boolean }[]
beforeAll(() => { pristine = billOfMaterials.map(b => ({ id: b.id, archived: b.archived })) })
beforeEach(() => {
  localStorage.clear()
  for (const snap of pristine) {
    const row = billOfMaterials.find(b => b.id === snap.id)
    if (row) row.archived = snap.archived
  }
})

type Vm = {
  paginated: BillOfMaterials[]
  showArchived: boolean
  askBulkArchive: (sel: Set<number>, deselect: () => void) => void
  confirmBulkArchive: () => void
  isBulkArchiveOpen: boolean
  bulkArchiveRows: BillOfMaterials[]
}

async function mountPage() {
  const Page = (await import('~/components/pages/BillOfMaterialsIndexPage.vue')).default
  const w = mount(Page, { global: { stubs: { Teleport: true } } })
  return w.vm as unknown as Vm
}

describe('BOM index — bulk archive', () => {
  it('asking opens a confirm instead of archiving straight away', async () => {
    const vm = await mountPage()
    const target = vm.paginated[0]!

    vm.askBulkArchive(new Set([0]), () => {})

    expect(vm.isBulkArchiveOpen).toBe(true)
    // Nothing has happened yet — the archive belongs to the confirm handler.
    expect(billOfMaterials.find(b => b.id === target.id)!.archived).toBeFalsy()
  })

  it('confirming archives every selected row and deselects', async () => {
    const vm = await mountPage()
    const ids = [vm.paginated[0]!.id, vm.paginated[1]!.id]
    let deselected = false

    vm.askBulkArchive(new Set([0, 1]), () => { deselected = true })
    vm.confirmBulkArchive()

    for (const id of ids) expect(billOfMaterials.find(b => b.id === id)!.archived).toBe(true)
    expect(deselected).toBe(true)
    expect(vm.bulkArchiveRows).toHaveLength(0)
  })

  it('leaves already-archived rows out of the count it promises', async () => {
    const vm = await mountPage()
    // An archived BOM is only selectable with "Show archived BOM" on —
    // otherwise the filter drops it and the row indices shift under us.
    vm.showArchived = true
    await nextTick()
    vm.paginated[0]!.archived = true
    await nextTick()

    const archivedId = vm.paginated[0]!.id
    const liveId = vm.paginated[1]!.id
    vm.askBulkArchive(new Set([0, 1]), () => {})

    // The confirm says "1", not "2" — re-archiving an archived BOM is a no-op.
    expect(vm.bulkArchiveRows).toHaveLength(1)
    expect(vm.bulkArchiveRows[0]!.id).toBe(liveId)
    expect(vm.bulkArchiveRows.some(b => b.id === archivedId)).toBe(false)
  })

  it('an empty selection opens nothing', async () => {
    const vm = await mountPage()
    vm.askBulkArchive(new Set(), () => {})
    expect(vm.isBulkArchiveOpen).toBe(false)
  })
})
