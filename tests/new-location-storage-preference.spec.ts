/**
 * New / Edit location drawer — Storage preference is the standard MpRadio title +
 * caption list (same pattern as EditClassificationModal), not hand-rolled
 * bordered button-cards with a selected fill.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getStorageTree, addRootLocation, addSubLocation } from '~/data/storageLocations'
import '~/data/warehouseDetails'

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

describe('NewLocationDrawer — shell & fields', () => {
  it('uses the shared ErpDrawer Teleport shell, not Pixel MpDrawer (rule/drawer-custom-shell)', () => {
    expect(src).toMatch(/<ErpDrawer[\s>]/)
    expect(src).not.toMatch(/<MpDrawer/)
  })

  it('description is a Pixel MpTextarea, not a raw <textarea>', () => {
    expect(src).toMatch(/<MpTextarea[\s\S]*?v-model="description"/)
    expect(src).not.toMatch(/<textarea/)
  })

  it('description is passed on create as well as edit', () => {
    expect(src).toMatch(/const data = \{[^}]*description: description\.value\.trim\(\)/)
    expect(src).toMatch(/addSubLocation\(props\.warehouseId, props\.parentId, data\)/)
    expect(src).toMatch(/addRootLocation\(props\.warehouseId, data\)/)
  })
})

describe('storage location store — description on create', () => {
  it('addRootLocation and addSubLocation keep the description', () => {
    addRootLocation('wh-001', { level: 'Floor', name: 'Desc Root', type: 'Organizational', description: 'Top notes' })
    const root = getStorageTree('wh-001').find((n) => n.name === 'Desc Root')!
    expect(root.description).toBe('Top notes')
    addSubLocation('wh-001', root.id, { level: 'Bin', name: 'Desc Child', type: 'Storage', description: 'Child notes' })
    expect(root.children.find((n) => n.name === 'Desc Child')?.description).toBe('Child notes')
  })
})
