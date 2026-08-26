<script setup lang="ts">
import { defineAsyncComponent, defineComponent, type Component, h, ref, computed, watch, provide, nextTick, onMounted, onUnmounted } from 'vue'
import { infoToast } from '~/utils/toasts'
import { MpBadge, MpIcon, MpSpinner, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast } from '@mekari/pixel3'

// Shown while a page chunk is being fetched. 200ms delay = no flash for cached chunks.
const PageLoader = defineComponent({ render: () => h('div', { class: 'stage-loading' }, [h(MpSpinner, { size: 'lg' })]) })
function asyncPage(loader: () => Promise<{ default: Component }>): Component {
  return defineAsyncComponent({ loader, loadingComponent: PageLoader, delay: 200 })
}
import { coworkAgents, COWORK_SKILLS, type CoworkAgent } from '~/data/cowork'
import { receiptCountsByStage, receipts } from '~/data/receipts'
import { productionRequestPendingCount } from '~/data/productionRequests'
import { receivingOpenCount } from '~/data/receivingTasks'
import { putAwayOpenCount } from '~/data/putAwayTasks'
import { outgoingOpenCount } from '~/data/outgoing'
import { syncOutboundOrderStatuses } from '~/data/outboundSync'
import { pendingApprovalCount } from '~/data/productsIndex'
import { pickingOpenCount } from '~/data/pickingTasks'

// Keep outbound order statuses derived from their tasks (coherent everywhere).
syncOutboundOrderStatuses()
import { packingOpenCount } from '~/data/packingTasks'
import { deliveryOpenCount } from '~/data/deliveryTasks'
import { awaitingAdjustmentCount } from '~/data/stockAdjustments'
import { awaitingPurchaseRequestCount } from '~/data/purchaseRequests'
import { openWmsCountTaskCount, awaitingWmsCountApprovalCount } from '~/data/wmsStockAdjustments'
import { recommendationCount, topRecommendedProductNames } from '~/data/cycleCountRecommendations'
import { awaitingApprovalCount } from '~/data/warehouseTransfers'
import { bills } from '~/data/bills'
import { reviewFiles, purchaseInvoiceReviewFiles, addProcessingReviewFile } from '~/data/reviewFiles'
import { useWarehouseContext } from '~/composables/useWarehouseContext'
import { useRecommendationWarehouse } from '~/composables/useRecommendationWarehouse'
import { getWarehouseConfig } from '~/data/warehouseConfig'
import { useUnsavedChangesModalState } from '~/composables/useUnsavedChangesGuard'
import UnsavedChangesModal from '~/components/patterns/UnsavedChangesModal.vue'
import { purchaseOrders, purchaseInvoices } from '~/data'
import { employees } from '~/data/employees'
import { loadSnapshot, saveSnapshot } from '~/data/persist'
import { useCoworkContext } from '~/composables/useCoworkContext'

const { pageTitle, currentPageKey } = useNavigation()
const { build: buildCoworkContext } = useCoworkContext()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// Mobile: multiple title-bar actions collapse into a single "Actions" dropdown.
// The desktop buttons are reused verbatim (CSS relocates them into the panel), so
// there's no duplicate markup; the toggle only appears when there are ≥2 actions.
const titleActionsOpen = ref(false)
watch(() => route.path, () => { titleActionsOpen.value = false })
function onTitleActionsDocClick(e: MouseEvent) {
  if (!(e.target as HTMLElement).closest('.page-actions')) titleActionsOpen.value = false
}
onMounted(() => document.addEventListener('click', onTitleActionsDocClick))
onUnmounted(() => document.removeEventListener('click', onTitleActionsDocClick))

// Unsaved-changes confirmation modal — lives here (not in each form page) since
// this is the one component that survives every virtual page swap.
const unsavedChangesModal = useUnsavedChangesModalState()

// Browser tab title: "Mekari ERP | <module>" (acronyms uppercased for display only)
useHead({
  title: () => `Mekari ERP | ${displayLabel(pageTitle.value)}`,
})

const pageRegistry: Record<string, Component> = {
  'Home':              defineAsyncComponent(() => import('~/components/pages/HomePage.vue')),
  'Cowork':            defineAsyncComponent(() => import('~/components/pages/CoworkPage.vue')),
  'Cowork tasks':      defineAsyncComponent(() => import('~/components/pages/CoworkPage.vue')),
  'Cowork schedule':   defineAsyncComponent(() => import('~/components/pages/CoworkPage.vue')),
  'Cowork connections': defineAsyncComponent(() => import('~/components/pages/CoworkPage.vue')),
  'Cowork agents':     defineAsyncComponent(() => import('~/components/pages/CoworkPage.vue')),
  'Cowork skills':     defineAsyncComponent(() => import('~/components/pages/CoworkPage.vue')),
  'Hr':                defineAsyncComponent(() => import('~/components/pages/HrHomePage.vue')),
  'Employee directory': defineAsyncComponent(() => import('~/components/pages/EmployeeDirectoryPage.vue')),
  'Sales invoices':    defineAsyncComponent(() => import('~/components/pages/SalesInvoicesPage.vue')),
  'Purchase invoices': defineAsyncComponent(() => import('~/components/pages/PurchaseInvoicesPage.vue')),
  'Sales orders':      defineAsyncComponent(() => import('~/components/pages/SalesOrdersPage.vue')),
  'Sales quotes':      defineAsyncComponent(() => import('~/components/pages/SalesQuotesPage.vue')),
  'Sales deliveries':  defineAsyncComponent(() => import('~/components/pages/SalesDeliveriesPage.vue')),
  'Warehouses':        defineAsyncComponent(() => import('~/components/pages/WarehousesPage.vue')),
  'Product list':      defineAsyncComponent(() => import('~/components/pages/ProductsPage.vue')),
  'Storage locations': defineAsyncComponent(() => import('~/components/pages/StorageLocationsPage.vue')),
  'Couriers':          defineAsyncComponent(() => import('~/components/pages/CouriersPage.vue')),
  'On the way':        defineAsyncComponent(() => import('~/components/pages/ReceiptIndexPage.vue')),
  'Receiving':         defineAsyncComponent(() => import('~/components/pages/ReceivingIndexPage.vue')),
  'Put-away':          defineAsyncComponent(() => import('~/components/pages/PutAwayIndexPage.vue')),
  'Partial reception': defineAsyncComponent(() => import('~/components/pages/PartialReceptionIndexPage.vue')),
  'Completed':         defineAsyncComponent(() => import('~/components/pages/CompletedReceiptIndexPage.vue')),
  'Inbound completed': defineAsyncComponent(() => import('~/components/pages/CompletedReceiptIndexPage.vue')),
  'Canceled':          defineAsyncComponent(() => import('~/components/pages/CanceledReceiptIndexPage.vue')),
  'Work orders':        defineAsyncComponent(() => import('~/components/pages/WorkOrdersIndexPage.vue')),
  'Bill of materials':  defineAsyncComponent(() => import('~/components/pages/BillOfMaterialsIndexPage.vue')),
  'Warehouse transfers': defineAsyncComponent(() => import('~/components/pages/WarehouseTransfersPage.vue')),
  'Inbox':             defineAsyncComponent(() => import('~/components/pages/InboxPage.vue')),
  'Stock adjustments':  defineAsyncComponent(() => import('~/components/pages/StockAdjustmentsPage.vue')),
  'Cycle counts':      defineAsyncComponent(() => import('~/components/pages/StockAdjustmentsPage.vue')),
  'Stock inout':       defineAsyncComponent(() => import('~/components/pages/StockAdjustmentsPage.vue')),
  'Purchase orders':   defineAsyncComponent(() => import('~/components/pages/PurchaseOrdersPage.vue')),
  'Purchase requests': defineAsyncComponent(() => import('~/components/pages/PurchaseRequestsPage.vue')),
  'Cash management':   defineAsyncComponent(() => import('~/components/pages/CashManagementPage.vue')),
  'Company profile':    defineAsyncComponent(() => import('~/components/pages/SettingsCompanyProfilePage.vue')),
  // Settings → Data migration. Key must match the sidebar label character-for-character.
  'Data migration':     defineAsyncComponent(() => import('~/components/pages/DataMigrationPage.vue')),
  'Warehouse settings': defineAsyncComponent(() => import('~/components/pages/SettingsWarehousePage.vue')),
  // 'Mekari pay' (sentence-cased key) — /mekari-pay → pathToLabel → 'Mekari pay'.
  'Mekari pay':         defineAsyncComponent(() => import('~/components/pages/MekariPayPaywallPage.vue')),
  'Tax':                defineAsyncComponent(() => import('~/components/pages/TaxPaywallPage.vue')),
  // Reports → WMS index (four report cards). Report detail pages resolve via detailMatch.
  'Wms report':         defineAsyncComponent(() => import('~/components/pages/WmsReportsIndexPage.vue')),
  'Playground':         defineAsyncComponent(() => import('~/components/playground/PlaygroundPage.vue')),
  'Design erp':         defineAsyncComponent(() => import('~/components/pages/DesignErpDashboardPage.vue')),

  // ── XPM (Mekari Expense) scenario pages ──────────────────────────────────────
  // Registered globally like every other scenario's pages; the XPM sidebar is the
  // only thing that links here. Keys prefixed 'Xpm …' where the plain slug would
  // collide with an ERP/WMS route (Reports, Transactions, Trips, Claims, Cards,
  // Products, Warehouses, Users, Vendors, Policy, Integration). 'Home' branches by
  // scenario below; Accounts/Budgeting/My claims/My trips have collision-free slugs.
  'Xpm transactions':   defineAsyncComponent(() => import('~/components/pages/XpmTransactionsPage.vue')),
  'Accounts':           defineAsyncComponent(() => import('~/components/pages/XpmAccountsPage.vue')),
  'Budgeting':          defineAsyncComponent(() => import('~/components/pages/XpmBudgetingPage.vue')),
  'Xpm purchases':      defineAsyncComponent(() => import('~/components/pages/XpmPurchasesPage.vue')),
  'Xpm trips':          defineAsyncComponent(() => import('~/components/pages/XpmTripsPage.vue')),
  'Xpm claims':         defineAsyncComponent(() => import('~/components/pages/XpmClaimsPage.vue')),
  'Xpm cards':          defineAsyncComponent(() => import('~/components/pages/XpmCardsPage.vue')),
  'My claims':          defineAsyncComponent(() => import('~/components/pages/XpmMyClaimsPage.vue')),
  // Undesigned in the source app → faithful scaffold stand-ins.
  'Xpm reports':        defineAsyncComponent(() => import('~/components/pages/XpmPlaceholderPage.vue')),
  'Xpm products':       defineAsyncComponent(() => import('~/components/pages/XpmPlaceholderPage.vue')),
  'Xpm warehouses':     defineAsyncComponent(() => import('~/components/pages/XpmPlaceholderPage.vue')),
  'My trips':           defineAsyncComponent(() => import('~/components/pages/XpmPlaceholderPage.vue')),
  'Xpm users':          defineAsyncComponent(() => import('~/components/pages/XpmPlaceholderPage.vue')),
  'Xpm vendors':        defineAsyncComponent(() => import('~/components/pages/XpmPlaceholderPage.vue')),
  'Xpm policy':         defineAsyncComponent(() => import('~/components/pages/XpmPlaceholderPage.vue')),
  'Xpm integration':    defineAsyncComponent(() => import('~/components/pages/XpmPlaceholderPage.vue')),
}

const SalesOrderDetailsPage = asyncPage(() => import('~/components/pages/SalesOrderDetailsPage.vue'))
const SalesInvoiceDetailsPage = asyncPage(() => import('~/components/pages/SalesInvoiceDetailsPage.vue'))
const ImportWarehousesPage = asyncPage(() => import('~/components/pages/ImportWarehousesPage.vue'))
const NewWarehousePage = asyncPage(() => import('~/components/pages/NewWarehousePage.vue'))
const WarehouseDetailsPage = asyncPage(() => import('~/components/pages/WarehouseDetailsPage.vue'))
const ConfigureWarehousePage = asyncPage(() => import('~/components/pages/ConfigureWarehousePage.vue'))
const StorageLocationDetailsPage = asyncPage(() => import('~/components/pages/StorageLocationDetailsPage.vue'))
const CashManagementDetailPage = asyncPage(() => import('~/components/pages/CashManagementDetailPage.vue'))
const CreateCashAccountPage = asyncPage(() => import('~/components/pages/CreateCashAccountPage.vue'))
const CoworkTaskDetailPage = asyncPage(() => import('~/components/pages/CoworkTaskDetailPage.vue'))
const CoworkTaskEditPage = asyncPage(() => import('~/components/pages/CoworkTaskEditPage.vue'))
const CoworkSkillDetailPage = asyncPage(() => import('~/components/pages/CoworkSkillDetailPage.vue'))
const CoworkAgentFormPage = asyncPage(() => import('~/components/pages/CoworkAgentFormPage.vue'))
const CoworkAgentDetailPage = asyncPage(() => import('~/components/pages/CoworkAgentDetailPage.vue'))
const CashConnectBankPage = asyncPage(() => import('~/components/pages/CashConnectBankPage.vue'))
const InternalTransferFormPage = asyncPage(() => import('~/components/pages/InternalTransferFormPage.vue'))
const InternalTransferDetailsPage = asyncPage(() => import('~/components/pages/InternalTransferDetailsPage.vue'))
const BankStatementReviewPage = asyncPage(() => import('~/components/pages/BankStatementReviewPage.vue'))
const PlaceholderPage = asyncPage(() => import('~/components/pages/PlaceholderPage.vue'))
const BillsIndexPage = asyncPage(() => import('~/components/pages/BillsIndexPage.vue'))
const BillsAwaitingApprovalPage = asyncPage(() => import('~/components/pages/BillsAwaitingApprovalPage.vue'))
const BillsReviewFilesPage = asyncPage(() => import('~/components/pages/BillsReviewFilesPage.vue'))
const PurchaseInvoicesPage = asyncPage(() => import('~/components/pages/PurchaseInvoicesPage.vue'))
const PurchaseRequestsPage = asyncPage(() => import('~/components/pages/PurchaseRequestsPage.vue'))
const PurchaseRequestsAwaitingApprovalPage = asyncPage(() => import('~/components/pages/PurchaseRequestsAwaitingApprovalPage.vue'))
const PurchaseInvoicesAwaitingApprovalPage = asyncPage(() => import('~/components/pages/PurchaseInvoicesAwaitingApprovalPage.vue'))
const ReceiptIndexPage = asyncPage(() => import('~/components/pages/ReceiptIndexPage.vue'))
const ReceiptDetailsPage = asyncPage(() => import('~/components/pages/ReceiptDetailsPage.vue'))
const PartialReceiptDetailsPage = asyncPage(() => import('~/components/pages/PartialReceiptDetailsPage.vue'))
const CompletedReceiptDetailsPage = asyncPage(() => import('~/components/pages/CompletedReceiptDetailsPage.vue'))
const CanceledReceiptDetailsPage = asyncPage(() => import('~/components/pages/CanceledReceiptDetailsPage.vue'))
const OutgoingIndexPage = asyncPage(() => import('~/components/pages/OutgoingIndexPage.vue'))
const PickingIndexPage = asyncPage(() => import('~/components/pages/PickingIndexPage.vue'))
const PackingIndexPage = asyncPage(() => import('~/components/pages/PackingIndexPage.vue'))
const DeliveryIndexPage = asyncPage(() => import('~/components/pages/DeliveryIndexPage.vue'))
const ShippedIndexPage = asyncPage(() => import('~/components/pages/ShippedIndexPage.vue'))
const CreatePickingPage = asyncPage(() => import('~/components/pages/CreatePickingPage.vue'))
const CreatePackingPage = asyncPage(() => import('~/components/pages/CreatePackingPage.vue'))
const PickingTaskDetailsPage = asyncPage(() => import('~/components/pages/PickingTaskDetailsPage.vue'))
const PickItemsPage = asyncPage(() => import('~/components/pages/PickItemsPage.vue'))
const PackingTaskDetailsPage = asyncPage(() => import('~/components/pages/PackingTaskDetailsPage.vue'))
const PackItemsPage = asyncPage(() => import('~/components/pages/PackItemsPage.vue'))
const DeliveryTaskDetailsPage = asyncPage(() => import('~/components/pages/DeliveryTaskDetailsPage.vue'))
const HandoverToCourierPage = asyncPage(() => import('~/components/pages/HandoverToCourierPage.vue'))
const NewShipmentPage = asyncPage(() => import('~/components/pages/NewShipmentPage.vue'))
const ShipmentDetailsPage = asyncPage(() => import('~/components/pages/ShipmentDetailsPage.vue'))
const CompleteShipmentPage = asyncPage(() => import('~/components/pages/CompleteShipmentPage.vue'))
const OutgoingOrderDetailsPage = asyncPage(() => import('~/components/pages/OutgoingOrderDetailsPage.vue'))
const WarehouseTransferDetailsPage = asyncPage(() => import('~/components/pages/WarehouseTransferDetailsPage.vue'))
const WarehouseTransferFormPage = asyncPage(() => import('~/components/pages/WarehouseTransferFormPage.vue'))
const ReceivingIndexPage = asyncPage(() => import('~/components/pages/ReceivingIndexPage.vue'))
const PutAwayIndexPage = asyncPage(() => import('~/components/pages/PutAwayIndexPage.vue'))
const PartialReceptionIndexPage = asyncPage(() => import('~/components/pages/PartialReceptionIndexPage.vue'))
const CompletedReceiptIndexPage = asyncPage(() => import('~/components/pages/CompletedReceiptIndexPage.vue'))
const CanceledReceiptIndexPage = asyncPage(() => import('~/components/pages/CanceledReceiptIndexPage.vue'))
const ReceivingTaskDetailsPage = asyncPage(() => import('~/components/pages/ReceivingTaskDetailsPage.vue'))
const ReceiveItemsPage = asyncPage(() => import('~/components/pages/ReceiveItemsPage.vue'))
const CreatePurchaseReceivingPage = asyncPage(() => import('~/components/pages/CreatePurchaseReceivingPage.vue'))
const CreatePutAwayPage = asyncPage(() => import('~/components/pages/CreatePutAwayPage.vue'))
const CreateReceiptPage = asyncPage(() => import('~/components/pages/CreateReceiptPage.vue'))
const CreateDeliveryOrderPage = asyncPage(() => import('~/components/pages/CreateDeliveryOrderPage.vue'))
const PutAwayDetailsPage = asyncPage(() => import('~/components/pages/PutAwayDetailsPage.vue'))
const PutAwayItemsPage = asyncPage(() => import('~/components/pages/PutAwayItemsPage.vue'))
const CreateWorkOrderPage = asyncPage(() => import('~/components/pages/CreateWorkOrderPage.vue'))
const WorkOrderDetailsPage = asyncPage(() => import('~/components/pages/WorkOrderDetailsPage.vue'))
const BillOfMaterialsDetailsPage = asyncPage(() => import('~/components/pages/BillOfMaterialsDetailsPage.vue'))
const CreateBillOfMaterialsPage = asyncPage(() => import('~/components/pages/CreateBillOfMaterialsPage.vue'))
const ProductionRequestIndexPage = asyncPage(() => import('~/components/pages/ProductionRequestIndexPage.vue'))
const WarehouseTransfersPage = asyncPage(() => import('~/components/pages/WarehouseTransfersPage.vue'))
const StockAdjustmentsPage = asyncPage(() => import('~/components/pages/StockAdjustmentsPage.vue'))
const ProductsPage = asyncPage(() => import('~/components/pages/ProductsPage.vue'))
const ProductDetailsPage = asyncPage(() => import('~/components/pages/ProductDetailsPage.vue'))
const BatchDetailsPage = asyncPage(() => import('~/components/pages/BatchDetailsPage.vue'))
const NewProductPage = asyncPage(() => import('~/components/pages/NewProductPage.vue'))
const StockAdjustmentDetailsPage = asyncPage(() => import('~/components/pages/StockAdjustmentDetailsPage.vue'))
const StockCountFormPage = asyncPage(() => import('~/components/pages/StockCountFormPage.vue'))
const NewCountTaskPage = asyncPage(() => import('~/components/pages/NewCountTaskPage.vue'))
const StockCountingPage = asyncPage(() => import('~/components/pages/StockCountingPage.vue'))
const StockInOutFormPage = asyncPage(() => import('~/components/pages/StockInOutFormPage.vue'))
const CycleCountRecommendationPage = asyncPage(() => import('~/components/pages/CycleCountRecommendationPage.vue'))
const PurchaseOrderDetailPage = asyncPage(() => import('~/components/pages/PurchaseOrderDetailPage.vue'))
const PurchaseOrderFormPage = asyncPage(() => import('~/components/pages/PurchaseOrderFormPage.vue'))

