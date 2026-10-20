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
    id: 'replenishment-purchase-return',
    title: 'Replenishment: purchase returns and in-transit',
    description:
      'A purchase return against received goods no longer leaves the worklist wrong (Vendor Supply Profile RS-009 / Rule 52). By default a return does not re-open in-transit: the goods stay received. Only a return marked "replacement expected" adds its qty back to in-transit, which lowers the suggested qty. Neither changes lead time. The worklist In transit cell shows "Returned, replacement expected N", and the Suggested qty drawer explains each return for the product — counted as incoming or not. Demo (no Purchase Return module yet): Anomali receipt RCV-2026-0010 into Gudang Jakarta Pusat — PRET-2026-001 returns 10 of SKU 1101 with a replacement expected, PRET-2026-002 returns 6 of SKU 1005 with none.',
    date: '2026-10-20',
    files: ['purchaseReturns.ts', 'replenishment.ts', 'ReplenishmentPage.vue', 'SuggestionBreakdownDrawer.vue'],
  },
  {
    id: 'pr-partial-conversion',
    title: 'Purchase request: partial conversion to purchase orders',
    description:
      'A purchase request line can now be converted in parts (Vendor Supply Profile RS-003 / Rule 41). Each line records how much is already on purchase orders; converting again pre-fills only what is left ("Converted earlier: 40 of 60. Ordering the rest"), and a fully converted line is not offered again. Lines read Open, Partially converted, Converted or Closed — the request detail shows Converted qty and Status per line once anything is converted. The request is closed when nothing is left, otherwise Partially processed; Mark as completed closes the rest. Create purchase order is hidden on closed or fully converted requests (so nothing is ordered twice), and now works from the request detail\'s Actions menu too, which previously did nothing.',
    date: '2026-10-20',
    files: ['replenishmentDraftPo.ts', 'types.ts', 'PurchaseRequestDetailsPage.vue', 'PurchaseRequestsPage.vue', 'ConvertPrToPoModal.vue', 'ErpStatusBadge.vue'],
  },
  {
    id: 'product-vendor-priority',
    title: 'Vendors tab: vendor priority and the fallback when a preferred vendor goes inactive',
    description:
      'Each vendor of a product now has a priority, 1 = first, the same in every warehouse (Vendor Supply Profile RS-014 / Rule 61). The Vendors tab lists vendors in priority order with a Priority column; Edit priority turns it into a number select per vendor (picking a number swaps two vendors, so priority stays unique) with Cancel / Save changes. Without a set priority, vendors are ordered by their latest invoice, then by name. When the product\'s preferred vendor is deactivated, it falls to the next active vendor BY PRIORITY (Rule 62) — previously the next by lead time; a warehouse whose own pick is deactivated falls to the product\'s preferred vendor (D23). Either way the warehouse is flagged "Fallback vendor. Review the preferred vendor" on the worklist and Stock by warehouses until someone picks a preferred vendor. With no active vendor left, the preferred vendor is cleared ("No preferred vendor set" / "No vendor").',
    date: '2026-10-20',
    files: ['vendorItems.ts', 'ProductDetailsPage.vue', 'ReplenishmentPage.vue', 'SuggestionBreakdownDrawer.vue', 'CreatePurchaseRequestModal.vue'],
  },
  {
    id: 'product-vendor-linked-from-pr',
    title: 'Vendors tab: a vendor added by a purchase request',
    description:
      'When a purchase request names a vendor that does not supply the product yet, saving it adds that vendor to the product (Vendor Supply Profile RS-015 / Rule 64) — with no MOQ, purchase multiplier or price. The product Vendors tab now shows that row with "Added from Purchase Request #N. No purchase yet", "Not set" in the MOQ, multiplier and unit cost cells, and a Set terms link that opens the vendor\'s Products tab, where the MOQ and multiplier read "Not set" too and can be edited. Its last price is "No purchase yet" rather than an invented figure. The Request to purchase modal says this before you save.',
    date: '2026-10-20',
    files: ['vendorItems.ts', 'vendorLastPrice.ts', 'replenishmentPurchaseRequest.ts', 'ProductDetailsPage.vue', 'VendorProductsTab.vue', 'VendorItemDrawer.vue', 'CreatePurchaseRequestModal.vue'],
  },
  {
    id: 'replenishment-goods-in-transit-invoice',
    title: 'Replenishment: invoiced but not yet received (Goods-in-Transit)',
    description:
      'A supplier invoice billed before the goods arrive no longer leaves a buyer guessing (Vendor Supply Profile RS-020 / Rule 32). The qty stays in transit until it is actually received, and the invoice never counts as a receipt for lead time. The worklist In transit cell adds "Invoiced, not received N", and the Suggested qty drawer marks the document "invoiced on <invoice>, not received" with a one-line explanation. Demo: Tanamera invoice PINV-2026-GIT-001 bills Purchase Order #10091 (receipt RCV-2026-0002, Gudang Surabaya Timur) before receipt — see SKUs 1102, 1005 and 1003 there.',
    date: '2026-10-20',
    files: ['goodsInTransitInvoices.ts', 'replenishment.ts', 'ReplenishmentPage.vue', 'SuggestionBreakdownDrawer.vue'],
  },
  {
    id: 'replenishment-pr-line-required-date',
    title: 'Purchase request: required date on each line',
    description:
      'Each line of a purchase request now has its own Required date (Vendor Supply Profile RS-002). When you raise requests from the replenishment worklist, it defaults to the run date plus that line\'s lead time and you can change it in the Request to purchase modal; a date before the request date shows an inline error. The request\'s own Required date is the latest of its lines. The purchase request detail shows the date per line (a line without one falls back to the request date). Also fixed: a request raised from the worklist now shows its real warehouse and address on the detail page, and no demo note.',
    date: '2026-10-20',
    files: ['CreatePurchaseRequestModal.vue', 'PurchaseRequestDetailsPage.vue', 'replenishmentPurchaseRequest.ts', 'purchaseRequestDetails.ts', 'types.ts'],
  },
  {
    id: 'replenishment-stat-view-list',
    title: 'To order: "View replenishment list" shortcuts on the stat cards',
    description:
      'The "Covered by in transit" and "Stocks out before resupply" stat cards each carry a "View replenishment list" link that applies the matching Signals quick filter in one click — "Covered by in transit" and "Stocks out before resupply" respectively — so the worklist narrows to exactly the rows the card counts. Mirrors the Products page\'s "View replenishment" stat-card pattern.',
    date: '2026-10-13',
    files: ['ReplenishmentPage.vue'],
  },
  {
    id: 'replenishment-real-lead-time-docs',
    title: 'Richer demo: full lead-time × demand matrix + genuine exportable purchases',
    description:
      'The demo data now exercises every lead-time × demand combination. Lead time: real (computed from documents), estimated (category default), and none → Needs setup — the last now works out of the box because the "Other categories" lead-time floor defaults to "Not set". Demand: none → Needs setup, provisional, and mature. Three hero cells (1008 @ Jakarta Pusat, 1102 @ Makassar Selatan, 1106 @ Palembang) resolve their real lead time from GENUINE seeded purchase orders + goods receipts, so "View the suggested qty calculation" → "Export purchases (CSV)" cites PO/receipt numbers you can open in Purchases and WMS, not "(modelled)".',
    date: '2026-10-13',
    files: ['replenishmentLeadTimeDemo.ts', 'leadTimeHistory.ts', 'purchaseOrders.ts', 'receipts.ts', 'replenishmentConfig.ts', 'SuggestionBreakdownDrawer.vue'],
  },
  {
    id: 'replenishment-import-removed',
    title: 'Replenishment: removed the Import (bulk per-warehouse settings) button',
    description:
      'The Import button was removed from the worklist title bar, along with its page (/replenishment/import), the bulk-settings CSV import module, and its test. It previously implemented US-021 AC-02 (bulk-import per-warehouse settings). Per-warehouse settings — safety days, reorder point and preferred vendor — are still editable individually on a product\'s Stock-by-warehouses tab.',
    date: '2026-10-13',
    files: ['[...slug].vue'],
  },
  {
    id: 'replenishment-formula-input-columns-removed',
    title: 'To order: removed Lead time, Demand velocity & Safety days columns',
    description:
      'The three demand-formula input columns — Lead time days, Demand velocity per day, and Safety days — were removed from the To order table. They are the inputs to the suggested-qty formula and are already shown, together with their effect on the result, in the "View the suggested qty calculation" drawer. Keeping them in the index too just asked the reader to re-derive the formula by eye. The figures still live in the calculation drawer, in the "Stocks out before resupply" signal tooltip (lead + safety), and in the CSV export for offline analysis.',
    date: '2026-10-13',
    files: ['ReplenishmentPage.vue'],
  },
  {
    id: 'replenishment-outlier-cap-off',
    title: 'Demand: removed the demand-qty outlier cap (+ Reminder & Outlier-cap settings rows)',
    description:
      'The engine no longer clips individual spike sales days out of the demand average — the flat average now counts every real sales day in full. This corrects a misread of the PRD: the "outlier cap" in US-002 AC-04/AC-05 (§2.7) is the provisional ORDER-UP-TO cap (coverage forced to 0 during the launch window so a spike can\'t drive a large PR), which is untouched, NOT a clip on sales qty. The now-dead "Outlier cap" row and the "Reminder" section were removed from Replenishment settings; the Inbox daily-reminder notification itself stays.',
    date: '2026-10-13',
    files: ['replenishment.ts', 'replenishmentConfig.ts', 'SettingsReplenishmentPage.vue'],
  },
  {
    id: 'replenishment-requested-qty-us030',
    title: 'To order: Requested qty column (partial-request tracking, US-030)',
    description:
      'A "Requested qty" column after Suggested qty tracks how much of a line\'s shortfall is already on OPEN Purchase Requests raised from it — the live sum of open replenishment PR-line qty for that SKU × warehouse. Attribution is the PR\'s replenishment ORIGIN lines (VR-05), so direct PRs from the PR index and PRs that merely carry a replenishment flag never leak unrelated SKUs; the qty read is live, reflecting purchasing edits. A new "Request to purchase" pre-fills the REMAINING need (Suggested − Requested, editable up), so a partial request is never double-requested. Suggested qty is unchanged — open PRs show only in Requested; when a PR converts to a PO the qty leaves Requested as In-transit rises, counted exactly once. The separate "Remaining to request" column was dropped (it is Suggested − Requested and the table is already wide); a few seed PRs make the column non-zero out of the box. Like Suggested qty, Requested qty is a locked column — it is always shown and cannot be hidden from the column settings.',
    date: '2026-10-12',
    files: ['replenishment.ts', 'replenishmentPurchaseRequest.ts', 'ReplenishmentPage.vue', 'purchaseRequests.ts'],
  },
  {
    id: 'replenishment-copy-and-reason-filter',
    title: 'Copy: Mute replenishment / Vendor list / Edit; + Reason filter on Needs setup',
    description:
      'Renamed the worklist action "Turn off tracking" to "Mute replenishment" (and its inverse "Turn on tracking" to "Unmute replenishment", with matching toasts/confirms) for a clearer mute vocabulary. The row action "View vendors, lead time and MOQ" is now "Vendor list". On the product Stock-by-warehouses tab the "Edit vendor" button is back to a general "Edit" (it edits safety days, reorder point and preferred vendor). Needs setup gains a "Reason" quick filter beside Movement (No demand / Waiting for lead time / Missing vendor / Muted replenishment), and its muted-row reason reads "Muted replenishment" to match the new mute vocabulary.',
    date: '2026-10-12',
    files: ['ReplenishmentPage.vue', 'ReplenishmentSetupPage.vue', 'SkuReplenishmentSettingsDrawer.vue', 'SuggestionBreakdownDrawer.vue', 'CreatePurchaseRequestModal.vue', 'ProductDetailsPage.vue'],
  },
  {
    id: 'replenishment-to-order-column-order',
    title: 'To order: columns rearranged to the worklist spec',
    description:
      'The To order table columns now follow the PM spec order: Product, SKU, Warehouse, Movement, Signals, On hand qty, Reserved qty, Available qty, In transit qty, Suggested qty, Reorder point, Days of cover, Unit, Preferred vendor, Lead time days, Demand velocity per day, Safety days. Warehouse moved up beside the identity columns, Days of cover sits right after Reorder point, and the Vendor column is relabelled "Preferred vendor" (it already shows the per-warehouse preferred vendor). "Days of cover" appears once (the spec listed it twice).',
    date: '2026-10-12',
    files: ['ReplenishmentPage.vue'],
  },
  {
    id: 'replenishment-needssetup-no-demand-and-filters',
    title: 'Needs setup: "No demand" + "Waiting for lead time" reasons, with a Movement filter',
    description:
      'Needs setup now shows — in the Reason column — the two gaps a person must resolve before a recommendation is possible: "No demand" (a tracked SKU with no sales in the lookback window, so no reorder point can be computed) and "Waiting for lead time" (no vendor PO→GR history and no default). A 0-sales tracked SKU now routes here with a "No demand" reason instead of dropping off silently (PM override of D18); it still leaves on its own once a first sale lands. The tab gains a Movement quick filter, mirroring To order.',
    date: '2026-10-12',
    files: ['replenishment.ts', 'ReplenishmentSetupPage.vue'],
  },
  {
    id: 'replenishment-to-order-signals-five',
    title: 'To order: Signals aligned to the five-tag spec',
    description:
      'The To order Signals column and filter are exactly five: Volatile demand, Provisional, Estimated lead time, Stocks out before resupply, and Covered by in transit. "Stocks out before resupply" is now shown as a Signals badge (not only a red Days-of-cover number). "Covered by inbound" is renamed "Covered by in transit" across the badge, filter, stat card and daily reminder (the stockout-wins variant reads "Verify in-transit arrival"). "Stale velocity" is dropped as a row signal (the whole-worklist stale banner stays), and the no-lead-time case lives on Needs setup, not here.',
    date: '2026-10-12',
    files: ['ReplenishmentPage.vue', 'ReplenishmentFiltersDrawer.vue', 'replenishmentReminder.ts'],
  },
  {
    id: 'sample-multi-preferred-vendor',
    title: 'Sample: products with more than one preferred vendor',
    description:
      'Two demo products now ship with a DIFFERENT preferred vendor in some of their warehouses (D23), so the multi-preferred-vendor case is reachable on a fresh demo: "Roasted Beans House Blend Medium" (1101) — Toraja Sapan Estate in 5 warehouses, Klasik Beans Cooperative in 4; and "Batch Brewer 2.5L Thermal" (2201) — Roast Machinery Indonesia in 5, PT Kemasan Prima Nusantara in 4. The split seeds the per-warehouse overlay and is overridden by any real edit on the Stock-by-warehouses tab.',
    date: '2026-10-06',
    files: ['vendorItems.ts'],
  },
  {
    id: 'product-warehouses-preferred-vendor',
    title: 'Set the preferred vendor per warehouse (Stock by warehouses)',
    description:
      'The preferred vendor is per SKU × warehouse (D23), so it is now set where the other per-warehouse decisions live — the product\'s Stock-by-warehouses tab. In Edit mode each warehouse row has a vendor selector (with bulk-apply) next to Safety days and Reorder point, and the saved pick shows with its single lead time. Data grain is separated cleanly: MOQ / purchase multiplier / cost stay on the Vendors tab (vendor × product); lead time and preferred vendor are per warehouse.',
    date: '2026-10-06',
    files: ['ProductDetailsPage.vue', 'vendorItems.ts'],
  },
  {
    id: 'vendors-drawer-readonly-preferred',
    title: 'Vendors drawer is a read-only view of vendor terms',
    description:
      'Preferred vendor is chosen per warehouse on the product\'s Stock by warehouses tab, so the Vendors drawer (opened from the worklist and Needs setup) is now only a viewer: no radios, add/remove, inputs, Save or footer. Lead time shows as the per-warehouse range with a header tooltip (no repeated sub-line), Unit cost appears once (a per-stocking-unit line only when it differs), the Airene recommendation banner and "AI pick" tag are hidden, and the note under the table links to the Stock by warehouses tab.',
    date: '2026-10-07',
    files: ['VendorItemDrawer.vue', 'ReplenishmentPage.vue', 'ReplenishmentSetupPage.vue'],
  },
  {
    id: 'replenishment-lead-time-no-vendor-default',
    title: 'Lead-time ladder drops the vendor-default rung',
    description:
      'The lead-time resolution ladder no longer has a vendor-level default tier (D5a / D10). A SKU × warehouse cell too thin to compute from PO→GR history now falls straight to the category default, then the "Other categories" floor, then Needs setup — never to an average of the vendor\'s other products. The calculation breakdown therefore tags a thin cell as "estimated (category default)" rather than "estimated (vendor default)".',
    date: '2026-10-06',
    files: ['leadTimeHistory.ts'],
  },
  {
    id: 'replenishment-manual-min-clamped-to-max',
    title: 'Manual min stock is capped at the order-up-to (Max)',
    description:
      'A typed manual reorder point is still the trigger, but it is now clamped to the computed order-up-to level — effective trigger = min(manual min, computed Max) (D13). A reorder point above the level we would ever stock up to is self-contradictory, so the settings drawer warns when the typed value is above Max and the engine caps it there. The computed reorder point is still shown beside it as a note, and demand, Max, suggested qty and days of cover stay system-computed.',
    date: '2026-10-06',
    files: ['replenishment.ts', 'SkuReplenishmentSettingsDrawer.vue'],
  },
  {
    id: 'vendors-preferred-per-warehouse',
    title: 'Preferred vendor is per warehouse (engine)',
    description:
      'The preferred vendor can differ per SKU × warehouse (D23): a per-warehouse overlay sits on top of the SKU-level default, and a warehouse with no pick falls back to it. The replenishment engine resolves lead time and the draft-PR vendor per SKU × warehouse accordingly. (Editing now lives on the product\'s Stock-by-warehouses tab.)',
    date: '2026-10-06',
    files: ['vendorItems.ts', 'replenishment.ts'],
  },
  {
    id: 'replenishment-recalc-failed',
    title: 'Replenishment: failed recalculation keeps the last numbers',
    description:
      'If Recalculate fails, the worklist no longer shows a success toast or goes blank: an error banner above the cards says "Recalculation failed. The numbers below are from <date>." with a Try again button, and the table keeps the last good run (PRD US-013 EH-02). The stale-numbers banner is replaced while the error shows.',
    date: '2026-10-08',
    files: ['ReplenishmentPage.vue'],
  },
  {
    id: 'replenishment-section-edit',
    title: 'Replenishment settings: Edit on each section',
    description:
      'Replenishment settings no longer has one page-level Edit and a sticky footer. Each section (Product categories, Demand, Safety days, Reorder point & coverage, Lead time, Movement classification, Reminder) has its own Edit button, like Company profile. Editing opens that section ("Edit demand"), with its own Reset to defaults, Cancel and Save changes at the bottom; only one section is editable at a time and Save changes saves just that section. View-only users see no Edit buttons.',
    date: '2026-10-08',
    files: ['SettingsReplenishmentPage.vue', 'settings-page.md', 'RULES.md'],
  },
  {
    id: 'replenishment-daily-reminder',
    title: 'Replenishment: daily reminder in the Inbox',
    description:
      'Replenishment settings has a new Reminder section with a Daily reminder switch (on by default). While it is on and something needs ordering, the Inbox shows a notification at the top — "N products to order" — summarising the products at or below their reorder point (which warehouse has the most, how many will stock out before resupply, how many are covered by inbound) with a "View worklist" button that opens the worklist (PRD US-021 AC-05). It is derived from the live worklist, so it matches the To order count. Email is not built in the prototype, so it is in-app only.',
    date: '2026-10-07',
    files: ['replenishmentReminder.ts', 'NotificationsView.vue', 'NotificationDetailPane.vue', 'SettingsReplenishmentPage.vue', 'replenishmentConfig.ts'],
  },
  {
    id: 'replenishment-bulk-pr-background',
    title: 'Replenishment: large Request to purchase runs in the background',
    description:
      'Selecting 10 or more worklist lines and confirming Request to purchase no longer blocks on one step (PRD US-018 AC-03 / EH-01). The requests are created vendor group by vendor group while a modal shows progress ("12 of 25 lines"); you can close it and a toast reports the end. When done it says how many were created and lists any that failed with a Retry failed button; View purchase requests opens the list. The 10-line threshold is demo scale — production figure TBD (the PRD example is 1,000).',
    date: '2026-10-07',
    files: ['BulkPrProgressModal.vue', 'ReplenishmentPage.vue', 'replenishmentPurchaseRequest.ts'],
  },
  {
    id: 'product-category-change-warning',
    title: 'Edit product: warning when a category change moves replenishment defaults',
    description:
      'Replenishment takes lead time, safety days, order coverage and the ignore-gaps cap from the product\'s category (PRD §2.5). When you change the category of an existing product, a warning under the field shows exactly which of those defaults would change (before → after) and that a value set on the product or a warehouse keeps applying. Nothing shows for a new product or when nothing differs.',
    date: '2026-10-07',
    files: ['NewProductPage.vue', 'replenishmentConfig.ts'],
  },
  {
    id: 'pr-create-po-permission',
    title: 'Purchase requests: only purchasing can create a purchase order',
    description:
      'Converting a purchase request into a purchase order is a purchasing-role privilege (PRD US-020 AC-03). "Create purchase order" — in the row menu, the bulk Actions menu and the request detail menu — is shown only to users with purchase-order creation access and hidden for everyone else; the handlers refuse as a second line. The account menu has a new "Purchasing access" checkbox (on by default, back-office accounts only) to preview a stockist who can raise requests but not convert them; warehouse operators never have it.',
    date: '2026-10-07',
    files: ['usePurchasingAccess.ts', 'PurchaseRequestsPage.vue', 'PurchaseRequestDetailsPage.vue', 'ErpUserMenu.vue'],
  },
  {
    id: 'replenishment-covered-stockout-wins',
    title: 'Replenishment: a covered row that still stocks out asks to verify the arrival',
    description:
      'A product whose open PO fills it to target stays in the covered state and out of the To order count (PRD §2.7), even when it will still stock out before the PO arrives. In that case the Signals badge reads "Verify inbound arrival" instead of "Covered by inbound", and it still counts on the "Stocks out before resupply" card.',
    date: '2026-10-07',
    files: ['replenishment.ts', 'ReplenishmentPage.vue'],
  },
  {
    id: 'sku-settings-lead-time-not-set',
    title: 'Product replenishment settings: lead time is not typed',
    description:
      'The lead-time input is gone (PRD US-001 AC-09: lead time is measured from receipts, then the category default, then Other categories). When nothing can be resolved the drawer shows "Lead time: Not set" and how to fix it — add a preferred vendor, make a purchase, or set a default in Replenishment settings.',
    date: '2026-10-07',
    files: ['SkuReplenishmentSettingsDrawer.vue', 'replenishment.ts', 'replenishmentSettings.ts', 'leadTimeHistory.ts'],
  },
  {
    id: 'product-warehouses-inactive-preferred',
    title: 'Inactive preferred vendor is detected per warehouse',
    description:
      'When the vendor a warehouse itself prefers is deactivated, only that warehouse is flagged ("Preferred vendor is inactive") and its lead time falls back to the next listed vendor; a warehouse with a healthy pick of its own is not flagged by someone else\'s. Choosing another vendor on Stock by warehouses clears it.',
    date: '2026-10-07',
    files: ['vendorItems.ts', 'replenishment.ts', 'ProductDetailsPage.vue'],
  },
  {
    id: 'replenishment-outlier-cap',
    title: 'Replenishment settings: Outlier cap (default 1.5×)',
    description:
      'Daily sales above this multiple of the typical day (the median) are capped before averaging, so one promo or bulk order cannot set the reorder point. The default is now 1.5× (PRD §2.2, it was 4×) and it is editable under Demand in Replenishment settings; every input in the Demand section is the same width (wide enough for the "× median" suffix). In Lead time, Other categories now has a switch ("Use a default lead time") with the days input below it: on = an estimate for products with no measured lead time, off = Not set (they wait in Needs setup).',
    date: '2026-10-07',
    files: ['replenishmentConfig.ts', 'SettingsReplenishmentPage.vue'],
  },
  {
    id: 'product-warehouses-bulk-row',
    title: 'Stock by warehouses: bulk set sits above its columns',
    description:
      'In Edit vendor mode the bulk-set controls are a row above the table headers: Reorder point (with its unit), Safety days (with "days") and Preferred vendor each sit above their own column, so the headers label them. The Apply button is a split button beside the vendor select — Apply acts at once, and its chevron holds "Use defaults". Columns now run Reorder point, Unit, Safety days, Preferred vendor; while editing, the Unit column is hidden and the unit/days show as suffixes inside the inputs. With nothing ticked the row shows the hint instead.',
    date: '2026-10-07',
    files: ['ProductDetailsPage.vue'],
  },
  {
    id: 'replenishment-view-only',
    title: 'Replenishment: a view-only state for users who cannot change settings',
    description:
      'Changing replenishment settings (reorder point, safety days, tracking, preferred vendor, bulk import) is an admin privilege. Without it the worklist has no badge; the actions that change things are simply hidden rather than disabled: Turn off / on tracking (row and bulk), Edit vendor on the product page, and Import. "Replenishment settings" becomes "View replenishment settings" and opens the drawer as plain values with no Save. The settings page keeps its existing View only badge. The account menu has a new "Replenishment access" checkbox (ERP back-office, on by default) to preview it; the Import page shows a no-access message if reached directly.',
    date: '2026-10-08',
    files: ['useReplenishmentAccess.ts', 'ReplenishmentPage.vue', 'ReplenishmentSetupPage.vue', 'SkuReplenishmentSettingsDrawer.vue', 'ProductDetailsPage.vue', 'ImportReplenishmentSettingsPage.vue', 'ErpUserMenu.vue', 'SettingsReplenishmentPage.vue'],
  },
  {
    id: 'product-vendors-expand',
    title: 'Vendors tab: the chevron sits in the Vendor column and opens the warehouses in place',
    description:
      'Like the Stock by warehouses table, each vendor row has a right-aligned chevron in the Vendor column (and the whole row is clickable; one vendor open at a time). Opening it adds one line per warehouse that prefers the vendor: the warehouse name sits under Preferred and its lead time under Lead time (with the estimate basis). The "N warehouses" count is plain text now — the link and its drawer are gone.',
    date: '2026-10-08',
    files: ['ProductDetailsPage.vue'],
  },
  {
    id: 'product-warehouses-tidy',
    title: 'Stock by warehouses: tidier table',
    description:
      'The button is now "Edit vendor", left-aligned above the table. The stray "No stock" empty state under a populated table is gone. The reorder point no longer carries a "Calculated / No sales yet" label — a chevron left of the warehouse opens the working instead (a hand-set value still shows its calculated figure beneath). The opened row shows the formula as cards (avg daily sales × (lead time + safety days) = reorder point, each with where it comes from) and a bar of stock position vs the reorder point, all from the same engine row the table reads. The Vendors tab loses its "View vendors" button, which repeated the table.',
    date: '2026-10-07',
    files: ['ProductDetailsPage.vue'],
  },
  {
    id: 'product-preferred-varies-by-warehouse',
    title: 'Product page: preferred vendor reads honestly per warehouse',
    description:
      'Purchase info shows a single Preferred vendor only when every stocked warehouse uses it; otherwise it says "Varies by warehouse". The Product info and Purchase info panels carry no shortcut links to the Stock by warehouses tab. On that tab the vendor picker is now a proper form-table select cell (borderless, the cell draws the focus ring, long vendor names wrap, lead time sits inside the cell), and an estimated lead time says its basis ("Estimated (category default)"). On the Vendors tab the Preferred column is plain text ("5 warehouses", "All 9 warehouses") with no check or info icon; the warehouses behind it open in the row (see the Vendors tab entry). The header tooltip is tighter.',
    date: '2026-10-07',
    files: ['ProductDetailsPage.vue'],
  },
  {
    id: 'replenishment-signals-grey',
    title: 'Replenishment: every Signals badge is grey',
    description:
      'Provisional, Volatile demand, Estimated lead time, Waiting for real lead time and Covered by inbound all use the grey (announcement) badge. Signals are context about how reliable a number is, not a status to act on, so they no longer compete with the blue / amber status badges.',
    date: '2026-10-07',
    files: ['ReplenishmentPage.vue'],
  },
  {
    id: 'replenishment-signals-quick-filter',
    title: 'Replenishment: Signals filter, fuller All filters drawer, days-of-cover comparator',
    description:
      'Signals is now a quick filter beside Movement (one signal at a time, incl. Covered by inbound). All filters now also holds Warehouse, Movement and Signals — the same three controls as the bar, editing the same values, so either place works (warehouse stays single-choice; the pill counts Movement/Signals but not the always-set warehouse). The Vendor and Category checklists sit in a bordered panel that shows 10 rows and scrolls beyond that (a company can have any number), and Days of cover uses the library comparator field (Is greater than / between / less than) instead of two loose From / To inputs.',
    date: '2026-10-07',
    files: ['ReplenishmentPage.vue', 'ReplenishmentFiltersDrawer.vue'],
  },
  {
    id: 'replenishment-covered-by-inbound',
    title: 'Replenishment: "Covered by inbound" card and rows',
    description:
      'An approved PO now posts In-Transit owned by the PO; receiving it hands ownership to WMS Inbound so incoming is counted once (US-028/029). A product that is below its reorder point but already fully covered by that inbound stays on the To order table with a suggested qty of 0 and a "Covered by inbound" signal (US-004 AC-03) — it is counted on its own card instead of To order, has no Request to purchase, and can be isolated with the Signals quick filter. The In transit column and the calculation drawer break the quantity down by owner (on order vs in WMS inbound). A row that still stocks out before resupply keeps the stockout (stockout wins).',
    date: '2026-10-07',
    files: ['replenishment.ts', 'ReplenishmentPage.vue', 'ReplenishmentFiltersDrawer.vue', 'SuggestionBreakdownDrawer.vue'],
  },
  {
    id: 'replenishment-covered-by',
    title: 'Replenishment: "Covered by" line no longer overflows',
    description:
      'A long list of covering documents used to spill out of the Suggested qty cell and overlap the next column. It now reads "Covered by N orders", stays inside the column, and shows the full list on hover.',
    date: '2026-10-02',
    files: ['ReplenishmentPage.vue'],
  },
  {
    id: 'configure-warehouse-replenishment',
    title: 'Configure warehouse: dead in-transit toggle removed',
    description:
      'The "Count in-transit transfers as incoming supply" toggle is gone: nothing read it since in-transit follows the PRD sources (open purchase orders and receipts). A blank Safety days now reads "Category default", which is the value it actually falls back to (rule/settings-no-unbuilt-controls).',
    date: '2026-10-02',
    files: ['ConfigureWarehousePage.vue', 'warehouseConfig.ts'],
  },
  {
    id: 'new-product-replenishment-field',
    title: 'Product form: "Due for reorder" field',
    description:
      'The replenishment rollup on the product form is renamed "Due for reorder", says "reorder point" instead of "min. stock", reads as whole translated sentences, and uses standard text links and valid colour tokens.',
    date: '2026-10-02',
    files: ['NewProductPage.vue'],
  },
  {
    id: 'products-view-replenishment',
    title: 'Products: "Reorder plan" is now "View replenishment"',
    description:
      'The link from the low-stock card and the row menu to the worklist uses the same name as the page it opens.',
    date: '2026-10-02',
    files: ['ProductsPage.vue'],
  },
  {
    id: 'replenishment-empty-states',
    title: 'Replenishment: empty states have a way forward',
    description:
      'Every empty state on the worklist now carries a standard secondary button: "Replenishment not set up" opens Configure warehouse (or the warehouse list when there are several), "No products to order" opens Replenishment settings, and Needs setup links back to the products to order. The shared table also keeps its no-results message inside the visible width on wide tables, and its title is grammatical ("No products match your filters").',
    date: '2026-10-02',
    files: ['ReplenishmentPage.vue', 'ReplenishmentSetupPage.vue', 'ErpTablePage.vue'],
  },
  {
    id: 'replenishment-filter-reset-toast',
    title: 'Replenishment: "saved filter was reset" is now a toast',
    description:
      'When the remembered warehouse filter is no longer available, the page says so once in an info toast instead of a banner, then stores the corrected filter so it is not repeated. The copy stays under the 60-character toast cap.',
    date: '2026-10-02',
    files: ['ReplenishmentPage.vue', 'useReplenishmentWarehouse.ts'],
  },
  {
    id: 'replenishment-stale-banner',
    title: 'Replenishment: stale-data warning moved above the stats',
    description:
      'The "last recalculated" warning now sits above the summary figures it qualifies, uses the Pixel warning banner with an icon and no title, and reads as one translated sentence that names the Recalculate button.',
    date: '2026-10-02',
    files: ['ReplenishmentPage.vue'],
  },
  {
    id: 'vendor-terms-mpbutton',
    title: 'Vendor ordering terms: standard Pixel buttons',
    description:
      'The Products tab on a vendor, its Add product and Edit ordering terms modals, and the Import ordering terms page now use MpButton in an MpButtonGroup footer instead of legacy btn-enterprise buttons (rule/btn-mpbutton-standard, rule/btn-responsive-footer). "Last reviewed N months ago" is one translated sentence.',
    date: '2026-10-02',
    files: ['VendorProductsTab.vue', 'EditVendorTermsModal.vue', 'AddVendorProductModal.vue', 'ImportVendorTermsPage.vue'],
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
      'Clicking a module in Settings now opens a read-only view first — Setup as ContentList, Properties table without add/edit, Pipeline without sidebar or drag, Layout without drag-and-drop. Header shows an Actions dropdown: Draft modules get Edit/Publish/Delete; Published modules get Edit/Deactivate/Delete (Delete on a published module shows an info toast requiring deactivation first). Tab order: Setup → Properties → Layout → Pipeline. Deals module cannot be deleted or deactivated.',
    date: '2026-09-20',
    files: ['CrmModuleBuilderPage.vue', 'CrmDetailLayoutBuilder.vue'],
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
]

const byId = new Map(DEV_CHANGES.map(c => [c.id, c]))
export function getDevChange(id: string): DevChange | undefined {
  return byId.get(id)
}

/** GitHub repo base for turning a "#82" PR ref into a link. */
export const DEV_CHANGES_REPO = 'https://github.com/harnods/pixel-erp'
