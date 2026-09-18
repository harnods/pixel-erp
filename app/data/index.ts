/**
 * Data barrel — the single import surface for the whole mock-DB.
 *
 * Every "table" (and its sync/helper modules) is re-exported here so any module
 * can `import { … } from '~/data'` instead of reaching into individual files.
 * Grouped by domain to mirror how the modules connect. No two files export the
 * same top-level name, so `export *` is unambiguous across the graph.
 */

// ── Foundations / master data ───────────────────────────────────────────────
export * from './types'
export * from './master'
export * from './persist'
export * from './users'
export * from './customers'
export * from './vendors'
export * from './catalog'
export * from './products'
export * from './purchaseOrders'
export * from './purchaseOrderDetails'
export * from './purchaseRequests'
export * from './customProducts'
export * from './inventory'
export * from './productsIndex'
export * from './productDetails'
export * from './couriers'

// ── Warehouses / storage / stock engine ─────────────────────────────────────
export * from './warehouses'
export * from './warehouseDetails'
export * from './warehouseConfig'
export * from './warehouseSettings'
export * from './warehouseTeam'
export * from './warehouseTransactions'
export * from './storageLevels'
export * from './storageLocations'
export * from './barcodeConfig'

// ── Inbound (PO → receiving → put-away) ─────────────────────────────────────
export * from './receipts'
export * from './receiptDetails'
export * from './receiptLineItems'
export * from './receivingTasks'
export * from './receivingTaskDetails'
export * from './putAwayTasks'
export * from './putAwayTaskDetails'
export * from './purchaseReceivings'
export * from './purchaseInvoices'
export * from './inboundSync'

// ── Replenishment (vendor terms → demand → recommendation → draft PO) ───────
export * from './productUnits'
export * from './vendorItems'
export * from './vendorSuppliedProducts'
export * from './vendorRecommendation'
export * from './replenishmentConfig'
export * from './replenishmentSettings'
export * from './demandHistory'
export * from './leadTimeHistory'
export * from './replenishmentRuns'
export * from './replenishment'
export * from './purchaseOrderLines'
export * from './replenishmentPurchaseRequest'
export * from './replenishmentDraftPo'

// ── Outbound (order → picking → packing → delivery → shipment) ──────────────
export * from './outgoing'
export * from './pickingTasks'
export * from './pickingTaskDetails'
export * from './packingTasks'
export * from './packingTaskDetails'
export * from './deliveryTasks'
export * from './deliveryTaskDetails'
export * from './outboundSync'

// ── Sales (accounting) ──────────────────────────────────────────────────────
export * from './salesOrders'
export * from './salesOrderDetails'
export * from './salesQuotes'
export * from './salesQuoteDetails'
export * from './salesDeliveryDetails'
export * from './purchaseQuotes'
export * from './purchaseQuoteDetails'
export * from './purchaseDeliveries'
export * from './purchaseDeliveryDetails'
export * from './purchaseInvoiceDetails'
export * from './purchaseRequestDetails'
export * from './salesInvoices'
export * from './salesDeliveries'

// ── Adjustments / transfers / cycle counts ──────────────────────────────────
export * from './stockAdjustments'
export * from './wmsStockAdjustments'
export * from './cycleCountRecommendations'
export * from './warehouseTransfers'

// ── Manufacturing (BOM / work orders / production requests) ─────────────────
export * from './billOfMaterials'
export * from './workOrders'
export * from './workOrderLinks'
export * from './productionRequests'

// ── Accounting (cash management) ────────────────────────────────────────────
export * from './cashAccounts'
export * from './bankStatementLines'
export * from './bankStatementReviewFiles'

// ── Expenses (bills / uploaded files review) ────────────────────────────────
export * from './bills'
export * from './reviewFiles'

// ── HR (Employees) ──────────────────────────────────────────────────────────
export * from './employees'

// ── Settings ─────────────────────────────────────────────────────────────────
export * from './approvalWorkflows'

// ── Data migration (WMS → Jurnal cutover) ───────────────────────────────────
export * from './wmsCutover'

// ── Cross-module integrity guards ───────────────────────────────────────────
export * from './integrityGuards'

// ── Dashboard ───────────────────────────────────────────────────────────────
export * from './quickShortcuts'

// ── Seed status coverage — runs LAST (after every base seed has initialised) so
// the mock DB has ≥1 record in every inbound/outbound status. ─────────────────
import './seedCoverage'
