// @vitest-environment happy-dom
/**
 * Product detail "Export batches" modal (ATINV-9083): exports only this product's batches in
 * the Update batches template format, with the required-empty filter. When the filter
 * matches nothing, nothing downloads and an inline message explains why.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { exportableProductSkus, buildBatchExport } from '~/data/batchUpdateImport'
import { productIndexRows } from '~/data/productsIndex'

const write = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => {}))
vi.mock('~/utils/batchExportXlsx', () => ({ writeBatchExportXlsx: write }))
const toast = vi.hoisted(() => vi.fn())
vi.mock('~/utils/toasts', () => ({ successToast: toast }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// MpModal teleports to document.body under #modal-<id>, so query the document.
async function mountModal(sku: string, open = true) {
  const Modal = (await import('~/components/patterns/BatchExportModal.vue')).default
  const w = mount(Modal, { props: { open, sku }, attachTo: document.body })
  await flushPromises()
  return w
}
const modal = () => document.querySelector('#modal-batch-export-modal') as HTMLElement
const btn = (label: string) => Array.from(modal().querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLElement
const box = () => modal().querySelector('input[type="checkbox"]') as HTMLInputElement
async function click(el: HTMLElement) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); await flushPromises() }

beforeEach(() => { write.mockClear(); toast.mockClear(); document.body.innerHTML = '' })
describe('BatchExportModal', () => {
  it('exports only this product', async () => {
    const sku = exportableProductSkus().find((s) => buildBatchExport({ skus: [s], onlyRequiredEmpty: false }).rows.length > 0)!
    const name = productIndexRows().find((r) => r.sku === sku)!.name
    const w = await mountModal(sku)
    await click(btn('Export'))
    expect(write).toHaveBeenCalledTimes(1)
    const data = write.mock.calls[0][0] as { rows: { cells: { productName: string } }[] }
    expect(data.rows.length).toBeGreaterThan(0)
    expect(data.rows.every((r) => r.cells.productName === name)).toBe(true)
    expect(toast).toHaveBeenCalledWith('Batches exported')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('shows the no-match error when the checkbox filters everything out', async () => {
    const sku = exportableProductSkus().find((s) => buildBatchExport({ skus: [s], onlyRequiredEmpty: true }).rows.length === 0)!
    expect(sku, 'fixture: product with no required-empty batch').toBeTruthy()
    const w = await mountModal(sku)
    await click(box())
    await click(btn('Export'))
    expect(write).not.toHaveBeenCalled()
    expect(modal().textContent).toContain('No batches match these filters')
    expect(w.emitted('close')).toBeFalsy()
    // Changing the checkbox clears the error.
    await click(box())
    expect(modal().textContent).not.toContain('No batches match these filters')
  })

  it('labels the checkbox and tags the coachmark', async () => {
    const w = await mountModal(exportableProductSkus()[0])
    expect(modal().querySelector('[data-devchange="batch-export-modal"]') !== null).toBe(true)
    const label = modal().querySelector(`label[for="${box().id}"]`)
    expect(label?.textContent).toContain('Only batches with an empty required attribute')
  })
})
