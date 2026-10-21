/**
 * New / Edit location drawer — Storage preference is the standard MpRadio title +
 * caption list (same pattern as EditClassificationModal), not hand-rolled
 * bordered button-cards with a selected fill.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync(join(process.cwd(), 'app/components/patterns/NewLocationDrawer.vue'), 'utf8')

describe('NewLocationDrawer — storage preference', () => {
  it('renders each option as an MpRadio bound to the location type', () => {
    expect(src).toMatch(/<MpRadio[\s\S]*?name="nl-type"[\s\S]*?:is-checked="type === opt\.value"/)
    expect(src).toMatch(/class="nl-type-caption"/)
  })

  it('offers Organizational and Storage', () => {
    expect(src).toMatch(/value: 'Organizational'/)
    expect(src).toMatch(/value: 'Storage'/)
  })

  it('no longer uses button-cards for the choice', () => {
    expect(src).not.toMatch(/nl-type-card/)
  })
})
