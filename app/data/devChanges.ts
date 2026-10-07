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
    id: 'product-vendors-preferred-drawer',
    title: 'Vendors tab: preferred warehouses open in a drawer',
    description:
      'The Preferred column no longer shows a check mark or an info icon. The count is a link; clicking it opens a drawer with the vendor, the product and the list of warehouses that prefer this vendor, each with its lead time (and the basis when it is an estimate). Each warehouse name is a link to that warehouse.',
    date: '2026-10-07',
    files: ['ProductDetailsPage.vue', 'PreferredWarehousesDrawer.vue'],
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
      'Purchase info shows a single Preferred vendor only when every stocked warehouse uses it; otherwise it says "Varies by warehouse". The Product info and Purchase info panels carry no shortcut links to the Stock by warehouses tab. On that tab the vendor picker is now a proper form-table select cell (borderless, the cell draws the focus ring, long vendor names wrap, lead time sits inside the cell), and an estimated lead time says its basis ("Estimated (category default)"). On the Vendors tab the Preferred column is just a link ("5 warehouses", "All 9 warehouses") — no check, no info icon — that opens a drawer listing the warehouses that prefer the vendor, each with its lead time. The header tooltip is tighter.',
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
    id: 'replenishment-velocity-unit',
    title: 'Replenishment: demand velocity shows its unit',
    description:
      'The "Demand velocity per day" column now shows the unit beside the figure (for example "1,84 Bag"). ',
    date: '2026-10-02',
    files: ['ReplenishmentPage.vue', 'VendorItemDrawer.vue'],
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
