/**
 * Design tests for ErpLayout (page title bar + stage)
 * Spec source: docs/patterns/specs/ErpLayout.spec.ts
 *
 * Run: npx vitest run tests/design/ErpLayout.design.spec.ts
 * Trigger: when app/pages/index.vue changes
 */

import { describe, it, expect } from 'vitest'
import { extractStyles } from './utils/css-parser'
import { ErpLayoutSpec } from '../../docs/patterns/specs/ErpLayout.spec'

const styles = extractStyles('app/pages/index.vue')

describe('ErpLayout — page title bar (.page-title-bar)', () => {
  const bar = styles['.page-title-bar']
  const spec = ErpLayoutSpec.pageTitleBar

  it('padding uses token ' + spec.padding, () => {
    expect(bar['padding']).toBe(spec.padding)
  })

  it('background uses token ' + spec.backgroundToken, () => {
    expect(bar['background']).toContain(spec.backgroundToken)
  })
})

describe('ErpLayout — page title text (.page-title-text)', () => {
  const text = styles['.page-title-text']
  const spec = ErpLayoutSpec.pageTitleBar.title

  it('font-size uses token ' + spec.fontSize, () => {
    expect(text['font-size']).toBe(`var(${spec.fontSize})`)
  })

  it('font-weight uses token ' + spec.fontWeight, () => {
    expect(text['font-weight']).toBe(`var(${spec.fontWeight})`)
  })
})

describe('ErpLayout — stage (.stage)', () => {
  const stage = styles['.stage']
  const spec = ErpLayoutSpec.stage

  it('padding is always ' + spec.padding, () => {
    expect(stage['padding']).toBe(spec.padding)
  })

  it('background uses token ' + spec.backgroundToken, () => {
    expect(stage['background']).toContain(spec.backgroundToken)
  })

  it('border-radius uses tokens ' + spec.borderRadius, () => {
    expect(stage['border-radius']).toBe(spec.borderRadius)
  })
})
