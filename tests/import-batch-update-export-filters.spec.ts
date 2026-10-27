// @vitest-environment happy-dom
/**
 * Update batches page, step 1 (ATINV-9083): the template is the current batches, filtered by
 * product and by "required attribute still empty". When the filters match nothing, nothing
 * is downloaded and an inline message explains why (rule/form-errors-inline).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { exportableProductSkus, buildBatchExport } from '~/data/batchUpdateImport'
import { productIndexRows } from '~/data/productsIndex'

const write = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('~/utils/batchExportXlsx', () => ({ writeBatchExportXlsx: write }))
const toast = vi.hoisted(() => vi.fn())
vi.mock('~/utils/toasts', () => ({ successToast: toast }))
const query = vi.hoisted(() => ({ value: {} as Record<string, string> }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: query.value }),
  useRouter: () => ({ push: vi.fn() }),
}))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

async function mountPage() {
  const Page = (await import('~/components/pages/ImportBatchUpdatePage.vue')).default
  return mount(Page, { attachTo: document.body, global: { stubs: { Teleport: true } } })
}
const downloadBtn = (w: ReturnType<typeof mount>) => w.findAll('button').find((b) => b.text() === 'Download template')!

beforeEach(() => { write.mockClear(); toast.mockClear(); query.value = {} })

describe('Update batches — step 1 export filters', () => {
  it('shows Products and the required-empty checkbox in step 1', async () => {
    const w = await mountPage()
    const block = w.find('[data-devchange="batch-export-filters"]')
    expect(block.exists()).toBe(true)
    expect(block.text()).toContain('Products')
    expect(block.text()).toContain('All products')
    expect(block.text()).toContain('Only batches with an empty required attribute')
  })

  it('shows the no-match message and does not download when the filters match nothing', async () => {
    const sku = exportableProductSkus().find((s) => buildBatchExport({ skus: [s], onlyRequiredEmpty: true }).rows.length === 0)
    expect(sku, 'fixture: a product with no required-empty batch').toBeTruthy()
    query.value = { sku: sku! }
    const w = await mountPage()
    await w.find('input[type="checkbox"]').setValue(true)
    await downloadBtn(w).trigger('click')
    await flushPromises()
    expect(write).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
    expect(w.text()).toContain('No batches match these filters')
    expect(downloadBtn(w).attributes('disabled')).toBeUndefined()
    // Changing a filter clears the message.
    await w.find('input[type="checkbox"]').setValue(false)
    expect(w.text()).not.toContain('No batches match these filters')
  })

  it('downloads the current batches and toasts when something matches', async () => {
    const sku = exportableProductSkus().find((s) => buildBatchExport({ skus: [s], onlyRequiredEmpty: false }).rows.length > 0)!
    query.value = { sku }
    const w = await mountPage()
    await downloadBtn(w).trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalledTimes(1)
    const [data, filename] = write.mock.calls[0] as unknown as [{ rows: { cells: { productName: string } }[] }, string]
    expect(filename).toBe('update-batches-template.xlsx')
    const name = productIndexRows().find((r) => r.sku === sku)!.name
    expect(data.rows.length).toBeGreaterThan(0)
    expect(data.rows.every((r) => r.cells.productName === name)).toBe(true)
    expect(toast).toHaveBeenCalledWith('Batches exported')
  })

  it('product names are unique among exportable products (name <-> SKU mapping)', () => {
    const names = exportableProductSkus().map((s) => productIndexRows().find((r) => r.sku === s)!.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
