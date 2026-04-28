/**
 * Design tests for ErpFilterBar
 * Spec source: docs/patterns/ErpFilterBar.md
 *
 * Run: npx vitest run tests/design/ErpFilterBar.design.spec.ts
 * Trigger: when app/components/patterns/ErpFilterBar.vue changes
 */

import { describe, it, expect } from 'vitest'
import { extractStyles } from './utils/css-parser'

const styles = extractStyles('app/components/patterns/ErpFilterBar.vue')

describe('ErpFilterBar (.erp-filter-bar)', () => {
  const fb = styles['.erp-filter-bar']

  it('display is flex', () => {
    expect(fb['display']).toBe('flex')
  })

  it('align-items is center', () => {
    expect(fb['align-items']).toBe('center')
  })

  it('gap is 8px', () => {
    expect(fb['gap']).toBe('8px')
  })

  it('padding is 12px 16px', () => {
    expect(fb['padding']).toBe('12px 16px')
  })

  it('has border-bottom', () => {
    expect(fb['border-bottom']).toBeDefined()
    expect(fb['border-bottom']).toContain('1px solid')
  })

  it('flex-wrap is wrap (supports multiple rows of filters)', () => {
    expect(fb['flex-wrap']).toBe('wrap')
  })
})