// ── Purchase Orders overlay state (list/detail/form share the URL /purchase-orders
// without real sub-routes yet — mirrors the pattern this feature was originally
// built with; port to real routes if/when it needs deep-linking). ──────────────
const purchaseOrdersTab = ref<'all' | 'awaiting' | 'rejected'>('all')
provide('purchaseOrdersTab', purchaseOrdersTab)
const poAwaitingCount = computed(() => purchaseOrders.filter(o => o.status === 'draft').length)
const poRejectedCount = computed(() => purchaseOrders.filter(o => o.status === 'rejected').length)
const poDetailOrderId = ref<string | null>(null)
const poFormOpen = ref(false)
const poFormDuplicateId = ref<string | null>(null)
const poFormRejectionBanner = ref<{ user: string; date: string; reason?: string } | null>(null)
const poFormPrIds = ref<string[]>([])
const showPurchaseOrderDetail = computed(() => currentPageKey.value === 'Purchase orders' && !!poDetailOrderId.value && !poFormOpen.value)
const showPurchaseOrderForm   = computed(() => currentPageKey.value === 'Purchase orders' && poFormOpen.value)
provide('openPurchaseOrder',  (id: string) => { poDetailOrderId.value = id })
provide('closePurchaseOrder', ()           => { poDetailOrderId.value = null })
provide('approvePurchaseOrder', (id: string) => {
  const o = purchaseOrders.find(x => x.id === id)
  if (o) o.status = 'approved'
  poDetailOrderId.value = null
})
provide('rejectPurchaseOrder', (id: string, reason: string) => {
  const o = purchaseOrders.find(x => x.id === id)
  if (o) {
    o.status = 'rejected'
    const d = new Date()
    const day   = String(d.getDate()).padStart(2, '0')
    const month = d.toLocaleString('en-US', { month: 'short' })
    o.rejection = { user: 'You', date: `${day} ${month} ${d.getFullYear()}`, reason }
  }
})
function openNewPurchaseOrderForm() {
  poFormOpen.value = true
  poFormDuplicateId.value = null
  poFormRejectionBanner.value = null
  poFormPrIds.value = []
}
// Create a PO from one or more purchase requests — jump to Purchase orders and
// open the form pre-loaded with those requests (carried via ?fromPr so it
// survives the page-key change that would otherwise reset the form state).
provide('createPurchaseOrderFromRequests', (ids: string[]) => {
  router.push({ path: '/purchase-orders', query: { fromPr: ids.join(',') } })
})
provide('duplicatePurchaseOrder', (id: string, banner?: { user: string; date: string; reason?: string } | null) => {
  poFormOpen.value = true
  poFormDuplicateId.value = id
  poFormRejectionBanner.value = banner ?? null
})
provide('closePurchaseOrderForm', () => {
  poFormOpen.value = false; poFormDuplicateId.value = null; poFormRejectionBanner.value = null; poFormPrIds.value = []
  if (route.query.fromPr) router.replace({ query: { ...route.query, fromPr: undefined } })
})
watch(currentPageKey, () => { poDetailOrderId.value = null; poFormOpen.value = false; poFormDuplicateId.value = null; poFormRejectionBanner.value = null; poFormPrIds.value = [] })
// Open the PO form pre-loaded from purchase requests when arriving with ?fromPr
// (runs after the reset watch above, so it wins on the same navigation).
watch(() => [currentPageKey.value, route.query.fromPr] as const, ([key, fromPr]) => {
  if (key === 'Purchase orders' && fromPr) {
    poFormPrIds.value = String(fromPr).split(',').filter(Boolean)
    poFormOpen.value = true
    poFormDuplicateId.value = null
    poFormRejectionBanner.value = null
  }
}, { immediate: true })
const NewExpensePage = asyncPage(() => import('~/components/pages/NewExpensePage.vue'))
const CrmDealsPage = asyncPage(() => import('~/components/pages/CrmDealsPage.vue'))
const CrmOrdersPage = asyncPage(() => import('~/components/pages/CrmOrdersPage.vue'))
const CrmTasksPage = asyncPage(() => import('~/components/pages/CrmTasksPage.vue'))
const CrmCustomersPage = asyncPage(() => import('~/components/pages/CrmCustomersPage.vue'))
const CrmProductsPage = asyncPage(() => import('~/components/pages/CrmProductsPage.vue'))
const CrmSettingsPage = asyncPage(() => import('~/components/pages/CrmSettingsPage.vue'))
const CrmOrderDetailPage = asyncPage(() => import('~/components/pages/CrmOrderDetailPage.vue'))
const CrmProductDetailPage = asyncPage(() => import('~/components/pages/CrmProductDetailPage.vue'))
// CRM (Qontak) level-1 pages — all full-bleed, own their title bar/stage.
// There's no CRM home: the bare /crm lands directly on Deals.
const CRM_PAGES: Record<string, Component> = {
  '':          CrmDealsPage,
  'deals':     CrmDealsPage,
  'orders':    CrmOrdersPage,
  'tasks':     CrmTasksPage,
  'customers': CrmCustomersPage,
  'products':  CrmProductsPage,
  'settings':  CrmSettingsPage,
}
const NewSalesInvoicePage = asyncPage(() => import('~/components/pages/NewSalesInvoicePage.vue'))
const BillReviewPage = asyncPage(() => import('~/components/pages/BillReviewPage.vue'))
const InvoiceReviewPage = asyncPage(() => import('~/components/pages/InvoiceReviewPage.vue'))
const ReceiptReviewPage = asyncPage(() => import('~/components/pages/ReceiptReviewPage.vue'))
const UnclassifiedReviewPage = asyncPage(() => import('~/components/pages/UnclassifiedReviewPage.vue'))
const WmsOverviewPage = asyncPage(() => import('~/components/pages/WmsOverviewPage.vue'))
const WmsReportDetailPage = asyncPage(() => import('~/components/pages/WmsReportDetailPage.vue'))
const BillDetailsPage = asyncPage(() => import('~/components/pages/BillDetailsPage.vue'))
const EmployeeDetailsPage = asyncPage(() => import('~/components/pages/EmployeeDetailsPage.vue'))
const SpendMoneyPage = asyncPage(() => import('~/components/pages/SpendMoneyPage.vue'))
const WmsCutoverChartOfAccountsPage = asyncPage(() => import('~/components/pages/WmsCutoverChartOfAccountsPage.vue'))
const WmsCutoverProductsPage = asyncPage(() => import('~/components/pages/WmsCutoverProductsPage.vue'))
const WmsCutoverOpeningBalancePage = asyncPage(() => import('~/components/pages/WmsCutoverOpeningBalancePage.vue'))
const WmsPendingSetupPage = asyncPage(() => import('~/components/pages/WmsPendingSetupPage.vue'))

// ── XPM (Mekari Expense) — home branch + full-bleed detail/form pages ──────────
const XpmHomePage = defineAsyncComponent(() => import('~/components/pages/XpmHomePage.vue'))
const XpmTripDetailPage = asyncPage(() => import('~/components/pages/XpmTripDetailPage.vue'))
const XpmCardDetailPage = asyncPage(() => import('~/components/pages/XpmCardDetailPage.vue'))
const XpmClaimFormPage = asyncPage(() => import('~/components/pages/XpmClaimFormPage.vue'))
const XpmClaimDetailPage = asyncPage(() => import('~/components/pages/XpmClaimDetailPage.vue'))
// Tabbed XPM index pages read the active tab from ?tab= themselves, so every tab
// maps to the SAME component (identical ref → stays mounted, re-filters on change).
const XpmTransactionsTabPage = asyncPage(() => import('~/components/pages/XpmTransactionsPage.vue'))
const XpmCardsTabPage = asyncPage(() => import('~/components/pages/XpmCardsPage.vue'))
const XpmPurchasesTabPage = asyncPage(() => import('~/components/pages/XpmPurchasesPage.vue'))
const { activeScenario: xpmActiveScenario } = useScenario()
const { trigger: triggerXpm } = useXpmActions()

// Detail routes: /sales-orders/:id → render a full-bleed detail page (it brings
// its own title bar). Add modules here as their detail pages get built.
const detailMatch = computed<{ component: Component; id: string } | null>(() => {
  const segs = route.path.split('/').filter(Boolean)
  // /crm[/sub] → CRM (Qontak) level-1 pages. Each is full-bleed and owns its own
  // title bar + stage, so it renders outside the standard padded stage/title bar.
  if (segs[0] === 'crm') {
    const sub = segs[1] ?? ''
    const id = segs[2]
    // /crm/orders/:id and /crm/products/:id → CRM detail pages.
    if (id && sub === 'orders') return { component: CrmOrderDetailPage, id }
    if (id && sub === 'products') return { component: CrmProductDetailPage, id }
    return { component: CRM_PAGES[sub] ?? CrmDealsPage, id: sub }
  }
  // /cowork-tasks/:id → Cowork task detail page (owns its title bar + stage).
  // /cowork-tasks/:id/edit → Cowork task edit form.
  if (segs.length >= 2 && segs[0] === 'cowork-tasks') {
    if (segs[2] === 'edit') return { component: CoworkTaskEditPage, id: segs[1]! }
    return { component: CoworkTaskDetailPage, id: segs[1]! }
  }
  // /cowork-skills/:id → Cowork skill detail (actions + definition).
  if (segs.length >= 2 && segs[0] === 'cowork-skills') {
    return { component: CoworkSkillDetailPage, id: segs[1]! }
  }
  // /cowork-agents/new → create form; /cowork-agents/:id/edit → edit; /cowork-agents/:id → detail.
  if (segs.length >= 2 && segs[0] === 'cowork-agents') {
    if (segs[1] === 'new') return { component: CoworkAgentFormPage, id: 'new' }
    if (segs[2] === 'edit') return { component: CoworkAgentFormPage, id: segs[1]! }
    return { component: CoworkAgentDetailPage, id: segs[1]! }
  }
  // /wms-report/:slug → WMS report raw-data table (Reports → WMS → View report)
  if (segs.length >= 2 && segs[0] === 'wms-report') {
    return { component: WmsReportDetailPage, id: segs[1]! }
  }
  // /data-migration/wms-cutover/:step → the WMS→Jurnal cutover setup screens.
  // Full-bleed form pages (own title bar + stage); the bare index falls through
  // to the registry's 'Data migration' landing.
  if (segs.length >= 3 && segs[0] === 'data-migration' && segs[1] === 'wms-cutover') {
    if (segs[2] === 'chart-of-accounts') return { component: WmsCutoverChartOfAccountsPage, id: 'chart-of-accounts' }
    if (segs[2] === 'opening-balance') return { component: WmsCutoverOpeningBalancePage, id: 'opening-balance' }
    if (segs[2] === 'pending') return { component: WmsPendingSetupPage, id: 'pending' }
    return { component: WmsCutoverProductsPage, id: 'products' }
  }
  // /expenses/new → New expense form (full page, brings its own title bar)
  if (segs.length >= 2 && segs[0] === 'expenses' && segs[1] === 'new') {
    return { component: NewExpensePage, id: 'new' }
  }
  // OCR file review ("File review N of M"). The same run is reachable from both
  // Expenses and Purchase invoices; the route prefix decides which queue is
  // being worked through (see useReviewQueue) and the file's own classification
  // decides which form renders.
  if (segs.length >= 3 && segs[1] === 'review' && (segs[0] === 'expenses' || segs[0] === 'purchase-invoices')) {
    const id = segs[2]!
    const queue = segs[0] === 'purchase-invoices' ? purchaseInvoiceReviewFiles : reviewFiles
    const classification = queue.find((rf) => rf.id === id)?.classification ?? 'bill'
    const component =
      classification === 'invoice'      ? InvoiceReviewPage
      : classification === 'receipt'      ? ReceiptReviewPage
      : classification === 'unclassified' ? UnclassifiedReviewPage
      : BillReviewPage
    return { component, id }
  }
  // /expenses/:id/payment → "Add payment" form for that unpaid bill (New spend money)
  if (segs.length >= 3 && segs[0] === 'expenses' && segs[2] === 'payment') {
    return { component: SpendMoneyPage, id: segs[1]! }
  }
  // /expenses/:id/edit → New expense form in edit mode (reuses the create form)
  if (segs.length >= 3 && segs[0] === 'expenses' && segs[2] === 'edit') {
    return { component: NewExpensePage, id: segs[1]! }
  }
  // /expenses/:id/payment-details → the payment (Spend money) transaction detail.
  // Reached by clicking the Number in the bill's Payment details table. Design is
  // still pending → placeholder for now.
  if (segs.length >= 3 && segs[0] === 'expenses' && segs[2] === 'payment-details') {
    return { component: PlaceholderPage, id: segs[1]! }
  }
  // /expenses/:id → bill/expense detail page
  if (segs.length >= 2 && segs[0] === 'expenses') {
    return { component: BillDetailsPage, id: segs[1]! }
  }
  // /cash-management/review/:id → OCR review for an imported bank statement
  if (segs.length >= 3 && segs[0] === 'cash-management' && segs[1] === 'review') {
    return { component: BankStatementReviewPage, id: segs[2]! }
  }
  // /cash-management/new → create a new cash/bank/card account (full page)
  if (segs.length >= 2 && segs[0] === 'cash-management' && segs[1] === 'new') {
    return { component: CreateCashAccountPage, id: 'new' }
  }
  // /cash-management/internal-transfer[...] → Internal transfer create/edit/duplicate/detail
  if (segs.length >= 2 && segs[0] === 'cash-management' && segs[1] === 'internal-transfer') {
    if (segs.length === 2) return { component: InternalTransferFormPage, id: 'new' }                                // create
    if (segs.length >= 4 && (segs[3] === 'edit' || segs[3] === 'duplicate')) return { component: InternalTransferFormPage, id: segs[2]! } // edit / duplicate
    return { component: InternalTransferDetailsPage, id: segs[2]! }                                                 // :id detail
  }
  // /cash-management/:id/edit → edit an existing account (must precede the :id detail branch)
  if (segs.length >= 3 && segs[0] === 'cash-management' && segs[2] === 'edit') {
    return { component: CreateCashAccountPage, id: segs[1]! }
  }
  // /cash-management/:id/connect → Connect to bank (Bank connection) flow
  if (segs.length >= 3 && segs[0] === 'cash-management' && segs[2] === 'connect') {
    return { component: CashConnectBankPage, id: segs[1]! }
  }
  // /cash-management/:id → account detail page (balances, statement, transactions)
  if (segs.length >= 2 && segs[0] === 'cash-management') {
    return { component: CashManagementDetailPage, id: segs[1]! }
  }
  // /work-orders/new → create a new work order (full page, brings its own title bar)
  if (segs.length >= 2 && segs[0] === 'work-orders' && segs[1] === 'new') {
    return { component: CreateWorkOrderPage, id: 'new' }
  }
  // /work-orders/:id → work order detail (read-only, status-aware)
  if (segs.length >= 2 && segs[0] === 'work-orders') {
    return { component: WorkOrderDetailsPage, id: segs[1] }
  }
  // /bill-of-materials/new → create form; /:id → BOM detail.
  // The bare index falls through to the registry.
  if (segs.length >= 2 && segs[0] === 'bill-of-materials') {
    if (segs[1] === 'new') return { component: CreateBillOfMaterialsPage, id: 'new' }
    return { component: BillOfMaterialsDetailsPage, id: segs[1]! }
  }
  // /warehouse-transfers/:id → detail page. /new and /:id/edit are the create/edit
  // forms (not built yet → placeholder). The bare index falls through to the registry.
  if (segs.length >= 2 && segs[0] === 'warehouse-transfers') {
    if (segs[1] === 'new') return { component: WarehouseTransferFormPage, id: 'new' }
    if (segs[2] === 'edit') return { component: WarehouseTransferFormPage, id: segs[1]! }
    return { component: WarehouseTransferDetailsPage, id: segs[1]! }
  }
  // /cycle-counts/new → dedicated count-task creation page (not the shared stock-count form)
  if (segs.length >= 2 && segs[0] === 'cycle-counts' && segs[1] === 'new') {
    return { component: NewCountTaskPage, id: 'new' }
  }
  // /cycle-counts/:id → detail; /:id/count → counting flow; /:id/edit → edit (TBD → placeholder).
  // Cycle count tasks live at their own URL (not /stock-adjustments/:id) so the sidebar
  // and breadcrumb reflect where they actually belong.
  if (segs.length >= 2 && segs[0] === 'cycle-counts' && segs[1] !== 'new') {
    if (segs.length >= 3 && segs[2] === 'count') return { component: StockCountingPage, id: segs[1]! }
    if (segs[2] === 'edit') return { component: PlaceholderPage, id: segs[1]! }
    return { component: StockAdjustmentDetailsPage, id: segs[1]! }
  }
  // /stock-adjustments/:id → detail; /new & /:id/edit → create/edit form (TBD → placeholder)
  if (segs.length >= 2 && segs[0] === 'stock-adjustments') {
    if (segs[1] === 'new') {
      return route.query.type === 'in-out'
        ? { component: StockInOutFormPage, id: 'new' }
        : { component: StockCountFormPage, id: 'new' }
    }
    if (segs.length >= 3 && segs[2] === 'count') return { component: StockCountingPage, id: segs[1]! }
    if (segs[2] === 'edit') return { component: PlaceholderPage, id: segs[1]! }
    return { component: StockAdjustmentDetailsPage, id: segs[1]! }
  }
  // /outbound-delivery/picking/create → create a new picking list (bundles sales orders)
  if (segs.length >= 3 && segs[0] === 'outbound-delivery' && segs[1] === 'picking' && segs[2] === 'create') {
    return { component: CreatePickingPage, id: 'create' }
  }
  // /outbound-delivery/packing/create → create packing tasks from a completed picking task
  if (segs.length >= 3 && segs[0] === 'outbound-delivery' && segs[1] === 'packing' && segs[2] === 'create') {
    return { component: CreatePackingPage, id: 'create' }
  }
  // /outbound-delivery/handover/create → bulk handover several ready-to-ship deliveries
  if (segs.length >= 3 && segs[0] === 'outbound-delivery' && segs[1] === 'handover' && segs[2] === 'create') {
    return { component: HandoverToCourierPage, id: 'create' }
  }
  // /outbound-delivery/new-shipment/create → build a shipment by scanning packing nos.
  if (segs.length >= 3 && segs[0] === 'outbound-delivery' && segs[1] === 'new-shipment' && segs[2] === 'create') {
    return { component: NewShipmentPage, id: 'create' }
  }
  // /outbound-delivery/shipment/:seq/complete → Complete shipment (proof-of-delivery) form page
  if (segs.length >= 4 && segs[0] === 'outbound-delivery' && segs[1] === 'shipment' && segs[3] === 'complete') {
    return { component: CompleteShipmentPage, id: segs[2]! }
  }
  // /outbound-delivery/shipment/:seq → a saved shipment batch's details (Print PDF lives here)
  if (segs.length >= 3 && segs[0] === 'outbound-delivery' && segs[1] === 'shipment') {
    return { component: ShipmentDetailsPage, id: segs[2]! }
  }
  // /outbound-delivery/:id/edit → edit the outbound order (reuses the create form in edit mode)
  if (segs.length >= 3 && segs[0] === 'outbound-delivery' && segs[2] === 'edit') {
    return { component: CreateDeliveryOrderPage, id: segs[1] }
  }
  // /outbound-delivery/:id → outgoing sales order detail (not the picking/packing/handover/shipment sub-routes)
  if (segs.length >= 2 && segs[0] === 'outbound-delivery' && segs[1] !== 'picking' && segs[1] !== 'packing' && segs[1] !== 'handover' && segs[1] !== 'new-shipment' && segs[1] !== 'shipment' && segs[1] !== 'new') {
    return { component: OutgoingOrderDetailsPage, id: segs[1] }
  }
  // /picking/:taskId/pick → operator picks items from bins
  if (segs.length >= 3 && segs[0] === 'picking' && segs[2] === 'pick') {
    return { component: PickItemsPage, id: segs[1] }
  }
  // /picking/:taskId → picking task detail
  if (segs.length >= 2 && segs[0] === 'picking') {
    return { component: PickingTaskDetailsPage, id: segs[1] }
  }
  // /packing/:taskId/pack → operator matches/packs the order
  if (segs.length >= 3 && segs[0] === 'packing' && segs[2] === 'pack') {
    return { component: PackItemsPage, id: segs[1] }
  }
  // /packing/:taskId → packing task detail
  if (segs.length >= 2 && segs[0] === 'packing') {
    return { component: PackingTaskDetailsPage, id: segs[1] }
  }
  // /delivery/:taskId → delivery (shipment) detail
  if (segs.length >= 2 && segs[0] === 'delivery') {
    return { component: DeliveryTaskDetailsPage, id: segs[1] }
  }
  if (segs.length >= 2 && segs[0] === 'sales-orders') {
    return { component: SalesOrderDetailsPage, id: segs[1] }
  }
  // /sales-invoices/new → New sales invoice form (must precede the :id match)
  if (segs.length >= 2 && segs[0] === 'sales-invoices' && segs[1] === 'new') {
    return { component: NewSalesInvoicePage, id: 'new' }
  }
  // /sales-invoices/:id → sales invoice detail
  if (segs.length >= 2 && segs[0] === 'sales-invoices') {
    return { component: SalesInvoiceDetailsPage, id: segs[1] }
  }
  if (segs.length >= 2 && segs[0] === 'product-list' && segs[1] === 'new') {
    return { component: NewProductPage, id: 'new' }
  }
  // /product-list/:sku/edit → reuse the product form in edit mode
  if (segs.length >= 3 && segs[0] === 'product-list' && segs[2] === 'edit') {
    return { component: NewProductPage, id: segs[1]! }
  }
  // /product-list/:sku/batches/:batchNo → batch detail (a batch-tracked product's
  // "Stock by batches" tab row); id is "sku::batchNo", same convention as the
  // warehouse/location nested route below. batchNo (e.g. "Batch #001") is
  // encodeURIComponent'd by the caller since "#" would otherwise start a URL
  // fragment — decode it back here.
  if (segs.length >= 4 && segs[0] === 'product-list' && segs[2] === 'batches') {
    return { component: BatchDetailsPage, id: `${segs[1]}::${decodeURIComponent(segs[3]!)}` }
  }
  // /warehouses/:whId/batches/:sku/:batchNo → warehouse-scoped batch detail (same
  // BatchDetailsPage, stays under /warehouses; id encodes the warehouse context).
  if (segs.length >= 5 && segs[0] === 'warehouses' && segs[2] === 'batches') {
    return { component: BatchDetailsPage, id: `${segs[1]}::${segs[3]}::${decodeURIComponent(segs[4]!)}` }
  }
  // /product-list/:sku → product detail
  if (segs.length >= 2 && segs[0] === 'product-list') {
    return { component: ProductDetailsPage, id: segs[1] }
  }
  // /inbound-delivery/:id → inbound PO detail (kept under the section path so the
  // level-2 sidebar submenu stays active, like /sales-orders/:id).
  // /receiving/:taskId → task detail; "Receiving" resolves as Inbound delivery panel sub-item
  // so the level-2 sidebar panel stays open with "Receiving" highlighted.
  if (segs.length >= 3 && segs[0] === 'receiving' && segs[2] === 'receive') {
    return { component: ReceiveItemsPage, id: segs[1] }
  }
  if (segs.length >= 2 && segs[0] === 'receiving') {
    return { component: ReceivingTaskDetailsPage, id: segs[1] }
  }
  if (segs.length >= 3 && segs[0] === 'put-away' && segs[2] === 'store') {
    return { component: PutAwayItemsPage, id: segs[1] }
  }
  if (segs.length >= 2 && segs[0] === 'put-away') {
    return { component: PutAwayDetailsPage, id: segs[1] }
  }
  // /inbound-delivery/put-away/create → create put-away task form
  if (segs.length >= 3 && segs[0] === 'inbound-delivery' && segs[1] === 'put-away' && segs[2] === 'create') {
    return { component: CreatePutAwayPage, id: 'create' }
  }
  // /inbound-delivery/new → create inbound receipt (PO) form
  if (segs.length >= 2 && segs[0] === 'inbound-delivery' && segs[1] === 'new') {
    return { component: CreateReceiptPage, id: 'new' }
  }
  // /outbound-delivery/new → create outbound delivery order form
  if (segs.length >= 2 && segs[0] === 'outbound-delivery' && segs[1] === 'new') {
    return { component: CreateDeliveryOrderPage, id: 'new' }
  }
  // /inbound-delivery/:id/receive → create purchase receiving (full page, not a modal)
  if (segs.length >= 3 && segs[0] === 'inbound-delivery' && segs[2] === 'receive') {
    return { component: CreatePurchaseReceivingPage, id: segs[1] }
  }
  // /inbound-delivery/:id/edit → edit the PO (reuses the create form in edit mode)
  if (segs.length >= 3 && segs[0] === 'inbound-delivery' && segs[2] === 'edit') {
    return { component: CreateReceiptPage, id: segs[1] }
  }
  if (segs.length >= 2 && segs[0] === 'inbound-delivery') {
    const r = receipts.find((x) => x.id === segs[1])
    let component = ReceiptDetailsPage
    if (r?.status === 'partial reception') component = PartialReceiptDetailsPage
    else if (r?.status === 'completed') component = CompletedReceiptDetailsPage
    else if (r?.status === 'canceled') component = CanceledReceiptDetailsPage
    return { component, id: segs[1] }
  }
  if (segs.length >= 2 && segs[0] === 'warehouses' && segs[1] === 'import') {
    return { component: ImportWarehousesPage, id: 'import' }
  }
  if (segs.length >= 2 && segs[0] === 'warehouses' && segs[1] === 'new') {
    return { component: NewWarehousePage, id: 'new' }
  }
  // /warehouses/:id/edit → reuse the warehouse form in edit mode
  if (segs.length >= 3 && segs[0] === 'warehouses' && segs[2] === 'edit') {
    return { component: NewWarehousePage, id: segs[1]! }
  }
  // /warehouses/:id/configure → per-warehouse configuration (placeholder)
  if (segs.length >= 3 && segs[0] === 'warehouses' && segs[2] === 'configure') {
    return { component: ConfigureWarehousePage, id: segs[1]! }
  }
  // /warehouses/:whId/locations/:locId → storage location detail
  if (segs.length >= 4 && segs[0] === 'warehouses' && segs[2] === 'locations') {
    return { component: StorageLocationDetailsPage, id: `${segs[1]}::${segs[3]}` }
  }
  // /warehouses/:id (any segment other than the reserved sub-routes) → detail page
  if (segs.length >= 2 && segs[0] === 'warehouses' && !['new', 'import'].includes(segs[1])) {
    return { component: WarehouseDetailsPage, id: segs[1] }
  }
  // /employee-directory/:id → employee profile; /new & /:id/edit are the create/edit
  // forms (not built yet → placeholder). The bare index falls through to the registry.
  if (segs.length >= 2 && segs[0] === 'employee-directory') {
    if (segs[1] === 'new') return { component: PlaceholderPage, id: 'new' }
    if (segs[2] === 'edit') return { component: PlaceholderPage, id: segs[1]! }
    return { component: EmployeeDetailsPage, id: segs[1]! }
  }
  // ── XPM (Mekari Expense) detail / form routes ────────────────────────────────
  // /xpm-trips/:code → trip detail (owns its title bar).
  if (segs.length >= 2 && segs[0] === 'xpm-trips') {
    return { component: XpmTripDetailPage, id: segs[1]! }
  }
  // /xpm-cards/:id → card detail.
  if (segs.length >= 2 && segs[0] === 'xpm-cards') {
    return { component: XpmCardDetailPage, id: segs[1]! }
  }
  // /my-claims/create → request claim form; /my-claims/:id → claim detail;
  // /my-claims/:id/edit → edit claim (reuses the form in edit mode).
  if (segs.length >= 2 && segs[0] === 'my-claims') {
    if (segs[1] === 'create') return { component: XpmClaimFormPage, id: 'new' }
    if (segs[2] === 'edit') return { component: XpmClaimFormPage, id: segs[1]! }
    return { component: XpmClaimDetailPage, id: segs[1]! }
  }
  return null
})

