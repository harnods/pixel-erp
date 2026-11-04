<script setup lang="ts">
/**
 * VAT reconciliation — the state-driven actions for one pair (PRD OD-001 §5.1).
 *
 * A matched pair can only be unmatched, a missing document is found or created,
 * an edited invoice is corrected or superseded, and so on. Shared by the detail
 * drawer footer (Unmatched & discrepancies page) and the workspace row's inline
 * expand, so the two can never offer different fixes for the same state.
 *
 * `inline` drops what the workspace row already carries elsewhere: the
 * tax-document buttons (VatReconciliationTaxDocActions, on the row line),
 * Confirm match (the row's round ✓) and Find & match (the expand lists the
 * candidates itself, with "Find another faktur").
 */
import { MpButton } from '@mekari/pixel3'
import { computed } from 'vue'
import VatReconciliationTaxDocActions from '~/components/patterns/VatReconciliationTaxDocActions.vue'
import {
  isWaitingOnBuyer, setWaitingOnBuyer, manualMatchOf, undoManualMatch, confirmManualMatch,
  ownFakturCandidate, nettedAnchor, type ReconPair, type ReconSide,
} from '~/data/vatReconciliation'

const props = withDefaults(defineProps<{
  pair: ReconPair
  side: ReconSide
  inline?: boolean
  size?: 'sm' | 'md'
  /** The pair's masa is Finalized — Match / Unmatch are refused (US-002 AC-05). */
  finalized?: boolean
  /** The masa the pair belongs to — needed to record a confirmed match. */
  periodId?: string
}>(), { inline: false, size: 'md', finalized: false, periodId: undefined })

const emit = defineEmits<{
  /** `close` — the action finishes the job, so a drawer hosting it should close. */
  action: [message: string, close: boolean]
}>()

const { t } = useLocale()

function act(message: string, alsoClose = false) { emit('action', message, alsoClose) }

/**
 * Anything that makes or breaks a match. A Finalized masa is the record of what
 * was reconciled, so it refuses these until it is unfinalized — same as Re-run.
 */
function matchAct(message: string, alsoClose = false) {
  if (props.finalized) { act(t('Unfinalize first to change matches in this period')); return }
  act(message, alsoClose)
}

/**
 * Unmatch. A match a person made is an overlay, so undoing it is exact and the
 * engine's own status comes back. Undoing one of the engine's matches would
 * need the pair split back into two rows, which the prototype doesn't model.
 */
function unmatch() {
  if (props.finalized) { act(t('Unfinalize first to change matches in this period')); return }
  if (manualMatchOf(props.pair.id)) undoManualMatch(props.pair.id)
  act(t('Match canceled'), true)
}

/** Confirm a netted return against its own faktur (US-017 AC-01). */
function confirmNetted() {
  if (props.finalized) { act(t('Unfinalize first to change matches in this period')); return }
  const candidate = ownFakturCandidate(props.pair)
  if (candidate && props.periodId) {
    confirmManualMatch({
      pair: props.pair, periodId: props.periodId, side: props.side,
      candidate, anchorTotal: nettedAnchor(props.pair),
    })
  }
  act(t('Match confirmed'), true)
}

// US-012 AC-02 — a toggle, not a status: it can be switched back off.
const waiting = computed(() => isWaitingOnBuyer(props.pair))
function toggleWaiting() {
  const next = !waiting.value
  setWaitingOnBuyer(props.pair, next)
  act(next ? t('Marked as waiting on buyer') : t('No longer waiting on buyer'))
}
</script>

