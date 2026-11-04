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
import { MpButton, MpText, MpIcon } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import VatReconciliationPairActions from '~/components/patterns/VatReconciliationPairActions.vue'
import VatReconciliationMatchConfirmModal from '~/components/patterns/VatReconciliationMatchConfirmModal.vue'
import { successToast } from '~/utils/toasts'
import {
  MATCH_META, candidatesFor, formatAmountPlain, pairActivity, activePeriodId, confirmManualMatch,
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
const showCandidates = computed(() =>
  props.pair ? ['not-in-coretax', 'no-match-in-erp', 'duplicate-reference'].includes(props.pair.match) : false,
)
/** Derived from the pair, so they're about this row (candidatesFor). */
const matchCandidates = computed(() => (props.pair ? candidatesFor(props.pair) : []))

interface CompareField { key: string; label: string; money?: boolean }

const compareFields = computed<CompareField[]>(() => [
  { key: 'ref', label: 'Reference' },
  { key: 'date', label: 'Date' },
  props.side === 'input'
    ? { key: 'vendor', label: 'Vendor' }
    : { key: 'customer', label: 'Customer' },
  { key: 'npwp', label: 'NPWP' },
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
  return t(MATCH_META[props.pair.match].longLabel)
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
function saveMatch(c: MatchCandidate, reason?: string) {
  if (!props.pair) return
  const ok = confirmManualMatch({
    pair: props.pair, periodId: props.periodId ?? activePeriodId, side: props.side, candidate: c, reason,
  })
  if (!ok) return
  pendingCandidate.value = null
  successToast(t('Match confirmed'))
  close()
}

/** Built from the records the module keeps (pairActivity) — never invented. */
const activity = computed(() =>
  props.pair ? pairActivity(props.pair, props.periodId ?? activePeriodId) : [])
</script>

<template>
  <ErpDrawer
    :is-open="isOpen && !!pair"
    :title="headerRef"
    width="720px"
    data-devchange="vat-recon-ui-review"
    @close="close"
  >
    <template #title>
      <div v-if="pair && meta" class="rdd-header-main">
        <div
          class="rdd-state-icon"
          :style="{ background: meta.bg, borderColor: meta.border }"
        >
          <!-- MpIcon ignores CSS `color`; the state colour must come from
               the prop. Light tint behind it → outline colour. -->
          <MpIcon :name="meta.icon" size="md" :color="meta.iconColorOutline" />
        </div>
        <div class="rdd-header-text">
          <MpText size="h3" weight="semiBold">{{ headerRef }}</MpText>
          <span class="rdd-header-sub">
            {{ t('Reconciliation detail') }} · {{ t(meta.longLabel) }}
          </span>
        </div>
      </div>
    </template>

    <template #body>
      <div v-if="pair && meta" class="rdd-body">
            <!-- Side-by-side comparison -->
            <div class="rdd-compare">
              <div class="rdd-compare-head">
                <span>{{ t('From ERP') }}</span>
                <span>{{ t('From Coretax') }}</span>
              </div>
              <div
                v-for="f in compareFields"
                :key="f.key"
                class="rdd-compare-row"
                :class="{ 'is-diff': isDiff(f) }"
              >
                <div class="rdd-compare-cell">
                  <span class="rdd-cell-label">{{ t(f.label) }}</span>
                  <span class="rdd-cell-value" :class="{ 'is-diff': isDiff(f) }">
                    {{ cellValue(pair.erp, f) }}
                  </span>
                </div>
                <div class="rdd-compare-cell rdd-compare-cell--last">
                  <span class="rdd-cell-label">{{ t(f.label) }}</span>
                  <span class="rdd-cell-value" :class="{ 'is-diff': isDiff(f) }">
                    {{ cellValue(pair.djp, f) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Engine reasoning -->
            <div
              v-if="pair.reason"
              class="rdd-reason"
              :style="{ background: meta.bg, borderColor: meta.border }"
            >
              <MpIcon :name="meta.icon" size="sm" :color="meta.iconColorOutline" />
              <div>
                <div class="rdd-reason-title" :style="{ color: meta.fg }">{{ reasonTitle }}</div>
                <div class="rdd-reason-body">{{ pair.reason }}</div>
              </div>
            </div>

            <!-- Alternative candidates -->
            <div v-if="showCandidates" class="rdd-section">
              <div class="rdd-section-head">
                <MpText size="h4" weight="semiBold">{{ t('Other match candidates') }}</MpText>
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
                    <span class="rdd-confidence" :class="{ 'is-strong': c.confidence >= 0.7 }">
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
                    <span class="rdd-candidate-why">{{ c.why }}</span>
                    <MpButton
                      variant="secondary" size="sm" is-rounded
                      @click="matchThis(c)"
                    >
                      {{ t('Match this') }}
                    </MpButton>
                  </div>
                </div>
              </div>
              <p v-if="finalizedError" class="rdd-error" role="alert">
                {{ t('This period is finalized. Unfinalize it first to change matches.') }}
              </p>
            </div>

            <!-- Activity -->
            <div class="rdd-section">
              <MpText size="h4" weight="semiBold">{{ t('Activity') }}</MpText>
              <div class="rdd-activity">
                <div v-for="(a, i) in activity" :key="i" class="rdd-activity-row">
                  <div class="rdd-activity-icon">
                    <MpIcon :name="a.icon" size="sm" />
                  </div>
                  <div>
                    <div class="rdd-activity-text">
                      {{ t(a.label) }}<template v-if="a.status">: {{ t(a.status) }}</template>
                      <span v-if="a.detail" class="rdd-activity-detail">{{ a.detail }}</span>
                    </div>
                    <div class="rdd-activity-meta">{{ t(a.who) }} · {{ a.time }}</div>
                  </div>
                </div>
              </div>
            </div>
      </div>
    </template>

    <!-- State-driven footer -->
    <template #footer>
      <template v-if="pair">
        <MpButton variant="ghost" is-rounded @click="act(t('Opening Coretax…'))">
          {{ t('Open in Coretax') }}
        </MpButton>
        <div class="rdd-footer-actions">
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

  <VatReconciliationMatchConfirmModal
    :is-open="!!pendingCandidate"
    :row-ref="headerRef"
    :row-total="anchorTotal"
    :candidate-ref="pendingCandidate?.ref ?? ''"
    :candidate-total="pendingCandidate?.total ?? 0"
    @close="pendingCandidate = null"
    @confirm="(reason: string) => pendingCandidate && saveMatch(pendingCandidate, reason)"
  />
</template>

<style scoped>
.rdd-header-main, .rdd-body {
  --rdd-icon-sz: 40px;
  --rdd-badge-p: 1px var(--mp-spacing-2);
  --rdd-confidence-p: 2px var(--mp-spacing-2);
  --rdd-activity-sz: 24px;
}
/* ErpDrawer owns the panel, header bar, scrolling body and footer. */
.rdd-header-main { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.rdd-state-icon {
  width: var(--rdd-icon-sz); height: var(--rdd-icon-sz); border-radius: var(--mp-radii-md);
  border: 1px solid transparent;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.rdd-header-text { display: flex; flex-direction: column; min-width: 0; }
.rdd-header-sub { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }

.rdd-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.rdd-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); }

/* ── Comparison table ── */
.rdd-compare { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.rdd-compare-head {
  display: grid; grid-template-columns: 1fr 1fr;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  font-size: 11px; font-weight: var(--mp-font-weights-bold);
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--mp-text-subtle);
}
.rdd-compare-row {
  display: grid; grid-template-columns: 1fr 1fr;
  border-top: 1px solid var(--mp-border-default);
}
.rdd-compare-row.is-diff { background: var(--mp-colors-orange-100); }
.rdd-compare-cell {
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-right: 1px solid var(--mp-border-default);
  display: flex; flex-direction: column; gap: 2px; min-width: 0;
}
.rdd-compare-cell--last { border-right: 0; }
.rdd-cell-label {
  font-size: 11px; font-weight: var(--mp-font-weights-bold);
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--mp-text-subtle);
}
.rdd-cell-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); word-break: break-word; }
.rdd-cell-value.is-diff { color: var(--mp-colors-orange-800); font-weight: var(--mp-font-weights-bold); }

/* ── Engine reasoning ── */
.rdd-reason {
  display: flex; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3);
  border: 1px solid transparent; border-radius: var(--mp-radii-md);
}
.rdd-reason-title {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-bold);
  margin-bottom: var(--mp-spacing-1);
}
.rdd-reason-body { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }

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

/* ── Activity ── */
.rdd-activity-detail { display: block; color: var(--mp-text-secondary); overflow-wrap: anywhere; }
.rdd-activity { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.rdd-activity-row {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3);
}
.rdd-activity-row + .rdd-activity-row { border-top: 1px solid var(--mp-border-default); }
.rdd-activity-icon {
  width: var(--rdd-activity-sz); height: var(--rdd-activity-sz); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: var(--mp-text-subtle);
}
.rdd-activity-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rdd-activity-meta { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }

/* ── Footer ── */
.rdd-footer-actions { display: flex; gap: var(--mp-spacing-2); }
</style>