const currentComponent = computed<Component>(() => {
  // Home ('/') is shared across scenarios by URL; render the Expense home when the
  // XPM scenario is active (same flush-top stage treatment as the ERP/HR home).
  if (currentPageKey.value === 'Home' && xpmActiveScenario.value === 'XPM') return XpmHomePage
  return pageRegistry[currentPageKey.value] ?? PlaceholderPage
})

// Pages that show a status tab bar below the title (outside the stage). Keyed by
// page label (currentPageKey). Add an entry to give a page its own tabs.
const pageTabs: Record<string, string[]> = {
  // WMS analytics — Inbound/Outbound as page tabs (outside the stage). Reached in ERP
  // via Dashboard › WMS analytics (/wms-analytics → key 'Wms analytics'); in WMS
  // Standalone it IS the Dashboard page (key 'Dashboard').
  'Wms analytics':     ['Inbound delivery', 'Outbound delivery'],
  'Dashboard':         ['Inbound delivery', 'Outbound delivery'],
  'Outbound delivery': ['Requests', 'Picking', 'Packing', 'Ready to ship', 'Shipments'],
  'Inbound delivery': ['Receipts', 'Receiving', 'Put-away'],
  'Warehouse transfers': ['All warehouse transfers', 'Awaiting approval'],
  'Expenses': ['Bills', 'Awaiting Approval', 'Review files'],
  'Purchase invoices': ['All purchase invoices', 'Awaiting Approval', 'Review files'],
  'Purchase requests': ['All requests', 'Awaiting approval'],
  'Stock adjustments': ['All stock adjustments', 'Awaiting approval'],
  'Production request': ['Awaiting', 'Completed', 'Rejected'],
  'Cycle counts':      ['Count task', 'Awaiting approval', 'Recommendations'],
  'Product list':      ['All products', 'Awaiting approval'],
  // XPM (Mekari Expense) — section tabs read by the page via ?tab=.
  'Xpm transactions':  ['All', 'Card', 'Reimbursement', 'Cash advance', 'Bill', 'Travel'],
  'Xpm cards':         ['Virtual cards', 'Physical cards'],
  'Xpm purchases':     ['Invoice', 'Order', 'Quote', 'Request'],
}
// Per-tab count badges — derived live from the data so they match the table.
// The Receipts tab badges the default-visible (actionable) receipts: Pending +
// Open + In progress + Partial reception (Completed / Canceled are terminal,
// hidden by default).
//
// Scoped to whatever warehouse(s) the currently-visible tab's own "Warehouse"
// filter is set to (activeWarehouseFilter, mirrored up by each index page) —
// every sibling badge in the same section follows it too, since only one tab's
// page is ever mounted at a time and filtering one is filtering the section.
const activeWarehouseFilter = useActiveWarehouseFilter()
// Cycle counts' Recommendations tab has its own single-warehouse selector.
const { warehouseId: recommendationWarehouseId } = useRecommendationWarehouse()
const currentTabCounts = computed<Record<string, number>>(() => {
  const wh = activeWarehouseFilter.value
  // WMS Overview tabs (Inbound / Outbound delivery) show no count badge.
  if (currentPageKey.value === 'Overview') return {}
  if (currentPageKey.value === 'Inbound delivery') {
    const counts = receiptCountsByStage(wh)
    const out: Record<string, number> = {}
    const receipts = (counts['Pending'] ?? 0) + (counts['Open'] ?? 0) + (counts['In progress'] ?? 0) + (counts['Partial reception'] ?? 0)
    if (receipts) out['Receipts'] = receipts
    // Receiving / Put-away are task-based (a different dataset than the PO stages)
    const recv = receivingOpenCount(wh)
    if (recv) out['Receiving'] = recv
    const putaway = putAwayOpenCount(wh)
    if (putaway) out['Put-away'] = putaway
    return out
  }
  if (currentPageKey.value === 'Outbound delivery') {
    const out: Record<string, number> = {}
    // Outgoing badges the actionable orders: everything not yet Completed/Canceled.
    const outgoing = outgoingOpenCount(wh)
    if (outgoing) out['Requests'] = outgoing
    // Picking / Packing / Ready to ship are task-based (a different dataset than the orders)
    const picking = pickingOpenCount(wh)
    if (picking) out['Picking'] = picking
    const packing = packingOpenCount(wh)
    if (packing) out['Packing'] = packing
    const delivery = deliveryOpenCount(wh)
    if (delivery) out['Ready to ship'] = delivery
    return out
  }
  if (currentPageKey.value === 'Warehouse transfers') {
    const awaiting = awaitingApprovalCount()
    return awaiting ? { 'Awaiting approval': awaiting } : {}
  }
  if (currentPageKey.value === 'Expenses') {
    const out: Record<string, number> = {}
    if (bills.length) out['Awaiting Approval'] = bills.length
    if (reviewFiles.length) out['Review files'] = reviewFiles.length
    return out
  }
  if (currentPageKey.value === 'Purchase invoices') {
    const out: Record<string, number> = {}
    if (purchaseInvoices.length) out['Awaiting Approval'] = purchaseInvoices.length
    if (purchaseInvoiceReviewFiles.length) out['Review files'] = purchaseInvoiceReviewFiles.length
    return out
  }
  if (currentPageKey.value === 'Purchase requests') {
    const awaiting = awaitingPurchaseRequestCount()
    return awaiting ? { 'Awaiting approval': awaiting } : {}
  }
  if (currentPageKey.value === 'Stock adjustments') {
    const awaiting = awaitingAdjustmentCount()
    return awaiting ? { 'Awaiting approval': awaiting } : {}
  }
  if (currentPageKey.value === 'Production request') {
    const pending = productionRequestPendingCount()
    return pending ? { 'Awaiting': pending } : {}
  }
  if (currentPageKey.value === 'Cycle counts') {
    const out: Record<string, number> = {}
    const openTasks = openWmsCountTaskCount()
    if (openTasks) out['Count task'] = openTasks
    const awaiting = awaitingWmsCountApprovalCount()
    if (awaiting) out['Awaiting approval'] = awaiting
    // Scoped to the one warehouse the Recommendations tab is showing.
    const recommendations = recommendationCount(recommendationWarehouseId.value)
    if (recommendations) out['Recommendations'] = recommendations
    return out
  }
  if (currentPageKey.value === 'Product list') {
    const awaiting = pendingApprovalCount()
    return awaiting ? { 'Awaiting approval': awaiting } : {}
  }
  return {}
})

// Single-warehouse-scoped users (WMS Ops / Ops 2) don't see a tab for a stage
// that's disabled for their active warehouse (see ConfigureWarehousePage.vue).
// Multi-warehouse views (ERP/WMS Standalone) keep every tab — a disabled
// warehouse's tasks just never appear in it, no need to hide the tab itself.
const { hasWarehouseContext, activeWarehouse } = useWarehouseContext()
const { activeScenario } = useScenario()
const currentTabs = computed<string[]>(() => {
  const tabs = pageTabs[currentPageKey.value] ?? []
  const config = (hasWarehouseContext.value && activeWarehouse.value) ? getWarehouseConfig(activeWarehouse.value.id) : null
  return tabs.filter((tab) => {
    if (config) {
      if (currentPageKey.value === 'Inbound delivery' && tab === 'Put-away') return config.putAwayEnabled
      if (currentPageKey.value === 'Outbound delivery' && tab === 'Picking') return config.pickingEnabled
    }
    // WMS doesn't deal in the ERP-side product approval workflow.
    if (currentPageKey.value === 'Product list' && tab === 'Awaiting approval') return activeScenario.value === 'ERP'
    return true
  })
})
// Tab display labels — the tab key stays the internal id (URL query, page
// registry, counts, navigation), only the visible text differs. Outbound's
// "Ready to ship" tab actually holds shipping tasks across several statuses (ready
// to ship being just one of them), so it reads as "Shipping"; the shipment docs
// tab reads as "Shipping documents".
const TAB_LABELS: Record<string, string> = {
  'Ready to ship': 'Shipping',
  'Shipments': 'Shipping documents',
}
function tabLabel(tab: string): string { return t(TAB_LABELS[tab] ?? tab) }

const activeTab = ref('')
watch([currentPageKey, () => route.query.tab, detailMatch], () => {
  // Detail routes (e.g. /stock-adjustments/:id) render via `detailMatch`, bypassing
  // the tab bar entirely — don't stamp a `?tab=` query onto them just because their
  // first URL segment happens to match an index page that has tabs (e.g. a WMS
  // Cycle count detail sharing the /stock-adjustments/:id prefix with ERP records).
  if (detailMatch.value) return
  const tabs = currentTabs.value
  const queryTab = route.query.tab as string | undefined
  const resolved = (queryTab && tabs.includes(queryTab)) ? queryTab : (tabs[0] ?? '')
  activeTab.value = resolved
  // Keep the active tab in the URL (?tab=) so it's a distinct "view" — this is
  // what lets proto-review scope comments per tab, and makes tabs deep-linkable.
  if (resolved && route.query.tab !== resolved) {
    router.replace({ query: { ...route.query, tab: resolved } })
  }
}, { immediate: true })

// Tab-bar click: drive the tab through the URL (the watch above syncs activeTab).
function selectTab(tab: string) {
  if (route.query.tab === tab) return
  router.push({ query: { ...route.query, tab } })
}

// Daily banner (Cycle counts index, Count task tab only) — top 3 recommended
// product names, only shown once the Recommendations tab actually has SKUs
// flagged for counting.
const cycleCountBannerNames = computed(() => topRecommendedProductNames(3))
const cycleCountBannerVisible = computed(() =>
  currentPageKey.value === 'Cycle counts' && activeTab.value === 'Count task' && cycleCountBannerNames.value.length > 0,
)

