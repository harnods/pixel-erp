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
  'rule/btn-sm-secondary-only': 'size="sm" only on secondary, and only in a table bulk-action bar.',
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

  // Tables
  'rule/table-use-erptablepage': 'Tables render via ErpTablePage — never hand-rolled.',
  'rule/table-column-kind': 'Set each column kind; never hardcode a width on a semantic column.',
  'rule/table-no-outer-border': 'No outer border box; wrapper is overflow-x only.',
  'rule/table-cell-padding-align': 'Cell padding 8px; align middle unless a column has ≥3 lines.',
  'rule/table-default-sort-alpha': 'Named-entity tables default to alphabetical by name.',
  'rule/table-sortable-columns': 'Every column is sortable via a hover-header menu.',
  'rule/table-name-link-span': 'A clickable row name is a styled span, not MpTextlink.',
  'rule/table-accordion-row-click': 'An accordion row expands on click anywhere in the row.',
  'rule/accordion-row-click': 'An accordion row expands on click anywhere in the row.',
  'rule/table-form-cell-no-border': 'Inputs in a cell have no own border — the cell provides it.',
  'rule/table-nonform-bg-gray': 'Non-form columns get a subtle gray bg beside form columns.',
  'rule/table-form-header-white': 'A form-table header has a white bg, no side borders.',
  'rule/table-merged-row-borders': 'Merged (rowspan) cells get side borders, no double border.',

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
