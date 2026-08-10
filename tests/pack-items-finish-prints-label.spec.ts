// @vitest-environment happy-dom
/**
 * D4 AC#5 — Complete packing prints the shipping label. Finishing packing no
 * longer just navigates away: it opens the shipping-label print preview (source
 * label for marketplace orders, WMS-generated label otherwise) right where the
 * PRD puts it — Confirm → "Complete the Packing?" = Yes → print the label →
 * stick it on the package — and only leaves the page once that preview is
 * dismissed. When there's nothing printable (label not arrived yet), it skips
 * straight to navigating away instead of blocking the packer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PackItemsPage from '~/components/pages/PackItemsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, getPickingTask } from '~/data/pickingTasks'
import { addPackingTask } from '~/data/packingTasks'
import '~/data/outgoing'

const push = vi.fn()
vi.stubGlobal('useRouter', () => ({ push }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const SKU = '3001' // plain (non-tracked) SKU
let seq = 0

function marketplaceOrder(withLabel: boolean, qty = 3): OutgoingOrder {
  seq++
  return addOutgoing({
    salesNo: `#SO${900 + seq}`, source: 'Shopee: Central Perk', warehouseId: WH, warehouseName: WH_NAME,
    shippingLabel: withLabel ? `SPXID${3000 + seq}` : undefined,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: SKU, productName: 'Widget', desc: '', img: '', unit: 'Unit', qty }],
  })
}

/** A ready-to-finish packing task: fully picked, packing task Open. */
function readyPackingTask(order: OutgoingOrder, qty: number) {
  const pt = addPickingTask({ salesOrderIds: [order.id], salesNos: [order.salesNo], warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
  const key = `${order.id}::${SKU}`
  const pick = getPickingTask(pt.id)!
  pick.pickedByKey = { [key]: qty }
  pick.status = 'completed'
  return addPackingTask({ salesOrderId: order.id, salesNo: order.salesNo, pickingTaskId: pt.id, pickingTaskNo: pt.taskNo, warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op' })
}

// MpModal teleports to document.body under #modal-<id> — outside the mounted
// wrapper's root, so modal content/buttons must be queried from the document,
// same technique as tests/pack-items-unsaved-changes-guard.spec.ts.
function modalButton(modalId: string, text: string): HTMLElement {
  const modal = document.querySelector(`#modal-${modalId}`)
  if (!modal) throw new Error(`Modal #modal-${modalId} not found`)
  const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!btn) throw new Error(`Button "${text}" not found in #modal-${modalId}`)
  return btn as HTMLElement
}

// Scan (not manual qty entry) so this works regardless of the warehouse's scan
// threshold — same technique as tests/pack-items-unsaved-changes-guard.spec.ts.
async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

async function finishPacking(wrapper: ReturnType<typeof mount>, qty: number) {
  for (let i = 0; i < qty; i++) await scan(wrapper, SKU)
  const finishBtn = Array.from(wrapper.findAll('button')).find((b) => b.text() === 'Finish packing')!
  await finishBtn.trigger('click') // opens the confirm modal
  await flushPromises()
  modalButton('pak-confirm', 'Finish packing').dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}

describe('PackItemsPage — Finish packing prints the shipping label (D4 AC#5)', () => {
  beforeEach(() => { push.mockClear() })

  it('marketplace order WITH its source label: preview opens, navigation waits until it closes', async () => {
    const o = marketplaceOrder(true, 2)
    const pk = readyPackingTask(o, 2)
    const wrapper = mount(PackItemsPage, { props: { orderId: pk.id } })
    await flushPromises()

    await finishPacking(wrapper, 2)

    expect(document.querySelector('#modal-pdf-preview-modal')?.textContent).toContain('Shipping label preview')
    expect(push).not.toHaveBeenCalled() // still on this page, previewing the label

    // Dismiss the preview (Cancel) → now it leaves.
    modalButton('pdf-preview-modal', 'Cancel').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(push).toHaveBeenCalledWith(`/packing/${pk.id}`)
    wrapper.unmount()
  })

  it('marketplace order still WAITING for its source label: nothing to print, leaves immediately', async () => {
    const o = marketplaceOrder(false, 2)
    const pk = readyPackingTask(o, 2)
    const wrapper = mount(PackItemsPage, { props: { orderId: pk.id } })
    await flushPromises()

    await finishPacking(wrapper, 2)

    expect(document.querySelector('#modal-pdf-preview-modal')).toBeFalsy()
    expect(push).toHaveBeenCalledWith(`/packing/${pk.id}`)
    wrapper.unmount()
  })
})
