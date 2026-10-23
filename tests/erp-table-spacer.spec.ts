// @vitest-environment happy-dom
/**
 * ErpTablePage — the flexible spacer column.
 *
 * The spacer is what makes the column-width standard hold. Under
 * `table-layout: fixed` the browser shares any surplus out across the columns,
 * so without something to absorb it EVERY column renders past its declared
 * max — a `datetime` column pinned at 220px measured 300px on a wide screen.
 *
 * It used to be rendered only when the table had an `#actions` slot or an
 * `isTrailingAction` column, which left the ten read-only tables (Activity log,
 * the Xpm pages, …) with no way to honour their own widths.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'

const columns: TableColumn[] = [
  { key: 'date', label: 'Date', kind: 'datetime' },
  { key: 'name', label: 'Name', kind: 'name' },
]
const rows = [{ date: '2026-01-30T11:00', name: 'Rizal Candra' }]

function mountTable(slots: Record<string, string> = {}) {
  return mount(ErpTablePage, {
    props: { columns, rows, total: 1, currentPage: 1, perPage: 25 },
    slots,
    global: { stubs: { Teleport: true } },
  })
}

describe('ErpTablePage spacer', () => {
  it('renders on a read-only table, which has no actions to push right', () => {
    const w = mountTable()
    expect(w.findAll('col.erp-col-spacer')).toHaveLength(1)
    expect(w.findAll('th.erp-th--spacer')).toHaveLength(1)
  })

  it('still renders exactly one on a table with an actions column', () => {
    const w = mountTable({ actions: '<button>…</button>' })
    expect(w.findAll('col.erp-col-spacer')).toHaveLength(1)
    expect(w.findAll('th.erp-th--spacer')).toHaveLength(1)
  })

  it('keeps every column pinned to its kind, spacer aside', () => {
    const w = mountTable()
    const cols = w.findAll('colgroup col').filter(c => !c.classes('erp-col-spacer'))
    expect(cols[0]!.attributes('style')).toContain('220px')  // datetime, fixed
    expect(cols[1]!.attributes('style')).toContain('280px')  // name, max
  })
})
