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
  //   padding          : 8px 16px     ← TODO: verify dengan Figma
  //   gap              : 16px
  //   border-top       : 1px solid var(--mp-border-default)

  container: {
    padding:      '8px 16px',    // TODO: verify dengan Figma
    gap:          '16px',
    borderToken:  '--mp-border-default',
  },

  // ─── Label / Info Text ───────────────────────────────────────────────────────
  //
  // Selector: .pagination-label, .pagination-showing
  //
  // spec:
  //   font-size : 13px            ← TODO: verify dengan Figma (body-small = 12px?)
  //   color     : var(--mp-text-secondary)

  label: {
    fontSize:   '13px',          // TODO: verify — Pixel body-small biasanya 12px
    colorToken: '--mp-text-secondary',
  },

} as const
