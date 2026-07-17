// @vitest-environment happy-dom
/**
 * Received qty may exceed Expected qty (targetQty) but never Purchase qty
 * (expectedQty). Scanning a unit that would push received past Expected qty
 * (while still within Purchase qty) must confirm with the operator first,
 * rather than silently counting it. Scanning past Purchase qty stays a hard
 * block, unchanged.
 *
 * Note: this MpModal's root node stays in the DOM once opened once in this
 * test environment (the closing transition never fires without real
 * rendering), so these assertions check the functional side effect (the
 * counted qty) rather than the modal's DOM presence/absence.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ReceiveItemsPage from '~/components/pages/ReceiveItemsPage.vue'
import { receipts } from '~/data/receipts'
import { createReceivingTask, startReceiving } from '~/data/receivingTasks'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

// rcv-001 / SKU 3002: plain (untracked) accessory line, Purchase qty exactly 3 —
// matches the reported scenario (Purchase qty 3, Expected qty 2) precisely.
const RECEIPT_ID = 'rcv-001'
const SKU = '3002'

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

function qtyValue(wrapper: ReturnType<typeof mount>): string {
  return (wrapper.find('input.ri-qty-input').element as HTMLInputElement).value
}

// Scoped to the confirm modal's own DOM subtree — the page has its own
// "Cancel" button (goBack) that would otherwise collide with a page-wide search.
function findModalButton(text: string): HTMLElement {
  const modal = document.querySelector('#modal-ri-exceed-target')!
  const btn = Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === text)
  if (!btn) throw new Error(`Button "${text}" not found in confirm modal`)
  return btn as HTMLElement
}

describe('ReceiveItemsPage — confirm before counting a scan past Expected qty', () => {
  it('scans up to Expected qty freely, without ever opening the confirm modal', async () => {
    const receipt = receipts.find((r) => r.id === RECEIPT_ID)!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU],
      targetQtyBySku: { [SKU]: 2 },
    })!
    expect(task.items[0]!.expectedQty).toBe(3) // Purchase qty
    expect(task.items[0]!.targetQty).toBe(2)   // Expected qty
    startReceiving(task.id)

    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    expect(document.querySelector('#modal-ri-exceed-target')).toBeNull()
    await scan(wrapper, SKU)
    expect(document.querySelector('#modal-ri-exceed-target')).toBeNull()
    await scan(wrapper, SKU)
    expect(document.querySelector('#modal-ri-exceed-target')).toBeNull() // never opened yet
    expect(qtyValue(wrapper)).toBe('2')
    wrapper.unmount()
  })

  it('scanning past Expected qty opens a confirm modal with the right numbers, and does not count it until confirmed', async () => {
    const receipt = receipts.find((r) => r.id === RECEIPT_ID)!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU],
      targetQtyBySku: { [SKU]: 2 },
    })!
    startReceiving(task.id)
    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, SKU)
    await scan(wrapper, SKU)
    await scan(wrapper, SKU) // 3rd scan — past Expected qty (2), within Purchase qty (3)

    const modal = document.querySelector('#modal-ri-exceed-target')
    expect(modal).not.toBeNull()
    expect(modal!.textContent).toContain('expected qty of 2')
    expect(qtyValue(wrapper)).toBe('2') // not counted yet — awaiting confirmation
    wrapper.unmount()
  })

  it('canceling the confirm modal does not count the unit', async () => {
    const receipt = receipts.find((r) => r.id === RECEIPT_ID)!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU],
      targetQtyBySku: { [SKU]: 2 },
    })!
    startReceiving(task.id)
    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, SKU)
    await scan(wrapper, SKU)
    await scan(wrapper, SKU)

    findModalButton('Cancel').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(qtyValue(wrapper)).toBe('2')
    wrapper.unmount()
  })

  it('confirming the modal counts the unit (up to, but never past, Purchase qty)', async () => {
    const receipt = receipts.find((r) => r.id === RECEIPT_ID)!
    const task = createReceivingTask({
      receiptId: receipt.id, assignee: 'Test Operator', skus: [SKU],
      targetQtyBySku: { [SKU]: 2 },
    })!
    startReceiving(task.id)
    const wrapper = mount(ReceiveItemsPage, { props: { orderId: task.id } })
    await flushPromises()

    await scan(wrapper, SKU)
    await scan(wrapper, SKU)
    await scan(wrapper, SKU)

    findModalButton('Count it').dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(qtyValue(wrapper)).toBe('3') // now at Purchase qty — the hard ceiling

    // 4th scan: past Purchase qty (3) — hard block, no confirm modal, no increment.
    await scan(wrapper, SKU)
    expect(qtyValue(wrapper)).toBe('3')
    wrapper.unmount()
  })
})