// Real component to render in the stage for a given page + tab (else placeholder).
// WMS analytics — one page, direction per tab. Shared by the ERP "WMS analytics"
// page and the WMS Standalone "Dashboard" page.
const wmsOverviewTabComponents: Record<string, Component> = {
  'Inbound delivery':  () => h(WmsOverviewPage, { direction: 'inbound' }),
  'Outbound delivery': () => h(WmsOverviewPage, { direction: 'outbound' }),
}
const tabComponents: Record<string, Record<string, Component>> = {
  'Wms analytics': wmsOverviewTabComponents,
  'Dashboard':     wmsOverviewTabComponents,
  'Inbound delivery': {
    'Receipts': ReceiptIndexPage,
    'Receiving': ReceivingIndexPage,
    'Put-away': PutAwayIndexPage,
  },
  'Outbound delivery': {
    'Requests': OutgoingIndexPage,
    'Picking': PickingIndexPage,
    'Packing': PackingIndexPage,
    'Ready to ship': DeliveryIndexPage,
    'Shipments': ShippedIndexPage,
  },
  'Warehouse transfers': {
    'All warehouse transfers': WarehouseTransfersPage,
    'Awaiting approval': WarehouseTransfersPage,
  },
  'Expenses': {
    'Bills': BillsIndexPage,
    'Awaiting Approval': BillsAwaitingApprovalPage,
    'Review files': BillsReviewFilesPage,
  },
  // Purchase invoices reuses the same review-files table over its own queue —
  // the `surface` prop swaps both the data and the review route.
  'Purchase invoices': {
    'All purchase invoices': PurchaseInvoicesPage,
    'Awaiting Approval': PurchaseInvoicesAwaitingApprovalPage,
    'Review files': () => h(BillsReviewFilesPage, { surface: 'purchase-invoices' }),
  },
  // Awaiting approval reuses the Expenses approval-queue table (Approve button +
  // task/comment icons), context-adapted to purchase requests.
  'Purchase requests': {
    'All requests': PurchaseRequestsPage,
    'Awaiting approval': PurchaseRequestsAwaitingApprovalPage,
  },
  'Stock adjustments': {
    'All stock adjustments': StockAdjustmentsPage,
    'Awaiting approval': StockAdjustmentsPage,
  },
  // One shared component drives all three tabs; the tab is passed as a prop.
  'Production request': {
    'Awaiting':  () => h(ProductionRequestIndexPage, { tab: 'pending' }),
    'Completed': () => h(ProductionRequestIndexPage, { tab: 'completed' }),
    'Rejected':  () => h(ProductionRequestIndexPage, { tab: 'rejected' }),
  },
  'Cycle counts': {
    'Count task': StockAdjustmentsPage,
    'Awaiting approval': StockAdjustmentsPage,
    'Recommendations': CycleCountRecommendationPage,
  },
  'Product list': {
    'All products': ProductsPage,
    'Awaiting approval': ProductsPage,
  },
  // XPM (Mekari Expense) — each tab renders the same page; the page filters by ?tab=.
  'Xpm transactions': {
    'All': XpmTransactionsTabPage, 'Card': XpmTransactionsTabPage, 'Reimbursement': XpmTransactionsTabPage,
    'Cash advance': XpmTransactionsTabPage, 'Bill': XpmTransactionsTabPage, 'Travel': XpmTransactionsTabPage,
  },
  'Xpm cards': {
    'Virtual cards': XpmCardsTabPage, 'Physical cards': XpmCardsTabPage,
  },
  'Xpm purchases': {
    'Invoice': XpmPurchasesTabPage, 'Order': XpmPurchasesTabPage, 'Quote': XpmPurchasesTabPage, 'Request': XpmPurchasesTabPage,
  },
}
const activeTabComponent = computed<Component | null>(
  () => tabComponents[currentPageKey.value]?.[activeTab.value] ?? null,
)

// New PO / Import buttons — POs are manually created from the WMS module (→ Draft),
// so these show only in WMS Standalone, on Inbound delivery pages.
const BARANG_MASUK_PAGES = [
  'Inbound delivery', 'Draft', 'On the way', 'Receiving', 'Partial reception', 'Inbound completed', 'Canceled',
]
const showNewPurchaseOrder = computed(() =>
  activeScenario.value === 'WMS Standalone' && BARANG_MASUK_PAGES.includes(currentPageKey.value),
)

// "New warehouse transfer" shows on the Warehouse transfers page in both
// scenarios that carry that page in their nav — ERP and WMS Standalone (WMS
// Standalone mirrors the ERP module onto the same /warehouse-transfers page).
const showNewWarehouseTransfer = computed(() =>
  (activeScenario.value === 'ERP' || activeScenario.value === 'WMS Standalone') &&
  currentPageKey.value === 'Warehouse transfers',
)
function newWarehouseTransfer() { router.push('/warehouse-transfers/new') }
function newExpense() { router.push('/expenses/new') }
function newSalesInvoice() { router.push('/sales-invoices/new') }
function newEmployee() { router.push('/employee-directory/new') }
// Import dropdown: add new employees from a file, or bulk-update existing records.
function importEmployees(mode: 'add' | 'update') {
  infoToast(`${mode === 'update' ? 'Update employee data' : 'Import employees'} — coming soon`)
}

// ── Airene panel open/close ───────────────────────────────────────────────
// State lives in the module-level bridge singleton so the panel stays open and
// the conversation is preserved when the user navigates between modules.
const aireneBridge = useAireneBridge()
const aireneOpen = aireneBridge.isOpen
function toggleAirene() { aireneOpen.value = !aireneOpen.value }
provide('toggleAirene', toggleAirene)
provide('aireneOpen', aireneOpen)

// ── Couriers: "Add courier" lives here in the title bar, but its modal state
// lives in CouriersPage.vue — signal it to open, same mechanism as toggleAirene.
const courierAddSignal = ref(0)
provide('courierAddSignal', courierAddSignal)

// ── Import dropdown ───────────────────────────────────────────────────────
const importDropdownOpen = ref(false)
const importBtnWrapEl = ref<HTMLElement | null>(null)

function onImportOutsideClick(e: MouseEvent) {
  if (!importBtnWrapEl.value?.contains(e.target as Node)) {
    importDropdownOpen.value = false
  }
}

// "Upload bills" (Import dropdown, Expenses) — drops each file into the Review
// files table as a processing row (see addProcessingReviewFile), same entry
// point as the dropzone card on the Review files tab itself.
const uploadBillsInputEl = ref<HTMLInputElement | null>(null)
function openUploadBills() {
  importDropdownOpen.value = false
  uploadBillsInputEl.value?.click()
}
function onUploadBillsChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  if (input.files) {
    for (const f of Array.from(input.files)) addProcessingReviewFile(f.name)
    selectTab('Review files')
  }
  input.value = ''
}

// ── Stock adjustments "Actions" dropdown (page title) ─────────────────────
const stockActionsOpen = ref(false)
const stockActionsWrapEl = ref<HTMLElement | null>(null)
function onStockActionsOutsideClick(e: MouseEvent) {
  if (!stockActionsWrapEl.value?.contains(e.target as Node)) {
    stockActionsOpen.value = false
  }
}
function newStockAdjustment(kind: 'count' | 'in-out') {
  stockActionsOpen.value = false
  router.push({ path: '/stock-adjustments/new', query: { type: kind } })
}
function newStockInOut()  { router.push({ path: '/stock-adjustments/new', query: { type: 'in-out' } }) }

// ── Chat sessions + history ───────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number   // timestamp ms
  module?: string     // which ERP module the chat started in (for the history label)
}
// The chat currently shown; upserted into the persisted history on every reply so
// it can be reopened from any module. null = a brand-new, not-yet-saved chat.
// Hoisted to the bridge singleton so it survives navigation.
const activeSessionId = aireneBridge.activeSessionId

// Seed historical sessions (relative to real Date.now())
const DAY = 86_400_000
const CHAT_SEED: ChatSession[] = [
  {
    id: 'h1',
    title: 'Draft a WhatsApp reminder for Daily Grind',
    messages: [
      { role: 'user',      text: 'Draft a WhatsApp reminder in a friendly tone.' },
      { role: 'assistant', text: 'Sure! Here\'s a friendly draft:\n\n"Hi The Daily Grind team! 👋 Invoice #40030 for Rp4,500,000 was due 2 days ago. No worries — pay here: [link]. Thanks! 😊"\n\n---\nShall I send this to Jenny now?' },
    ],
    createdAt: Date.now() - DAY * 1,
  },
  {
    id: 'h2',
    title: 'How much am I owed?',
    messages: [
      { role: 'user',      text: 'How much am I owed?' },
      { role: 'assistant', text: 'Based on your open invoices, you are currently owed Rp 640,200,000 across 12 unpaid invoices.' },
    ],
    createdAt: Date.now() - DAY * 2,
  },
  {
    id: 'h3',
    title: 'Compare revenue this month vs last month',
    messages: [
      { role: 'user',      text: 'Compare revenue this month vs last month' },
      { role: 'assistant', text: 'This month: Rp 310,500,000\nLast month: Rp 275,200,000\n\nThat\'s a +12.8% increase. Great momentum! 🚀' },
    ],
    createdAt: Date.now() - DAY * 5,
  },
  {
    id: 'h4',
    title: 'How do I set up Mekari Pay?',
    messages: [
      { role: 'user',      text: 'How do I set up Mekari Pay?' },
    ],
    createdAt: Date.now() - DAY * 14,
  },
  {
    id: 'h5',
    title: 'Import sales invoices from CSV',
    messages: [
      { role: 'user',      text: 'Import sales invoices' },
    ],
    createdAt: Date.now() - DAY * 21,
  },
]
// Persisted chat history (mini-DB) — survives reload/new-chat.
const chatSessions = ref<ChatSession[]>(loadSnapshot<ChatSession>('airene-chats-v1') ?? CHAT_SEED)
function persistChats() { saveSnapshot('airene-chats-v1', chatSessions.value) }
// Materialise the seed history to the mini-DB on first load, so other surfaces
// (e.g. the header search "Recent chats") can read it too.
if (!loadSnapshot<ChatSession>('airene-chats-v1')) persistChats()

// ── Active session ────────────────────────────────────────────────────────
// Hoisted to the bridge singleton so the conversation survives navigation.
const messages = aireneBridge.messages
const chatBodyEl = ref<HTMLElement | null>(null)
const inputText = ref('')
const isTyping = ref(false)

// Title: derived from first user message, or "New chat"
const chatTitle = computed(() => {
  const first = messages.value.find(m => m.role === 'user')
  if (!first) return 'New chat'
  const t = first.text.trim()
  return t.length > 32 ? t.slice(0, 32) + '…' : t
})

// ── History dropdown ──────────────────────────────────────────────────────
const historyOpen = ref(false)
const historyWrapperEl = ref<HTMLElement | null>(null)

function toggleHistory(e: MouseEvent) {
  e.stopPropagation()
  historyOpen.value = !historyOpen.value
}

function onOutsideClick(e: MouseEvent) {
  if (!historyWrapperEl.value?.contains(e.target as Node)) {
    historyOpen.value = false
  }
  if (!kebabWrapperEl.value?.contains(e.target as Node)) {
    kebabOpen.value = false
  }
}

function onKeyDown(e: KeyboardEvent) {
  onOutsideClick(e as unknown as MouseEvent)
  // ⌘/ (Mac) or Ctrl+/ (Win/Linux) → toggle Airene panel
  if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
    // Don't intercept when user is typing in an input/textarea
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return
    e.preventDefault()
    toggleAirene()
  }
}

// ── Mascot cursor-follow + eye tracking (RAF lerp) ───────────────────────
const mascotImgEl  = ref<HTMLElement | null>(null)
const pupilLeftEl  = ref<HTMLElement | null>(null)
const pupilRightEl = ref<HTMLElement | null>(null)

// Body targets/current
let _tRot = 0, _tTx = 0, _tTy = 0
let _cRot = 0, _cTx = 0, _cTy = 0
// Eye targets/current — pupils move independently, faster than body
let _tEyeX = 0, _tEyeY = 0
let _cEyeX = 0, _cEyeY = 0
let _mascotRaf: number | null = null

function _tickMascot() {
  const tBody = 0.07   // body: slower, floaty
  const tEye  = 0.14   // eyes: snappier, alive

  _cRot  += (_tRot  - _cRot)  * tBody
  _cTx   += (_tTx   - _cTx)   * tBody
  _cTy   += (_tTy   - _cTy)   * tBody
  _cEyeX += (_tEyeX - _cEyeX) * tEye
  _cEyeY += (_tEyeY - _cEyeY) * tEye

  if (mascotImgEl.value) {
    mascotImgEl.value.style.transform =
      `rotate(${_cRot.toFixed(3)}deg) translate(${_cTx.toFixed(3)}px,${_cTy.toFixed(3)}px)`
  }
  const et = `translate(${_cEyeX.toFixed(3)}px,${_cEyeY.toFixed(3)}px)`
  if (pupilLeftEl.value)  pupilLeftEl.value.style.transform  = et
  if (pupilRightEl.value) pupilRightEl.value.style.transform = et

  _mascotRaf = requestAnimationFrame(_tickMascot)
}

function onMouseMoveMascot(e: MouseEvent) {
  const el = mascotImgEl.value
  if (!el) {
    _tRot = 0; _tTx = 0; _tTy = 0; _tEyeX = 0; _tEyeY = 0
    return
  }

  const r  = el.getBoundingClientRect()
  const cx = r.left + r.width  / 2
  const cy = r.top  + r.height / 2
  const dx = e.clientX - cx
  const dy = e.clientY - cy

  // Body: subtle lean
  _tRot = Math.max(-10, Math.min(10, dx * 0.025))
  _tTx  = Math.max(-5,  Math.min(5,  dx * 0.012))
  _tTy  = Math.max(-5,  Math.min(5,  dy * 0.012))

  // Eyes: constrained to ±2px (pupil must stay inside 6px eye white)
  _tEyeX = Math.max(-2, Math.min(2, dx * 0.006))
  _tEyeY = Math.max(-2, Math.min(2, dy * 0.006))
}

onMounted(() => {
  document.addEventListener('click', onOutsideClick)
  document.addEventListener('click', onImportOutsideClick)
  document.addEventListener('click', onStockActionsOutsideClick)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('mousemove', onMouseMoveMascot)
  _mascotRaf = requestAnimationFrame(_tickMascot)
})
onUnmounted(() => {
  document.removeEventListener('click', onOutsideClick)
  document.removeEventListener('click', onImportOutsideClick)
  document.removeEventListener('click', onStockActionsOutsideClick)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('mousemove', onMouseMoveMascot)
  if (_mascotRaf !== null) cancelAnimationFrame(_mascotRaf)
})

// Group sessions: yesterday / this week / older
const groupedHistory = computed(() => {
  const now = Date.now()
  // start-of-day boundaries
  const todayMidnight = new Date()
  todayMidnight.setHours(0, 0, 0, 0)
  const todayStart    = todayMidnight.getTime()
  const yesterdayStart = todayStart - DAY
  const weekStart      = todayStart - DAY * 6

  const yesterday: ChatSession[] = []
  const thisWeek: ChatSession[]  = []
  const older: ChatSession[]     = []

  for (const s of chatSessions.value) {
    if (s.createdAt >= yesterdayStart) {
      yesterday.push(s)
    } else if (s.createdAt >= weekStart) {
      thisWeek.push(s)
    } else {
      older.push(s)
    }
  }
  return { yesterday, thisWeek, older }
})

// Upsert the currently-shown conversation into the persisted history, so it's
// available from any module without an explicit "save" step.
function persistActiveSession() {
  if (messages.value.length === 0) return
  const first = messages.value.find(m => m.role === 'user')
  const title = first
    ? (first.text.length > 32 ? first.text.slice(0, 32) + '…' : first.text)
    : 'Chat'
  const existing = activeSessionId.value
    ? chatSessions.value.find(s => s.id === activeSessionId.value)
    : null
  if (existing) {
    existing.title = title
    existing.messages = [...messages.value]
  } else {
    const id = Date.now().toString()
    activeSessionId.value = id
    chatSessions.value.unshift({
      id, title, messages: [...messages.value], createdAt: Date.now(),
      module: chatContext.value ? undefined : moduleInfo.value.label,
    })
  }
  persistChats()
}

function startNewChat() {
  // Current chat is already persisted (upserted on each reply); just reset the view.
  messages.value = []
  activeSessionId.value = null
  chatContext.value = ''
  aireneGround.value = ''
  contextSuggestions.value = [...DEFAULT_CONTEXT_SUGGESTIONS]
  historyOpen.value = false
  kebabOpen.value = false
  // A fresh chat is general (any agent), back to the default assistant.
  restrictAgents.value = []
  activeAgentId.value = 'airene'
}

function loadSession(session: ChatSession) {
  messages.value = [...session.messages]
  activeSessionId.value = session.id
  chatContext.value = ''
  aireneGround.value = ''
  historyOpen.value = false
}

// Kebab menu: clear the current conversation, or delete it from history.
const kebabOpen = ref(false)
const kebabWrapperEl = ref<HTMLElement | null>(null)
function removeActiveSession() {
  if (!activeSessionId.value) return
  const i = chatSessions.value.findIndex(s => s.id === activeSessionId.value)
  if (i >= 0) { chatSessions.value.splice(i, 1); persistChats() }
}
function clearChat() {
  removeActiveSession()
  messages.value = []
  activeSessionId.value = null
  chatContext.value = ''
  aireneGround.value = ''
  kebabOpen.value = false
  infoToast('Chat cleared')
}
function deleteChat() {
  removeActiveSession()
  messages.value = []
  activeSessionId.value = null
  chatContext.value = ''
  aireneGround.value = ''
  kebabOpen.value = false
  toast.notify({ variant: 'success', title: 'Chat deleted' })
}

// Dummy AI response for the WhatsApp draft scenario
function getAiResponse(userMsg: string): string {
  const q = userMsg.toLowerCase()
  if (q.includes('whatsapp') || q.includes('reminder') || q.includes('draft')) {
    return `Sure! Here's a friendly WhatsApp reminder draft:\n\n"Hi The Daily Grind team! 👋 Just a quick reminder that invoice #40030 for Rp4,500,000 was due 2 days ago. No worries if it slipped through — you can view and pay it here: [payment link]\n\nThanks so much and have a great day! 😊"\n\n---\nDo you want me to send this to Jenny from The Daily Grind now?`
  }
  return `I've reviewed the invoice details. Here's what I found:\n\nInvoice #40030 is currently overdue by 2 days (due 01/05/2025). The outstanding balance is Rp4,500,000.\n\nWould you like me to send a payment reminder or draft a follow-up message?`
}

