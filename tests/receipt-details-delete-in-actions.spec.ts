// @vitest-environment happy-dom
/**
 * Bug (Notion Bugs page): on Receipt details, Delete for a manual (Direct Inbound)
 * receipt was a standalone footer button — it should live in the Actions dropdown
 * (alongside Edit order / Cancel), not as its own button.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed, reactive, watch, onMounted, onUnmounted, nextTick } from 'vue'
import ReceiptDetailsPage from '~/components/pages/ReceiptDetailsPage.vue'
import { addReceipt, isManualReceipt } from '~/data/receipts'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onUnmounted', onUnmounted)
vi.stubGlobal('nextTick', nextTick)
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

describe('ReceiptDetailsPage — Delete lives in the Actions dropdown, not a standalone footer button', () => {
  it('a manual receipt has no standalone Delete footer button, but a Delete action item', async () => {
    const receipt = addReceipt({
      purchaseNo: 'PO-TEST-DELETE-DROPDOWN',
      warehouseId: 'wh-006', warehouseName: 'Gudang Makassar Selatan',
      skuQty: 1, purchaseQty: 10, receivedQty: 0,
      status: 'on the way', estimatedArrival: '2026-08-01', trackingNos: [],
    })
    expect(isManualReceipt(receipt)).toBe(true) // addReceipt → rcv-new-* = manual

    const wrapper = mount(ReceiptDetailsPage, { props: { orderId: receipt.id } })
    await flushPromises()

    // No standalone footer Delete button anymore.
    const standaloneDelete = wrapper.findAll('button.detail-btn').filter((b) => b.text() === 'Delete')
    expect(standaloneDelete.length).toBe(0)

    // Open the "More actions" dropdown (portaled to body) and confirm Delete is an item there.
    const chevron = wrapper.find('button[aria-label="More actions"]')
    expect(chevron.exists()).toBe(true)
    await chevron.trigger('click')
    await flushPromises()
    const deleteInMenu = Array.from(document.body.querySelectorAll('*')).some(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'Delete',
    )
    expect(deleteInMenu).toBe(true)

    wrapper.unmount()
  })
})
