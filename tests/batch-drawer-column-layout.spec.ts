// @vitest-environment happy-dom
/**
 * Batch drawer column layout + description fallback (ATINV-9082 verification D1–D3).
 *
 * D1: every kind of ManageBatchDrawer renders one <col> per header cell, and the WMS
 *     kinds' table floor (--mbd-min-width) leaves Description its own floor on top of
 *     the pinned columns — so it can never collapse to zero width and overlap Vendor.
 * D3: a batch with a record but no description shows "—", never the demo filler.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageBatchDrawer from '~/components/patterns/ManageBatchDrawer.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import PickBatchDrawer from '~/components/patterns/PickBatchDrawer.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { ensureProductBatch, findProductBatch } from '~/data/productDetails'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-001'
const SKU = '1001'
const DEMO = 'Ethiopia Yirgacheffe'

// Mirrors the .mbd-col-* widths in ManageBatchDrawer.vue's <style>.
const MBD_COL_PX: Record<string, number> = {
  'mbd-col-batch': 160, 'mbd-col-expiry': 140, 'mbd-col-attr': 152, 'mbd-col-location': 140,
  'mbd-col-num': 112, 'mbd-col-counted': 132, 'mbd-col-after': 132, 'mbd-col-unit': 78,
  'mbd-col-del': 44, 'mbd-col-pa-loc': 220,
}
/** Description's own floor inside --mbd-min-width (COL_PX.desc). */
const DESC_FLOOR = 200

function lot(batchNo: string) {
  const b = getWarehouseDetail(WAREHOUSE_ID)!.stock.find((s) => s.sku === SKU)!.batches!.find((x) => x.batchNo === batchNo)!
  return {
    key: b.batchNo, batchNo: b.batchNo, expiryDate: b.expiryDate,
    desc: '', onHand: b.onHand, counted: 1, unit: 'Kg', location: b.location,
  }
}

let wrapper: ReturnType<typeof mount> | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = '' })

async function mountManage(kind: string, modelValue: unknown[]) {
  wrapper = mount(ManageBatchDrawer, {
    props: { open: true, sku: SKU, warehouseId: WAREHOUSE_ID, modelValue, targetCount: 100, kind },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('ManageBatchDrawer column layout (D1)', () => {
  const kinds = ['in-out', 'transfer', 'put-away', 'picking', 'purchase-delivery', 'receiving'] as const

  for (const kind of kinds) {
    it(`${kind}: one <col> per header cell`, async () => {
      const w = await mountManage(kind, [lot('Batch #00002')])
      const table = w.find('table.mbd-table')
      expect(table.exists()).toBe(true)
      const cols = table.findAll('colgroup > col').length
      const ths = table.findAll('thead th').length
      expect(cols).toBe(ths)
      // Every body row of a single-location batch spans the full header width.
      const firstRow = table.find('tbody tr')
      const span = firstRow.findAll('td').reduce((s, td) => s + Number(td.attributes('colspan') ?? 1), 0)
      expect(span).toBe(ths)
    })
  }

  for (const kind of ['in-out', 'transfer', 'put-away', 'picking', 'receiving'] as const) {
    it(`${kind}: table floor leaves Description its own floor beside the pinned columns`, async () => {
      const w = await mountManage(kind, [lot('Batch #00002')])
      const table = w.find('table.mbd-table')
      const floor = parseInt((table.element as HTMLElement).style.getPropertyValue('--mbd-min-width'), 10)
      const pinned = table.findAll('colgroup > col').reduce((s, col) => {
        const cls = (col.attributes('class') ?? '').split(/\s+/).find((c) => c in MBD_COL_PX)
        return s + (cls ? MBD_COL_PX[cls]! : 0)
      }, 0)
      expect(table.findAll('colgroup > col.mbd-col-desc').length).toBe(1)
      expect(floor - pinned).toBe(DESC_FLOOR)
    })
  }

  it('purchase-delivery keeps Batch · Expiry · attributes (description under the batch)', async () => {
    const w = await mountManage('purchase-delivery', [lot('Batch #00002')])
    const h = w.findAll('thead th').map((th) => th.text())
    expect(h[0]).toBe('Batch')
    expect(h[1]).toBe('Expiry date')
    expect(h).not.toContain('Description')
  })
})

describe('no demo description for a real batch (D3)', () => {
  it('ManageBatchDrawer: a saved line with no description shows —', async () => {
    const rec = ensureProductBatch(SKU, 'D3-EMPTY-DESC-01')
    expect(rec.description).toBe('')
    const w = await mountManage('transfer', [{ ...lot('Batch #00002'), key: rec.batchNo, batchNo: rec.batchNo }])
    const row = w.findAll('tbody tr').find((tr) => tr.text().includes(rec.batchNo))!
    const h = w.findAll('thead th').map((th) => th.text())
    expect(row.findAll('td')[h.indexOf('Description')]!.text()).toBe('—')
    expect(w.text()).not.toContain(DEMO)
  })

  it('ManageBatchDrawer: a lot whose record has no description shows —', async () => {
    expect(findProductBatch(SKU, 'Batch #00002')?.description ?? '').toBe('')
    const w = await mountManage('in-out', [lot('Batch #00002')])
    expect(w.text()).not.toContain(DEMO)
  })

  it('ViewBatchDrawer: a saved stock in/out line with no description shows —', () => {
    const rec = ensureProductBatch(SKU, 'D3-EMPTY-DESC-02')
    const w = mount(ViewBatchDrawer, {
      props: {
        open: true, sku: SKU, warehouseId: WAREHOUSE_ID, kind: 'in-out', deltaTotal: 5, productName: 'Green Beans', productImg: '',
        savedBatches: [{ batchNo: rec.batchNo, qty: 5, description: '', attributes: {} }],
      },
    })
    const h = w.findAll('thead th').map((th) => th.text())
    const row = w.findAll('tbody tr').find((tr) => tr.text().includes(rec.batchNo))!
    expect(row.findAll('td')[h.indexOf('Description')]!.text()).toBe('—')
    expect(w.text()).not.toContain(DEMO)
    w.unmount()
  })

  it('PickBatchDrawer: a lot whose record has no description shows —, and Description keeps its floor', () => {
    const w = mount(PickBatchDrawer, {
      props: {
        open: true, productName: 'Green Beans', sku: SKU, warehouseId: WAREHOUSE_ID, warehouseName: 'WH', unit: 'Sack',
        targetCount: 2, modelValue: [],
      },
    })
    const h = w.findAll('thead th').map((th) => th.text())
    const row = w.findAll('tbody tr').find((tr) => tr.text().includes('Batch #00002'))!
    expect(row.findAll('td')[h.indexOf('Description')]!.text()).toBe('—')
    expect(w.text()).not.toContain(DEMO)
    // 200 batch + 140 expiry + 240 description floor + 176 per attribute + 110 + 120 + 78
    const attrs = h.length - 6
    expect((w.find('table.pbd-table').element as HTMLElement).style.minWidth).toBe(`${888 + 176 * attrs}px`)
    expect(w.findAll('colgroup > col').length).toBe(h.length)
    w.unmount()
  })
})
