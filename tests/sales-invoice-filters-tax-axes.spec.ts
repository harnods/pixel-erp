// @vitest-environment happy-dom
/**
 * SalesInvoiceFiltersDrawer — the two tax status filter groups (Sales invoices ▸
 * All filters).
 *
 * rule/efaktur-status-axes: "Tax document status" (the faktur's own kode status,
 * PER-11/PJ/2025 Lampiran D.2.b.2) and "DJP status" (what DJP replied) are
 * separate groups. These pin what the user actually sees, because the regression
 * this guards against — Replaced/Cancelled reappearing under DJP status — is
 * invisible in the store and only shows up in the rendered checkbox list.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SalesInvoiceFiltersDrawer, { emptySalesInvoiceFilters } from '~/components/patterns/SalesInvoiceFiltersDrawer.vue'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import { DJP_STATUS_CONFIG, TAX_DOCUMENT_STATUS_LABELS, type TaxDocumentStatus, type TaxDocumentStatusValue } from '~/data/taxDocuments'

const taxDocStatusOptions = (Object.keys(TAX_DOCUMENT_STATUS_LABELS) as TaxDocumentStatusValue[])
  .map(value => ({ value, label: TAX_DOCUMENT_STATUS_LABELS[value] }))
const djpStatusOptions = (Object.keys(DJP_STATUS_CONFIG) as TaxDocumentStatus[])
  .map(value => ({ value, label: DJP_STATUS_CONFIG[value].label }))

function mountDrawer(props: Record<string, unknown> = {}) {
  return mount(SalesInvoiceFiltersDrawer, {
    props: {
      id: 'sif', isOpen: true, modelValue: emptySalesInvoiceFilters(),
      columns: [{ key: 'number', label: 'Number' }],
      statusOptions: [{ value: 'open', label: 'Open' }],
      tagOptions: [],
      taxDocStatusOptions,
      djpStatusOptions,
      ...props,
    },
    // ErpDrawer is a Nuxt auto-imported component (no import line in the SFC) and
    // it owns the body slot — without registering it the drawer renders as an
    // empty custom element and every field assertion below is vacuous.
    global: { components: { ErpDrawer }, stubs: { Teleport: true } },
  })
}

/** One field group, found by its bold field label. */
function group(wrapper: ReturnType<typeof mountDrawer>, fieldLabel: string) {
  return wrapper.findAll('.sif-field')
    .find(f => f.find('.sif-field-label').exists() && f.find('.sif-field-label').text() === fieldLabel)
}

/** Labels of the checkboxes in one field group (empty when it is collapsed). */
function groupLabels(wrapper: ReturnType<typeof mountDrawer>, fieldLabel: string): string[] {
  return group(wrapper, fieldLabel)?.findAll('.sif-check-label').map(n => n.text()) ?? []
}

/** Click a collapsible section's header open. */
async function expand(wrapper: ReturnType<typeof mountDrawer>, fieldLabel: string) {
  await group(wrapper, fieldLabel)!.find('.sif-section-head').trigger('click')
}

describe('Sales invoice filters — tax status axes', () => {
  it('renders Tax document status and DJP status as two separate groups', () => {
    const w = mountDrawer()
    const labels = w.findAll('.sif-field-label').map(n => n.text())
    expect(labels).toContain('Tax document status')
    expect(labels).toContain('DJP status')
    // Lineage before approval: what the document IS, then what DJP said about it.
    expect(labels.indexOf('Tax document status')).toBeLessThan(labels.indexOf('DJP status'))
  })

  it('DJP status offers only approval states — no Replaced / Cancelled', async () => {
    const w = mountDrawer()
    await expand(w, 'DJP status')
    const djp = groupLabels(w, 'DJP status')
    expect(djp).toEqual(['Draft', 'Processing at DJP', 'Approved by DJP', 'Rejected by DJP', 'Awaiting from buyer'])
    expect(djp).not.toContain('Replaced')
    expect(djp).not.toContain('Cancelled')
  })

  it('Tax document status offers the faktur states — and no pembetulan', async () => {
    const w = mountDrawer()
    await expand(w, 'Tax document status')
    const tax = groupLabels(w, 'Tax document status')
    expect(tax).toEqual(['Normal', 'Replacement', 'Cancellation', 'Replaced', 'Cancelled', 'Return note'])
    // PER-11/PJ/2025 D.5.f — a faktur is corrected ONLY by a pengganti.
    expect(tax.join(' ')).not.toMatch(/correction|amend/i)
  })

  it('both groups disappear when no invoice on the table has a tax document', () => {
    const w = mountDrawer({ taxDocStatusOptions: [], djpStatusOptions: [] })
    const labels = w.findAll('.sif-field-label').map(n => n.text())
    expect(labels).not.toContain('Tax document status')
    expect(labels).not.toContain('DJP status')
  })

  it('ticking a Tax document status box only touches its own axis, and Apply emits both', async () => {
    const w = mountDrawer()
    await expand(w, 'Tax document status')
    await group(w, 'Tax document status')!.findAll('.sif-check-item')[3]!.trigger('click')   // Replaced

    const applyBtn = w.findAll('button').find(b => b.text() === 'Apply')!
    await applyBtn.trigger('click')

    const emitted = w.emitted('apply')![0]![0] as ReturnType<typeof emptySalesInvoiceFilters>
    expect(emitted.taxDocStatus).toEqual(['replaced'])
    expect(emitted.djpStatus).toEqual([])
  })

  /**
   * The two tax checklists collapse; Status does not. They are the specialist
   * pair, and with Status they put 15 checkboxes in a row — this drawer has 4
   * checklist groups where every other ERP drawer has 2–3.
   */
  describe('collapsible tax sections', () => {
    it('starts collapsed, and Status stays a plain always-open list', () => {
      const w = mountDrawer()
      expect(groupLabels(w, 'Tax document status')).toEqual([])
      expect(groupLabels(w, 'DJP status')).toEqual([])
      // Status is untouched — no header to click, options visible immediately.
      expect(group(w, 'Status')!.find('.sif-section-head').exists()).toBe(false)
      expect(groupLabels(w, 'Status')).toEqual(['Open'])
    })

    it('shows how many are selected while collapsed, so an applied filter is never silent', () => {
      const w = mountDrawer({
        modelValue: { ...emptySalesInvoiceFilters(), djpStatus: ['draft', 'approved'] },
      })
      const previews = w.findAll('.sif-section-preview').map(n => n.text())
      expect(previews).toContain('2 selected')
      expect(previews).toContain('None selected')
    })

    it('opens a section that already carries a filter, so it is never hidden behind a closed header', async () => {
      const w = mountDrawer({ isOpen: false })
      // Re-open with a tax filter applied — the watcher runs on the open edge.
      await w.setProps({
        modelValue: { ...emptySalesInvoiceFilters(), taxDocStatus: ['replaced'] },
        isOpen: true,
      })
      expect(groupLabels(w, 'Tax document status')).toEqual(
        ['Normal', 'Replacement', 'Cancellation', 'Replaced', 'Cancelled', 'Return note'],
      )
      // The untouched axis stays shut.
      expect(groupLabels(w, 'DJP status')).toEqual([])
    })
  })
})
