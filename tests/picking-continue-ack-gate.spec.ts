// @vitest-environment happy-dom
/**
 * Shared picking with a cancelled order shows the "Acknowledge" banner. Clicking
 * Continue picking must NOT slip straight into the pick screen — it has to open the
 * acknowledgment modal first (mirrors the put-away detail's ack gate). Only after
 * acknowledging (which drops the cancelled order's lines) does it navigate to /pick.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed } from 'vue'
import PickingTaskDetailsPage from '~/components/pages/PickingTaskDetailsPage.vue'
import { addOutgoing, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, startPicking, getPickingTask, pendingCanceledOrderIds } from '~/data/pickingTasks'
import { cancelOutboundOrder } from '~/data/outboundSync'

const pushSpy = vi.fn()
vi.stubGlobal('computed', computed)
vi.stubGlobal('useRouter', () => ({ push: pushSpy }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
const SKU = '3004'
function order(salesNo: string, qty: number): OutgoingOrder {
  return addOutgoing({
    salesNo, source: 'Manual', warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: qty, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
    lines: [{ sku: SKU, productName: SKU, desc: '', img: '', unit: 'Unit', qty }],
  })
}
const footerBtn = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)!

describe('PickingTaskDetailsPage — Continue picking gated by cancelled-order acknowledgment', () => {
  it('Continue picking opens the ack modal (no navigation) while a cancelled order is pending; acknowledging then continues', async () => {
    const live = order('Ack Gate Live', 3)
    const toCancel = order('Ack Gate Cancelled', 2)
    const task = addPickingTask({
      salesOrderIds: [live.id, toCancel.id], salesNos: [live.salesNo, toCancel.salesNo],
      warehouseId: WH, warehouseName: WH_NAME, assignee: 'Op',
    })
    startPicking(task.id) // in progress
    expect(cancelOutboundOrder(toCancel.id).ok).toBe(true) // shared + in-progress → needs ack
    expect(getPickingTask(task.id)!.needsCancelAck).toBe(true)

    pushSpy.mockClear()
    const wrapper = mount(PickingTaskDetailsPage, { props: { orderId: task.id } })
    await flushPromises()

    // Continue picking must NOT navigate — it opens the ack modal instead.
    await footerBtn(wrapper, 'Continue picking').trigger('click')
    await flushPromises()
    expect(pushSpy).not.toHaveBeenCalled()
    expect(document.querySelector('#modal-pkd-ack-cancel')).toBeTruthy()

    // Acknowledge & continue → cancelled order's lines dropped, THEN navigate to /pick.
    const ackBtn = Array.from(document.querySelectorAll('#modal-pkd-ack-cancel button'))
      .find((b) => b.textContent?.includes('Acknowledge')) as HTMLElement
    ackBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(pendingCanceledOrderIds(getPickingTask(task.id)!)).toEqual([]) // acknowledged
    expect(pushSpy).toHaveBeenCalledWith(`/picking/${task.id}/pick`)
    wrapper.unmount()
  })
})
