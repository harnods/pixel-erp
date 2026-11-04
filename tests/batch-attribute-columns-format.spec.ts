/**
 * One date format for batch attributes in every drawer table (rule/format-date): the
 * shared formatter reads numeric DD/MM/YYYY in a cell — View, Pick and Manage batch
 * drawers all use it — and keeps DD MMM YYYY only for the Select-batch option line.
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useBatchAttributeColumns } from '~/composables/useBatchAttributeColumns'

describe('useBatchAttributeColumns date text', () => {
  const cols = useBatchAttributeColumns(ref('1101'))
  const v = { manufacturing_date: '2026-03-05', best_before_date: '2027-01-20', expiry_date: '2027-02' }

  it('a cell reads DD/MM/YYYY (MM/YYYY for a month expiry)', () => {
    expect(cols.text('manufacturing_date', v)).toBe('05/03/2026')
    expect(cols.text('best_before_date', v)).toBe('20/01/2027')
    expect(cols.text('expiry_date', v)).toBe('02/2027')
  })

  it('the option line keeps the long form', () => {
    expect(cols.optionText('manufacturing_date', v)).toBe('05 Mar 2026')
    expect(cols.optionText('expiry_date', v)).toBe('Feb 2027')
  })

  it('an empty value is —', () => {
    expect(cols.text('manufacturing_date', {})).toBe('—')
  })
})
