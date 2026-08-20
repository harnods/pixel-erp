/**
 * Builds a compact snapshot of the ERP mock DB (HR / CRM / WMS / finance) that
 * grounds the Cowork briefing. Kept small — just the figures and a few named
 * records — so Gemini has real data to reference without a huge payload.
 */
import {
  employees,
  warehouses, productIndexRows,
  salesInvoices, bills, cashAccounts,
} from '~/data'
// CRM lives in its own module (not re-exported through the data barrel).
import { crmCustomers, pipelineStages, crmOrders } from '~/data/crm'

export interface CoworkContext {
  today: string
  user: string
  hr: Record<string, unknown>
  crm: Record<string, unknown>
  wms: Record<string, unknown>
  finance: Record<string, unknown>
}

function money(n: number): string {
  if (n >= 1_000_000_000) return `Rp${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `Rp${Math.round(n / 1_000_000)}M`
  return `Rp${n.toLocaleString('id-ID')}`
}

export function useCoworkContext() {
  function build(): CoworkContext {
    // ── HR ──
    const active = employees.filter((e) => e.status === 'active').length
    const resigning = employees.filter((e) => e.status === 'resigning').length
    const byDept: Record<string, number> = {}
    for (const e of employees) byDept[e.department] = (byDept[e.department] ?? 0) + 1

    // ── CRM ──
    const openStages = pipelineStages.filter((s) => s.name !== 'Won' && s.name !== 'Lost')
    const openDeals = openStages.reduce((a, s) => a + s.count, 0)
    const openValue = openStages.reduce((a, s) => a + s.value, 0)
    const prospects = crmCustomers.filter((c) => c.status === 'prospect').length
    const churned = crmCustomers.filter((c) => c.status === 'churned').length
    const topCustomers = [...crmCustomers]
      .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
      .slice(0, 4)
      .map((c) => ({ name: c.company, ltv: money(c.lifetimeValue), openDeals: c.openDeals }))

    // ── WMS ──
    const rows = productIndexRows()
    const lowStock = rows.filter((r) => r.available <= r.minStock && r.available > 0)
    const outOfStock = rows.filter((r) => r.available <= 0)

    // ── Finance ──
    const overdue = salesInvoices.filter((i) => i.status === 'overdue')
    const overdueBalance = overdue.reduce((a, i) => a + i.balance, 0)
    const openInvoices = salesInvoices.filter((i) => i.status === 'open')
    const unpaidBills = bills.filter((b) => b.status !== 'paid')
    const billsDue = unpaidBills.reduce((a, b) => a + b.balanceDue, 0)
    const cashTotal = cashAccounts.reduce((a, c) => a + (c.statementBalance ?? 0), 0)

    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

    return {
      today,
      user: 'Rizal',
      hr: {
        totalEmployees: employees.length,
        active,
        resigning,
        departments: byDept,
      },
      crm: {
        customers: crmCustomers.length,
        prospects,
        churned,
        openDeals,
        openPipelineValue: money(openValue),
        orders: crmOrders.length,
        topCustomers,
      },
      wms: {
        warehouses: warehouses.length,
        skus: rows.length,
        lowStock: lowStock.length,
        outOfStock: outOfStock.length,
        lowStockExamples: lowStock.slice(0, 5).map((r) => ({ sku: r.sku, name: r.name, available: r.available, minStock: r.minStock })),
      },
      finance: {
        overdueInvoices: overdue.length,
        overdueBalance: money(overdueBalance),
        openInvoices: openInvoices.length,
        unpaidBills: unpaidBills.length,
        billsDue: money(billsDue),
        cashOnHand: money(cashTotal),
        overdueExamples: overdue.slice(0, 4).map((i) => ({ number: `INV-${i.number}`, customer: i.customer.name, balance: money(i.balance) })),
      },
    }
  }

  return { build }
}
