/**
 * Design tests for ErpPagination
 * Spec source: docs/patterns/ErpPagination.md
 *
 * Run: npx vitest run tests/design/ErpPagination.design.spec.ts
 * Trigger: when app/components/patterns/ErpPagination.vue changes
 */

import { describe, it, expect } from 'vitest'
import { extractStyles } from './utils/css-parser'

const styles = extractStyles('app/components/patterns/ErpPagination.vue')

describe('ErpPagination (.erp-pagination)', () => {
  const pg = styles['.erp-pagination']

  it('padding is 8px 16px', () => {
    expect(pg['padding']).toBe('8px 16px')
  })

  it('has border-top with --mp-border-default token', () => {
    expect(pg['border-top']).toContain('--mp-border-default')
  })

  it('display is flex', () => {
    expect(pg['display']).toBe('flex')
  })

  it('align-items is center', () => {
    expect(pg['align-items']).toBe('center')
  })

  it('justify-content is space-between', () => {
    expect(pg['justify-content']).toBe('space-between')
  })
})

describe('ErpPagination — label text (.pagination-label, .pagination-showing)', () => {
  it('label font-size is 13px', () => {
    expect(styles['.pagination-label']['font-size']).toBe('13px')
  })

  it('label uses --mp-text-secondary token', () => {
    expect(styles['.pagination-label']['color']).toContain('--mp-text-secondary')
  })

  it('showing text font-size is 13px', () => {
    expect(styles['.pagination-showing']['font-size']).toBe('13px')
  })
})
