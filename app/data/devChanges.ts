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
      'Approver queue (PRD "Require approval" tab, named Awaiting approval like other modules) with Approval log, Comments, Approve and Reject (reason required), plus bulk Approve / Reject. Switch "View as" in the scenario FAB to check level 1, level 2 and requester views.',
    date: '2026-10-02',
    files: ['WorkOrdersAwaitingApprovalPage.vue', 'woApproval.ts', 'ApprovalLogModal.vue'],
  },
  {
    id: 'wo-approval-list-indicator',
    title: 'Work order list: approval status filter',
    description:
      'New Approval status filter (Waiting for approval / Rejected). The status column shows Draft or Waiting approval while a request is pending (no separate clock icon).',
    date: '2026-10-02',
    files: ['WorkOrdersIndexPage.vue'],
  },
  {
    id: 'wo-approval-detail',
    title: 'Work order detail: approval notices and guards',
    description:
      'For an approver at the current level, the primary action (e.g. Start work order) becomes an Approve split button with Reject in its dropdown; pending and rejected notices (the pending notice opens the Approval log), "waiting for approval" captions on consumed / produced qty, and inline refusals when a pending request blocks an action (buttons stay enabled). Only ONE notice shows at a time — the latest: an inline refusal right after a click, otherwise the newest of the pending request (with its adjust / cancel reason), the undismissed rejection and the Adjust / Cancel-close reason.',
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
      'A rejected request shows a danger notice with the reject reason that stays until the user dismisses it (×, remembered) or acts on it with Submit again / Create again.',
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
      'Like the transaction detail pages (rule/detail-approval-header), the work order header has an Approval log icon button left of Actions. It opens the Approval log modal with every request on the work order (pending first, then the latest decided): requester, levels, approved / rejected with reason / skipped / canceled. Replaces the Approval log tab.',
    date: '2026-10-09',
    files: ['WorkOrderDetailsPage.vue', 'ApprovalLogModal.vue'],
  },
  {
    id: 'wo-approval-rules',
    title: 'Approval workflows: Work order transaction type',
    description:
      'Choosing transaction type "Work order" shows a second dropdown under it to pick the work order transaction the workflow gates (Start work order, adjustment, partial completion, completion, cancel/close). A type can have only one ACTIVE workflow — types another active workflow already has are not offered, and turning on a workflow whose type is already covered asks to turn the other one off. Approvers are limited to users with Work order access, up to 4 levels, and the list shows "Applies to: …".',
    date: '2026-10-08',
    files: ['CreateApprovalWorkflowPage.vue', 'ApprovalWorkflowsPage.vue', 'approvalWorkflows.ts'],
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
