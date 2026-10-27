// @vitest-environment happy-dom
/**
 * Read-only batch attributes in ViewBatchDrawer / PickBatchDrawer (ATINV-9082, spec §5.1).
 * Seeds: 1001 uses Vendor, Grade, Expiry; product batch "Batch #001" is from V003.
 * "Batch #99999" has no product record, so only its expiry can show.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import PickBatchDrawer from '~/components/patterns/PickBatchDrawer.vue'
import { findProductBatch } from '~/data/productDetails'
import { vendors } from '~/data/vendors'

const vendorName = (id: string) => vendors.find((v) => v.id === id)!.name

function mountView(rows: Record<string, unknown>[]) {
  return mount(ViewBatchDrawer, {
    props: {
      open: true, sku: '1001', warehouseId: 'wh-006', kind: 'packing', productName: 'Green Beans', productImg: '',
      pickedBatches: rows as never,
    },
  })
}
const headers = (w: ReturnType<typeof mount>) => w.findAll('thead th').map((th) => th.text())
const cells = (w: ReturnType<typeof mount>, batchNo: string) =>
  w.findAll('tbody tr').find((tr) => tr.text().includes(batchNo))!.findAll('td').map((td) => td.text())

describe('ViewBatchDrawer attributes', () => {
  it('ViewBatchDrawer shows Vendor and Grade for a 1001 batch', () => {
    const master = findProductBatch('1001', 'Batch #001')!
    expect(master.attributes.supplier).toBe('V003')
    const w = mountView([{ batchNo: 'Batch #001', expiryDate: '2026-12-01', desc: '', qty: 1, unit: 'Sack' }])
    const h = headers(w)
    expect(h.indexOf('Vendor')).toBe(h.indexOf('Expiry date') + 2)
    expect(h).toContain('Grade')
    expect(cells(w, 'Batch #001')).toContain(vendorName('V003'))
  })

  it('prefers the line snapshot over the current master value', () => {
    const w = mountView([{ batchNo: 'Batch #001', expiryDate: '2026-12-01', desc: '', qty: 1, unit: 'Sack', attributes: { supplier: 'V002' } }])
    const c = cells(w, 'Batch #001')
    expect(c).toContain(vendorName('V002'))
    expect(c).not.toContain(vendorName('V003'))
  })

  it('shows — for a lot with no record', () => {
    const w = mountView([{ batchNo: 'Batch #99999', expiryDate: '2026-12-01', desc: '', qty: 1, unit: 'Sack' }])
    const h = headers(w)
    const c = cells(w, 'Batch #99999')
    expect(c[h.indexOf('Vendor')]).toBe('—')
    expect(c[h.indexOf('Grade')]).toBe('—')
  })

  it('shows the columns in count mode too', () => {
    const w = mount(ViewBatchDrawer, {
      props: { open: true, sku: '1001', warehouseId: 'wh-001', kind: 'count', countedTotal: 4, productName: 'Green Beans', productImg: '' },
    })
    expect(headers(w)).toContain('Vendor')
  })
})

describe('PickBatchDrawer attributes', () => {
  it('PickBatchDrawer shows attribute columns read-only', () => {
    const w = mount(PickBatchDrawer, {
      props: {
        open: true, productName: 'Green Beans', sku: '1001', warehouseId: 'wh-001', warehouseName: 'WH', unit: 'Sack',
        targetCount: 2, modelValue: [],
      },
    })
    const h = headers(w)
    expect(h).toContain('Vendor')
    expect(h).toContain('Grade')
    expect(w.findAll('tbody tr').length).toBeGreaterThan(0)
    // read-only: the only inputs are the qty inputs (one per lot), none for attributes
    expect(w.findAll('tbody input').length).toBe(w.findAll('tbody tr').length)
  })
})
