<script setup lang="ts">
/**
 * VAT reconciliation workspace — the side-by-side match screen.
 *
 * One component serves both sides; the side is derived from the page key
 * ('Faktur keluaran' → output/sales, 'Faktur masukan' → input/purchases) since
 * the layout is identical and only the labels and dataset differ.
 *
 * Layout: KPI strip → toolbar (Status select, AI action, search) → two-column
 * workspace card (ERP left, Coretax right, match connector between) → footer
 * summary. Clicking either side of a row opens the detail drawer.
 *
 * **The masa pajak is not selectable here.** It's chosen on the period index and
 * arrives as `?masa=`, so this page is always scoped to one period — a picker
 * would let you contradict the row you clicked to get here. The masa reads as
 * context beside the H1, and the breadcrumb goes back to the index (both in
 * [...slug].vue, which also owns the title-bar actions).
 */
import { MpIcon, MpButton, MpBadge, MpAireneButton } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import ReconciliationDetailDrawer from '~/components/patterns/ReconciliationDetailDrawer.vue'
import {
  MATCH_META, SIDE_LABELS, pairsForSide, reconTotals, matchCounts,
  lastSyncedAt, formatAmountPlain, partyOf, exposureOf,
  type ReconPair, type ReconSide, type MatchState,
} from '~/data/vatReconciliation'

const { t } = useLocale()
const { currentPageKey } = useNavigation()

const side = computed<ReconSide>(() => (currentPageKey.value === 'Faktur masukan' ? 'input' : 'output'))
const L = computed(() => SIDE_LABELS[side.value])
const pairs = computed(() => pairsForSide(side.value))

// ── Filters ───────────────────────────────────────────────────────────────────
/**
 * Two controls, two axes — deliberately not one flat list of chips (Pixel has no
 * filter-chip component; see docs/patterns/tabs.md and ErpFilterBar.md):
 *
 *  • **Scope** — the page-level tab, read from `?tab=`. Registered in `pageTabs`
 *    in [...slug].vue, same as the sibling Unmatched & discrepancies screen.
 *    Defaults to 'Needs attention' because in a real masa pajak the engine
 *    auto-matches ~90% of faktur, so opening on the full ledger fills the screen
 *    with rows nobody needs to look at. 'All faktur' is one click away for audit.
 *  • **Status** — the in-page `Status` select, narrowing within that scope.
 *
 * The select's options are scoped to the tab, so the two can't contradict each
 * other (no "Needs attention + Matched" dead end).
 */
const route = useRoute()

const isAttentionScope = computed(() => route.query.tab !== 'All faktur')

const ATTENTION_STATES: MatchState[] = ['suggested', 'discrepancy', 'erp-only', 'djp-only']

const statusFilter = ref<MatchState | ''>('')
const query = ref('')

// Reset the filters when switching sides or scope — the counts differ, so a
// filter carried over can land the user on an empty table for no visible reason.
watch([side, isAttentionScope], () => { statusFilter.value = ''; query.value = '' })

const matchesFilter = (p: ReconPair) =>
  statusFilter.value ? p.match === statusFilter.value
  : isAttentionScope.value ? p.match !== 'matched'
  : true

