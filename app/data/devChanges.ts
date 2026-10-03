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
    id: 'bom-version-no',
    title: "Bill of materials: opened version beside BOM no.",
    description:
      "BOM info shows the version being viewed next to the code, e.g. “Bill of Materials #10011 · v2”. The Versions table no longer shows a “Viewing” label or the deactivated date.",
    date: '2026-10-03',
    files: ['BillOfMaterialsDetailsPage.vue'],
  },
  {
    id: 'bom-version-wo-list',
    title: "Versions section: every work order on the version, incl. sub WOs",
    description:
      "The Work orders column lists every work order using the version — its own WOs, plus parent-BOM work orders that pinned it as a sub-assembly, marked with a gray “· Sub WO” suffix (hover names the parent BOM). Shows the first 3; “Show more (n)” expands the row. Each opens the work order.",
    date: '2026-10-03',
    files: ['BillOfMaterialsDetailsPage.vue', 'workOrders.ts'],
  },
  {
    id: 'bom-version-link',
    title: "Bill of materials: open a version from the Versions section",
    description:
      "Each version number in the Versions section opens the detail page of that version (Active, or a read-only Superseded one with its banner). The opened version shows beside the BOM no. in BOM info, e.g. “Bill of Materials #10011 · v2”. Replaces the version badge in the title and the version switcher in BOM info.",
    date: '2026-10-01',
    files: ['BillOfMaterialsDetailsPage.vue'],
  },
  {
    id: 'bom-version-impact',
    title: "Edit BOM: upgrade-reason modal on Save",
    description:
      "On Save the system checks the version: if a work order already uses it (or it’s a superseded version), a modal explains why, asks for the upgrade reason (10–500 characters) and shows the impact; confirming saves it as v(n+1) — same BOM, same code; work orders already created keep their version. Otherwise the BOM is saved in place.",
    date: '2026-10-03',
    files: ['CreateBillOfMaterialsPage.vue', 'BomNewVersionModal.vue', 'billOfMaterials.ts'],
  },
  {
    id: 'bom-version-create',
    title: "Bill of materials: Actions always shows Edit",
    description:
      "There is no separate “Create new version” option. Edit opens the form; whether the save edits in place or creates a new version is decided on Save.",
    date: '2026-10-03',
    files: ['BillOfMaterialsDetailsPage.vue'],
  },
  {
    id: 'bom-version-superseded',
    title: "Bill of materials: deactivated (superseded) version",
    description:
      "Banner “You are viewing v1 (superseded). Active version: v2.” + “Deactivated on [date time] · [n] Work Orders are created for this version.” and Go to active. A deactivated version can only be printed or duplicated into a new bill of materials (Actions: Duplicate, Print).",
    date: '2026-10-03',
    files: ['BillOfMaterialsDetailsPage.vue', 'CreateBillOfMaterialsPage.vue'],
  },
  {
    id: 'bom-version-changelog',
    title: "Bill of materials: Changelog tab",
    description:
      "Append-only version events — time (WIB), action (created, edited, new version saved, sub-BOM new version acknowledged), version, actor and reason.",
    date: '2026-10-01',
    files: ['BillOfMaterialsDetailsPage.vue', 'billOfMaterials.ts'],
  },
  {
    id: 'bom-version-history',
    title: "Bill of materials: Versions section",
    description:
      "Every version with its status (Active / Superseded), who created it and when, the reason, and the work orders built from it (plus references as a pinned sub-BOM).",
    date: '2026-10-01',
    files: ['BillOfMaterialsDetailsPage.vue', 'billOfMaterials.ts'],
  },
  {
    id: 'bom-parent-review',
    title: "Multi-level: clickable sub-BOM version badge on the line",
    description:
      "When a sub-assembly’s BOM got a new version, its raw-material line shows “Bill of Materials #10009 · v2”. Clicking it opens that sub-BOM’s detail. Replaces the banner on the parent BOM.",
    date: '2026-10-03',
    files: ['BillOfMaterialsDetailsPage.vue'],
  },
  {
    id: 'bom-structure',
    title: "Multi-level: BOM structure tree",
    description:
      "Tree table — Product (with BOM number + version for sub-BOMs, caret to collapse, tree lines) · Available qty · Qty needed · Stock availability · Create work order. From a work order it shows the pinned version per level and a neutral “vN available”.",
    date: '2026-10-01',
    files: ['BomStructureTree.vue', 'BomStructureDrawer.vue', 'billOfMaterials.ts'],
  },
  {
    id: 'bom-index-version',
    title: "Bill of materials list: Active version column",
    description:
      "Column “Active version” shows just the Active version (e.g. v2).",
    date: '2026-10-03',
    files: ['BillOfMaterialsIndexPage.vue'],
  },
  {
    id: 'bom-index-version-filter',
    title: "Bill of materials list: Version status filter",
    description:
      "Filter to BOMs with older versions, or whose sub-BOM has a new version.",
    date: '2026-10-01',
    files: ['BillOfMaterialsIndexPage.vue'],
  },
  {
    id: 'bom-wo-version-pin',
    title: "Work order: BOM version beside the BOM name",
    description:
      "BOM name shows the version this work order was created from, e.g. “Espresso Machine Dual Boiler 2-Group · v1” — the pin never moves. Replaces the separate BOM version row.",
    date: '2026-10-01',
    files: ['WorkOrderDetailsPage.vue', 'workOrders.ts'],
  },
  {
    id: 'bom-wo-newer-version',
    title: "Work order: neutral “vN available” badge",
    description:
      "Info-colored, never a warning: opens the cumulative diff with Δ cost/unit. Hidden on completed, canceled and pre-versioning work orders.",
    date: '2026-10-01',
    files: ['WorkOrderDetailsPage.vue', 'WorkOrderBomVersionDrawer.vue'],
  },
  {
    id: 'wo-drift-diff',
    title: "Work order: what changed (cumulative)",
    description:
      "Composition diff between the pinned version and the Active one, with the estimated cost delta per unit.",
    date: '2026-10-01',
    files: ['WorkOrderBomVersionDrawer.vue', 'BomVersionDiff.vue'],
  },
  {
    id: 'bom-wo-pre-versioning',
    title: "Work order: pre-versioning tag",
    description:
      "Work orders created before versioning have no reliable pin — they show a gray “pre-versioning” tag and never a drift badge.",
    date: '2026-10-01',
    files: ['WorkOrderDetailsPage.vue', 'workOrders.ts'],
  },
  {
    id: 'bom-wo-index-version',
    title: "Work orders list: BOM version per row",
    description:
      "The BOM name cell shows the version each work order uses (v1, v2…), without the “available” hint.",
    date: '2026-10-01',
    files: ['WorkOrdersIndexPage.vue'],
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
    id: 'pm-production-tab',
    title: 'Production tab — plan, active BOM version and engineering changes in one place',
    description:
      'Production & materials and Engineering change are now one Production tab with three read-only lists: the production plan (finished-good target vs actual, expandable to component level showing qty reserved, consumed and requested), the active BOM version per work package, and the engineering changes. ECO numbers now open a real detail page at /projects/:id/engineering-changes/:ecoId with the composition diff. The tab reports rather than acts — running MRP, reserving, releasing and raising an ECO stay on the surfaces that own those actions.',
    date: '2026-09-29',
    files: ['ProductionTab.vue', 'ProjectEcoDetailPage.vue', 'ProjectsRouter.vue', 'ProjectDetailPage.vue'],
  },
  {
    id: 'pm-v62-phase1',
    title: 'Project MTO v6.2 — project dimension, contract value from SOs, Overview tab',
    description:
      'Phase 1 of the v6.2 pass. Creating a project now creates a dimension value equal to its code (A-2), so pegging rides the existing Dimension engine instead of a bespoke control field. Contract value is derived as the sum of the sales orders carrying the project (§11) rather than a typed number. Renames Changes to Engineering change, since v6.2 drops the variation-order object. Seeds PRJ-A "Meja custom Pak Budi" with the figures the demo depends on — budget Rp30.000.000, Rp4.200.000 posted, Rp12.000.000 set aside, Available Rp13.800.000. Removes the "master has changed" divergence badge: v6.2 closes OQ 28 and keeps the origin record backstage for the next-wave fan-out PRD.',
    date: '2026-09-29',
    files: ['projects.ts', 'dimensions.ts', 'projectBudgets.ts', 'projectTransactions.ts', 'projectBoms.ts', 'ProjectDetailPage.vue'],
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
    id: 'eco-index',
    title: 'Engineering changes: new index page',
    description:
      'Projects › Engineering changes lists every ECO across projects — Open first — with status, project BOM, v-from → v-to, reason code and how many existing work orders are open to decide. There is no create button: an ECO is raised only when Production publishes a new version of a locked project BOM (PRD v6.2 §7).',
    date: '2026-09-29',
    files: ['EngineeringChangesPage.vue', 'ProjectsRouter.vue', 'ErpSidebar.vue', 'erpSitemap.ts'],
  },
  {
    id: 'eco-detail',
    title: 'Engineering changes: ECO decision page under the project',
    description:
      '/projects/:id/engineering-changes/:ecoId is now the PM’s decision page (it replaces the read-only placeholder): change identity (reason code, who published, SO addendum), cost impact beside the work-package budget, the composition diff, existing work orders with their computed route, material disposition and the Open → Decided → Implemented → Closed lifecycle with actor + date. Breadcrumb returns to the project’s Production tab.',
    date: '2026-09-29',
    files: ['ProjectEcoDetailPage.vue', 'projectActions.ts', 'projectChanges.ts'],
  },
  {
    id: 'eco-decision',
    title: 'Engineering changes: one primary action per status',
    description:
      'Save decision (Open) → Mark implemented (Decided) → Close engineering change (Implemented). Never disabled — a refusal (wrong role, missing addendum, undecided dispositions) shows inline. Above the escalation threshold the decision is held for Finance in Approvals.',
    date: '2026-09-29',
    files: ['EngineeringChangeDetailPage.vue', 'projectActions.ts', 'ProjectApprovalsPage.vue'],
  },
  {
    id: 'eco-adoption',
    title: 'Engineering changes: PM adoption decision with computed routes',
    description:
      'The PM chooses None / Selected work orders / All open work orders. Each existing work order shows the route the system computes from its status — repin, cancel & recreate, adjust in place, split & cutover, or untouched when completed — plus the units that take the new version and their cost delta. Future units are shown separately.',
    date: '2026-09-29',
    files: ['EngineeringChangeDetailPage.vue', 'projectActions.ts'],
  },
  {
    id: 'eco-addendum-gate',
    title: 'Engineering changes: SO addendum gate for customer requests',
    description:
      'v6.2 has no VO object — a customer change is an SO addendum + ECO. A customer-request ECO can’t be adopted by existing work orders until it links a project SO addendum (which also raises the derived contract value); otherwise the PM overrides with a reason, flagging added scope not yet under contract. PRJ-A seeds SO-0231-A1 for ECO-PRJ-A-01.',
    date: '2026-09-29',
    files: ['ProjectEcoDetailPage.vue', 'BomEditDrawer.vue', 'projectActions.ts', 'projects.ts'],
  },
  {
    id: 'eco-disposition',
    title: 'Engineering changes: mandatory material disposition',
    description:
      'When every open work order adopts, removed components’ reserved stock returns to project stock and each affected line needs Use as is / Rework / Scrap before the ECO can be implemented. Scrap posts an actual cost to the project’s Cost of production.',
    date: '2026-09-29',
    files: ['EngineeringChangeDetailPage.vue', 'projectActions.ts'],
  },
  {
    id: 'eco-publish-version',
    title: 'Project BOM: Edit BOM publishes a new version when locked',
    description:
      'Production edits the project BOM. While no work order references the Active version it saves in place (no ECO). Once locked, saving publishes vN+1 — Active at once, reason code required — and raises one ECO for the PM. A further edit is refused while that ECO is open, naming it.',
    date: '2026-09-29',
    files: ['BomEditDrawer.vue', 'BomDetailOverlay.vue', 'projectActions.ts', 'useProjectRole.ts'],
  },
  {
    id: 'eco-bom-version-switcher',
    title: 'Project BOM: version switcher and read-only superseded versions',
    description:
      'The BOM drawer switches between versions, each labelled Active / Superseded with its work-order count and lock state. A superseded version is read-only and names the Active one. Version history shows who published, the reason code and the ECO it raised. Revert was removed — every change goes through a published version.',
    date: '2026-09-29',
    files: ['BomDetailOverlay.vue', 'projectBoms.ts'],
  },
  {
    id: 'eco-newer-version-hint',
    title: 'Work orders: neutral “vN available” indicator',
    description:
      'Wherever a work order is pinned to a version that is no longer Active, a neutral indicator shows “vN available”. Its only action is opening the diff; it never blocks and never moves a pin. Hidden on completed and cancelled work orders.',
    date: '2026-09-29',
    files: ['NewerVersionHint.vue', 'BomVersionDiffDrawer.vue'],
  },
  {
    id: 'eco-wo-version-pin',
    title: 'Production tab: work orders with their pinned BOM version',
    description:
      'A read-only Work orders list joins the Production tab (PRD v6.2 Story 9): each row shows the BOM version it is pinned to with the neutral “vN available” indicator, units already completed, “Replaces / Continued in” links written by cancel & recreate and split & cutover, and adjustments documented by an ECO. No actions — the tab reports.',
    date: '2026-09-29',
    files: ['ProductionTab.vue', 'projectTransactions.ts'],
  },
  {
    id: 'eco-production-tab-list',
    title: 'Production tab: engineering changes on the v6.2 model',
    description:
      'The Production tab’s engineering-change list now reads the v6.2 ECO: who published the version and when, the reason code, v-from → v-to and the lifecycle status. Each number opens the ECO page under the project. The tab stays information-only — the PM decides on the ECO page.',
    date: '2026-09-29',
    files: ['ProductionTab.vue'],
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
]

const byId = new Map(DEV_CHANGES.map(c => [c.id, c]))
export function getDevChange(id: string): DevChange | undefined {
  return byId.get(id)
}

/** GitHub repo base for turning a "#82" PR ref into a link. */
export const DEV_CHANGES_REPO = 'https://github.com/harnods/pixel-erp'
