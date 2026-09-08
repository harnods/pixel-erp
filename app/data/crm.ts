/**
 * CRM (Qontak) mini-DB. Powers the CRM module — Home dashboard, Deals, Orders,
 * Tasks, Customers, Products — for PT Central Perk Indonesia's own sales pipeline.
 *
 * Central Perk is a wholesale + retail COFFEE business, so the CRM sells coffee
 * (green & roasted beans) to real coffee-industry accounts. To stay coherent with
 * the rest of the app, customers mirror the ERP customer master (customers.ts),
 * products mirror the coffee catalog (products.ts), and deal/order/task owners are
 * Central Perk's own sales & marketing staff (employees.ts): Dewi Lestari
 * (Marketing Lead), Fajar Nugroho (Sales Executive), Rizal Candra (COO).
 *
 * Snapshot-persisted under `erp-db:crm-*-v1` (whole array wins over the seed on
 * load), same pattern as employees.ts. Every CRM page reads from here so the Home
 * KPIs and the list pages never disagree.
 */
import { reactive, computed, ref } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { employees } from './employees'

// Central Perk sales & marketing owners (subset of employees.ts).
export const CRM_OWNERS = ['Dewi Lestari', 'Fajar Nugroho', 'Rizal Candra'] as const

// ── Deals pipeline (summary) ─────────────────────────────────────────────────
// The Deals kanban itself lives in CrmDealsPage.vue; Home only needs the roll-up.
export interface PipelineStage { name: string; count: number; value: number }
export const pipelineStages: PipelineStage[] = [
  { name: 'New',                count: 8, value: 186_000_000 },
  { name: 'Qualified',          count: 5, value: 142_000_000 },
  { name: 'Proposal sent',      count: 4, value: 98_000_000 },
  { name: 'Negotiation',        count: 3, value: 76_000_000 },
  { name: 'Won',                count: 6, value: 214_000_000 },
  { name: 'Lost',               count: 2, value: 31_000_000 },
]

// ── Customers (mirror the ERP coffee-industry accounts) ───────────────────────
export type CustomerStatus = 'active' | 'prospect' | 'churned'
export interface CrmCustomer {
  id: string
  company: string
  contact: string
  email: string
  phone: string
  segment: string             // Roastery | Café chain | Hotel | Distributor | Retail | Office
  segments: string[]          // editable tags (segment + VIP, At risk, …) — Segments column
  city: string
  owner: string
  openDeals: number
  lifetimeValue: number       // total billed to date (used as the "Billed" column)
  inFlight: number            // contract value of open deals still in play (the pipeline)
  outstanding: number         // invoiced but not yet paid
  status: CustomerStatus
  lastActivity: string        // ISO date
}

// Lifecycle stages (mirrors Venom's Customers). Derived from status + openDeals so
// existing consumers of `status` keep working.
export type LifecycleStage = 'Lead' | 'Opportunity' | 'Customer' | 'Former customer'
export const LIFECYCLE_STAGES: LifecycleStage[] = ['Lead', 'Opportunity', 'Customer', 'Former customer']
export function lifecycleOf(c: CrmCustomer): LifecycleStage {
  if (c.status === 'churned') return 'Former customer'
  if (c.status === 'active') return 'Customer'
  return c.openDeals > 0 ? 'Opportunity' : 'Lead'
}

const CUSTOMERS_SEED: CrmCustomer[] = [
  { id: 'C015', company: 'Distributor Sentra Boga',  contact: 'Hendra Wijaya',   email: 'po@sentraboga.co.id',           phone: '021-5550015', segment: 'Distributor', segments: ['Distributor', 'VIP', 'Key account'], city: 'Bekasi',    owner: 'Fajar Nugroho', openDeals: 3, lifetimeValue: 230_000_000, inFlight: 85_000_000, outstanding: 32_000_000, status: 'active',   lastActivity: '2026-02-27' },
  { id: 'C006', company: 'Kopi Kenangan Pusat',      contact: 'Ratna Sari',      email: 'buyer@kopikenangan.com',        phone: '021-5550006', segment: 'Café chain',  segments: ['Café chain', 'VIP'],                city: 'Jakarta',   owner: 'Dewi Lestari',  openDeals: 2, lifetimeValue: 120_000_000, inFlight: 48_000_000, outstanding: 18_000_000, status: 'active',   lastActivity: '2026-02-26' },
  { id: 'C013', company: 'Excelso Grand Indonesia',  contact: 'Bambang Sutrisno',email: 'purchasing@excelso.com',        phone: '021-5550013', segment: 'Café chain',  segments: ['Café chain', 'Key account'],        city: 'Jakarta',   owner: 'Fajar Nugroho', openDeals: 2, lifetimeValue: 98_000_000,  inFlight: 40_000_000, outstanding: 12_000_000, status: 'active',   lastActivity: '2026-02-25' },
  { id: 'C003', company: 'Hotel Mulia Senayan',      contact: 'Sinta Dewanti',   email: 'fnb@hotelmulia.com',            phone: '021-5550003', segment: 'Hotel',       segments: ['Hotel'],                            city: 'Jakarta',   owner: 'Dewi Lestari',  openDeals: 1, lifetimeValue: 78_000_000,  inFlight: 22_000_000, outstanding: 0,          status: 'active',   lastActivity: '2026-02-24' },
  { id: 'C002', company: 'Tanamera Coffee Roastery', contact: 'Agus Priyanto',   email: 'order@tanameracoffee.com',      phone: '021-5550002', segment: 'Roastery',    segments: ['Roastery'],                         city: 'Jakarta',   owner: 'Fajar Nugroho', openDeals: 1, lifetimeValue: 62_500_000,  inFlight: 18_000_000, outstanding: 9_000_000,  status: 'active',   lastActivity: '2026-02-23' },
  { id: 'C009', company: 'Maxx Coffee Lippo Mall',   contact: 'Yuliana Tan',     email: 'purchasing@maxxcoffee.com',     phone: '021-5550009', segment: 'Café chain',  segments: ['Café chain'],                       city: 'Tangerang', owner: 'Fajar Nugroho', openDeals: 1, lifetimeValue: 55_000_000,  inFlight: 15_000_000, outstanding: 0,          status: 'active',   lastActivity: '2026-02-22' },
  { id: 'C001', company: 'Anomali Coffee',           contact: 'Rudi Hartono',    email: 'purchasing@anomalicoffee.com',  phone: '021-5550001', segment: 'Roastery',    segments: ['Roastery'],                         city: 'Jakarta',   owner: 'Dewi Lestari',  openDeals: 1, lifetimeValue: 45_000_000,  inFlight: 12_000_000, outstanding: 6_000_000,  status: 'active',   lastActivity: '2026-02-21' },
  { id: 'C017', company: 'Santika Premiere Hotel',   contact: 'Wawan Setiawan',  email: 'fnb@santika.com',               phone: '024-5550017', segment: 'Hotel',       segments: ['Hotel', 'New business'],            city: 'Semarang',  owner: 'Fajar Nugroho', openDeals: 1, lifetimeValue: 44_000_000,  inFlight: 28_000_000, outstanding: 0,          status: 'prospect', lastActivity: '2026-02-18' },
  { id: 'C014', company: 'GoWork Office Tower',      contact: 'Nadia Pramesti',  email: 'pantry@gowork.co',              phone: '021-5550014', segment: 'Office',      segments: ['Office', 'New business'],           city: 'Jakarta',   owner: 'Dewi Lestari',  openDeals: 0, lifetimeValue: 6_400_000,   inFlight: 0,          outstanding: 0,          status: 'prospect', lastActivity: '2026-02-12' },
  { id: 'C012', company: 'Coffee Cult Bali',         contact: 'Made Sudarsana',  email: 'buyer@coffeecult.id',           phone: '0361-555012', segment: 'Café chain',  segments: ['Café chain', 'At risk'],            city: 'Bali',      owner: 'Fajar Nugroho', openDeals: 0, lifetimeValue: 14_800_000,  inFlight: 0,          outstanding: 0,          status: 'churned',  lastActivity: '2025-12-09' },
]

// ── Products (Central Perk's coffee catalog — mirrors products.ts / catalog) ───
export interface CrmProduct {
  id: string
  name: string
  category: string            // Green Beans | Roasted Beans
  unit: string                // Sack | Bag
  price: number
  openDeals: number
  active: boolean
}
const PRODUCTS_SEED: CrmProduct[] = [
  { id: 'p01', name: 'Green Beans Arabica Gayo Grade 1',     category: 'Green Beans',   unit: 'Sack', price: 3_200_000, openDeals: 5, active: true },
  { id: 'p03', name: 'Green Beans Arabica Toraja Sapan',     category: 'Green Beans',   unit: 'Sack', price: 3_600_000, openDeals: 3, active: true },
  { id: 'p02', name: 'Green Beans Robusta Lampung',          category: 'Green Beans',   unit: 'Sack', price: 2_400_000, openDeals: 4, active: true },
  { id: 'p09', name: 'Roasted Beans House Blend Medium',     category: 'Roasted Beans', unit: 'Bag',  price: 280_000,   openDeals: 6, active: true },
  { id: 'p10', name: 'Roasted Beans Espresso Blend Dark',    category: 'Roasted Beans', unit: 'Bag',  price: 320_000,   openDeals: 5, active: true },
  { id: 'p11', name: 'Roasted Beans Single Origin Gayo',     category: 'Roasted Beans', unit: 'Bag',  price: 450_000,   openDeals: 3, active: true },
  { id: 'p27', name: 'Roasted Beans Signature Espresso 250g', category: 'Roasted Beans', unit: 'Bag', price: 150_000,   openDeals: 2, active: false },
]

// ── Orders (won deals → coffee sales orders) ──────────────────────────────────
export type OrderStatus = 'draft' | 'awaiting-payment' | 'paid' | 'fulfilled' | 'cancelled'
export interface CrmOrder {
  id: string
  customer: string
  product: string
  date: string                // ISO
  amount: number
  status: OrderStatus
  owner: string
}
const ORDERS_SEED: CrmOrder[] = [
  { id: 'SO-5001', customer: 'Distributor Sentra Boga',  product: 'Green Beans Arabica Gayo Grade 1',  date: '2026-02-26', amount: 64_000_000, status: 'paid',             owner: 'Fajar Nugroho' },
  { id: 'SO-5002', customer: 'Kopi Kenangan Pusat',      product: 'Roasted Beans Espresso Blend Dark', date: '2026-02-24', amount: 32_000_000, status: 'awaiting-payment', owner: 'Dewi Lestari' },
  { id: 'SO-5003', customer: 'Excelso Grand Indonesia',  product: 'Roasted Beans House Blend Medium',  date: '2026-02-22', amount: 28_000_000, status: 'fulfilled',        owner: 'Fajar Nugroho' },
  { id: 'SO-5004', customer: 'Hotel Mulia Senayan',      product: 'Roasted Beans Single Origin Gayo',  date: '2026-02-20', amount: 22_500_000, status: 'paid',             owner: 'Dewi Lestari' },
  { id: 'SO-5005', customer: 'Tanamera Coffee Roastery', product: 'Green Beans Arabica Toraja Sapan',  date: '2026-02-18', amount: 36_000_000, status: 'draft',            owner: 'Fajar Nugroho' },
  { id: 'SO-5006', customer: 'Maxx Coffee Lippo Mall',   product: 'Roasted Beans Espresso Blend Dark', date: '2026-02-14', amount: 19_200_000, status: 'paid',             owner: 'Fajar Nugroho' },
  { id: 'SO-5007', customer: 'Coffee Cult Bali',         product: 'Green Beans Robusta Lampung',       date: '2026-02-10', amount: 14_400_000, status: 'cancelled',        owner: 'Fajar Nugroho' },
  { id: 'SO-5008', customer: 'Anomali Coffee',           product: 'Roasted Beans Single Origin Gayo',  date: '2026-02-07', amount: 18_000_000, status: 'fulfilled',        owner: 'Dewi Lestari' },
  // Created this month by converting the Won deal DL-260909 → Sales Order.
  { id: 'SO-5009', customer: 'Distributor Sentra Boga',  product: 'Green Beans Arabica Gayo Grade 1',  date: '2026-09-02', amount: 64_000_000, status: 'draft',            owner: 'Fajar Nugroho' },
]