const filtered = computed(() => {
  const rows = pairs.value.filter((p) => {
    if (!matchesFilter(p)) return false
    if (!query.value) return true
    const q = query.value.toLowerCase()
    const haystack = [
      p.erp?.ref, p.erp && partyOf(p.erp), p.erp?.npwp,
      p.djp?.ref, p.djp && partyOf(p.djp), p.djp?.npwp,
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(q)
  })
  // Work queues lead with the biggest money at stake; the full ledger and the
  // matched view stay in document order, which is what you want when verifying.
  const isWorkQueue = statusFilter.value !== 'matched' && (isAttentionScope.value || !!statusFilter.value)
  return isWorkQueue
    ? [...rows].sort((a, b) => exposureOf(b) - exposureOf(a))
    : rows
})

const counts = computed(() => matchCounts(pairs.value))
const erpTotals = computed(() => reconTotals(pairs.value, 'erp'))
const djpTotals = computed(() => reconTotals(pairs.value, 'djp'))

const dppDelta = computed(() => djpTotals.value.dpp - erpTotals.value.dpp)
const ppnDelta = computed(() => djpTotals.value.ppn - erpTotals.value.ppn)
/** The headline number: total tax gap between the books and Coretax. */
const taxGap = computed(() =>
  (djpTotals.value.dpp + djpTotals.value.ppn) - (erpTotals.value.dpp + erpTotals.value.ppn))

/** Pairs the engine wants a human to look at. */
const reviewCount = computed(() => counts.value.suggested! + counts.value.discrepancy!)
const unmatchedCount = computed(() => counts.value['erp-only']! + counts.value['djp-only']!)

/**
 * Options for the `Status` select, scoped to the active tab. Under "Needs
 * attention" a Matched option would always return nothing, so it isn't offered.
 * Counts ride along in the label — the select is the only place they survive now
 * that the chip row is gone.
 */
const statusOptions = computed(() => {
  const states = isAttentionScope.value
    ? ATTENTION_STATES
    : (['matched', ...ATTENTION_STATES] as MatchState[])
  return states.map(k => ({
    value: k,
    label: `${t(MATCH_META[k].chipLabel)} (${counts.value[k] ?? 0})`,
  }))
})

// ── Detail drawer ─────────────────────────────────────────────────────────────
const drawerOpen = ref(false)
const activePair = ref<ReconPair | null>(null)

function openDetail(pair: ReconPair) {
  activePair.value = pair
  drawerOpen.value = true
}

// ── Row helpers ───────────────────────────────────────────────────────────────
function metaFor(pair: ReconPair) { return MATCH_META[pair.match] }
/**
 * One-sided pairs get an outline connector dot (nothing to connect to), the rest
 * a filled one. Drives both the dot treatment and which icon colour reads on it.
 */
function isOutlineDot(pair: ReconPair) {
  return pair.match === 'erp-only' || pair.match === 'djp-only'
}
function isDiffField(pair: ReconPair, field: string) { return (pair.fields ?? []).includes(field) }
/** The AI banner only makes sense where the engine actually reasoned about the pair. */
function showsReason(pair: ReconPair) {
  return !!pair.reason && (pair.match === 'suggested' || pair.match === 'discrepancy')
}

function acceptAll() {
  infoToast(`${counts.value.suggested} ${t('matches confirmed')}`)
}
</script>

<template>
  <div class="vr-page">
    <!-- KPI strip -->
    <div class="vr-kpis">
      <div class="vr-kpi">
        <div class="vr-kpi-head">
          <span class="vr-kpi-label">{{ t(L.kpiErpDpp) }}</span>
          <MpIcon name="database" size="sm" class="vr-kpi-icon" />
        </div>
        <div class="vr-kpi-value">{{ formatIDR(erpTotals.dpp) }}</div>
        <span class="vr-kpi-sub">{{ t('From ERP') }}</span>
      </div>

      <div class="vr-kpi">
        <div class="vr-kpi-head">
          <span class="vr-kpi-label">{{ t(L.kpiDjpDpp) }}</span>
          <MpIcon name="cloud" size="sm" class="vr-kpi-icon" />
        </div>
        <div class="vr-kpi-value">{{ formatIDR(djpTotals.dpp) }}</div>
        <div class="vr-kpi-sub-row">
          <span class="vr-kpi-sub">{{ t('From Coretax') }}</span>
          <span v-if="dppDelta !== 0" class="vr-delta">
            {{ dppDelta > 0 ? '▲' : '▼' }} {{ formatIDR(Math.abs(dppDelta)) }}
          </span>
        </div>
      </div>

      <div class="vr-kpi">
        <div class="vr-kpi-head">
          <span class="vr-kpi-label">{{ t(L.kpiErpPpn) }}</span>
          <MpIcon name="database" size="sm" class="vr-kpi-icon" />
        </div>
        <div class="vr-kpi-value">{{ formatIDR(erpTotals.ppn) }}</div>
        <span class="vr-kpi-sub">{{ t('From ERP') }}</span>
      </div>

      <div class="vr-kpi">
        <div class="vr-kpi-head">
          <span class="vr-kpi-label">{{ t(L.kpiDjpPpn) }}</span>
          <MpIcon name="cloud" size="sm" class="vr-kpi-icon" />
        </div>
        <div class="vr-kpi-value">{{ formatIDR(djpTotals.ppn) }}</div>
        <div class="vr-kpi-sub-row">
          <span class="vr-kpi-sub">{{ t('From Coretax') }}</span>
          <span v-if="ppnDelta !== 0" class="vr-delta">
            {{ ppnDelta > 0 ? '▲' : '▼' }} {{ formatIDR(Math.abs(ppnDelta)) }}
          </span>
        </div>
      </div>

      <div class="vr-kpi" :class="taxGap === 0 ? 'is-clear' : 'is-gap'">
        <div class="vr-kpi-head">
          <span class="vr-kpi-label">{{ t('Tax difference') }}</span>
          <MpIcon name="finance" size="sm" />
        </div>
        <div class="vr-kpi-value">{{ formatIDR(Math.abs(taxGap)) }}</div>
        <span class="vr-kpi-sub">{{ taxGap === 0 ? t('Fully reconciled') : t('Not reconciled') }}</span>
      </div>
    </div>

    <!-- Filter bar — docs/patterns/index-page-format.md §A.3: quick filters left
         (max 2, MpSelect-styled, 160px, placeholder = filter name, real values
         only), AI action + search right. Search never sits between filters. -->
    <div class="vr-toolbar">
      <div class="filter-left">
        <!-- No masa pajak filter here: the period is chosen on the index and
             arrives as ?masa=, so a second picker would be a way to contradict
             the page you navigated into. It reads as context next to the H1
             instead (titleMeta in [...slug].vue). -->

        <!-- Status — placeholder is the bare object noun per the UXW rule. -->
        <div class="filter-select-wrap">
          <select v-model="statusFilter" class="filter-select" :aria-label="t('Status')">
            <option value="">{{ t('Status') }}</option>
            <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <svg class="filter-select-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <div class="filter-right">
        <MpAireneButton
          v-if="reviewCount > 0"
          id="vr-airene-review"
          is-show-badge
          @click="acceptAll"
        >
          {{ t('Review with Airene') }}
        </MpAireneButton>

        <div class="filter-search">
          <MpIcon name="search" size="sm" class="vr-search-icon" />
          <input v-model="query" class="filter-search-input" type="text" :placeholder="t('Search...')" >
          <button
            v-if="query"
            type="button"
            class="search-clear-btn"
            :aria-label="t('Clear search')"
            @click="query = ''"
          >
            <MpIcon name="close" size="16px" />
          </button>
        </div>
      </div>
    </div>

    <!-- Workspace -->
    <div class="vr-workspace">
      <div class="vr-cols-head">
        <div class="vr-col-head">
          <div class="vr-col-icon"><MpIcon name="database" size="sm" /></div>
          <div class="vr-col-text">
            <span class="vr-col-title">
              {{ t(L.erpHeader) }} <span class="vr-col-count">({{ erpTotals.count }})</span>
            </span>
            <span class="vr-col-sub">{{ L.erpHeaderSub }}</span>
          </div>
        </div>
        <div />
        <div class="vr-col-head vr-col-head--right">
          <div class="vr-col-text vr-col-text--right">
            <span class="vr-col-title">
              {{ t(L.djpHeader) }} <span class="vr-col-count">({{ djpTotals.count }})</span>
            </span>
            <span class="vr-col-sub">{{ L.djpHeaderSub }}</span>
          </div>
          <div class="vr-col-icon"><MpIcon name="cloud" size="sm" /></div>
        </div>
      </div>

      <div class="vr-rows">
        <div v-if="filtered.length === 0" class="vr-empty">
          <div class="vr-empty-title">{{ t('No faktur match your filters') }}</div>
          <div class="vr-empty-body">{{ t('Recheck the filters you have applied and try filtering again.') }}</div>
        </div>

        <div
          v-for="pair in filtered"
          :key="pair.id"
          class="vr-row"
          :style="pair.match === 'matched' ? { background: metaFor(pair).bg } : undefined"
        >
          <!-- ERP side -->
          <template v-if="pair.erp">
            <button type="button" class="vr-side" @click="openDetail(pair)">
              <div class="vr-side-head">
                <MpIcon name="doc" size="sm" class="vr-side-icon" />
                <span class="vr-side-ref">{{ pair.erp.ref }}</span>
                <span class="vr-side-date">{{ pair.erp.date }}</span>
              </div>
              <div class="vr-side-party">{{ partyOf(pair.erp) }}</div>
              <div class="vr-side-npwp">NPWP {{ pair.erp.npwp }}</div>
              <div class="vr-money">
                <div class="vr-money-cell" :class="{ 'is-diff': isDiffField(pair, 'dpp') }">
                  <span class="vr-money-label">DPP{{ isDiffField(pair, 'dpp') ? ' *' : '' }}</span>
                  <span class="vr-money-value">{{ formatAmountPlain(pair.erp.dpp) }}</span>
                </div>
                <div class="vr-money-cell" :class="{ 'is-diff': isDiffField(pair, 'ppn') }">
                  <span class="vr-money-label">PPN{{ isDiffField(pair, 'ppn') ? ' *' : '' }}</span>
                  <span class="vr-money-value">{{ formatAmountPlain(pair.erp.ppn) }}</span>
                </div>
                <div class="vr-money-cell" :class="{ 'is-diff': isDiffField(pair, 'total') }">
                  <span class="vr-money-label">{{ t('Total') }}{{ isDiffField(pair, 'total') ? ' *' : '' }}</span>
                  <span class="vr-money-value vr-money-value--strong">{{ formatAmountPlain(pair.erp.total) }}</span>
                </div>
              </div>
            </button>
          </template>
          <div v-else class="vr-side vr-side--empty vr-side--empty-left">
            <div class="vr-empty-head">
              <MpIcon name="warning-triangle" size="sm" color="icon.danger" />
              <span>{{ t('No match in ERP') }}</span>
            </div>
            <span class="vr-empty-hint">
              {{ side === 'input' ? t('Create a purchase invoice from this faktur to reconcile.') : t('Create a sales invoice from this faktur to reconcile.') }}
            </span>
            <MpButton
              variant="secondary" size="sm" is-rounded left-icon="add"
              @click="infoToast(t(L.erpEmptyToast))"
            >
              {{ t(L.erpEmptyAction) }}
            </MpButton>
          </div>

          <!-- Connector -->
          <div class="vr-connector" :style="{ background: metaFor(pair).bg }">
            <div
              class="vr-connector-dot"
              :class="{ 'is-outline': isOutlineDot(pair) }"
              :style="isOutlineDot(pair)
                ? { borderColor: metaFor(pair).dot }
                : { background: metaFor(pair).dot, boxShadow: `0 0 0 4px ${metaFor(pair).bg}` }"
            >
              <!-- MpIcon ignores CSS `color` (it inline-styles --mp-icon-color on
                   its own svg), so the colour has to come from the prop: inverse
                   on the filled dot, the state colour on the outline one. -->
              <MpIcon
                :name="metaFor(pair).icon"
                size="sm"
                :color="isOutlineDot(pair) ? metaFor(pair).iconColorOutline : metaFor(pair).iconColor"
              />
            </div>
            <span
              v-if="pair.match === 'suggested' || pair.match === 'discrepancy'"
              class="vr-connector-pct"
              :style="{ color: metaFor(pair).fg }"
            >
              {{ Math.round(pair.confidence * 100) }}%
            </span>
          </div>

          <!-- Coretax side -->
          <template v-if="pair.djp">
            <button type="button" class="vr-side vr-side--right" @click="openDetail(pair)">
              <div class="vr-side-head vr-side-head--right">
                <MpIcon name="doc" size="sm" class="vr-side-icon" />
                <span class="vr-side-ref">{{ pair.djp.ref }}</span>
                <span class="vr-side-date">{{ pair.djp.date }}</span>
                <MpBadge :type="pair.djp.approved ? 'completed' : 'critical'" for="tableStatus" size="sm">
                  {{ pair.djp.approved ? t('Approved') : t('Not approved') }}
                </MpBadge>
              </div>
              <div class="vr-side-party">{{ partyOf(pair.djp) }}</div>
              <div class="vr-side-npwp">NPWP {{ pair.djp.npwp }}</div>
              <div class="vr-money">
                <div class="vr-money-cell" :class="{ 'is-diff': isDiffField(pair, 'dpp') }">
                  <span class="vr-money-label">DPP{{ isDiffField(pair, 'dpp') ? ' *' : '' }}</span>
                  <span class="vr-money-value">{{ formatAmountPlain(pair.djp.dpp) }}</span>
                </div>
                <div class="vr-money-cell" :class="{ 'is-diff': isDiffField(pair, 'ppn') }">
                  <span class="vr-money-label">PPN{{ isDiffField(pair, 'ppn') ? ' *' : '' }}</span>
                  <span class="vr-money-value">{{ formatAmountPlain(pair.djp.ppn) }}</span>
                </div>
                <div class="vr-money-cell" :class="{ 'is-diff': isDiffField(pair, 'total') }">
                  <span class="vr-money-label">{{ t('Total') }}{{ isDiffField(pair, 'total') ? ' *' : '' }}</span>
                  <span class="vr-money-value vr-money-value--strong">{{ formatAmountPlain(pair.djp.total) }}</span>
                </div>
              </div>
            </button>
          </template>
          <div v-else class="vr-side vr-side--empty vr-side--empty-right">
            <div class="vr-empty-head">
              <MpIcon name="warning-triangle" size="sm" />
              <span>{{ t('Not found in Coretax') }}</span>
            </div>
            <span class="vr-empty-hint">{{ t('Issue a faktur pajak in Coretax to match this invoice.') }}</span>
            <MpButton
              variant="secondary" size="sm" is-rounded left-icon="add"
              @click="infoToast(t(L.djpEmptyToast))"
            >
              {{ t(L.djpEmptyAction) }}
            </MpButton>
          </div>

          <!-- Engine reasoning banner -->
          <div
            v-if="showsReason(pair)"
            class="vr-reason"
            :style="{ background: metaFor(pair).bg, borderTopColor: metaFor(pair).border, color: metaFor(pair).fg }"
          >
            <!-- Light tint behind it → state colour, not inverse. -->
            <MpIcon :name="metaFor(pair).icon" size="sm" :color="metaFor(pair).iconColorOutline" />
            <span class="vr-reason-title">
              {{ pair.match === 'suggested'
                ? `${t('AI suggested match')} · ${Math.round(pair.confidence * 100)}% ${t('confidence')}`
                : t('Discrepancy detected') }}
            </span>
            <span class="vr-reason-body">· {{ pair.reason }}</span>
            <div class="vr-toolbar-spacer" />
            <template v-if="pair.match === 'suggested'">
              <MpButton
                variant="primary" size="sm" is-rounded left-icon="check"
                @click="infoToast(t('Match confirmed'))"
              >
                {{ t('Match') }}
              </MpButton>
              <MpButton variant="ghost" size="sm" is-rounded @click="infoToast(t('Suggestion ignored'))">
                {{ t('Ignore') }}
              </MpButton>
            </template>
            <MpButton v-else variant="secondary" size="sm" is-rounded @click="openDetail(pair)">
              {{ t('Review discrepancy') }}
            </MpButton>
          </div>
        </div>
      </div>

      <div class="vr-foot">
        <span>
          {{ t('Showing') }} {{ filtered.length }} {{ t('of') }} {{ pairs.length }} {{ t('pairs') }}
          · {{ counts.matched }} {{ t('matched') }}
          · {{ reviewCount }} {{ t('need review') }}
          · {{ unmatchedCount }} {{ t('unmatched') }}
        </span>
        <span>{{ t('Last sync') }}: {{ lastSyncedAt }}</span>
      </div>
    </div>

    <ReconciliationDetailDrawer
      v-model:is-open="drawerOpen"
      :pair="activePair"
      :side="side"
      @action="infoToast"
    />
  </div>
</template>

<style scoped>
.vr-page { display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-height: 0; }

/* ── KPI strip ── */
.vr-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
.vr-kpi {
  background: var(--mp-background-surface);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0;
}
.vr-kpi.is-clear { background: var(--mp-colors-green-100); border-color: var(--mp-colors-green-200); color: var(--mp-colors-emerald-800); }
.vr-kpi.is-gap { background: var(--mp-colors-red-100); border-color: var(--mp-colors-red-200); color: var(--mp-colors-red-800); }
.vr-kpi-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.vr-kpi-label {
  font-size: 10px; font-weight: var(--mp-font-weights-bold);
  letter-spacing: 0.06em; text-transform: uppercase; color: inherit;
}
.vr-kpi:not(.is-clear):not(.is-gap) .vr-kpi-label { color: var(--mp-text-secondary); }
.vr-kpi-icon { color: var(--mp-text-subtle); }
.vr-kpi-value {
  font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-bold);
  color: var(--mp-text-default); letter-spacing: -0.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.vr-kpi.is-clear .vr-kpi-value { color: var(--mp-colors-emerald-800); }
.vr-kpi.is-gap .vr-kpi-value { color: var(--mp-colors-red-800); }
.vr-kpi-sub-row { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.vr-kpi-sub { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }
.vr-kpi.is-clear .vr-kpi-sub, .vr-kpi.is-gap .vr-kpi-sub { color: inherit; }
.vr-delta {
  display: inline-flex; align-items: center; gap: 2px;
  padding: 1px var(--mp-spacing-2); border-radius: var(--mp-radii-full);
  background: var(--mp-colors-red-100); color: var(--mp-colors-red-800);
  font-size: 10px; font-weight: var(--mp-font-weights-bold);
  white-space: nowrap;
}

/* ── Toolbar ── */
/* Filter bar — left/right split, mirroring the index-page filter bar. */
.vr-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); flex-wrap: wrap;
}
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* Pill search — copied from SalesInvoicesPage.vue's filter bar. */
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: 248px; height: 36px;
  padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.vr-search-icon { color: var(--mp-text-subtle); flex-shrink: 0; }
