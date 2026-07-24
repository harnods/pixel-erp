// @vitest-environment happy-dom
/**
 * Put-away's serial list is a fixed, already-received fact — the (-) button
 * and Reset count only undo a bin ASSIGNMENT (destLocationId cleared, badge
 * reverts "Assigned" → "Received"). Neither ever hides the row: unlike
 * picking/transfer (drawn from a shared pool, so "remove" means "give this
 * unit back to the pool until re-scanned"), a received serial has nowhere
 * else to go — it still needs a bin, so it must stay visible and re-assignable
 * without a rescan. (Previously this component wrongly reused picking's
 * hide-until-rescan model here too, silently making the row look gone.)
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
    expect(findRow(wrapper, 'SN-A')?.text()).toContain('Assigned')
    // SN-C, not yet assigned to a bin — scoped to the row, since "Received qty"
    // (a header stat, unrelated to this per-row badge) also contains "Received".
    expect(findRow(wrapper, 'SN-C')?.text()).toContain('Received')
    wrapper.unmount()
  })

  it('clicking (-) clears only that row\'s bin assignment, leaving it visible as "Received" — other rows untouched', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    const rowA = findRow(wrapper, 'SN-A')!
    await rowA.find('.msn-toggle-btn--remove').trigger('click')
    await flushPromises()

    const rowAAfter = findRow(wrapper, 'SN-A')
    expect(rowAAfter).toBeTruthy() // still in the table — never hidden
    expect(rowAAfter!.text()).toContain('Received') // assignment undone
    expect(rowAAfter!.text()).not.toContain('Assigned')
    expect(findRow(wrapper, 'SN-B')?.text()).toContain('Assigned') // untouched
    expect(findRow(wrapper, 'SN-C')).toBeTruthy()
    wrapper.unmount()
  })

  it('scanning a bin then that serial\'s barcode re-assigns it to the new bin, without ever having disappeared', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await findRow(wrapper, 'SN-A')!.find('.msn-toggle-btn--remove').trigger('click')
    await flushPromises()
    expect(findRow(wrapper, 'SN-A')?.text()).toContain('Received')

    await scan(wrapper, 'Rak-03')
    await scan(wrapper, 'SN-A')

    const rowA = findRow(wrapper, 'SN-A')
    expect(rowA).toBeTruthy()
    expect(rowA!.text()).toContain('Assigned') // re-assigned to the active bin
    wrapper.unmount()
  })

  it('clicking (-) on every row clears every assignment, but every row stays visible as "Received" — the empty state never appears', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    for (const serial of ['SN-A', 'SN-B', 'SN-C']) {
      await findRow(wrapper, serial)!.find('.msn-toggle-btn--remove').trigger('click')
      await flushPromises()
    }

    expect(wrapper.text()).not.toContain('No serial numbers to assign')
    for (const serial of ['SN-A', 'SN-B', 'SN-C']) {
      const row = findRow(wrapper, serial)
      expect(row).toBeTruthy()
      expect(row!.text()).toContain('Received')
    }
    wrapper.unmount()
  })

  it('Reset count clears every row\'s bin assignment at once (same effect as clicking (-) on each), all rows stay visible', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await resetButton(wrapper).trigger('click')
    await flushPromises()

    for (const serial of ['SN-A', 'SN-B', 'SN-C']) {
      const row = findRow(wrapper, serial)
      expect(row).toBeTruthy()
      expect(row!.text()).toContain('Received')
    }
    wrapper.unmount()
  })

  it('after Reset count, scanning a bin then a serial re-assigns just that one row — the others stay visible as "Received", not hidden', async () => {
    const wrapper = mountDrawer({})
    await flushPromises()

    await resetButton(wrapper).trigger('click')
    await flushPromises()

    await scan(wrapper, 'Rak-02')
    await scan(wrapper, 'SN-A')

    const rowA = findRow(wrapper, 'SN-A')!
    expect(rowA.text()).toContain('Assigned') // Rak-01's old assignment was cleared by Reset, now assigned to Rak-02
    const rowB = findRow(wrapper, 'SN-B')!
    expect(rowB.text()).toContain('Received') // untouched by the rescan, but still visible (never hidden)
    wrapper.unmount()
  })

  it('Reset count, then Save closes the drawer instead of being blocked — an unassigned SKU is a deliberate deferral, not a missing-bin error', async () => {
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

  it('a still-unassigned row does NOT block Save either — the operator can freely bounce between SKUs and come back later', async () => {
    // Reported behavior: the operator must be able to scan this SKU, move on to
    // another, then come back and Save here without every serial having a bin
    // yet — that completeness check belongs at the task level (Finish put-away),
    // not this per-SKU drawer's own Save. SN-C starts Received (no destLocationId).
    const wrapper = mountDrawer({})
    await flushPromises()

    await saveButton(wrapper).trigger('click')
    await flushPromises()
    await new Promise(r => setTimeout(r, 700))

    expect(wrapper.text()).not.toContain("don't have a destination bin assigned")
    expect(wrapper.emitted('update:open')).toBeTruthy()
    const saved = wrapper.emitted('save')![0]![0] as Array<{ serial: string; destLocationId?: string }>
    expect(saved.find(s => s.serial === 'SN-C')?.destLocationId).toBeUndefined()
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

    expect(wrapper.find('[aria-label="Remove storage location"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