<template>
  <div class="vpa">
    <!-- Rows 1-2: the only thing left to do is undo it. -->
    <template v-if="pair.match === 'matched'">
      <MpButton variant="secondary" :size="size" is-rounded @click="unmatch">
        {{ t('Unmatch') }}
      </MpButton>
    </template>
    <!-- Rows 8 and 11: the engine will not decide; a person confirms. -->
    <template v-else-if="pair.match === 'return-netted' && !inline">
      <MpButton variant="primary" :size="size" is-rounded left-icon="check" @click="confirmNetted">
        {{ t('Confirm match') }}
      </MpButton>
    </template>
    <template v-else-if="pair.match === 'duplicate-reference'">
      <MpButton variant="primary" :size="size" is-rounded @click="matchAct(t('Opening faktur list…'))">
        {{ t('Select faktur') }}
      </MpButton>
    </template>
    <!-- Row 3 (US-008) / row 4 (US-009): a document is missing. -->
    <template v-else-if="pair.match === 'not-in-coretax'">
      <MpButton v-if="!inline" variant="secondary" :size="size" is-rounded @click="matchAct(t('Opening match picker…'))">
        {{ t('Find & match') }}
      </MpButton>
      <!-- Output rows are real invoices: the fix is on the invoice, and
           what it is depends on how far its tax document got. -->
      <VatReconciliationTaxDocActions v-if="pair.erp?.salesInvoiceId && !inline" :pair="pair" :show-hint="false" :size="size" />
      <template v-else-if="pair.erp?.salesInvoiceId" />
      <MpButton v-else variant="primary" :size="size" is-rounded @click="act(t('Opening Klikpajak…'), true)">
        {{ t('Create faktur pajak') }}
      </MpButton>
    </template>
    <template v-else-if="pair.match === 'no-match-in-erp'">
      <MpButton v-if="!inline" variant="secondary" :size="size" is-rounded @click="matchAct(t('Opening match picker…'))">
        {{ t('Find & match') }}
      </MpButton>
      <MpButton variant="primary" :size="size" is-rounded @click="act(t('Opening sales invoice…'), true)">
        {{ side === 'input' ? t('Create purchase invoice') : t('Create sales invoice') }}
      </MpButton>
    </template>
    <!-- Row 5 (US-010): correct the invoice, or supersede the faktur. -->
    <template v-else-if="pair.match === 'invoice-edited'">
      <MpButton variant="secondary" :size="size" is-rounded left-icon="edit" @click="act(t('Opening sales invoice…'))">
        {{ t('Edit sales invoice') }}
      </MpButton>
      <MpButton variant="primary" :size="size" is-rounded @click="act(t('Opening Klikpajak…'), true)">
        {{ t('Create faktur pengganti') }}
      </MpButton>
    </template>
    <!-- Row 6 (US-011): the invoice is gone, the faktur must follow. -->
    <template v-else-if="pair.match === 'invoice-voided'">
      <MpButton variant="primary" :size="size" is-rounded @click="act(t('Opening Klikpajak…'), true)">
        {{ t('Cancel faktur') }}
      </MpButton>
    </template>
    <!-- Row 7 (US-012): pengganti net, or park it on the buyer. -->
    <template v-else-if="pair.match === 'return-not-reflected'">
      <MpButton variant="secondary" :size="size" is-rounded left-icon="time" :aria-pressed="waiting" @click="toggleWaiting">
        {{ waiting ? t('Stop waiting on buyer') : t('Waiting on buyer') }}
      </MpButton>
      <MpButton variant="primary" :size="size" is-rounded @click="act(t('Opening Klikpajak…'), true)">
        {{ t('Create faktur pengganti (net)') }}
      </MpButton>
    </template>
    <!-- Rows 9-10: a date is wrong on one side or the other. -->
    <template v-else-if="pair.match === 'faktur-predates' || pair.match === 'return-date-mismatch'">
      <MpButton variant="secondary" :size="size" is-rounded left-icon="edit" @click="act(t('Opening sales invoice…'))">
        {{ t('Correct invoice date') }}
      </MpButton>
      <MpButton variant="primary" :size="size" is-rounded @click="act(t('Opening Coretax…'))">
        {{ t('Correct faktur date') }}
      </MpButton>
    </template>
    <!-- Row 12: nothing can be matched into a finalized period. -->
    <template v-else-if="pair.match === 'period-finalized'">
      <MpButton variant="secondary" :size="size" is-rounded @click="act(t('Opening period…'))">
        {{ t('Unfinalize period') }}
      </MpButton>
    </template>
  </div>
</template>

<style scoped>
.vpa { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--mp-spacing-2); }
</style>