.filter-search-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
/* Status select — mirrors the index-page filter bar (SalesInvoicesPage.vue). */
.filter-select-wrap {
  position: relative; display: inline-flex; align-items: center;
  /* 160px fixed per index-page-format.md §A.3. */
  width: 160px; height: 36px;
  flex-shrink: 0;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.filter-select {
  appearance: none; background: transparent; border: none; outline: none;
  width: 100%; height: 100%;
  padding: 0 var(--mp-spacing-10) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); cursor: pointer;
}
/* Unset (placeholder) reads as placeholder text, like every other index page. */
.filter-select:has(option[value=""]:checked) { color: var(--mp-text-placeholder); }
.filter-select-chevron {
  position: absolute; right: var(--mp-spacing-2);
  pointer-events: none; color: var(--mp-text-default);
  width: 20px; height: 20px;
}

/* ── Workspace card ── */
.vr-workspace {
  flex: 1; min-height: 0;
  background: var(--mp-background-surface);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  display: flex; flex-direction: column; overflow: hidden;
}
.vr-cols-head {
  display: grid; grid-template-columns: 1fr 56px 1fr;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.vr-col-head {
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0;
}
.vr-col-head--right { justify-content: flex-end; }
.vr-col-icon {
  width: 28px; height: 28px; border-radius: var(--mp-radii-sm);
  background: var(--mp-background-surface); border: 1px solid var(--mp-border-default);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: var(--mp-text-secondary);
}
.vr-col-text { display: flex; flex-direction: column; min-width: 0; }
.vr-col-text--right { text-align: right; }
.vr-col-title {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-bold);
  color: var(--mp-text-default); white-space: nowrap;
}
.vr-col-count { color: var(--mp-text-subtle); font-weight: var(--mp-font-weights-regular); }
.vr-col-sub {
  font-size: 10px; font-weight: var(--mp-font-weights-bold);
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--mp-text-subtle);
  white-space: nowrap;
}

