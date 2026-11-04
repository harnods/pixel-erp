/**
 * Dev change registry — the "what changed & where" annotations engineers see via
 * the DevChangesOverlay (a pulse + coachmark on each changed element).
 *
 * How it works:
 *  1. Tag the changed element in the template with `data-devchange="<id>"`.
 *  2. Add an entry here keyed by that same `<id>` with a human-readable summary.
 * The overlay scans the current page for `[data-devchange]`, looks the id up here,
 * and draws a pulsing marker + coachmark anchored to the element. No brittle CSS
 * selectors, no per-route wiring — the marker lives wherever the attribute lives.
 *
 * Keep entries newest-first. `date` is ISO (YYYY-MM-DD); convert relative dates.
 */
export interface DevChange {
  /** Stable id — must match the element's `data-devchange` attribute. */
  id: string
  /** Short headline of the change. */
  title: string
  /** One or two sentences: what changed and why. */
  description: string
  /** ISO date the change shipped. */
  date: string
  /** Optional PR reference (e.g. "#82") shown as a link when it's a number. */
  pr?: string
  /** Optional files touched — shown as chips for quick orientation. */
  files?: string[]
}

export const DEV_CHANGES: DevChange[] = [
  {
    id: 'icon-names-fixed',
    title: 'Missing icons now show (no more 404s in the console)',
    description:
      'Several icons asked Pixel for names it does not have, so they rendered blank and left a 404 in the console on every page that mounted them — the work order page among them. Fixed to the real Pixel names: information → info (work order Adjust / Edit materials / Request additional stock modals, Production settings, product, sales and purchase invoice details, CRM deal), warning → warning-triangle (rejected-demand note on the work order), document → doc (attachment chips on New work order and New bill of materials), trash → delete (saved-view delete in the GL, budget variance and multidimensional reports), caret-left → chevrons-left (budget variance year picker), chevron-down → chevrons-down (shipping details), info-circle → info (knowledge-base warning). A test now checks every icon name against Pixel\'s own list.',
    date: '2026-11-03',
    files: ['WorkOrderDetailsPage.vue', 'ProductionSettingsPage.vue', 'CreateWorkOrderPage.vue', 'CreateBillOfMaterialsPage.vue'],
  },
  {
    id: 'wo-raw-bulk-set',
    title: 'New work order: bulk set warehouse and required date',
    description:
      'UC-01 C-2. Raw materials now has a tickbox per component and a select-all in the header. With components ticked, the header row becomes a bulk bar: "Set warehouse" puts one warehouse on every ticked component (a batch or serial pick made for the old warehouse is cleared), and "Set required date" puts one required date on all of them — days outside the production plan stay greyed out (C-1). The selection stays after a set, so both can be set in turn; Esc deselects. This replaces the old "Bulk set warehouse" tickbox above the table, which did nothing.',
    date: '2026-11-03',
    files: ['CreateWorkOrderPage.vue'],
  },
  {
    id: 'bom-teak-wood-table',
    title: 'Sample data: Teak Wood Table and its bill of materials',
    description:
      'A furniture sample alongside the coffee range. New products: Teak Wood Table 120x60 (Furniture, SKU 4001) and its wood materials (SKU 41xx): Teak Wood Plank, Teak Table Leg, Wood Screw, Wood Glue, Wood Varnish, and Teak Wood Offcuts. Bill of Materials #10011 builds one table from 3 planks, 4 legs, screws, glue and varnish, through Fitting, Assembly, Painting and Quality control, with direct labor, machine depreciation and electricity. The offcuts come off as an Other output (2%) beside 3% production waste, so the table keeps 95% of the Rp3.330.000 production cost. The products are stocked in every warehouse but kept out of the seeded orders, receipts and invoices, which stay exactly as before. They have no photo yet, so the product page shows the coloured initial tile instead of a broken image.',
    date: '2026-11-03',
    files: ['catalog.ts', 'billOfMaterials.ts', 'inventory.ts', 'productsIndex.ts', 'ProductDetailsPage.vue'],
  },
  {
    id: 'wo-finished-goods-sample',
    title: 'Finished goods: sample Other outputs, and empty states',
    description:
      'Six of the ten seed bills of materials now make by-products, so the Other outputs table under Finished goods has rows on the bill and on every work order made from it: roast batches pack their tail end as Signature Espresso 250g bags or Cold Brew Coarse, and machine builds pack a Knock Box or Distribution Tool into the box. Each by-product takes a percentage of the production cost and the main output keeps the rest, so the subtotals still add up to the total production cost. The other four bills keep none, and on a work order Other outputs and Production waste now show an empty state instead of a blank table.',
    date: '2026-11-03',
    files: ['billOfMaterials.ts', 'WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wo-approval-hide-locked',
    title: 'Work order: Start / Complete is hidden while approval runs',
    description:
      'Clicking Start (or Complete) on a work order with a pending request used to show a red "locked" banner. Every other module with approval — Stock adjustment, Warehouse transfer, Purchase order, Bill — simply leaves actions that aren\'t allowed out of the page, so the work order now does the same: Start / Complete and Material consume & return\'s New record are hidden until the request is decided. The pending notice still says who it is waiting for.',
    date: '2026-10-15',
    files: ['WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wod-adjust-materials',
    title: 'Work order: "Adjust materials" sits beside the approval "Adjust work order"',
    description:
      'Merged feature/work-order-approval. Its "Adjust work order" (planned qty, approval-aware) and material-reserve\'s UC-06 Adjust (material qty and request dates on the stock request) are different changes, so both stay — the latter renamed "Adjust materials". Both hide while an approval request is pending. Cancel is now approval\'s "Cancel/close work order", which also releases the stock-request reservation; Start runs the reservation gate before going to approval.',
    date: '2026-10-15',
    files: ['WorkOrderDetailsPage.vue', 'woApproval.ts'],
  },
  {
    id: 'ps-reservation-toggle',
    title: 'Production settings: reservation can be switched off again',
    description:
      'The PRD (12 Oct) restored "a toggle to disable / enable the reservation" and deleted L-12. Off: work orders raise no stock request, show no readiness, Reserved qty, Reservation menu, Adjust or Edit materials, and start without a reservation gate. Requests already raised stay on Stock requests.',
    date: '2026-10-14',
    files: ['productionSettings.ts', 'ProductionSettingsPage.vue', 'WorkOrderDetailsPage.vue', 'CreateWorkOrderPage.vue'],
  },
  {
    id: 'ps-start-gate-partial-mode',
    title: 'Production settings: no separate "start with limited stock" toggle',
    description:
      'S-4 "is not introduced as a separate toggle" any more. The start gate follows the partial mode alone — partial consume: one component reserved; partial completion: every component holds some; neither: everything reserved in full. This note spells out the rule for the current setting.',
    date: '2026-10-14',
    files: ['productionSettings.ts', 'stockRequests.ts', 'ProductionSettingsPage.vue'],
  },
  {
    id: 'wo-request-date-plan-window',
    title: 'New work order: request dates stay inside the production plan',
    description:
      'C-1 — a raw material\'s request date can\'t be before the planned start or after the planned finish. Rows default to the plan start, follow it when the plan moves, days outside the plan are greyed out, and Save names any row still outside.',
    date: '2026-10-14',
    files: ['CreateWorkOrderPage.vue'],
  },
  {
    id: 'unreserve-no-disposition',
    title: 'Unreserve: no disposition to choose',
    description:
      'UC-03 dropped the return-to-warehouse / production-defect choice. Released stock always goes back to available warehouse stock; the modal says so instead of asking.',
    date: '2026-10-14',
    files: ['UnreserveMaterialsModal.vue', 'stockRequests.ts', 'WorkOrderDetailsPage.vue', 'StockRequestDetailsPage.vue'],
  },
  {
    id: 'wo-edit-auto-unreserve',
    title: 'Edit materials: a qty change on a reserved component releases it',
    description:
      'UC-06 (12 Oct): "System will unreserve remaining reserved qty", then the line is updated in place. The old "unreserve first" block is gone; the modal warns before saving, and under One-step the line is re-reserved on the same save when stock covers it in full.',
    date: '2026-10-14',
    files: ['stockRequests.ts', 'EditWorkOrderMaterialsModal.vue', 'WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wo-cost-routing-as-created',
    title: 'Work order: production cost and routing are the ones you entered',
    description:
      'Like raw materials, the production cost and routing rows on New work order were never saved, so the work order page showed the BOM\'s — one line per cost group at most. Both are now stored on the work order; each cost group lists every line it has, and the estimated total and main-output cost follow. Older work orders fall back to their BOM.',
    date: '2026-10-06',
    files: ['workOrders.ts', 'CreateWorkOrderPage.vue', 'WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wo-create-remove-row',
    title: 'New work order: the ⊖ remove button works again',
    description:
      'Every ⊖ on New work order (raw materials, production cost, routing, other outputs, waste) threw an error and removed nothing: the template passed the auto-unwrapped row array to a helper that expected the ref. The helper now removes the row from the array in place.',
    date: '2026-10-06',
    files: ['CreateWorkOrderPage.vue'],
  },
  {
    id: 'wo-raw-materials-as-created',
    title: 'Work order: raw materials are the ones you entered, not the BOM\'s',
    description:
      'Raw materials added, removed or re-quantified on New work order were saved to the stock request but never to the work order, so its detail page and the material consume / return form listed the BOM instead. The rows are now stored on the work order (with the warehouse picked per row) and both surfaces read them; older work orders fall back to their BOM.',
    date: '2026-10-06',
    files: ['workOrders.ts', 'stockRequests.ts', 'CreateWorkOrderPage.vue', 'WorkOrderDetailsPage.vue', 'NewMaterialRecordPage.vue'],
    id: 'wod-material-reservation',
    title: 'Work order: Material reservation moves onto the materials it acts on',
    description:
      'The Reservation button has left the title bar for a row directly above the Raw materials table — the components it reserves are the rows beneath it, not the work order as a whole. It is now labelled Material reservation, is the black tertiary button that search-adjacent and section-toolbar actions use (rule/filter-bar-action-tertiary), and carries a chevron so it reads as the dropdown it always was. Reserve and Unreserve open as drawers rather than modals, and the approval note in Unreserve leads the content: it qualifies everything below it — that the release happens immediately, unapproved — so it has to be read before the components are picked.',
    date: '2026-10-19',
    files: ['WorkOrderDetailsPage.vue', 'ReserveMaterialsModal.vue', 'UnreserveMaterialsModal.vue'],
  },
  {
    id: 'erp-drawer-width',
    title: 'ErpDrawer: the width prop actually applies now',
    description:
      'Every drawer in the app was rendering at the flex fallback width instead of the one its caller asked for. The panel width was built into a Panda CSS class from a prop, and Panda extracts classes statically at build time — so the class landed on the element with no rule behind it, and not one mp-w_min(...) rule existed in the built stylesheet. The width is an inline style now, so all ~20 drawers take the width they were written with.',
    date: '2026-10-19',
    files: ['ErpDrawer.vue'],
  },
  {
    id: 'srd-warehouse-tables',
    title: 'Stock request detail: the warehouse tables share one column grid',
    description:
      'Each destination warehouse renders its own table, and each was sizing to its own content — so the headers stepped sideways down the page and no two groups could be read against each other. They now share a fixed column template, so every group lines up. Status moved to sit after Required date, Requestor moved last (it is provenance, not something acted on), and the dashed rule between groups is gone — the heading and its spacing already separate them.',
    date: '2026-10-19',
    files: ['StockRequestDetailsPage.vue'],
  },
  {
    id: 'sr-backdate-tooltip',
    title: 'Stock requests: the backdate warning moves onto Available qty',
    description:
      'W-6 explains why a component shows negative availability. Spelled out under the product name it wrapped to six lines and set the height of the entire row — 153px against the 46px of its neighbours — while sitting in a column it says nothing about. It is now a warning-triangle after the Available figure it explains, with the reason and the transaction on hover.',
    date: '2026-10-19',
    files: ['StockRequestsPage.vue'],
  },
  {
    id: 'sr-view-default-transaction',
    title: 'Stock requests: By transaction leads, and is the default view',
    description:
      'The switcher now reads By transaction / By product, and opens on By transaction. A row there IS a record — it has a number, a detail page and actions. By product is the aggregate lens over the same requests: useful when sourcing one component, but a row is a rollup with no record behind it, which is a strange thing to land on first.',
    date: '2026-10-19',
    files: ['StockRequestsPage.vue'],
  },
  {
    id: 'sr-seed-depth',
    title: 'Stock requests: enough data to page, sort and filter against',
    description:
      'The seed bills of materials now carry 1 to 10 components each instead of 1 or 2, and fourteen more work orders were added — seven active, seven canceled. Awaiting holds 19 requests over 31 component rows, Closed holds 11 over 29, and the breakdown under a row varies from 1 to 10 in both views. Because a request mirrors its work order\'s bill, the depth comes from the BOMs rather than from numbers invented at the request.',
    date: '2026-10-19',
    files: ['billOfMaterials.ts', 'workOrders.ts', 'stockRequests.ts'],
  },
  {
    id: 'sr-view-parity',
    title: 'Stock requests: both views cover the same requests on Closed',
    description:
      'Settled lines are kept out of the product rollup so they cannot inflate what is still to do — but the Closed tab is made of settled requests, so that rule emptied it: 11 requests By transaction against 2 rows By product. The rollup now takes a flag, set on Closed only. The two views are one data set seen two ways, and a test holds them to it.',
    date: '2026-10-19',
    files: ['stockRequests.ts', 'StockRequestsPage.vue', 'stock-request-dashboard.spec.ts'],
  },
  {
    id: 'sr-filters-complete',
    title: 'Stock requests: the drawer holds every filter, and the bar stops wrapping',
    description:
      'All filters now repeats Product, Destination warehouse and Request date alongside its own Keywords and Status, bound to the same state as the pills so the two can never disagree, and its badge counts every filter rather than only its own. The Request date in the drawer used to filter by a line\'s REQUIRED date despite its label; it now means what the pill means. The date field is sized to the range it prints instead of 288px, and when the bar runs out of room the left group wraps rather than the right, which used to detach the icon tools above the search.',
    date: '2026-10-19',
    files: ['StockRequestsPage.vue', 'StockRequestFiltersDrawer.vue'],
  },
  {
    id: 'erp-table-empty-pinned',
    title: 'Tables: the filtered-empty state stays put when the table scrolls sideways',
    description:
      'A table wide enough to scroll put its "nothing matches your filters" block across the full width of every column, so scrolling right carried the illustration and its Clear all filters link off screen. The block is now pinned to the visible area and sized to it, so it stays centred in view at any scroll position. ErpTablePage owns this, so every table gets it.',
    date: '2026-10-19',
    files: ['ErpTablePage.vue'],
  },
  {
    id: 'sr-by-transaction-columns',
    title: 'Stock requests: the By transaction table carries its own qty block',
    description:
      'The two views now read the same way. The chevron moved to the right edge of the stock request number, where the product name already keeps it, so the toggle sits at one x down the whole column. Status and Destination warehouse follow the work order number, and the request gained Available, Reserved and Remaining qty beside Required, in the By product order, with the unit split into its own column. Each figure sums the request lines, as Required qty already did — except the unit, which stays blank when a request holds lines in two different units, because no single unit is true then. Request type is gone from this view too.',
    date: '2026-10-15',
    files: ['StockRequestsPage.vue'],
  },
  {
    id: 'sr-closed-tab-filters',
    title: 'Stock requests: Closed tab, and a Product / Destination warehouse filter bar',
    description:
      'The Rejected / canceled tab is now Closed. The Status pill is gone — Awaiting and Closed already are the status split, so it could only narrow a tab to part of itself — and in its place the bar leads with Product (multi-select) and Destination warehouse: what the stockist is sourcing, and where it is wanted. Multi-select is a new mode on ErpFilterSelect rather than a second component, so the pill still matches its neighbours and any filter bar can have one.',
    date: '2026-10-15',
    files: ['StockRequestsPage.vue', 'ErpFilterSelect.vue', '[...slug].vue'],
  },
  {
    id: 'sr-by-product-breakdown',
    title: 'Stock requests: one breakdown row per request, and reserve moves onto it',
    description:
      'A request holding two lines for the same component showed the same SR number twice, which read as a duplicate rather than as two kinds of demand; its lines are now summed into one row, dated by the earliest and statused by the lowest. Request type and the requestor came off with them. Reserve stock moved from the product row to the breakdown row, because the request is the unit stock is reserved against — settling every transaction at once hid which ones actually moved. Reject is gone from the product row; it stays on the transaction view, where a request can be declined.',
    date: '2026-10-15',
    files: ['StockRequestsPage.vue', 'stockRequests.ts'],
  },
  {
    id: 'sr-by-product-columns',
    title: 'Stock requests: grid lines, and the By product columns re-ordered',
    description:
      'The By product table now draws vertical rules between columns, the way the Production request index does — with eleven columns, several of them numeric, row stripes alone left the eye guessing which figure sat under which header. Destination warehouse moved to sit right after Status, with Available qty beside it, so where the demand is wanted and what is free there read together. The unit moved out of every number into its own column after Remaining qty, which lets the figures column-align. Grid lines are a new opt-in prop on ErpTablePage, so any table can take them.',
    date: '2026-10-15',
    files: ['StockRequestsPage.vue', 'ErpTablePage.vue'],
  },
  {
    id: 'sr-detail-group-transfer-btn',
    title: 'Stock request detail: the per-warehouse transfer button goes',
    description:
      'Each destination warehouse group carried its own "Create warehouse transfer" button, which Actions already offers. The group header now only states its shortfall ("3 components · 3 to transfer"), and the shortfall banner points at Actions, where both ways out — a warehouse transfer and a purchase request — actually live.',
    date: '2026-10-06',
    files: ['StockRequestDetailsPage.vue', 'translations.ts'],
  },
  {
    id: 'sr-detail-shortfall-banner',
    title: 'Stock request detail: one library banner, not two hand-rolled ones',
    description:
      'The grey rejected-lines banner is gone — a rejected line is already dimmed and badged on its own row, so the strip only repeated it at the top of the page. The shortfall banner that remains is now the library MpBanner in its warning variant instead of a hand-styled div, so it carries the system surface, border and icon. Its copy names the two ways out exactly as the buttons below do: "Create a warehouse transfer for each destination below, or create a purchase request."',
    date: '2026-10-05',
    files: ['StockRequestDetailsPage.vue', 'translations.ts'],
  },
  {
    id: 'sr-tabs',
    title: 'Stock requests: Awaiting / Rejected / canceled tabs',
    description:
      'The tabs now split work from not-work. Awaiting holds demand still to fulfil; Rejected / canceled holds the two terminal statuses. Because the terminal states are a tab, they are no longer offered in the Status filter, where they could only ever empty the Awaiting tab.',
    date: '2026-10-05',
    files: ['StockRequestsPage.vue', 'stockRequests.ts', '[...slug].vue'],
  },
  {
    id: 'sr-request-type',
    title: 'Stock requests: Request type column',
    description:
      'The Additional stock and Adjustment chips moved out from under the work order number into their own column. Stacked under the number they read as part of it and pushed the row to three lines.',
    date: '2026-10-05',
    files: ['StockRequestsPage.vue'],
  },
  {
    id: 'ps-limited-stock',
    title: 'Production settings: "Start with limited stock" (S-4)',
    description:
      'The work order start gate is its own setting again, separate from the partial toggles. Off, every component must be fully reserved whatever the partial mode says; on, partial consume needs one component reserved and partial completion needs every component to hold something.',
    date: '2026-10-02',
    files: ['ProductionSettingsPage.vue', 'productionSettings.ts', 'stockRequests.ts'],
  },
  {
    id: 'ps-reservation-method',
    title: 'Production settings: the reservation toggle is gone (L-12)',
    description:
      'Reservation is structural and cannot be switched off — the method (One step / Two steps) is the only choice. A tenant who had the old toggle OFF migrates to Two steps, so nothing auto-allocates on upgrade.',
    date: '2026-10-02',
    files: ['ProductionSettingsPage.vue', 'productionSettings.ts'],
  },
  {
    id: 'wod-edit-materials',
    title: 'Work order: Edit materials (UC-06, not started)',
    description:
      'The Edit action now opens a materials modal. Changes update the existing request line in place and the editor becomes its requestor; a component cannot be removed, and a cut below the reserved qty is blocked inline with "unreserve first" instead of releasing silently. The warehouse is notified of any qty change.',
    date: '2026-10-02',
    files: ['EditWorkOrderMaterialsModal.vue', 'WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wod-request-additional',
    title: 'Work order: Request additional stock (D-7)',
    description:
      'Production can ask the warehouse for extra material on top of the work order, with its own request date and a mandatory reason. Lines append to the work order\'s existing stock request tagged Additional stock, which the stockist can decline. It sits in Actions, not the Reservation menu, so it stays available under Two steps.',
    date: '2026-10-02',
    files: ['RequestAdditionalStockModal.vue', 'WorkOrderDetailsPage.vue'],
  },
  {
    id: 'sr-requested-tab',
    title: 'Stock requests: Requested tab follows reservation, not work order status (W-4)',
    description:
      'A row leaves the Requested tab when its reserved plus consumed qty reaches what is required — not when its work order leaves an active status. Free stock at the destination does not settle a row: it is not an allocation until somebody reserves it.',
    date: '2026-10-02',
    files: ['stockRequests.ts', 'StockRequestsPage.vue'],
  },
  {
    id: 'sr-product-actions',
    title: 'Stock requests: reserve and reject from a product row (W-1, W-7)',
    description:
      'The by-product row menu gains Reserve stock, which reserves that component across every open transaction that needs it, and Reject added lines. The overdue note now shows in the product view too.',
    date: '2026-10-02',
    files: ['StockRequestsPage.vue', 'stockRequests.ts'],
  },
  {
    id: 'wo-approval-status',
    title: 'Work order status while approval is pending',
    description:
      'Grooming 2026-10-09: the work order status stays as-is while a request is pending (the earlier Draft / Waiting approval display statuses are removed); once approved, Start → In progress, completion → Completed, cancel/close → Canceled. Approval notices now sit inside the content under the Overview / Material consume & return tabs. Partial completion is out of MVP scope and no longer a gated type. If the requester is the only approver at a level (self-approval off), that level is skipped and logged, so the request moves to the next level instead of getting stuck.',
    date: '2026-10-09',
    files: ['woApproval.ts', 'WorkOrderDetailsPage.vue', 'WorkOrdersIndexPage.vue', 'ErpStatusBadge.vue'],
  },
  {
    id: 'wo-approval-mvp-scope',
    title: 'Work order approval — MVP scope',
    description:
      'Awaiting approval lists every pending request for all users (badge = all pending); Approve, Reject and the checkbox appear only where you are the current-level approver, with a "Waiting for" column. Start work order replaces Work order creation as a gated type — creation saves Not started, and material is reserved when the start is approved. Material consume / return and partial completion are not gated. A Work order transaction type can belong to only one workflow.',
    date: '2026-10-05',
    files: ['woApproval.ts', 'WorkOrdersAwaitingApprovalPage.vue', 'WorkOrderDetailsPage.vue', 'CreateApprovalWorkflowPage.vue', 'CreateWorkOrderPage.vue'],
  },
  {
    id: 'wo-approval-rev3',
    title: 'Work order approval aligned to PRD Rev 3',
    description:
      'Cancel/close is a gated type (work order Actions menu); new Work order workflows are pre-filled with Start, Adjustment, Completion and Cancel/close; a per-workflow "Allow requester to approve own request" toggle (off by default); adjustments need a reason and an adjustment date, shown in the approval log; the approval log shows a Completion summary (output and cost vs plan), tagged "Out of scope for MVP".',
    date: '2026-10-05',
    files: ['woApproval.ts', 'WoTransactionModal.vue', 'CreateApprovalWorkflowPage.vue', 'NewMaterialRecordPage.vue', 'ApprovalLogModal.vue'],
  },
  {
    id: 'wo-approval-queue',
    title: 'Work orders: Awaiting approval tab',
    description:
      'Approver queue (PRD "Require approval" tab, named Awaiting approval like other modules) with Approval log, Comments, Approve and Reject (reason required), plus bulk Approve / Reject. Switch "View as" in the scenario FAB to check level 1, level 2 and requester views. Table styled like the other approval queues (Purchase requests / Bills): "Work order #n" number link, Awaiting approval status badge, plain cells, Airene / Column settings / Export tools, inline Approve + quiet icon buttons. UXW copy: columns Date · Number · Transaction type · Warehouse · Requester · Status · Approver; types Start / Adjustment / Completion / Cancellation; search "Search...".',
    date: '2026-10-14',
    files: ['WorkOrdersAwaitingApprovalPage.vue', 'woApproval.ts', 'ApprovalLogModal.vue'],
  },
  {
    id: 'wo-approval-list-indicator',
    title: 'Work order list: approval icon + status filter',
    description:
      'Approval status filter (Waiting for approval / Rejected). The status badge stays as-is; a work order with a request waiting for approval shows a 12px "Awaiting approval" caption under the badge (no icon, no approver details).',
    date: '2026-10-14',
    files: ['WorkOrdersIndexPage.vue'],
  },
  {
    id: 'wo-approval-detail',
    title: 'Work order detail: approval notices and guards',
    description:
      'For an approver at the current level, the primary action (e.g. Start work order) becomes an Approve split button with Reject in its dropdown; pending and rejected notices (the pending notice opens the Approval log), "waiting for approval" captions on consumed / produced qty, and inline refusals when a pending request blocks an action (buttons stay enabled). The notice sits at the top of the scrolling content of the open tab, so it scrolls with the page. Notices carry no text buttons (the log opens from the header icon; Cancel approval request is in the Actions menu). Only ONE notice shows at a time — the latest: an inline refusal right after a click, otherwise the newest of the pending request (with its adjust / cancel reason), the undismissed rejection and the Adjust / Cancel-close reason.',
    date: '2026-10-10',
    files: ['WorkOrderDetailsPage.vue', 'WoTransactionModal.vue'],
  },
  {
    id: 'wo-approval-forms',
    title: 'Gated transactions: pre-submit notice and Submit for approval',
    description:
      'Start work order, Adjust work order, Partial completion, Complete and Cancel/close show "This transaction needs approval from level 1: …" when a Work order workflow gates them, and save a request instead of executing. Adjust and Partial completion are stand-in modals (no form existed before). Material consume / return post immediately but are refused while an adjustment, completion or cancel/close is pending, and consume is capped at the planned qty.',
    date: '2026-10-02',
    files: ['CreateWorkOrderPage.vue', 'NewMaterialRecordPage.vue', 'WoTransactionModal.vue'],
  },
  {
    id: 'wo-approval-resubmit',
    title: 'Resubmit a rejected request',
    description:
      'A rejected request shows a notice on the work order with Submit again (start) or Create again (other types), which reopens the form pre-filled with the original data and date.',
    date: '2026-10-02',
    files: ['CreateWorkOrderPage.vue', 'NewMaterialRecordPage.vue', 'WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wo-approval-freeze',
    title: 'Work order frozen while a request waits for approval',
    description:
      'Grooming 2026-10-09: while any approval request is pending, every work order action (Start, Complete, Adjust, Cancel/close, Edit, Delete, Replace attachment, New record) refuses with an inline notice — buttons stay enabled per the no-disabled-buttons rule. Print and the requester\'s Cancel approval request stay available. The status badge stays as-is (no Draft / Waiting approval status). In the list, row Cancel is hidden while frozen.',
    date: '2026-10-09',
    files: ['WorkOrderDetailsPage.vue', 'WorkOrdersIndexPage.vue', 'NewMaterialRecordPage.vue', 'woApproval.ts'],
  },
  {
    id: 'wo-approval-val',
    title: 'Confirmation modal reads the approval rule from VAL',
    description:
      'Start, Adjust, Complete and Cancel/close all confirm in one modal. On open it asks VAL (stand-in client with a 600 ms delay; demo FAB can make it fail) which approval rule applies and shows it in a blue info banner, with loading and error / Try again states. When every level would be skipped (the requester is the only approver) the banner says it\'s approved automatically. Adjust and Cancel/close need a reason.',
    date: '2026-10-09',
    files: ['WoTransactionModal.vue', 'valApprovalRule.ts'],
  },
  {
    id: 'wo-approval-reason-banner',
    title: 'Adjust / Cancel-close reason on the work order',
    description:
      'After Adjust or Cancel/close the detail page shows the reason given, who gave it and whether it\'s still waiting for approval. A pending adjustment\'s new planned qty shows on the list and detail right away and is reverted if the request is rejected or canceled.',
    date: '2026-10-09',
    files: ['WoActionReasonBanner.vue', 'WorkOrderDetailsPage.vue', 'woApproval.ts'],
  },
  {
    id: 'wo-approval-reject-banner',
    title: 'Sticky rejection notice',
    description:
      'A rejected request shows a danger notice with the reject reason that stays until the user dismisses it (×, remembered). No Submit again / Create again on it — the action is started again from the header or Actions menu. While a request is pending, the Actions menu hides Adjust, Cancel/close, Edit, Replace attachment and Delete (Print and Cancel approval request remain).',
    date: '2026-10-09',
    files: ['WoRejectBanner.vue', 'WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wo-approval-cancel-request',
    title: 'Cancel approval request',
    description:
      'The requester can withdraw a pending request until the first approver approves it — from the Actions menu and the pending notice on the detail page, and the row menu on Awaiting approval. Nothing is applied and the work order unlocks; the approval log records it.',
    date: '2026-10-09',
    files: ['WorkOrderDetailsPage.vue', 'WorkOrdersAwaitingApprovalPage.vue', 'ApprovalLogModal.vue', 'woApproval.ts'],
  },
  {
    id: 'wo-approval-log-tab',
    title: 'Approval log icon in the work order header',
    description:
      'Like the transaction detail pages (rule/detail-approval-header), the work order header has the Approval log and Comments icon buttons left of Actions (Comments = the pending request\'s thread, else the latest request\'s). It opens the Approval log modal with every request on the work order (pending first, then the latest decided): requester, levels, approved / rejected with reason / skipped / canceled. Replaces the Approval log tab.',
    date: '2026-10-09',
    files: ['WorkOrderDetailsPage.vue', 'ApprovalLogModal.vue'],
  },
  {
    id: 'wo-approval-rules',
    title: 'Approval workflows: Work order transaction type',
    description:
      'Choosing transaction type "Work order" shows a second dropdown under it to pick the work order transaction the workflow gates (Start work order, adjustment, partial completion, completion, cancel/close). A type can have only one ACTIVE workflow — types another active workflow already has are not offered, and turning on a workflow whose type is already covered asks to turn the other one off. Approvers are limited to users with Work order access, up to 4 levels, and the list shows "Applies to: …". Requests still waiting for approval follow the rule live: saving a workflow updates their levels and approvers (a removed level lets the request move on or execute; decided requests keep their history).',
    date: '2026-10-10',
    files: ['CreateApprovalWorkflowPage.vue', 'ApprovalWorkflowsPage.vue', 'approvalWorkflows.ts'],
  },
  {
    id: 'sd-input-method-table',
    title: 'Sales delivery: one input method for the whole table',
    description:
      'Quantity / Percentage is now a single dropdown above the line table instead of a per-line column; Qty delivered is still typed per line. The Percentage lock and its Release cover the whole sales order. A hand-added line in Percentage takes its base qty in the Qty ordered cell. The delivery detail page shows the method once above the lines, with the typed % under each quantity.',
    date: '2026-10-29',
    files: ['NewSalesDeliveryPage.vue', 'SalesDeliveryDetailsPage.vue', 'ReleaseInputBasisModal.vue', 'salesDeliveries.ts'],
  },
  {
    id: 'sd-ordered-caption',
    title: 'Qty ordered: progress reads label left, figure right',
    description: 'Under the ordered qty, "Delivered" and "Remaining" sit on the left and their qty and percentage on the right, so the figures line up.',
    date: '2026-10-29',
    files: ['NewSalesDeliveryPage.vue'],
  },
  {
    id: 'wo-start-date-modal',
    title: 'Start work order asks for the actual start date',
    description:
      'Starting a work order now opens a modal for its actual start date, up to today. Routing start dates are limited by this date.',
    date: '2026-11-02',
    files: ['WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wo-routing-drag',
    title: 'Drag routing cards between columns',
    description:
      'Drag a card to the next column to start or finish it (the date modal opens), or to the previous column to move it back.',
    date: '2026-11-02',
    files: ['TrackRoutingPage.vue'],
  },
  {
    id: 'wo-adjust-page',
    title: 'Adjust work order page',
    description:
      'Record field differences before closing a work order: produced and needed qty, cost multipliers, other outputs, and production waste. Changes apply to this work order only, never the BOM, and show on its detail page.',
    date: '2026-11-02',
    files: ['AdjustWorkOrderPage.vue', 'workOrderAdjustment.ts'],
  },
  {
    id: 'wo-routing-confirmation',
    title: 'Complete work order asks for routing confirmation',
    description:
      'Completing a tracked work order now asks whether the field process matched, offers Adjust work order, and captures the actual end date.',
    date: '2026-11-02',
    files: ['RoutingConfirmationModal.vue', 'WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wo-track-routing-page',
    title: 'Track routing page',
    description:
      'New board to move a work order\'s routing steps through Not started, In progress, and Completed with actual dates. Progress is saved to the work order and drives the Routing section and primary action on its detail page.',
    date: '2026-11-02',
    files: ['TrackRoutingPage.vue', 'workOrderRouting.ts'],
  },
  {
    id: 'wo-primary-track-routing',
    title: 'Work order primary action follows routing',
    description:
      'Start work order now starts the work order. With Track routing set to Yes, the primary action becomes Track routing, then Complete work order once every routing step is completed.',
    date: '2026-11-02',
    files: ['WorkOrderDetailsPage.vue'],
  },
  {
    id: 'wo-routing-status-badge',
    title: 'Routing status uses the status badge',
    description:
      'The Routing section status is now a status badge, and tracked work orders show each step\'s own status and actual dates.',
    date: '2026-11-02',
    files: ['WorkOrderDetailsPage.vue'],
  },
  {
    id: 'batch-drawer-desc-column-fit',
    title: 'Batch drawers: Description keeps its own column',
    description:
      'In the Manage batch (stock in/out, transfer, put-away, picking, receiving), work order batch and View batch drawers, the Description column no longer collapses to zero width when attribute columns are added, so it never overlaps Vendor. Every column is now sized to its content, so the whole table — including the qty field you type into — fits a full-width drawer without scrolling sideways. A batch with no description shows "—" instead of demo text.',
    date: '2026-10-28',
    files: [
      'app/components/patterns/ManageBatchDrawer.vue',
      'app/components/patterns/PickBatchDrawer.vue',
      'app/components/patterns/ViewBatchDrawer.vue',
    ],
  },
  {
    id: 'batch-export-write-error',
    title: 'Batch export: a failed file shows an inline error',
    description: 'If the template, export or error file can’t be created, an inline message says so under the button (no silent failure). The button stays to retry.',
    date: '2026-10-28',
    files: ['app/components/pages/ImportBatchUpdatePage.vue', 'app/components/patterns/BatchExportModal.vue'],
  },
  {
    id: 'batch-drawer-typed-expiry-locked',
    title: 'Receiving drawer: a typed existing batch keeps its expiry',
    description: 'Typing a new number that matches an existing batch with an expiry shows that expiry read-only (like its other attributes) and saves it; a batch with no expiry stays fillable.',
    date: '2026-10-28',
    files: ['app/components/patterns/ManageBatchDrawer.vue'],
  },
  {
    id: 'view-batch-drawer-attributes',
    title: 'Batch attributes in View batch and Pick batch drawers',
    description:
      'The batch detail and pick drawers show the product\'s batch attributes (Vendor, Grade, ...) after Expiry date, read-only. A saved line shows the values it was saved with; a lot with no batch record shows only its expiry. Put-away, picking and purchase delivery lines now keep that attribute snapshot.',
    date: '2026-10-28',
    files: ['app/components/patterns/ViewBatchDrawer.vue', 'app/components/patterns/PickBatchDrawer.vue', 'app/data/pickingTasks.ts', 'app/data/putAwayTasks.ts', 'app/data/purchaseDeliveryBatches.ts'],
  },
  {
    id: 'receiving-batch-attributes',
    title: 'WMS receiving saves batch attributes to the batch master',
    description:
      'Finishing receiving creates a product batch for each new batch number and fills its empty attributes; existing values are never overwritten. A new row prefills Vendor from the PO, and existing batches recorded with another vendor ask for one confirmation first.',
    date: '2026-10-28',
    files: ['app/data/receivingTasks.ts', 'app/components/pages/ReceiveItemsPage.vue', 'app/components/patterns/ManageBatchDrawer.vue'],
  },
  {
    id: 'stock-in-batch-attributes',
    title: 'Stock in saves its batches with their attributes',
    description:
      'A saved stock in/out keeps each line\'s batches and creates them in the batch master, filling only empty attributes. The adjustment details batch drawer shows the saved batches.',
    date: '2026-10-28',
    files: ['app/data/stockAdjustments.ts', 'app/components/pages/StockInOutFormPage.vue', 'app/components/pages/StockAdjustmentDetailsPage.vue'],
  },
  {
    id: 'batch-drawer-attributes',
    title: 'Batch attributes in every Manage batch drawer',
    description:
      'Stock in/out, transfer and WMS receiving, put-away and picking drawers show the product\'s batch attributes (Vendor, Grade, dates) as columns and under each Select-batch option. Receiving drawers take values for new batches and empty ones, and block Save on an empty required attribute; issuing drawers only show them.',
    date: '2026-10-27',
    files: ['app/components/patterns/ManageBatchDrawer.vue', 'app/composables/useBatchAttributeColumns.ts'],
  },
  {
    id: 'batch-export-modal',
    title: 'Product Export batches uses the import template',
    description:
      'Exports this product\'s batches in the Update batches template format, with an optional "only batches with an empty required attribute" filter and an inline message when nothing matches.',
    date: '2026-10-27',
    files: ['app/components/patterns/BatchExportModal.vue', 'app/components/pages/ProductDetailsPage.vue'],
  },
  {
    id: 'batch-export-filters',
    title: 'Export batches from the Update batches page',
    description:
      'Step 1 filters by product and by batches missing a required attribute; the file can be edited and imported back.',
    date: '2026-10-27',
    files: ['app/components/pages/ImportBatchUpdatePage.vue'],
    id: 'crm-invite-edit-disabled-options',
    title: 'Invite / Edit user: options disabled up front, with the reason',
    description:
      'Instead of failing on save, options that would be blocked are disabled before the admin picks them, with the reason inline and on hover: CRM ("No CRM seats left. Contact Sales to add seats." / over quota "Remove CRM from some users or contact Sales to add seats." / expired "CRM subscription has ended. Contact Sales to renew."), CRM Administrator ("No CRM Administrator seat left" — CRM Basic is selected instead) and the ERP roles ("No ERP seats left" — CRM stays selectable). Counts come from the saved users, so an option the user already holds is never disabled: Administrator → Basic is always allowed and unticking CRM frees a seat. The save-time seat check stays as a safety net.',
    date: '2026-10-28',
    files: ['InviteUserPage.vue', 'DisabledReasonTooltip.vue', 'crmSubscription.ts', 'useCrmSubscriptionScenario.ts'],
  },
  {
    id: 'crm-invite-edit-states-fab',
    title: 'Invite / Edit states (demo)',
    description:
      'The scenario button now lists the 12 states of the Invite / Edit user CRM spec (default, CRM-only Administrator, Ultimate + Basic, custom role + Basic, no CRM seat, only Basic seats, ERP full, no CRM, edit user, over quota, expired, custom role editor). Each sets the mock Billing and pre-fills the form, opens Edit user, or opens the custom-role drawer. Picking state 1 restores the default seed. On the User list and Custom role pages the same section sits below the Billing presets.',
    date: '2026-10-28',
    files: ['CrmSeatsScenarioFab.vue', 'useInviteEditStates.ts', 'useCrmSubscriptionScenario.ts'],
  },
  {
    id: 'crm-user-seats-list-type',
    title: 'Type = account type (Member / Partner)',
    description:
      'The User list Type column and the "All types" filter now use production\'s account types, Member (briefcase) and Partner (team), taken from jurnal-frontend-app user_management (button_filter_type). Partner users — e.g. the company\'s outside accountant — are not counted against the ERP user limit.',
    date: '2026-10-28',
    files: ['UsersListPage.vue', 'usersRoles.ts', 'crmSubscription.ts'],
  },
  {
    id: 'crm-user-seats-invite-selected-roles',
    title: 'Selected roles + Terms (Invite / Edit user)',
    description:
      'Right column matched to production: a sticky "Selected roles" card listing the ticked Existing roles (including the CRM tier, e.g. "CRM Administrator") and Custom roles (or "-"), above a collapsible "Terms for selecting roles" card with one CRM line: CRM combines with any role, including Ultimate and custom roles, and uses a CRM seat, not an ERP seat, unless the user also has an ERP role.',
    date: '2026-10-28',
    files: ['InviteUserPage.vue'],
  },
  {
    id: 'crm-user-seats-invite-crm-role',
    title: 'CRM row on Invite / Edit user',
    description:
      'CRM is a row in the Existing role list: caret + CRM checkbox and four description lines ("Use Mekari CRM from the product switcher." / CRM Basic / CRM Administrator / "Detailed CRM permissions are set in CRM."). Ticking it shows a "CRM access level" radio pair — CRM Basic / CRM Administrator, Administrator by default (updated 2026-10-28). It is stored as the user\'s CRM role, not an ERP role, so CRM-only takes a CRM seat and no ERP seat; ERP roles + CRM take both. Ticking Ultimate never clears CRM, and the choice is kept on the Custom role tab, so custom role + CRM works. Read-only once CRM expired; locked for the Owner. A CRM block message sits inside the CRM row. PRD US-001, US-003, US-010, US-011.',
    files: ['InviteUserPage.vue', 'crmSubscription.ts', 'useCrmSubscriptionScenario.ts'],
    date: '2026-10-27',
  },
  {
    id: 'crm-user-seats-invite-summary',
    title: 'Seat usage card on Invite / Edit user',
    description:
      'A "Seat usage" card in the right column, above Selected roles (same card style): ERP users and CRM users as total · used · left ("5 total · 7 used · 2 over" in the warning colour when over quota), where the CRM seats come from ("5 included", "+ 2 Basic, + 1 Administrator add-on" only when add-ons exist, or N trial seats) and "Up to N can be CRM Administrator" (hidden at 0). As soon as a role is ticked or unticked the title reads "Seat usage (after saving)" and the numbers show the result after saving (updated 2026-10-28). The CRM part hides without the CRM add-on. "Need more ERP or CRM seats? Contact Sales." opens the Contact Sales dialog. This is now the only place seat counts are shown — the User list title bar has no Seat usage button, as in prod. PRD US-002, US-010.',
    files: ['InviteUserPage.vue', 'SeatUsageSummary.vue', 'useCrmSubscriptionScenario.ts'],
    date: '2026-10-27',
  },

  {
    id: 'crm-user-seats-list-banners',
    title: 'Seat state banners on the User list',
    description:
      'Only when they apply: over quota (everyone keeps access, new access is blocked — points to the Seat usage card on Invite / Edit user and to Contact Sales), CRM expired (read-only) and Billing down (last confirmed seats, or "try again later" when nothing was ever confirmed). PRD US-006, US-008.',
    date: '2026-10-27',
    files: ['UsersListPage.vue'],
  },
  {
    id: 'crm-user-seats-list-column',
    title: 'Role chips include the CRM tier',
    description:
      'The Role column (matched to production) shows the ERP role chips, then the CRM tier ("CRM Basic" / "CRM Administrator"), then "List manager". A CRM-only user shows only the CRM chip; the Owner shows "Owner" and, with CRM active, "CRM Administrator". Replaces the separate CRM access column. Deleting a user or cancelling an invite frees their CRM seat. PRD US-004, US-005.',
    files: ['UsersListPage.vue'],
    date: '2026-10-27',
  },
  {
    id: 'crm-user-seats-custom-role-note',
    title: 'No CRM inside custom roles',
    description:
      'The CRM category and the "Access to CRM module" row are gone from the custom-role permission matrix — CRM is given only through the CRM role on the user, which combines with any custom role. PRD US-011 AC-04.',
    date: '2026-10-27',
    files: ['CustomRoleDrawer.vue', 'usersRoles.ts'],
  },
  {
    id: 'crm-user-seats-product-switcher',
    title: 'CRM in the product switcher',
    description:
      'CRM is always listed. It opens CRM only when the company has the CRM add-on and you hold the CRM role; otherwise it lands on a CRM page that offers Contact Sales (no add-on) or says to ask your admin (no CRM role). PRD US-013.',
    date: '2026-10-27',
    files: ['ErpProductSwitcher.vue', 'ErpNavbarGroup.vue', 'CrmLandingPage.vue'],
  },
  {
    id: 'crm-user-seats-landing',
    title: 'CRM landing page',
    description:
      'Where the product switcher sends users who can\'t open CRM: what CRM is plus Contact Sales without the add-on, "You don\'t have CRM access" without the CRM role, or "try again later" while Billing can\'t confirm. Content is a placeholder; the CRM team owns the real landing page. PRD US-013.',
    date: '2026-10-27',
    files: ['CrmLandingPage.vue', '[...slug].vue'],
  },
  {
    id: 'crm-user-seats-scenario-fab',
    title: 'CRM add-on scenarios (demo)',
    description:
      'The Users & roles scenario button switches the mock Billing between No CRM, Trial, Essential, seat add-on only, expired, Billing down and ERP-limit-full, includes the PRD §3b "Owner + 5 CRM Administrators" example (8 total · 6 used, Administrator 6 of 6 → Basic only; leaving the preset restores the seed), no-CRM-seat-left, Basic-only and over-quota presets, steps the Basic / Administrator add-ons and the ERP limit up and down (step an add-on below usage to simulate a seat reduction), previews a user without the CRM role, and lists the defaults assumed for the PRD\'s open questions.',
    date: '2026-10-27',
    files: ['CrmSeatsScenarioFab.vue', 'ScenarioFab.vue', 'useCrmSubscriptionScenario.ts'],
  },
  {
    id: 'dm-step-layout',
    title: 'Data migration step-based layout',
    description:
      'Settings → Data migration now uses a two-column layout with an ordered step list on the left (Company info, Opening balance, Products, Contacts, Sales, Purchases, Expenses) and the active step form on the right. Company info step is fully built.',
    date: '2026-10-26',
    files: ['DataMigrationPage.vue', 'translations.ts'],
  },
  {
    id: 'recurring-receive-money-form',
    title: 'New recurring receive money form',
    description:
      'The Receive money option in the Recurring transactions type picker now opens a real form instead of the placeholder (Bank deposit was renamed to Receive money). Layout follows the Cash management "New receive money" design: Deposit to + Payer + Total, the recurring schedule, transaction no./reference/tags, the Account-Description-Tax-Amount line items, message/memo/attachment and the Subtotal/PPN/Total breakdown. Shell and table are the InternalTransferFormPage and New expense patterns verbatim (docs/patterns/FormTable.md), not new components. Saving creates a Receive money template whose payer becomes the index\'s Name.',
    date: '2026-10-23',
    files: ['NewRecurringReceiveMoneyPage.vue', 'recurringTransactions.ts', '[...slug].vue'],
  },
  {
    id: 'recurring-transactions-index',
    title: 'Recurring transactions index (Other lists)',
    description:
      'Other lists > Recurring transactions is now a real index instead of a placeholder. It aggregates every recurring template across all 11 transaction types — the five that own a module store (sales invoice/order, purchase invoice/order, expense) plus six cash/journal types seeded here. Name shows the customer/vendor, as on every module recurring list, and links to that module\'s recurring detail page where one exists. Filter by transaction type and status on the left, search on the right; each row has a [...] menu with Edit and Delete, and selecting rows reveals a bulk Delete — both behind a confirm. The title bar\'s + New recurring transaction opens a type picker.',
    date: '2026-10-23',
    files: ['RecurringTransactionsPage.vue', 'recurringTransactions.ts', '[...slug].vue'],
  },
  {
    id: 'recurring-bulk-delete',
    title: 'Bulk delete on recurring index pages',
    description:
      'Selecting rows on any recurring index (sales invoices, sales orders, purchase invoices, purchase orders, expenses) now reveals a Delete action in the shared ErpTablePage bulk bar. Delete is a dedicated button beside the Actions dropdown, behind its own confirm modal (rule/bulk-actions-delete-confirmed). Deleting persists and the selection clears.',
    date: '2026-10-22',
    files: [
      'RecurringSalesInvoicesPage.vue', 'RecurringSalesOrdersPage.vue',
      'RecurringPurchaseInvoicesPage.vue', 'RecurringPurchaseOrdersPage.vue',
      'RecurringBillsPage.vue', 'salesInvoices.ts',
    ],
  },
  {
    id: 'rbill-detail-template',
    title: 'Recurring expense template detail',
    description:
      'The recurring expense detail now mirrors the expense detail page as a template — beneficiary + total, meta grid (next expense, start date, repeats every, end repeat, frequency, category, generated, tags), account line items, memo and the Subtotal/PPN/Total breakdown — with recurring history below. Matches the pattern already used by recurring sales invoices, sales orders, purchase invoices and purchase orders.',
    date: '2026-10-22',
    files: ['RecurringBillDetailsPage.vue', 'bills.ts'],
  },
  {
    id: 'location-deepest-level',
    title: 'No "Add sub-location" under a Bin',
    description:
      'Bin is the deepest storage level, so the Storage locations menus no longer offer "Add sub-location" on Bin rows (it opened a drawer with an empty Level picker). If the drawer is opened under a Bin anyway, it shows an info banner and a Close button instead of the form.',
    date: '2026-10-21',
    files: ['StorageLocationTree.vue', 'WarehouseDetailsPage.vue', 'NewLocationDrawer.vue', 'storageLocations.ts'],
  },
  {
    id: 'new-location-drawer-shell',
    title: 'New / Edit location drawer on the standard drawer shell',
    description:
      'The location drawer moved off Pixel MpDrawer onto the shared ErpDrawer Teleport shell (filled header, × close, pinned footer with enterprise Cancel / Save), and Description is now a Pixel MpTextarea. Description is also saved when creating a location (it was only kept on edit).',
    date: '2026-10-21',
    files: ['NewLocationDrawer.vue', 'storageLocations.ts'],
  },
  {
    id: 'new-location-storage-preference-radio',
    title: 'Storage preference uses the standard radio list',
    description:
      'New / Edit location drawer: Storage preference was two uneven, bordered button-cards with a mint selected fill. It is now the standard MpRadio title + caption list (same as Edit classification), so it reads like every other single-choice field.',
    date: '2026-10-21',
    files: ['NewLocationDrawer.vue'],
  },
  {
    id: 'row-kebab-icon-visible',
    title: 'Row actions (⋯) icon visible again',
    description:
      'Row kebab buttons on ~45 tables (warehouses, storage locations, products, receipts, picking, packing, CRM, BOM, work orders…) rendered an invisible 0px icon — Pixel MpButton padding squeezed the 20px svg out of the 32px button. One global erp.css override restores the three-dot icon everywhere.',
    date: '2026-10-21',
    files: ['erp.css', 'WarehousesPage.vue', 'pixel-enterprise-overrides.md'],
  },
  {
    id: 'settings-inventory-page',
    title: 'Settings > Inventory page',
    description:
      'New Inventory settings page following the Sales settings pattern: Product settings with hover Edit → inline edit (costing method, stock-info / barcode / variant / serial / batch toggles) and Batch reminders (expiry email toggle). Inventory costing method is locked (disabled field + hint) once inventory transactions exist, since changing it would alter COGS on posted documents.',
    date: '2026-10-16',
    files: ['SettingsInventoryPage.vue'],
  },
  {
    id: 'settings-purchase-page',
    title: 'Settings > Purchases page',
    description:
      'New Purchases settings page mirroring the Sales settings pattern: General settings with hover Edit → inline edit (default payment term, vendor-in-PR / shipping / discounts / deposit toggles, default message), Email templates with kebab (…) → Edit template modal, and a Document layout & branding section with Customize design.',
    date: '2026-10-16',
    files: ['SettingsPurchasePage.vue'],
  },
  {
    id: 'settings-sales-page',
    title: 'Settings > Sales page',
    description:
      'New Sales settings page with general toggles (shipping, discounts, deposit, price rules, etc.), invoice reminders, email/WhatsApp templates with kebab menus, and document layout & branding section.',
    date: '2026-10-16',
    files: ['SettingsSalesPage.vue'],
  },
  {
    id: 'purchase-payment-form',
    title: 'Add Purchase Payment form',
    description:
      'Add Payment form for Purchase module — exact mirror of Receive Payment. Vendor info, date/txn/ref fields, deposit-to account, payment method, invoice allocation table with balance/amount columns, withholding tax, memo + attachment. Navigates from purchase invoice detail.',
    date: '2026-10-16',
    files: ['AddPurchasePaymentPage.vue', 'purchasePayments.ts', 'debitMemos.ts'],
  },
  {
    id: 'purchase-payment-detail',
    title: 'Purchase Payment detail page',
    description:
      'Read-only detail page for Purchase Payment records: vendor, deposit-to, allocation table, WHT breakdown, memo, journal entry drawer, activity log, Edit/Delete actions. Mirror of PaymentReceivedDetailsPage.',
    date: '2026-10-16',
    files: ['PurchasePaymentDetailsPage.vue', 'purchasePayments.ts'],
  },
  {
    id: 'receive-payment-header',
    title: 'Add Payment form (redesigned)',
    description:
      'Redesigned Add Payment form following Figma spec: read-only customer info block (name + email), Date paid / Transaction no. / Reference no. row, Account / Payment method row, invoice table with NUMBER / DUE DATE / BALANCE DUE / TOTAL / AMOUNT PAID columns, transaction count, withholding tax checkbox, memo + attachment section.',
    date: '2026-10-15',
    files: ['AddPaymentPage.vue', 'paymentsReceived.ts', 'salesInvoiceDetails.ts', 'creditMemos.ts'],
  },
  {
    id: 'receive-payment-wht',
    title: 'Withholding tax on payment received',
    description:
      'Optional withholding tax (PPh) on the Receive Payment form: checkbox reveals WHT account selector + amount field. Total = Subtotal − WHT. Journal: Dr Cash (net), Dr PPh Payable (WHT), Cr A/R (gross). Five standard WHT accounts (PPh 21/22/23/4(2)/15).',
    date: '2026-10-15',
    files: ['AddPaymentPage.vue', 'paymentsReceived.ts'],
  },
  {
    id: 'payment-received-detail',
    title: 'Payment Received detail page',
    description:
      'Read-only detail page for Payment Received records: customer, deposit-to, allocation table, WHT breakdown, memo, journal entry drawer, activity log, Edit/Delete actions. Follows CreditMemoAppliedDetailsPage pattern.',
    date: '2026-10-15',
    files: ['PaymentReceivedDetailsPage.vue', 'paymentsReceived.ts'],
  },
  {
    id: 'cd-transactions-tab',
    title: 'Customer details: Transactions tab',
    description:
      'The customer (contact) details Transactions tab is now a full ErpTablePage over the customer’s unified documents — sales invoices, orders, quotes and credit memos — with four KPI tiles (Overdue / Unpaid invoices, Payment received, Open credits), Transaction + Status filters, search, and pagination. Credit memo is also a new entry point in the "Create transaction" menu. Built entirely from existing Pixel/ERP components (Figma: Contacts › Transactions).',
    date: '2026-10-14',
    files: ['ContactDetailsPage.vue', 'customerTransactions.ts'],
  },
  {
    id: 'print-share-menu',
    title: 'Shared Print & share menu + detail refinements',
    description:
      'The "Print & share" dropdown is now a single reusable component (PrintShareMenu) instead of a hand-rolled MpPopover per page; used on the credit memo detail / applied / refund pages. On the Credit Memo Applied detail, the header now aligns "Credit memo" vertically with "Transaction no." below it. Table-cell "View details" chips were replaced by the row-number textlink.',
    date: '2026-10-14',
    files: ['PrintShareMenu.vue', 'CreditMemoAppliedDetailsPage.vue', 'CreditMemoDetailsPage.vue', 'CreditMemoRefundDetailsPage.vue'],
  },
  {
    id: 'txno-settings-gear',
    title: 'Transaction no. — reusable settings-gear field',
    description:
      'The "Transaction no." form field is now a single reusable component (TransactionNoField) whose label carries a settings gear opening the auto-numbering modal — matching New sales invoice. Added to the credit memo Apply / Refund / New forms (previously a plain disabled "Auto" input) and codified as the pattern in docs/patterns/Form.md + rule/form-transaction-no-field.',
    date: '2026-10-14',
    files: ['TransactionNoField.vue', 'ApplyCreditMemoPage.vue', 'CreateCreditMemoRefundPage.vue', 'NewCreditMemoPage.vue', 'Form.md'],
  },
  {
    id: 'header-icon-white',
    title: 'Header icons: white glyph on dark header',
    description:
      'The header quick-action icons (help, inbox, upload) now render white (icon.inverse) instead of the dark ghost-button default, and stay white on hover — only the background fill changes. Matches the quick-create "+" icon.',
    date: '2026-10-14',
    files: ['IconButton.vue', 'ErpHeader.vue', 'pixel-enterprise-overrides.md'],
  },
  {
    id: 'invoice-apply-credit-memo',
    title: 'Sales invoice: Apply credit memo',
    description:
      'Opening an invoice whose customer has available credit (and the invoice has a balance) now proactively shows the "Apply credit memo?" prompt — Apply credit memo opens the form, Not now (or ×) dismisses it. The Add payment split menu also lists Apply credit memo (same condition); choosing it opens the form directly, with no second prompt.',
    date: '2026-10-14',
    files: ['SalesInvoiceDetailsPage.vue', 'ApplyCreditMemoPage.vue', 'creditMemos.ts'],
  },
  {
    id: 'invoice-less-credit-memo',
    title: 'Sales invoice: credit shown in totals & payments',
    description:
      'When a credit memo is applied, the totals block shows a "Less: Credit Memo" line and the Balance due drops accordingly; the Payments tab lists each Credit Memo Applied with a View details link. Invoice status becomes "Partially paid" when only partly settled.',
    date: '2026-10-14',
    files: ['SalesInvoiceDetailsPage.vue', 'salesInvoiceDetails.ts', 'creditMemos.ts', 'ErpStatusBadge.vue'],
  },
  {
    id: 'dm-detail-actions',
    title: 'Debit memo detail page',
    description:
      'New Debit memo detail page (AP-side mirror of credit memo): available debit, debit-account lines, running balance, Debit applications and Debit refund sections, and an Actions menu (Apply debit memo, Create debit memo refund, Edit, Delete). Delete is blocked with an explanation while the memo is in use.',
    date: '2026-10-14',
    files: ['DebitMemoDetailsPage.vue', 'debitMemos.ts'],
  },
  {
    id: 'apply-dm-save',
    title: 'Apply debit memo form',
    description:
      'New Apply debit memo form — spends one debit memo across the vendor\'s open purchase invoices with per-invoice "amount to apply", live Amount to debit / Remaining debit, and inline validation. Reachable from a purchase invoice or a debit memo.',
    date: '2026-10-14',
    files: ['ApplyDebitMemoPage.vue', 'debitMemos.ts'],
  },
  {
    id: 'apply-dm-form',
    title: 'Apply debit memo — vendor + memo selector',
    description:
      'Apply debit memo form: vendor is locked to the entry context, debit memo autocomplete with available debit display. Opening from a purchase invoice pre-applies the available debit to that invoice.',
    date: '2026-10-14',
    files: ['ApplyDebitMemoPage.vue'],
  },
  {
    id: 'refund-dm-save',
    title: 'Create debit memo refund form',
    description:
      'New Create debit memo refund form — deposits vendor\'s remaining debit back as cash into a bank account ("Deposit to" instead of "Pay from"), across one or more debit memos, with live Total refund and inline validation.',
    date: '2026-10-14',
    files: ['CreateDebitMemoRefundPage.vue', 'debitMemos.ts'],
  },
  {
    id: 'refund-dm-form',
    title: 'Debit memo refund — Deposit to field',
    description:
      'The refund direction is inverted vs credit memo: "Deposit to" (cash IN from vendor) replaces "Pay from" (cash OUT to customer). The rest of the form mirrors credit memo refund.',
    date: '2026-10-14',
    files: ['CreateDebitMemoRefundPage.vue'],
  },
  {
    id: 'new-dm-save',
    title: 'Create / edit debit memo form',
    description:
      'Create/edit debit memo form (AP-side mirror of credit memo): vendor, date, debit-account lines, memo, attachments. Editing cannot reduce the memo below debit already used or change vendor once used.',
    date: '2026-10-14',
    files: ['NewDebitMemoPage.vue', 'debitMemos.ts'],
  },
  {
    id: 'new-dm-form',
    title: 'Debit memo form — vendor selector',
    description:
      'Vendor autocomplete on the new debit memo form. Pre-fills from ?vendor= query param when navigating from a vendor detail page.',
    date: '2026-10-14',
    files: ['NewDebitMemoPage.vue'],
  },
  {
    id: 'dm-detail-jump',
    title: 'Debit memo — jump to another memo',
    description:
      'DetailJumpTo on debit memo detail page lets you switch between debit memos without going back to the list.',
    date: '2026-10-14',
    files: ['DebitMemoDetailsPage.vue'],
  },
  {
    id: 'dm-detail-journal',
    title: 'Debit memo — view journal entry',
    description:
      'View journal entry link on debit memo detail page opens a drawer showing the AP-side journal: Dr AP, Cr each line account.',
    date: '2026-10-14',
    files: ['DebitMemoDetailsPage.vue'],
  },
  {
    id: 'dm-detail-activity',
    title: 'Debit memo — activity log',
    description:
      'Last updated link opens the activity log modal for the debit memo.',
    date: '2026-10-14',
    files: ['DebitMemoDetailsPage.vue'],
  },
  {
    id: 'pinv-less-debit-memo',
    title: 'Purchase invoice — Less: Debit Memo totals line',
    description:
      'Purchase invoice detail page now shows "Less: Debit Memo" in the totals section when a debit memo has been applied, mirroring the sales invoice "Less: Credit Memo" pattern. Also shows Amount paid, Balance due.',
    date: '2026-10-14',
    files: ['PurchaseInvoiceDetailsPage.vue', 'purchaseInvoiceDetails.ts'],
  },
  {
    id: 'pinv-payments-tab',
    title: 'Purchase invoice — Payments tab',
    description:
      'Purchase invoice detail page now has a Payments tab showing cash payments and debit memo applications. Debit memo applied rows link to their detail page.',
    date: '2026-10-14',
    files: ['PurchaseInvoiceDetailsPage.vue', 'purchaseInvoiceDetails.ts'],
  },
  {
    id: 'pinv-apply-debit-memo',
    title: 'Purchase invoice — Apply debit memo action',
    description:
      'Purchase invoice Actions menu now includes "Apply debit memo" when the vendor has available debit and the invoice has a remaining balance.',
    date: '2026-10-14',
    files: ['PurchaseInvoiceDetailsPage.vue'],
  },
  {
    id: 'cm-detail-actions',
    title: 'Credit memo detail page',
    description:
      'New Credit memo detail page: available credit, credit-account lines, running balance, Credit applications and Credit refund sections, and an Actions menu (Apply credit memo, Create credit memo refund, Edit, Delete). Delete is blocked with an explanation while the memo is in use.',
    date: '2026-10-14',
    files: ['CreditMemoDetailsPage.vue', 'creditMemos.ts'],
  },
  {
    id: 'apply-cm-save',
    title: 'Apply credit memo form',
    description:
      'New Apply credit memo form — spends one credit memo across the customer’s open invoices with per-invoice "amount to apply", live Amount to credit / Remaining credit, and inline validation (over balance, over available, date rules). Reachable from an invoice or a credit memo.',
    date: '2026-10-14',
    files: ['ApplyCreditMemoPage.vue', 'creditMemos.ts'],
  },
  {
    id: 'form-table-focus-ring',
    title: 'Form-table focus ring no longer clipped',
    description:
      'Every editable form-table cell now draws its focus/active (and error) ring as an ::after overlay above the collapsed column borders, so the ring’s left/right edges are no longer clipped or overpainted. Applied repo-wide (~45 cells across 38 form tables); codified in docs/patterns/FormTable.md.',
    date: '2026-10-14',
    files: ['FormTable.md', 'credit-memo.css', 'NewSalesInvoicePage.vue', 'CreateReceiptPage.vue', 'ManageBatchDrawer.vue'],
  },
  {
    id: 'apply-cm-form',
    title: 'Apply credit memo — Figma design pass',
    description:
      'Apply credit memo form aligned to Figma: white form-table header (not gray), the "Amount to apply" cell now fills the cell with no floating inner border and a left-aligned value, a subtle dashed divider between Amount to credit and Remaining credit, and the Attachment dropzone narrowed to match the Customer/Transaction date field width. Opening the form from an invoice now pre-applies the available credit to that invoice (capped by its balance).',
    date: '2026-10-14',
    files: ['ApplyCreditMemoPage.vue', 'credit-memo.css'],
  },
  {
    id: 'refund-cm-save',
    title: 'Create credit memo refund form',
    description:
      'New Create credit memo refund form — pays a customer’s remaining credit back in cash from a bank/cash account across one or more credit memos, with a live Total refund and inline validation.',
    date: '2026-10-14',
    files: ['CreateCreditMemoRefundPage.vue', 'creditMemos.ts'],
  },
  {
    id: 'new-cm-save',
    title: 'Create / edit credit memo form',
    description:
      'Inferred create/edit credit memo form (no explicit Figma frame — flagged as a design gap). Customer, date, credit-account lines, memo, attachments. Editing cannot reduce the memo below credit already used or move it to another customer once used.',
    date: '2026-10-14',
    files: ['NewCreditMemoPage.vue', 'creditMemos.ts'],
  },
  {
    id: 'cm-report-links',
    title: 'Credit memo report wired to the documents',
    description:
      'The Credit Memo report is now derived from the credit memo mini-DB (not a separate seed), so creating/editing/deleting a credit memo, application or refund updates the report immediately. Memo numbers and mutation rows deep-link to their detail pages.',
    date: '2026-10-14',
    files: ['creditMemoReport.ts', 'CreditMemoReportPage.vue', 'creditMemos.ts'],
  },
  {
    id: 'crm-generic-actions-column',
    title: 'Custom module: actions column with kebab menu',
    description:
      'Index table now has a [...] actions column at the right with View details, Edit, Archive, and Delete options. Archive and Delete show a confirmation modal before proceeding.',
    date: '2026-10-01',
    files: ['CrmGenericModulePage.vue'],
  },
  {
    id: 'crm-generic-empty-state',
    title: 'Custom module: proper empty state on index page',
    description:
      'Index page now shows the standard empty state (illustration + title + caption + secondary CTA) when no records exist, matching the Deals and Companies pattern per rule/empty-state-structure.',
    date: '2026-10-01',
    files: ['CrmGenericModulePage.vue'],
  },
  {
    id: 'crm-generic-product-list',
    title: 'Custom module: full product list on record detail page',
    description:
      'Record detail page now renders a full product list table matching Deals — search bar, Add product button, ProductCell rows, empty states, totals section (subtotal, discounts, tax, shipping, total), and CrmEditProductsDrawer for adding/editing products.',
    date: '2026-09-30',
    files: ['CrmGenericRecordDetailPage.vue', 'crm.ts'],
  },
  {
    id: 'crm-generic-filters-auto-fields',
    title: 'Custom module: "All filters" drawer auto-generates filter controls',
    description:
      'The "All filters" drawer now automatically shows filter dropdowns for every dropdown/checkbox/radio type field that is placed in the module\'s detail layout. Filters apply to the index table.',
    date: '2026-09-30',
    files: ['CrmGenericFiltersDrawer.vue', 'CrmGenericModulePage.vue'],
  },
  {
    id: 'crm-generic-dynamic-pages',
    title: 'Custom module: dynamic creation form, detail page, and filters drawer',
    description:
      'Custom module pages now fully reflect their module settings. "Create new record" opens a Deals-style form with fields from the module\'s layout. Detail page renders dynamic sections/fields. "All filters" button opens a keyword search drawer.',
    date: '2026-09-29',
    files: ['NewCrmGenericRecordPage.vue', 'CrmGenericRecordDetailPage.vue', 'CrmGenericModulePage.vue', 'CrmGenericFiltersDrawer.vue', '[...slug].vue'],
  },
  {
    id: 'crm-erp-integration-detail',
    title: 'ERP Integration Settings: detail page before editor',
    description:
      'Clicking "Manage" on the ERP Integrations list now opens a read-only detail page showing the module\'s conversion config. An "Edit" button navigates to the editor page.',
    date: '2026-09-28',
    files: ['CrmErpIntegrationDetailPage.vue', 'CrmErpIntegrationEditorPage.vue', '[...slug].vue'],
  },
  {
    id: 'crm-create-sales-order-inline',
    title: 'Create Sales Order form now in CRM',
    description:
      'The "Create Sales Order" button in CRM Deals now opens the full sales order form within CRM (/crm/deals/:id/create-order) instead of navigating to the ERP module. The form is the same ERP form, embedded with CRM breadcrumb navigation.',
    date: '2026-09-28',
    files: ['CrmNewSalesOrderPage.vue', 'CrmDealDetailPage.vue', '[...slug].vue'],
  },
  {
    id: 'crm-deals-exist-in-deals',
    title: 'Deals: properties aligned to PRD "Exist in Deals"',
    description:
      'The Deals module now only shows properties marked "Exist in Deals: TRUE" in the PRD. Properties like Notes, Memo, Description, Priority, billing/shipping addresses, deal value, and product list are excluded from Deals (they remain available for other modules). Detail layout updated accordingly.',
    date: '2026-09-24',
    files: ['crm.ts'],
  },
  {
    id: 'crm-additional-setup-drawer',
    title: 'New property: additional setup per field type',
    description:
      'The create/edit property drawer now shows per-field-type setup sections: text size for multi-line text, configurable boolean labels, image access (public/private), currency digits/decimals, sort options for picklist types, and 5 new field types (Percentage, Image, Date and time picker, Date range, Currency).',
    date: '2026-09-24',
    files: ['CrmPropertyDrawer.vue', 'crm.ts'],
  },
  {
    id: 'crm-property-type-labels',
    title: 'Properties: consistent field type labels',
    description:
      'Field type labels in the Properties table and filter dropdown now use human-readable names (e.g. "Dropdown select" instead of "pick_list") — matching the labels shown in the create property drawer.',
    date: '2026-09-24',
    files: ['crm.ts', 'CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-hide-variable-name',
    title: 'New property: hide Variable name field',
    description:
      'The Variable name field is now auto-generated from the property name and hidden from the create/edit property drawer. Users no longer need to manage it manually.',
    date: '2026-09-24',
    files: ['CrmPropertyDrawer.vue'],
  },
  {
    id: 'crm-editable-property-options',
    title: 'Properties: editable system property options',
    description:
      'System properties marked as editable (Status, Priority, Tags, Source, Payment Terms) now show an "Edit options" button. Opens a drawer where options can be renamed (rename scope) or added/deleted/renamed (add-delete-rename scope).',
    date: '2026-09-23',
    files: ['CrmModuleBuilderPage.vue', 'CrmEditOptionsDrawer.vue', 'crm.ts'],
  },
  {
    id: 'crm-pipeline-close-in',
    title: 'Pipeline: "Close in" replaces "Rotting in (days)"',
    description:
      '"Rotting in (days)" renamed to "Close in" and only available when Expected close date is in the layout. Swimlane preview cards reduced to 1. Delete stage and New stage buttons removed.',
    date: '2026-09-23',
    files: ['CrmModuleBuilderPage.vue'],
  },
  {
    id: 'pm-completion-true-up',
    title: 'Projects: completion true-up before close',
    description:
      'When every work package is technically complete but a cost-to-cost or unit-measured project measured under 100%, "Recognise remaining revenue" posts the rest of the contract value. The close gate now checks recognised revenue against contract value, so a job finished under plan can close.',
    date: '2026-09-22',
    files: ['CompletionTab.vue', 'projectActions.ts'],
  },
  {
    id: 'pm-draft-project-documents',
    title: 'Projects: Draft projects accept only draft purchase requests',
    description:
      'Firm documents (PO, expense, timesheet) can no longer post to a Draft project, and Draft projects consume no actual cost (PRD Story 7). A purchase request to a Draft project saves as a draft that commits nothing.',
    date: '2026-09-22',
    files: ['ProjectNewDocumentPage.vue', 'projectActions.ts', 'projectTransactions.ts'],
  },
  {
    id: 'pm-eco-affected-units',
    title: 'Projects: ECO cost delta counts only affected units',
    description:
      'The ECO diff and the budget revision on approval now count only future work orders plus the work orders in the effectivity scope — in-progress and unselected work orders keep their BOM version. Affected work orders keep line budgets within their set-aside.',
    date: '2026-09-22',
    files: ['EcoDiff.vue', 'ChangesTab.vue', 'projectActions.ts'],
  },
  {
    id: 'pm-pixel-rework',
    title: 'Projects: rebuilt on Pixel components',
    description:
      'The whole Projects module now uses Pixel 3 / ERP patterns: MpTabs on the project page, ErpFilterSelect for every dropdown, MpBanner, ErpStatusBadge, MpProgress, MpModal and the custom drawer shell, ActivityLogModal from the “Last updated by” line, and ErpTablePage on every index. Actions never disable for validation — they show an inline error instead — and success is a toast.',
    date: '2026-09-22',
    files: ['components/projects/**', 'project-mto.css', 'useProjectAction.ts', 'projectStatus.ts'],
  },
  {
    id: 'pm-release-approval',
    title: 'Projects: Finance approves project release (OQ7, provisional)',
    description:
      'Draft → Active is approved by Finance / Controller only, never by the project’s own PM. Other roles see "Waiting for Finance approval" and the reason in the dialog.',
    date: '2026-09-22',
    files: ['ProjectDetailPage.vue', 'projectActions.ts'],
  },
  {
    id: 'crm-module-per-tab-save',
    title: 'Module builder: per-tab save with unsaved-changes prompt',
    description:
      'Save is now per-tab — switching tabs with unsaved changes shows a discard confirmation. "Save changes" renamed to "Save" (secondary). Publish button moved from footer to page title area (primary, top-right) for draft modules.',
    date: '2026-09-22',
    files: ['CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-new-module-modal',
    title: 'New module: creation modal with locked access level',
    description:
      'Clicking "+ New module" now opens a modal asking for Module name and Access level (Company or Team). After "Continue", the Setup page opens with the name prefilled and the access level locked — Company users cannot switch to Team and vice versa.',
    date: '2026-09-21',
    files: ['CrmModulesPage.vue', 'CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-generic-filterbar',
    title: 'Custom modules: Deals-style filter bar & dynamic columns',
    description:
      'Custom module filter bar follows Deals layout. View toggle and pipeline filter only appear when kanban is configured; "All filters" button always shows. Table columns are dynamically derived from properties placed in the module Layout tab.',
    date: '2026-09-29',
    files: ['CrmGenericModulePage.vue'],
  },
  {
    id: 'crm-field-driven-pipeline',
    title: 'Custom modules: field-driven Kanban pipeline',
    description:
      'New custom modules start with an empty pipeline. In the Pipeline tab, a "Group by" picker lists only Picklist properties (Dropdown/Radio select) whose options become Kanban columns. Deals module stays hardcoded with predefined stages.',
    date: '2026-09-21',
    files: ['crm.ts', 'CrmModuleBuilderPage.vue', 'CrmGenericModulePage.vue'],
  },
  {
    id: 'crm-deal-detail-layout-sync',
    title: 'Deal details: layout matches module config',
    description:
      'Deal details tab now mirrors the module Layout configuration: Overview section (Deal name/Company/Billing | Contact person/Email/Phone | Value/Owner/Currency), Transaction section, and Shipping & delivery section with matching column order.',
    date: '2026-09-21',
    files: ['CrmDealDetailPage.vue'],
  },
  {
    id: 'crm-pipeline-no-custom-views',
    title: 'Pipeline: removed custom views',
    description:
      'Removed the "New view" button and view dropdown from the Pipeline tab in Settings/Modules. Custom pipeline views are deferred; only the default display is used.',
    date: '2026-09-21',
    files: ['CrmModuleBuilderPage.vue', 'CrmDealsPage.vue', 'CrmPipelineViewDrawer.vue'],
  },
  {
    id: 'crm-reports-no-delete',
    title: 'Reports: removed permanent delete action',
    description:
      'Removed the "Delete" row action from the Reports library per PRD requirement — V1 has no permanent user-facing deletion, only archive/restore.',
    date: '2026-09-21',
    files: ['CrmReportsPage.vue'],
  },
  {
    id: 'crm-reports-detail-tab',
    title: 'Reports: enhanced Report details tab',
    description:
      'Added 12 fields (Description through Created date) to the Report details tab using horizontal ContentList layout (label left / value right) for full definition visibility.',
    date: '2026-09-21',
    files: ['CrmReportViewerPage.vue'],
  },
  {
    id: 'crm-reports-builder-source-lock',
    title: 'Reports: source locked in edit mode',
    description:
      'Primary source module selector is now disabled when editing an existing report, per PRD: the primary source cannot be changed in-place after save.',
    date: '2026-09-21',
    files: ['CrmReportBuilderPage.vue'],
  },
  {
    id: 'crm-reports-builder-discard-guard',
    title: 'Reports: unsaved-changes confirmation',
    description:
      'Clicking Cancel in the report builder with unsaved changes now shows a "Discard changes?" confirmation dialog instead of navigating away immediately.',
    date: '2026-09-21',
    files: ['CrmReportBuilderPage.vue'],
  },
  {
    id: 'crm-reports-builder-preview-format',
    title: 'Reports: preview cell formatting',
    description:
      'Builder preview table now formats date and currency cells (formatDate, formatIDR) instead of showing raw values.',
    date: '2026-09-21',
    files: ['CrmReportBuilderPage.vue'],
  },
  {
    id: 'crm-reports-no-disabled-buttons',
    title: 'Reports: removed disabled button states',
    description:
      'Transfer ownership modal and Add filter button no longer use disabled states — inline error messages appear instead, per design rules.',
    date: '2026-09-21',
    files: ['CrmReportsPage.vue', 'CrmReportBuilderPage.vue'],
  },
  {
    id: 'crm-invite-user-redirect',
    title: 'Invite user redirects to ERP',
    description:
      'The "Invite user" button in CRM Settings › Users now navigates to the ERP Users & Roles invite page (/users-and-roles/invite). User invitation is an ERP-level function; CRM only displays users who have CRM permissions.',
    date: '2026-09-20',
    files: ['CrmSettingsPage.vue'],
  },
  {
    id: 'crm-module-activity-log',
    title: 'Activity log in module settings view mode',
    description:
      'Setup tab in view mode now shows an "Activity log" link below the module details. Clicking opens the ActivityLogModal with the module\'s change history (created, updated) including from/to details.',
    date: '2026-09-20',
    files: ['CrmModuleBuilderPage.vue', 'ActivityLogModal.vue'],
  },
  {
    id: 'crm-module-view-mode',
    title: 'Module settings open in view mode',
    description:
      'Clicking a module in Settings now opens a read-only view first — Setup as ContentList, Properties table without add/edit, Pipeline without sidebar or drag, Layout without drag-and-drop. Header shows an Actions dropdown: Draft modules get Edit/Publish/Delete; Published modules get Edit/Deactivate/Delete (Delete on a published module shows an info toast requiring deactivation first). Tab order: Setup → Properties → Layout → Pipeline → Check-in. Deals module cannot be deleted or deactivated.',
    date: '2026-09-20',
    files: ['CrmModuleBuilderPage.vue', 'CrmDetailLayoutBuilder.vue'],
  },
  {
    id: 'crm-module-checkin',
    title: 'Check-in tab on module settings',
    description:
      'New Check-in tab on deal-like module settings. Contains a toggle "Enable check-in for this module" with a description explaining that team members can check in at customer/prospect locations to log visits and track field activity.',
    date: '2026-11-04',
    files: ['CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-layout-erp-target',
    title: 'ERP transactions → Sales order/quote picker',
    description:
      'The ERP transactions tab in Edit layout lets you choose between "Sales order list" or "Sales quote list". The chosen target determines the tab name on the actual module page ("Sales orders" or "Sales quotes"). If no target is set, the tab is hidden from the module page. Deals defaults to Sales order.',
    date: '2026-09-20',
    files: ['crm.ts', 'CrmDetailLayoutBuilder.vue', 'CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-layout-system-tabs',
    title: 'System tabs are non-editable',
    description:
      'Activity, Notes, Files, and ERP transactions tabs in Edit layout are now fixed — they cannot add new sections. Each shows a static description of its purpose. Only the Details tab allows section management.',
    date: '2026-09-20',
    files: ['crm.ts', 'CrmDetailLayoutBuilder.vue'],
  },
  {
    id: 'crm-layout-preview',
    title: 'Preview layout drawer — Deal & custom module replicas',
    description:
      'Preview layout drawer: for all modules, both Form and Details record previews follow the same high-fidelity format. Deals module previews are exact replicas of their actual pages. Custom module previews use the same dp-*/si-* component structure — products table with thumbnail/SKU/search/add, memo/attachment + totals section, form with drag-handle line items table, checkbox fields, and section headers.',
    date: '2026-09-22',
    files: ['CrmDetailLayoutBuilder.vue'],
  },
  {
    id: 'crm-record-name-value-rename',
    title: 'Generic modules use "Record" terminology for all properties',
    description:
      'Custom/generic modules now use "Record name", "Record value", "Record stage", "Record type" and variableName record_owner/record_stage/record_type instead of "Deal" prefixed labels. Only the Deals module keeps "Deal" terminology. Pipeline card preview and detail page also use the property\'s actual name.',
    date: '2026-09-21',
    files: ['crm.ts', 'CrmModuleBuilderPage.vue', 'CrmGenericRecordDetailPage.vue'],
  },
  {
    id: 'crm-module-name-mandatory',
    title: 'Module name is mandatory on save',
    description:
      'Saving changes to a module now validates that the module name is not empty. If blank, an inline error appears and the save is blocked.',
    date: '2026-09-19',
    files: ['CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-draft-fill-rate-zero',
    title: 'Draft modules show 0% fill rate',
    description:
      'Unpublished (draft) modules now show 0% fill rate on all properties, since they have no live records. Fill rates only compute from actual records once the module is published.',
    date: '2026-09-19',
    files: ['CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-close-in-live',
    title: 'Close in — days until expected close date',
    description:
      'Pipeline card badge now shows days remaining until the expected close date ("Close in") instead of days since deal creation ("Rotting in"). Only shown when the deal has an expected close date. Warn tone when ≤7 days, danger when overdue.',
    date: '2026-09-23',
    files: ['CrmDealsPage.vue'],
  },
  {
    id: 'crm-pipeline-card-props',
    title: 'Pipeline card fields use DB properties',
    description:
      'Pipeline card fields "Date" and "Note" renamed to "Close date" and "Memo" to match the actual DB property names. All card fields now correspond to properties in the module property list.',
    date: '2026-09-20',
    files: ['crm.ts', 'CrmDealsPage.vue', 'CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-properties-trimmed',
    title: 'Default properties trimmed to 51',
    description:
      'Removed 39 analytics/computed/meeting-tool properties that are not needed in the current CRM scope (Amount in company currency, Annual contract/recurring, Forecast, Next meeting, etc.). Service type also removed. All modules now share 51 core default properties.',
    date: '2026-09-20',
    files: ['crm.ts', 'CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-default-properties-v2',
    title: 'Default properties unified across all modules',
    description:
      'All CRM properties are shared as DEFAULT_PROPERTIES — every module (Deals, custom) gets the identical property set. Fill rates are computed per-module from actual records.',
    date: '2026-09-19',
    files: ['crm.ts', 'crmConversion.ts', 'CrmModuleBuilderPage.vue', 'crmReports.ts'],
  },
  {
    id: 'crm-selected-card-property-metadata',
    title: 'Selected card properties show metadata',
    description:
      'The Add property drawer now shows selected properties with the same icon and variable-name subtitle as the available-properties list. Company shows variable name "Company"; Contact person shows "customer".',
    date: '2026-09-19',
    files: ['CrmModuleBuilderPage.vue', 'SelectAccessDrawer.vue'],
  },
  {
    id: 'crm-module-close-date-record-copy',
    title: 'Default close date copy is record-neutral',
    description:
      'The default close date helper text now says "a record" instead of "a Deal" so custom modules do not show deal-specific wording.',
    date: '2026-09-19',
    files: ['CrmModuleBuilderPage.vue', 'translations.ts'],
  },
  {
    id: 'sidebar-collapsed-tooltip',
    title: 'Collapsed sidebar shows menu tooltips',
    description:
      'When the nav rail is collapsed to icons, hovering a menu now shows a Pixel tooltip with its name. Items that already reveal a flyout on hover, and the active item whose level-2 panel is open, intentionally show no tooltip.',
    date: '2026-09-18',
    pr: '#85',
    files: ['ErpSidebar.vue', 'CrmSidebar.vue', 'HrSidebar.vue'],
  },
  {
    id: 'crm-settings-properties-hidden',
    title: 'Settings Properties page deprecated',
    description:
      'The standalone CRM Settings Properties page is removed. Property management stays inside each module under Settings > Modules. System properties overhauled to match the definitive list.',
    date: '2026-09-23',
    files: ['CrmSidebar.vue', '[...slug].vue', 'crm.ts'],
  },
  {
    id: 'crm-company-property-label',
    title: 'Customer property is now Company',
    description:
      'The CRM module property formerly labelled Customer is now labelled Company, matching its Company association type and the company-first CRM model.',
    date: '2026-09-18',
    files: ['crm.ts', 'CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-system-properties-overhaul',
    title: 'System properties overhauled',
    description:
      'DEFAULT_PROPERTIES rewritten to the definitive 32 visible + 10 hidden system properties. Uses API-style field types. Editable properties (Status, Priority, Tags, Source, Payment Terms) show an edit button. Properties with existInDeals=false are excluded from default layout/pipeline card. Removed deprecated shipping, tax, and ERP-specific properties.',
    date: '2026-09-23',
    files: ['crm.ts', 'CrmModuleBuilderPage.vue', 'crmConversion.ts', 'crmReports.ts', 'CrmDetailLayoutBuilder.vue'],
  },
  {
    id: 'crm-system-property-actions-removed',
    title: 'System properties are read-only',
    description:
      'System-created module properties no longer show the row action menu. Their edit/delete actions are removed so built-in CRM fields stay protected.',
    date: '2026-09-18',
    files: ['CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-property-created-by-filter',
    title: 'Filter properties by creator',
    description:
      'Module Properties now has a Created by filter. System/default properties stay grouped as System, while custom properties are tracked by creator name so admins can filter properties made by each user.',
    date: '2026-09-18',
    files: ['CrmModuleBuilderPage.vue', 'crm.ts'],
  },
  {
    id: 'deal-unit-readonly',
    title: 'Unit column is now read-only',
    description:
      'In deal & order product lines the Unit is no longer a selectable dropdown — it is fixed by the chosen product and rendered as a filled, disabled cell (same chrome as the Amount column).',
    date: '2026-09-18',
    pr: '#82',
    files: ['NewCrmDealPage.vue', 'NewSalesOrderPage.vue'],
  },
  {
    id: 'deal-quick-add-contact',
    title: 'Quick-add contact from the deal Contact picker',
    description:
      'The Contact picker now has a bottom action: click "+ New contact", or search a name that isn\'t found → "Add \'<name>\' as new contact". Both open a quick-add modal (Display name, Full name Mr/Mrs/Ms, Email, Mobile) that creates a real contact and selects it.',
    date: '2026-09-18',
    pr: '#81',
    files: ['NewCrmDealPage.vue', 'CrmQuickContactModal.vue'],
  },
  {
    id: 'deal-contact-first',
    title: 'Deals are contact-first (company derived)',
    description:
      'Pick the Contact first; the Company is derived from it and shown beside — one company is read-only, several become a picker, none is hidden (not every contact has a company). Applies to create deal, edit deal, and the deal detail header.',
    date: '2026-09-18',
    pr: '#80',
    files: ['NewCrmDealPage.vue', 'CrmDealDetailPage.vue'],
  },
  {
    id: 'crm-erp-conversion-settings',
    title: 'ERP integration (transaction conversion) settings',
    description:
      'New Settings → ERP integrations surface: per-module enable + SQ/SO target, read-only field mapping (mandatory/optional) and readiness, with manual read-only conversion of a CRM record into one ERP transaction. Only published modules can be integrated.',
    date: '2026-09-18',
    pr: '#79',
    files: ['CrmErpIntegrationsPage.vue', 'CrmErpIntegrationEditorPage.vue', 'crmConversion.ts'],
  },
  {
    id: 'deal-product-stock',
    title: 'Deal product picker: catalog + per-warehouse stock',
    description:
      'The product dropdown now sources from the product DB ([photo] Name / SKU · first category) — no ad-hoc "add product". Available stock shows per selected warehouse (or total across all warehouses when none is picked); the warehouse list comes from the warehouse DB.',
    date: '2026-09-18',
    pr: '#79',
    files: ['NewCrmDealPage.vue', 'NewSalesOrderPage.vue', 'warehouseDetails.ts'],
  },
  {
    id: 'crm-label-alignment',
    title: 'UI labels match DEFAULT_PROPERTIES',
    description:
      'All CRM UI labels now match the labels defined in DEFAULT_PROPERTIES: "Customer" → "Company", "Deal value" → "Value", "Close date" → "Expected close date". Applied across preview drawer, detail page, index pages, filters, export columns, and pipeline card fields.',
    date: '2026-09-21',
    pr: '#86',
    files: ['CrmDealPreviewDrawer.vue', 'CrmDealDetailPage.vue', 'CrmDealsPage.vue', 'CrmGenericModulePage.vue', 'CrmModuleBuilderPage.vue', 'CrmDealsFiltersDrawer.vue'],
  },
  {
    id: 'deal-preview-totals',
    title: 'Deal preview: totals breakdown',
    description:
      'The deal preview drawer now shows Subtotal, PPN, Shipping fee, and Total below the product table — the "Expected deal value" in Overview now reconciles with the visible line items. Seed values updated to match the calculated total (subtotal + PPN 11% + shipping).',
    date: '2026-09-21',
    pr: '#86',
    files: ['CrmDealPreviewDrawer.vue', 'crm.ts'],
  },
  {
    id: 'crm-pipeline-card-props-layout-filter',
    title: 'Pipeline card properties filtered by layout',
    description:
      'Card properties in the pipeline editor now show only properties that exist in the module\'s detail layout. The "Add property" drawer also only offers layout properties. For custom modules, the pipeline "Group by" field picker only lists picklist properties present in the layout.',
    date: '2026-09-24',
    files: ['CrmModuleBuilderPage.vue'],
  },
  {
    id: 'crm-generic-detail-page-overhaul',
    title: 'Custom module detail page redesign',
    description:
      'Detail page now follows Deals format: Move to dropdown (pipeline only), kebab menu with Edit/Delete, pipeline stepper (when configured), sections driven 100% by detailLayout config. Date fields are formatted.',
    date: '2026-09-30',
    files: ['CrmGenericRecordDetailPage.vue'],
  },
  {
    id: 'crm-generic-index-all-props',
    title: 'Custom module index shows all properties',
    description:
      'The table on the custom module index page now shows ALL properties as columns instead of only those placed in layout sections.',
    date: '2026-09-30',
    files: ['CrmGenericModulePage.vue'],
  },
  {
    id: 'rsi-schedule-fields',
    title: 'New recurring sales invoice form',
    description:
      'A new form page for creating recurring sales invoices, with fields for repeat interval/unit, end repeat options, start date, next transaction date, and automatic email sending.',
    date: '2026-10-22',
    files: ['NewRecurringSalesInvoicePage.vue'],
  },
  {
    id: 'si-set-as-recurring',
    title: 'Set as recurring action',
    description:
      'Row action in All sales invoices to convert an invoice into a recurring template via a drawer with repeats every, end repeat, start date, and send automatic email fields.',
    date: '2026-10-22',
    files: ['SalesInvoicesPage.vue'],
  },
  {
    id: 'si-detail-recurring-btn',
    title: 'Recurring settings on invoice detail',
    description:
      'Icon button in the invoice detail title bar (visible for invoices linked to a recurring template). Opens a drawer showing the schedule (view/edit), auto-email toggle, and recurring history.',
    date: '2026-10-22',
    files: ['SalesInvoiceDetailsPage.vue'],
  },
  {
    id: 'file-manager-index',
    title: 'File manager index',
    description:
      'Other lists \u203a File manager: every file attached anywhere in the account, with Page and Number filters, search, and row actions. A file with no transaction number has no page yet, so its row offers Attach to an existing transaction / Create a new transaction; an attached file offers Change page instead.',
    date: '2026-10-23',
    files: ['FileManagerPage.vue', 'fileManager.ts'],
  },
  {
    id: 'file-manager-drop',
    title: 'Drag & drop to upload',
    description:
      'Dropping files anywhere on the File manager page uploads them straight away \u2014 no modal, no staging step. They land unattached, so each new row offers Attach to an existing transaction from its row menu. Reuses GlobalFileDropOverlay.',
    date: '2026-10-23',
    files: ['FileManagerPage.vue', 'GlobalFileDropOverlay.vue'],
  },
  {
    id: 'file-manager-add-drawer',
    title: 'Add file drawer',
    description:
      'Add file in the File manager title bar now opens a drawer: stage the files, then either attach them to an existing transaction (Page + transaction number, both read from the real module stores) or pick the transaction to create. Continue routes to that create form with the files already attached. Only pages whose form has an Attachment field are offered under Create.',
    date: '2026-10-23',
    files: ['AddFileDrawer.vue', 'FileManagerPage.vue', 'fileAttachmentHandoff.ts'],
  },
  {
    id: 'file-manager-bulk-actions',
    title: 'File manager bulk actions',
    description:
      'Selecting rows shows one secondary-sm Actions dropdown holding the same four entries as the row menu: Download, Attach to an existing transaction, Create a new transaction, Delete. Attach and Create reuse the Add file drawer in its existing-files mode, so the Application section behaves identically however it is reached.',
    date: '2026-10-23',
    files: ['FileManagerPage.vue', 'AddFileDrawer.vue'],
  },
  {
    id: 'bom-bulk-archive',
    title: 'Bulk archive on Bill of materials',
    description:
      'The bulk bar on the BOM index shipped a Delete button wired to no handler — selecting rows and pressing it did nothing. It now archives the selection behind a confirm that names how many BOMs go, and is labelled Archive, because this module has no hard delete: the row menu archives too and an archived BOM stays reachable via Show archived BOM. Rows already archived are left out of the count.',
    date: '2026-10-23',
    files: ['BillOfMaterialsIndexPage.vue'],
  },
  {
    id: 'activity-log-index',
    title: 'Activity log index',
    description:
      'Other lists \u203a Activity log: the company-wide audit trail (Figma Other-Lists 4215-21752) as DATE \u00b7 USER \u00b7 ACTIONS \u00b7 FEATURE \u00b7 NUMBER \u00b7 DETAIL. An update reads old \u2192 new; a busy entry shows three lines plus a "+N more" toggle. Filter by Actions, Feature, or All filters (date range + user), and search across every column. Same table the CRM already renders from the same Figma node, contextualised for ERP modules.',
    date: '2026-10-23',
    files: ['ActivityLogPage.vue', 'activityLog.ts'],
  },
  {
    id: 'mp-upload-change-payload',
    title: 'Upload fields stage what you pick',
    description:
      'MpUpload emits the native Event (ev.target.files), but 17 attachment fields typed their handler as a FileList, so nothing was ever staged — the picked file silently vanished. All of them now accept both shapes.',
    date: '2026-10-23',
    files: ['AddFileDrawer.vue', 'NewCreditMemoPage.vue', 'SpendMoneyPage.vue'],
  },
  {
    id: 'crm-paywall',
    title: 'CRM paywall — first-run + trial-expired',
    description:
      'A tenant without active CRM access hits a full-bleed paywall on every /crm route (no level-1 CRM sidebar). Two faces: "none" (educational first-run) and "expired" (trial ended). Updated per feedback: 4 value props (added Custom Module), revised step copy with module builder mention, "Sync to ERP" step-2 item, heading changed to "How easy the Sales tracking can be?", removed Schedule a demo button, CTA buttons moved inline with titles on both faces. 2×2 grid value-prop layout.',
    date: '2026-11-01',
    files: ['CrmPaywallPage.vue', 'useCrmAccess.ts', '[...slug].vue', 'CrmDealsPage.vue', 'default.vue'],
  },
]

const byId = new Map(DEV_CHANGES.map(c => [c.id, c]))
export function getDevChange(id: string): DevChange | undefined {
  return byId.get(id)
}

/** GitHub repo base for turning a "#82" PR ref into a link. */
export const DEV_CHANGES_REPO = 'https://github.com/harnods/pixel-erp'
