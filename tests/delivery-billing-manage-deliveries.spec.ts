// @vitest-environment happy-dom
/**
 * Manage deliveries per line (PRD Partial & Progress Invoicing, F-07).
 * Seed: SO104, SD105 (4/12/2/30) and SD106 (6/8/3/20); Sales Invoice #40202
 * already billed 30% from SD105, so Grinder has 1 unit left on SD105 and 6 on SD106.
 *
 *  - a line with lineSplits bills exactly the chosen figures, ignores its typed
 *    Bill now, and leaves every other line oldest-first;
 *  - a chosen figure above what is left on its delivery is an error naming it;
 *  - the drawer lists the ticked deliveries, seeds from the current split and
 *    emits the pick on Save; above-cap rows block Save with an inline error.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ManageBillingDeliveriesDrawer from '~/components/patterns/ManageBillingDeliveriesDrawer.vue'
import { planBilling, resetDeliveryBilling, type BillingInput } from '~/data/deliveryBilling'

const base = (over: Partial<BillingInput> = {}): BillingInput => ({
  orderId: 'SO104', deliveryIds: ['SD105', 'SD106'], basis: 'qty', lineInputs: { 0: 4, 1: 2 }, split: 'auto', ...over,
})
const cell = (plan: ReturnType<typeof planBilling>, d: string, i: number) =>
  plan.deliveries.find(x => x.deliveryId === d)!.cells.find(c => c.orderLineIndex === i)!.billNow

let wrapper: ReturnType<typeof mount> | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null; resetDeliveryBilling() })

describe('planBilling with chosen deliveries (lineSplits)', () => {
  it('oldest delivery first by default: 4 grinders = 1 from SD105 + 3 from SD106', () => {
    const p = planBilling(base())
    expect([cell(p, 'SD105', 0), cell(p, 'SD106', 0)]).toEqual([1, 3])
    expect(p.lines[0]!.isChosen).toBe(false)
  })

  it('bills exactly the chosen figures for that line only', () => {
    const p = planBilling(base({ lineSplits: { 0: { SD105: 0, SD106: 4 } } }))
    expect(p.errors).toEqual([])
    expect([cell(p, 'SD105', 0), cell(p, 'SD106', 0)]).toEqual([0, 4])
    expect(p.lines[0]!.qty).toBe(4)
    expect(p.lines[0]!.isChosen).toBe(true)
    // Line 1 (2 kg) still oldest-first: SD105 has 6 kg left.
    expect([cell(p, 'SD105', 1), cell(p, 'SD106', 1)]).toEqual([2, 0])
  })

  it('the chosen total replaces the typed Bill now', () => {
    const p = planBilling(base({ lineInputs: { 0: 1 }, lineSplits: { 0: { SD105: 1, SD106: 5 } } }))
    expect(p.lines[0]!.qty).toBe(6)
    expect(p.lines[0]!.input).toBe(6)
  })

  it('in percentage billing the line shows the chosen total as % of ordered', () => {
    const p = planBilling(base({ basis: 'percent', lineInputs: { 0: 10 }, lineSplits: { 0: { SD106: 4 } } }))
    expect(p.lines[0]!.qty).toBe(4)
    expect(p.lines[0]!.input).toBeCloseTo(40, 6)
  })

  it('flags a chosen figure above what is left on its delivery', () => {
    const p = planBilling(base({ lineSplits: { 0: { SD105: 2, SD106: 1 } } }))
    expect(p.errors).toEqual(['Grinder Kopi Komersial: max 1 unit on Sales Delivery #20105'])
    expect(p.deliveries[0]!.cells.find(c => c.orderLineIndex === 0)!.overCap).toBe(true)
  })
})

describe('ManageBillingDeliveriesDrawer', () => {
  const mountDrawer = () => {
    const plan = planBilling(base())
    return mount(ManageBillingDeliveriesDrawer, {
      props: { isOpen: true, plan, line: plan.lines[0]! },
      global: { stubs: { teleport: true } },
    })
  }

  it('lists the ticked deliveries, seeded from the current split', () => {
    wrapper = mountDrawer()
    const rows = wrapper.findAll('tr[data-delivery-id]').map(r => r.attributes('data-delivery-id'))
    expect(rows).toEqual(['SD105', 'SD106'])
    const inputs = wrapper.findAll('input[type="number"]').map(i => (i.element as HTMLInputElement).value)
    expect(inputs).toEqual(['1', '3'])
    expect(wrapper.text()).toContain('Manage deliveries')
    expect(wrapper.find('[data-testid="mbd-total"]').text()).toContain('4 unit')
  })

  it('emits the pick on Save', async () => {
    wrapper = mountDrawer()
    const inputs = wrapper.findAll('input[type="number"]')
    await inputs[0]!.setValue('0')
    await inputs[1]!.setValue('4')
    await wrapper.find('#mbd-save').trigger('click')
    expect(wrapper.emitted('save')?.[0]).toEqual([{ SD105: 0, SD106: 4 }])
  })

  it('does not save a row above what is left and says why', async () => {
    wrapper = mountDrawer()
    await wrapper.findAll('input[type="number"]')[0]!.setValue('3')
    await wrapper.find('#mbd-save').trigger('click')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.find('[data-testid="mbd-errors"]').text()).toContain('#20105')
  })
})