// ── Tasks (sales follow-ups, calls, tastings) ─────────────────────────────────
export type TaskType = 'Call' | 'Email' | 'Meeting' | 'Follow-up'
export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskStatus = 'open' | 'done'
// Task stage — the kanban columns + the "Task stage" table column. 'Completed'
// is the terminal stage (status === 'done'); everything else is open.
export type TaskStage = 'Not started' | 'Waiting' | 'In progress' | 'Completed'
export const taskStages: TaskStage[] = ['Not started', 'Waiting', 'In progress', 'Completed']
export interface CrmTask {
  id: string
  title: string
  type: TaskType
  relatedTo: string           // customer / deal
  dueDate: string             // ISO
  priority: TaskPriority
  owner: string
  stage: TaskStage
  status: TaskStatus          // derived: 'done' when stage === 'Completed'
}
const TASKS_SEED: CrmTask[] = [
  { id: 'TSK-9001', title: 'Send wholesale price list & MOQ',   type: 'Email',     relatedTo: 'Distributor Sentra Boga',  dueDate: '2026-02-28', priority: 'high',   owner: 'Fajar Nugroho', stage: 'Waiting',     status: 'open' },
  { id: 'TSK-9002', title: 'Confirm Q2 house-blend volume',     type: 'Call',      relatedTo: 'Kopi Kenangan Pusat',      dueDate: '2026-02-28', priority: 'high',   owner: 'Dewi Lestari',  stage: 'In progress', status: 'open' },
  { id: 'TSK-9003', title: 'Cupping session for single origin', type: 'Meeting',   relatedTo: 'Excelso Grand Indonesia',  dueDate: '2026-03-02', priority: 'medium', owner: 'Fajar Nugroho', stage: 'Not started', status: 'open' },
  { id: 'TSK-9004', title: 'Follow up on payment SO-5002',      type: 'Follow-up', relatedTo: 'Kopi Kenangan Pusat',      dueDate: '2026-03-03', priority: 'medium', owner: 'Dewi Lestari',  stage: 'Waiting',     status: 'open' },
  { id: 'TSK-9005', title: 'Sample delivery — espresso blend',  type: 'Follow-up', relatedTo: 'Hotel Mulia Senayan',      dueDate: '2026-03-04', priority: 'low',    owner: 'Dewi Lestari',  stage: 'Not started', status: 'open' },
  { id: 'TSK-9006', title: 'Quarterly business review',         type: 'Meeting',   relatedTo: 'Tanamera Coffee Roastery', dueDate: '2026-02-26', priority: 'high',   owner: 'Fajar Nugroho', stage: 'Completed',   status: 'done' },
  { id: 'TSK-9007', title: 'Re-engage churned account',         type: 'Call',      relatedTo: 'Coffee Cult Bali',         dueDate: '2026-02-25', priority: 'low',    owner: 'Fajar Nugroho', stage: 'Completed',   status: 'done' },
  { id: 'TSK-9008', title: 'Prepare proposal — Maxx Coffee',    type: 'Email',     relatedTo: 'Maxx Coffee Lippo Mall',   dueDate: '2026-03-05', priority: 'medium', owner: 'Fajar Nugroho', stage: 'In progress', status: 'open' },
  { id: 'TSK-9009', title: 'Schedule tasting — Santika Hotel',  type: 'Meeting',   relatedTo: 'Santika Premiere Hotel',   dueDate: '2026-03-06', priority: 'low',    owner: 'Dewi Lestari',  stage: 'Not started', status: 'open' },
  { id: 'TSK-9010', title: 'Renewal check-in — Anomali',        type: 'Call',      relatedTo: 'Anomali Coffee',           dueDate: '2026-03-09', priority: 'medium', owner: 'Dewi Lestari',  stage: 'Not started', status: 'open' },
]

// ── Reactive stores (snapshot-persisted) ──────────────────────────────────────
function load<T>(key: string, seed: T[]): T[] {
  return (loadSnapshot<T>(key) ?? seed.map((x) => ({ ...x })))
}
export const crmCustomers = reactive<CrmCustomer[]>(load('crm-customers-v1', CUSTOMERS_SEED))
// Back-fill `segments` for snapshots that predate the field.
for (const c of crmCustomers) { if (!Array.isArray(c.segments)) c.segments = c.segment ? [c.segment] : [] }
export const crmProducts  = reactive<CrmProduct[]>(load('crm-products-v1', PRODUCTS_SEED))
export const crmOrders    = reactive<CrmOrder[]>(load('crm-orders-v1', ORDERS_SEED))
export const crmTasks     = reactive<CrmTask[]>(load('crm-tasks-v1', TASKS_SEED))

export function persistCrmCustomers() { saveSnapshot('crm-customers-v1', crmCustomers) }
export function persistCrmProducts()  { saveSnapshot('crm-products-v1', crmProducts) }
export function persistCrmOrders()    { saveSnapshot('crm-orders-v1', crmOrders) }
export function persistCrmTasks()     { saveSnapshot('crm-tasks-v1', crmTasks) }

/** Move a task to a new stage (kanban drag/drop) and keep status coherent. */
export function setTaskStage(id: string, stage: TaskStage): void {
  const t = crmTasks.find((x) => x.id === id)
  if (!t) return
  t.stage = stage
  t.status = stage === 'Completed' ? 'done' : 'open'
  persistCrmTasks()
}

// ── Derived roll-ups (Home KPIs read these so numbers stay coherent) ──────────
export const openDealsCount = computed(() =>
  pipelineStages.filter((s) => !['Won', 'Lost'].includes(s.name)).reduce((n, s) => n + s.count, 0))
export const openDealsValue = computed(() =>
  pipelineStages.filter((s) => !['Won', 'Lost'].includes(s.name)).reduce((n, s) => n + s.value, 0))
export const wonThisMonthValue = computed(() =>
  (pipelineStages.find((s) => s.name === 'Won')?.value ?? 0))
export const openTasksCount = computed(() => crmTasks.filter((t) => t.status === 'open').length)
export const tasksDueTodayCount = computed(() => crmTasks.filter((t) => t.status === 'open' && t.dueDate === '2026-02-28').length)
export const activeCustomersCount = computed(() => crmCustomers.filter((c) => c.status === 'active').length)
export const ordersThisMonthValue = computed(() =>
  crmOrders.filter((o) => o.date >= '2026-02-01' && o.status !== 'cancelled').reduce((n, o) => n + o.amount, 0))

