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
 * 720px floating drawer. The size="full" + :deep width override is the same
 * workaround used by TaxDocumentDetailDrawer.vue (a fixed size preset's stale
 * width lookup fights the override and freezes the open animation).
 */
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpButton, MpText, MpIcon,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import {
  MATCH_META, matchCandidates, formatAmountPlain,
  type ReconPair, type ReconSide,
} from '~/data/vatReconciliation'

const props = defineProps<{
  isOpen: boolean
  pair: ReconPair | null
  side: ReconSide
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
  props.pair ? ['suggested', 'erp-only', 'djp-only'].includes(props.pair.match) : false,
)

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
  switch (props.pair.match) {
    case 'suggested':
      return `${t('AI suggested match')} · ${Math.round(props.pair.confidence * 100)}% ${t('confidence')}`
    case 'discrepancy':
      return t('Discrepancy detected')
    default:
      return t('Unmatched record')
  }
})

const activity = computed(() => [
  { icon: 'refresh', text: t('Synced from Coretax'), who: t('System'), time: '21 May 2026, 14:32' },
  {
    icon: 'magic',
    text: props.pair?.match === 'matched'
      ? t('Auto-matched on NPWP, DPP, PPN and date')
      : t('Flagged for review by matching engine'),
    who: t('Reconciliation engine'), time: '21 May 2026, 14:32',
  },
  {
    icon: 'doc',
    text: props.side === 'input' ? t('Purchase invoice posted') : t('Sales invoice posted'),
    who: 'Rizal Candra', time: '10 Apr 2026, 09:11',
  },
])
</script>

<template>
  <MpDrawer
    id="reconciliation-detail-drawer"
    :is-open="isOpen"
    placement="right"
    size="full"
    variant="floating"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="close"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div v-if="pair && meta" class="rdd-card">
          <!-- Header -->
          <div class="rdd-header">
            <div class="rdd-header-main">
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
            <MpButton left-icon="close" variant="ghost" size="sm" :aria-label="t('Close')" @click="close" />
          </div>

          <div class="rdd-body">
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
                      variant="secondary" size="sm" is-rounded left-icon="link"
                      @click="act(t('Match confirmed'))"
                    >
                      {{ t('Match this') }}
                    </MpButton>
                  </div>
                </div>
              </div>
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
                    <div class="rdd-activity-text">{{ a.text }}</div>
                    <div class="rdd-activity-meta">{{ a.who }} · {{ a.time }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- State-driven footer -->
          <div class="rdd-footer">
            <MpButton variant="ghost" is-rounded @click="act(t('Opening Coretax…'))">
              {{ t('Open in Coretax') }}
            </MpButton>
            <div class="rdd-footer-actions">
              <template v-if="pair.match === 'matched'">
                <MpButton variant="secondary" is-rounded @click="act(t('Match canceled'), true)">
                  {{ t('Unmatch') }}
                </MpButton>
              </template>
              <template v-else-if="pair.match === 'suggested'">
                <MpButton variant="secondary" is-rounded @click="act(t('Suggestion ignored'), true)">
                  {{ t('Ignore') }}
                </MpButton>
                <MpButton variant="primary" is-rounded left-icon="check" @click="act(t('Match confirmed'), true)">
                  {{ t('Match') }}
                </MpButton>
              </template>
              <template v-else-if="pair.match === 'discrepancy'">
                <MpButton variant="secondary" is-rounded left-icon="edit" @click="act(t('Opening ERP record…'))">
                  {{ t('Adjust ERP record') }}
                </MpButton>
                <MpButton variant="primary" is-rounded left-icon="check" @click="act(t('Discrepancy accepted'), true)">
                  {{ t('Accept anyway') }}
                </MpButton>
              </template>
              <template v-else>
                <MpButton variant="secondary" is-rounded left-icon="flag" @click="act(t('Record flagged for follow-up'))">
                  {{ t('Flag') }}
                </MpButton>
                <MpButton variant="primary" is-rounded left-icon="add" @click="act(t('Opening create form…'), true)">
                  {{ pair.match === 'erp-only' ? t('Create faktur') : t('Create purchase invoice') }}
                </MpButton>
              </template>
            </div>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
.rdd-card {
  display: flex; flex-direction: column; height: 100%;
  background: var(--mp-background-surface);
}
:deep([data-pixel-component="MpDrawerContent"]) {
  width: 720px !important;
  max-width: 92vw !important;
}

.rdd-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.rdd-header-main { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.rdd-state-icon {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  border: 1px solid transparent;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.rdd-header-text { display: flex; flex-direction: column; min-width: 0; }
.rdd-header-sub { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }

.rdd-body {
  flex: 1; overflow-y: auto;
  padding: var(--mp-spacing-4);
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}

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
  padding: 1px var(--mp-spacing-2); border-radius: var(--mp-radii-full);
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
  padding: 2px var(--mp-spacing-2); border-radius: var(--mp-radii-full);
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
.rdd-activity { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.rdd-activity-row {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3);
}
.rdd-activity-row + .rdd-activity-row { border-top: 1px solid var(--mp-border-default); }
.rdd-activity-icon {
  width: 24px; height: 24px; border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: var(--mp-text-subtle);
}
.rdd-activity-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rdd-activity-meta { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }

/* ── Footer ── */
.rdd-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.rdd-footer-actions { display: flex; gap: var(--mp-spacing-2); }
</style>
