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
      'A tenant without active CRM access hits a full-bleed paywall on every /crm route (no level-1 CRM sidebar). Access is a shared status (useCrmAccess: active / none / expired, persisted, default active). Two faces: "none" is the educational first-run page (hero → value props with filled green/tosca/blue icons → how it works → feedback); "expired" is the trial-ended page (data-safe reassurance + Contact sales / Schedule a demo, no re-education, no pricing). Flip states from the scenario FAB (CRM access / Trial expired / No access) on the Deals page or the paywall; the router swaps instantly, no reload.',
    date: '2026-10-29',
    files: ['CrmPaywallPage.vue', 'useCrmAccess.ts', '[...slug].vue', 'CrmDealsPage.vue', 'default.vue'],
  },
]

const byId = new Map(DEV_CHANGES.map(c => [c.id, c]))
export function getDevChange(id: string): DevChange | undefined {
  return byId.get(id)
}

/** GitHub repo base for turning a "#82" PR ref into a link. */
export const DEV_CHANGES_REPO = 'https://github.com/harnods/pixel-erp'