// ── Module-aware greeting + suggestions (general chat, not a task) ────────────
// The Airene drawer lives on every ERP page; when opened without a task context
// its greeting, preset prompts and grounding adapt to the module you're in.
interface ModuleChat { label: string; greeting: string; suggestions: string[]; ground: string[] }
const MODULE_CHAT: Record<string, ModuleChat> = {
  HR: { label: 'HR', greeting: 'I can help with employees, attendance, payroll and contracts.',
    suggestions: ['Who was late this week and why?', 'Which contracts expire in the next 60 days?', 'Summarise headcount by department', 'Which employees are resigning?'], ground: ['hr'] },
  Finance: { label: 'Finance', greeting: 'I can help with invoices, bills, cash flow and collections.',
    suggestions: ['Which customers are overdue and why?', 'How much am I owed right now?', 'What needs clearing before month-end close?', 'Draft a payment reminder for the biggest overdue'], ground: ['finance', 'crm'] },
  CRM: { label: 'CRM', greeting: 'I can help with your pipeline, customers and deals.',
    suggestions: ['Which deals should I prioritise?', 'Which deals are stalled?', 'Who are my top customers?', 'Draft a follow-up for a stalled deal'], ground: ['crm', 'finance'] },
  WMS: { label: 'Warehouse', greeting: 'I can help with stock, warehouses and fulfilment.',
    suggestions: ['Which SKUs are below reorder point?', "What's out of stock?", 'What outbound orders are at risk today?', 'Plan today’s cycle counts'], ground: ['wms'] },
  Production: { label: 'Production', greeting: 'I can help with work orders, BOMs and production.',
    suggestions: ['Which work orders are at risk?', 'Check components vs BOM for open work orders', 'What is blocking production today?', 'Summarise open work orders'], ground: ['production', 'wms'] },
  Sales: { label: 'Sales', greeting: 'I can help with orders, quotes and deliveries.',
    suggestions: ['Which sales orders are ready to fulfil?', 'Which orders are blocked on stock?', 'Summarise open sales orders', 'How much am I owed right now?'], ground: ['crm', 'wms', 'finance'] },
  General: { label: 'Mekari ERP', greeting: 'I can help across HR, sales, CRM, warehouse, finance and production.',
    suggestions: ['How much am I owed right now?', 'Which customers are overdue and why?', 'Which SKUs are below reorder point?', 'Who was late this week?'], ground: ['hr', 'crm', 'wms', 'finance', 'production'] },
}
function moduleKeyFromPath(path: string): keyof typeof MODULE_CHAT {
  const p = path.toLowerCase()
  if (/(^\/hr|employee|attendance|payroll|leave|recruit)/.test(p)) return 'HR'
  if (/(crm|deal|pipeline|prospect|contact)/.test(p)) return 'CRM'
  if (/(work-order|bill-of-material|production|bom)/.test(p)) return 'Production'
  if (/(sales-order|sales-quote|sales-deliver|quote)/.test(p)) return 'Sales'
  if (/(warehouse|storage|receiv|picking|packing|deliver|stock|inbound|outbound|cycle|put-away|transfer|courier|shipment|product)/.test(p)) return 'WMS'
  if (/(invoice|bill|cash|expense|bank|purchase|payment|journal|finance|jurnal|tax)/.test(p)) return 'Finance'
  return 'General'
}
const moduleInfo = computed<ModuleChat>(() => MODULE_CHAT[moduleKeyFromPath(route.path)] ?? MODULE_CHAT.General!)

// Context chip — set when entry point is from the AI popover
const chatContext = ref('')
// Grounding context fed to the model (e.g. a Cowork task result). Not shown.
const aireneGround = ref('')

// ── Agent switcher ────────────────────────────────────────────────────────────
// You chat WITH an agent. In a general ERP-module chat you can pick any agent; in
// a Cowork-task chat the choice is limited to the agent(s) that own the task (one
// agent → locked, several → switchable). The model then answers in-character and
// declines anything outside that agent's area/skills.
const activeAgentId = aireneBridge.activeAgentId
const restrictAgents = aireneBridge.restrictAgents
const availableAgents = computed<CoworkAgent[]>(() =>
  restrictAgents.value.length
    ? coworkAgents.filter((a) => restrictAgents.value.includes(a.id))
    : coworkAgents)
const activeAgent = computed<CoworkAgent | undefined>(() =>
  availableAgents.value.find((a) => a.id === activeAgentId.value)
  ?? availableAgents.value[0]
  ?? coworkAgents.find((a) => a.id === 'airene'))
const canSwitchAgent = computed(() => availableAgents.value.length > 1)
const agentMenuOpen = ref(false)
function pickAgent(a: CoworkAgent) { activeAgentId.value = a.id; agentMenuOpen.value = false }
// Payload sent to the chat API so the model role-plays the agent and gates answers.
function activeAgentPayload() {
  const a = activeAgent.value
  if (!a) return undefined
  const skills = (a.skills ?? []).map((id) => COWORK_SKILLS.find((s) => s.id === id)?.name).filter(Boolean)
  return { name: a.name, role: a.role, module: a.module, persona: a.instruction || a.persona, skills }
}
// When the chat is opened about a specific task result, the empty-state greeting
// and suggestions become contextual to that result instead of the generic ones.
const DEFAULT_CONTEXT_SUGGESTIONS = [
  'What should I do first?',
  'Draft a follow-up message I can send',
  'Summarise this in 3 bullet points',
  'What are the risks or blockers here?',
]
// Populated per opened task via the bridge (falls back to the generic set).
const contextSuggestions = ref<string[]>([...DEFAULT_CONTEXT_SUGGESTIONS])

