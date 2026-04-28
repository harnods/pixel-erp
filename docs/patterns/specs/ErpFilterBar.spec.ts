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
  //   gap         : 8px
  //   padding     : 12px 16px     ← TODO: verify dengan Figma
  //   border-bot  : 1px solid var(--mp-border-default)

  container: {
    display:      'flex',
    alignItems:   'center',
    flexWrap:     'wrap',         // filter bisa turun ke baris berikutnya kalau tidak muat
    gap:          '8px',
    padding:      '12px 16px',   // TODO: verify dengan Figma
    borderToken:  '--mp-border-default',

    // ── Behaviour ────────────────────────────────────────────────────────
    behaviors: {

      responsiveWrap: {
        // filter controls akan wrap ke baris baru otomatis
        // jika lebar container tidak cukup
        //
        // TODO: konfirmasi apakah wrapping ini di-require
        enabled:   true,
        flexWrap:  'wrap',
      },

    },
  },

} as const
