// @vitest-environment happy-dom
/**
 * Put-away's serial list is a fixed, already-received fact — the (-) button
 * and Reset count don't delete that fact, but they DO hide the row from the
 * table (bin assignment cleared too) until the operator scans that serial's
 * barcode again, at which point it reappears so they can redo the assignment.
 * Reset count is exactly this, applied to every row at once.
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ManageSerialDrawer from '~/components/patterns/ManageSerialDrawer.vue'
import '~/data/outgoing'

const WAREHOUSE_ID = 'wh-006'
const SKU = '2004'
const BINS = ['Rak-01', 'Rak-02', 'Rak-03']

function mountDrawer(props: Record<string, unknown>) {
  return mount(ManageSerialDrawer, {
    props: {
      open: true, sku: SKU, warehouseId: WAREHOUSE_ID, targetCount: 3,
      kind: 'put-away', destLocationPaths: BINS,
      modelValue: [
        { serial: 'SN-A', destLocationId: 'Rak-01' },
        { serial: 'SN-B', destLocationId: 'Rak-02' },
        { serial: 'SN-C' },
      ],
      ...props,
    },
  })
}

function resetButton(wrapper: ReturnType<typeof mount>) {
  return Array.from(wrapper.findAll('button')).find(b => b.text() === 'Reset count')!
}

function saveButton(wrapper: ReturnType<typeof mount>) {
  return Array.from(wrapper.findAll('button')).find(b => b.text().startsWith('Save'))!
}

function findRow(wrapper: ReturnType<typeof mount>, serial: string) {
  return wrapper.findAll('.msn-tr').find(r => r.text().includes(serial))
}

async function scan(wrapper: ReturnType<typeof mount>, value: string) {
  const input = wrapper.find('.scan-bar-input')
  await input.setValue(value)
  await input.trigger('keydown.enter')
  await flushPromises()
}

describe('ManageSerialDrawer — put-away (-) remove and Reset count', () => {
  it('reopening the drawer shows every serial, including already-saved bin assignments (seeding path untouched)', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    expect(findRow(wrapper, 'SN-A')).toBeTruthy()
    expect(findRow(wrapper, 'SN-B')).toBeTruthy()
    expect(findRow(wrapper, 'SN-C')).toBeTruthy()
    expect(wrapper.text()).toContain('Assigned')
    expect(wrapper.text()).toContain('Unassigned') // SN-C, not yet assigned
    wrapper.unmount()
  })

  it('clicking (-) removes only that row from the table, leaving the others untouched', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    const rowA = findRow(wrapper, 'SN-A')!
    await rowA.find('.msn-toggle-btn--remove').trigger('click')
    await flushPromises()

    expect(findRow(wrapper, 'SN-A')).toBeFalsy() // gone from the table
    expect(findRow(wrapper, 'SN-B')).toBeTruthy() // untouched
    expect(findRow(wrapper, 'SN-C')).toBeTruthy()
    wrapper.unmount()
  })

  it('scanning the removed serial\'s barcode without an active bin is rejected, row stays hidden', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await findRow(wrapper, 'SN-A')!.find('.msn-toggle-btn--remove').trigger('click')
    await flushPromises()
    expect(findRow(wrapper, 'SN-A')).toBeFalsy()

    await scan(wrapper, 'SN-A') // no bin scanned yet

    expect(findRow(wrapper, 'SN-A')).toBeFalsy()
    wrapper.unmount()
  })

  it('scanning a bin then the removed serial\'s barcode brings its row back, assigned to that bin', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await findRow(wrapper, 'SN-A')!.find('.msn-toggle-btn--remove').trigger('click')
    await flushPromises()
    expect(findRow(wrapper, 'SN-A')).toBeFalsy()

    await scan(wrapper, 'Rak-03')
    await scan(wrapper, 'SN-A')

    const rowA = findRow(wrapper, 'SN-A')
    expect(rowA).toBeTruthy()
    expect(rowA!.text()).toContain('Assigned') // auto-assigned to the active bin
    wrapper.unmount()
  })

  it('removing every row shows the "no serial numbers to assign" empty state, not the search-empty or reserved-empty message', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    for (const serial of ['SN-A', 'SN-B', 'SN-C']) {
      await findRow(wrapper, serial)!.find('.msn-toggle-btn--remove').trigger('click')
      await flushPromises()
    }

    expect(wrapper.text()).toContain('No serial numbers to assign')
    expect(wrapper.text()).toContain('Scan a barcode to bring one back')
    wrapper.unmount()
  })

  it('Reset count removes every row from the table at once (same effect as clicking (-) on each)', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await resetButton(wrapper).trigger('click')
    await flushPromises()

    expect(findRow(wrapper, 'SN-A')).toBeFalsy()
    expect(findRow(wrapper, 'SN-B')).toBeFalsy()
    expect(findRow(wrapper, 'SN-C')).toBeFalsy()
    expect(wrapper.text()).toContain('No serial numbers to assign')
    wrapper.unmount()
  })

  it('after Reset count, scanning a bin then each serial brings it back one at a time, freshly assigned', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await resetButton(wrapper).trigger('click')
    await flushPromises()

    await scan(wrapper, 'Rak-02')
    await scan(wrapper, 'SN-A')
    expect(findRow(wrapper, 'SN-A')).toBeTruthy()
    expect(findRow(wrapper, 'SN-B')).toBeFalsy() // still hidden — only SN-A was rescanned

    const rowA = findRow(wrapper, 'SN-A')!
    expect(rowA.text()).toContain('Assigned') // Rak-01's old assignment was cleared by Reset, now assigned to Rak-02
    wrapper.unmount()
  })

  it('Reset count, then Save closes the drawer instead of being blocked — removed rows are a deliberate deferral, not a missing-bin error', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await resetButton(wrapper).trigger('click')
    await flushPromises()

    await saveButton(wrapper).trigger('click')
    await flushPromises()
    // handleSave awaits a fake 600ms save delay before emitting.
    await new Promise(r => setTimeout(r, 700))

    expect(wrapper.text()).not.toContain("don't have a destination bin assigned")
    expect(wrapper.emitted('update:open')).toBeTruthy()
    expect(wrapper.emitted('update:open')![0]).toEqual([false])
    const saved = wrapper.emitted('save')![0]![0] as Array<{ serial: string; destLocationId?: string }>
    expect(saved.find(s => s.serial === 'SN-A')?.destLocationId).toBeUndefined()
    wrapper.unmount()
  })

  it('a visible (not removed) unassigned row still blocks Save — only explicitly removed rows are exempt', async () => {
    // SN-C starts Unassigned (no destLocationId) and is never removed here.
    const wrapper = mountDrawer({})
    await flushPromises()

    await saveButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain("don't have a destination bin assigned")
    expect(wrapper.emitted('update:open')).toBeFalsy()
    wrapper.unmount()
  })

  it('other modes are unaffected — no put-away-only remove button, Reset count still fully re-seeds from props', async () => {
    const wrapper = mount(ManageSerialDrawer, {
      props: {
        open: true, sku: SKU, warehouseId: WAREHOUSE_ID, targetCount: 1,
        kind: 'count', modelValue: [],
      },
    })
    await flushPromises()

    expect(wrapper.find('[aria-label="Remove from list"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
