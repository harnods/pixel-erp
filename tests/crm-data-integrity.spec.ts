/**
 * CRM (Qontak) — mini-DB coherence regression tests.
 *
 * The CRM module must stay coherent with the rest of the ERP (PT Central Perk, a
 * coffee business): owners are real Central Perk staff (employees.ts), orders
 * reference known customers/products, and the Home KPI roll-ups agree with the
 * pipeline + list data (Home and the list pages must never disagree).
 */
import { describe, it, expect } from 'vitest'
import {
  crmCustomers, crmProducts, crmOrders, crmTasks, pipelineStages, CRM_OWNERS,
  openDealsCount, openDealsValue, wonThisMonthValue, activeCustomersCount, ordersThisMonthValue,
} from '~/data/crm'
import { employees } from '~/data/employees'

const employeeNames = new Set(employees.map((e) => e.fullName))
const customerNames = new Set(crmCustomers.map((c) => c.company))
const productNames = new Set(crmProducts.map((p) => p.name))

describe('CRM data — owners are real Central Perk staff', () => {
  it('every CRM owner is an actual employee', () => {
    for (const owner of CRM_OWNERS) expect(employeeNames.has(owner), owner).toBe(true)
  })
  it('customers / orders / tasks are all owned by a CRM owner', () => {
    const owners = new Set<string>(CRM_OWNERS)
    for (const c of crmCustomers) expect(owners.has(c.owner), `customer ${c.company}`).toBe(true)
    for (const o of crmOrders) expect(owners.has(o.owner), `order ${o.id}`).toBe(true)
    for (const t of crmTasks) expect(owners.has(t.owner), `task ${t.id}`).toBe(true)
  })
})

describe('CRM data — referential integrity', () => {
  it('every order references a known customer and product', () => {
    for (const o of crmOrders) {
      expect(customerNames.has(o.customer), `order ${o.id} customer`).toBe(true)
      expect(productNames.has(o.product), `order ${o.id} product`).toBe(true)
      expect(o.amount, `order ${o.id} amount`).toBeGreaterThan(0)
    }
  })
  it('every task relates to a known customer', () => {
    for (const t of crmTasks) expect(customerNames.has(t.relatedTo), `task ${t.id}`).toBe(true)
  })
  it('products have a positive price and a unit', () => {
    for (const p of crmProducts) {
      expect(p.price, `${p.name} price`).toBeGreaterThan(0)
      expect(p.unit, `${p.name} unit`).toBeTruthy()
    }
  })
})

describe('CRM Home KPIs agree with the pipeline + lists', () => {
  it('open-deal roll-ups match the non-terminal pipeline stages', () => {
    const open = pipelineStages.filter((s) => !['Won', 'Lost'].includes(s.name))
    expect(openDealsCount.value).toBe(open.reduce((n, s) => n + s.count, 0))
    expect(openDealsValue.value).toBe(open.reduce((n, s) => n + s.value, 0))
    expect(wonThisMonthValue.value).toBe(pipelineStages.find((s) => s.name === 'Won')?.value ?? 0)
  })
  it('active-customer + Feb-order roll-ups match the source rows', () => {
    expect(activeCustomersCount.value).toBe(crmCustomers.filter((c) => c.status === 'active').length)
    const feb = crmOrders.filter((o) => o.date >= '2026-02-01' && o.status !== 'cancelled').reduce((n, o) => n + o.amount, 0)
    expect(ordersThisMonthValue.value).toBe(feb)
  })
})
