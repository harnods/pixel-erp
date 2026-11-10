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
    id: 'contact-link-open',
    title: 'Detail pages: customer and vendor links work again',
    description:
      'Clicking the customer, vendor or beneficiary name on a transaction detail page (invoices, orders, quotes, deliveries, payments, bills, credit and debit memos) threw an error and opened nothing. It now opens the contact in a new tab. Every customer and vendor that transactions use now has a contact record, so the link no longer lands on Contact not found and those contacts appear in the Customers and Vendors lists.',
    date: '2026-11-10',
    files: ['useOpenContact.ts', 'contacts.ts', '18 *DetailsPage.vue / *DetailPage.vue'],
  },
  {
    id: 'memo-status-open-closed',
    title: 'Credit and debit memos: Open / Closed status',
    description:
      'Credit memos and debit memos now use the same two statuses as the Credit Memo report: Open while some balance is left to apply or refund, Closed once it is fully used. This replaces Active, Partially used and Used up on the memo detail pages and in the customer transactions list, so a memo shows the same status everywhere.',
    date: '2026-11-10',
    files: ['creditMemos.ts', 'debitMemos.ts', 'ErpStatusBadge.vue', 'CreditMemoDetailsPage.vue', 'DebitMemoDetailsPage.vue', 'translations.ts'],
  },
  {
    id: 'cm-report-no-views',
    title: 'Credit Memo report: saved views removed, full screen moved to the toolbar',
    description:
      'The Default view / Add view / All views tabs, the All views drawer and the saved-views store are gone from the Credit Memo report. The full-screen button now sits in the toolbar icon group after Column settings and before Export, the same place as on the Balance Sheet and Profit & Loss reports.',
    date: '2026-11-10',
    files: ['CreditMemoReportPage.vue', 'creditMemoReport.ts', 'translations.ts'],
  },
  {
    id: 'cm-report-patterns',
    title: 'Credit Memo report: aligned to the documented ERP patterns',
    description:
      'Audit pass against docs/design/RULES.md. All filters shows its active count as "All filters (N)" instead of a green pill. Applied filters and selected customers are closable gray tags, and the Vendor marker is a gray tag. The loading skeleton is 3 static rows under the real column headers, like every table. Column widths come from the shared column-width standard. The filtered-empty state uses the same illustration and copy as other tables. Dates use the shared date helpers, with no (GMT+7) suffix. Styles use only design tokens that resolve in this Pixel build, with no hardcoded px or colours, and the as-of date field has no placeholder. The two balance filters now use the shared amount field (Is greater than / Is between / Is less than). All filters (N) counts one per filter, including each Hide Rp 0 toggle. Export opens the shared Export modal, where you pick the detail-sheet columns, then downloads the same .xlsx. The Reports › Sales card now describes it as an as-of report covering customer credit memos and vendor debit memos.',
    date: '2026-11-10',
    files: ['CreditMemoReportPage.vue', 'CreditMemoFiltersDrawer.vue', 'creditMemoReport.ts', 'SalesReportsIndexPage.vue', 'translations.ts', 'erp.css', 'RULES.md'],
  },
  {
    id: 'cm-report-poc-v3',
    title: 'Credit Memo report: aligned to engineering prototype',
    description:
      'Reports › Sales › Credit Memo now follows the engineering prototype, PRD and RFC. It uses one As of date instead of a date range, and every memo issued on or before it is listed with its applications and refunds up to that date. There is no opening balance: each memo row shows its original amount, then the running balance. Debit memos appear under their vendor, with a Vendor label. All filters gains transaction type, customer, customer group (Include all / Either), customer and credit memo balance ranges, credit memo number, and Rp 0 toggles. Each active filter shows as a removable badge, and Reset filter keeps the date. Document numbers open in a new tab. Export now offers Excel only and downloads a real .xlsx with Customer summary and Credit memo detail sheets. The report keeps the Figma table, tree guides, views, skeleton and idle state.',
    date: '2026-11-04',
    files: ['CreditMemoReportPage.vue', 'creditMemoReport.ts', 'CreditMemoFiltersDrawer.vue', 'translations.ts'],
  },
  {
    id: 'vat-recon-empty-tab-chrome',
    title: 'VAT workspace: empty tabs show only the empty state',
    description:
      'When To match, Not reconciled or Matched has no rows at all for the period, the toolbar (Status filter, Export, Search, Reconcile again) and the "Showing … pairs" footer are hidden, so the tab shows just its empty state. A filter or search that empties the list keeps both, so it can be cleared. The To match blank slate uses the same inset as the table empty cell (spacing-6 / spacing-4), so its illustration lines up with Not reconciled and Matched.',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue'],
  },
  {
    id: 'vat-recon-index-no-sync',
    title: 'VAT reconciliation index: Sync with Klikpajak removed',
    description:
      'The title bar of the VAT reconciliation index no longer has the "Sync with Klikpajak" button (it only showed a demo toast). Setup stays as the single title-bar action.',
    date: '2026-11-09',
    files: ['[...slug].vue', 'translations.ts'],
  },
  {
    id: 'vat-recon-setup-rule-rows',
    title: 'VAT setup: matching rules read "Title: value"',
    description:
      'Each fixed rule under How matching works reads "Match key: Exact", "Corroboration: Exact", "Faktur date: Direction checked", "Faktur status: Approved only" on one line in the rule-title style (14px semibold), with its description below spanning the form width (the value no longer takes a right-hand column).',
    date: '2026-11-09',
    files: ['VatMatchingRulesPage.vue'],
  },
  {
    id: 'vat-recon-setup-footer',
    title: 'VAT setup: Save at the end of the form; notes as side cards',
    description:
      'Cancel and Save (Save changes once set up) moved from the page title bar to a right-aligned footer at the end of the form (erp-action-footer). "What this affects" and "Heads up" are bordered cards to the right of the form instead of banners above it, 40px (spacing-10) from the form. The first section has no divider above it, and the Include accounts field spans the form width.',
    date: '2026-11-09',
    files: ['VatMatchingRulesPage.vue', '[...slug].vue'],
  },
  {
    id: 'vat-recon-setup-copy',
    title: 'VAT setup: copy per UXW audit',
    description:
      'Gate: "Select the accounts that record PPN. Reconciliation includes every transaction posted to them, such as sales invoices, journal entries, and bank deposits." and the button "Set up accounts" (ID "Atur akun"). Setup page: "Select" instead of "Choose" (reserved for file upload), no em dashes, serial comma, "included" instead of "pulled", and account help texts without a trailing period (caption rule).',
    date: '2026-11-09',
    files: ['VatReconciliationPeriodsPage.vue', 'VatMatchingRulesPage.vue', 'translations.ts'],
  },
  {
    id: 'vat-recon-setup-patterns',
    title: 'VAT setup: documented patterns instead of one-off UI',
    description:
      'Setup gate on the VAT reconciliation index is the standard empty state (empty-folder illustration + title + caption + secondary button) instead of an icon circle and a primary button. The Setup page follows the settings-page layout: titled sections with a 14px description and dividers (no icon tiles or cards), the fixed matching rules as settings rows with the value as plain text (no pill), the "what this affects" and "heads up" notes as MpBanner (info / warning) instead of hand-coloured boxes, and the "Last saved" card replaced by the standard "Last updated by {name} on {date}" line. Unused slider / band / readout CSS and the 10px sizes are gone.',
    date: '2026-11-09',
    files: ['VatMatchingRulesPage.vue', 'VatReconciliationPeriodsPage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-remarks-context',
    title: 'Remarks modal: which row it is for',
    description:
      'The Remarks modal now shows the row\'s Transaction number, Transaction date and Customer (Vendor on VAT In) as a ContentList above the reason, instead of the bare number. A row with no transaction shows its tax document number and date. The modal uses the md size token (was sm) so the values have room.',
    date: '2026-11-09',
    files: ['VatReconciliationRemarkModal.vue', 'VatReconciliationWorkspacePage.vue'],
  },
  {
    id: 'vat-recon-matched-columns',
    title: 'VAT workspace tables: Transaction number column; Method as text',
    description:
      'Not reconciled: the "Transaction" column is now "Transaction number". Matched: the transaction number moved out from under the amount into its own Transaction number column after Transaction date (kind: number), and Method reads as plain text (Auto / Manual / Airene) instead of a tag.',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue'],
  },
  {
    id: 'vat-recon-drawer-actions-menu',
    title: 'Reconciliation drawer: extra secondary actions fold into "Actions"',
    description:
      'When the drawer footer would show two or more secondary buttons (e.g. View tax document + Correct transaction date), they fold into one secondary "Actions" dropdown (the shared DetailActionsMenu), so the footer reads Cancel · Actions · primary. One secondary still shows as a plain button.',
    date: '2026-11-09',
    files: ['VatReconciliationPairActions.vue', 'ReconciliationDetailDrawer.vue'],
  },
  {
    id: 'vat-recon-masa-in-meta',
    title: 'VAT workspace: masa pajak leads the meta line',
    description:
      'The masa pajak moved from beside the VAT Out title into the meta line under it, first: "Masa pajak: 02/2027 · Last sync: … · Accounts used: …".',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue', '[...slug].vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-suggestion-title',
    title: 'VAT workspace: Airene cards titled "Suggestion"',
    description:
      'Each Airene suggestion card in an expanded row (transaction or tax document side) now opens with a "Suggestion" title (ID "Saran"), so it reads as a proposal rather than the matched record.',
    date: '2026-11-09',
    files: ['VatReconciliationAireneSuggestions.vue', 'translations.ts'],
  },
  {
    id: 'vat-recon-expand-fixes',
    title: 'VAT workspace: banner and row fixes',
    description:
      'No reason banner while Airene is still searching the missing side. Awaiting DJP approval reads in the warning colour (badge and text). The draft checkbox for bulk Submit sits at the row start, left of the chevron, not beside "No match found". The banner has space below it so it no longer touches the columns\' divider.',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-uxw-finalize-rerun',
    title: 'VAT workspace: Finalize period and Reconcile again (UXW audit)',
    description:
      'Per the UXW audit: the title-bar button reads "Finalize period" (ID "Finalkan masa pajak"); the confirm modal reads "Finalize Masa pajak 01/2027?" with a "Finalize" button (ID verb "Finalkan", not the noun "Finalisasi"), and the toolbar button "Re-run" becomes "Reconcile again" (ID "Rekonsiliasi ulang"), matching the "Reconciling…" loading state. Body copy names it as "the Reconcile again button". Pending UXW sign-off.',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue', '[...slug].vue', 'VatMatchingRulesPage.vue', 'translations.ts'],
  },
  {
    id: 'vat-recon-expand-tertiary',
    title: 'VAT workspace: expanded-row actions are tertiary',
    description:
      'Inside an expanded row, the main actions (Create sales invoice, Create / Submit / Refresh status / View tax document) use the tertiary button, so Finalize stays the only primary on the page. The shared tax document actions take a main-variant prop; the detail drawer keeps primary.',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue', 'VatReconciliationTaxDocActions.vue'],
  },
  {
    id: 'vat-recon-reason-under-no-match',
    title: 'VAT workspace: why there is no match sits under "No match"',
    description:
      'When one side of an expanded row reads "No match" (Transaction not found, Tax document not found, Not approved), the reason is plain text under that "No match" title (state name in its colour, then the explanation) instead of a banner above both columns. Rows with both sides keep the banner.',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue'],
  },
  {
    id: 'vat-recon-row-state-beside-number',
    title: 'VAT workspace: row state beside the tax document number',
    description:
      'On the tax document side, the row state now reads as part of the caption line, same size and colour as the number: "27000000039848145 · Approved · Duplicate reference" (also Return netted, Match found, Not approved — its tooltip still says why). The amount reads alone.',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue'],
  },
  {
    id: 'vat-recon-row-why-left',
    title: 'VAT workspace: why a row has no match sits under "No match found"',
    description:
      'On a tax-document-only row, the state (e.g. Transaction not found) now sits under "No match found" on the transaction side, mirroring invoice-only rows.',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue'],
  },
  {
    id: 'vat-recon-airene-suggest-followups',
    title: 'VAT reconciliation: Airene column title, disclaimer copy, seed fix',
    description:
      'While Airene is loading or has candidates, the missing side\'s column is titled by what it proposes: "Tax document" on Tax document not found rows, "Transaction" on Transaction not found rows. "No match" now shows only when Airene has nothing. The shared Indonesian disclaimer now reads "Respons Airene bisa jadi tidak akurat atau kurang tepat." (UXW glossary); this also changes the Airene note on New expense. SI013\'s Tier 1 seed is now a different order or prefix (REFERENCE_PREFIX_ORDER) instead of a separator-only difference, which the engine normalizes and auto-matches.',
    date: '2026-11-09',
    files: ['VatReconciliationWorkspacePage.vue', 'vatReconSuggest.ts', 'translations.ts'],
  },
  {
    id: 'vat-recon-airene-suggest',
    title: 'VAT reconciliation: Airene match suggestions',
    description:
      'Expanding a "Tax document not found" row with no tax document yet, or a "Transaction not found" row, asks Airene (POST /suggest, mocked) for up to three counterparts, once per row per session. While it waits, the row says "Airene is looking for matches…". A rank-1 Tier 1 candidate is marked "Suggested by Airene"; Tier 2 candidates list what differs. Every candidate has a one-line reason and a secondary Confirm match, followed by a caption that Airene can be wrong. With no candidates, or after a timeout, the manual search shows as before. A confirmed suggestion is Reconciled (manual) with origin ai_suggested_human_confirmed: the Matched tab Method column reads Airene, Activity logs "Matched with Airene suggestion", and export carries the origin and reason. Group matches are hidden until US-022. Collapsed rows show no Airene marker and no heuristic "Match found" for these rows. AIRENE_SUGGEST_ENABLED replaces AIRENE_REVIEW_ENABLED, and the "Review with Airene" button is gone. 03/2027 seeds one of each outcome.',
    date: '2026-11-06',
    files: ['vatReconSuggest.ts', 'vatReconFlags.ts', 'vatReconciliation.ts', 'VatReconciliationAireneSuggestions.vue', 'VatReconciliationWorkspacePage.vue', 'ReconciliationDetailDrawer.vue', 'translations.ts'],
  },
  {
    id: 'vat-recon-tax-doc-substates',
    title: 'VAT reconciliation: "Tax document not found" splits by the transaction\'s own tax document',
    description:
      'The fix differs by how far the transaction\'s own tax document got, so status #3 now has four sub-states, all in To match. None: Tax document not found (Create tax document, Find another tax document). Draft: Tax document in draft (Submit tax document, Edit tax document). Submitted: Awaiting DJP approval (Refresh status, a simulated DJP check). Rejected: Tax document rejected (View tax document). Past "none", the row and drawer show that document instead of Find another. Refresh status approves the SI043 seed, so the row reconciles; others stay processing. The Status filter lists all four. Badges and chips use ≤ 2-word labels (Not issued, Draft, Awaiting approval, Rejected, Not recorded) with the full label in a tooltip. Replaces the "Draft pending" marker.',
    date: '2026-11-05',
    files: ['vatReconciliation.ts', 'taxDocuments.ts', 'VatReconciliationTaxDocActions.vue', 'VatReconciliationWorkspacePage.vue', 'ReconciliationDetailDrawer.vue', 'VatReconciliationUnmatchedPage.vue', 'translations.ts'],
  },
  {
    id: 'vat-recon-transaction-vs-tax-document',
    title: 'VAT reconciliation: sides are Transaction and Tax document',
    description:
      'Both sides live in ERP and the product never opens Coretax, so no VAT recon screen names Coretax or ERP as a side. The left side is Transaction (sales invoice, sales return, journal entry, bank deposit) and the right side is Tax document (faktur keluaran, nota retur, dokumen lain keluaran). Not found in Coretax is now Tax document not found, and No match in ERP is now Transaction not found. The summary strip reads Transaction DPP/PPN and Tax document DPP/PPN with no subtitles, and its deltas read vs transactions. Open in Coretax is now View tax document. Row, drawer, index and issue-queue labels and the engine reasons were swept the same way, in EN and ID.',
    date: '2026-11-05',
    files: ['vatReconciliation.ts', 'VatReconciliationWorkspacePage.vue', 'ReconciliationDetailDrawer.vue', 'VatReconciliationPairActions.vue', 'VatReconciliationPeriodsPage.vue', 'VatReconciliationUnmatchedPage.vue', 'TaxReportsIndexPage.vue', '[...slug].vue', 'translations.ts'],
  },
  {
    id: 'vat-recon-prd-align-approved-totals',
    title: 'VAT reconciliation: faktur totals count Approved faktur only',
    description:
      "DPP·faktur, PPN·faktur, their ▲/▼ deltas, Tax difference, and the index's Tax invoice (Rp) amount, count and Difference now leave out Draft, Batal and Rejected faktur. 02/2027 drops its Draft faktur (Rp8.232.000) from the Coretax column; 03/2027 shows Rp0 there. The summary strip stays period-level.",
    date: '2026-11-05',
    files: ['vatReconciliation.ts', 'VatReconciliationWorkspacePage.vue', 'VatReconciliationPeriodsPage.vue'],
  },
  {
    id: 'vat-recon-prd-align-not-approved-status',
    title: 'VAT reconciliation: a non-approved faktur is not "No match in ERP"',
    description:
      'No match in ERP is for Approved faktur only. A Draft faktur with no sales invoice now has its own Not approved status: the row shows the faktur status (Draft) and the Not approved tag, with no red status label, and it is in none of the footer counts or the issue queue. Batal/Rejected rows under the Not approved filter read the same way. Excluded faktur no longer hold a period back from Reconciled or Finalize.',
    date: '2026-11-05',
    files: ['vatReconciliation.ts', 'VatReconciliationWorkspacePage.vue', 'VatReconciliationUnmatchedPage.vue'],
  },
  {
    id: 'vat-recon-prd-align-vat-out-title',
    title: 'VAT reconciliation: workspace renamed "VAT Out"',
    description:
      'The period workspace is now titled VAT Out (Indonesian: PPN Keluaran) instead of Output tax invoice, because it covers every output document that posts to PPN Keluaran, not only faktur. The title, browser tab title, index Invoice type label and the sitemap note use the new name. Tax-document "Output tax invoice" (the document type) and the "Output tax invoice list" report card are unchanged.',
    date: '2026-11-05',
    files: ['[...slug].vue', 'vatReconciliation.ts', 'VatReconciliationPeriodsPage.vue', 'erpSitemap.ts', 'translations.ts'],
  },
  {
    id: 'vat-recon-prd-align-header',
    title: 'VAT reconciliation: Last sync and Accounts used in the period header',
    description:
      "The period detail now states when it last synced and which PPN Keluaran accounts its last run used (US-016 AC-08, VR-4). The snapshot is per period, so it can differ from today's setup; 11/2026 ran with an extra account.",
    date: '2026-11-05',
    files: ['VatReconciliationWorkspacePage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-prd-align-rerun',
    title: 'VAT reconciliation: Re-run warns on setup change, shows progress and what moved',
    description:
      'If the account setup changed since the period last ran, Re-run first confirms "Was / Now" (US-016 AC-07); Cancel does nothing, Re-run adopts the current setup as the snapshot. While it runs the page shows "Reconciling…", and rows whose status changed read "from X → Y" until reload (US-002 AC-01, VR-5). Seeded: 02/2027 invoice 40153 (Date order → Reconciled), 01/2027 one invoice (Reconciled → Invoice edited).',
    date: '2026-11-05',
    files: ['VatReconciliationWorkspacePage.vue', 'VatReconciliationRowMarkers.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-prd-align-footer',
    title: 'VAT reconciliation: footer counts',
    description:
      'Below the rows: "Showing X of Y pairs · matched · need review · unmatched · waiting on buyer" (US-020 AC-03/04). X follows the tab, filter and search; the four counts are period-level, and rows waiting on the buyer are not counted as need review. The summary strip stays period-level.',
    date: '2026-11-05',
    files: ['VatReconciliationWorkspacePage.vue'],
  },
  {
    id: 'vat-recon-prd-align-changed',
    title: 'VAT reconciliation: changes since last reconciliation on the index',
    description:
      'A period whose rows changed after its last run shows "N changes since last reconciliation" under its status (US-019 AC-05). 01/2027 is seeded with 2. Re-run clears it.',
    date: '2026-11-05',
    files: ['VatReconciliationPeriodsPage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-prd-align-row-markers',
    title: 'VAT reconciliation: row markers (changed since reconciled, remark, status change)',
    description:
      'Rows carry a gray "Changed since reconciled" tag with what changed in its tooltip (US-019 AC-01/03/04 — a flag, never a status; Re-run clears it), a comment icon whose tooltip shows the remark reason and text (US-013), and after a Re-run "from X → Y".',
    date: '2026-11-05',
    files: ['VatReconciliationRowMarkers.vue', 'VatReconciliationWorkspacePage.vue'],
  },
  {
    id: 'vat-recon-prd-align-duplicate',
    title: 'VAT reconciliation: duplicate reference picker',
    description:
      'A duplicate-reference row lists every Approved faktur carrying the invoice number, each with Select faktur; the latest in the pengganti chain is tagged Suggested (US-003 AC-01/02, VR-6). Selecting one reconciles the pair as manual. The row ✓ opens the list instead of choosing. The drawer list uses the same tag and label.',
    date: '2026-11-05',
    files: ['VatReconciliationWorkspacePage.vue', 'ReconciliationDetailDrawer.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-prd-align-not-approved',
    title: 'VAT reconciliation: "Not approved" tag on Coretax faktur',
    description:
      'A faktur that is Draft, Batal or Rejected in Coretax is excluded from matching (no candidates, ✓ explains why) and tagged "Not approved", with its Coretax status beside the number (US-001 AC-06, §5.1 row 13).',
    date: '2026-11-05',
    files: ['VatReconciliationWorkspacePage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-prd-align-not-approved-filter',
    title: 'VAT reconciliation: where non-approved faktur show',
    description:
      'A Draft faktur with no sales invoice stays in To match (Coretax side only, Not approved). A Batal or Rejected faktur with no sales invoice is in no tab and no count; only the To match Status filter "Not approved" lists it (US-001 AC-07). 03/2027 is seeded with one of each.',
    date: '2026-11-05',
    files: ['VatReconciliationWorkspacePage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-prd-align-remarks',
    title: 'VAT reconciliation: Remarks',
    description:
      'Any row that is not Reconciled (auto) offers Remarks: a reason (Timing, Missing entry, Duplicate, Return, Rounding, Other) and notes up to 500 characters with a counter (US-013). Save is never disabled: pressed with notes over 500 characters it shows an inline error and saves nothing (rule/btn-no-disabled-validation). Saved remarks show as a row icon and in Activity.',
    date: '2026-11-05',
    files: ['VatReconciliationRemarkModal.vue', 'VatReconciliationWorkspacePage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-prd-align-match-reason',
    title: 'VAT reconciliation: no free-text reason on manual match',
    description:
      'The BE stores no reason on a manual match (VR-6), so the "Confirm match with a difference?" modal keeps the difference check but drops the Reason field. Reasons go in Remarks.',
    date: '2026-11-05',
    files: ['VatReconciliationMatchConfirmModal.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-prd-align-no-npwp',
    title: 'VAT reconciliation: NPWP removed from row detail and drawer',
    description:
      'The API never sends the buyer NPWP/NIK (VR-4), so it is gone from the expanded row, the detail drawer, the issue queue column, export columns and search.',
    date: '2026-11-05',
    files: ['VatReconciliationWorkspacePage.vue', 'ReconciliationDetailDrawer.vue', 'VatReconciliationUnmatchedPage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-hide-vat-in',
    title: 'VAT reconciliation: VAT In hidden (non-goal until OD-008)',
    description:
      'VAT In is a non-goal for the VAT Out MVP, so it is hidden, not deleted. Setup no longer offers "VAT Out & VAT In" or the PPN Masukan accounts card, and a saved scope of both reads as VAT Out. The period index has no Invoice type column or filter and no input-side rows, and the issue queue and workspace show output only. One flag, VAT_IN_ENABLED in data/vatReconFlags.ts, restores it.',
    date: '2026-11-05',
    files: ['vatReconFlags.ts', 'vatReconciliation.ts', 'VatMatchingRulesPage.vue', 'VatReconciliationPeriodsPage.vue', 'VatReconciliationUnmatchedPage.vue', 'VatReconciliationWorkspacePage.vue', 'TaxReportsIndexPage.vue'],
  },
  {
    id: 'wo-approval-main-flows',
    title: 'Work order: approval gate + start date, Track routing and Adjust page',
    description:
      'Merging main into the approval work. Start work order asks for the actual start date in the Start modal (up to today); a gated start carries it into the request and the work order starts on that date once approved. Track routing is the primary action while routing is open. Complete keeps approval first, then the routing confirm → remaining materials → actual end date. Adjust goes through the approval modal when a rule gates adjustments, otherwise to the full Adjust work order page.',
    date: '2026-11-05',
    files: ['WorkOrderDetailsPage.vue', 'WoTransactionModal.vue', 'woApproval.ts'],
  },
  {
    id: 'vat-recon-drawer-footer',
    title: 'Reconciliation drawer: Cancel left, actions right',
    description:
      'Drawer footer follows the shared drawer shell: ghost Cancel on the left closes the drawer; on the right, Open in Coretax (secondary) sits before the state\'s primary action (e.g. Create sales invoice). Open in Coretax only shows when the pair has a faktur to open.',
    date: '2026-11-05',
    files: ['ReconciliationDetailDrawer.vue'],
  },
  {
    id: 'vat-recon-drawer-compare-divider',
    title: 'Reconciliation drawer: divider between From ERP and From Coretax',
    description:
      'A 1px vertical divider (border-default) now splits the two comparison columns in the Reconciliation detail drawer, matching the two-column expand on the workspace rows.',
    date: '2026-11-05',
    files: ['ReconciliationDetailDrawer.vue'],
  },
  {
    id: 'app-shell-light-canvas',
    title: 'App shell: no dark-green band under the page',
    description:
      'The dark-green backing moved from html/body onto .app-shell, so the header, side borders and rounded top corners look the same, but any canvas past the shell (e.g. the desktop preview reserving room for its annotation toolbar) now shows the light page colour instead of a green footer band.',
    date: '2026-11-05',
    files: ['layouts/default.vue'],
  },
  {
    id: 'vat-recon-workspace-banner-top',
    title: 'VAT workspace: reason banner at the top of the expanded row',
    description:
      'The engine reason banner (No match in ERP, Return netted, …) now sits at the top of the expanded row, above the Sales invoice / Faktur pajak columns, so the why is read before the detail. The Reconciliation detail drawer title is now just the reference number: no state icon, no "Reconciliation detail · <state>" sub-line (the banner below already says the state).',
    date: '2026-11-05',
    files: ['VatReconciliationWorkspacePage.vue', 'ReconciliationDetailDrawer.vue'],
  },
  {
    id: 'vat-recon-workspace-tabs-inline',
    title: 'VAT workspace: tabs under the summary',
    description:
      'To match · Not reconciled · Matched moved from the title-bar page tabs to in-page MpTabs directly under the summary, as on the bank Reconciliations page (docs/patterns/tabs.md §2). Counts keep the same warning badge; the tab is still in ?tab= so links and refresh land on it.',
    date: '2026-11-05',
    files: ['VatReconciliationWorkspacePage.vue', '[...slug].vue'],
  },
  {
    id: 'vat-recon-workspace-reconciliations',
    title: 'VAT workspace follows Jurnal bank Reconciliations',
    description:
      'Tabs are now To match · Not reconciled · Matched, each with its count. To match keeps the bank-style rows restyled to the reference: status as coloured text ("Match found" / "No match found"), a solid ✓ ring when there is a match to confirm and a dashed one when there is none, and an expand with two titled columns (each with a ⋮ menu) using ContentList; "Find another faktur" opens the detail drawer. Candidates are now only records that exist in the masa — no invented faktur — and a confirmed match consumes its counterpart. Not reconciled and Matched are ErpTablePage tables; Matched shows Method (Auto / Manual) and its Unmatch really splits an engine match back into two open rows. The KPI cards became the reference\'s divider summary strip.',
    date: '2026-11-04',
    files: ['VatReconciliationWorkspacePage.vue', 'ReconciliationDetailDrawer.vue', 'VatReconciliationPairActions.vue', 'vatReconciliation.ts', '[...slug].vue'],
  },
  {
    id: 'vat-recon-index-no-tabs',
    title: 'VAT reconciliation index: one list, no tabs',
    description:
      'The All reconciliations / Needs attention tabs are gone. Periods that still need work (Not reconciled, Partially reconciled) are sorted to the top of the single list, newest masa first within each group; a column sort overrides it. In All filters, the Tax period checklist sits in a bordered box that scrolls past a fixed height (same box as the Stock adjustments filters).',
    date: '2026-11-04',
    files: ['VatReconciliationPeriodsPage.vue', 'ReconciliationFiltersDrawer.vue', '[...slug].vue', 'erpSitemap.ts'],
  },
  {
    id: 'vat-recon-ui-review-2',
    title: 'VAT reconciliation: UI review pass 2',
    description:
      'A fully reconciled masa opens to an all-clear state ("Nothing needs attention" + View all faktur) instead of "No faktur match your filters". Re-run on a finalized masa explains itself inline in the sign-off banner (no toast), and Unfinalize lives only in the title bar. Return rows show the linked sales return and invoice − return. KPI cards wrap instead of truncating amounts. Fixture reasons now match their 02/2027 dates. Setup\'s dark "Setup history" card is now a bordered "Last saved" card with a DD Mon YYYY, HH:MM stamp on the prototype clock. With VAT In in scope the index header is "Invoice (Rp)" and the tax period takes the date width, so nothing clips at 1440px.',
    date: '2026-11-04',
    files: ['VatReconciliationWorkspacePage.vue', 'VatMatchingRulesPage.vue', 'VatReconciliationPeriodsPage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-ui-review',
    title: 'VAT reconciliation: UI review fixes on shared ERP patterns',
    description:
      'Every screen now reuses the documented patterns other modules ship. Index & Unmatched: ErpTablePage with column kinds, ErpFilterSelect, PurchaseOrdersPage filter bar (Airene / columns / Export icon group + pill search), ExportModal everywhere (no silent "Export started"), a bulk "Actions" bar for selected periods, the […] row menu and the illustrated empty state. The detail drawer moved onto the ErpDrawer shell (closes only via ×) and "Match this" now records a real match (with a reason when totals differ). Workspace: Export moved from the title bar into the filter bar, Re-run is the search-side tertiary, the draft bulk bar mirrors ErpTablePage, row fixes are secondary (one primary per screen), Finalize is never disabled and explains what is left, duplicate reference lists the two faktur, and no red Difference shows before a pick. Setup: Cancel + Save ("Save" on first run, then back to the index) with a success toast; the tabs stay hidden behind the setup gate.',
    date: '2026-11-04',
    files: ['VatReconciliationPeriodsPage.vue', 'VatReconciliationUnmatchedPage.vue', 'VatReconciliationWorkspacePage.vue', 'ReconciliationDetailDrawer.vue', 'VatReconciliationPairActions.vue', 'VatReconciliationTaxDocActions.vue', 'VatMatchingRulesPage.vue', '[...slug].vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-review-fixes',
    title: 'VAT reconciliation: design-review P0 + P1 fixes',
    description:
      'A match whose sides differ is no longer one click: the ✓ opens a modal that states the difference and requires a reason. Manual matches are saved (Reconciled manual; KPIs and index follow; Unmatch reverts). The expand shows Activity built from real records (match + reason, waiting on buyer, tax document, engine, sync). The page scrolls as a whole with a sticky column header and footer, pages at 50 rows, and drafts can be selected and submitted to DJP in bulk.',
    date: '2026-11-03',
    files: ['VatReconciliationWorkspacePage.vue', 'VatReconciliationMatchConfirmModal.vue', 'VatReconciliationPairActions.vue', 'ReconciliationDetailDrawer.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-prd-fixes',
    title: 'VAT reconciliation: four PRD OD-001 gaps fixed',
    description:
      'Tax difference is now |PPN Sales − PPN Faktur| (US-020 AC-02) — it used to add the DPP gap in. Footer counts follow the status filter and search; the cards stay period-level (AC-04). A Finalized masa refuses Match / Unmatch / Confirm, not only Re-run (US-002 AC-05). Waiting on buyer is a real per-row toggle with a clock tag: only toggled rows leave "need review", status unchanged (US-012 AC-02).',
    date: '2026-11-03',
    files: ['VatReconciliationWorkspacePage.vue', 'VatReconciliationPairActions.vue', 'ReconciliationDetailDrawer.vue', 'VatReconciliationUnmatchedPage.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-first-period',
    title: 'VAT reconciliation starts at masa 10/2026',
    description:
      'Release moves to November 2026, so the first masa pajak offered is 10/2026 (its SPT is still due end of November) instead of 01/2027. The six demo periods now run 10/2026 → 03/2027 and the prototype "today" is 18 Mar 2027.',
    date: '2026-11-02',
    files: ['vatReconciliation.ts', 'VatMatchingRulesPage.vue'],
  },
  {
    id: 'vat-recon-bank-style',
    title: 'VAT reconciliation rows: bank-reconciliation style',
    description:
      'Rows are grouped by date and read as one compact line — ERP amount ⋯ Coretax amount + status tag — like Bank reconciliation. Detail opens inside the row (no drawer): both sides field by field, or a radio list of candidates with Selected total and Difference. The round ✓ confirms a match (filled green = reconciled; pressed with nothing picked, it asks inline). Tax document actions (Edit / Submit to DJP / Create) sit on the line itself. Status filter is now ErpFilterSelect.',
    date: '2026-11-02',
    files: ['VatReconciliationWorkspacePage.vue', 'VatReconciliationPairActions.vue', 'VatReconciliationTaxDocActions.vue', 'ReconciliationDetailDrawer.vue', 'vatReconciliation.ts'],
  },
  {
    id: 'vat-recon-tax-doc-actions',
    title: 'Not found in Coretax: act on the invoice\'s tax document',
    description:
      'Rows are now real sales invoices, and the action follows how far the invoice\'s tax document got. None → "Create tax document ↗" opens the invoice in a new tab with the Create drawer already open. Draft → "Submit to DJP" (confirm, right here) or "Edit tax document ↗" (new tab, draft open in edit mode). Submitted / rejected / approved → "View tax document ↗". Saving in the other tab updates this row on return. The invoice page\'s draft "Edit" menu item now works too.',
    date: '2026-11-02',
    files: ['VatReconciliationTaxDocActions.vue', 'VatReconciliationWorkspacePage.vue', 'ReconciliationDetailDrawer.vue', 'SalesInvoiceDetailsPage.vue', 'CreateTaxDocumentDrawer.vue', 'vatReconciliation.ts', 'taxDocuments.ts'],
  },
  {
    id: 'vat-setup-manual-accounts',
    title: 'VAT reconciliation setup: pick PPN accounts by hand',
    description:
      'The fixed tax-code list (with hardcoded, non-existent COA like 2-20300) is gone. Users now pick the PPN Keluaran accounts themselves from the live chart of accounts — multi-select with chips, like Jurnal "Include accounts" — with a hint that only PPN/VAT accounts belong here. "VAT Out & VAT In" adds a second picker for PPN Masukan. Save is never disabled: an empty list or an account in both lists shows an inline error.',
    date: '2026-11-02',
    files: ['VatMatchingRulesPage.vue', 'vatReconciliation.ts', 'VatReconciliationPeriodsPage.vue', 'translations.ts'],
  },
  {
    id: 'wo-approval-queue-columns',
    title: 'Awaiting approval: Request type column',
    description:
      'Copy audit: the column was "Transaction type", which in ERP means the document type — in Settings › Approval workflows, Work order IS the transaction type. Every row here is a work order, so the column now reads Request type (Tipe pengajuan) and says which request is waiting. The cancel type reads "Cancel/close" like the rest of the module instead of "Cancellation". Status and Requester swapped places.',
    date: '2026-10-19',
    files: ['WorkOrdersAwaitingApprovalPage.vue', 'translations.ts'],
  },
  {
    id: 'wo-approval-fixes',
    title: 'Work order approval — review fixes',
    description:
      'Review pass: the freeze notice no longer claims "Only Print is available" (the requester can also cancel the request) and just says the work order is locked; transaction dates are the local calendar day, so a request no longer shows a date a day before its own log; a request that applies because its approval level was removed from the workflow now says so in the log instead of looking approved; Adjustment, Completion and Cancel/close workflows are seeded ACTIVE, so those actions really do ask for approval like the queue implies.',
    date: '2026-10-19',
    files: ['woApproval.ts', 'approvalWorkflows.ts', 'WoApprovalNotice.vue', 'WoTransactionModal.vue', 'date.ts'],
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
      'Approver queue (PRD "Require approval" tab, named Awaiting approval like other modules) with Approval log, Comments, Approve and Reject (reason required), plus bulk Approve / Reject. Switch "View as" in the scenario FAB to check level 1, level 2 and requester views. Table styled like the other approval queues (Purchase requests / Bills): "Work order #n" number link, Awaiting approval status badge, plain cells, Airene / Column settings / Export tools, inline Approve + quiet icon buttons. UXW copy: columns Date · Number · Request type · Warehouse · Status · Requester · Approver; types Start / Adjustment / Completion / Cancel/close; search "Search...".',
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
      'Start work order, Adjust work order, Complete and Cancel/close show "This transaction needs approval from level 1: …" when a Work order workflow gates them, and save a request instead of executing. Adjust is a stand-in modal (no form existed before). Material consume / return post immediately but are refused while an adjustment, completion or cancel/close is pending, and consume is capped at the planned qty. A rejected request is not re-opened pre-filled — the user starts the action again from the header or Actions menu.',
    date: '2026-10-02',
    files: ['CreateWorkOrderPage.vue', 'NewMaterialRecordPage.vue', 'WoTransactionModal.vue'],
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
    title: 'Check-in settings with Edit mode + Photo evidence',
    description:
      'Full Check-in tab: version label, Edit button for edit-mode gating, Enable toggle (only editable in edit mode), Photo evidence (Optional/Required) visible when enabled. Persisted per-module. Check-in column on Modules index (Enabled/Disabled). Check-in history tab on deal detail with table: Checked in at, User, Location, Note, Evidence.',
    date: '2026-11-09',
    files: ['CrmModuleBuilderPage.vue', 'CrmModulesPage.vue', 'CrmDealDetailPage.vue', 'crm.ts'],
  },
  {
    id: 'crm-deal-checkin-history',
    title: 'Check-in history tab on deal record detail',
    description:
      'New Check-in tab on the deal detail page (visible only when module has check-in enabled). Shows a read-only table of mobile arrivals: Checked in at, User, Location (with map link), Note, Evidence (photo captured or no photo). Footer shows count and retention notice.',
    date: '2026-11-09',
    files: ['CrmDealDetailPage.vue', 'crm.ts'],
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
