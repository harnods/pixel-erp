/**
 * ErpPagination Design Spec
 *
 * Pre-filled dari CSS yang sudah ada — review dan koreksi sesuai Figma.
 *
 * Setelah selesai, jalankan: npm run test:all
 */

export const ErpPaginationSpec = {

  // ─── Container ──────────────────────────────────────────────────────────────
  //
  // Selector: .erp-pagination
  //
  // spec:
  //   display          : flex
  //   align-items      : center
  //   justify-content  : space-between
  //   padding          : var(--mp-spacing-2) var(--mp-spacing-4)   = 8px 16px
  //   gap              : var(--mp-spacing-4)   = 16px
  //   border-top       : 1px solid var(--mp-border-default)

  container: {
    padding:      'var(--mp-spacing-2) var(--mp-spacing-4)',
    gap:          'var(--mp-spacing-4)',
    borderToken:  '--mp-border-default',
  },

  // ─── Label / Info Text ───────────────────────────────────────────────────────
  //
  // Selector: .pagination-label, .pagination-showing
  //
  // spec:
  //   font-size : var(--mp-font-sizes-sm)   = 12px
  //   color     : var(--mp-text-secondary)

  label: {
    fontSize:   '--mp-font-sizes-sm',
    colorToken: '--mp-text-secondary',
  },

} as const
