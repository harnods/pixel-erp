/**
 * ErpTablePage Design Spec
 *
 * Ini adalah source of truth untuk design dan behaviour ErpTablePage.
 * Nilai di bawah di-pre-fill dari CSS yang sudah ada — review dan koreksi
 * sesuai Figma sebelum dijadikan acuan test.
 *
 * Setelah Anda selesai, jalankan: npm run test:all
 */

export const ErpTablePageSpec = {

  // ─── Table Header ───────────────────────────────────────────────────────────
  //
  // Selector: .erp-th
  //
  // spec:
  //   min-height  : 28px        ← TODO: verify dengan Figma
  //   max-height  : 28px        ← TODO: verify dengan Figma
  //   padding     : 4px 16px 4px 8px
  //   font-size   : 12px
  //   font-weight : 600 (semiBold)
  //   text-transform: uppercase
  //   border-bot  : 1px solid var(--mp-border-default)
  //   background  : var(--mp-background-neutral-subtle)

  header: {
    minHeight:       '28px',        // TODO: verify dengan Figma
    maxHeight:       '28px',        // TODO: verify dengan Figma
    padding:         '4px 16px 4px 8px',
    paddingRight:    '4px 8px 4px 16px',  // right-aligned column (flipped)
    fontSize:        '12px',
    fontWeight:      '600',
    textTransform:   'uppercase',
    backgroundToken: '--mp-background-neutral-subtle',
    borderToken:     '--mp-border-default',

    // Checkbox column
    checkboxWidth:   '36px',

    // Actions column (sticky right, no label)
    actionsWidth:    '44px',

    // ── Behaviour ──────────────────────────────────────────────────────────
    behaviors: {

      stickyOnScroll: {
        // table header akan sticky ketika di-scroll dan posisinya
        // tetap di y=0 browser (tidak ikut scroll ke atas)
        //
        // TODO: konfirmasi apakah ini requirement halaman ini
        enabled:    true,
        position:   'sticky',
        top:        '0',
        zIndex:     2,            // harus di atas body rows
        scrollContainerOverflow: 'auto',  // .erp-table-wrapper syarat sticky
      },

      sortable: {
        // column header yang sortable menampilkan cursor pointer
        // dan background berubah saat hover sebagai affordance
        //
        // TODO: konfirmasi apakah semua column sortable atau hanya beberapa
        cursor:         'pointer',
        hasHoverState:  true,
      },

    },
  },

  // ─── Table Body Row ─────────────────────────────────────────────────────────
  //
  // Selector: .erp-td
  //
  // spec:
  //   min-height  : 40px        ← TODO: verify dengan Figma
  //   padding     : 6px 16px 6px 8px
  //   font-size   : 14px
  //   font-weight : 400 (regular)
  //   border-bot  : 1px solid var(--mp-border-default)
  //   white-space : nowrap (konten tidak wrap)

  row: {
    minHeight:    '40px',         // TODO: verify dengan Figma
    padding:      '6px 16px 6px 8px',
    paddingRight: '6px 8px 6px 16px',  // right-aligned column (flipped)
    fontSize:     '14px',
    fontWeight:   '400',
    borderToken:  '--mp-border-default',
    noWrap:       true,           // white-space: nowrap

    // ── Behaviour ──────────────────────────────────────────────────────────
    behaviors: {

      hoverFeedback: {
        // setiap row memberikan visual feedback (background berubah)
        // ketika user mengarahkan mouse ke atas row tersebut
        //
        // TODO: konfirmasi apakah hover feedback ini di-require
        enabled:              true,
        hoverBackgroundToken: '--mp-background-neutral-hovered',
      },

    },
  },

  // ─── Sticky Actions Column ───────────────────────────────────────────────────
  //
  // Kolom paling kanan yang berisi action button, sticky saat scroll horizontal.
  //
  // spec:
  //   position : sticky, right: 0
  //   separator: inset box-shadow kiri (visual pemisah dari konten yang ter-scroll)

  actionsColumn: {

    // ── Behaviour ──────────────────────────────────────────────────────────
    behaviors: {

      stickyOnHorizontalScroll: {
        // kolom actions akan tetap terlihat di sisi kanan
        // meskipun user scroll tabel ke kiri/kanan
        //
        // TODO: konfirmasi apakah ini requirement atau optional
        enabled:                  true,
        position:                 'sticky',
        right:                    '0',
        hasShadowSeparator:       true,   // inset box-shadow kiri
        tableMinWidth:            'max-content',  // syarat horizontal overflow
      },

    },
  },

} as const
