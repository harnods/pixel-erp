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
import DetailActionsMenu from '~/components/patterns/DetailActionsMenu.vue'
import {
  isWaitingOnBuyer, setWaitingOnBuyer, manualMatchOf, undoManualMatch, confirmManualMatch, unmatchAutoPair,
  ownFakturCandidate, nettedAnchor, type ReconPair, type ReconSide,
} from '~/data/vatReconciliation'

/** One action: `label` is the untranslated copy key. */
export interface PairAction { label: string; run: () => void; pressed?: boolean }

const props = withDefaults(defineProps<{
  pair: ReconPair
  side: ReconSide
  inline?: boolean
  size?: 'sm' | 'md'
  /** The pair's masa is Finalized — Match / Unmatch are refused (US-002 AC-05). */
  finalized?: boolean
  /** The masa the pair belongs to — needed to record a confirmed match. */
  periodId?: string
  /** Host's own secondary actions (e.g. the drawer's View tax document), shown before the state's. */
  extraSecondary?: PairAction[]
}>(), { inline: false, size: 'md', finalized: false, periodId: undefined, extraSecondary: () => [] })

const emit = defineEmits<{
  /** `close` — the action finishes the job, so a drawer hosting it should close. */
  action: [message: string, close: boolean]
}>()

const { t } = useLocale()

function act(message: string, alsoClose = false) { emit('action', message, alsoClose) }

/**
 * One primary per screen (rule/btn-one-primary). In a drawer footer the fix is
 * THE action; on a workspace row it sits among many rows and the title bar's
 * Finalize, so there it drops to secondary.
 */
const mainVariant = computed(() => (props.inline ? 'secondary' : 'primary'))

/**
 * Unmatch. A match a person made is an overlay, so undoing it is exact and the
 * engine's own status comes back. Undoing one of the ENGINE's matches splits the
 * pair back into its two open rows (US-002 AC-03) — never a toast that changes nothing.
 */
function unmatch() {
  if (props.finalized) { act(t('Unfinalize first to change matches in this period')); return }
  if (manualMatchOf(props.pair.id)) undoManualMatch(props.pair.id)
  else unmatchAutoPair(props.pair)
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

/**
 * The state's actions as data: its secondary actions and the one main fix.
 * `taxDoc` hands the whole row to VatReconciliationTaxDocActions instead.
 */
const plan = computed<{ secondary: PairAction[]; main: PairAction | null; taxDoc: boolean }>(() => {
  const p = props.pair
  const none = { secondary: [] as PairAction[], main: null, taxDoc: false }
  switch (p.match) {
    // Rows 1-2: the only thing left to do is undo it.
    case 'matched': return { ...none, secondary: [{ label: 'Unmatch', run: unmatch }] }
    // Rows 8 and 11: the engine will not decide; a person confirms.
    case 'return-netted': return props.inline ? none : { ...none, main: { label: 'Confirm match', run: confirmNetted } }
    // Row 3 (US-008): output rows are real invoices — the fix depends on how far
    // the invoice's tax document got (VatReconciliationTaxDocActions).
    case 'not-in-coretax':
      if (p.erp?.salesInvoiceId) return props.inline ? none : { ...none, taxDoc: true }
      return { ...none, main: { label: 'Create tax document', run: () => act(t('Opening Klikpajak…'), true) } }
    case 'no-match-in-erp':
      return { ...none, main: { label: props.side === 'input' ? 'Create purchase invoice' : 'Create sales invoice', run: () => act(t('Opening sales invoice…'), true) } }
    // Row 5 (US-010): correct the invoice, or supersede the faktur.
    case 'invoice-edited':
      return { ...none, secondary: [{ label: 'Edit sales invoice', run: () => act(t('Opening sales invoice…')) }],
        main: { label: 'Create faktur pengganti', run: () => act(t('Opening Klikpajak…'), true) } }
    // Row 6 (US-011): the invoice is gone, the faktur must follow.
    case 'invoice-voided': return { ...none, main: { label: 'Cancel tax document', run: () => act(t('Opening Klikpajak…'), true) } }
    // Row 7 (US-012): pengganti net, or park it on the buyer.
    case 'return-not-reflected':
      return { ...none, secondary: [{ label: waiting.value ? 'Stop waiting on buyer' : 'Waiting on buyer', run: toggleWaiting, pressed: waiting.value }],
        main: { label: 'Create faktur pengganti (net)', run: () => act(t('Opening Klikpajak…'), true) } }
    // Rows 9-10: a date is wrong on one side or the other.
    case 'faktur-predates':
    case 'return-date-mismatch':
      return { ...none, secondary: [{ label: 'Correct transaction date', run: () => act(t('Opening sales invoice…')) }],
        main: { label: 'Correct tax document date', run: () => act(t('Opening tax document…')) } }
    // Row 12: nothing can be matched into a finalized period.
    case 'period-finalized': return { ...none, secondary: [{ label: 'Unfinalize period', run: () => act(t('Opening period…')) }] }
    // Duplicate reference: the drawer lists the faktur to pick from — no second control here.
    default: return none
  }
})
const secondaries = computed(() => [...props.extraSecondary, ...plan.value.secondary])
/** Two or more secondary actions fold into one "Actions" dropdown (one secondary + one primary). */
const collapse = computed(() => !props.inline && secondaries.value.length >= 2)
const menuGroups = computed(() => [secondaries.value.map(a => ({ label: a.label, onClick: a.run }))])
</script>

<template>
  <div class="vpa" data-devchange="vat-recon-ui-review">
    <template v-if="plan.taxDoc">
      <MpButton v-for="a in extraSecondary" :key="a.label" variant="secondary" :size="size" is-rounded @click="a.run()">{{ t(a.label) }}</MpButton>
      <VatReconciliationTaxDocActions :pair="pair" :show-hint="false" :size="size" />
    </template>
    <template v-else>
      <!-- 2+ secondary actions → one "Actions" dropdown, so the footer keeps one secondary + one primary. -->
      <DetailActionsMenu v-if="collapse" :id="`vpa-actions-${pair.id}`" variant="secondary" :groups="menuGroups" data-devchange="vat-recon-drawer-actions-menu" />
      <template v-else>
        <MpButton v-for="a in secondaries" :key="a.label" variant="secondary" :size="size" is-rounded :aria-pressed="a.pressed" @click="a.run()">{{ t(a.label) }}</MpButton>
      </template>
      <MpButton v-if="plan.main" :variant="mainVariant" :size="size" is-rounded @click="plan.main.run()">{{ t(plan.main.label) }}</MpButton>
    </template>
  </div>
</template>

<style scoped>
.vpa { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--mp-spacing-2); }
</style>
