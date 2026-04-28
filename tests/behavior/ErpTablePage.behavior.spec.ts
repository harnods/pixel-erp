/**
 * UX Behaviour tests for ErpTablePage
 *
 * Strategy: behaviours driven by pure CSS are verified via CSS contract.
 * If the CSS contract is satisfied, the browser guarantees the behaviour —
 * no browser launch needed.
 *
 * Behaviours that require JavaScript (sort click, checkbox, pagination)
 * are out of scope here — those need @vue/test-utils.
 *
 * Run: npx vitest run tests/behavior/ErpTablePage.behavior.spec.ts
 * Trigger: when app/components/patterns/ErpTablePage.vue changes
 */

import { describe, it, expect } from 'vitest'
import { extractStyles } from '../design/utils/css-parser'

const styles = extractStyles('app/components/patterns/ErpTablePage.vue')

// ─── Sticky header on scroll ──────────────────────────────────────────────────
//
// Requirement: table header stays pinned to the top of the scroll container
// when the user scrolls down through rows.
//
// CSS contract for sticky to work:
//   1. Scroll container must have overflow: auto (or scroll)
//   2. thead must have position: sticky
//   3. thead must have top: 0
//   4. thead z-index must be above rows (z-index: 2 > rows z-index: 1)

describe('sticky header — pins to top when table is scrolled vertically', () => {
  it('scroll container (.erp-table-wrapper) has overflow: auto', () => {
    expect(styles['.erp-table-wrapper']['overflow']).toBe('auto')
  })

  it('thead has position: sticky', () => {
    expect(styles['.erp-thead']['position']).toBe('sticky')
  })

  it('thead top is 0 — pinned to top of scroll container', () => {
    expect(styles['.erp-thead']['top']).toBe('0')
  })

  it('thead z-index is above body rows so header is not obscured', () => {
    expect(parseInt(styles['.erp-thead']['z-index'])).toBeGreaterThan(1)
  })
})

// ─── Sticky actions column on horizontal scroll ───────────────────────────────
//
// Requirement: the rightmost actions column stays pinned to the right edge
// when the user scrolls the table horizontally.
//
// CSS contract:
//   1. Table must be wider than its container (min-width: max-content)
//   2. th--fixed must have position: sticky + right: 0
//   3. td--fixed must have position: sticky + right: 0
//   4. Fixed column must have inset box-shadow to visually indicate separation

describe('sticky actions column — pins to right edge on horizontal scroll', () => {
  it('table has min-width: max-content so horizontal scroll is triggered', () => {
    expect(styles['.erp-table']['min-width']).toBe('max-content')
  })

  it('sticky header cell (.erp-th--fixed) has position: sticky', () => {
    expect(styles['.erp-th--fixed']['position']).toBe('sticky')
  })

  it('sticky header cell is anchored to right: 0', () => {
    expect(styles['.erp-th--fixed']['right']).toBe('0')
  })

  it('sticky header cell z-index is highest (above body sticky cells)', () => {
    const thFixedZ = parseInt(styles['.erp-th--fixed']['z-index'])
    const tdFixedZ = parseInt(styles['.erp-td--fixed']['z-index'])
    expect(thFixedZ).toBeGreaterThan(tdFixedZ)
  })

  it('sticky body cell (.erp-td--fixed) has position: sticky', () => {
    expect(styles['.erp-td--fixed']['position']).toBe('sticky')
  })

  it('sticky body cell is anchored to right: 0', () => {
    expect(styles['.erp-td--fixed']['right']).toBe('0')
  })

  it('sticky body cell has inset box-shadow to visually separate from scrolled content', () => {
    expect(styles['.erp-td--fixed']['box-shadow']).toContain('inset')
  })
})

// ─── Row hover feedback ───────────────────────────────────────────────────────
//
// Requirement: hovering a row gives visual feedback by changing the
// background color of its cells.

describe('row hover feedback — visual change on mouse over', () => {
  it('hovered row cells get a different background token', () => {
    const hoverRule = styles['.erp-tr:hover .erp-td']
    expect(hoverRule).toBeDefined()
    expect(hoverRule['background']).toContain('--mp-background-neutral-hovered')
  })
})

// ─── Sortable header affordance ───────────────────────────────────────────────
//
// Requirement: sortable column headers must look clickable.

describe('sortable header affordance — cursor indicates clickability', () => {
  it('sortable header has cursor: pointer', () => {
    expect(styles['.erp-th--sortable']['cursor']).toBe('pointer')
  })

  it('sortable header shows hover background change', () => {
    const hoverRule = styles['.erp-th--sortable:hover']
    expect(hoverRule).toBeDefined()
    expect(hoverRule['background']).toBeDefined()
  })
})

// ─── Text overflow — no wrapping ──────────────────────────────────────────────
//
// Requirement: cell content must not wrap to multiple lines —
// row height must stay consistent regardless of content length.

describe('cell overflow — content never wraps', () => {
  it('header cell has white-space: nowrap', () => {
    expect(styles['.erp-th']['white-space']).toBe('nowrap')
  })

  it('body cell has white-space: nowrap', () => {
    expect(styles['.erp-td']['white-space']).toBe('nowrap')
  })
})
