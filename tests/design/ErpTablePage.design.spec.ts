/**
 * Design tests for ErpTablePage
 * Spec source: docs/patterns/specs/ErpTablePage.spec.ts
 *
 * Run: npx vitest run tests/design/ErpTablePage.design.spec.ts
 * Trigger: when app/components/patterns/ErpTablePage.vue changes
 */

import { describe, it, expect } from 'vitest'
import { extractStyles } from './utils/css-parser'
import { ErpTablePageSpec } from '../../docs/patterns/specs/ErpTablePage.spec'

const styles = extractStyles('app/components/patterns/ErpTablePage.vue')

// ─── Table header ─────────────────────────────────────────────────────────────

describe('ErpTablePage — table header (.erp-th)', () => {
  const th = styles['.erp-th']
  const spec = ErpTablePageSpec.header

  it('height uses token ' + spec.minHeight, () => {
    expect(th['height']).toBe(spec.minHeight)
  })

  it('font-size uses token ' + spec.fontSize, () => {
    expect(th['font-size']).toBe(`var(${spec.fontSize})`)
  })

  it('font-weight uses token ' + spec.fontWeight, () => {
    expect(th['font-weight']).toBe(`var(${spec.fontWeight})`)
  })

  it('letter-spacing uses token ' + spec.letterSpacing, () => {
    expect(th['letter-spacing']).toBe(`var(${spec.letterSpacing})`)
  })

  it('text-transform is ' + spec.textTransform, () => {
    expect(th['text-transform']).toBe(spec.textTransform)
  })

  it('padding uses tokens ' + spec.padding, () => {
    expect(th['padding']).toBe(spec.padding)
  })

  it('background uses token ' + spec.backgroundToken, () => {
    expect(th['background']).toContain(spec.backgroundToken)
  })

  it('border-bottom uses token ' + spec.borderToken, () => {
    expect(th['border-bottom']).toContain(spec.borderToken)
  })
})

// ─── Table body rows ──────────────────────────────────────────────────────────

describe('ErpTablePage — table body cell (.erp-td)', () => {
  const td = styles['.erp-td']
  const spec = ErpTablePageSpec.row

  it('height uses token ' + spec.minHeight, () => {
    expect(td['height']).toBe(spec.minHeight)
  })

  it('font-size uses token ' + spec.fontSize, () => {
    expect(td['font-size']).toBe(`var(${spec.fontSize})`)
  })

  it('font-weight uses token ' + spec.fontWeight, () => {
    expect(td['font-weight']).toBe(`var(${spec.fontWeight})`)
  })

  it('padding uses tokens ' + spec.padding, () => {
    expect(td['padding']).toBe(spec.padding)
  })
})

// ─── Right-aligned variants ───────────────────────────────────────────────────

describe('ErpTablePage — right-aligned header (.erp-th--right)', () => {
  const thRight = styles['.erp-th--right']

  it('text-align is right', () => {
    expect(thRight['text-align']).toBe('right')
  })

  it('padding uses tokens ' + ErpTablePageSpec.header.paddingRight, () => {
    expect(thRight['padding']).toBe(ErpTablePageSpec.header.paddingRight)
  })
})

describe('ErpTablePage — right-aligned cell (.erp-td--right)', () => {
  const tdRight = styles['.erp-td--right']

  it('text-align is right', () => {
    expect(tdRight['text-align']).toBe('right')
  })

  it('padding uses tokens ' + ErpTablePageSpec.row.paddingRight, () => {
    expect(tdRight['padding']).toBe(ErpTablePageSpec.row.paddingRight)
  })
})

// ─── Filter bar (inside ErpTablePage) ────────────────────────────────────────

describe('ErpTablePage — internal filter bar (.erp-filter-bar)', () => {
  const fb = styles['.erp-filter-bar']

  it('padding uses tokens var(--mp-spacing-3) var(--mp-spacing-4)', () => {
    expect(fb['padding']).toBe('var(--mp-spacing-3) var(--mp-spacing-4)')
  })

  it('gap uses token var(--mp-spacing-2)', () => {
    expect(fb['gap']).toBe('var(--mp-spacing-2)')
  })

  it('border-bottom uses --mp-border-default token', () => {
    expect(fb['border-bottom']).toContain('--mp-border-default')
  })
})

// ─── Sticky actions column ────────────────────────────────────────────────────

describe('ErpTablePage — actions column (.erp-th--actions, .erp-td--actions)', () => {
  it('actions header width uses token ' + ErpTablePageSpec.header.actionsWidth, () => {
    expect(styles['.erp-th--actions']['width']).toBe(ErpTablePageSpec.header.actionsWidth)
  })

  it('actions cell width uses token ' + ErpTablePageSpec.header.actionsWidth, () => {
    expect(styles['.erp-td--actions']['width']).toBe(ErpTablePageSpec.header.actionsWidth)
  })
})
