/**
 * Design tests for ErpFilterBar
 * Spec source: docs/patterns/specs/ErpFilterBar.spec.ts
 *
 * Run: npx vitest run tests/design/ErpFilterBar.design.spec.ts
 * Trigger: when app/components/patterns/ErpFilterBar.vue changes
 */

import { describe, it, expect } from 'vitest'
import { extractStyles } from './utils/css-parser'
import { ErpFilterBarSpec } from '../../docs/patterns/specs/ErpFilterBar.spec'

const styles = extractStyles('app/components/patterns/ErpFilterBar.vue')

describe('ErpFilterBar (.erp-filter-bar)', () => {
  const fb = styles['.erp-filter-bar']
  const spec = ErpFilterBarSpec.container

  it('display is ' + spec.display, () => {
    expect(fb['display']).toBe(spec.display)
  })

  it('align-items is ' + spec.alignItems, () => {
    expect(fb['align-items']).toBe(spec.alignItems)
  })

  it('gap uses token ' + spec.gap, () => {
    expect(fb['gap']).toBe(spec.gap)
  })

  it('padding uses token ' + spec.padding, () => {
    expect(fb['padding']).toBe(spec.padding)
  })

  it('has border-bottom with token ' + spec.borderToken, () => {
    expect(fb['border-bottom']).toContain(spec.borderToken)
  })

  it('flex-wrap is ' + spec.behaviors.responsiveWrap.flexWrap, () => {
    expect(fb['flex-wrap']).toBe(spec.behaviors.responsiveWrap.flexWrap)
  })
})
