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
import { reactive, computed } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

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
  city: string
  owner: string
  openDeals: number
  lifetimeValue: number
  status: CustomerStatus
  lastActivity: string        // ISO date
}
const CUSTOMERS_SEED: CrmCustomer[] = [
  { id: 'C015', company: 'Distributor Sentra Boga',  contact: 'Hendra Wijaya',   email: 'po@sentraboga.co.id',           phone: '021-5550015', segment: 'Distributor', city: 'Bekasi',    owner: 'Fajar Nugroho', openDeals: 3, lifetimeValue: 230_000_000, status: 'active',   lastActivity: '2026-02-27' },
  { id: 'C006', company: 'Kopi Kenangan Pusat',      contact: 'Ratna Sari',      email: 'buyer@kopikenangan.com',        phone: '021-5550006', segment: 'Café chain',  city: 'Jakarta',   owner: 'Dewi Lestari',  openDeals: 2, lifetimeValue: 120_000_000, status: 'active',   lastActivity: '2026-02-26' },
  { id: 'C013', company: 'Excelso Grand Indonesia',  contact: 'Bambang Sutrisno',email: 'purchasing@excelso.com',        phone: '021-5550013', segment: 'Café chain',  city: 'Jakarta',   owner: 'Fajar Nugroho', openDeals: 2, lifetimeValue: 98_000_000,  status: 'active',   lastActivity: '2026-02-25' },
  { id: 'C003', company: 'Hotel Mulia Senayan',      contact: 'Sinta Dewanti',   email: 'fnb@hotelmulia.com',            phone: '021-5550003', segment: 'Hotel',       city: 'Jakarta',   owner: 'Dewi Lestari',  openDeals: 1, lifetimeValue: 78_000_000,  status: 'active',   lastActivity: '2026-02-24' },
  { id: 'C002', company: 'Tanamera Coffee Roastery', contact: 'Agus Priyanto',   email: 'order@tanameracoffee.com',      phone: '021-5550002', segment: 'Roastery',    city: 'Jakarta',   owner: 'Fajar Nugroho', openDeals: 1, lifetimeValue: 62_500_000,  status: 'active',   lastActivity: '2026-02-23' },
  { id: 'C009', company: 'Maxx Coffee Lippo Mall',   contact: 'Yuliana Tan',     email: 'purchasing@maxxcoffee.com',     phone: '021-5550009', segment: 'Café chain',  city: 'Tangerang', owner: 'Fajar Nugroho', openDeals: 1, lifetimeValue: 55_000_000,  status: 'active',   lastActivity: '2026-02-22' },
  { id: 'C001', company: 'Anomali Coffee',           contact: 'Rudi Hartono',    email: 'purchasing@anomalicoffee.com',  phone: '021-5550001', segment: 'Roastery',    city: 'Jakarta',   owner: 'Dewi Lestari',  openDeals: 1, lifetimeValue: 45_000_000,  status: 'active',   lastActivity: '2026-02-21' },
  { id: 'C017', company: 'Santika Premiere Hotel',   contact: 'Wawan Setiawan',  email: 'fnb@santika.com',               phone: '024-5550017', segment: 'Hotel',       city: 'Semarang',  owner: 'Fajar Nugroho', openDeals: 1, lifetimeValue: 44_000_000,  status: 'prospect', lastActivity: '2026-02-18' },
  { id: 'C014', company: 'GoWork Office Tower',      contact: 'Nadia Pramesti',  email: 'pantry@gowork.co',              phone: '021-5550014', segment: 'Office',      city: 'Jakarta',   owner: 'Dewi Lestari',  openDeals: 0, lifetimeValue: 6_400_000,   status: 'prospect', lastActivity: '2026-02-12' },
  { id: 'C012', company: 'Coffee Cult Bali',         contact: 'Made Sudarsana',  email: 'buyer@coffeecult.id',           phone: '0361-555012', segment: 'Café chain',  city: 'Bali',      owner: 'Fajar Nugroho', openDeals: 0, lifetimeValue: 14_800_000,  status: 'churned',  lastActivity: '2025-12-09' },
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

// Customer row actions (client-side, snapshot-persisted).
export function deleteCrmCustomer(id: string): void {
  const i = crmCustomers.findIndex((c) => c.id === id)
  if (i !== -1) { crmCustomers.splice(i, 1); saveSnapshot('crm-customers-v1', crmCustomers) }
}
