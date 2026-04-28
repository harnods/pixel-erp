/**
 * Design tests for ErpTablePage
 * Spec source: docs/patterns/ErpTablePage.md
 *
 * Run: npx vitest run tests/design/ErpTablePage.design.spec.ts
 * Trigger: when app/components/patterns/ErpTablePage.vue changes
 */

import { describe, it, expect } from 'vitest'
import { extractStyles } from './utils/css-parser'

const styles = extractStyles('app/components/patterns/ErpTablePage.vue')

// ─── Table header ─────────────────────────────────────────────────────────────

describe('ErpTablePage — table header (.erp-th)', () => {
  const th = styles['.erp-th']

  it('height is 28px', () => {
    expect(th['height']).toBe('28px')
  })

  it('font-size is 12px', () => {
    expect(th['font-size']).toBe('12px')
  })

  it('font-weight is 600 (semiBold)', () => {
    expect(th['font-weight']).toBe('600')
  })

  it('text-transform is uppercase', () => {
    expect(th['text-transform']).toBe('uppercase')
  })

  it('padding is 4px 16px 4px 8px (left-col Figma spec)', () => {
    expect(th['padding']).toBe('4px 16px 4px 8px')
  })

  it('background uses --mp-background-neutral-subtle token', () => {
    expect(th['background']).toContain('--mp-background-neutral-subtle')
  })

  it('border-bottom uses --mp-border-default token', () => {
    expect(th['border-bottom']).toContain('--mp-border-default')
  })
})

// ─── Table body rows ──────────────────────────────────────────────────────────

describe('ErpTablePage — table body cell (.erp-td)', () => {
  const td = styles['.erp-td']

  it('height is 40px', () => {
    expect(td['height']).toBe('40px')
  })

  it('font-size is 14px', () => {
    expect(td['font-size']).toBe('14px')
  })

  it('font-weight is 400 (regular)', () => {
    expect(td['font-weight']).toBe('400')
  })

  it('padding is 6px 16px 6px 8px (left-col Figma spec)', () => {
    expect(td['padding']).toBe('6px 16px 6px 8px')
  })
})

// ─── Right-aligned variants ───────────────────────────────────────────────────

describe('ErpTablePage — right-aligned header (.erp-th--right)', () => {
  const thRight = styles['.erp-th--right']

  it('text-align is right', () => {
    expect(thRight['text-align']).toBe('right')
  })

  it('padding flips to 4px 8px 4px 16px (right-col Figma spec)', () => {
    expect(thRight['padding']).toBe('4px 8px 4px 16px')
  })
})

describe('ErpTablePage — right-aligned cell (.erp-td--right)', () => {
  const tdRight = styles['.erp-td--right']

  it('text-align is right', () => {
    expect(tdRight['text-align']).toBe('right')
  })

  it('padding flips to 6px 8px 6px 16px', () => {
    expect(tdRight['padding']).toBe('6px 8px 6px 16px')
  })
})

// ─── Filter bar (inside ErpTablePage) ────────────────────────────────────────

describe('ErpTablePage — internal filter bar (.erp-filter-bar)', () => {
  const fb = styles['.erp-filter-bar']

  it('padding is 12px 16px', () => {
    expect(fb['padding']).toBe('12px 16px')
  })

  it('gap is 8px', () => {
    expect(fb['gap']).toBe('8px')
  })

  it('border-bottom uses --mp-border-default token', () => {
    expect(fb['border-bottom']).toContain('--mp-border-default')
  })
})

// ─── Sticky actions column ────────────────────────────────────────────────────

describe('ErpTablePage — actions column (.erp-th--actions, .erp-td--actions)', () => {
  it('actions header width is 44px', () => {
    expect(styles['.erp-th--actions']['width']).toBe('44px')
  })

  it('actions cell width is 44px', () => {
    expect(styles['.erp-td--actions']['width']).toBe('44px')
  })
})
