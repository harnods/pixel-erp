/**
 * OD-09. The depreciation journal date is company policy, stated once in
 * Asset settings, not chosen per run. The run and its journal read it.
 */
import { ref } from 'vue'
import { onAssetStoreReset } from './assetStore'
import { periodEndDate, type Period } from './assetEngine'

export type JournalDatePolicy = 'period-end' | 'posting-date'
export const journalDatePolicy = ref<JournalDatePolicy>('period-end')
onAssetStoreReset(() => { journalDatePolicy.value = 'period-end' })

/** The prototype's today: the date a run posted now carries. */
export const POSTING_DATE = '30/09/2026'

export function journalDateFor(p: Period): string {
  return journalDatePolicy.value === 'period-end' ? periodEndDate(p) : POSTING_DATE
}

export function journalDateRule(): string {
  return journalDatePolicy.value === 'period-end' ? 'the last day of the period' : 'the date the run is posted'
}
