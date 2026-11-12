// @vitest-environment happy-dom
/**
 * DeliveryBillingSplit — the "Billing per delivery" section of the sales invoice
 * form (PRD Partial & Progress Invoicing, Rule 5 / F-07). Seed: SO104 with
 * SD105 (created 01/07) and SD106 (created 20/07).
 *
 *  - groups render oldest CREATED delivery first, whatever order was ticked;
 *  - auto split is read-only; the outcome hint names what this invoice does;
 *  - manual split emits update:manual with a NEW grid carrying the changed cell;
 *  - a manual cell over its delivery's cap is flagged on the cell.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DeliveryBillingSplit from '~/components/patterns/DeliveryBillingSplit.vue'
import { planBilling, manualFromPlan } from '~/data/deliveryBilling'

const forty = { 0: 40, 1: 40, 2: 40, 3: 40 }

let wrapper: ReturnType<typeof mount> | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null })

describe('DeliveryBillingSplit', () => {
  it('renders one group per delivery, oldest created first, read-only in auto', () => {
    const plan = planBilling({ orderId: 'SO104', deliveryIds: ['SD106', 'SD105'], basis: 'percent', lineInputs: forty, split: 'auto' })
    wrapper = mount(DeliveryBillingSplit, { props: { plan, split: 'auto', manual: {} } })
    const ids = wrapper.findAll('tbody.dbs-group').map((g) => g.attributes('data-delivery-id'))
    expect(ids).toEqual(['SD105', 'SD106'])
    expect(wrapper.text()).toContain('Sales Delivery #20105')
    expect(wrapper.text()).toContain('Billing per delivery')
    expect(wrapper.find('[data-devchange="si-billing-per-delivery"]').exists()).toBe(true)
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(0)
  })

  it('renders nothing when the plan has no delivery', () => {
    const plan = planBilling({ orderId: 'SO104', deliveryIds: [], basis: 'percent', lineInputs: {}, split: 'auto' })
    wrapper = mount(DeliveryBillingSplit, { props: { plan, split: 'auto', manual: {} } })
    expect(wrapper.find('.dbs').exists()).toBe(false)
  })

  it('manual split emits a new manual grid with the changed cell', async () => {
    const seed = planBilling({ orderId: 'SO104', deliveryIds: ['SD105', 'SD106'], basis: 'percent', lineInputs: forty, split: 'auto' })
    const manual = manualFromPlan(seed)
    const plan = planBilling({ orderId: 'SO104', deliveryIds: ['SD105', 'SD106'], basis: 'percent', lineInputs: forty, split: 'manual', manual })
    wrapper = mount(DeliveryBillingSplit, { props: { plan, split: 'manual', manual } })
    const input = wrapper.find('#f-dbs-SD106-0')
    expect(input.exists()).toBe(true)
    await input.setValue('2')
    const events = wrapper.emitted('update:manual') ?? []
    expect(events.length).toBeGreaterThan(0)
    const next = events.at(-1)![0] as Record<string, Record<number, number>>
    expect(next).not.toBe(manual)
    expect(next.SD106![0]).toBe(2)
    expect(next.SD105).toEqual(manual.SD105)
    expect(manual.SD106![0]).toBe(3) // prop untouched
  })

  it('flags a manual cell over its delivery cap on the cell', () => {
    const manual = { SD105: { 0: 5 } } // SD105 has 1 grinder left to bill
    const plan = planBilling({ orderId: 'SO104', deliveryIds: ['SD105'], basis: 'qty', lineInputs: {}, split: 'manual', manual })
    wrapper = mount(DeliveryBillingSplit, { props: { plan, split: 'manual', manual } })
    expect(wrapper.findAll('.dbs-td--error')).toHaveLength(1)
  })
})
