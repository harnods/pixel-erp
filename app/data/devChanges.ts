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
    id: 'subcon-order-report-status',
    title: "Subcon order report: subcon status",
    description:
      "Status now reads the promised date and raw material fulfilment at the vendor: Waiting materials, Ready at vendor, Overdue (past the promised date, not completed) and Completed. The Excel Status column matches. The work order keeps its own status elsewhere.",
    date: '2026-10-20',
    files: ['SubconOrderReportPage.vue', 'subconExport.ts'],
  },
  {
    id: 'subcon-order-report-late',
    title: "Subcon order report: overdue day count",
    description:
      "An open order past its promised return date shows how many days late it is beside the date (e.g. +3d).",
    date: '2026-10-20',
    files: ['SubconOrderReportPage.vue'],
  },
  {
    id: 'subcon-order-report',
    title: "Reports › Production: Subcon order report",
    description:
      "New Production reports index with a Subcon order report, recreating the first Subcon orders page on subcon work orders: product over its BOM, method chip, received muted until something comes back, Method + Status filters, column settings and a row kebab.",
    date: '2026-10-19',
    files: ['ProductionReportsIndexPage.vue', 'SubconOrderReportPage.vue', 'subconExport.ts'],
  },
  {
    id: 'subcon-order-report-export',
    title: "Subcon order report: Excel download",
    description:
      "The export dialog (scope + columns) writes a real .xlsx of the rows on screen after filters and search, or only the current page.",
    date: '2026-10-19',
    files: ['SubconOrderReportPage.vue', 'subconExport.ts'],
  },
  {
    id: 'production-settings-subcon-toggle',
    title: "Production settings: Allow subcontracting",
    description:
      "New Subcontracting section with one toggle. When off, the Subcontracting category disappears from the BOM and work order forms and subcon BOMs cannot start a new work order. Existing subcon BOMs and work orders stay viewable and keep working.",
    date: '2026-10-16',
    files: ['SettingsProductionPage.vue', 'productionSettings.ts', 'CreateBillOfMaterialsPage.vue', 'CreateWorkOrderPage.vue', 'CreateWorkOrderModal.vue'],
  },
  {
    id: 'subcon-setting-off-entry',
    title: "Create work order blocked on a subcon BOM while subcontracting is off",
    description:
      "On the BOM detail page and the BOM list kebab, Create work order is disabled for a subcon BOM with a tooltip pointing to Production settings.",
    date: '2026-10-16',
    files: ['BillOfMaterialsDetailsPage.vue', 'BillOfMaterialsIndexPage.vue'],
  },
  {
    id: 'production-settings-layout',
    title: "Production settings: three sections, value column",
    description:
      "Matches the Production settings design: General settings, Production readiness and Integration, each row a label + description with its value on the right. Four new settings (plan period, backdated entries, partial consumption, sales order to work order) are saved but not yet enforced anywhere.",
    date: '2026-10-16',
    files: ['SettingsProductionPage.vue', 'productionSettings.ts'],
  },
  {
    id: 'production-settings-hover-edit',
    title: "Production settings: Edit appears on hover",
    description:
      "The Edit button shows only while the pointer is over the settings area, or while keyboard focus is inside it.",
    date: '2026-10-16',
    files: ['SettingsProductionPage.vue'],
  },
  {
    id: 'subcon-view-transfer',
    title: "Subcon WO: View warehouse transfer",
    description:
      "When every component is already on a transfer awaiting approval, the work order points to that transfer instead of offering to raise another.",
    date: '2026-10-15',
    files: ['WorkOrderDetailsPage.vue', 'workOrders.ts'],
  },
  {
    id: 'subcon-sent-transferred',
    title: "Subcon WO: Sent to vendor counts moved stock only",
    description:
      "Sent to vendor shows only the qty already in the subcon warehouse — by approved warehouse transfer (resupply) or purchase delivery (dropship) — as a plain number, not sent/planned. A draft transfer has moved nothing, so it does not count.",
    date: '2026-10-15',
    files: ['WorkOrderDetailsPage.vue', 'workOrders.ts'],
  },
  {
    id: 'subcon-origin-transferred',
    title: "Origin breakdown: Transferred qty",
    description:
      "New column between Planned and Remaining: what has actually left each warehouse. Remaining is what still needs a transfer raised.",
    date: '2026-10-15',
    files: ['TransferOriginBreakdownDrawer.vue'],
  },
  {
    id: 'erp-drawer-width',
    title: "Drawers open at their set width",
    description:
      "Shared drawer shell fix: the width each drawer asks for (420px by default) was being dropped, so every drawer opened across the full screen. It now applies.",
    date: '2026-10-15',
    files: ['ErpDrawer.vue'],
  },
  {
    id: 'subcon-origin-drawer',
    title: "Components by origin warehouse is a drawer",
    description:
      "Opens as a drawer over the work order instead of a modal, closes with × only, and has no Cancel — each Create warehouse transfer button acts on its own.",
    date: '2026-10-15',
    files: ['TransferOriginBreakdownDrawer.vue'],
  },
  {
    id: 'subcon-fixed-lines',
    title: "Subcon WO: raw materials and subcon cost come from the BOM",
    description:
      "On a Subcontracting work order neither list can be added to or removed from. A later change is made on the adjust form.",
    date: '2026-10-15',
    files: ['CreateWorkOrderPage.vue'],
  },
  {
    id: 'subcon-plan-two-flows',
    title: "Subcon WO: documents in two flows",
    description:
      "Documents this work order will raise is shown as two lines — Raw materials and Subcon cost — instead of one chain.",
    date: '2026-10-15',
    files: ['SubconPlanPreview.vue', 'subcon.ts'],
  },
  {
    id: 'subcon-fixed-fields',
    title: "Subcon WO: no captions under fixed fields",
    description:
      "The captions under What is subcontracted and Quantity subcontracted are removed.",
    date: '2026-10-15',
    files: ['CreateWorkOrderPage.vue'],
  },
  {
    id: 'wo-prefill-from-bom',
    title: "Create WO from a BOM opens with its category",
    description:
      "A work order created from a Subcontracting BOM opens as Subcontracting, so its configuration and subcon cost appear prefilled.",
    date: '2026-10-15',
    files: ['CreateWorkOrderPage.vue'],
  },
  {
    id: 'bom-list-create-wo',
    title: "BOM list: Create work order",
    description:
      "Each row's actions now include Create work order, prefilled the same way as from the BOM detail.",
    date: '2026-10-15',
    files: ['BillOfMaterialsIndexPage.vue'],
  },
  {
    id: 'bom-category-locked',
    title: "Edit BOM: category is fixed",
    description:
      "The category cannot be changed once a BOM is saved — it decides the recipe's cost structure.",
    date: '2026-10-15',
    files: ['CreateBillOfMaterialsPage.vue'],
  },
  {
    id: 'subcon-cost-sku',
    title: "Subcon cost: SKU column",
    description:
      "The SKU moves out of the service product dropdown into its own column.",
    date: '2026-10-15',
    files: ['CreateBillOfMaterialsPage.vue', 'CreateWorkOrderPage.vue'],
  },
  {
    id: 'bom-adjust-checkbox',
    title: "Allow BOM adjustment uses Pixel's checkbox",
    description:
      "Rebuilt with MpCheckbox's own label and description slots, top-aligned.",
    date: '2026-10-15',
    files: ['CreateBillOfMaterialsPage.vue'],
  },
  {
    id: 'bom-subassembly-disabled',
    title: "Disabled secondary buttons look disabled",
    description:
      "A disabled secondary button now uses Pixel's disabled text and fill (it kept the black label before). Applies app-wide; seen here on a Subcontracting BOM.",
    date: '2026-10-15',
    files: ['erp.css', 'CreateBillOfMaterialsPage.vue'],
  },
  {
    id: 'subcon-direct-transfer',
    title: "Subcon: Create warehouse transfer raises it directly",
    description:
      "The transfer is created straight into the warehouse transfer list, without opening the form — capped at available stock, serials picked by the warehouse rule. Anything it could not carry is reported on the work order.",
    date: '2026-10-14',
    files: ['WorkOrderDetailsPage.vue'],
  },
  {
    id: 'subcon-wod-dropship-wh',
    title: "Subcon WO detail: Dropship shows the subcon warehouse",
    description:
      "On a Dropship order the Raw materials warehouse column shows the subcon warehouse and is headed Warehouse — nothing is drawn from a company warehouse.",
    date: '2026-10-14',
    files: ['WorkOrderDetailsPage.vue'],
  },
  {
    id: 'subcon-wo-type-assembly',
    title: "Subcon WO: Disassembly listed but disabled",
    description:
      "On a Subcontracting work order Disassembly stays in the Type list, greyed with a tooltip saying it is not available yet, and the type is set to Assembly. Choosing Disassembly leaves it on Assembly.",
    date: '2026-10-15',
    files: ['CreateWorkOrderPage.vue'],
  },
  {
    id: 'subcon-po-vendor',
    title: "Subcon: every subcon PO uses the WO's subcon vendor",
    description:
      "Any PO raised from a subcon work order — the vendor's work, and on Dropship the raw material too — opens with the work order's subcon vendor, fixed. Replaces the earlier rule that left the Dropship raw-material PO vendor for the buyer to choose.",
    date: '2026-10-14',
    files: ['PurchaseOrderFormPage.vue'],
  },
  {
    id: 'subcon-destination-row',
    title: "Subcon: destination row by method",
    description:
      "Basic orders no longer show \"Transfer components to\"; Dropship labels the row \"Deliver components to\".",
    date: '2026-10-14',
    files: ['WorkOrderDetailsPage.vue'],
  },
  {
    id: 'subcon-pr-linked',
    title: "Subcon PR: real linked transactions, no Edit",
    description:
      "A purchase request raised from a work order lists the work order and the orders raised from it, each clickable. Edit and Duplicate are hidden because its lines are fixed (R5).",
    date: '2026-10-14',
    files: ['PurchaseRequestDetailsPage.vue'],
  },
  {
    id: 'subcon-pr-price',
    title: "Subcon PR form: read-only prices",
    description:
      "The requester now sees the work order's unit price, line amount and total on a subcon purchase request.",
    date: '2026-10-14',
    files: ['NewPurchaseRequestPage.vue'],
  },
  {
    id: 'subcon-complete-at-vendor',
    title: "Complete modal: Qty at vendor",
    description:
      "Shows how much is still at the vendor \u2014 the real ceiling on unused qty. Column headers follow the qty naming convention.",
    date: '2026-10-14',
    files: ['CompleteSubconWorkOrderModal.vue'],
  },
  {
    id: 'subcon-transactions-order',
    title: "Subcon Transactions tab: run order, no stock adjustments",
    description:
      "Rows are listed in the order the run raised them, not grouped by thread. Stock adjustments are no longer listed — they are read from View journal entry & stock adjustment.",
    date: '2026-10-14',
    files: ['WorkOrderDetailsPage.vue'],
  },
  {
    id: 'subcon-journal-entries',
    title: "Subcon journal: entries by transaction",
    description:
      "Below the per-account totals, each posting is listed with its date, transaction and debit/credit lines.",
    date: '2026-10-14',
    files: ['SubconJournalModal.vue'],
  },
  {
    id: 'subcon-wo-origin-wh',
    title: "Create WO: origin warehouse only on Resupply",
    description:
      "Basic and Dropship move no company stock, so the Origin warehouse column, Bulk set warehouse and Manage batch are hidden. Product column widened to 280px.",
    date: '2026-10-14',
    files: ['CreateWorkOrderPage.vue'],
  },
  {
    id: 'wo-header-wrap',
    title: "Work order header: title no longer wraps",
    description:
      "With three actions showing, the actions drop below instead of squeezing the title onto two lines.",
    date: '2026-10-14',
    files: ['WorkOrderDetailsPage.vue'],
  },
  {
    id: 'transfer-qty-prefill',
    title: "Transfer form: prefilled qty shown",
    description:
      "A prefilled transfer qty on storage-location rows now shows in the Transfer qty column, matching After transfer qty.",
    date: '2026-10-14',
    files: ['WarehouseTransferFormPage.vue'],
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
