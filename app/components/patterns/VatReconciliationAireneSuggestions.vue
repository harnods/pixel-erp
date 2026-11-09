<script setup lang="ts">
/**
 * Airene match suggestions for one row (US-014, PM 2026-11-06) — shared by the
 * workspace row's expand (the column of the missing document) and the detail
 * drawer. Asks once per row per session (requestSuggestions); while it waits,
 * a short "Airene is looking for matches…". With no candidates — or a timeout,
 * which fails open — it renders nothing and the host's manual search stays as is.
 *
 * Up to three 1:1 candidates in rank order. Only a rank-1 Tier 1 candidate is
 * "Suggested by Airene"; Tier 2 lists what differs, plainly. Each candidate's
 * "Confirm match" is secondary (one primary per area); a candidate whose total
 * differs goes through the shared difference modal. A confirmed suggestion is
 * Reconciled (manual) with origin `ai_suggested_human_confirmed`.
 */
import { MpButton, MpIcon, MpTag } from '@mekari/pixel3'
import VatReconciliationMatchConfirmModal from '~/components/patterns/VatReconciliationMatchConfirmModal.vue'
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import { confirmManualMatch, formatAmountPlain, type ReconPair, type ReconSide } from '~/data/vatReconciliation'
import {
  isAireneEligible, requestSuggestions, suggestionState, shownSuggestions, reasonLine, differencesOf,
  type ShownSuggestion,
} from '~/data/vatReconSuggest'

const props = withDefaults(defineProps<{
  pair: ReconPair
  side: ReconSide
  periodId: string
  /** The masa is Finalized — confirming is refused, inline. */
  finalized?: boolean
  context?: 'row' | 'drawer'
}>(), { finalized: false, context: 'row' })

const emit = defineEmits<{ matched: [] }>()

const { t } = useLocale()

const eligible = computed(() => isAireneEligible(props.pair))
watch(() => props.pair.id, () => { if (eligible.value) requestSuggestions(props.pair) }, { immediate: true })

const state = computed(() => suggestionState(props.pair))
const loading = computed(() => eligible.value && (!state.value || state.value.status === 'loading'))
const shown = computed(() => (state.value?.status === 'done' ? shownSuggestions(props.pair, state.value.response) : []))

const finalizedError = ref(false)
const pending = ref<ShownSuggestion | null>(null)
const anchor = computed(() => (props.pair.erp ?? props.pair.djp)?.total ?? 0)

function confirm(s: ShownSuggestion) {
  if (props.finalized) { finalizedError.value = true; return }
  if (anchor.value !== s.match.total) { pending.value = s; return }
  save(s)
}
function save(s: ShownSuggestion) {
  const ok = confirmManualMatch({
    pair: props.pair, periodId: props.periodId, side: props.side, candidate: s.match,
    origin: 'ai_suggested_human_confirmed', aiReasonCode: s.candidate.reason_code, aiReason: reasonLine(s.candidate).en,
  })
  if (!ok) return
  pending.value = null
  successToast(t('Match confirmed'))
  emit('matched')
}
function reasonText(s: ShownSuggestion) { return reasonLine(s.candidate).keys.map(k => t(k)).join(' ') }
function diffText(d: { label: string; amount?: number }) { return d.amount != null ? `${t(d.label)} ${formatIDR(d.amount)}` : t(d.label) }
</script>

<template>
  <div v-if="eligible && (loading || shown.length)" class="vas" :class="`vas--${context}`" data-devchange="vat-recon-airene-suggest">
    <p v-if="loading" class="vas-loading" data-test-id="vas-loading" role="status">
      <MpIcon name="airene-brand" size="sm" />
      <span>{{ t('Airene is looking for matches…') }}</span>
    </p>
    <template v-else>
      <div v-for="s in shown" :key="s.match.ref" class="vas-item" data-test-id="vas-item" :data-ref="s.match.ref" :data-tier="s.tier">
        <div class="vas-head">
          <div class="vas-id">
            <span class="vas-ref">{{ s.match.ref }}</span>
            <span class="vas-caption">{{ s.match.date }} · {{ s.match.party }}</span>
          </div>
          <span class="vas-total">{{ formatAmountPlain(s.match.total) }}</span>
        </div>
        <span v-if="s.suggested" class="vas-marker" data-test-id="vas-suggested">
          <MpIcon name="airene-brand" size="sm" />
          {{ t('Suggested by Airene') }}
        </span>
        <p class="vas-reason">{{ reasonText(s) }}</p>
        <div v-if="s.tier === 2" class="vas-diffs">
          <span v-for="d in differencesOf(s.candidate)" :key="d.label" class="vas-diff" data-test-id="vas-diff"><MpTag>{{ diffText(d) }}</MpTag></span>
        </div>
        <div class="vas-actions">
          <MpButton variant="secondary" size="sm" is-rounded @click="confirm(s)">{{ t('Confirm match') }}</MpButton>
        </div>
      </div>
      <p class="vas-disclaimer" data-test-id="vas-caption">{{ t('Airene responses can be inaccurate or misleading.') }}</p>
      <p v-if="finalizedError" class="vas-error" role="alert">{{ t('This period is finalized. Unfinalize it first to change matches.') }}</p>
    </template>

    <VatReconciliationMatchConfirmModal
      :is-open="!!pending"
      :row-ref="(pair.erp ?? pair.djp)?.ref ?? ''"
      :row-total="anchor"
      :candidate-ref="pending?.match.ref ?? ''"
      :candidate-total="pending?.match.total ?? 0"
      @close="pending = null"
      @confirm="() => pending && save(pending)"
    />
  </div>
</template>

<style scoped>
.vas { --vas-marker-py: 2px; display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-3); }
.vas-loading {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2); margin: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-airene-bold);
}
.vas-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
}
.vas-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); }
.vas-id { display: flex; flex-direction: column; min-width: 0; }
.vas-ref { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.vas-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.vas-total { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* Airene identity lives on the AI affordance (MATCH_META note) — its own tokens. */
.vas-marker {
  align-self: flex-start; display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--vas-marker-py) var(--mp-spacing-2); border-radius: var(--mp-radii-full);
  background: var(--mp-airene-badge-bg); color: var(--mp-airene-bold);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
}
.vas-reason { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.vas-diffs { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.vas-diff { display: inline-flex; }
.vas-actions { display: flex; justify-content: flex-end; }
.vas-disclaimer { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.vas-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); }
</style>