// ── Deals (the pipeline records behind the kanban + table) ────────────────────
// One source of truth for the Deals module: the kanban board, the table view, the
// metrics panel and the deal record page all read this. Customers mirror the ERP
// account master (crmCustomers), owners are Central Perk sales staff (CRM_OWNERS),
// and a Won deal converts into a real Sales Order (crmOrders) — that link is the
// CRM ↔ ERP bridge the module is built around.
// PRD stage identities (display labels). Open Lead → 1st Meeting → Proposal →
// Negotiation are the ONGOING stages; Won is terminal (closed-won), Lost is
// closed-lost and may be reopened to an ongoing stage. Labels use PRD casing.
export const DEAL_STAGES = ['Open Lead', '1st Meeting', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const
export type DealStage = typeof DEAL_STAGES[number]
/** Ongoing (non-closed) stages — used by metrics + the reopen picker. */
export const ONGOING_STAGES = ['Open Lead', '1st Meeting', 'Proposal', 'Negotiation'] as const
export type DealPriority = 'low' | 'medium' | 'high' | 'critical'
/** ERP Conversion Status (PRD). `none` = Not converted, `processing` = queued,
 *  `converted` = an ERP transaction exists (salesOrderId), `failed` = the attempt
 *  was blocked (conversionError explains why). */
export type DealConversion = 'none' | 'processing' | 'converted' | 'failed'
export const CONVERSION_STATUS_LABEL: Record<DealConversion, string> = {
  none: 'Not converted', processing: 'Processing', converted: 'Converted', failed: 'Failed',
}

/** ERP conversion target — one active target per company (PRD: Sales Quote OR
 *  Sales Order). Drives the convert action label + the past-30-days metric label. */
export type ConversionTarget = 'Sales Order' | 'Sales Quote'
export const dealConversionTarget = ref<ConversionTarget>(
  (loadSnapshot<ConversionTarget>('crm-deal-conv-target-v1')?.[0]) ?? 'Sales Order',
)
export function setDealConversionTarget(t: ConversionTarget) {
  dealConversionTarget.value = t
  saveSnapshot('crm-deal-conv-target-v1', [t])
}

/** Supported deal currencies (company base = IDR). */
export const DEAL_CURRENCIES = ['IDR', 'USD', 'SGD', 'EUR'] as const
export type DealCurrency = typeof DEAL_CURRENCIES[number]

export type LineDiscountType = 'none' | 'percentage' | 'fixed'
/** One Product List line — an SCM product snapshot + Deal-only commercial values.
 *  Editing these NEVER mutates the SCM product master (PRD Product List rules). */
export interface DealLineItem {
  productId: string
  productName: string         // display snapshot
  unit: string
  quantity: number
  originalPrice: number       // Deal-only snapshot (seeded from SCM, editable)
  discountType: LineDiscountType
  discount: number            // % (0–100) or fixed amount
}
/** Read-only calculated price after the line discount. */
export function lineDiscountedPrice(li: DealLineItem): number {
  if (li.discountType === 'percentage') return Math.max(0, li.originalPrice * (1 - li.discount / 100))
  if (li.discountType === 'fixed')      return Math.max(0, li.originalPrice - li.discount)
  return li.originalPrice
}
export function lineSubtotal(li: DealLineItem): number { return Math.round(li.quantity * lineDiscountedPrice(li)) }

export type AdjustmentType = 'percentage' | 'fixed'

export interface Deal {
  id: string                  // 'DL-260901'
  name: string
  customerId: string          // crmCustomers id
  company: string             // denormalised account name (matches crmCustomers.company)
  stage: DealStage
  owner: string               // CRM_OWNERS
  value: number               // Expected Deal Value (override or calculated), in Deal currency
  valueOverridden?: boolean   // true = `value` is a manual override, not the calc
  priority: DealPriority       // non-PRD extra; kept for pipeline colour
  referenceNumber?: string    // optional, searchable, duplicates allowed
  description?: string         // optional, ≤500 chars
  relatedPeople?: string[]     // 0–10 active Mekari users (informational only)
  // Contact Information — owned by the Deal (prefilled from Company PIC, never writes back)
  picName?: string
  phones?: string[]
  email?: string
  // Products & commercial adjustments
  products?: DealLineItem[]
  taxType?: AdjustmentType
  tax?: number
  orderDiscountType?: AdjustmentType
  orderDiscount?: number
  shippingFee?: number
  otherExpense?: number
  currency: DealCurrency
  exchangeRate: number        // 1 for base currency; positive for foreign
  notes?: string              // optional, ≤2000 chars
  expectedCloseDate: string   // Due Date (ISO)
  createdAt: string           // ISO
  createdBy?: string
  lastActivity: string        // ISO
  lastModifiedBy?: string
  conversion: DealConversion
  salesOrderId?: string       // crmOrders id + type prefix when converted
  convertedTarget?: ConversionTarget
  conversionError?: string    // reason when conversion === 'failed'
  lostReason?: string         // when stage === 'Lost'
  archived?: boolean          // hidden from active views + metrics; history preserved
}

// The current review month + "today" (fixed, like the rest of the CRM mock) so the
// metrics (closing this month / overdue / created this month) are deterministic.
const DEAL_TODAY = '2026-09-07'
const DEAL_MONTH = '2026-09'
/** ISO date `n` days before an ISO date (used by the trailing-30-days metric). */
function daysBefore(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y!, m! - 1, d!) - n * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

// Default commercial defaults for a base-currency (IDR) deal.
const B = { currency: 'IDR' as DealCurrency, exchangeRate: 1 }
// Product-line snapshot builders (SCM catalog) — Subtotal = qty × price, so each
// deal's seeded `value` equals the calculated value (no discount unless noted).
const P = {
  gayo:     (q: number): DealLineItem => ({ productId: 'p01', productName: 'Green Beans Arabica Gayo Grade 1', unit: 'Sack', quantity: q, originalPrice: 3_200_000, discountType: 'none', discount: 0 }),
  toraja:   (q: number): DealLineItem => ({ productId: 'p03', productName: 'Green Beans Arabica Toraja Sapan', unit: 'Sack', quantity: q, originalPrice: 3_600_000, discountType: 'none', discount: 0 }),
  robusta:  (q: number): DealLineItem => ({ productId: 'p02', productName: 'Green Beans Robusta Lampung', unit: 'Sack', quantity: q, originalPrice: 2_400_000, discountType: 'none', discount: 0 }),
  house:    (q: number): DealLineItem => ({ productId: 'p09', productName: 'Roasted Beans House Blend Medium', unit: 'Bag', quantity: q, originalPrice: 280_000, discountType: 'none', discount: 0 }),
  espresso: (q: number): DealLineItem => ({ productId: 'p10', productName: 'Roasted Beans Espresso Blend Dark', unit: 'Bag', quantity: q, originalPrice: 320_000, discountType: 'none', discount: 0 }),
  single:   (q: number): DealLineItem => ({ productId: 'p11', productName: 'Roasted Beans Single Origin Gayo', unit: 'Bag', quantity: q, originalPrice: 450_000, discountType: 'none', discount: 0 }),
}
// A real pipeline is a funnel — most deals sit in the early stages and thin out
// toward the close. Distribution: Open Lead 7 · 1st Meeting 5 · Proposal 4 ·
// Negotiation 3 · Won 3 · Lost 2. Values, customers, owners and dates are coherent
// with the coffee catalog + account master. createdAt is spread so aging varies.
const DEALS_SEED: Deal[] = [
  // ── Open Lead (7) ──
  { id: 'DL-260901', name: 'Cold brew concentrate trial',  customerId: 'C001', company: 'Anomali Coffee',           stage: 'Open Lead', owner: 'Dewi Lestari',  value: 9_000_000,  priority: 'medium', ...B, products: [P.single(20)], expectedCloseDate: '2026-09-30', createdAt: '2026-09-05', createdBy: 'Dewi Lestari',  lastActivity: '2026-09-06', conversion: 'none' },
  { id: 'DL-260902', name: 'Office pantry monthly supply', customerId: 'C014', company: 'GoWork Office Tower',       stage: 'Open Lead', owner: 'Dewi Lestari',  value: 8_400_000,  priority: 'low',    ...B, products: [P.house(30)],  expectedCloseDate: '2026-10-06', createdAt: '2026-09-03', createdBy: 'Dewi Lestari',  lastActivity: '2026-09-04', conversion: 'none' },
  { id: 'DL-260903', name: 'New outlet opening order',     customerId: 'C009', company: 'Maxx Coffee Lippo Mall',    stage: 'Open Lead', owner: 'Fajar Nugroho', value: 12_800_000, priority: 'medium', ...B, products: [P.espresso(40)], expectedCloseDate: '2026-09-24', createdAt: '2026-08-30', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-02', conversion: 'none' },
  { id: 'DL-260904', name: 'Bali cafe restock',            customerId: 'C012', company: 'Coffee Cult Bali',         stage: 'Open Lead', owner: 'Fajar Nugroho', value: 19_200_000, priority: 'medium', ...B, products: [P.robusta(8)],  expectedCloseDate: '2026-09-20', createdAt: '2026-08-25', createdBy: 'Fajar Nugroho', lastActivity: '2026-08-29', conversion: 'none' },
  { id: 'DL-260905', name: 'Banquet coffee supply',        customerId: 'C017', company: 'Santika Premiere Hotel',    stage: 'Open Lead', owner: 'Rizal Candra',  value: 14_000_000, priority: 'medium', ...B, products: [P.house(50)],  expectedCloseDate: '2026-09-30', createdAt: '2026-08-10', createdBy: 'Rizal Candra',  lastActivity: '2026-08-24', conversion: 'none' },
  { id: 'DL-260906', name: 'Green bean sourcing Q4',       customerId: 'C002', company: 'Tanamera Coffee Roastery',  stage: 'Open Lead', owner: 'Fajar Nugroho', value: 48_000_000, priority: 'high',   ...B, referenceNumber: 'RFQ-8801', description: 'Wholesale green bean volume for the Q4 roasting season.', picName: 'Agus Priyanto', phones: ['+62 812 5550 002'], email: 'order@tanameracoffee.com', relatedPeople: ['Dewi Lestari'], products: [P.gayo(15)], expectedCloseDate: '2026-09-05', createdAt: '2026-07-20', createdBy: 'Fajar Nugroho', lastActivity: '2026-08-30', conversion: 'none' },
  { id: 'DL-260907', name: 'Espresso beans pilot batch',   customerId: 'C006', company: 'Kopi Kenangan Pusat',       stage: 'Open Lead', owner: 'Dewi Lestari',  value: 9_600_000,  priority: 'medium', ...B, products: [P.espresso(30)], expectedCloseDate: '2026-09-29', createdAt: '2026-09-06', createdBy: 'Dewi Lestari',  lastActivity: '2026-09-06', conversion: 'none' },
  // ── 1st Meeting (5) ──
  { id: 'DL-260908', name: 'House blend cafe rollout',     customerId: 'C013', company: 'Excelso Grand Indonesia',   stage: '1st Meeting', owner: 'Fajar Nugroho', value: 28_000_000, priority: 'high',   ...B, products: [P.house(100)], expectedCloseDate: '2026-09-26', createdAt: '2026-08-20', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-05', conversion: 'none' },
  { id: 'DL-260909', name: 'Single origin for lounge',     customerId: 'C003', company: 'Hotel Mulia Senayan',       stage: '1st Meeting', owner: 'Dewi Lestari',  value: 18_000_000, priority: 'medium', ...B, products: [P.single(40)], expectedCloseDate: '2026-09-18', createdAt: '2026-08-18', createdBy: 'Dewi Lestari',  lastActivity: '2026-09-04', conversion: 'none' },
  { id: 'DL-260910', name: 'Wholesale robusta volume',     customerId: 'C015', company: 'Distributor Sentra Boga',   stage: '1st Meeting', owner: 'Fajar Nugroho', value: 48_000_000, priority: 'high',   ...B, products: [P.robusta(20)], expectedCloseDate: '2026-09-25', createdAt: '2026-08-15', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-01', conversion: 'none' },
  { id: 'DL-260911', name: 'Seasonal blend launch',        customerId: 'C009', company: 'Maxx Coffee Lippo Mall',    stage: '1st Meeting', owner: 'Fajar Nugroho', value: 8_000_000,  priority: 'low',    ...B, products: [P.espresso(25)], expectedCloseDate: '2026-09-22', createdAt: '2026-08-28', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-03', conversion: 'none' },
  { id: 'DL-260912', name: 'Toraja single origin trial',   customerId: 'C001', company: 'Anomali Coffee',            stage: '1st Meeting', owner: 'Dewi Lestari',  value: 21_600_000, priority: 'medium', ...B, products: [P.toraja(6)],  expectedCloseDate: '2026-09-20', createdAt: '2026-08-22', createdBy: 'Dewi Lestari',  lastActivity: '2026-09-02', conversion: 'none' },
  // ── Proposal (4) ──
  { id: 'DL-260913', name: 'Annual espresso contract',     customerId: 'C006', company: 'Kopi Kenangan Pusat',       stage: 'Proposal', owner: 'Dewi Lestari',  value: 19_200_000, priority: 'high',   ...B, referenceNumber: 'RFQ-8815', description: 'Twelve-month espresso bean supply across all outlets.', picName: 'Ratna Sari', phones: ['+62 811 5550 006'], email: 'buyer@kopikenangan.com', products: [P.espresso(60)], expectedCloseDate: '2026-09-15', createdAt: '2026-08-05', createdBy: 'Dewi Lestari', lastActivity: '2026-09-06', conversion: 'none' },
  { id: 'DL-260914', name: 'Premium single origin supply', customerId: 'C003', company: 'Hotel Mulia Senayan',       stage: 'Proposal', owner: 'Dewi Lestari',  value: 22_500_000, priority: 'medium', ...B, products: [P.single(50)], expectedCloseDate: '2026-09-18', createdAt: '2026-08-12', createdBy: 'Dewi Lestari',  lastActivity: '2026-09-05', conversion: 'none' },
  { id: 'DL-260915', name: 'Multi-outlet bean supply',     customerId: 'C013', company: 'Excelso Grand Indonesia',   stage: 'Proposal', owner: 'Fajar Nugroho', value: 38_400_000, priority: 'high',   ...B, products: [P.gayo(12)],  expectedCloseDate: '2026-09-22', createdAt: '2026-08-08', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-04', conversion: 'none' },
  { id: 'DL-260916', name: 'Hotel F&B annual contract',    customerId: 'C017', company: 'Santika Premiere Hotel',    stage: 'Proposal', owner: 'Rizal Candra',  value: 25_200_000, priority: 'high',   ...B, products: [P.house(90)],  expectedCloseDate: '2026-09-30', createdAt: '2026-08-14', createdBy: 'Rizal Candra',  lastActivity: '2026-09-03', conversion: 'none' },
  // ── Negotiation (3) ──
  { id: 'DL-260917', name: 'Bulk green beans Q3',          customerId: 'C015', company: 'Distributor Sentra Boga',   stage: 'Negotiation', owner: 'Fajar Nugroho', value: 64_000_000, priority: 'high', ...B, referenceNumber: 'RFQ-8790', picName: 'Hendra Wijaya', phones: ['+62 813 5550 015'], email: 'po@sentraboga.co.id', products: [P.gayo(20)], expectedCloseDate: '2026-09-12', createdAt: '2026-07-25', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-06', conversion: 'none' },
  { id: 'DL-260918', name: 'Espresso beans renewal',       customerId: 'C006', company: 'Kopi Kenangan Pusat',       stage: 'Negotiation', owner: 'Dewi Lestari',  value: 16_000_000, priority: 'high', ...B, products: [P.espresso(50)], expectedCloseDate: '2026-09-04', createdAt: '2026-08-01', createdBy: 'Dewi Lestari',  lastActivity: '2026-09-06', conversion: 'none' },
  { id: 'DL-260919', name: 'Roastery supply agreement',    customerId: 'C002', company: 'Tanamera Coffee Roastery',  stage: 'Negotiation', owner: 'Fajar Nugroho', value: 36_000_000, priority: 'high', ...B, products: [P.toraja(10)], expectedCloseDate: '2026-09-14', createdAt: '2026-08-06', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-05', conversion: 'none' },
  // ── Won (3) ──
  { id: 'DL-260920', name: 'Green beans Q3 confirmed',     customerId: 'C015', company: 'Distributor Sentra Boga',   stage: 'Won', owner: 'Fajar Nugroho', value: 64_000_000, priority: 'high', ...B, products: [P.gayo(20)], expectedCloseDate: '2026-09-02', createdAt: '2026-08-05', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-02', conversion: 'converted', convertedTarget: 'Sales Order', salesOrderId: 'SO-5009' },
  { id: 'DL-260921', name: 'Espresso volume order',        customerId: 'C013', company: 'Excelso Grand Indonesia',   stage: 'Won', owner: 'Fajar Nugroho', value: 19_200_000, priority: 'high', ...B, products: [P.espresso(60)], expectedCloseDate: '2026-09-05', createdAt: '2026-08-08', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-05', conversion: 'failed', conversionError: 'A product on this deal has no selling price set in the item master. Set a price, then convert again.' },
  { id: 'DL-260922', name: 'Outlet expansion supply',      customerId: 'C009', company: 'Maxx Coffee Lippo Mall',    stage: 'Won', owner: 'Fajar Nugroho', value: 11_200_000, priority: 'medium', ...B, products: [P.house(40)], expectedCloseDate: '2026-09-06', createdAt: '2026-08-18', createdBy: 'Fajar Nugroho', lastActivity: '2026-09-06', conversion: 'none' },
  // ── Lost (2) ──
  { id: 'DL-260923', name: 'Cold brew trial',              customerId: 'C012', company: 'Coffee Cult Bali',         stage: 'Lost', owner: 'Fajar Nugroho', value: 14_400_000, priority: 'medium', ...B, products: [P.robusta(6)], expectedCloseDate: '2026-08-20', createdAt: '2026-07-20', createdBy: 'Fajar Nugroho', lastActivity: '2026-08-20', conversion: 'none', lostReason: 'Chose a competitor' },
  { id: 'DL-260924', name: 'Equipment upgrade bundle',     customerId: 'C002', company: 'Tanamera Coffee Roastery',  stage: 'Lost', owner: 'Fajar Nugroho', value: 18_000_000, priority: 'low',    ...B, expectedCloseDate: '2026-08-15', createdAt: '2026-07-15', createdBy: 'Fajar Nugroho', lastActivity: '2026-08-15', conversion: 'none', lostReason: 'Budget on hold' },
]

export const deals = reactive<Deal[]>(load('crm-deals-v3', DEALS_SEED))
// Migrate snapshots that predate the model expansion: old stage casing, the
// renamed 'validation-failed' status, and the currency/rate defaults.
const STAGE_MIGRATE: Record<string, DealStage> = { 'Open lead': 'Open Lead', '1st meeting': '1st Meeting' }
for (const d of deals) {
  const migrated = STAGE_MIGRATE[d.stage as string]
  if (migrated) d.stage = migrated
  if ((d.conversion as string) === 'validation-failed') d.conversion = 'failed'
  if (!d.currency) d.currency = 'IDR'
  if (typeof d.exchangeRate !== 'number') d.exchangeRate = 1
}
export function persistCrmDeals() { saveSnapshot('crm-deals-v3', deals) }

/** Related People options — active Mekari users (employees), names only. Max 10
 *  chosen per deal (informational; grants no access). */
export const crmRelatedPeopleOptions = computed(() =>
  employees.filter((e) => e.status === 'active').map((e) => e.fullName),
)

/** Ongoing = not Won/Lost. Active views + fixed metrics also exclude archived. */
export function isDealOpen(d: Deal): boolean { return d.stage !== 'Won' && d.stage !== 'Lost' }
export function isDealArchived(d: Deal): boolean { return d.archived === true }
export function getDeal(id: string): Deal | undefined { return deals.find((d) => d.id === id) }
export function dealsInStage(stage: DealStage): Deal[] { return deals.filter((d) => d.stage === stage && !d.archived) }

// ── Commercial calculation (PRD provisional formula, TBC w/ ERP txn team) ──
/** sum(line subtotals) + tax + shipping + other − order discount. */
export function dealCalculatedValue(d: Pick<Deal, 'products' | 'taxType' | 'tax' | 'orderDiscountType' | 'orderDiscount' | 'shippingFee' | 'otherExpense'>): number {
  const linesTotal = (d.products ?? []).reduce((n, li) => n + lineSubtotal(li), 0)
  const adj = (type: AdjustmentType | undefined, amount: number | undefined, base: number): number => {
    if (!amount) return 0
    return type === 'percentage' ? Math.round(base * (amount / 100)) : amount
  }
  const tax = adj(d.taxType, d.tax, linesTotal)
  const orderDiscount = adj(d.orderDiscountType, d.orderDiscount, linesTotal)
  return Math.max(0, linesTotal + tax + (d.shippingFee ?? 0) + (d.otherExpense ?? 0) - orderDiscount)
}
/** Expected Deal Value = manual override when set, else the calculated value. */
export function dealExpectedValue(d: Deal): number {
  return d.valueOverridden ? d.value : ((d.products?.length) ? dealCalculatedValue(d) : d.value)
}

/** Fixed Deals metrics (PRD): 5 permission-aware cards. Ongoing = non-archived,
 *  non-closed. Values use each deal's captured exchange rate → base currency.
 *  Legacy props (active/openValue/overdueCount/conversionAttentionCount) are kept
 *  for CrmReportsPage. */
export const dealMetrics = computed(() => {
  const visible = deals.filter((d) => !d.archived)
  const open = visible.filter(isDealOpen)
  const inBase = (d: Deal) => dealExpectedValue(d) * (d.exchangeRate || 1)
  const closingThisMonth = open.filter((d) => d.expectedCloseDate.startsWith(DEAL_MONTH))
  const overdue = open.filter((d) => d.expectedCloseDate < DEAL_TODAY)
  const converted = visible.filter((d) => d.conversion === 'converted' && d.salesOrderId)
  // Sales Orders/Quotes created — trailing 30 days (PRD). Mock: linked order date.
  const past30Start = daysBefore(DEAL_TODAY, 30)
  const txnPast30 = converted.filter((d) => {
    const so = crmOrders.find((o) => o.id === d.salesOrderId)
    return so ? so.date >= past30Start && so.date <= DEAL_TODAY : false
  })
  const attention = visible.filter((d) => d.conversion === 'failed')
  return {
    // PRD 5 fixed
    totalOngoing: open.length,
    totalOngoingValue: open.reduce((n, d) => n + inBase(d), 0),
    closingThisMonthCount: closingThisMonth.length,
    closingThisMonthValue: closingThisMonth.reduce((n, d) => n + inBase(d), 0),
    overdueCount: overdue.length,
    txnCreatedPast30Count: txnPast30.length,
    // legacy aliases (reports)
    total: deals.length,
    active: open.length,
    totalValue: visible.reduce((n, d) => n + inBase(d), 0),
    openValue: open.reduce((n, d) => n + inBase(d), 0),
    salesOrdersCreatedCount: txnPast30.length,
    conversionAttentionCount: attention.length,
  }
})

/** Result shape for stage moves / bulk ops — carries a safe reason on failure. */
export interface DealOpResult { ok: boolean; error?: string }

/**
 * Move a deal to a new stage, enforcing the PRD terminal/reopen rules:
 *  • Won is terminal — no move off Won (any surface).
 *  • → Lost requires a lostReason.
 *  • Lost may reopen only to an ongoing stage.
 * Callers own the confirmation UX (Won-irreversible warning, reopen confirm).
 */
export function moveDealStage(id: string, stage: DealStage, opts: { lostReason?: string } = {}): DealOpResult {
  const d = getDeal(id)
  if (!d) return { ok: false, error: 'Deal not found.' }
  if (d.archived) return { ok: false, error: 'Restore this deal before changing its stage.' }
  if (d.stage === stage) return { ok: true }
  if (d.stage === 'Won') return { ok: false, error: 'Won is terminal — this deal cannot move to another stage.' }
  if (d.stage === 'Lost' && !(ONGOING_STAGES as readonly string[]).includes(stage)) {
    return { ok: false, error: 'A Lost deal can only be reopened to an ongoing stage.' }
  }
  if (stage === 'Lost' && !opts.lostReason?.trim()) return { ok: false, error: 'A Lost reason is required.' }
  const from = d.stage
  d.stage = stage
  d.lastActivity = DEAL_TODAY
  if (stage === 'Lost') d.lostReason = opts.lostReason!.trim()
  if (from === 'Lost' && stage !== 'Lost') d.lostReason = undefined
  persistCrmDeals()
  return { ok: true }
}
/** Legacy kanban entry point — now routes through moveDealStage. Returns the result
 *  so the board can surface the reason + revert a rejected drop. */
export function setDealStage(id: string, stage: DealStage, opts: { lostReason?: string } = {}): DealOpResult {
  return moveDealStage(id, stage, opts)
}

// ── Archive / restore (PRD: no permanent delete in V1) ──
export function archiveDeal(id: string): DealOpResult {
  const d = getDeal(id); if (!d) return { ok: false, error: 'Deal not found.' }
  d.archived = true; d.lastActivity = DEAL_TODAY; persistCrmDeals(); return { ok: true }
}
export function restoreDeal(id: string): DealOpResult {
  const d = getDeal(id); if (!d) return { ok: false, error: 'Deal not found.' }
  d.archived = false; d.lastActivity = DEAL_TODAY; persistCrmDeals(); return { ok: true }
}
/** Permanently remove a deal from the store. (PRD V1 keeps only Archive/Restore;
 *  Delete is a prototype affordance kept per product request.) */
export function deleteDeal(id: string): DealOpResult {
  const i = deals.findIndex((d) => d.id === id)
  if (i === -1) return { ok: false, error: 'Deal not found.' }
  deals.splice(i, 1); persistCrmDeals(); return { ok: true }
}

// ── Bulk actions (per-record result; partial success retained) ──
export interface BulkOutcome { id: string; ok: boolean; error?: string }
export function bulkChangeOwner(ids: string[], owner: string): BulkOutcome[] {
  const out = ids.map((id) => {
    const d = getDeal(id)
    if (!d) return { id, ok: false, error: 'Deal not found.' }
    if (d.archived) return { id, ok: false, error: 'Archived deal.' }
    d.owner = owner; d.lastActivity = DEAL_TODAY; return { id, ok: true }
  })
  persistCrmDeals(); return out
}
export function bulkChangeStage(ids: string[], stage: DealStage, opts: { lostReason?: string } = {}): BulkOutcome[] {
  const out = ids.map((id) => ({ id, ...moveDealStage(id, stage, opts) }))
  return out
}

/** Next deal id — DL-YYMMDD## style, monotonic over the current set. */
function nextDealId(): string {
  const max = deals.reduce((m, d) => Math.max(m, Number(d.id.replace(/\D/g, '')) || 0), 260900)
  return `DL-${max + 1}`
}
export interface DealInput {
  name: string; customerId: string; company: string; stage: DealStage; owner: string
  value: number; valueOverridden?: boolean; priority?: DealPriority
  referenceNumber?: string; description?: string; relatedPeople?: string[]
  picName?: string; phones?: string[]; email?: string
  products?: DealLineItem[]
  taxType?: AdjustmentType; tax?: number; orderDiscountType?: AdjustmentType; orderDiscount?: number
  shippingFee?: number; otherExpense?: number
  currency: DealCurrency; exchangeRate: number; notes?: string; expectedCloseDate: string
}
export function createDeal(input: DealInput, author = 'You'): Deal {
  const d: Deal = {
    id: nextDealId(), ...input,
    createdAt: DEAL_TODAY, createdBy: author, lastActivity: DEAL_TODAY, lastModifiedBy: author,
    conversion: 'none', priority: input.priority ?? 'medium',
  }
  deals.unshift(d); persistCrmDeals(); return d
}
export function updateDeal(id: string, patch: Partial<DealInput>, author = 'You'): Deal | undefined {
  const d = getDeal(id); if (!d) return undefined
  Object.assign(d, patch, { lastActivity: DEAL_TODAY, lastModifiedBy: author })
  persistCrmDeals(); return d
}

/**
 * Manual ERP conversion (PRD). Creates exactly one ERP transaction of the active
 * target (Sales Quote/Sales Order); available at any non-archived stage. A deal
 * already converted returns its existing link; a failed deal stays failed until
 * fixed. One Deal → at most one ERP transaction.
 */
export function convertDeal(id: string): { ok: boolean; salesOrderId?: string; target?: ConversionTarget; error?: string } {
  const d = getDeal(id)
  if (!d) return { ok: false, error: 'Deal not found.' }
  if (d.archived) return { ok: false, error: 'Archived deals cannot be converted. Restore the deal first.' }
  if (d.conversion === 'converted' && d.salesOrderId) return { ok: true, salesOrderId: d.salesOrderId, target: d.convertedTarget }
  if (d.conversion === 'failed') return { ok: false, error: d.conversionError ?? 'Conversion validation failed.' }
  if (!d.products?.length) return { ok: false, error: 'Add at least one product line before converting.' }
  const target = dealConversionTarget.value
  const cust = crmCustomers.find((c) => c.id === d.customerId)
  const prefix = target === 'Sales Quote' ? 'SQ' : 'SO'
  const txnId = `${prefix}-${5000 + crmOrders.length + 1}`
  crmOrders.push({
    id: txnId, customer: d.company, product: d.products[0]!.productName,
    date: DEAL_TODAY, amount: dealExpectedValue(d), status: 'draft', owner: cust?.owner ?? d.owner,
  })
  persistCrmOrders()
  d.conversion = 'converted'; d.salesOrderId = txnId; d.convertedTarget = target; d.lastActivity = DEAL_TODAY
  persistCrmDeals()
  return { ok: true, salesOrderId: txnId, target }
}
/** Back-compat alias for the old SO-only convert entry point. */
export const convertDealToSalesOrder = convertDeal

// ── Teams (Settings → Teams) ──────────────────────────────────────────────────
// A CRM team groups people (real employees) and grants access to CRM modules.
// Members reference the employee master (employees.id === 'EMP-000x'); the count,
// module chips, and last-updated line on the Teams table all read this store.
// Only Deals is a permission-gated CRM module — Reports & Contacts are always
// available, so they are NOT team-accessible-module options.
export const CRM_TEAM_MODULES = [
  { key: 'deals', label: 'Deals' },
] as const
export type CrmTeamModule = typeof CRM_TEAM_MODULES[number]['key']

export interface CrmTeam {
  id: string
  name: string
  description: string
  memberIds: string[]          // employees.id (EMP-000x)
  modules: CrmTeamModule[]
  updatedAt: string            // ISO datetime — drives the Last updated cell
  updatedBy: string            // author name
}

const TEAMS_SEED: CrmTeam[] = [
  { id: 'TEAM-01', name: 'Sales',     description: 'Owns the deal pipeline and closes accounts', memberIds: ['EMP-0001', 'EMP-0010', 'EMP-0005'], modules: ['deals'], updatedAt: '2026-09-02T14:30:00', updatedBy: 'Rizal Candra' },
  { id: 'TEAM-02', name: 'Marketing', description: 'Generates and nurtures new leads',           memberIds: ['EMP-0005'],                        modules: [],        updatedAt: '2026-08-28T09:15:00', updatedBy: 'Dewi Lestari' },
]

export const crmTeams = reactive<CrmTeam[]>(load('crm-teams-v1', TEAMS_SEED))
export function persistCrmTeams() { saveSnapshot('crm-teams-v1', crmTeams) }

/** Member picker options — active employees as { id, name, subtitle=jobPosition }. */
export const crmTeamMemberOptions = computed(() =>
  employees
    .filter((e) => e.status === 'active')
    .map((e) => ({ id: e.id, name: e.fullName, subtitle: e.jobPosition || undefined })),
)
export function teamMemberNames(ids: string[]): string[] {
  return ids.map((id) => employees.find((e) => e.id === id)?.fullName ?? id)
}

/** Create or update a team (snapshot-persisted). Stamps updatedAt/updatedBy. */
export function upsertCrmTeam(
  input: { id?: string; name: string; description: string; memberIds: string[]; modules: CrmTeamModule[] },
  author: string,
  now: string,
): CrmTeam {
  if (input.id) {
    const t = crmTeams.find((x) => x.id === input.id)
    if (t) {
      Object.assign(t, { name: input.name, description: input.description, memberIds: [...input.memberIds], modules: [...input.modules], updatedAt: now, updatedBy: author })
      persistCrmTeams()
      return t
    }
  }
  const nextNum = crmTeams.reduce((m, t) => Math.max(m, Number(t.id.replace('TEAM-', '')) || 0), 0) + 1
  const created: CrmTeam = {
    id: `TEAM-${String(nextNum).padStart(2, '0')}`,
    name: input.name, description: input.description,
    memberIds: [...input.memberIds], modules: [...input.modules],
    updatedAt: now, updatedBy: author,
  }
  crmTeams.push(created)
  persistCrmTeams()
  return created
}
export function deleteCrmTeam(id: string): void {
  const i = crmTeams.findIndex((t) => t.id === id)
  if (i !== -1) { crmTeams.splice(i, 1); persistCrmTeams() }
}

// ── Modules (Settings → Modules settings) ─────────────────────────────────────
// The "Customizable CRM Platform" surface (PRD: ERP - Customizable CRM Platform
// and Deals V1). A module = a record type the company shapes itself: named fields
// laid out in sections, saved List/Kanban views, and an optional ERP-transaction
// conversion. Deals is the provisioned SYSTEM module; companies may add custom
// modules. The Modules index lists them; Manage opens the module builder.
export type CrmFieldType =
  | 'text' | 'number' | 'currency' | 'date'
  | 'pick-list' | 'radio' | 'customer' | 'product-list' | 'user'
export const CRM_FIELD_TYPE_LABELS: Record<CrmFieldType, string> = {
  text: 'Text', number: 'Number', currency: 'Currency', date: 'Date',
  'pick-list': 'Pick list', radio: 'Radio', customer: 'CRM Customer',
  'product-list': 'Product list', user: 'User',
}

export interface CrmModuleField {
  id: string
  label: string
  type: CrmFieldType
  required: boolean
  /** Protected system field — repositionable but not removable while in use. */
  system: boolean
  /** Options for pick-list / radio. */
  options?: string[]
  /** Layout placement — which section + column (1|2); undefined section = Unused. */
  section?: string
  column?: 1 | 2
  /** Primary Record Name (the module's title field). */
  isPrimary?: boolean
}

export type CrmModuleViewType = 'list' | 'kanban'
export type CrmModuleViewVisibility = 'private' | 'team' | 'everyone'
export interface CrmModuleView {
  id: string
  name: string
  type: CrmModuleViewType
  /** Kanban only — a Pick List/Radio field id used as "Categorize by". */
  categorizeBy?: string
  visibility: CrmModuleViewVisibility
}

export type CrmModuleStatus = 'published' | 'draft' | 'incomplete'
export type CrmConversionTarget = 'sales-quote' | 'sales-order' | 'expense' | null
export const CRM_CONVERSION_LABELS: Record<Exclude<CrmConversionTarget, null>, string> = {
  'sales-quote': 'Sales Quote', 'sales-order': 'Sales Order', expense: 'Expense',
}

export interface CrmModule {
  id: string
  name: string
  /** Deals is the provisioned system module (can't be deleted). */
  system: boolean
  accessLevel: 'company' | 'team'
  status: CrmModuleStatus
  sections: string[]
  fields: CrmModuleField[]
  /** Optional single-choice field that drives conditional layout rules. */
  layoutDriver?: string
  views: CrmModuleView[]
  conversionTarget: CrmConversionTarget
  recordCount: number
  updatedAt: string
  updatedBy: string
}

const DEAL_STAGE_OPTIONS = ['Open lead', '1st meeting', 'Proposal', 'Negotiation', 'Won', 'Lost']
const MODULES_SEED: CrmModule[] = [
  {
    id: 'deals', name: 'Deals', system: true, accessLevel: 'company', status: 'published',
    sections: ['Deal information', 'Products & value'],
    fields: [
      { id: 'name',     label: 'Deal name',          type: 'text',         required: true,  system: true, isPrimary: true, section: 'Deal information', column: 1 },
      { id: 'customer', label: 'Customer',           type: 'customer',     required: true,  system: true,  section: 'Deal information', column: 1 },
      { id: 'stage',    label: 'Stage',              type: 'pick-list',    required: true,  system: true,  options: DEAL_STAGE_OPTIONS, section: 'Deal information', column: 2 },
      { id: 'owner',    label: 'Owner',              type: 'user',         required: true,  system: true,  section: 'Deal information', column: 2 },
      { id: 'priority', label: 'Priority',           type: 'pick-list',    required: false, system: false, options: ['Low', 'Medium', 'High', 'Critical'], section: 'Deal information', column: 2 },
      { id: 'products', label: 'Products',           type: 'product-list', required: false, system: true,  section: 'Products & value', column: 1 },
      { id: 'value',    label: 'Value',              type: 'currency',     required: false, system: false, section: 'Products & value', column: 2 },
      { id: 'closeDate',label: 'Expected close date',type: 'date',         required: false, system: false, section: 'Products & value', column: 2 },
      { id: 'source',   label: 'Lead source',        type: 'radio',        required: false, system: false, options: ['Referral', 'Website', 'Outbound', 'Event'] }, // in Unused Fields (no section)
    ],
    layoutDriver: 'stage',
    views: [
      { id: 'all',  name: 'All deals',   type: 'list',   visibility: 'everyone' },
      { id: 'mine', name: 'My pipeline', type: 'kanban', categorizeBy: 'stage', visibility: 'private' },
    ],
    conversionTarget: 'sales-order',
    recordCount: 12,
    updatedAt: '2026-09-02T14:30:00', updatedBy: 'Rizal Candra',
  },
  {
    id: 'onboarding', name: 'Customer Onboarding', system: false, accessLevel: 'team', status: 'draft',
    sections: ['Onboarding'],
    fields: [
      { id: 'name',   label: 'Account',   type: 'text',      required: true,  system: true, isPrimary: true, section: 'Onboarding', column: 1 },
      { id: 'stage',  label: 'Step',      type: 'pick-list', required: true,  system: false, options: ['Kickoff', 'Setup', 'Training', 'Live'], section: 'Onboarding', column: 1 },
      { id: 'owner',  label: 'CSM',       type: 'user',      required: true,  system: true, section: 'Onboarding', column: 2 },
    ],
    views: [{ id: 'all', name: 'All onboardings', type: 'list', visibility: 'everyone' }],
    conversionTarget: null,
    recordCount: 4,
    updatedAt: '2026-08-30T11:05:00', updatedBy: 'Dewi Lestari',
  },
  {
    id: 'service', name: 'Service Requests', system: false, accessLevel: 'company', status: 'incomplete',
    sections: ['Request'],
    fields: [
      { id: 'name',  label: 'Subject',  type: 'text',      required: true, system: true, isPrimary: true, section: 'Request', column: 1 },
      { id: 'type',  label: 'Type',     type: 'pick-list', required: true, system: false, options: ['Complaint', 'Question', 'Return'], section: 'Request', column: 1 },
    ],
    views: [{ id: 'all', name: 'All requests', type: 'list', visibility: 'everyone' }],
    conversionTarget: 'expense',
    recordCount: 0,
    updatedAt: '2026-08-25T09:40:00', updatedBy: 'Rizal Candra',
  },
]

export const crmModules = reactive<CrmModule[]>(load('crm-modules-v1', MODULES_SEED))
export function persistCrmModules() { saveSnapshot('crm-modules-v1', crmModules) }

// ── Deal pipelines (Settings ▸ Deals ▸ Pipeline) ─────────────────────────────
// A pipeline = an ordered list of OPEN stages that flow left→right, plus exactly
// one Won and one Lost "ending" stage (the special swimlane). Won/Lost carry no
// aging. A new deal enters the OPEN stage flagged `isDefault`.
export type DealStageKind = 'open' | 'won' | 'lost'
export interface DealPipelineStage { id: string; name: string; kind: DealStageKind; isDefault?: boolean }
export interface DealPipeline { id: string; name: string; stages: DealPipelineStage[] }

const DEAL_PIPELINES_SEED: DealPipeline[] = [
  {
    id: 'default',
    name: 'Default deal pipeline',
    stages: [
      { id: 's-open-lead',   name: 'Open lead',   kind: 'open', isDefault: true },
      { id: 's-1st-meeting', name: '1st meeting', kind: 'open' },
      { id: 's-proposal',    name: 'Proposal',    kind: 'open' },
      { id: 's-negotiation', name: 'Negotiation', kind: 'open' },
      { id: 's-won',  name: 'Won',  kind: 'won' },
      { id: 's-lost', name: 'Lost', kind: 'lost' },
    ],
  },
]
export const dealPipelines = reactive<DealPipeline[]>(load('crm-deal-pipelines-v1', DEAL_PIPELINES_SEED))
export function persistDealPipelines() { saveSnapshot('crm-deal-pipelines-v1', dealPipelines) }

/** The signed-in CRM user (mock) — the default Deal Owner + createdBy on a new deal. */
export const CRM_CURRENT_USER = 'Rizal Candra'
/** Default Stage for a new Deal — the pipeline's default OPEN stage from settings,
 *  normalized to a DEAL_STAGES identity; falls back to Open Lead (PRD default). */
export function defaultDealStage(): DealStage {
  const def = dealPipelines[0]?.stages.find((s) => s.kind === 'open' && s.isDefault)
  const match = def && DEAL_STAGES.find((s) => s.toLowerCase() === def.name.toLowerCase())
  return (match as DealStage) ?? 'Open Lead'
}
/** Hand-off seed from the quick-create drawer to the full-detail form page
 *  (/crm/deals/new). Set by "Add more details", read + cleared by the page. */
export interface DealDraftSeed { name?: string; customerId?: string; stage?: DealStage; owner?: string }
export const dealDraftSeed = ref<DealDraftSeed | null>(null)
export function getCrmModule(id: string): CrmModule | undefined { return crmModules.find((m) => m.id === id) }
export function persistCrmModule(m: CrmModule, author: string, now: string): void {
  m.updatedAt = now
  m.updatedBy = author
  persistCrmModules()
}

// ── Activity logs (CRM) ───────────────────────────────────────────────────────
// A company-wide audit trail (PRD LD-44 "Audit History"), rendered as the ERP
// Activity logs table (Other Lists Figma) contextualised for CRM: features are
// CRM features (Deal / Customer / Company / Task / Sales order / Module / Team /
// View), numbers use CRM formats (DL-2609xx, C0xx, SO-50xx, TSK-90xx), and an
// EDIT detail always reads old → new. A busy edit carries many detail lines; the
// page shows the first 3 with View more/less (rule/activity-log-structure).
export const CRM_ACTIONS = ['Create', 'Update', 'Delete', 'Convert', 'Send email', 'Recurring', 'Login'] as const
export type CrmAction = typeof CRM_ACTIONS[number]
// CRM top-level features that generate activity (matches the CRM nav areas).
export const CRM_ACTIVITY_FEATURES = ['Deals', 'Contacts', 'Settings'] as const

/** One detail line: a plain `text`, or a labelled `from → to` edit. */
export interface CrmActivityDetail { label?: string; from?: string; to?: string; text?: string }
export interface CrmActivityEntry {
  id: string
  date: string            // ISO datetime
  user: string            // actor, or 'System'
  action: CrmAction
  feature: string         // '' when N/A (e.g. Login)
  recordLabel?: string    // NUMBER column, e.g. 'Deal DL-260907'
  recordLink?: string     // route to the record, when linkable
  details: CrmActivityDetail[]
}

const ACTIVITY_SEED: CrmActivityEntry[] = [
  { id: 'AL-0001', date: '2026-09-07T09:15:00', user: 'Rizal Candra',  action: 'Login',      feature: '',            details: [] },
  { id: 'AL-0002', date: '2026-09-06T16:40:00', user: 'Dewi Lestari',  action: 'Update',     feature: 'Deals',        recordLabel: 'Deal #10007', recordLink: '/crm/deals/DL-260907',
    details: [{ label: 'Stage', from: 'Proposal', to: 'Negotiation' }] },
  { id: 'AL-0003', date: '2026-09-06T14:05:00', user: 'Dewi Lestari',  action: 'Update',     feature: 'Deals',        recordLabel: 'Deal #10005', recordLink: '/crm/deals/DL-260905',
    details: [
      { label: 'Stage', from: 'Open lead', to: 'Proposal' },
      { label: 'Owner', from: 'Fajar Nugroho', to: 'Dewi Lestari' },
      { label: 'Value', from: 'Rp18.000.000', to: 'Rp24.000.000' },
      { label: 'Priority', from: 'Low', to: 'Medium' },
      { label: 'Expected close date', from: '30/09/2026', to: '18/09/2026' },
    ] },
  { id: 'AL-0004', date: '2026-09-05T11:30:00', user: 'Fajar Nugroho', action: 'Convert',    feature: 'Deals',        recordLabel: 'Deal #10009', recordLink: '/crm/deals/DL-260909',
    details: [{ text: 'Converted to Sales order #50009' }] },
  { id: 'AL-0005', date: '2026-09-05T10:10:00', user: 'Fajar Nugroho', action: 'Update',     feature: 'Deals',        recordLabel: 'Deal #10010', recordLink: '/crm/deals/DL-260910',
    details: [{ label: 'Stage', from: 'Negotiation', to: 'Won' }] },
  { id: 'AL-0006', date: '2026-09-04T15:20:00', user: 'Dewi Lestari',  action: 'Send email', feature: 'Deals',        recordLabel: 'Deal #10006', recordLink: '/crm/deals/DL-260906',
    details: [{ label: 'Sent to', text: 'purchasing@excelso.com' }] },
  { id: 'AL-0007', date: '2026-09-04T09:00:00', user: 'System',        action: 'Recurring',  feature: 'Deals',        recordLabel: 'Task #90010',
    details: [{ text: '1 task created' }] },
  { id: 'AL-0008', date: '2026-09-03T17:45:00', user: 'Fajar Nugroho', action: 'Update',     feature: 'Contacts',    recordLabel: 'Customer #10013', recordLink: '/crm/contacts/customers',
    details: [
      { label: 'Owner', from: 'Dewi Lestari', to: 'Fajar Nugroho' },
      { label: 'Segments', from: 'Café chain', to: 'Café chain, Key account' },
    ] },
  { id: 'AL-0009', date: '2026-09-03T11:05:00', user: 'Rizal Candra',  action: 'Update',     feature: 'Settings',        recordLabel: 'Sales',
    details: [{ label: 'No. of members', from: '2', to: '3' }] },
  { id: 'AL-0010', date: '2026-09-02T14:30:00', user: 'Rizal Candra',  action: 'Update',     feature: 'Settings',      recordLabel: 'Deals',
    details: [{ label: 'Status', from: 'Draft', to: 'Published' }, { label: 'Field added', text: 'Priority (Pick list)' }] },
  { id: 'AL-0011', date: '2026-09-02T09:40:00', user: 'Dewi Lestari',  action: 'Create',     feature: 'Deals',        recordLabel: 'Deal #10002', recordLink: '/crm/deals/DL-260902',
    details: [
      { label: 'Name', text: 'Office pantry — monthly supply' },
      { label: 'Customer', text: 'GoWork Office Tower' },
      { label: 'Stage', text: 'Open lead' },
      { label: 'Value', text: 'Rp12.000.000' },
    ] },
  { id: 'AL-0012', date: '2026-09-01T16:15:00', user: 'Fajar Nugroho', action: 'Delete',     feature: 'Deals',        recordLabel: 'Task #90002',
    details: [] },
  { id: 'AL-0013', date: '2026-09-01T10:20:00', user: 'Dewi Lestari',  action: 'Create',     feature: 'Contacts',    recordLabel: 'Customer #10014', recordLink: '/crm/contacts/customers',
    details: [
      { label: 'Company', text: 'GoWork Office Tower' },
      { label: 'Segment', text: 'Office' },
      { label: 'Owner', text: 'Dewi Lestari' },
    ] },
  { id: 'AL-0014', date: '2026-08-31T13:30:00', user: 'Fajar Nugroho', action: 'Update',     feature: 'Deals',        recordLabel: 'Deal #10008', recordLink: '/crm/deals/DL-260908',
    details: [{ label: 'Value', from: 'Rp12.000.000', to: 'Rp15.000.000' }] },
  { id: 'AL-0015', date: '2026-08-31T08:05:00', user: 'Dewi Lestari',  action: 'Login',      feature: '',            details: [] },
  { id: 'AL-0016', date: '2026-08-30T11:05:00', user: 'Dewi Lestari',  action: 'Create',     feature: 'Settings',        recordLabel: 'Marketing',
    details: [
      { label: 'Description', text: 'Generates and nurtures new leads' },
      { label: 'Members', text: '1' },
    ] },
]

export const crmActivityLog = reactive<CrmActivityEntry[]>(load('crm-activity-v1', ACTIVITY_SEED))

// ── User permissions — NO roles: a per-module permission matrix ────────────────
// A user's access is a matrix of module × action checkboxes, set at invite time
// and editable per user. Actions per module: Read / Edit / Add / Delete / Export /
// Reports.
export const CRM_PERM_MODULES = ['Deals', 'Contacts', 'Companies'] as const
export type CrmPermModule = typeof CRM_PERM_MODULES[number]
export const CRM_PERM_ACTIONS = [
  { key: 'read',    label: 'Read'    },
  { key: 'edit',    label: 'Edit'    },
  { key: 'add',     label: 'Add'     },
  { key: 'delete',  label: 'Delete'  },
  { key: 'export',  label: 'Export'  },
  { key: 'reports', label: 'Reports' },
] as const
export type CrmPermAction = typeof CRM_PERM_ACTIONS[number]['key']
export type CrmModulePerms = Record<CrmPermAction, boolean>
export type CrmPermMatrix = Record<string, CrmModulePerms>

function blankModulePerms(all = false): CrmModulePerms {
  return { read: all, edit: all, add: all, delete: all, export: all, reports: all }
}
export function emptyPermMatrix(): CrmPermMatrix {
  const m: CrmPermMatrix = {}
  for (const mod of CRM_PERM_MODULES) m[mod] = blankModulePerms(false)
  return m
}
export function fullPermMatrix(): CrmPermMatrix {
  const m: CrmPermMatrix = {}
  for (const mod of CRM_PERM_MODULES) m[mod] = blankModulePerms(true)
  return m
}
/** Baseline for a new user: can Read + view Reports on every module. */
export function defaultPermMatrix(): CrmPermMatrix {
  const m = emptyPermMatrix()
  for (const mod of CRM_PERM_MODULES) { m[mod].read = true; m[mod].reports = true }
  return m
}
/** One-line summary of a matrix for the User & roles index. */
export function permSummary(m: CrmPermMatrix): string {
  const cells = CRM_PERM_MODULES.flatMap((mod) => CRM_PERM_ACTIONS.map((a) => m[mod]?.[a.key] ?? false))
  const on = cells.filter(Boolean).length
  if (on === 0) return 'No access'
  if (on === cells.length) return 'Full access'
  const readOnly = CRM_PERM_MODULES.every((mod) => m[mod] && !m[mod].edit && !m[mod].add && !m[mod].delete)
  return readOnly ? 'View only' : 'Custom access'
}

// Primary segment (industry) options for the create-customer form.
export const CUSTOMER_SEGMENTS = ['Roastery', 'Café chain', 'Hotel', 'Distributor', 'Retail', 'Office'] as const

// Create a new customer (client-side, snapshot-persisted). Lifecycle stage maps
// to the underlying status (+ a seed open deal so an "Opportunity" reads back as
// one via lifecycleOf). New customers start with zero money/activity.
export function addCrmCustomer(input: {
  company: string
  contact: string
  email: string
  phone: string
  city: string
  segment: string
  owner: string
  lifecycle: LifecycleStage
}): CrmCustomer {
  const status: CustomerStatus =
    input.lifecycle === 'Customer' ? 'active' : input.lifecycle === 'Former customer' ? 'churned' : 'prospect'
  const customer: CrmCustomer = {
    id: `cust-${Date.now()}`,
    company: input.company.trim(),
    contact: input.contact.trim(),
    email: input.email.trim(),
    phone: input.phone.trim(),
    segment: input.segment,
    segments: input.segment ? [input.segment] : [],
    city: input.city.trim(),
    owner: input.owner,
    openDeals: input.lifecycle === 'Opportunity' ? 1 : 0,
    lifetimeValue: 0,
    inFlight: 0,
    outstanding: 0,
    status,
    lastActivity: new Date().toISOString().slice(0, 10),
  }
  crmCustomers.unshift(customer)
  persistCrmCustomers()
  return customer
}

// Customer row actions (client-side, snapshot-persisted).
export function deleteCrmCustomer(id: string): void {
  const i = crmCustomers.findIndex((c) => c.id === id)
  if (i !== -1) { crmCustomers.splice(i, 1); saveSnapshot('crm-customers-v1', crmCustomers) }
}
export function getCrmCustomer(id: string): CrmCustomer | undefined { return crmCustomers.find((c) => c.id === id) }

// ── Contacts — the people inside the companies database. Derived from each
// company's primary contact, so the two views stay in sync (Companies ↔ Contacts).
export interface CrmContact {
  id: string
  name: string
  company: string
  companyId: string
  email: string
  phone: string
  owner: string
  lifecycle: LifecycleStage
  tags: string[]
}
export function crmContactsList(): CrmContact[] {
  return crmCustomers
    .filter((c) => c.contact.trim())
    .map((c) => ({
      id: `${c.id}-c`,
      name: c.contact,
      company: c.company,
      companyId: c.id,
      email: c.email,
      phone: c.phone,
      owner: c.owner,
      lifecycle: lifecycleOf(c),
      tags: [...c.segments],
    }))
}
// Delete a contact = clear its company's primary-contact fields (contacts are the
// company's primary contact), so it drops out of the derived list. Persisted.
export function deleteCrmContact(companyId: string): void {
  const c = crmCustomers.find((x) => x.id === companyId)
  if (!c) return
  c.contact = ''; c.email = ''; c.phone = ''
  saveSnapshot('crm-customers-v1', crmCustomers)
}
export function getCrmContact(id: string): CrmContact | undefined {
  return crmContactsList().find((c) => c.id === id)
}

// Deterministic mock job title (no real field on the seed data yet).
const JOB_TITLES = ['Procurement Manager', 'Operations Lead', 'Head of Purchasing', 'Café Owner', 'Store Manager', 'Finance Manager', 'Founder']
function seedHash(s: string): number { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h >>> 0 }
export function jobTitleFor(name: string): string { return JOB_TITLES[seedHash(name) % JOB_TITLES.length]! }

// Deterministic mock SKU for an ordered product name.
export function skuFor(product: string): string { return `SKU-${(seedHash(product) % 9000) + 1000}` }

// ── Company notes / comments — localStorage-persisted per company ──
export interface CrmComment { id: string; companyId: string; author: string; text: string; at: string }
export const crmCompanyComments = reactive<CrmComment[]>(loadSnapshot<CrmComment>('crm-company-comments-v1') ?? [])
function persistComments() { saveSnapshot('crm-company-comments-v1', crmCompanyComments) }
export function companyCommentsFor(companyId: string): CrmComment[] {
  return crmCompanyComments.filter((c) => c.companyId === companyId).slice().sort((a, b) => b.at.localeCompare(a.at))
}
export function addCompanyComment(companyId: string, text: string, author = 'You'): CrmComment {
  const c: CrmComment = { id: `cmt-${Date.now()}`, companyId, author, text: text.trim(), at: new Date().toISOString() }
  crmCompanyComments.push(c)
  persistComments()
  return c
}
export function deleteCompanyComment(id: string): void {
  const i = crmCompanyComments.findIndex((c) => c.id === id)
  if (i !== -1) { crmCompanyComments.splice(i, 1); persistComments() }
}

// ── Deal notes / comments (per-deal timeline, newest first) ──
export interface CrmDealComment { id: string; dealId: string; author: string; text: string; at: string }
export const crmDealComments = reactive<CrmDealComment[]>(loadSnapshot<CrmDealComment>('crm-deal-comments-v1') ?? [])
function persistDealComments() { saveSnapshot('crm-deal-comments-v1', crmDealComments) }
export function dealComments(dealId: string): CrmDealComment[] {
  return crmDealComments.filter((c) => c.dealId === dealId).slice().sort((a, b) => b.at.localeCompare(a.at))
}
export function addDealComment(dealId: string, text: string, author = 'You'): CrmDealComment {
  const c: CrmDealComment = { id: `dcmt-${Date.now()}`, dealId, author, text: text.trim(), at: new Date().toISOString() }
  crmDealComments.push(c)
  persistDealComments()
  return c
}

// ══════════════════════════════════════════════════════════════════════════════
// Customers domain (L1 "Customers" → L2 Contacts + Companies)
//
// First-class CONTACTS (people) and COMPANIES (orgs) with a many-to-many link:
// one contact may be associated with multiple companies, and a company may have
// multiple contacts of which exactly one is the primary. Seeded from the coffee
// accounts in crmCustomers, plus a few extra relationships that exercise the M2M
// + primary rules. Notes/comments attach to either entity.
// ══════════════════════════════════════════════════════════════════════════════
export interface CrmContactPerson {
  id: string                 // 'CT-001'
  name: string
  jobTitle: string
  email: string
  phone: string
  companyIds: string[]       // associated companies (M2M)
  owner: string
  createdAt: string
  lastActivity: string
}
export interface CrmCompany {
  id: string                 // 'CO-001'
  name: string
  industry: string           // segment (Roastery / Café chain / …)
  email: string
  phone: string
  website: string
  address: string            // street line
  city: string
  province: string
  postalCode: string
  owner: string
  contactIds: string[]       // member contacts (M2M)
  primaryContactId?: string  // required when the company has >1 contact
  createdAt: string
  lastActivity: string
}

const PROVINCE_BY_CITY: Record<string, string> = {
  Jakarta: 'DKI Jakarta', Bekasi: 'Jawa Barat', Tangerang: 'Banten',
  Semarang: 'Jawa Tengah', Bali: 'Bali', Bandung: 'Jawa Barat', Surabaya: 'Jawa Timur',
}
function provinceFor(city: string): string { return PROVINCE_BY_CITY[city] ?? 'DKI Jakarta' }
function slugDomain(name: string): string { return name.toLowerCase().replace(/[^a-z0-9]+/g, '') }

// Seed companies + their primary contacts from the coffee accounts.
const _companySeed: CrmCompany[] = crmCustomers.map((c, i) => ({
  id: `CO-${String(i + 1).padStart(3, '0')}`,
  name: c.company,
  industry: c.segment,
  email: c.email,
  phone: c.phone,
  website: `https://www.${slugDomain(c.company)}.co.id`,
  address: `Jl. Jenderal Sudirman No. ${12 + i}`,
  city: c.city,
  province: provinceFor(c.city),
  postalCode: `${10000 + i * 110}`,
  owner: c.owner,
  contactIds: [`CT-${String(i + 1).padStart(3, '0')}`],
  primaryContactId: `CT-${String(i + 1).padStart(3, '0')}`,
  createdAt: '2026-01-05', lastActivity: c.lastActivity,
}))
const _contactSeed: CrmContactPerson[] = crmCustomers.map((c, i) => ({
  id: `CT-${String(i + 1).padStart(3, '0')}`,
  name: c.contact,
  jobTitle: jobTitleFor(c.contact),
  email: c.email,
  phone: c.phone,
  companyIds: [`CO-${String(i + 1).padStart(3, '0')}`],
  owner: c.owner,
  createdAt: '2026-01-05', lastActivity: c.lastActivity,
}))
// Extra relationships that exercise the rules:
//  • CT-100 is a group buyer associated with TWO companies (M2M).
//  • CO-001 gains a second contact (CT-100) — CT-001 stays primary (multi-contact company).
_contactSeed.push({
  id: 'CT-100', name: 'Bagus Prasetyo', jobTitle: 'Group Procurement Lead',
  email: 'bagus.prasetyo@centralperk.co.id', phone: '021-5550100',
  companyIds: ['CO-001', 'CO-002'], owner: 'Fajar Nugroho', createdAt: '2026-02-01', lastActivity: '2026-02-27',
})
if (_companySeed[0]) _companySeed[0].contactIds = ['CT-001', 'CT-100']
if (_companySeed[1]) _companySeed[1].contactIds = ['CT-002', 'CT-100']

export const crmContactPeople = reactive<CrmContactPerson[]>(load('crm-contact-people-v1', _contactSeed))
export const crmCompanies = reactive<CrmCompany[]>(load('crm-companies-v1', _companySeed))
export function persistCrmContactPeople() { saveSnapshot('crm-contact-people-v1', crmContactPeople) }
export function persistCrmCompanies() { saveSnapshot('crm-companies-v1', crmCompanies) }

export function getContactPerson(id: string): CrmContactPerson | undefined { return crmContactPeople.find((c) => c.id === id) }
export function getCompany(id: string): CrmCompany | undefined { return crmCompanies.find((c) => c.id === id) }
export function companyName(id: string): string { return getCompany(id)?.name ?? id }
export function contactName(id: string): string { return getContactPerson(id)?.name ?? id }
/** Companies a contact belongs to. */
export function companiesOfContact(id: string): CrmCompany[] {
  return crmCompanies.filter((co) => co.contactIds.includes(id))
}
/** Contacts of a company (primary first). */
export function contactsOfCompany(id: string): CrmContactPerson[] {
  const co = getCompany(id)
  if (!co) return []
  const list = co.contactIds.map(getContactPerson).filter(Boolean) as CrmContactPerson[]
  return list.sort((a, b) => (a.id === co.primaryContactId ? -1 : b.id === co.primaryContactId ? 1 : 0))
}
export function isPrimaryContact(companyId: string, contactId: string): boolean {
  return getCompany(companyId)?.primaryContactId === contactId
}
/** Deals linked to a company (matched by account name). */
export function dealsForCompany(companyId: string): Deal[] {
  const name = companyName(companyId)
  return deals.filter((d) => d.company === name)
}

function nextId(prefix: string, list: { id: string }[]): string {
  const n = list.reduce((m, x) => Math.max(m, Number(x.id.replace(`${prefix}-`, '')) || 0), 0) + 1
  return `${prefix}-${String(n).padStart(3, '0')}`
}
export function addCrmContactPerson(input: { name: string; jobTitle: string; email: string; phone: string; companyIds: string[]; owner: string }, now: string): CrmContactPerson {
  const person: CrmContactPerson = { id: nextId('CT', crmContactPeople), ...input, companyIds: [...input.companyIds], createdAt: now.slice(0, 10), lastActivity: now.slice(0, 10) }
  crmContactPeople.push(person)
  // keep the reverse link + primary rule coherent
  for (const cid of person.companyIds) {
    const co = getCompany(cid)
    if (co && !co.contactIds.includes(person.id)) {
      co.contactIds.push(person.id)
      if (!co.primaryContactId) co.primaryContactId = person.id
    }
  }
  persistCrmContactPeople(); persistCrmCompanies()
  return person
}
export function addCrmCompany(input: { name: string; industry: string; email: string; phone: string; website: string; address: string; city: string; province: string; postalCode: string; owner: string; contactIds: string[] }, now: string): CrmCompany {
  const co: CrmCompany = {
    id: nextId('CO', crmCompanies), ...input, contactIds: [...input.contactIds],
    primaryContactId: input.contactIds[0], createdAt: now.slice(0, 10), lastActivity: now.slice(0, 10),
  }
  crmCompanies.push(co)
  for (const cid of co.contactIds) {
    const p = getContactPerson(cid)
    if (p && !p.companyIds.includes(co.id)) p.companyIds.push(co.id)
  }
  persistCrmCompanies(); persistCrmContactPeople()
  return co
}
export function setPrimaryContact(companyId: string, contactId: string): void {
  const co = getCompany(companyId)
  if (co && co.contactIds.includes(contactId)) { co.primaryContactId = contactId; persistCrmCompanies() }
}

// ── Notes / comments — attach to a contact OR a company (unified store) ──
export type CrmNoteEntity = 'contact' | 'company'
export interface CrmNote { id: string; entityType: CrmNoteEntity; entityId: string; author: string; text: string; at: string }
const NOTES_SEED: CrmNote[] = [
  { id: 'NT-001', entityType: 'company', entityId: 'CO-001', author: 'Dewi Lestari',  text: 'Called about the Q4 roastery supply — waiting on volume confirmation.', at: '2026-02-20T10:15:00' },
  { id: 'NT-002', entityType: 'company', entityId: 'CO-001', author: 'Rizal Candra',  text: 'Credit terms approved: NET 30.', at: '2026-02-22T14:00:00' },
  { id: 'NT-003', entityType: 'contact', entityId: 'CT-001', author: 'Dewi Lestari',  text: 'Prefers WhatsApp over email for quotes.', at: '2026-02-21T09:30:00' },
]
export const crmNotes = reactive<CrmNote[]>(load('crm-notes-v1', NOTES_SEED))
export function notesFor(entityType: CrmNoteEntity, entityId: string): CrmNote[] {
  return crmNotes.filter((n) => n.entityType === entityType && n.entityId === entityId).slice().sort((a, b) => b.at.localeCompare(a.at))
}
export function addCrmNote(entityType: CrmNoteEntity, entityId: string, text: string, author: string, at: string): CrmNote {
  const note: CrmNote = { id: nextId('NT', crmNotes), entityType, entityId, author, text: text.trim(), at }
  crmNotes.push(note)
  saveSnapshot('crm-notes-v1', crmNotes)
  return note
}
export function deleteCrmNote(id: string): void {
  const i = crmNotes.findIndex((n) => n.id === id)
  if (i !== -1) { crmNotes.splice(i, 1); saveSnapshot('crm-notes-v1', crmNotes) }
}

// ── Per-customer deals (open pipeline) — synthetic & deterministic so the count
// matches `openDeals` and the total value ≈ `inFlight`. Powers the customer
// detail Deals tab. ───────────────────────────────────────────────────────────
export interface CrmDeal { id: string; name: string; stage: string; value: number; closeDate: string; owner: string }
const OPEN_STAGES = ['New', 'Qualified', 'Proposal sent', 'Negotiation']
export function customerDeals(c: CrmCustomer): CrmDeal[] {
  const n = c.openDeals
  if (n <= 0) return []
  const each = Math.max(1_000_000, Math.round(c.inFlight / n / 1_000_000) * 1_000_000)
  const deals: CrmDeal[] = []
  for (let i = 0; i < n; i++) {
    const stage = OPEN_STAGES[i % OPEN_STAGES.length]!
    const value = i === n - 1 ? Math.max(0, c.inFlight - each * (n - 1)) : each
    const day = String(Math.min(28, 5 + i * 7)).padStart(2, '0')
    deals.push({ id: `${c.id}-D${i + 1}`, name: `${c.company} — ${stage} deal`, stage, value, closeDate: `2026-03-${day}`, owner: c.owner })
  }
  return deals
}

// ── Segments (tags) ────────────────────────────────────────────────────────────
/** Every distinct segment tag currently in use, alphabetical — for filter/board. */
export function allSegmentTags(): string[] {
  const set = new Set<string>()
  for (const c of crmCustomers) for (const s of c.segments) set.add(s)
  return [...set].sort((a, b) => a.localeCompare(b))
}
/** Replace a customer's segment tags (Segments column / detail editor). */
export function setCustomerSegments(id: string, tags: string[]): void {
  const c = crmCustomers.find((x) => x.id === id)
  if (!c) return
  c.segments = [...tags]
  saveSnapshot('crm-customers-v1', crmCustomers)
}

// ── Board drag & drop moves — persist the change behind the derived lifecycle. ──
/** Drop onto a lifecycle column: adjust status (and openDeals for Lead/Opportunity)
 *  so lifecycleOf() lands back on the target stage. */
export function setCustomerLifecycle(id: string, stage: LifecycleStage): void {
  const c = crmCustomers.find((x) => x.id === id)
  if (!c) return
  if (stage === 'Customer') c.status = 'active'
  else if (stage === 'Former customer') c.status = 'churned'
  else {
    c.status = 'prospect'
    if (stage === 'Lead') { c.openDeals = 0; c.inFlight = 0 }
    else if (c.openDeals < 1) c.openDeals = 1   // Opportunity needs an open deal
  }
  saveSnapshot('crm-customers-v1', crmCustomers)
}
/** Drop onto a contact-owner column. */
export function setCustomerOwner(id: string, owner: string): void {
  const c = crmCustomers.find((x) => x.id === id)
  if (!c) return
  c.owner = owner
  saveSnapshot('crm-customers-v1', crmCustomers)
}
/** Drop across segment columns: drop the source tag, add the target tag. */
export function moveCustomerSegment(id: string, from: string, to: string): void {
  const c = crmCustomers.find((x) => x.id === id)
  if (!c) return
  const next = c.segments.filter((s) => s !== from && s !== to)
  if (to !== '—') next.push(to)
  c.segments = next
  saveSnapshot('crm-customers-v1', crmCustomers)
}

// ── Saved views (Customers list: table/board + saved filters) ───────────────────
// The default "All customers" view is implicit (id 'all', never stored); these are
// the user-created views shown as tabs after it.
export type CrmViewType = 'table' | 'board'
export type CrmGroupBy = 'lifecycle' | 'segment' | 'owner'
export const CRM_GROUP_BY: { value: CrmGroupBy; label: string }[] = [
  { value: 'lifecycle', label: 'Lifecycle stage' },
  { value: 'segment', label: 'Segment' },
  { value: 'owner', label: 'Contact owner' },
]
export interface CrmViewFilters { lifecycle: string[]; owners: string[]; segments: string[] }
export function emptyViewFilters(): CrmViewFilters { return { lifecycle: [], owners: [], segments: [] } }
export interface CrmSavedView { id: string; name: string; type: CrmViewType; groupBy: CrmGroupBy; filters: CrmViewFilters }

export const crmCustomerViews = reactive<CrmSavedView[]>(loadSnapshot<CrmSavedView>('crm-customer-views-v1') ?? [])
function persistCustomerViews() { saveSnapshot('crm-customer-views-v1', crmCustomerViews) }
let viewSeq = crmCustomerViews.length + 1
export function addCrmView(v: Omit<CrmSavedView, 'id'>): CrmSavedView {
  const view: CrmSavedView = { ...v, id: `view-${Date.now()}-${viewSeq++}` }
  crmCustomerViews.push(view)
  persistCustomerViews()
  return view
}
export function updateCrmView(id: string, patch: Partial<Omit<CrmSavedView, 'id'>>): void {
  const v = crmCustomerViews.find((x) => x.id === id)
  if (!v) return
  Object.assign(v, patch)
  persistCustomerViews()
}
export function deleteCrmView(id: string): void {
  const i = crmCustomerViews.findIndex((x) => x.id === id)
  if (i !== -1) { crmCustomerViews.splice(i, 1); persistCustomerViews() }
}

// ── Contacts saved views (custom views, same idea as company views) ──
// NB: contacts filter by Contact owner only — lifecycle is a company attribute,
// not a person's, so it isn't a contact-level filter.
export interface CrmContactViewFilters { owners: string[] }
export function emptyContactViewFilters(): CrmContactViewFilters { return { owners: [] } }
export interface CrmContactView { id: string; name: string; filters: CrmContactViewFilters }
export const crmContactViews = reactive<CrmContactView[]>(loadSnapshot<CrmContactView>('crm-contact-views-v1') ?? [])
function persistContactViews() { saveSnapshot('crm-contact-views-v1', crmContactViews) }
let contactViewSeq = crmContactViews.length + 1
export function addContactView(v: Omit<CrmContactView, 'id'>): CrmContactView {
  const view: CrmContactView = { ...v, id: `cview-${Date.now()}-${contactViewSeq++}` }
  crmContactViews.push(view)
  persistContactViews()
  return view
}
export function updateContactView(id: string, patch: Partial<Omit<CrmContactView, 'id'>>): void {
  const v = crmContactViews.find((x) => x.id === id)
  if (!v) return
  Object.assign(v, patch)
  persistContactViews()
}
export function deleteContactView(id: string): void {
  const i = crmContactViews.findIndex((x) => x.id === id)
  if (i !== -1) { crmContactViews.splice(i, 1); persistContactViews() }
}
