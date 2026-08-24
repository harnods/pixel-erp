/**
 * Builds a compact snapshot of the ERP mock DB (HR / CRM / WMS / finance) that
 * grounds the Cowork briefing. Kept small — just the figures and a few named
 * records — so Gemini has real data to reference without a huge payload.
 */
import {
  employees,
  warehouses, productIndexRows,
  salesInvoices, bills, cashAccounts,
  workOrders,
} from '~/data'
// CRM lives in its own module (not re-exported through the data barrel).
import { crmCustomers, pipelineStages, crmOrders } from '~/data/crm'
import { attendanceExceptions, receivablesCollections } from '~/data/cowork'
import { expiringContracts } from '~/data/contracts'

export interface CoworkContext {
  today: string
  user: string
  hr: Record<string, unknown>
  crm: Record<string, unknown>
  wms: Record<string, unknown>
  finance: Record<string, unknown>
  production: Record<string, unknown>
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

    // ── WMS (real stock straight from the inventory DB) ──
    const rows = productIndexRows()                              // aggregate across all warehouses
    const lowStock = rows.filter((r) => r.available <= r.minStock && r.available > 0)
    const outOfStock = rows.filter((r) => r.available <= 0)
    const totalOnHand = rows.reduce((a, r) => a + r.onHand, 0)
    const invItem = (r: typeof rows[number]) => ({
      sku: r.sku, name: r.name, category: r.category, unit: r.unit,
      onHand: r.onHand, reserved: r.reserved, available: r.available, minStock: r.minStock,
    })
    // Per-warehouse stock — rescoped to each warehouse's own quantities. This is what
    // lets the co-worker answer "report gudang Medan" with THAT warehouse's real
    // numbers instead of the aggregate.
    const stockByWarehouse = warehouses.map((w) => {
      const wr = productIndexRows([w.id]).filter((r) => r.onHand > 0 || r.reserved > 0)
      return {
        warehouse: w.name,
        skusInStock: wr.length,
        totalOnHand: wr.reduce((a, r) => a + r.onHand, 0),
        lowStock: wr.filter((r) => r.available <= r.minStock && r.available > 0).length,
        items: wr.map(invItem),
      }
    })

    // ── Finance ──
    const overdue = salesInvoices.filter((i) => i.status === 'overdue')
    const overdueBalance = overdue.reduce((a, i) => a + i.balance, 0)
    const openInvoices = salesInvoices.filter((i) => i.status === 'open')
    const unpaidBills = bills.filter((b) => b.status !== 'paid')
    const billsDue = unpaidBills.reduce((a, b) => a + b.balanceDue, 0)
    const cashTotal = cashAccounts.reduce((a, c) => a + (c.statementBalance ?? 0), 0)

    // ── Production ──
    const openWO = workOrders.filter((w) => w.status !== 'completed' && w.status !== 'canceled')
    const empByCode = (code: string) => employees.find((e) => e.employeeId === code || e.id === code)
    const empName = (code: string) => empByCode(code)?.fullName ?? code
    // A compact-but-real HR profile so the co-worker can answer profile questions.
    const profileOf = (code: string) => {
      const e = empByCode(code)
      if (!e) return { code }
      const tenure = e.joinDate ? `${Math.max(0, Math.floor((Date.now() - new Date(e.joinDate).getTime()) / (365.25 * 864e5)))} yr` : undefined
      return {
        name: e.fullName, position: e.jobPosition, department: e.department,
        employmentStatus: e.employmentStatus, jobLevel: e.jobLevel,
        joinDate: e.joinDate, tenure, manager: e.directManager, email: e.email, phone: e.phone,
      }
    }

    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

