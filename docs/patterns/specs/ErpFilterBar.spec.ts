/**
 * ErpFilterBar Design Spec
 *
 * Pre-filled dari CSS yang sudah ada — review dan koreksi sesuai Figma.
 *
 * Setelah selesai, jalankan: npm run test:all
 */

export const ErpFilterBarSpec = {

  // ─── Container ──────────────────────────────────────────────────────────────
  //
  // Selector: .erp-filter-bar
  //
  // spec:
  //   display     : flex
  //   align-items : center
  //   flex-wrap   : wrap
  //   gap         : var(--mp-spacing-2)   = 8px
  //   padding     : var(--mp-spacing-3) var(--mp-spacing-4)   = 12px 16px
  //   border-bot  : 1px solid var(--mp-border-default)

  container: {
    display:      'flex',
    alignItems:   'center',
    flexWrap:     'wrap',
    gap:          'var(--mp-spacing-2)',
    padding:      'var(--mp-spacing-3) var(--mp-spacing-4)',
    borderToken:  '--mp-border-default',

    // ── Behaviour ────────────────────────────────────────────────────────
    behaviors: {

      responsiveWrap: {
        // filter controls akan wrap ke baris baru otomatis
        // jika lebar container tidak cukup
        enabled:   true,
        flexWrap:  'wrap',
      },

    },
  },

} as const
