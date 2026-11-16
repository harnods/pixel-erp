// @vitest-environment happy-dom
/**
 * Sales Invoice detail ▸ "Tax document" tab — the two status columns.
 *
 * rule/efaktur-status-axes. The column that used to read TYPE (value: Normal)
 * now reads TAX DOCUMENT STATUS — the faktur's own kode status (PER-11/PJ/2025
 * Lampiran D.2.b.2) — and sits beside DJP STATUS, which carries only DJP's reply.
 *
 * Driven by the seeded SI150 lineage (taxDocuments.ts › buildSeedTaxDocuments):
 * a Normal faktur that has been superseded, plus the Pengganti that now stands.
 * That pair is the whole point of the split — the superseded faktur is Diganti
 * on one axis and still Disetujui DJP on the other.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

/**
 * Nuxt app composables the page calls bare. Stubbed here rather than in
 * tests/setup.ts because only a full PAGE needs them — mounting a pattern
 * component does not.
 */
beforeAll(() => {
  Object.assign(globalThis, {
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, resolve: (t: unknown) => ({ href: String(t) }) }),
    useRoute: () => ({ path: '/sales-invoices/SI150', params: { id: 'SI150' }, query: {}, hash: '' }),
    useHead: () => {},
    definePageMeta: () => {},
    navigateTo: () => {},
    useState: (_k: string, f: () => unknown) => ref(f?.()),
  })
})

async function mountPage() {
  const Page = (await import('~/components/pages/SalesInvoiceDetailsPage.vue')).default
  return mount(Page, { props: { orderId: 'SI150' }, global: { stubs: { Teleport: true } } })
}

/**
 * Headers of the TAX DOCUMENT table specifically. The page renders several
 * `.detail-linked` tables (line items, linked transactions, payments), so a bare
 * `.detail-th` sweep returns all of them mixed together — identify this one by
 * the DJP status column only it has.
 */
function taxDocTable(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  const table = wrapper.findAll('table.detail-linked')
    .find(t => t.findAll('.detail-th').some(th => th.text() === 'DJP status'))
  if (!table) throw new Error('tax document table not found')
  return table
}

function taxDocHeaders(wrapper: Awaited<ReturnType<typeof mountPage>>): string[] {
  return taxDocTable(wrapper).findAll('.detail-th').map(th => th.text())
}

describe('Sales invoice detail — Tax document tab', () => {
  it('heads the lineage column "Tax document status", not "Type"', async () => {
    const headers = taxDocHeaders(await mountPage())
    expect(headers).toContain('Tax document status')
    expect(headers).toContain('DJP status')
    // The old wording collided with the Create drawer's "Document type"
    // (Output tax invoice / Other output document).
    expect(headers).not.toContain('Type')
    // ...and the key is 'DJP status', not the old capital-S 'DJP Status'.
    expect(headers).not.toContain('DJP Status')
    expect(headers.indexOf('Tax document status')).toBeLessThan(headers.indexOf('DJP status'))
    // Payment stage was dropped from this table — the value is still recorded and
    // still shown in the "View details" drawer as Sales invoice type.
    expect(headers).not.toContain('Payment stage')
    expect(headers).toEqual(['Date', 'Number', 'Tax document status', 'DJP status', 'Remark', ''])
  })

  it("shows SI150's superseded faktur as Replaced on one axis and still Approved by DJP on the other", async () => {
    const html = (await mountPage()).html()
    // The superseded Normal faktur — Diganti, but DJP never un-approved it.
    expect(html).toContain('Replaced')
    expect(html).toContain('Approved by DJP')
    // The Pengganti that now stands.
    expect(html).toContain('Replacement')
    // Nothing on this page should read the pre-split DJP wording.
    expect(html).not.toContain('Awaiting approval')
  })

  it('renders Tax document status as plain text and DJP status as a badge', async () => {
    const row = taxDocTable(await mountPage()).findAll('tbody tr')[0]!
    const cells = row.findAll('td')
    const [, , taxStatusCell, djpStatusCell] = cells

    // Tax document status classifies the document — no chip. Badging it put two
    // chips in one row competing for attention (rule/efaktur-status-axes).
    expect(taxStatusCell!.text()).toContain('Replacement')
    expect(taxStatusCell!.find('[data-pixel-component="MpBadge"]').exists()).toBe(false)

    // DJP status reports a state that changes — that one stays a badge.
    expect(djpStatusCell!.find('[data-pixel-component="MpBadge"]').exists()).toBe(true)
    expect(djpStatusCell!.text()).toContain('Approved by DJP')
  })
})
