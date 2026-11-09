<script setup lang="ts">
/**
 * VAT reconciliation — pair detail drawer.
 *
 * Opened from a workspace row or from the Unmatched & discrepancies table. Shows
 * the two sides field-by-field with the differing fields highlighted, the engine's
 * reasoning, alternative match candidates (only when the pair isn't settled), and
 * an activity trail. The footer actions are state-driven — a matched pair can only
 * be unmatched, a suggestion can be accepted or rejected, and so on.
 *
 * 720px, on the shared ErpDrawer Teleport shell (rule/drawer-custom-shell —
 * MpDrawer has no structural CSS in this Pixel3 build). Like every ERP drawer it
 * closes only via its × (rule/modal-drawer-close-explicit-only).
 */
import {
  MpButton, MpText, MpIcon, MpBanner, MpBannerIcon, MpBannerDescription, MpTag,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { formatDateTimeLong } from '~/utils/date'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ActivityLogModal, { type ActivityEntry as LogEntry } from '~/components/patterns/ActivityLogModal.vue'
import VatReconciliationPairActions from '~/components/patterns/VatReconciliationPairActions.vue'
import VatReconciliationMatchConfirmModal from '~/components/patterns/VatReconciliationMatchConfirmModal.vue'
import VatReconciliationAireneSuggestions from '~/components/patterns/VatReconciliationAireneSuggestions.vue'
import { isAireneEligible, suggestionState, shownSuggestions } from '~/data/vatReconSuggest'
import { successToast } from '~/utils/toasts'
import { formatTaxDocumentNumber, DJP_STATUS_CONFIG } from '~/data/taxDocuments'
import {
  MATCH_META, candidatesFor, formatAmountPlain, pairActivity, activePeriodId, confirmManualMatch, nettedAnchor,
  taxDocSubState, statusLabelOf, statusReasonOf, statusBadgeTypeOf, erpFakturOf,
  type ReconPair, type ReconSide, type MatchCandidate,
} from '~/data/vatReconciliation'

const props = defineProps<{
  isOpen: boolean
  pair: ReconPair | null
  side: ReconSide
  /** The pair's masa is Finalized — match actions are refused (US-002 AC-05). */
  finalized?: boolean
  /** The pair's masa — to record a confirmed match and read its activity. */
  periodId?: string
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
  action: [message: string]
}>()

const { t } = useLocale()

function close() { emit('update:isOpen', false) }
function act(message: string, alsoClose = false) {
  emit('action', message)
  if (alsoClose) close()
}

const meta = computed(() => (props.pair ? MATCH_META[props.pair.match] : null))

/** Header ref falls back to whichever side exists — an unmatched pair has one. */
const headerRef = computed(() => props.pair?.erp?.ref ?? props.pair?.djp?.ref ?? '')

const diffFields = computed(() => new Set(props.pair?.fields ?? []))

/** Candidates are only worth showing while the pair is still open for matching. */
const showCandidates = computed(() => {
  if (!props.pair) return false
  // Tax document not found: only when the transaction has no tax document of
  // its own yet — draft / submitted / rejected are fixed on that document.
  if (props.pair.match === 'not-in-coretax') return taxDocSubState(props.pair) === 'none'
  return ['no-match-in-erp', 'duplicate-reference'].includes(props.pair.match)
})
/** The transaction's own tax document, for the draft / submitted / rejected sub-states. */
const ownDoc = computed(() => {
  if (!props.pair) return null
  const sub = taxDocSubState(props.pair)
  return sub && sub !== 'none' ? erpFakturOf(props.pair)?.doc ?? null : null
})
const reasonText = computed(() => (props.pair ? statusReasonOf(props.pair) : undefined))
/** Derived from the pair, so they're about this row (candidatesFor). */
const matchCandidates = computed(() => {
  if (!props.pair) return []
  // Manual search below Airene's list: everything else, without repeating what Airene shows.
  const airene = isAireneEligible(props.pair)
    ? new Set(shownSuggestions(props.pair, suggestionState(props.pair)?.response ?? null).map(s => s.match.ref))
    : new Set<string>()
  return candidatesFor(props.pair).filter(c => !airene.has(c.ref))
})
const aireneOn = computed(() => (props.pair ? isAireneEligible(props.pair) : false))

interface CompareField { key: string; label: string; money?: boolean }

const compareFields = computed<CompareField[]>(() => [
  { key: 'ref', label: 'Reference' },
  { key: 'date', label: 'Date' },
  props.side === 'input'
    ? { key: 'vendor', label: 'Vendor' }
    : { key: 'customer', label: 'Customer' },
  // No NPWP — the API never sends the buyer's NPWP/NIK (VR-4).
  { key: 'dpp', label: 'DPP', money: true },
  { key: 'ppn', label: 'PPN', money: true },
  { key: 'total', label: 'Total', money: true },
])

function cellValue(row: Record<string, unknown> | null, f: CompareField): string {
  if (!row) return '—'
  const v = row[f.key]
  if (v == null) return '—'
  return f.money ? formatIDR(Number(v)) : String(v)
}

/** Only mark a cell as differing when the two sides actually disagree. */
function isDiff(f: CompareField): boolean {
  if (!diffFields.value.has(f.key)) return false
  const a = props.pair?.erp?.[f.key as keyof typeof props.pair.erp]
  const b = props.pair?.djp?.[f.key as keyof typeof props.pair.djp]
  return a !== b
}

const reasonTitle = computed(() => {
  if (!props.pair) return ''
  // The drawer header is the long form of the status. The point of the status
  // model is that a row says what is wrong, never just that it is "unmatched".
  return taxDocSubState(props.pair) ? t(statusLabelOf(props.pair)) : t(MATCH_META[props.pair.match].longLabel)
})

/**
 * "Match this" records a real manual match — the same path as the workspace's ✓
 * (confirmManualMatch). A match whose totals differ goes through the shared
 * difference modal, which asks for the reason (design review P0).
 */
const pendingCandidate = ref<MatchCandidate | null>(null)
const anchorTotal = computed(() => (props.pair?.erp ?? props.pair?.djp)?.total ?? 0)
const finalizedError = ref(false)
watch(() => props.pair?.id, () => { finalizedError.value = false; pendingCandidate.value = null })
function matchThis(c: MatchCandidate) {
  if (props.finalized) { finalizedError.value = true; return }
  if (anchorTotal.value !== c.total) { pendingCandidate.value = c; return }
  saveMatch(c)
}
function saveMatch(c: MatchCandidate) {
  if (!props.pair) return
  const ok = confirmManualMatch({
    pair: props.pair, periodId: props.periodId ?? activePeriodId, side: props.side, candidate: c,
  })
  if (!ok) return
  pendingCandidate.value = null
  successToast(t('Match confirmed'))
  close()
}

/**
 * Audit trail = the shared ActivityLogModal (rule/activity-log-modal), opened from
 * the "Last updated by …" link (rule/activity-log-trigger). Entries come from the
 * records this module keeps (pairActivity) — never invented (rule/activity-log-entries).
 */
const activity = computed(() =>
  props.pair ? pairActivity(props.pair, props.periodId ?? activePeriodId) : [])
const activityOpen = ref(false)
const lastActivity = computed(() => activity.value[0] ?? null)
const logEntries = computed<LogEntry[]>(() => activity.value.map(a => ({
  date: a.at,
  user: t(a.who),
  activity: a.status ? `${t(a.label)}: ${t(a.status)}` : t(a.label),
  details: a.detail ? [{ label: t('Details'), value: a.detail }] : [],
})))

/** The engine's reason, as a Pixel banner in the state's colour. */
const BANNER_VARIANT = { completed: 'success', information: 'info', announcement: 'info', warning: 'warning', critical: 'danger' } as const
const reasonVariant = computed(() => (props.pair ? BANNER_VARIANT[statusBadgeTypeOf(props.pair)] : 'info'))

/** Duplicate reference picks between faktur; the other open states pick a counterpart. */
const candidatesTitle = computed(() =>
  props.pair?.match === 'duplicate-reference' ? t('Select the correct faktur') : t('Other match candidates'))
</script>

<template>
  <ErpDrawer
    :is-open="isOpen && !!pair"
    :title="headerRef"
    width="720px"
    data-devchange="vat-recon-ui-review"
    @close="close"
  >
    <template #body>
      <div v-if="pair && meta" class="rdd-body">
            <!-- Engine reasoning — MpBanner in the state's colour -->
            <MpBanner v-if="reasonText" :variant="reasonVariant" is-inline data-devchange="vat-recon-workspace-reconciliations">
              <MpBannerIcon />
              <!-- Title stacked inside the description: MpBannerTitle sits inline
                   in this build, so the two ran together. -->
              <MpBannerDescription>
                <strong class="rdd-reason-title">{{ reasonTitle }}</strong>
                <span class="rdd-reason-body">{{ t(reasonText!) }}</span>
              </MpBannerDescription>
            </MpBanner>

            <!-- Side by side: two ContentList columns (rule/detail-contentlist);
                 a field the two sides disagree on is highlighted on both. -->
            <div class="rdd-compare" data-devchange="vat-recon-drawer-compare-divider">
              <div class="rdd-compare-col">
                <MpText size="h4" weight="semiBold">{{ t('Transaction') }}</MpText>
                <ContentList v-for="f in compareFields" :key="`erp-${f.key}`" :label="t(f.label)">
                  <span :class="{ 'rdd-diff': isDiff(f) }">{{ cellValue(pair.erp, f) }}</span>
                </ContentList>
              </div>
              <div class="rdd-compare-col">
                <MpText size="h4" weight="semiBold">{{ t('Tax document') }}</MpText>
                <!-- The transaction's own tax document (draft / submitted / rejected) -->
                <template v-if="ownDoc">
                  <ContentList :label="t('Number')" :value="formatTaxDocumentNumber(ownDoc)" />
                  <ContentList :label="t('Status')" :value="t(DJP_STATUS_CONFIG[ownDoc.status].label)" />
                  <ContentList :label="t('Date')" :value="ownDoc.date" />
                  <ContentList label="DPP" :value="formatIDR(pair.erp?.dpp ?? 0)" />
                  <ContentList label="PPN" :value="formatIDR(pair.erp?.ppn ?? 0)" />
                  <ContentList v-if="ownDoc.djpRemark" :label="t('DJP remark')" :value="ownDoc.djpRemark" />
                </template>
                <template v-else>
                  <ContentList v-for="f in compareFields" :key="`djp-${f.key}`" :label="t(f.label)">
                    <span :class="{ 'rdd-diff': isDiff(f) }">{{ cellValue(pair.djp, f) }}</span>
                  </ContentList>
                </template>
              </div>
            </div>

            <!-- The linked sales return (US-012 / US-017) -->
            <div v-if="pair.erp?.returnRef" class="rdd-section">
              <MpText size="h4" weight="semiBold">{{ t('Sales return') }}</MpText>
              <ContentList horizontal :label="t('Number')" :value="pair.erp.returnRef" />
              <ContentList horizontal :label="t('Date')" :value="pair.erp.returnDate ?? '—'" />
              <ContentList horizontal :label="t('Total')" :value="pair.erp.returnTotal != null ? formatIDR(pair.erp.returnTotal) : '—'" />
              <ContentList horizontal :label="t('Invoice − return')" :value="formatIDR(nettedAnchor(pair))" />
            </div>

            <!-- Alternative candidates -->
            <!-- Airene (US-014): asked when the drawer opens on an eligible row; same cache as the row. -->
            <div v-if="showCandidates && aireneOn" class="rdd-section">
              <VatReconciliationAireneSuggestions :pair="pair" :side="side" :period-id="periodId ?? activePeriodId" :finalized="!!finalized" context="drawer" @matched="close" />
            </div>
            <div v-if="showCandidates" class="rdd-section">
              <div class="rdd-section-head">
                <MpText size="h4" weight="semiBold">{{ candidatesTitle }}</MpText>
                <span class="rdd-count">{{ matchCandidates.length }}</span>
              </div>
              <div class="rdd-candidates">
                <div v-for="c in matchCandidates" :key="c.ref" class="rdd-candidate">
                  <div class="rdd-candidate-head">
                    <MpIcon name="doc" size="sm" class="rdd-muted-icon" />
                    <div class="rdd-candidate-id">
                      <div class="rdd-candidate-ref">
                        {{ c.ref }} <span class="rdd-candidate-date">· {{ c.date }}</span>
                      </div>
                      <div class="rdd-candidate-party">{{ c.party }}</div>
                    </div>
                    <!-- Duplicate reference: the latest pengganti is the Suggested pick (US-003 AC-02). -->
                    <span v-if="c.suggested" class="rdd-tag" data-devchange="vat-recon-prd-align-duplicate"><MpTag>{{ t('Suggested') }}</MpTag></span>
                    <span v-else-if="pair.match !== 'duplicate-reference'" class="rdd-confidence" :class="{ 'is-strong': c.confidence >= 0.7 }">
                      {{ Math.round(c.confidence * 100) }}% {{ t('match') }}
                    </span>
                  </div>
                  <div class="rdd-candidate-money">
                    <div class="rdd-mini">
                      <span class="rdd-mini-label">DPP</span>
                      <span class="rdd-mini-value">{{ formatAmountPlain(c.dpp) }}</span>
                    </div>
                    <div class="rdd-mini">
                      <span class="rdd-mini-label">PPN</span>
                      <span class="rdd-mini-value">{{ formatAmountPlain(c.ppn) }}</span>
                    </div>
                    <div class="rdd-mini">
                      <span class="rdd-mini-label">{{ t('Total') }}</span>
                      <span class="rdd-mini-value rdd-mini-value--strong">{{ formatAmountPlain(c.total) }}</span>
                    </div>
                  </div>
                  <div class="rdd-candidate-foot">
                    <span class="rdd-candidate-why">{{ t(c.why) }}</span>
                    <MpButton
                      variant="secondary" size="sm" is-rounded
                      @click="matchThis(c)"
                    >
                      {{ pair.match === 'duplicate-reference' ? t('Select faktur') : t('Match this') }}
                    </MpButton>
                  </div>
                </div>
              </div>
              <p v-if="finalizedError" class="rdd-error" role="alert">
                {{ t('This period is finalized. Unfinalize it first to change matches.') }}
              </p>
            </div>

            <!-- Provenance line opens the activity log (rule/activity-log-trigger) -->
            <a v-if="lastActivity" class="detail-updated" @click.prevent="activityOpen = true">
              {{ t('Last updated by') }} {{ t(lastActivity.who) }} {{ t('on') }} {{ formatDateTimeLong(lastActivity.at) }}
            </a>
      </div>
    </template>

    <!-- State-driven footer -->
    <template #footer>
      <template v-if="pair">
        <!-- Drawer footer: ghost Cancel left; secondary + primary right
             (BillsFiltersDrawer shell, rule/form-actions-always-present). -->
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" data-devchange="vat-recon-drawer-footer" @click="close">
          {{ t('Cancel') }}
        </MpButton>
        <div class="rdd-footer-actions" data-devchange="vat-recon-drawer-footer">
          <MpButton v-if="pair.djp" class="btn-enterprise btn-enterprise--secondary" variant="secondary" is-rounded type="button" @click="act(t('Opening tax document…'))">
            {{ t('View tax document') }}
          </MpButton>
          <VatReconciliationPairActions
            :pair="pair"
            :side="side"
            :finalized="!!finalized"
            :period-id="periodId"
            @action="(message, alsoClose) => act(message, alsoClose)"
          />
        </div>
      </template>
    </template>
  </ErpDrawer>

  <ActivityLogModal
    :is-open="activityOpen"
    :subject="headerRef"
    :entries="logEntries"
    @close="activityOpen = false"
  />

  <VatReconciliationMatchConfirmModal
    :is-open="!!pendingCandidate"
    :row-ref="headerRef"
    :row-total="anchorTotal"
    :candidate-ref="pendingCandidate?.ref ?? ''"
    :candidate-total="pendingCandidate?.total ?? 0"
    @close="pendingCandidate = null"
    @confirm="() => pendingCandidate && saveMatch(pendingCandidate)"
  />
</template>

<style scoped>
.rdd-body {
  --rdd-badge-p: 1px var(--mp-spacing-2);
  --rdd-confidence-p: 2px var(--mp-spacing-2);
  --rdd-activity-sz: 24px;
}
/* ErpDrawer owns the panel, header bar, scrolling body and footer. */

.rdd-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.rdd-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); }

