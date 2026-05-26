/**
 * ErpTablePage Design Spec
 *
 * Pre-filled dari CSS yang sudah ada — review dan koreksi sesuai Figma.
 *
 * Setelah selesai, jalankan: npm run test:all
 */

export const ErpTablePageSpec = {

  // ─── Table Header ───────────────────────────────────────────────────────────
  //
  // Selector: .erp-th
  //
  // spec:
  //   height      : var(--mp-sizes-7)        = 28px
  //   padding     : spacing-1 spacing-4 spacing-1 spacing-2  (4px 16px 4px 8px)
  //   font-size   : var(--mp-font-sizes-sm)  = 12px
  //   font-weight : var(--mp-font-weights-semi-bold)  = 600
  //   text-transform: uppercase
  //   letter-spacing: var(--mp-letter-spacings-normal) = 0
  //   border-bot  : 1px solid var(--mp-border-default)
  //   background  : var(--mp-background-neutral-subtle)

  header: {
    minHeight:       'var(--mp-sizes-7)',
    maxHeight:       'var(--mp-sizes-7)',
    padding:         'var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2)',
    paddingRight:    'var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4)',
    fontSize:        '--mp-font-sizes-sm',
    fontWeight:      '--mp-font-weights-semi-bold',
    textTransform:   'uppercase',
    letterSpacing:   '--mp-letter-spacings-normal',
    backgroundToken: '--mp-background-neutral-subtle',
    borderToken:     '--mp-border-default',

    // Checkbox column
    checkboxWidth:   'var(--mp-sizes-9)',

    // Actions column (sticky right, no label)
    actionsWidth:    'var(--mp-sizes-11)',

    // ── Behaviour ──────────────────────────────────────────────────────────
    behaviors: {

      stickyOnScroll: {
        // table header akan sticky ketika di-scroll dan posisinya
        // tetap di y=0 browser (tidak ikut scroll ke atas)
        enabled:    true,
        position:   'sticky',
        top:        '0',
        zIndex:     2,
        scrollContainerOverflow: 'auto',
      },

      sortable: {
        // column header yang sortable menampilkan cursor pointer
        // dan background berubah saat hover sebagai affordance
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
  //   height      : var(--mp-sizes-10)       = 40px
  //   padding     : spacing-1.5 spacing-4 spacing-1.5 spacing-2  (6px 16px 6px 8px)
  //   font-size   : var(--mp-font-sizes-md)  = 14px
  //   font-weight : var(--mp-font-weights-regular)  = 400
  //   border-bot  : 1px solid var(--mp-border-default)
  //   white-space : nowrap

  row: {
    minHeight:    'var(--mp-sizes-10)',
    padding:      'var(--mp-spacing-1\\.5) var(--mp-spacing-4) var(--mp-spacing-1\\.5) var(--mp-spacing-2)',
    paddingRight: 'var(--mp-spacing-1\\.5) var(--mp-spacing-2) var(--mp-spacing-1\\.5) var(--mp-spacing-4)',
    fontSize:     '--mp-font-sizes-md',
    fontWeight:   '--mp-font-weights-regular',
    borderToken:  '--mp-border-default',
    noWrap:       true,

    // ── Behaviour ──────────────────────────────────────────────────────────
    behaviors: {

      hoverFeedback: {
        // setiap row memberikan visual feedback (background berubah)
        // ketika user mengarahkan mouse ke atas row tersebut
        enabled:              true,
        hoverBackgroundToken: '--mp-background-neutral-hovered',
      },

    },
  },

  // ─── Sticky Actions Column ───────────────────────────────────────────────────
  //
  // Kolom paling kanan yang berisi action button, sticky saat scroll horizontal.

  actionsColumn: {

    // ── Behaviour ──────────────────────────────────────────────────────────
    behaviors: {

      stickyOnHorizontalScroll: {
        enabled:                  true,
        position:                 'sticky',
        right:                    '0',
        hasShadowSeparator:       true,
        tableMinWidth:            'max-content',
      },

    },
  },

} as const
