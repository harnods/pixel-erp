// @vitest-environment happy-dom
/**
 * Bug: CreateReceiptPage's persist() only ever saved aggregate skuQty/purchaseQty
 * numbers — the actual products/qty picked in the form were discarded. The
 * details page (and receiving/put-away downstream) derived its line items via
 * lineItemsForReceipt(), which — with no real data to go on — fabricated an
 * unrelated random product mix from the receipt's id hash. So whatever the
 * operator actually entered on Create receipt never matched what View details
 * showed afterward. Fixed by saving the real {productId, qty} picks on the
 * Receipt and having lineItemsForReceipt() use them when present.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, computed } from 'vue'
import { receipts } from '~/data/receipts'
import { lineItemsForReceipt } from '~/data/receiptLineItems'
import { CATALOG } from '~/data/catalog'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
// useWarehouseContext.ts (and useScenario.ts it calls) run ref() at
// module-evaluation time (top-level `const activeWarehouseId = ref("")`) — a
// static import would run before the stubGlobal calls above take effect, so
// both are imported dynamically here instead, after their globals are ready.
const { useScenario } = await import('~/composables/useScenario')
vi.stubGlobal('useScenario', useScenario)
const { useWarehouseContext } = await import('~/composables/useWarehouseContext')
vi.stubGlobal('useWarehouseContext', useWarehouseContext)
const { default: CreateReceiptPage } = await import('~/components/pages/CreateReceiptPage.vue')

describe('CreateReceiptPage — what you add must match what View details shows', () => {
  it('saving with 2 specific products/qtys produces a receipt whose line items are exactly those products/qtys', async () => {
    const wrapper = mount(CreateReceiptPage)
    await flushPromises()

    const autocompletes = wrapper.findAllComponents({ name: 'MpAutocomplete' })
    // DOM order: Vendor, Warehouse, then one per product row.
    await autocompletes[0]!.vm.$emit('update:modelValue', 'PT Kopi Sejahtera')
    await autocompletes[1]!.vm.$emit('update:modelValue', 'wh-006')
    await flushPromises()

    const productA = CATALOG[0]!
    const productB = CATALOG[1]!
    await autocompletes[2]!.vm.$emit('update:modelValue', productA.id)
    await flushPromises()

    // Selecting the first row's product auto-adds a second empty row.
    const autocompletesAfterFirstPick = wrapper.findAllComponents({ name: 'MpAutocomplete' })
    await autocompletesAfterFirstPick[3]!.vm.$emit('update:modelValue', productB.id)
    await flushPromises()

    const qtyInputs = wrapper.findAll('input[type="number"]')
    await qtyInputs[0]!.setValue('7')
    await qtyInputs[1]!.setValue('3')
    await flushPromises()

    const saveBtn = Array.from(wrapper.findAll('button')).find(b => b.text() === 'Save')!
    await saveBtn.trigger('click')
    await new Promise(r => setTimeout(r, 700)) // persist()'s fake 600ms save delay
    await flushPromises()

    const saved = receipts[0]!
    expect(saved.lineItems).toEqual(
      expect.arrayContaining([
        { productId: productA.id, qty: 7 },
        { productId: productB.id, qty: 3 },
      ]),
    )
    expect(saved.skuQty).toBe(2)
    expect(saved.purchaseQty).toBe(10)

    // The details page's data source must reflect the SAME real products/qtys,
    // not a hash-derived random mix.
    const lineItems = lineItemsForReceipt(saved)
    expect(lineItems.map(l => l.sku).sort()).toEqual([productA.sku, productB.sku].sort())
    expect(lineItems.find(l => l.sku === productA.sku)?.purchaseQty).toBe(7)
    expect(lineItems.find(l => l.sku === productB.sku)?.purchaseQty).toBe(3)

    wrapper.unmount()
  })
})
