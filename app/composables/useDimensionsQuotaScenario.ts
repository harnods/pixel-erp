/**
 * useDimensionsQuotaScenario — which quota state DimensionsIndexPage.vue's
 * quota bar (Figma "_Part / Quota") previews, via the bottom-right demo-fab.
 *
 * 'live' drives the page from the real persisted `dimensions` data (normal
 * CRUD behaviour). The other three swap in static preview data/flags so every
 * Figma state (Skeleton / under-quota "Half" / at-quota "Upgraded") can be
 * seen without needing to actually archive/delete real dimensions down to
 * those counts. Not persisted — same "flip while testing" convention as
 * useApprovalWorkflowScenario.
 */
export type DimensionsQuotaScenario = 'live' | 'empty' | 'under-quota' | 'skeleton'

const quotaScenario = ref<DimensionsQuotaScenario>('live')

export function useDimensionsQuotaScenario() {
  function setQuotaScenario(scenario: DimensionsQuotaScenario) {
    quotaScenario.value = scenario
  }

  return { quotaScenario, setQuotaScenario }
}
