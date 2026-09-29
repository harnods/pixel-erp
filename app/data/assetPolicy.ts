/**
 * Asset settings that change what the engine writes (OD-09, OD-10).
 *
 * Kept apart from assetStore.ts so the store only reads them. Both are
 * company policy, stated once in Asset settings rather than chosen per run,
 * and both live for the session only.
 */
import { ref } from 'vue'
import { periodEndDate, type Period } from './assetEngine'

/**
 * OD-09. What date a depreciation journal carries.
 *  - 'period-end': the last day of the period (the default).
 *  - 'posting-date': the day the run is posted.
 *  - 'policy-day': a fixed day of the month after the period, for a company
 *    that closes on, say, the 5th.
 */
export type JournalDatePolicy = 'period-end' | 'posting-date' | 'policy-day'

export const journalDatePolicy = ref<JournalDatePolicy>('period-end')
/** The day of the following month used by 'policy-day'. 1 to 28. */
export const journalPolicyDay = ref(5)

/** OD-10. When on, generating a run posts it at once. It stays reversible. */
export const autoPostRuns = ref(false)

export function resetAssetPolicy() {
  journalDatePolicy.value = 'period-end'
  journalPolicyDay.value = 5
  autoPostRuns.value = false
}

/** The date a period's journal carries under the current policy. */
export function journalDateFor(p: Period, postedOn: string): string {
  switch (journalDatePolicy.value) {
    case 'posting-date': return postedOn
    case 'policy-day': {
      const [y, m] = p.split('-').map(Number) as [number, number]
      const ny = m === 12 ? y + 1 : y
      const nm = m === 12 ? 1 : m + 1
      const day = Math.min(Math.max(Math.round(journalPolicyDay.value), 1), 28)
      return `${String(day).padStart(2, '0')}/${String(nm).padStart(2, '0')}/${ny}`
    }
    default: return periodEndDate(p)
  }
}

/** A one-line statement of the policy, for the run header and settings. */
export function journalDatePolicyLabel(): string {
  switch (journalDatePolicy.value) {
    case 'posting-date': return 'the date the run is posted'
    case 'policy-day': return `day ${journalPolicyDay.value} of the following month`
    default: return 'the last day of the period'
  }
}