    return {
      today,
      user: 'Rizal Candra',
      hr: {
        totalEmployees: employees.length,
        active,
        resigning,
        departments: byDept,
        resigningEmployees: employees.filter((e) => e.status === 'resigning').map((e) => ({ name: e.fullName, position: e.jobPosition, department: e.department })),
        // Rich, grounded attendance data — who was late today, by how much, WHY, and
        // the co-worker's read on the pattern; each carries the employee's profile so
        // the user can follow up with "tell me about this person".
        attendanceExceptions: attendanceExceptions.map((a) => ({
          employee: empName(a.employeeId),
          profile: profileOf(a.employeeId),
          date: a.date, type: a.type,
          clockIn: a.clockIn, minutesLate: a.minutesLate,
          reason: a.reason, analysis: a.analysis,
        })),
        // Full employee directory — real records so any "tell me about / list / whose
        // manager / salary / join date" question is answered from the DB, not invented.
        directory: employees.map((e) => ({
          id: e.employeeId, name: e.fullName, position: e.jobPosition, department: e.department,
          jobLevel: e.jobLevel, employmentStatus: e.employmentStatus, status: e.status,
          joinDate: e.joinDate, manager: e.directManager, branch: e.branch,
          email: e.email, phone: e.phone, basicSalary: e.basicSalary,
        })),
        // Contracts ending within 60 days — grounds the "Contracts expiring soon"
        // task/chat (party = real vendor, value + end date from the contracts table).
        contractsExpiring: expiringContracts(60).map((c) => ({
          title: c.title, party: c.party, type: c.type, endDate: c.endDate,
          annualValue: money(c.annualValue), owner: c.owner, autoRenew: c.autoRenew, note: c.note,
        })),
      },
      crm: {
        customers: crmCustomers.length,
        prospects,
        churned,
        openDeals,
        openPipelineValue: money(openValue),
        orders: crmOrders.length,
        topCustomers,
        pipelineByStage: pipelineStages.map((s) => ({ stage: s.name, deals: s.count, value: money(s.value) })),
        // Full customer list — real records for any customer question.
        customersList: crmCustomers.map((c) => ({
          company: c.company, status: c.status, ltv: money(c.lifetimeValue),
          openDeals: c.openDeals, owner: (c as Record<string, any>).owner ?? undefined,
        })),
      },
      wms: {
        warehouses: warehouses.map((w) => w.name),
        warehouseCount: warehouses.length,
        totalSkus: rows.length,
        totalOnHandUnits: totalOnHand,
        lowStock: lowStock.length,
        outOfStock: outOfStock.length,
        // Full aggregate stock (every SKU across ALL warehouses) — use for totals.
        inventory: rows.map(invItem),
        // Per-warehouse stock — use ONLY the named warehouse for "gudang X" reports.
        stockByWarehouse,
      },
      finance: {
        overdueInvoices: overdue.length,
        overdueBalance: money(overdueBalance),
        openInvoices: openInvoices.length,
        unpaidBills: unpaidBills.length,
        billsDue: money(billsDue),
        cashOnHand: money(cashTotal),
        // Full collections detail — who hasn't paid, the amount, how overdue, WHY,
        // last contact + outcome, promise-to-pay, and payment history. This is what
        // lets the co-worker explain each overdue customer, not just list them.
        overdueExamples: receivablesCollections.map((r) => ({
          number: r.invoiceNumber, customer: r.customer, balance: money(r.amount),
          dueDate: r.dueDate, daysOverdue: r.daysOverdue, risk: r.riskLevel,
          reason: r.reason,
          lastContact: `${r.lastContact.date} (${r.lastContact.channel}): ${r.lastContact.outcome}`,
          promiseToPay: r.promiseToPay ?? 'None on file',
          history: r.history, owner: r.owner,
        })),
        topOverdueCustomer: (() => {
          const byCust: Record<string, number> = {}
          for (const r of receivablesCollections) byCust[r.customer] = (byCust[r.customer] ?? 0) + r.amount
          const top = Object.entries(byCust).sort((a, b) => b[1] - a[1])[0]
          return top ? `${top[0]} (${money(top[1])})` : undefined
        })(),
        // Full unpaid-bills + open-invoice lists (real records, not just counts).
        unpaidBillsList: unpaidBills.map((b) => ({ number: `BILL-${b.number}`, vendor: b.beneficiary.name, balance: money(b.balanceDue), status: b.status })),
        openInvoicesList: openInvoices.map((i) => ({ number: `INV-${i.number}`, customer: i.customer.name, balance: money(i.balance), dueDate: i.dueDate })),
      },
      production: {
        totalWorkOrders: workOrders.length,
        openWorkOrders: openWO.length,
        // Every open work order (real records) — not just the first few.
        openWorkOrdersList: openWO.map((w) => ({ number: w.number, product: w.bomName, status: w.status, produced: w.producedQty, planned: w.plannedQty, dueDate: w.planEndDate })),
      },
    }
  }

  return { build }
}