.vr-rows { flex: 1; min-height: 0; overflow: auto; }
.vr-row {
  display: grid; grid-template-columns: 1fr 56px 1fr;
  align-items: stretch;
  border-bottom: 1px solid var(--mp-border-default);
}

/* ── Row sides ── */
.vr-side {
  all: unset;
  cursor: pointer;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  min-height: 80px;
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
  align-items: flex-start; text-align: left;
  transition: background 120ms;
}
.vr-side:hover { background: var(--mp-background-neutral-hovered); }
.vr-side--right { align-items: flex-end; text-align: right; }
.vr-side-head { display: flex; align-items: center; gap: var(--mp-spacing-2); max-width: 100%; flex-wrap: wrap; }
.vr-side-head--right { flex-direction: row-reverse; }
.vr-side-icon { color: var(--mp-text-subtle); flex-shrink: 0; }
.vr-side-ref {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); white-space: nowrap;
}
.vr-side-date { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); white-space: nowrap; }
.vr-side-party {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
.vr-side-npwp { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); white-space: nowrap; }

.vr-money { display: flex; gap: var(--mp-spacing-6); margin-top: var(--mp-spacing-1); }
.vr-money-cell { display: flex; flex-direction: column; }
.vr-money-label {
  font-size: 10px; font-weight: var(--mp-font-weights-bold);
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--mp-text-subtle);
}
.vr-money-cell.is-diff .vr-money-label { color: var(--mp-colors-orange-600); }
.vr-money-value {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.vr-money-value--strong { font-weight: var(--mp-font-weights-bold); }
.vr-money-cell.is-diff .vr-money-value { color: var(--mp-colors-orange-800); }

/* ── Missing-side empty state ── */
.vr-side--empty {
  cursor: default;
  background: var(--mp-colors-red-100);
  align-items: flex-start; text-align: left;
  gap: var(--mp-spacing-2);
  justify-content: center;
}
.vr-side--empty:hover { background: var(--mp-colors-red-100); }
.vr-side--empty-left { border-right: 1px dashed var(--mp-colors-red-200); }
.vr-side--empty-right { border-left: 1px dashed var(--mp-colors-red-200); }
.vr-empty-head {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  color: var(--mp-colors-red-800);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
}
.vr-empty-hint { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }

/* ── Connector ── */
.vr-connector {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px;
  border-left: 1px dashed var(--mp-border-default);
  border-right: 1px dashed var(--mp-border-default);
}
.vr-connector-dot {
  width: 32px; height: 32px; border-radius: var(--mp-radii-full);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.vr-connector-dot.is-outline {
  background: var(--mp-background-surface);
  border: 1.5px dashed currentColor;
}
.vr-connector-pct { font-size: 10px; font-weight: var(--mp-font-weights-bold); }

/* ── Reasoning banner ── */
.vr-reason {
  grid-column: 1 / -1;
  padding: var(--mp-spacing-2) var(--mp-spacing-5);
  border-top: 1px solid transparent;
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-xs);
  flex-wrap: wrap;
}
.vr-reason-title { font-weight: var(--mp-font-weights-semi-bold); }
.vr-reason-body { color: inherit; }

/* ── Empty / footer ── */
.vr-empty { padding: var(--mp-spacing-16) var(--mp-spacing-6); text-align: center; }
.vr-empty-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); margin-bottom: var(--mp-spacing-2);
}
.vr-empty-body { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.vr-foot {
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle);
  flex-wrap: wrap;
}
</style>