// ── Rich chat rendering: light markdown + employee mention chips ──────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeReg(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function initialsOf(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
// Minimal inline markdown → HTML (bold, italic, line breaks, bullets).
function mdToHtml(text: string): string {
  const lines = escapeHtml(text).split('\n')
  const out: string[] = []
  let inList = false
  for (let raw of lines) {
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(raw)
    if (heading) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<p class="chat-md-h">${heading[1]}</p>`)
      continue
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(raw)
    if (bullet) {
      if (!inList) { out.push('<ul class="chat-md-ul">'); inList = true }
      out.push(`<li>${bullet[1]}</li>`)
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    out.push(raw.length ? `<p class="chat-md-p">${raw}</p>` : '')
  }
  if (inList) out.push('</ul>')
  return out.join('')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
// Wrap any known employee full name in an avatar chip with a hover coachmark.
function withEmployeeChips(html: string): string {
  const names = employees.map((e) => e.fullName).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!names.length) return html
  const re = new RegExp('(' + names.map(escapeReg).join('|') + ')', 'g')
  return html.replace(re, (m) => {
    const e = employees.find((x) => x.fullName === m)
    if (!e) return m
    const ini = initialsOf(e.fullName)
    const av = e.photo
      ? `<span class="emp-chip-av" style="background-image:url('${e.photo}')"></span>`
      : `<span class="emp-chip-av emp-chip-av--ini">${ini}</span>`
    const cav = e.photo
      ? `<span class="emp-coach-av" style="background-image:url('${e.photo}')"></span>`
      : `<span class="emp-coach-av emp-chip-av--ini">${ini}</span>`
    return `<span class="emp-chip" tabindex="0">${av}<span class="emp-chip-name">${m}</span>` +
      `<span class="emp-coach">${cav}<span class="emp-coach-body">` +
      `<span class="emp-coach-name">${e.fullName}</span>` +
      `<span class="emp-coach-meta">${e.employeeId ?? ''}</span>` +
      `<span class="emp-coach-meta">${[e.jobPosition, e.department].filter(Boolean).join(' · ')}</span>` +
      `</span></span></span>`
  })
}
function renderMessage(text: string): string {
  return withEmployeeChips(mdToHtml(text))
}

async function sendMessage(text: string, context?: string) {
  const trimmed = text.trim()
  if (!trimmed) return

  // Set context chip (only from AI popover)
  if (context) chatContext.value = context

  // Open panel if not already open
  aireneOpen.value = true

  // Add user message
  messages.value.push({ role: 'user', text: trimmed })
  inputText.value = ''

  await nextTick()
  scrollChatToBottom()

  // Real Gemini reply. Grounded on the task result if the chat was opened about
  // one; otherwise on a snapshot of the module the user is currently in.
  isTyping.value = true
  let reply = ''
  try {
    const res = await $fetch<{ reply: string }>('/api/cowork/chat', {
      method: 'POST',
      body: {
        messages: messages.value.map((m: { role: string; text: string }) => ({ role: m.role, text: m.text })),
        context: aireneGround.value || buildModuleGround(),
        agent: activeAgentPayload(),
        roster: coworkAgents.map((a) => ({ name: a.name, role: a.role, module: a.module })),
      },
    })
    reply = res.reply
  } catch {
    reply = 'Sorry — I hit an error reaching the model. Please try again.'
  }
  isTyping.value = false
  messages.value.push({ role: 'assistant', text: reply })
  persistActiveSession()

  await nextTick()
  scrollChatToBottom()
}

// Grounding snapshot for a general (non-task) chat — just the modules relevant to
// the page the user opened the drawer from, so answers stay accurate.
function buildModuleGround(): string {
  try {
    const snap = buildCoworkContext() as Record<string, any>
    const info = moduleInfo.value
    const slice: Record<string, any> = {}
    for (const k of info.ground) if (snap[k]) slice[k] = snap[k]
    return `You are Airene helping the user inside the ${info.label} area of the Mekari ERP. `
      + `Today is ${snap.today}. Answer from this real ERP data; if asked about something outside it, say so briefly.\n`
      + JSON.stringify(slice)
  } catch { return '' }
}

function scrollChatToBottom() {
  if (chatBodyEl.value) {
    chatBodyEl.value.scrollTop = chatBodyEl.value.scrollHeight
  }
}

// Expose sendMessage so popover can call it
provide('sendAireneMessage', sendMessage)

// Bridge: let components above the page (e.g. the header search) drive the panel.
// (aireneBridge is declared near the top, alongside the hoisted panel state.)
watch(aireneBridge.toggleSignal, () => toggleAirene())
watch(aireneBridge.sendSignal, () => {
  if (!aireneBridge.pendingText.value) return
  if (aireneBridge.pendingFresh.value) startNewChat()
  sendMessage(aireneBridge.pendingText.value)
})
// Open a saved chat session (e.g. a "recent chat" chosen from the header search).
watch(aireneBridge.openSessionSignal, () => {
  const s = chatSessions.value.find(x => x.id === aireneBridge.pendingSessionId.value)
  if (s) loadSession(s)
  else startNewChat()
  aireneOpen.value = true
})
// Open the chat grounded on a context (e.g. a Cowork task result) — fresh chat.
watch(aireneBridge.openContextSignal, () => {
  startNewChat()
  aireneGround.value = aireneBridge.pendingGround.value
  chatContext.value = aireneBridge.pendingLabel.value
  contextSuggestions.value = aireneBridge.pendingSuggestions.value?.length
    ? [...aireneBridge.pendingSuggestions.value]
    : [...DEFAULT_CONTEXT_SUGGESTIONS]
  aireneOpen.value = true
})

// ── Resize panel ──────────────────────────────────────────────────────────
const PANEL_MIN = 384
const PANEL_MAX = 680
const panelWidth = ref(PANEL_MIN)

function startResize(e: MouseEvent) {
  e.preventDefault()
  const startX = e.clientX
  const startW = panelWidth.value

  function onMove(ev: MouseEvent) {
    // dragging left → bigger panel (panel is on the right side)
    const delta = startX - ev.clientX
    panelWidth.value = Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW + delta))
  }

  function onUp() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<template>
  <div class="page-layout">

    <!-- ── Left column: title bar + stage ── -->
    <div class="page-col">

      <!-- Detail routes own their entire layout (title bar + stage) -->
      <component :is="detailMatch.component" v-if="detailMatch" :order-id="detailMatch.id" />

      <!-- Purchase Orders detail/form overlay — own layout, bypasses the title bar below -->
      <component :is="PurchaseOrderFormPage" v-else-if="showPurchaseOrderForm" :duplicate-order-id="poFormDuplicateId ?? undefined" :rejection-banner="poFormRejectionBanner" :purchase-request-ids="poFormPrIds" />
      <component :is="PurchaseOrderDetailPage" v-else-if="showPurchaseOrderDetail" :order-id="poDetailOrderId!" />

      <template v-else>
      <div v-if="currentPageKey !== 'Home' && currentPageKey !== 'Hr'" class="page-title-bar">
        <h1 class="page-title-text">{{ t(pageTitle) }}</h1>
        <div class="page-actions">
          <button class="page-actions-toggle btn-enterprise btn-enterprise--primary btn-enterprise--icon-after" type="button" @click.stop="titleActionsOpen = !titleActionsOpen">
            {{ t('Actions') }}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="page-actions-inner" :class="{ 'page-actions-inner--open': titleActionsOpen }" @click="titleActionsOpen = false">
        <div v-if="currentPageKey === 'Sales invoices'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after">
            {{ t('Import') }}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="newSalesInvoice">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New sales invoice
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Cowork tasks'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push({ path: '/cowork', query: { focus: '1' } })">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            New task
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Cowork agents'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/cowork-agents/new')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            New agent
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Cowork schedule'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push({ path: '/cowork', query: { focus: '1' } })">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Schedule a task
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Cowork connections'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push({ path: '/cowork-connections', query: { add: '1' } })">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Custom connection
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Cowork skills'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push({ path: '/cowork-skills', query: { new: '1' } })">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Create skill
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Employee directory'" class="page-title-actions">
          <div class="page-import-btn">
          <MpPopover id="emp-import-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after">
                {{ t('Import') }}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="importEmployees('add')">{{ t('Import employees') }}</MpPopoverListItem>
                <MpPopoverListItem @click="importEmployees('update')">{{ t('Update employee data') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
          </div>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="newEmployee">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('New employee') }}
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Sales orders'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary">
            {{ t('Import') }}
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New sales order
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Purchase requests'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary">
            {{ t('Import') }}
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('New purchase request') }}
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Sales quotes'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary">
            {{ t('Import') }}
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New sales quote
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Sales deliveries'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary">
            {{ t('Import') }}
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New sales delivery
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Cash management'" class="page-title-actions">
          <!-- Secondary: "+ New account" -->
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="router.push('/cash-management/new')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('New account') }}
          </button>

          <!-- Primary dropdown button: "New transaction" — the whole button opens the menu. -->
          <div ref="importBtnWrapEl" class="import-wrap">
            <button
              class="btn-enterprise btn-enterprise--primary"
              @click.stop="importDropdownOpen = !importDropdownOpen"
            >
              {{ t('New transaction') }}
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                class="import-chevron" :class="{ 'import-chevron--open': importDropdownOpen }"
              >
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <div v-if="importDropdownOpen" class="import-dropdown" @click.stop>
              <div class="import-group">
                <MpButton variant="ghost" class="import-item import-item--start" @click="importDropdownOpen = false; router.push('/cash-management/internal-transfer')">{{ t('Internal transfer') }}</MpButton>
                <MpButton variant="ghost" class="import-item import-item--start">{{ t('Receive money') }}</MpButton>
                <MpButton variant="ghost" class="import-item import-item--start">{{ t('Spend money') }}</MpButton>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="currentPageKey === 'Warehouses'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary" @click="router.push('/warehouses/import')">
            {{ t('Import') }}
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/warehouses/new')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('New warehouse') }}
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Work orders'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/work-orders/new')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New work order
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Bill of materials'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/bill-of-materials/new')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New bill of materials
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Product list'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary page-import-btn">
            {{ t('Import') }}
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/product-list/new')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New product
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Inbound delivery'" class="page-title-actions">
          <template v-if="activeTab === 'Put-away'">
            <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/inbound-delivery/put-away/create')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ t('New put-away') }}
            </button>
          </template>
          <template v-else>
            <button class="btn-enterprise btn-enterprise--secondary">
              {{ t('Import') }}
            </button>
            <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/inbound-delivery/new')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              {{ t('New receipt') }}
            </button>
          </template>
        </div>
        <div v-else-if="currentPageKey === 'Outbound delivery' && activeTab === 'Requests'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/outbound-delivery/new')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('New delivery order') }}
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Outbound delivery' && activeTab === 'Ready to ship'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/outbound-delivery/new-shipment/create')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('New shipment') }}
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Purchase invoices'" class="page-title-actions">
          <!-- Import button + dropdown -->
          <div ref="importBtnWrapEl" class="import-wrap">
            <button
              class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after"
              :class="{ 'btn-enterprise--active': importDropdownOpen }"
              @click.stop="importDropdownOpen = !importDropdownOpen"
            >
              {{ t('Import') }}
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                class="import-chevron" :class="{ 'import-chevron--open': importDropdownOpen }"
              >
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <!-- Dropdown -->
            <div v-if="importDropdownOpen" class="import-dropdown" @click.stop>

              <!-- Group 1: spreadsheet + upload bills -->
              <div class="import-group import-group--bordered">
                <MpButton variant="ghost" class="import-item import-item--start">{{ t('Import from spreadsheet') }}</MpButton>
                <MpButton variant="ghost" class="import-item import-item--start import-item--ai">
                  <span>Upload bills</span>
                  <MpIcon name="airene-brand" size="xs" class="import-item__ai-icon" />
                </MpButton>
              </div>

              <!-- Group 2: Forward bills to -->
              <div class="import-group">
                <div class="import-forward">
                  <div class="import-forward__labels">
                    <span class="import-forward__title">Forward bills to</span>
                    <span class="import-forward__email">dropbox.680128@jurnal.id</span>
                  </div>
                  <a class="import-forward__copy" @click.prevent>Copy address</a>
                  <p class="import-forward__desc">
                    Any bill or receipt attachment forwarded to this email will be automatically recorded as a draft.
                  </p>
                </div>
              </div>

            </div>
          </div>

          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New purchase invoice
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Expenses'" class="page-title-actions">
          <!-- Import button + dropdown -->
          <div ref="importBtnWrapEl" class="import-wrap">
            <button
              class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after"
              :class="{ 'btn-enterprise--active': importDropdownOpen }"
              @click.stop="importDropdownOpen = !importDropdownOpen"
            >
              {{ t('Import') }}
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                class="import-chevron" :class="{ 'import-chevron--open': importDropdownOpen }"
              >
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <!-- Dropdown -->
            <div v-if="importDropdownOpen" class="import-dropdown" @click.stop>

              <!-- Group 1: spreadsheet + upload bills -->
              <div class="import-group import-group--bordered">
                <MpButton variant="ghost" class="import-item import-item--start">{{ t('Import from spreadsheet') }}</MpButton>
                <MpButton variant="ghost" class="import-item import-item--start import-item--ai" @click="openUploadBills">
                  <span>Upload bills</span>
                  <MpIcon name="airene-brand" size="xs" class="import-item__ai-icon" />
                </MpButton>
                <input
                  ref="uploadBillsInputEl" type="file" class="visually-hidden-input"
                  accept=".csv,.png,.xlsx,.pdf,.jpg,.jpeg" multiple
                  @change="onUploadBillsChange"
                />
              </div>

              <!-- Group 2: Forward bills to -->
              <div class="import-group">
                <div class="import-forward">
                  <div class="import-forward__labels">
                    <span class="import-forward__title">Forward bills to</span>
                    <span class="import-forward__email">dropbox.680128@jurnal.id</span>
                  </div>
                  <a class="import-forward__copy" @click.prevent>Copy address</a>
                  <p class="import-forward__desc">
                    Any bill or receipt attachment forwarded to this email will be automatically recorded as a draft.
                  </p>
                </div>
              </div>

            </div>
          </div>

          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="newExpense">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New expense
          </button>
        </div>
        <div v-else-if="showNewPurchaseOrder" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary">
            {{ t('Import') }}
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New purchase order
          </button>
        </div>
        <div v-else-if="showNewWarehouseTransfer" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary">
            {{ t('Import') }}
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="newWarehouseTransfer">
            <MpIcon name="add" size="md" color="icon.inverse" />
            {{ t('New warehouse transfer') }}
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Cycle counts' && activeTab === 'Count task'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/cycle-counts/new')">
            <MpIcon name="add" size="md" color="icon.inverse" />
            {{ t('New count task') }}
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Stock inout'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="newStockInOut">
            <MpIcon name="add" size="md" color="icon.inverse" />
            {{ t('New stock in/out') }}
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Stock adjustments'" class="page-title-actions">
          <div ref="stockActionsWrapEl" class="import-wrap">
            <button
              class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-after"
              @click.stop="stockActionsOpen = !stockActionsOpen"
            >
              Actions
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                class="import-chevron" :class="{ 'import-chevron--open': stockActionsOpen }"
              >
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div v-if="stockActionsOpen" class="import-dropdown" @click.stop>
              <div class="import-group">
                <button class="import-item" @click="newStockAdjustment('count')">Stock count</button>
                <button class="import-item" @click="newStockAdjustment('in-out')">Stock in/out</button>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="currentPageKey === 'Couriers'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="courierAddSignal++">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Add courier
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Purchase orders'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="infoToast('Import purchase orders — coming soon')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 15V3M12 3L8 7M12 3l4 4M4 15v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Import
          </button>
          <button class="btn-enterprise btn-enterprise--primary" @click="openNewPurchaseOrderForm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            New purchase order
          </button>
        </div>
        <!-- ── XPM (Mekari Expense) title-bar actions ── -->
        <div v-else-if="currentPageKey === 'Accounts'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary" @click="triggerXpm('editWallet')">Edit wallet</button>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="triggerXpm('moveMoney')">
            <MpIcon name="transfer" size="md" />
            Move money
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="triggerXpm('topUp')">
            <MpIcon name="add" size="md" color="icon.inverse" />
            Top up
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Budgeting'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="triggerXpm('setBudget')">
            <MpIcon name="add" size="md" color="icon.inverse" />
            Set budget
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Xpm purchases'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="triggerXpm('createPurchase')">
            <MpIcon name="add" size="md" color="icon.inverse" />
            Create purchase
          </button>
        </div>
        <div v-else-if="currentPageKey === 'Xpm trips'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary" @click="triggerXpm('travelPolicy')">Manage travel policy</button>
        </div>
        <div v-else-if="currentPageKey === 'Xpm claims'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary" @click="triggerXpm('claimPolicy')">Manage claim policy</button>
        </div>
        <div v-else-if="currentPageKey === 'Xpm cards'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="triggerXpm('createCard')">
            <MpIcon name="add" size="md" color="icon.inverse" />
            Create card
          </button>
        </div>
        <div v-else-if="currentPageKey === 'My claims'" class="page-title-actions">
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="triggerXpm('myLimits')">
            <MpIcon name="protection" size="md" />
            My limits
          </button>
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="router.push('/my-claims/create')">
            <MpIcon name="add" size="md" color="icon.inverse" />
            Request claim
          </button>
        </div>
          </div>
        </div>
      </div>

      <!-- Purchase Orders tab bar (custom .page-tab buttons, not the generic tabs system) -->
      <div v-if="currentPageKey === 'Purchase orders'" class="page-tabs-bar">
        <button
          class="page-tab"
          :class="{ 'page-tab--active': purchaseOrdersTab === 'all' }"
          @click="purchaseOrdersTab = 'all'"
        >
          All purchase orders
        </button>
        <button
          class="page-tab"
          :class="{ 'page-tab--active': purchaseOrdersTab === 'awaiting' }"
          @click="purchaseOrdersTab = 'awaiting'"
        >
          Awaiting approval
          <MpBadge for="additionalInformation" size="sm" type="warning">{{ poAwaitingCount }}</MpBadge>
        </button>
        <button
          class="page-tab"
          :class="{ 'page-tab--active': purchaseOrdersTab === 'rejected' }"
          @click="purchaseOrdersTab = 'rejected'"
        >
          Rejected
          <MpBadge for="additionalInformation" size="sm" type="critical">{{ poRejectedCount }}</MpBadge>
        </button>
      </div>

      <!-- Status tabs (below the title, outside the stage) — hidden when there's
           nothing to switch between (e.g. WMS's Product list, once Awaiting
           approval is filtered out, is left with only "All products"). -->
      <div v-if="currentTabs.length > 1" class="page-tabs" role="tablist">
        <button
          v-for="tab in currentTabs"
          :key="tab"
          class="page-tab"
          :class="{ 'page-tab--active': activeTab === tab }"
          role="tab"
          :aria-selected="activeTab === tab"
          @click="selectTab(tab)"
        >
          {{ tabLabel(tab) }}
          <MpBadge v-if="currentTabCounts[tab] != null" class="page-tab-count" for="additionalInformation" type="warning" size="sm">{{ currentTabCounts[tab] }}</MpBadge>
        </button>
      </div>

      <div class="stage" :class="{ 'stage--flush': currentPageKey === 'Wms report', 'stage--flush-top': currentPageKey === 'Hr' || currentPageKey === 'Home' }">
        <MpBanner v-if="cycleCountBannerVisible" variant="info" class="cycle-count-banner">
          <MpBannerIcon name="info" />
          <MpBannerTitle>Recommended for counting today</MpBannerTitle>
          <MpBannerDescription>{{ cycleCountBannerNames.join(', ') }}</MpBannerDescription>
          <MpBannerLink>
            <MpButton variant="textLink" size="sm" @click="selectTab('Recommendations')">View all recommendations</MpButton>
          </MpBannerLink>
        </MpBanner>
        <component v-if="activeTabComponent" :is="activeTabComponent" />
        <div v-else-if="currentTabs.length" class="tab-stage-placeholder">
          <p class="tab-stage-placeholder__title">{{ tabLabel(activeTab) }}</p>
          <p class="tab-stage-placeholder__desc">Page content goes here.</p>
        </div>
        <component v-else :is="currentComponent" />
      </div>
      </template>
    </div>

    <!-- ── Right: Airene chat panel ── -->
    <Transition name="panel">
      <div v-if="aireneOpen" class="airene-slot" :style="{ width: panelWidth + 'px' }">

        <!-- Left edge divider — drag to resize -->
        <div class="airene-divider" aria-label="Resize panel" @mousedown="startResize" />

        <!-- White rounded inner card -->
        <div class="airene-card">

          <!-- Card header -->
          <div class="airene-card-header">
            <!-- Chat title + history dropdown -->
            <div ref="historyWrapperEl" class="airene-history-wrapper">
              <button class="airene-new-chat" @click="toggleHistory">
                <span class="airene-chat-title">{{ chatTitle }}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="airene-chevron" :class="{ 'airene-chevron--open': historyOpen }">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>

              <!-- History dropdown -->
              <div v-if="historyOpen" class="airene-history-dropdown" @click.stop>
                <!-- New chat item -->
                <button class="airene-history-new-btn" @click="startNewChat">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  New chat
                </button>

                <div class="airene-history-sep" />

                <!-- Yesterday -->
                <template v-if="groupedHistory.yesterday.length">
                  <p class="airene-history-group">Yesterday</p>
                  <button
                    v-for="s in groupedHistory.yesterday"
                    :key="s.id"
                    class="airene-history-item"
                    @click="loadSession(s)"
                  >{{ s.title }}</button>
                </template>

                <!-- This week -->
                <template v-if="groupedHistory.thisWeek.length">
                  <p class="airene-history-group">This week</p>
                  <button
                    v-for="s in groupedHistory.thisWeek"
                    :key="s.id"
                    class="airene-history-item"
                    @click="loadSession(s)"
                  >{{ s.title }}</button>
                </template>

                <!-- Older -->
                <template v-if="groupedHistory.older.length">
                  <p class="airene-history-group">Older</p>
                  <button
                    v-for="s in groupedHistory.older"
                    :key="s.id"
                    class="airene-history-item"
                    @click="loadSession(s)"
                  >{{ s.title }}</button>
                </template>
              </div>
            </div>
            <div class="airene-header-icons">
              <!-- New chat -->
              <button class="airene-icon-btn" aria-label="New chat" title="New chat" @click="startNewChat">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M5.86533 3.46533C5.42991 3.90075 5.15 4.55044 5.15 5.4V6.85H10.152C11.1384 6.85 12.0188 7.18209 12.6543 7.81768C13.2899 8.45327 13.622 9.33358 13.622 10.32V13.576C13.622 13.7282 13.6145 13.881 13.5977 14.0329L13.85 14.1994V12.88C13.85 12.4658 14.1858 12.13 14.6 12.13C15.4492 12.13 16.1012 11.852 16.5301 11.4172L16.5372 11.4101L16.5372 11.4101C16.972 10.9812 17.25 10.3292 17.25 9.47998V5.4C17.25 4.55044 16.9701 3.90075 16.5347 3.46533C16.0993 3.02991 15.4496 2.75 14.6 2.75H7.8C6.95044 2.75 6.30075 3.02991 5.86533 3.46533ZM13.1053 15.5051L13.1275 15.5197C14.0847 16.1642 15.35 15.4577 15.35 14.328V13.5747C16.2263 13.442 17.0034 13.0716 17.5943 12.4743C18.3573 11.7195 18.75 10.6609 18.75 9.47998V5.4C18.75 4.20956 18.3499 3.15925 17.5953 2.40467C16.8407 1.65009 15.7904 1.25 14.6 1.25H7.8C6.60956 1.25 5.55925 1.65009 4.80467 2.40467C4.05009 3.15925 3.65 4.20956 3.65 5.4V6.9941C3.03903 7.1655 2.50536 7.48857 2.0941 7.95C1.53737 8.57466 1.25 9.40203 1.25 10.32V13.576C1.25 14.5633 1.58266 15.4433 2.22167 16.0823C2.68831 16.549 3.29034 16.8518 3.97 16.9784V17.456C3.97 18.4665 5.10358 19.1227 5.97955 18.5257L8.20277 17.046H10.152C11.4362 17.046 12.5087 16.4804 13.1053 15.5051ZM4.464 8.36331C3.9064 8.41663 3.4912 8.6369 3.2139 8.94803C2.93463 9.26138 2.75 9.718 2.75 10.32V13.576C2.75 14.2206 2.96134 14.7007 3.28233 15.0217C3.59416 15.3335 4.0735 15.546 4.71999 15.546C5.13421 15.546 5.46999 15.8818 5.46999 16.296V17.063L7.56045 15.6716C7.68355 15.5897 7.82813 15.546 7.976 15.546H10.152C11.1869 15.546 11.8368 15.0112 12.0407 14.2009C12.0429 14.1922 12.0452 14.1835 12.0477 14.1749C12.0958 14.0095 12.122 13.8103 12.122 13.576V10.32C12.122 9.67445 11.9101 9.19476 11.5937 8.87834C11.2772 8.56192 10.7976 8.35 10.152 8.35H4.71999C4.6427 8.35 4.56798 8.35532 4.464 8.36331Z" fill="currentColor"/>
                </svg>
              </button>
              <!-- Kebab / more -->
              <div ref="kebabWrapperEl" class="airene-kebab-wrapper">
                <button class="airene-icon-btn" aria-label="More options" @click.stop="kebabOpen = !kebabOpen">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M10 6C11.1 6 12 5.1 12 4C12 2.9 11.1 2 10 2C8.9 2 8 2.9 8 4C8 5.1 8.9 6 10 6ZM10 8C8.9 8 8 8.9 8 10C8 11.1 8.9 12 10 12C11.1 12 12 11.1 12 10C12 8.9 11.1 8 10 8ZM8 16C8 14.9 8.9 14 10 14C11.1 14 12 14.9 12 16C12 17.1 11.1 18 10 18C8.9 18 8 17.1 8 16Z" fill="currentColor"/>
                  </svg>
                </button>
                <div v-if="kebabOpen" class="airene-kebab-menu" @click.stop>
                  <button class="airene-kebab-item" @click="clearChat">Clear chat</button>
                  <button class="airene-kebab-item airene-kebab-item--danger" @click="deleteChat">Delete chat</button>
                </div>
              </div>
              <!-- Hide / close panel -->
              <button class="airene-icon-btn" aria-label="Close panel" @click="aireneOpen = false">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M11.1121 1.21405C11.0131 1.21861 10.6729 1.23409 10.3561 1.24842C9.18632 1.30134 7.22024 1.4661 6.46808 1.57422C4.84767 1.80717 3.40632 2.72593 2.48064 4.11594C2.01008 4.82257 1.71231 5.61381 1.58652 6.49194C1.47869 7.24485 1.32452 8.99452 1.24392 10.3799C1.20622 11.0284 1.2061 12.9686 1.24373 13.6199C1.32509 15.0278 1.49297 16.9095 1.59917 17.6039C1.95017 19.8991 3.69893 21.7928 5.96408 22.3307C6.3768 22.4287 7.1454 22.5191 8.52008 22.6312C11.1712 22.8474 12.829 22.8474 15.4801 22.6312C16.2527 22.5682 17.2022 22.4731 17.5321 22.4257C19.4793 22.1457 21.1683 20.8632 21.9759 19.0512C22.2592 18.4157 22.3788 17.9136 22.4864 16.9079C22.7329 14.6052 22.831 12.68 22.7803 11.1417C22.7315 9.65939 22.5471 7.35294 22.4009 6.39594C22.1301 4.62239 21.0221 3.06429 19.4077 2.18651C18.8688 1.89352 18.1729 1.66636 17.5321 1.57422C16.8413 1.47493 14.9768 1.31565 13.7041 1.2472C13.246 1.22257 11.4309 1.19937 11.1121 1.21405ZM10.9201 2.72649C9.99929 2.76954 8.82308 2.84421 8.67008 2.86931L8.59208 2.88213V11.9999V21.1178L8.67008 21.1306C8.754 21.1443 9.47758 21.1959 10.2721 21.2447C10.9165 21.2843 13.0831 21.2844 13.7281 21.2448C15.3821 21.1432 17.1413 20.9817 17.5819 20.8909C19.026 20.5933 20.2665 19.4871 20.7354 18.0786C20.894 17.602 20.9349 17.3393 21.0705 15.9239C21.2265 14.2959 21.275 13.3654 21.275 11.9999C21.275 10.6344 21.2265 9.70396 21.0705 8.07594C20.9349 6.66061 20.894 6.39789 20.7354 5.92125C20.2665 4.51281 19.026 3.40655 17.5819 3.10897C17.1534 3.02068 15.4343 2.86149 13.8001 2.75877C13.4088 2.73419 11.2686 2.71019 10.9201 2.72649ZM6.75608 3.05034C6.27898 3.11841 5.89923 3.23226 5.47366 3.43482C4.17891 4.05112 3.27255 5.28755 3.07431 6.70794C2.9828 7.3635 2.82792 9.11833 2.75552 10.3199C2.71488 10.9941 2.71488 13.0058 2.75552 13.6799C2.82792 14.8815 2.9828 16.6364 3.07431 17.2919C3.31558 19.0206 4.59992 20.4434 6.30008 20.8654C6.46023 20.9052 6.91942 20.9759 7.01715 20.9759H7.08008V11.9999V3.02394L6.99008 3.02687C6.94059 3.02848 6.83528 3.03904 6.75608 3.05034ZM12.5796 7.72905C12.5221 7.74073 12.4279 7.77796 12.3702 7.81177C11.951 8.05744 11.8615 8.5953 12.1777 8.96908C12.2135 9.01149 12.3907 9.12964 12.5715 9.23161C13.2126 9.59339 13.6137 9.89747 14.1807 10.4517C14.701 10.9603 15.0703 11.4065 15.3737 11.8933L15.4854 12.0725L15.2809 12.3782C14.9785 12.8303 14.6996 13.1662 14.269 13.5969C13.704 14.1619 13.2029 14.5474 12.5881 14.8903C12.2575 15.0747 12.144 15.1743 12.0531 15.3599C11.9995 15.4695 11.9889 15.5225 11.9906 15.6719C11.994 15.9669 12.1446 16.2098 12.4027 16.3365C12.5192 16.3937 12.5698 16.4039 12.7359 16.4039C12.9275 16.4039 12.9381 16.4008 13.2148 16.2611C13.5552 16.0892 14.1703 15.6836 14.53 15.3938C15.446 14.6558 16.2653 13.715 16.8062 12.7799C17.0286 12.3955 17.0761 12.2709 17.0761 12.0719C17.0761 11.8673 17.0524 11.7976 16.8706 11.4674C16.5252 10.84 16.015 10.1655 15.4369 9.57239C14.8332 8.9529 14.2236 8.46112 13.5848 8.07808C13.0454 7.7547 12.8268 7.67881 12.5796 7.72905Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Chat body -->
          <div ref="chatBodyEl" class="airene-chat-body" :class="{ 'airene-chat-body--has-messages': messages.length > 0 }">

            <!-- Empty state: greeting + suggestions -->
            <div v-if="messages.length === 0" class="airene-greetings">
              <div class="airene-gem-icon" aria-hidden="true">
                <!-- ref on wrapper so eyes rotate WITH the body -->
                <div ref="mascotImgEl" class="mascot-wrapper">
                  <img src="~/assets/airene-mascot-v2.png" width="60" height="63" alt="" class="airene-mascot-img" />
                  <!-- Eyes drawn on the star body; they tilt with it -->
                  <div class="mascot-eye mascot-eye--left">
                    <div ref="pupilLeftEl" class="mascot-pupil" />
                  </div>
                  <div class="mascot-eye mascot-eye--right">
                    <div ref="pupilRightEl" class="mascot-pupil" />
                  </div>
                </div>
              </div>
              <p class="airene-greeting-title">Hi, I'm here.</p>

              <!-- Agent switcher: which agent you're chatting with -->
              <div class="airene-agent-wrap">
                <button v-if="canSwitchAgent" type="button" class="airene-agent-btn" @click="agentMenuOpen = !agentMenuOpen">
                  <img :src="activeAgent!.avatar" :alt="activeAgent!.name" class="airene-agent-av">
                  <span class="airene-agent-name">{{ activeAgent!.name }}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <span v-else class="airene-agent-static">
                  <img :src="activeAgent!.avatar" :alt="activeAgent!.name" class="airene-agent-av">
                  <span class="airene-agent-name">{{ activeAgent!.name }}</span>
                </span>

                <template v-if="agentMenuOpen">
                  <div class="airene-agent-backdrop" @click="agentMenuOpen = false" />
                  <div class="airene-agent-menu">
                    <button v-for="a in availableAgents" :key="a.id" type="button" class="airene-agent-item" :class="{ 'is-active': a.id === activeAgent!.id }" @click="pickAgent(a)">
                      <img :src="a.avatar" :alt="a.name" class="airene-agent-av">
                      <span class="airene-agent-meta">
                        <span class="airene-agent-name">{{ a.name }}</span>
                        <span class="airene-agent-role">{{ a.role }}</span>
                      </span>
                      <MpIcon v-if="a.id === activeAgent!.id" name="check" size="sm" class="airene-agent-check" />
                    </button>
                  </div>
                </template>
              </div>

              <p v-if="chatContext" class="airene-greeting-msg">I've reviewed “{{ chatContext }}”. Ask me anything about the result.</p>
              <p v-else class="airene-greeting-msg">{{ moduleInfo.greeting }}</p>

              <!-- Contextual suggestions (chat opened about a task result) -->
              <div v-if="chatContext" class="airene-suggestion-list">
                <button v-for="s in contextSuggestions" :key="s" class="airene-suggestion-item" @click="sendMessage(s)">
                  <MpIcon name="airene-brand" size="sm" class="airene-sug-icon" />
                  {{ s }}
                </button>
              </div>

              <!-- Module-aware suggestions (general chat) -->
              <div v-else class="airene-suggestion-list">
                <button v-for="s in moduleInfo.suggestions" :key="s" class="airene-suggestion-item" @click="sendMessage(s)">
                  <MpIcon name="airene-brand" size="sm" class="airene-sug-icon" />
                  {{ s }}
                </button>
              </div>

              <!-- (legacy hardcoded finance suggestions kept out of render) -->
              <div v-if="false" class="airene-suggestion-list">
                <button class="airene-suggestion-item" @click="sendMessage('Import sales invoices')">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="airene-sug-icon">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M8.45 15H2.05C1.60818 15 1.25 14.6418 1.25 14.2V7.8C1.25 7.35818 1.60818 7 2.05 7H8.45C8.89182 7 9.25 7.35818 9.25 7.8V14.2C9.25 14.6418 8.89182 15 8.45 15ZM4.6168 10.9933L3.03984 13.4H4.18184L5.11992 11.7129C5.17422 11.6216 5.20938 11.549 5.2252 11.4954H5.23868C5.27266 11.5825 5.30898 11.6573 5.34746 11.7197L6.2582 13.4H7.39336L5.87422 10.98L7.35586 8.6H6.28886L5.4461 10.1164C5.38946 10.2257 5.33516 10.3384 5.28282 10.4544H5.27266C5.2455 10.3831 5.1957 10.2748 5.12324 10.1297L4.33476 8.6H3.17246L4.6168 10.9933Z" fill="#1FB088"/>
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M5.25 6C5.25 4.91621 5.5228 4.12733 6.00443 3.61223C6.47747 3.10631 7.25949 2.75 8.52778 2.75H13.9722C15.2405 2.75 16.0225 3.10631 16.4956 3.61223C16.9772 4.12733 17.25 4.91621 17.25 6V14C17.25 15.0838 16.9772 15.8727 16.4956 16.3878C16.0225 16.8937 15.2405 17.25 13.9722 17.25H8.52778C7.25949 17.25 6.47747 16.8937 6.00443 16.3878C5.68583 16.047 5.45861 15.5865 5.34129 15H3.81988C3.95549 15.9231 4.29617 16.7571 4.90877 17.4122C5.74475 18.3063 6.97662 18.75 8.52778 18.75H13.9722C15.5234 18.75 16.7553 18.3063 17.5912 17.4122C18.4186 16.5273 18.75 15.3162 18.75 14V6C18.75 4.68379 18.4186 3.47267 17.5912 2.58777C16.7553 1.69369 15.5234 1.25 13.9722 1.25H8.52778C6.97662 1.25 5.74475 1.69369 4.90877 2.58777C4.08136 3.47267 3.75 4.68379 3.75 6V7H5.25V6ZM13.9722 14.75H9.03094C9.16672 14.6066 9.25 14.413 9.25 14.2V13.25H13.9722C14.3864 13.25 14.7222 13.5858 14.7222 14C14.7222 14.4142 14.3864 14.75 13.9722 14.75ZM10.75 11.55H9.25V10.05H10.75C11.1642 10.05 11.5 10.3858 11.5 10.8C11.5 11.2142 11.1642 11.55 10.75 11.55ZM13.5139 4C13.5139 3.58579 13.1781 3.25 12.7639 3.25C12.3497 3.25 12.0139 3.58579 12.0139 4V5.6C12.0139 6.8991 13.0796 7.95 14.375 7.95H15.9861C16.4003 7.95 16.7361 7.61421 16.7361 7.2C16.7361 6.78579 16.4003 6.45 15.9861 6.45H14.375C13.8982 6.45 13.5139 6.0609 13.5139 5.6V4Z" fill="currentColor"/>
                  </svg>
                  Import sales invoices
                </button>
                <button class="airene-suggestion-item" @click="sendMessage('How much am I owed?')">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="airene-sug-icon">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M14.031 2.01702C14.4358 2.10476 14.6928 2.50406 14.6051 2.90887L14.5012 3.38816H15.6395C16.6436 3.38816 17.4817 4.00084 17.8347 4.84644C17.9161 5.03254 17.9708 5.22646 17.9998 5.42421C18.0122 5.46993 18.0204 5.51749 18.024 5.56649L18.7442 15.4679C18.8397 16.8361 17.7648 18 16.3886 18H3.63145C2.02129 18 0.883477 16.4283 1.35874 14.8979L4.42037 5.07263C4.72762 4.07908 5.64738 3.38816 6.69347 3.38816H8.14835L8.34266 2.58162C8.43967 2.17893 8.84476 1.93113 9.24745 2.02814C9.65015 2.12515 9.89795 2.53024 9.80094 2.93294L9.69127 3.38816H12.9664L13.1391 2.59114C13.2269 2.18632 13.6261 1.92928 14.031 2.01702ZM12.6413 4.88816H9.3299L9.04452 6.07276C8.94751 6.47545 8.54242 6.72325 8.13972 6.62624C7.73703 6.52922 7.48923 6.12413 7.58624 5.72144L7.78699 4.88816H6.69347C6.31439 4.88816 5.96889 5.14173 5.85362 5.51511L2.79125 15.3428C2.61205 15.9202 3.04515 16.5 3.63145 16.5H13.1884C13.6039 16.5 13.9516 16.2235 14.0443 15.8337L14.0462 15.8258L16.4964 5.99545C16.5474 5.78067 16.5255 5.59467 16.4591 5.44447C16.3226 5.11446 16.0138 4.88816 15.6395 4.88816H14.1761L13.9214 6.06324C13.8337 6.46805 13.4344 6.72509 13.0295 6.63735C12.6247 6.54961 12.3677 6.15032 12.4554 5.74551L12.6413 4.88816ZM16.888 10.6264L15.5026 16.185C15.4766 16.2936 15.4434 16.3987 15.4036 16.5H16.3886C16.8886 16.5 17.2828 16.0799 17.2478 15.5732L16.888 10.6264ZM6.12531 9.98182C6.12531 9.5676 6.46109 9.23182 6.87531 9.23182H12.6938C13.1081 9.23182 13.4438 9.5676 13.4438 9.98182C13.4438 10.396 13.1081 10.7318 12.6938 10.7318H6.87531C6.46109 10.7318 6.12531 10.396 6.12531 9.98182ZM5.39799 12.8891C5.39799 12.4749 5.73378 12.1391 6.14799 12.1391H11.9665C12.3807 12.1391 12.7165 12.4749 12.7165 12.8891C12.7165 13.3033 12.3807 13.6391 11.9665 13.6391H6.14799C5.73378 13.6391 5.39799 13.3033 5.39799 12.8891Z" fill="currentColor"/>
                  </svg>
                  How much am I owed?
                </button>
                <button class="airene-suggestion-item" @click="sendMessage('Compare revenue this month vs last month')">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="airene-sug-icon">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M2 1.25C2.41421 1.25 2.75 1.58579 2.75 2V15.6C2.75 16.5138 3.48621 17.25 4.4 17.25H18C18.4142 17.25 18.75 17.5858 18.75 18C18.75 18.4142 18.4142 18.75 18 18.75H4.4C2.65779 18.75 1.25 17.3422 1.25 15.6V2C1.25 1.58579 1.58579 1.25 2 1.25ZM17.6879 5.43041C18.0025 5.69988 18.0391 6.17334 17.7696 6.48792L14.0896 10.7839L14.0876 10.7862C13.1956 11.8191 11.6107 11.8794 10.6457 10.9143L9.88567 10.1543C9.54072 9.80519 8.96862 9.82241 8.64048 10.2012L4.96967 14.4878C4.70024 14.8025 4.22679 14.8391 3.91217 14.5697C3.59755 14.3002 3.56091 13.8268 3.83033 13.5122L7.50233 9.22418C8.39187 8.19418 9.97773 8.1152 10.9478 9.09517L11.7063 9.85368C12.053 10.2003 12.6274 10.181 12.9515 9.80678L16.6304 5.51208C16.8999 5.1975 17.3733 5.16094 17.6879 5.43041Z" fill="currentColor"/>
                  </svg>
                  Compare revenue this month vs last month
                </button>
                <button class="airene-suggestion-item" @click="sendMessage('How do I set up Mekari Pay?')">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="airene-sug-icon">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M5.4311 4.37041L7.5102 6.44951C8.21987 5.94632 9.08774 5.64994 10.024 5.64994C10.9479 5.64994 11.8052 5.93853 12.5096 6.42968L14.5689 4.3704C13.3216 3.35668 11.7322 2.74994 10 2.74994C8.2678 2.74994 6.67837 3.35668 5.4311 4.37041ZM15.6295 5.43106L13.5744 7.48616C14.0776 8.19583 14.374 9.06369 14.374 9.99994C14.374 10.9362 14.0776 11.8041 13.5744 12.5137L15.6295 14.5688C16.6433 13.3216 17.25 11.7321 17.25 9.99994C17.25 8.26775 16.6433 6.67833 15.6295 5.43106ZM14.5689 15.6295L12.5096 13.5702C11.8052 14.0613 10.9478 14.3499 10.024 14.3499C9.08775 14.3499 8.21989 14.0536 7.51022 13.5504L5.43112 15.6295C6.67839 16.6432 8.26781 17.2499 10 17.2499C11.7322 17.2499 13.3216 16.6432 14.5689 15.6295ZM4.37046 14.5688L6.45374 12.4855C5.9626 11.7811 5.674 10.9238 5.674 9.99994C5.674 9.07609 5.96259 8.21877 6.45373 7.51436L4.37044 5.43107C3.35673 6.67834 2.75 8.26775 2.75 9.99994C2.75 11.7321 3.35674 13.3216 4.37046 14.5688ZM3.8128 3.81277C5.39542 2.23014 7.58395 1.24994 10 1.24994C12.416 1.24994 14.6046 2.23014 16.1872 3.81276C17.7698 5.39538 18.75 7.5839 18.75 9.99994C18.75 12.416 17.7698 14.6045 16.1872 16.1871C14.6046 17.7697 12.416 18.7499 10 18.7499C7.58396 18.7499 5.39544 17.7697 3.81282 16.1871C2.2302 14.6045 1.25 12.416 1.25 9.99994C1.25 7.58391 2.23019 5.39539 3.8128 3.81277ZM10.024 7.14994C9.23197 7.14994 8.51657 7.47203 7.99924 7.99424C7.48828 8.51001 7.174 9.21754 7.174 9.99994C7.174 10.7823 7.48829 11.4899 7.99926 12.0057C8.51658 12.5279 9.23198 12.8499 10.024 12.8499C10.8064 12.8499 11.5139 12.5357 12.0297 12.0247C12.5519 11.5074 12.874 10.792 12.874 9.99994C12.874 9.20792 12.5519 8.49252 12.0297 7.97519C11.5139 7.46423 10.8064 7.14994 10.024 7.14994Z" fill="currentColor"/>
                  </svg>
                  How do I set up Mekari Pay?
                </button>
              </div>
            </div>

            <!-- Active chat messages -->
            <template v-if="messages.length > 0">
              <div v-for="(msg, i) in messages" :key="i" class="chat-message" :class="'chat-message--' + msg.role">
                <!-- Assistant avatar -->
                <img v-if="msg.role === 'assistant'" src="~/assets/airene-mascot.png" width="24" height="25" alt="" class="chat-avatar" />
                <div class="chat-bubble" :class="'chat-bubble--' + msg.role">
                  <!-- eslint-disable-next-line vue/no-v-html -->
                  <span v-if="msg.role === 'assistant'" class="chat-bubble__text chat-bubble__rich" v-html="renderMessage(msg.text)" />
                  <span v-else class="chat-bubble__text">{{ msg.text }}</span>
                </div>
              </div>
              <!-- Typing indicator -->
              <div v-if="isTyping" class="chat-message chat-message--assistant">
                <img src="~/assets/airene-mascot.png" width="24" height="25" alt="" class="chat-avatar" />
                <div class="chat-bubble chat-bubble--assistant chat-typing">
                  <span class="typing-dot" /><span class="typing-dot" /><span class="typing-dot" />
                </div>
              </div>
            </template>

          </div>

          <!-- Footer: input + disclaimer -->
          <div class="airene-footer">
            <div class="airene-input-box">
              <!-- Context chip — only when entry point is AI popover -->
              <div v-if="chatContext" class="airene-context-row">
                <span class="airene-context-chip">
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="airene-context-chip-icon">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M5.4311 4.37041L7.5102 6.44951C8.21987 5.94632 9.08774 5.64994 10.024 5.64994C10.9479 5.64994 11.8052 5.93853 12.5096 6.42968L14.5689 4.3704C13.3216 3.35668 11.7322 2.74994 10 2.74994C8.2678 2.74994 6.67837 3.35668 5.4311 4.37041ZM15.6295 5.43106L13.5744 7.48616C14.0776 8.19583 14.374 9.06369 14.374 9.99994C14.374 10.9362 14.0776 11.8041 13.5744 12.5137L15.6295 14.5688C16.6433 13.3216 17.25 11.7321 17.25 9.99994C17.25 8.26775 16.6433 6.67833 15.6295 5.43106ZM14.5689 15.6295L12.5096 13.5702C11.8052 14.0613 10.9478 14.3499 10.024 14.3499C9.08775 14.3499 8.21989 14.0536 7.51022 13.5504L5.43112 15.6295C6.67839 16.6432 8.26781 17.2499 10 17.2499C11.7322 17.2499 13.3216 16.6432 14.5689 15.6295ZM4.37046 14.5688L6.45374 12.4855C5.9626 11.7811 5.674 10.9238 5.674 9.99994C5.674 9.07609 5.96259 8.21877 6.45373 7.51436L4.37044 5.43107C3.35673 6.67834 2.75 8.26775 2.75 9.99994C2.75 11.7321 3.35674 13.3216 4.37046 14.5688ZM3.8128 3.81277C5.39542 2.23014 7.58395 1.24994 10 1.24994C12.416 1.24994 14.6046 2.23014 16.1872 3.81276C17.7698 5.39538 18.75 7.5839 18.75 9.99994C18.75 12.416 17.7698 14.6045 16.1872 16.1871C14.6046 17.7697 12.416 18.7499 10 18.7499C7.58396 18.7499 5.39544 17.7697 3.81282 16.1871C2.2302 14.6045 1.25 12.416 1.25 9.99994C1.25 7.58391 1.58579 5.39539 3.8128 3.81277ZM10.024 7.14994C9.23197 7.14994 8.51657 7.47203 7.99924 7.99424C7.48828 8.51001 7.174 9.21754 7.174 9.99994C7.174 10.7823 7.48829 11.4899 7.99926 12.0057C8.51658 12.5279 9.23198 12.8499 10.024 12.8499C10.8064 12.8499 11.5139 12.5357 12.0297 12.0247C12.5519 11.5074 12.874 10.792 12.874 9.99994C12.874 9.20792 12.5519 8.49252 12.0297 7.97519C11.5139 7.46423 10.8064 7.14994 10.024 7.14994Z" fill="currentColor"/>
                  </svg>
                  {{ chatContext }}
                  <button class="airene-context-remove" aria-label="Remove context" @click="chatContext = ''">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                  </button>
                </span>
              </div>
              <!-- Input row -->
              <div class="airene-input-placeholder-row">
                <input
                  v-model="inputText"
                  class="airene-real-input"
                  placeholder="Ask Airene..."
                  @keydown.enter.prevent="sendMessage(inputText)"
                />
              </div>
              <!-- Actions row -->
              <div class="airene-input-actions">
                <!-- + button -->
                <button class="airene-add-btn" aria-label="Add attachment">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <!-- Right side: model label + send button -->
                <div class="airene-input-right">
                  <!-- Gemini model label (chat is Gemini-backed) -->
                  <div class="airene-model-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="airene-gemini" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                          <stop offset="0" stop-color="#1BA1E3"/><stop offset="0.3" stop-color="#5489D6"/><stop offset="0.55" stop-color="#9B72CB"/><stop offset="0.8" stop-color="#D96570"/><stop offset="1" stop-color="#F49C46"/>
                        </linearGradient>
                      </defs>
                      <path d="M12 2c.3 4.9 4.8 9.4 9.7 9.7v.6C16.8 12.6 12.3 17.1 12 22h-.6c-.3-4.9-4.8-9.4-9.7-9.7v-.6C6.6 11.4 11.1 6.9 11.4 2H12z" fill="url(#airene-gemini)"/>
                    </svg>
                    Gemini Flash
                  </div>
                  <!-- Send button -->
                  <button class="airene-send-btn" aria-label="Send" @click="sendMessage(inputText)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 19V5M12 5L5 12M12 5L19 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <p class="airene-disclaimer">
              Mekari Airene can make mistakes.
              <a class="airene-disclaimer-link">Learn more</a>
            </p>
          </div>

        </div><!-- /airene-card -->
      </div><!-- /airene-slot -->
    </Transition>

  </div>

  <UnsavedChangesModal
    :is-open="unsavedChangesModal.isOpen.value"
    :has-save-draft="unsavedChangesModal.hasSaveDraft.value"
    @leave="unsavedChangesModal.chooseLeave"
    @draft="unsavedChangesModal.chooseDraft"
    @cancel="unsavedChangesModal.chooseCancel"
  />
</template>

<style scoped>
/* ── Page layout (flex row) ───────────────────────────────────────────────── */

.page-layout {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  overflow: hidden;
}

.page-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Title bar ────────────────────────────────────────────────────────────── */

.page-title-bar {
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
  flex-shrink: 0;
}

.page-title-actions {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

/* Title-bar actions wrapper — desktop is transparent (actions lay out inline);
   mobile collapses ≥2 actions into a single "Actions" dropdown. */
.page-actions { display: flex; align-items: center; position: relative; }
.page-actions-toggle { display: none; }
.page-actions-inner { display: contents; }

@media (max-width: 600px) {
  /* Only collapse when there are ≥2 action controls (single button stays inline). */
  .page-actions:has(.page-title-actions > :nth-child(2)) > .page-actions-toggle { display: inline-flex; }
  .page-actions:has(.page-title-actions > :nth-child(2)) > .page-actions-inner {
    display: none;
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 60;
    min-width: 220px; flex-direction: column; align-items: stretch; gap: var(--mp-spacing-2);
    background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default);
    border-radius: var(--mp-radii-md, 8px); padding: var(--mp-spacing-2);
    box-shadow: var(--mp-shadows-md, 0 8px 24px rgba(0,0,0,0.12));
  }
  .page-actions:has(.page-title-actions > :nth-child(2)) > .page-actions-inner.page-actions-inner--open { display: flex; }
  /* Inside the dropdown, actions stack full width. */
  .page-actions-inner--open .page-title-actions { display: flex; flex-direction: column; align-items: stretch; gap: var(--mp-spacing-2); }
  .page-actions-inner--open .page-title-actions > * { width: 100%; }
  .page-actions-inner--open .btn-enterprise { width: 100%; justify-content: center; }
  .page-actions-inner--open .import-wrap { width: 100%; }
}

/* Import is a secondary action — hide it on mobile to keep the title bar clean. */
@media (max-width: 600px) {
  .page-import-btn { display: none; }
  .page-title-bar { padding-left: var(--mp-spacing-4); padding-right: var(--mp-spacing-4); gap: var(--mp-spacing-2); }
  .page-title-text {
    font-size: var(--mp-font-sizes-xl, 20px);
    line-height: 26px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.page-title-text {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px);
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Import dropdown ────────────────────────────────────────────────────── */

.import-wrap {
  position: relative;
}

.visually-hidden-input {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.import-chevron {
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

/* Split pill (e.g. "New account ▾") — still ONE button, with a hairline between
   the label and the caret so the menu affordance reads as its own half. */
.btn-enterprise--split {
  gap: var(--mp-spacing-2);
  padding-right: var(--mp-spacing-2);
}
.btn-enterprise__split-divider {
  width: var(--mp-sizes-px, 1px);
  align-self: stretch;
  margin: calc(var(--mp-spacing-1) * -1) 0;
  background: currentColor;
  opacity: 0.3;
  flex-shrink: 0;
}
.import-chevron--open {
  transform: rotate(180deg);
}

.btn-enterprise--active {
  background: var(--mp-background-neutral-hovered);
}

.import-dropdown {
  position: absolute;
  top: calc(100% + var(--mp-spacing-1));
  right: 0;
  width: 220px;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  box-shadow: var(--mp-shadows-sm);
  padding: var(--mp-spacing-2) 0;
  z-index: 300;
  overflow: hidden;
}

.import-group {
  display: flex;
  flex-direction: column;
}

.import-group--bordered {
  border-bottom: 1px solid var(--mp-border-default);
  padding-bottom: var(--mp-spacing-2);
  margin-bottom: 0;
}

.import-item {
  display: flex !important;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 100% !important;
  min-width: 0 !important;
  padding: var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: none !important;
  border: none !important;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  text-align: left;
}
.import-item:hover {
  background: var(--mp-background-neutral-subtle) !important;
}

.import-item--ai {
  justify-content: flex-start;
  gap: var(--mp-spacing-2);
}
/* MpIcon's size prop leaves airene-brand at its natural (oversized) dimensions. */
.import-item__ai-icon {
  width: var(--mp-sizes-3\.5, 14px) !important;
  height: var(--mp-sizes-3\.5, 14px) !important;
  flex-shrink: 0;
}

/* MpButton centres its label; menu rows read as a list only when left-aligned. */
.import-item--start {
  justify-content: flex-start;
}


/* Forward bills section */
.import-forward {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}

.import-forward__labels {
  display: flex;
  flex-direction: column;
}

.import-forward__title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

.import-forward__email {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

.import-forward__copy {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-link);
  text-decoration: underline;
  cursor: pointer;
  text-underline-offset: 2px;
  width: fit-content;
}
.import-forward__copy:hover {
  text-decoration-thickness: 2px;
}

.import-forward__desc {
  margin: 0;
  font-size: var(--mp-font-sizes-2xs, 10px);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-2xs, 12px);
  color: var(--mp-text-secondary);
}

/* ── Stage ────────────────────────────────────────────────────────────────── */

.stage-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-12, 48px);
  color: var(--mp-text-placeholder);
}

.stage {
  flex: 1;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  overflow-x: hidden;
  overflow-y: auto;
  /* side/bottom padding scrolls with content; the top gap is a fixed border
     (borders don't scroll) so content keeps a 24px gap from the stage's top edge.
     The gap is 23px border + 1px padding (still 24px total): the 1px padding lands
     the first child JUST inside the overflow clip boundary, so a top-border element
     flush at the top (e.g. the rounded filter-bar search) isn't shaved by the clip.
     Bottom is 80px so the last row of content clears the fold with breathing room. */
  padding: 1px var(--mp-spacing-6) var(--mp-spacing-20, 80px);
  border-top: calc(var(--mp-spacing-6) - 1px) solid var(--mp-background-stage);
  /* Keep focus scroll-into-view clear of the fixed top border too. */
  scroll-padding-top: var(--mp-spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}
/* HR home wants a full-bleed cream header flush to the very top — drop the 24px
   top border (the gap) and the rounded top corners so its hero reaches the edge. */
.stage.stage--flush-top {
  border-top-width: 0;
  border-radius: 0;
}
/* Report index draws an edge-to-edge card grid — no stage padding/top gap. */
.stage--flush {
  padding: 0;
  border-top-width: 0;
  gap: 0;
}

/* ── Status tabs (between title bar and stage, on the gray surface) ───────── */

.page-tabs {
  display: flex;
  gap: var(--mp-spacing-5);
  padding: 0 var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle);
  flex-shrink: 0;
}

.page-tabs-bar {
  display: flex;
  align-items: flex-end;
  gap: var(--mp-spacing-5);
  padding: 0 var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle);
  flex-shrink: 0;
}

.cycle-count-banner {
  flex-shrink: 0;
}

.page-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  white-space: nowrap;
  transition: color 100ms;
}

/* Count badge on a tab */
.page-tab-count {
  margin-left: var(--mp-spacing-1);
}

.page-tab:not(.page-tab--active):hover {
  color: var(--mp-text-default);
}

.page-tab--active {
  color: var(--mp-text-selected);
  font-weight: var(--mp-font-weights-semi-bold);
}

.page-tab--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--mp-text-selected);
  border-radius: var(--mp-radii-sm, 2px) var(--mp-radii-sm, 2px) 0 0;
}

/* Placeholder shown in the stage for a tabbed page (until real screens exist) */
.tab-stage-placeholder {
  margin: auto;
  text-align: center;
}
.tab-stage-placeholder__title {
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.tab-stage-placeholder__desc {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

/* ── Airene slot (outer wrapper) ─────────────────────────────────────────── */

.airene-slot {
  /* width is set dynamically via :style */
  flex-shrink: 0;
  background: var(--mp-background-neutral-subtle);
  padding: var(--mp-spacing-3);
  display: flex;
  gap: var(--mp-spacing-2);
  position: relative;
  overflow: hidden;
}

/* Left edge divider — resize handle */
.airene-divider {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--mp-spacing-3);               /* wider invisible hitbox */
  cursor: col-resize;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Visible pill inside the hitbox */
.airene-divider::after {
  content: '';
  display: block;
  width: 2px;
  height: var(--mp-spacing-10, 40px);
  background: var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  transition: background 0.15s;
}
.airene-divider:hover::after {
  background: var(--mp-border-bold);
}

/* White inner card */
.airene-card {
  flex: 1;
  background: var(--mp-background-neutral);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ── Card header ─────────────────────────────────────────────────────────── */

.airene-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  flex-shrink: 0;
}

/* History wrapper — anchor for the dropdown. min-width:0 lets the title
   truncate so the header icons on the right never get clipped. */
.airene-history-wrapper {
  position: relative;
  min-width: 0;
  flex: 1 1 auto;
}

.airene-new-chat {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  border-radius: var(--mp-radii-md);
  line-height: var(--mp-line-heights-md);
  min-width: 0;
  max-width: 100%;
}
.airene-new-chat:hover { background: var(--mp-background-neutral-hovered); }

.airene-chat-title {
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.airene-chevron {
  flex-shrink: 0;
  color: var(--mp-text-secondary);
  transition: transform 0.15s ease;
}
.airene-chevron--open {
  transform: rotate(180deg);
}

/* History dropdown */
.airene-history-dropdown {
  position: absolute;
  top: calc(100% + var(--mp-spacing-1));
  left: 0;
  width: 256px;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 10px);
  box-shadow: var(--mp-shadows-md);
  z-index: 200;
  padding: var(--mp-spacing-1) 0;
  max-height: 360px;
  overflow-y: auto;
}

.airene-history-new-btn {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-medium, 500);
  color: var(--mp-text-default);
  text-align: left;
  border-radius: var(--mp-radii-md);
}
.airene-history-new-btn:hover { background: var(--mp-background-neutral-subtle); }

.airene-history-sep {
  height: 1px;
  background: var(--mp-border-default);
  margin: var(--mp-spacing-1) 0;
}

.airene-history-group {
  margin: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-xs, 11px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-subtle);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-wide, 0.4px);
  line-height: var(--mp-line-heights-sm, 16px);
}

.airene-history-item {
  display: block;
  width: 100%;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm, 13px);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: var(--mp-radii-sm);
}
.airene-history-item:hover { background: var(--mp-background-neutral-subtle); }

.airene-header-icons {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.airene-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-md);
  color: var(--mp-text-secondary);
  padding: var(--mp-spacing-2);
}
.airene-icon-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Kebab (…) menu — clear / delete chat */
.airene-kebab-wrapper { position: relative; display: inline-flex; }
.airene-kebab-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 60;
  min-width: 160px;
  padding: var(--mp-spacing-1, 4px);
  background: var(--mp-background-default, #fff);
  border: 1px solid var(--mp-border-default, #e0e2e6);
  border-radius: var(--mp-radii-lg, 12px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.14);
}
.airene-kebab-item {
  display: block;
  width: 100%;
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-radius: var(--mp-radii-md, 8px);
}
.airene-kebab-item:hover { background: var(--mp-background-neutral-subtle); }
.airene-kebab-item--danger { color: var(--mp-text-critical, #d3382e); }

/* ── Chat body ───────────────────────────────────────────────────────────── */

.airene-chat-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: var(--mp-spacing-3);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

/* When messages exist: align from top, enable scroll */
.airene-chat-body--has-messages {
  justify-content: flex-start;
  overflow-y: auto;
}

/* ── Chat messages ────────────────────────────────────────────────────────── */

.chat-message {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-2);
  margin-bottom: var(--mp-spacing-3);
  flex-shrink: 0;
}

.chat-message--user {
  flex-direction: row-reverse;
}

.chat-avatar {
  flex-shrink: 0;
  border-radius: var(--mp-radii-full, 50%);
}

.chat-bubble {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-radius: var(--mp-radii-lg, 12px);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  max-width: 85%;
  word-break: break-word;
}

.chat-bubble__text {
  white-space: pre-wrap;
}

.chat-bubble--user {
  background: var(--mp-airene-default);
  color: var(--mp-text-inverse);
  border-radius: var(--mp-radii-lg, 12px) var(--mp-radii-sm) var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px);
}

.chat-bubble--assistant {
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-default);
  border-radius: var(--mp-radii-sm) var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px);
}

/* Rich (markdown-rendered) assistant text — v-html content needs :deep() to be
   reached by scoped styles. */
.chat-bubble__rich { white-space: normal; }
.chat-bubble__rich :deep(.chat-md-p) { margin: 0; }
.chat-bubble__rich :deep(.chat-md-p + .chat-md-p) { margin-top: var(--mp-spacing-2, 8px); }
.chat-bubble__rich :deep(.chat-md-h) { margin: var(--mp-spacing-3, 12px) 0 var(--mp-spacing-1, 4px); font-weight: var(--mp-font-weights-semi-bold, 600); }
.chat-bubble__rich :deep(.chat-md-h:first-child) { margin-top: 0; }
.chat-bubble__rich :deep(.chat-md-ul) { margin: var(--mp-spacing-1, 4px) 0; padding-inline-start: var(--mp-spacing-4, 16px); }
.chat-bubble__rich :deep(.chat-md-ul li) { margin: 2px 0; }
.chat-bubble__rich :deep(strong) { font-weight: var(--mp-font-weights-semi-bold, 600); }
.chat-bubble__rich :deep(code) { font-family: var(--mp-fonts-mono, monospace); font-size: 0.9em; background: rgba(0,0,0,0.05); padding: 0 4px; border-radius: 4px; }

/* Employee mention chip */
.chat-bubble__rich :deep(.emp-chip) {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1, 4px);
  position: relative;
  padding: 1px var(--mp-spacing-1\.5, 6px) 1px 2px;
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-bold, #eceef0);
  cursor: default;
  outline: none;
  vertical-align: baseline;
  line-height: 1.4;
}
.chat-bubble__rich :deep(.emp-chip-name) { font-weight: var(--mp-font-weights-semi-bold, 600); }
.chat-bubble__rich :deep(.emp-chip-av) {
  width: 18px; height: 18px; flex-shrink: 0;
  border-radius: var(--mp-radii-full, 50%);
  background-size: cover; background-position: center;
  background-color: var(--mp-background-brand-subtle, #d8e6ff);
  display: inline-flex; align-items: center; justify-content: center;
}
.chat-bubble__rich :deep(.emp-chip-av--ini) { font-size: 9px; font-weight: 700; color: var(--mp-text-brand, #1d55d4); }

/* Hover / focus coachmark */
.chat-bubble__rich :deep(.emp-coach) {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 50;
  display: none;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  min-width: 200px;
  padding: var(--mp-spacing-3, 12px);
  border-radius: var(--mp-radii-lg, 12px);
  background: var(--mp-background-default, #fff);
  border: 1px solid var(--mp-border-default, #e0e2e6);
  box-shadow: 0 8px 24px rgba(0,0,0,0.14);
  white-space: normal;
  cursor: default;
}
.chat-bubble__rich :deep(.emp-chip:hover .emp-coach),
.chat-bubble__rich :deep(.emp-chip:focus .emp-coach),
.chat-bubble__rich :deep(.emp-chip:focus-within .emp-coach) { display: flex; }
.chat-bubble__rich :deep(.emp-coach-av) {
  width: 36px; height: 36px; flex-shrink: 0;
  border-radius: var(--mp-radii-full, 50%);
  background-size: cover; background-position: center;
  background-color: var(--mp-background-brand-subtle, #d8e6ff);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 13px;
}
.chat-bubble__rich :deep(.emp-coach-body) { display: flex; flex-direction: column; gap: 1px; }
.chat-bubble__rich :deep(.emp-coach-name) { font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); font-size: var(--mp-font-sizes-sm, 14px); }
.chat-bubble__rich :deep(.emp-coach-meta) { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-secondary); }

/* Typing indicator dots */
.chat-typing {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3);
  min-height: var(--mp-sizes-9, 36px);
}

.typing-dot {
  width: var(--mp-sizes-1\.5, 6px);
  height: var(--mp-sizes-1\.5, 6px);
  border-radius: var(--mp-radii-full, 50%);
  background: var(--mp-text-secondary);
  flex-shrink: 0;
  animation: typingBounce 1.2s infinite ease-in-out;
}

.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typingBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%            { transform: translateY(-5px); opacity: 1; }
}

.airene-greetings {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  flex-shrink: 0;
}

.airene-gem-icon {
  flex-shrink: 0;
  line-height: 0;
}

/* Mascot wrapper — THIS is what gets the body transform, so eyes rotate with it */
.mascot-wrapper {
  position: relative;
  display: inline-block;
  width: 60px;             /* mascot artwork — fixed asset dimensions */
  height: 63px;
  will-change: transform;
  transform-origin: center bottom;  /* tilt from the base */
}

.airene-mascot-img {
  display: block;
  width: 60px;             /* mascot artwork — fixed asset dimensions */
  height: 63px;
  /* no transform here — wrapper handles it */
}

/* Eyes drawn on the star body */
.mascot-eye {
  position: absolute;
  width: 9px;              /* mascot eye — fixed pixel positions */
  height: 9px;
  border-radius: var(--mp-radii-full, 50%);
  background: var(--mp-background-neutral);
  overflow: hidden;          /* clips pupil inside the white disc */
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(80,30,140,0.10);  /* subtle outline */
}

/*
 * From pixel analysis: star body center x≈27, wide area y=25–44
 * Eye centers: left=(20, 32)  right=(34, 32)  — symmetric around x=27
 * CSS left/top = center − half eye-div width (9px / 2 = 4.5)
 */
.mascot-eye--left  { left: 18px; top: 33px; }
.mascot-eye--right { left: 33px; top: 33px; }

.mascot-pupil {
  width: 5px;              /* mascot pupil — fixed pixel size */
  height: 5px;
  border-radius: var(--mp-radii-full, 50%);
  background: #1a0a2e;     /* mascot pupil — illustration colour, not a UI token */
  will-change: transform;
  flex-shrink: 0;
}

.airene-greeting-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 24px);
  color: var(--mp-text-default);
}

/* Agent switcher */
.airene-agent-wrap { position: relative; margin-top: var(--mp-spacing-2, 8px); }
.airene-agent-btn, .airene-agent-static { display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5, 6px); padding: var(--mp-spacing-1, 4px) var(--mp-spacing-2, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral, #fff); border-radius: var(--mp-radii-full, 999px); font-family: inherit; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.airene-agent-btn { cursor: pointer; }
.airene-agent-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); border-color: var(--mp-border-bold, #8c9596); }
.airene-agent-av { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; background: var(--mp-background-neutral-subtle, #f8f9f9); flex: 0 0 auto; }
.airene-agent-name { font-weight: var(--mp-font-weights-medium, 500); }
.airene-agent-btn svg { color: var(--mp-text-secondary); }
.airene-agent-backdrop { position: fixed; inset: 0; z-index: 40; }
.airene-agent-menu { position: absolute; top: calc(100% + 4px); left: 50%; transform: translateX(-50%); z-index: 50; min-width: 240px; max-height: 320px; overflow-y: auto; background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); box-shadow: var(--mp-shadows-md); padding: var(--mp-spacing-1, 4px); text-align: left; }
.airene-agent-item { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); width: 100%; padding: var(--mp-spacing-2, 8px); border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; font-family: inherit; text-align: left; }
.airene-agent-item:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.airene-agent-item.is-active { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.airene-agent-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.airene-agent-role { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.airene-agent-check { color: var(--mp-icon-brand, #029861); flex: 0 0 auto; }

.airene-greeting-msg {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

/* Suggestion list */
.airene-suggestion-list {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.airene-suggestion-item {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  text-align: left;
  line-height: var(--mp-line-heights-md);
  width: 100%;
}
.airene-suggestion-item:hover { opacity: 0.7; }

.airene-sug-icon {
  flex-shrink: 0;
  margin-top: 0;
}

/* ── Footer ──────────────────────────────────────────────────────────────── */

.airene-footer {
  flex-shrink: 0;
  padding: var(--mp-spacing-3);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

/* Input box: white rounded rectangle */
.airene-input-box {
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
  padding: var(--mp-spacing-2);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
}

/* Context chip row */
.airene-context-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mp-spacing-1);
  padding-bottom: var(--mp-spacing-1);
}

.airene-context-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  padding: 3px var(--mp-spacing-1\.5) 3px var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-default);
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.airene-context-chip-icon {
  flex-shrink: 0;
  color: var(--mp-text-subtle);
}

.airene-context-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--mp-sizes-3\.5, 14px);
  height: var(--mp-sizes-3\.5, 14px);
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--mp-text-subtle);
  padding: 0;
  border-radius: var(--mp-radii-full, 50%);
}
.airene-context-remove:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

.airene-input-placeholder {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-placeholder);
}

.airene-real-input {
  width: 100%;
  border: none;
  outline: none;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  background: transparent;
  padding: 0;
}

.airene-real-input::placeholder {
  color: var(--mp-text-placeholder);
}

/* Actions row */
.airene-input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.airene-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-7, 28px);
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-secondary);
}
.airene-add-btn:hover { background: var(--mp-background-neutral-subtle); }

.airene-input-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}

.airene-model-label {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  cursor: pointer;
}
.airene-model-label:hover { opacity: 0.7; }

.airene-send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border: none;
  background: var(--mp-background-neutral-subtle);
  border-radius: var(--mp-radii-full, 999px);
  cursor: pointer;
  flex-shrink: 0;
}
.airene-send-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Disclaimer */
.airene-disclaimer {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

.airene-disclaimer-link {
  color: var(--mp-text-link);
  cursor: pointer;
  text-decoration: none;
}
.airene-disclaimer-link:hover { text-decoration: underline; }

/* ── Panel slide transition ───────────────────────────────────────────────── */

.panel-enter-active, .panel-leave-active {
  transition: opacity 0.2s ease, max-width 0.2s ease;
  overflow: hidden;
}
.panel-enter-from, .panel-leave-to {
  opacity: 0;
  max-width: 0;
}
.panel-enter-to, .panel-leave-from {
  opacity: 1;
  max-width: 640px; /* generous upper bound */
}
</style>
