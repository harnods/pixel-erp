/**
 * VAT reconciliation setup — PPN accounts are picked by hand (US-016).
 *
 * The old setup listed fixed tax codes with hardcoded COA strings that did not
 * exist in the company's chart. Setup now stores the account codes the user
 * chose from the live chart, per side, and nothing is auto-detected.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveVatSetup, loadVatSetup, accountLabels, vatAccountOptionLabel,
  SNAPSHOT_ACCOUNT_CODES, reconSides, normalizeSetup,
} from '~/data/vatReconciliation'
import { coaAccounts } from '~/data/wmsCutover'

describe('VAT setup — manual PPN accounts', () => {
  beforeEach(() => {
    saveVatSetup({ outputAccountCodes: SNAPSHOT_ACCOUNT_CODES.output, inputAccountCodes: SNAPSHOT_ACCOUNT_CODES.input, scope: 'both' })
  })

  it('stores the chosen accounts per side', () => {
    const s = saveVatSetup({ outputAccountCodes: ['2-20500', '2-20599'], scope: 'out' })
    expect(s.outputAccountCodes).toEqual(['2-20500', '2-20599'])
    expect(s.inputAccountCodes).toEqual([])
    expect(loadVatSetup()?.outputAccountCodes).toEqual(['2-20500', '2-20599'])
    expect(reconSides()).toEqual(['output'])
  })

  // VAT In (OD-008) is hidden while VAT_IN_ENABLED is off: a `both` scope —
  // saved, or loaded from an older browser snapshot — is VAT Out.
  it('saves a VAT In & Out scope as VAT Out while VAT In is hidden', () => {
    const s = saveVatSetup({ outputAccountCodes: ['2-20500'], inputAccountCodes: ['1-10500'], scope: 'both' })
    expect(s.scope).toBe('out')
    expect(loadVatSetup()?.scope).toBe('out')
    expect(reconSides()).toEqual(['output'])
  })

  it('loads a stored VAT In & Out scope as VAT Out while VAT In is hidden', () => {
    const s = normalizeSetup({ outputAccountCodes: ['2-20500'], inputAccountCodes: ['1-10500'], scope: 'both', savedAt: '2026-11-01T00:00:00.000Z' })
    expect(s.scope).toBe('out')
  })

  it('snapshot accounts exist in the default chart', () => {
    for (const code of [...SNAPSHOT_ACCOUNT_CODES.output, ...SNAPSHOT_ACCOUNT_CODES.input]) {
      expect(coaAccounts.some(a => a.code === code)).toBe(true)
    }
  })

  it('labels accounts Jurnal-style from the live chart', () => {
    expect(vatAccountOptionLabel({ code: '2-20500', name: 'VAT Out' })).toBe('(2-20500) - VAT Out')
    expect(accountLabels(['2-20500', '1-10500'])).toBe('(2-20500) - VAT Out, (1-10500) - VAT In')
    // A code no longer in the chart still shows, bare, rather than vanishing.
    expect(accountLabels(['9-99999'])).toBe('9-99999')
  })

  it('a legacy tax-code snapshot normalizes to empty account lists', () => {
    const s = normalizeSetup({ taxCodeIds: ['ppn-12'], scope: 'out', savedAt: '2026-01-01T00:00:00.000Z' } as never)
    expect(s.outputAccountCodes).toEqual([])
    expect(s.inputAccountCodes).toEqual([])
    expect(s.scope).toBe('out')
  })
})
