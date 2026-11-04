// @vitest-environment happy-dom
/**
 * Work order › Raw materials — an On hand qty column just before Needed qty, reading
 * the stock on hand at each row's own warehouse (the figure P-1 caps consumption
 * by, and the start gate reads for a work order created with reservation off).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import WorkOrderDetailsPage from '~/components/pages/WorkOrderDetailsPage.vue'
import { workOrders } from '~/data/workOrders'
import { workOrderMaterials, onHandAt } from '~/data/stockRequests'
import { useWoApprovalActor } from '~/composables/useWoApprovalActor'
import { useTableState } from '~/composables/useTableState'

vi.stubGlobal('computed', computed)
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), replace: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {} }))
vi.stubGlobal('useWoApprovalActor', useWoApprovalActor)
vi.stubGlobal('useTableState', useTableState)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WO = workOrders.find(w => w.id === 'wo-8')!

describe('Work order Raw materials — On hand qty', () => {
  it('sits just before Needed qty and reads on hand at each row\'s warehouse', async () => {
    const wrapper = mount(WorkOrderDetailsPage, { props: { orderId: WO.id }, attachTo: document.body })
    await flushPromises()
    const table = wrapper.find('[data-devchange="wo-raw-on-hand"]').element.closest('table')!
    const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent!.trim())
    expect(heads.slice(heads.indexOf('On hand qty'), heads.indexOf('On hand qty') + 2)).toEqual(['On hand qty', 'Needed qty'])

    const col = heads.indexOf('On hand qty')
    const rows = [...table.querySelectorAll('tbody tr')]
    workOrderMaterials(WO).forEach((m, i) => {
      expect(rows[i]!.querySelectorAll('td')[col]!.textContent!.trim())
        .toBe(onHandAt(m.productId, m.warehouseId).toLocaleString('id-ID'))
    })
    wrapper.unmount()
  })
})
