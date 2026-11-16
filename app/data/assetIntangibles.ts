/**
 * Intangibles (FG-9): the statutory taxonomy and the annual test obligation.
 */
import { computed } from 'vue'
import { fixedAssets, impairmentTests, ledgers, CURRENT_PERIOD, FY_START, FY_END, type ImpairmentTest } from './assetStore'
import { isAfter, isBefore, isHeldAt, periodOfDate } from './assetEngine'
import type { FixedAsset } from './fixedAssets'

/** The eleven codes of the statutory intangible schedule (OD-47). */
export const INTANGIBLE_CODES: { code: string; label: string }[] = [
  { code: '0601', label: 'Patent' },
  { code: '0602', label: 'Copyright' },
  { code: '0603', label: 'Brand or trademark' },
  { code: '0604', label: 'Licence' },
  { code: '0605', label: 'Franchise' },
  { code: '0606', label: 'Concession or mining right' },
  { code: '0607', label: 'Goodwill' },
  { code: '0608', label: 'Software' },
  { code: '0609', label: 'Formula or recipe' },
  { code: '0610', label: 'Customer list' },
  { code: '0699', label: 'Other intangible' },
]

/** The statutory groups an intangible may take: no buildings groups (FG-9.3). */
export const INTANGIBLE_TAX_GROUPS = ['Tax group 1', 'Tax group 2', 'Tax group 3', 'Tax group 4']

export interface AnnualObligation {
  asset: FixedAsset
  why: 'Goodwill' | 'Indefinite life'
  /** The FY2026 annual test that meets the obligation, when there is one. */
  test: ImpairmentTest | null
}

/**
 * OD-52, FG3-AC6. Every goodwill and indefinite-life intangible held at the
 * year end must be tested in the year, whether or not an indicator exists.
 * Completion is tracked against this list, and a completed asset stays on it
 * named with the test that completed it.
 */
export const annualObligations = computed<AnnualObligation[]>(() =>
  fixedAssets.value
    .filter((a) => {
      const l = ledgers.value[a.id]
      if (!l) return false
      const heldAtYearEnd = isHeldAt(l, isAfter(CURRENT_PERIOD, FY_END) ? FY_END : CURRENT_PERIOD)
      return heldAtYearEnd && (l.isGoodwill || a.indefiniteLife)
    })
    .map((a) => {
      const inYear = impairmentTests.value.filter((x) => {
        if (x.assetId !== a.id) return false
        const p = periodOfDate(x.date)
        return !isBefore(p, FY_START) && !isAfter(p, FY_END) && x.outcome !== 'Reversal'
      })
      // The annual test is the one recorded as such; any test in the year
      // with a recoverable amount also meets it, since the asset was tested.
      const test = inYear.find((x) => x.indicator.includes('Annual')) ?? inYear[0] ?? null
      return { asset: a, why: ledgers.value[a.id]!.isGoodwill ? 'Goodwill' as const : 'Indefinite life' as const, test }
    }),
)

export const annualDone = computed(() => annualObligations.value.filter((o) => o.test))
export const annualOutstanding = computed(() => annualObligations.value.filter((o) => !o.test))