/* ── Comparison: two ContentList columns ── */
.rdd-compare { display: grid; grid-template-columns: 1fr 1fr; }
.rdd-compare-col { display: flex; flex-direction: column; min-width: 0; }
/* Vertical divider between Transaction and Tax document, as in the workspace expand. */
.rdd-compare-col:first-child { padding-right: var(--mp-spacing-6); }
.rdd-compare-col + .rdd-compare-col { padding-left: var(--mp-spacing-6); border-left: 1px solid var(--mp-border-default); }
.rdd-reason-title { display: block; font-weight: var(--mp-font-weights-semi-bold); }
.rdd-reason-body { display: block; }
.rdd-diff { color: var(--mp-colors-red-800); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Sections ── */
.rdd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rdd-section-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.rdd-count {
  padding: var(--rdd-badge-p); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-subtle);
  font-size: 11px; font-weight: var(--mp-font-weights-bold);
}

/* ── Candidates ── */
.rdd-candidates { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rdd-candidate {
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-3);
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
}
.rdd-candidate-head { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.rdd-muted-icon { color: var(--mp-text-subtle); flex-shrink: 0; }
.rdd-candidate-id { flex: 1; min-width: 0; }
.rdd-tag { display: inline-flex; flex-shrink: 0; }
.rdd-candidate-ref { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rdd-candidate-date { color: var(--mp-text-subtle); font-weight: var(--mp-font-weights-regular); }
.rdd-candidate-party { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }
.rdd-confidence {
  padding: var(--rdd-confidence-p); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-subtle);
  font-size: 11px; font-weight: var(--mp-font-weights-bold);
  white-space: nowrap; flex-shrink: 0;
}
.rdd-confidence.is-strong { background: var(--mp-airene-badge-bg); color: var(--mp-airene-bold); }
.rdd-candidate-money { display: flex; gap: var(--mp-spacing-6); padding-left: 28px; }
.rdd-mini { display: flex; flex-direction: column; }
.rdd-mini-label {
  font-size: 11px; font-weight: var(--mp-font-weights-bold);
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--mp-text-subtle);
}
.rdd-mini-value { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.rdd-mini-value--strong { font-weight: var(--mp-font-weights-bold); }
.rdd-candidate-foot {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); padding-left: 28px;
}
.rdd-candidate-why { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }

/* ── Provenance link → activity log (same as detail pages' .detail-updated) ── */
.detail-updated {
  margin: 0; align-self: flex-start;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Footer ── */
.rdd-footer-actions { display: flex; gap: var(--mp-spacing-2); }
</style>
