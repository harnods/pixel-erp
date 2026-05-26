/**
 * Design tests for ErpPagination
 * Spec source: docs/patterns/specs/ErpPagination.spec.ts
 *
 * Run: npx vitest run tests/design/ErpPagination.design.spec.ts
 * Trigger: when app/components/patterns/ErpPagination.vue changes
 */

import { describe, it, expect } from 'vitest'
import { extractStyles } from './utils/css-parser'
import { ErpPaginationSpec } from '../../docs/patterns/specs/ErpPagination.spec'

const styles = extractStyles('app/components/patterns/ErpPagination.vue')

describe('ErpPagination (.erp-pagination)', () => {
  const pg = styles['.erp-pagination']
  const spec = ErpPaginationSpec.container

  it('padding is ' + spec.padding, () => {
    expect(pg['padding']).toBe(spec.padding)
  })

  it('has border-top with token ' + spec.borderToken, () => {
    expect(pg['border-top']).toContain(spec.borderToken)
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
  const spec = ErpPaginationSpec.label

  it('label font-size uses token ' + spec.fontSize, () => {
    expect(styles['.pagination-label']['font-size']).toBe(`var(${spec.fontSize})`)
  })

  it('label uses color token ' + spec.colorToken, () => {
    expect(styles['.pagination-label']['color']).toContain(spec.colorToken)
  })

  it('showing text font-size uses token ' + spec.fontSize, () => {
    expect(styles['.pagination-showing']['font-size']).toBe(`var(${spec.fontSize})`)
  })
})
