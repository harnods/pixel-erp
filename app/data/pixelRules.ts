// Short, human-readable meaning for each rule/* id — the display layer for the
// /pixel right-hand "Rules" rail. Full text (Do/Don't + Why + Source) lives in
// docs/design/RULES.md; keep these one-liners in sync with it.
export const RULE_MEANINGS: Record<string, string> = {
  // Buttons
  'rule/btn-mpbutton-standard': 'New buttons use MpButton; .btn-enterprise is legacy.',
  'rule/btn-always-pill': 'Buttons are always pill-shaped (is-rounded).',
  'rule/btn-one-primary': 'At most one primary action per screen.',
  'rule/btn-secondary-black': 'Secondary = near-black label + dark neutral border.',
  'rule/btn-ghost-regular': 'Ghost buttons use regular (not semibold) weight.',
  'rule/btn-cancel-ghost': 'Cancel / dismiss / close is always the ghost variant.',
  'rule/btn-primary-icon-white': 'Icons inside a primary button are always white.',
  'rule/btn-no-size-md': 'md is the default size — never write size="md".',
  'rule/btn-sm-secondary-only': 'size="sm" only in a table bulk-action bar, always variant=secondary (default an "Actions" dropdown) — never primary; no sm anywhere else.',
  'rule/btn-danger-no-icon': 'Danger buttons are text-only — no left/right icon.',
  'rule/btn-sm-dropdown-only': 'A sm button may carry only a right-icon dropdown chevron.',
  'rule/btn-no-full-width': 'No manual full-width — buttons hug content (see responsive-footer).',
  'rule/btn-responsive-footer': 'Footer = MpButtonGroup.erp-action-footer, right-aligned; full-width stack on mobile.',
  'rule/btn-group-gap-8': 'Buttons in an MpButtonGroup sit 8px apart (default spacing).',
  'rule/page-title-actions-group': 'Page-title actions: 1 button loose; 2+ wrapped in an MpButtonGroup.',
  'rule/btn-icon-tooltip': 'Icon-only buttons need aria-label + an MpTooltip.',
  'rule/filter-bar-icon-group': 'Filter-bar tools = ghost icon MpButtons (airene-brand, table-view-column, download) in one MpButtonGroup + tooltips.',
  'rule/icon-pixel-library': 'Every icon is an MpIcon from the Pixel icon library (verify name via MCP) — never raw svg/emoji.',
  'rule/btn-dropdown-mppopover': 'A dropdown button must be a real MpPopover menu.',
  'rule/btn-dropdown-min-width': 'Dropdown/split menu popover has a fixed 160px min-width.',
  'rule/btn-danger-confirm': 'A danger button always opens a confirm MpModal (md, UXW copy).',
  'rule/btn-save-toast': 'A save/submit/delete shows a success toast — UXW copy "[Object] saved".',
  'rule/btn-no-disabled-validation': 'Never disable for validation — keep clickable, error inline.',

  // Forms & inputs
  'rule/form-actions-always-present': 'Footer Cancel + primary are always rendered.',
  'rule/form-errors-inline': 'Validation errors render inline, never as a toast.',
  'rule/form-edit-save-changes': 'Edit form primary = "Save changes"; create = "Save".',
  'rule/checkbox-multiline-top': 'A multi-line checkbox label keeps the box top-aligned.',
  'rule/select-erpfilterselect': 'Dropdown = MpAutocomplete (omit is-searchable = select); its menu is a popover, never the native OS <select>.',
  'rule/select-active-neutral': 'Select/search focus = neutral slate ring, never green.',
  'rule/select-multi-mpinputtag': 'Multi-select tag input uses MpInputTag — no hand-rolled chips.',
  'rule/filter-bar-search-export': 'Filter bar always carries Search + Export on the right.',

  // Modals
  'rule/modal-use-mpmodal': 'All modals use Pixel MpModal (ghost Cancel + pill confirm).',
  'rule/modal-alert-top-align': 'Alert / confirm modals align to the top.',
  'rule/activity-log-modal': 'Audit trail = the shared ActivityLogModal (MpModal xl, header "Activity log") — never hand-roll it.',
  'rule/activity-log-trigger': 'Open it only from the "Created / Last updated by … on <date>" link at the foot of the detail summary — no button.',
  'rule/activity-log-structure': 'Body = subject h2 + DATE · USER · ACTIVITY · DETAILS table; a busy event shows first 3 details (Show more reveals the rest), edits render "old → new".',
  'rule/activity-log-progressive': 'Rows load 10 at a time on scroll with "Showing X of Y"; bold outer frame only when longer than one page.',
  'rule/activity-log-entries': 'Pass entries (newest first) built from the record\'s own data — no fabricated trail; a bare record still shows one "Created".',
  'rule/journal-entry-modal': 'Read-only posting = shared JournalEntryDrawer (MpModal lg, v-model:is-open), heading + rows — reuse for any transaction type.',
  'rule/journal-entry-structure': 'Body = heading + Account · Debit · Credit table with a bold Total row (debits must equal credits); IDR, read-only.',
  'rule/journal-entry-trigger': 'Open from the "View journal entry" link on the detail page — no toolbar button.',
  'rule/approval-log-modal': 'Universal approval timeline = shared ApprovalLogModal (MpModal md, "Approval log"), opened from an "Approval log" action; read-only.',
  'rule/approval-log-structure': '"Requested by …" then per stage: rule caption (everyone n of m / anyone) + status badge; approved (green check) / awaiting (amber clock); expanded by default.',
  'rule/approval-log-rail': 'One continuous left rail behind every marker — flatten rows into a single list so the line self-heals on collapse; never nest per-stage lines.',

  // Tables
  'rule/table-use-erptablepage': 'Tables render via ErpTablePage — never hand-rolled.',
  'rule/table-column-kind': 'Set each column kind; never hardcode a width on a semantic column.',
  'rule/table-no-outer-border': 'No outer border box; wrapper is overflow-x only.',
  'rule/table-cell-padding-align': 'Cell padding 8px; align middle unless a column has ≥3 lines.',
  'rule/table-default-sort-alpha': 'Named-entity tables default to alphabetical by name.',
  'rule/table-sortable-columns': 'Every column is sortable via a hover-header menu.',
  'rule/table-name-link-span': 'A clickable row name is a styled span, not MpTextlink.',
  'rule/accordion-row-click': 'An accordion row expands on click anywhere in the row.',
  // table-accordion-row-click / -form-cell-no-border / -nonform-bg-gray / -form-header-white
  // / -merged-row-borders: the detailed copies live in the table-rules block below.

  // Surfaces / drawers / detail
  'rule/surface-border-no-shadow': 'Cards use a 1px border, never a drop-shadow.',
  'rule/surface-no-double-pad': 'A registry page must not re-pad the stage (already 24px).',
  'rule/drawer-custom-shell': 'Drawers use the hand-rolled Teleport shell, not MpDrawer.',
  'rule/drawer-header-fill': 'The drawer header has a background fill; panel has no shadow.',
  'rule/drawer-open-via-manage': 'A drawer opens only via a Manage button.',
  'rule/detail-contentlist': 'Detail-page key/value pairs use ContentList.',
  'rule/detail-breadcrumb-no-gap': 'Breadcrumb sits directly above the title (gap 0).',

  // Feedback / empty / tabs
  'rule/empty-state-structure': 'Empty state = illustration + title + caption + secondary button.',
  'rule/skeleton-solid-static': 'Skeletons are solid & static — no shimmer gradient, no animation (duration="0s" + flatten class).',
  'rule/skeleton-3-rows': 'First-load skeleton shows exactly 3 placeholder rows/bars, via ErpTablePage :loading.',
  'rule/toast-use-mptoast': 'Every toast is a Pixel MpToast (toast.notify / ~/utils/toasts) — never hand-rolled; variants are success | error | greeting (+ info helper).',
  'rule/toast-success-only': 'Toast confirms success or neutral info; error variant is system/async failures only — form validation goes inline.',
  'rule/erp-tabs-pattern': 'Status/section tabs = pageTabs; in-page detail tabs = MpTabs.',

  // Type / tokens / theme / format
  'rule/theme-enterprise': 'Always the Enterprise theme + DT 2.4 tokens.',
  'rule/type-14-default': 'Body text is 14px; 12px is captions only.',
  'rule/type-no-italic': 'No italic anywhere — emphasize with weight.',
  'rule/format-idr': 'Money is formatted as IDR per the currency helper.',
  'rule/format-date': 'Dates: table 23/06/2026, 15:30; non-table 23 Jun 2026, 15:30.',
  'rule/badge-status-mapping': 'Map statuses to badge intents via ErpStatusBadge.',
  'rule/style-with-css': 'Style via Pixel css() + design tokens, not hand-rolled scoped CSS with hex/px.',
  'rule/type-scale': 'Roles: H1=2xl/24, H2=xl/20, H3=lg/16, p=md/14 (body), small=sm/12 (caption). xsm/10px NOT used in ERP. Pick a role, never a raw px.',
  'rule/spacing-scale': 'Compose gaps/padding/margins from the spacing scale (var(--mp-spacing-*)), not arbitrary px.',
  'rule/input-no-placeholder': 'Text inputs/textareas have NO placeholder. Label the field; leave the control empty.',
  'rule/field-invalid-caption': 'Invalid field → error caption below it immediately (UXW copy format), not just a red border or a toast.',
  'rule/form-size-md-only': 'Every form control is size md (default). No size="sm" (or other) on form fields in the ERP.',
  'rule/input-char-counter': 'Length-capped input/textarea: native maxlength + n/max counter top-right of the label row. Defaults: name=60, description=250.',
  'rule/form-field-stacking': 'Form = 6-col grid, max 558px; by default every field stacks vertically full-width. Side-by-side only when explicitly requested.',
  'rule/form-select-half': 'Select/MpAutocomplete = span 3 (half, ~267px) on its own row — never full-width or auto-paired beside another field.',
  'rule/form-toggle-inline': 'Form toggle field = MpToggle LEFT + label RIGHT, 12px gap (same as checkbox↔label) — not space-between across the form.',
  'rule/select-quick-add': 'Inline-create select = MpAutocomplete + is-show-button-action + #buttonAction: "Add new <noun>" (no search) / Add "<search>" as a new <noun> (typing); @button-action opens create.',
  'rule/checkbox-gap-12': 'Checkbox/radio ↔ label gap is exactly 12px and built into the component — add no extra padding (avoid the 24px double-gap).',
  'rule/date-picker-variants': 'Two date controls only: MpDatePicker (single, DD/MM/YYYY) and AdvancedDateRangePicker (range + presets).',
  'rule/date-picker-no-clip': 'A date calendar must render fully, never clipped by an overflow/scroll ancestor — portal it.',
  'rule/input-tag-comparator': 'Set-match filter = comparator prefix ("Is any of"/"Is none of") + suggestion-backed tag input = ErpTagComparatorField.',
  'rule/segmented-control-pill': 'ERP segmented control is pill-shaped; active segment = sidebar level-2 active colors (#E2E8F0 bg / #165082 text), never green.',
  'rule/segmented-icon-active-fill': 'Icon-only segmented (view switches): active segment icon is filled (variant=fill), inactive outline — use ErpIconSegmented.',
  'rule/badge-single-mpbadge': 'One badge = MpBadge (for + type). ErpStatusBadge is deprecated; migrate to MpBadge.',
  'rule/badge-for-context': 'Pick MpBadge `for` by context: tableStatus (rows, PASTEL), additionalInformation (beside title/tab, SOLID bold fill + white text, NOT pastel), indicator (dot).',
  'rule/badge-size-default': 'Badge always default size; never size="sm".',
  'rule/tag-gray-only': 'Tags (MpTag) are always gray — no red/coloured tags. Colour lives in badges.',
  'rule/tag-size-default': 'Tags are default md size; never size="sm".',
  'rule/tag-list-mptag': 'ErpTagList renders each tag as a real MpTag (gray, md), 2-line clamp + "More" overflow.',
  'rule/avatar-lg-xl-circle': 'MpAvatar always circle; default size lg, only other used is xl. No sm/md, no square.',
  'rule/content-list-horizontal': 'ContentList horizontal: label left min 184px + 24px gap + value fills rest; 8px top/bottom.',
  'rule/table-sticky-first-col': 'Wide horizontally-scrolling table pins its first column (position:sticky;left:0, opaque bg); actions column stays flush right.',
  'rule/table-header-uppercase': 'Table headers are UPPERCASE, 12px semibold, secondary colour, on the gray surface (#f1f5f9).',
  'rule/table-product-cell': 'Product-name cell = ProductCell: 40px photo + name, optional SKU caption or 2-line description with Show more/less; aligns top.',
  'rule/table-header-height': 'Table header row is 28px tall; body rows sit on a 40px baseline.',
  'rule/table-bulk-actions-bar': 'On row selection the column headers are replaced by a bulk-action bar (ErpTablePage #bulk-actions + has-checkbox); buttons are secondary sm, default an "Actions" dropdown — never primary.',
  'rule/table-header-bg-gray': 'Index table header bg is gray (neutral-subtle); form-table header is white.',
  'rule/table-filter-bar-pagination': 'Index/list table always has a filter bar (#filters) + pagination — both built into ErpTablePage.',
  'rule/table-pagination-model': 'Regular pagination on index pages; progressive/infinite load only on embedded detail line-item tables.',
  'rule/table-outer-border-conditional': 'Outer border only on a progressive table scrolling vertically inside itself (>~10 rows); ≤10 rows or horizontal-only scroll = borderless. When shown, the border is border.bold.',
  'rule/table-full-width': 'A table is full width (100%, 12-col grid) by default — never constrain its width unless explicitly asked.',
  'rule/table-bg-white': 'Table bg is always white; the only exception is a non-editable/calculated cell in a form table (disabled bg).',
  'rule/table-cell-text-plain': 'Body-cell text is always 14px/regular/text-default — no bold/semibold/italic — except a text-link cell (link colour + hover underline).',
  'rule/table-row-hover': 'Row hover = light cool blue-gray (#f3f5f9); never green/brand or heavy.',
  'rule/table-actions-column': 'Every index table has a rightmost [...] actions column, pushed flush-right by a flexible spacer and sticky during horizontal scroll (ErpTablePage #actions + stickyActions).',
  'rule/table-form-cell-no-border': 'Inputs/selects in a cell have no own border; the cell owns it (focus-within inset ring). Editable td padding:0, 40px row.',
  'rule/table-merged-row-borders': 'rowspan/merged cells: left+right borders on all columns, no double border, no outer border on edge columns.',
  'rule/table-accordion-row-click': 'Accordion table: whole summary row toggles on click (chevron visual-only); inner controls use @click.stop.',
  'rule/table-nonform-bg-gray': 'Form table: non-form / calculated columns get a gray (neutral-subtle) background.',
  'rule/table-form-header-white': 'Form-table thead: white background, no left/right borders on th.',
  'rule/table-checkbox-first-cell': 'Row checkbox lives inside the first data cell, not in a separate checkbox-only column.',
  'rule/token-no-hardcoded-color': 'Colors come from var(--mp-color-*) tokens.',
  'rule/token-no-hardcoded-spacing': 'Spacing/sizing from var(--mp-spacing-*) tokens.',
  'rule/token-pixel3-only': 'Import from @mekari/pixel3 only.',
  'rule/token-no-raw-html': 'Use Mp* components, not raw button/input/select.',

  // Patterns — Filter bar
  'rule/filter-bar-anatomy': 'Filter bar = left (filters + All filters) | right (icon tools then search), space-between.',
  'rule/filter-bar-left-gap': 'Left group gap is always 16px (filter↔filter and filter↔All filters).',
  'rule/filter-bar-search-pill': 'Search is a rounded pill, rightmost, with a leading icon + clear (×).',
  'rule/filter-bar-all-filters-drawer': 'Overflow filters live behind an "All filters" button that opens the filters drawer.',

  // Copy
  'rule/copy-vendor-not-supplier': 'Say "Vendor", not Supplier / Pemasok.',
  'rule/copy-number-not-id': 'Label identifiers "… number", not "… ID".',
  'rule/copy-add-noun-only': 'Add buttons use the noun only (no "baru").',
  'rule/copy-id-translations': 'All strings live in translations.ts via t().',
}

export function ruleMeaning(id: string): string {
  return RULE_MEANINGS[id] ?? 'See docs/design/RULES.md'
}

// Rules that apply to EVERY component — shown in the rail when a page declares no
// component-specific rules, so the 3-column format stays consistent everywhere.
export const FOUNDATION_RULES: string[] = [
  'rule/theme-enterprise',
  'rule/type-14-default',
  'rule/type-no-italic',
  'rule/token-no-hardcoded-color',
  'rule/token-no-raw-html',
]
