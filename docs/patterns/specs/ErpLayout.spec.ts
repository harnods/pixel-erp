/**
 * ErpLayout Design Spec
 *
 * Source of truth untuk layout shell: page title bar dan stage.
 *
 * Setelah selesai, jalankan: npm run test:all
 */

export const ErpLayoutSpec = {

  // ─── Page Title Bar ──────────────────────────────────────────────────────────
  //
  // Selector: .page-title-bar
  //
  // spec:
  //   height      : 72px                    ← custom, not in token scale
  //   padding     : 0 var(--mp-spacing-6)   = 0 24px
  //   background  : var(--mp-background-neutral-subtle)
  //   font-size   : var(--mp-font-sizes-2xl)  = 24px
  //   font-weight : var(--mp-font-weights-semi-bold)  = 600
  //   line-height : 32px                    ← custom, px not a ratio token
  //   letter-spacing: -0.2px               ← custom, token letter-spacing are em-based

  pageTitleBar: {
    height:          '72px',              // custom
    padding:         '0 var(--mp-spacing-6)',
    backgroundToken: '--mp-background-neutral-subtle',

    title: {
      fontSize:      '--mp-font-sizes-2xl',
      fontWeight:    '--mp-font-weights-semi-bold',
      lineHeight:    '32px',              // custom
      letterSpacing: '-0.2px',           // custom
    },
  },

  // ─── Stage ───────────────────────────────────────────────────────────────────
  //
  // Selector: .stage
  //
  // spec:
  //   padding       : var(--mp-spacing-6)   = 24px  ← always, all page types
  //   background    : var(--mp-background-stage)
  //   border-radius : var(--mp-radii-xl) var(--mp-radii-xl) 0 0  = 12px 12px 0 0

  stage: {
    padding:         'var(--mp-spacing-6)',
    backgroundToken: '--mp-background-stage',
    borderRadius:    'var(--mp-radii-xl) var(--mp-radii-xl) 0 0',
  },

} as const
