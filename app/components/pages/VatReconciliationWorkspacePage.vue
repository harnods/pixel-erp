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
import type { Ref } from 'vue'
import {
  MpIcon, MpButton, MpButtonGroup, MpBadge, MpAireneButton, MpRadio, MpTooltip, MpCheckbox,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import VatReconciliationMatchConfirmModal from '~/components/patterns/VatReconciliationMatchConfirmModal.vue'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import VatReconciliationTaxDocActions from '~/components/patterns/VatReconciliationTaxDocActions.vue'
import VatReconciliationPairActions from '~/components/patterns/VatReconciliationPairActions.vue'
import { reloadTaxDocumentsFromStorage, TAX_DOCUMENTS_STORE_KEY, DJP_STATUS_CONFIG, updateTaxDocumentStatus } from '~/data/taxDocuments'
import { successToast } from '~/utils/toasts'
import {
  MATCH_META, ATTENTION_STATES, SIDE_LABELS, pairsForPeriod, activePeriodId,
  periodLabelById, runPeriod, reconVersion, reconTotals, matchCounts,
  isPeriodFinalized, canFinalizePeriod, finalizePeriod, unfinalizePeriod, periodFinalization,
  lastSyncedAt, formatAmountPlain, partyOf, exposureOf,
  groupPairsByDate, candidatesFor, hasCandidates, compareFields, isFieldDiff,
  erpFakturOf, ERP_FAKTUR_HINTS, footerCounts, isWaitingOnBuyer,
  confirmManualMatch, ownFakturCandidate, nettedAnchor, pairActivity,
  type ReconPair, type ReconSide, type MatchState, type ReconRecord, type MatchCandidate,
} from '~/data/vatReconciliation'

const { t } = useLocale()
const { currentPageKey } = useNavigation()

const side = computed<ReconSide>(() => (currentPageKey.value === 'Faktur masukan' ? 'input' : 'output'))
const L = computed(() => SIDE_LABELS[side.value])

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

// Scoped to the masa the index sent us (?masa=). Without this every period
// rendered April's fixtures under its own header.
const periodId = computed(() => String(route.query.masa ?? activePeriodId))
// reconVersion is read so the pairs re-derive after a run — the data layer is
// plain functions, so this is the dependency that makes the screen change.
const pairs = computed(() => {
  void reconVersion.value
  return pairsForPeriod(periodId.value, side.value)
})

const periodName = computed(() => periodLabelById(periodId.value) ?? '')

// ── Finalize (US-021) ─────────────────────────────────────────────────────────
/**
 * Finalizing records that this masa was signed off. It does not lock Jurnal —
 * invoices behind it stay editable — so the only thing it blocks is this module
 * rewriting the signed-off result: Re-run is refused until it is unfinalized.
 */
const finalized = computed(() => {
  void reconVersion.value
  return isPeriodFinalized(periodId.value)
})
const canFinalize = computed(() => {
  void reconVersion.value
  return canFinalizePeriod(periodId.value)
})
const finalization = computed(() => {
  void reconVersion.value
  return periodFinalization(periodId.value)
})
/** Same DD/MM/YYYY the index uses, so a sign-off date reads the same in both. */
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(iso))
}

const finalizeOpen = ref(false)
const unfinalizeOpen = ref(false)

// rule/btn-save-toast — a sign-off is a save; it confirms with a success toast.
function doFinalize() {
  finalizePeriod(periodId.value)
  successToast(`${periodName.value} ${t('finalized')}`)
}
function doUnfinalize() {
  unfinalizePeriod(periodId.value)
  successToast(`${periodName.value} ${t('unfinalized')}`)
}

/**
 * Finalize is never disabled (rule/btn-no-disabled-validation): a disabled
 * primary still painted full green, so it looked live and did nothing. Pressed
 * too early it says why and offers the way forward — the pairs left to review.
 */
const notReadyOpen = ref(false)
const openPairCount = computed(() => { void reconVersion.value; return pairs.value.filter(p => p.match !== 'matched').length })
const router = useRouter()
function showPairsToReview() {
  router.push({ query: { ...route.query, tab: 'Needs attention' } })
}

/** Title-bar Finalize/Unfinalize, wired from [...slug].vue like the other actions. */
const finalizeSignal = inject<Ref<number>>('vatFinalize', ref(0))
watch(finalizeSignal, () => {
  if (finalized.value) unfinalizeOpen.value = true
  else if (canFinalize.value) finalizeOpen.value = true
  else notReadyOpen.value = true
})

// ── Export (rule/export-modal) ────────────────────────────────────────────────
// The shared ExportModal, from the filter bar's icon group — never the title bar
// (rule/page-title-actions-group) and never a silent download.
const exportOpen = ref(false)
const exportColumns = computed(() => [
  { key: 'status', label: t('Status'), required: true },
  { key: 'erpRef', label: t(erpDocLabel.value), required: true },
  { key: 'djpRef', label: t('Faktur pajak') },
  { key: 'party', label: side.value === 'input' ? t('Vendor') : t('Customer') },
  { key: 'npwp', label: 'NPWP' },
  { key: 'dpp', label: 'DPP' },
  { key: 'ppn', label: 'PPN' },
  { key: 'total', label: t('Total') },
  { key: 'reason', label: t('Remarks') },
])

const isAttentionScope = computed(() => route.query.tab !== 'All faktur')

// Imported from the data layer so the filter can never fall behind the status
// model (PRD §5.1) the way a hand-listed copy did.

/**
 * `matched-manual` is not a MatchState — it's a view of one. Auto and manual
 * matches read as the same status to the user, but an audit has to be able to
 * isolate the ones a person judged, so the select offers it as a pseudo-status.
 */
type StatusFilter = MatchState | 'matched-manual' | ''
const statusFilter = ref<StatusFilter>('')
const query = ref('')

// Reset the filters when switching sides or scope — the counts differ, so a
// filter carried over can land the user on an empty table for no visible reason.
watch([side, isAttentionScope], () => { statusFilter.value = ''; query.value = '' })

const matchesFilter = (p: ReconPair) =>
  statusFilter.value === 'matched-manual' ? p.match === 'matched' && p.matchedBy === 'manual'
  : statusFilter.value ? p.match === statusFilter.value
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
  const isWorkQueue = statusFilter.value !== 'matched' && statusFilter.value !== 'matched-manual'
    && (isAttentionScope.value || !!statusFilter.value)
  return isWorkQueue
    ? [...rows].sort((a, b) => exposureOf(b) - exposureOf(a))
    : rows
})

const counts = computed(() => matchCounts(pairs.value))
const erpTotals = computed(() => reconTotals(pairs.value, 'erp'))
const djpTotals = computed(() => reconTotals(pairs.value, 'djp'))

const dppDelta = computed(() => djpTotals.value.dpp - erpTotals.value.dpp)
const ppnDelta = computed(() => djpTotals.value.ppn - erpTotals.value.ppn)
/**
 * The headline number — US-020 AC-02: Tax difference = |PPN Sales − PPN Faktur|.
 * PPN only: DPP has its own two cards and its own delta, and adding it in here
 * overstated the tax at stake by the whole DPP gap.
 */
const taxGap = computed(() => djpTotals.value.ppn - erpTotals.value.ppn)

/**
 * Footer counts (US-020 AC-03/04) follow the filter — the cards above stay
 * period-level, the footer describes the rows on screen. Only rows actually
 * toggled Waiting on buyer leave "need review" (US-012 AC-02), not every row
 * whose return isn't reflected yet.
 */
const footer = computed(() => { void reconVersion.value; return footerCounts(filtered.value) })
/** Period-level, for the Airene action: is there anything to review at all? */
const periodReviewCount = computed(() => { void reconVersion.value; return footerCounts(pairs.value).review })

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
  const opts = states
    // A status with no rows behind it is a dead end in a select, so it isn't
    // offered — the count in the label is what makes the absence legible.
    .filter(k => (counts.value[k] ?? 0) > 0)
    .map(k => ({
      value: k as string,
      label: `${t(MATCH_META[k].chipLabel)} (${counts.value[k] ?? 0})`,
    }))
  // Auto and manual matches are one status to the user but two kinds of evidence
  // at an audit, so they are separable here even though the badge reads the same.
  if (!isAttentionScope.value && counts.value['matched-manual']) {
    opts.splice(1, 0, {
      value: 'matched-manual',
      label: `${t('Reconciled (manual)')} (${counts.value['matched-manual']})`,
    })
  }
  return opts
})

// ── Tax documents changed in another tab ──────────────────────────────────────
// "Create / Edit tax document" open the invoice in a new tab. When the user
// saves there and comes back, the row must show the new state — the `storage`
// event fires in THIS tab when another one writes the store.
function onStorage(e: StorageEvent) {
  if (e.key?.endsWith(TAX_DOCUMENTS_STORE_KEY)) reloadTaxDocumentsFromStorage()
}
onMounted(() => window.addEventListener('storage', onStorage))
onUnmounted(() => window.removeEventListener('storage', onStorage))

// ── Rows: date groups + inline expand (bank-reconciliation style) ─────────────
/**
 * The workspace reads like ERP's bank reconciliation: rows grouped under their
 * date, one compact line per pair, and the detail opens IN the row rather than
 * in a drawer — the user is working down a list, and a drawer covering it
 * loses their place. The Unmatched & discrepancies page keeps the drawer.
 */
// ── Pagination (design review P1) ─────────────────────────────────────────────
/**
 * A masa at an LE client holds thousands of pairs (US-006). Rendering them all
 * — each with its own buttons and candidate panel — is what freezes a browser,
 * so the list pages like every other ERP index. Grouping is applied to the page,
 * so a date can continue onto the next page; the footer counts stay on the
 * whole filtered set (US-020 AC-04).
 */
const currentPage = ref(1)
const perPage = ref(50)
watch([statusFilter, query, side, isAttentionScope, periodId], () => { currentPage.value = 1 })
watch(() => filtered.value.length, (n) => {
  const last = Math.max(1, Math.ceil(n / perPage.value))
  if (currentPage.value > last) currentPage.value = last
})
const pagedRows = computed(() =>
  filtered.value.slice((currentPage.value - 1) * perPage.value, currentPage.value * perPage.value))
function setPerPage(n: number) { perPage.value = n; currentPage.value = 1 }

const groups = computed(() => groupPairsByDate(pagedRows.value))

const collapsedGroups = ref(new Set<string>())
function toggleGroup(key: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedGroups.value = next
}

const expanded = ref(new Set<string>())
function isExpanded(pair: ReconPair) { return expanded.value.has(pair.id) }
function toggleRow(pair: ReconPair, open?: boolean) {
  const next = new Set(expanded.value)
  const shouldOpen = open ?? !next.has(pair.id)
  if (shouldOpen) next.add(pair.id)
  else next.delete(pair.id)
  expanded.value = next
}

// ── Picking a candidate + the round ✓ ─────────────────────────────────────────
/** The candidate ref picked per pair, and pairs whose ✓ was pressed without one. */
const picked = ref<Record<string, string>>({})
const pickError = ref(new Set<string>())
/** Shown where the user tried to match (rule/form-errors-inline), per pair. */
const finalizedBlocked = ref(new Set<string>())
function pick(pair: ReconPair, ref: string) {
  // A Finalized masa refuses Match (US-002 AC-05) — say so in place.
  if (finalized.value) { finalizedBlocked.value = new Set(finalizedBlocked.value).add(pair.id); return }
  picked.value = { ...picked.value, [pair.id]: ref }
  const next = new Set(pickError.value)
  next.delete(pair.id)
  pickError.value = next
}
function pickedCandidate(pair: ReconPair) {
  return candidatesFor(pair).find(c => c.ref === picked.value[pair.id]) ?? null
}
/** The side the user is matching FROM — its total is what a pick must equal. */
function anchorTotal(pair: ReconPair) { return (pair.erp ?? pair.djp)?.total ?? 0 }
function pickDifference(pair: ReconPair) {
  return anchorTotal(pair) - (pickedCandidate(pair)?.total ?? 0)
}

/**
 * What the ✓ means on this row (decided with the user):
 *   reconciled — matched; a filled check that just opens the row (Unmatch inside)
 *   confirm    — a person has to confirm: return netted, or a candidate state
 *   none       — one-sided with nothing to pick, so there is nothing to confirm
 */
type ConfirmKind = 'reconciled' | 'confirm' | 'none'
function confirmKind(pair: ReconPair): ConfirmKind {
  if (pair.match === 'matched') return 'reconciled'
  if (pair.match === 'return-netted' || hasCandidates(pair)) return 'confirm'
  return 'none'
}
function onConfirm(pair: ReconPair) {
  const kind = confirmKind(pair)
  if (kind === 'reconciled') { toggleRow(pair); return }
  if (kind !== 'confirm') return
  if (finalized.value) {
    finalizedBlocked.value = new Set(finalizedBlocked.value).add(pair.id)
    toggleRow(pair, true)
    return
  }
  if (hasCandidates(pair) && !pickedCandidate(pair)) {
    // Never disabled (rule/btn-no-disabled): say what's missing, where it's fixed.
    pickError.value = new Set(pickError.value).add(pair.id)
    toggleRow(pair, true)
    return
  }
  // A netted return is confirmed against its own faktur, for invoice − return.
  const candidate = hasCandidates(pair) ? pickedCandidate(pair)! : ownFakturCandidate(pair)
  if (!candidate) return
  const anchor = pair.match === 'return-netted' ? nettedAnchor(pair) : anchorTotal(pair)
  // Design review P0: a match whose sides differ is never one click — it would
  // file a real PPN gap as reconciled. The modal states the gap and asks why.
  if (anchor !== candidate.total) {
    pendingMatch.value = { pair, candidate, anchor }
    return
  }
  saveMatch(pair, candidate, anchor)
}

/** The match waiting on the difference modal. */
const pendingMatch = ref<{ pair: ReconPair; candidate: MatchCandidate; anchor: number } | null>(null)
function saveMatch(pair: ReconPair, candidate: MatchCandidate, anchor: number, reason?: string) {
  const ok = confirmManualMatch({ pair, periodId: periodId.value, side: side.value, candidate, anchorTotal: anchor, reason })
  if (!ok) return
  pendingMatch.value = null
  successToast(t('Match confirmed'))
  toggleRow(pair, false)
}
function onMatchModalConfirm(reason: string) {
  const m = pendingMatch.value
  if (m) saveMatch(m.pair, m.candidate, m.anchor, reason)
}

// ── Activity in the expand (design review P1, goal G4) ────────────────────────
const activityShowAll = ref(new Set<string>())
function activityFor(pair: ReconPair) {
  const all = pairActivity(pair, periodId.value)
  return activityShowAll.value.has(pair.id) ? all : all.slice(0, 3)
}
function activityCount(pair: ReconPair) { return pairActivity(pair, periodId.value).length }
function toggleActivity(pair: ReconPair) {
  const next = new Set(activityShowAll.value)
  if (next.has(pair.id)) next.delete(pair.id)
  else next.add(pair.id)
  activityShowAll.value = next
}

// ── Bulk: submit drafts to DJP (design review P1) ─────────────────────────────
/**
 * At the end of a masa the work is submitting the drafts that are waiting —
 * one at a time doesn't scale. Only draft rows are selectable; a row that stops
 * being a draft (submitted here, or in another tab) drops out of the selection.
 */
const { canSubmitTaxDocument } = useTaxSubmissionPermission()
const selectedDrafts = ref(new Set<string>())
function draftDocId(pair: ReconPair): string | null {
  const f = erpFakturOf(pair)
  return f?.state === 'draft' && f.doc ? f.doc.id : null
}
const draftRows = computed(() => { void reconVersion.value; return filtered.value.filter(p => !!draftDocId(p)) })
const selectedDraftRows = computed(() => draftRows.value.filter(p => selectedDrafts.value.has(p.id)))
function toggleDraft(pair: ReconPair, on: boolean) {
  const next = new Set(selectedDrafts.value)
  if (on) next.add(pair.id)
  else next.delete(pair.id)
  selectedDrafts.value = next
  bulkError.value = false
}
function selectAllDrafts() { selectedDrafts.value = new Set(draftRows.value.map(p => p.id)); bulkError.value = false }
function clearDrafts() { selectedDrafts.value = new Set(); bulkError.value = false }
// Select-all checkbox, same anatomy as ErpTablePage's bulk bar.
const allDraftsSelected = computed(() => draftRows.value.length > 0 && selectedDraftRows.value.length === draftRows.value.length)
const someDraftsSelected = computed(() => selectedDraftRows.value.length > 0 && !allDraftsSelected.value)
function toggleAllDrafts() { if (allDraftsSelected.value) clearDrafts(); else selectAllDrafts() }

const bulkConfirmOpen = ref(false)
/** Inline, in the bar (rule/form-errors-inline) — never a toast. */
const bulkError = ref(false)
function askBulkSubmit() {
  bulkError.value = !canSubmitTaxDocument.value
  if (bulkError.value) return
  bulkConfirmOpen.value = true
}
function doBulkSubmit() {
  const rows = selectedDraftRows.value
  for (const p of rows) {
    const id = draftDocId(p)
    if (id) updateTaxDocumentStatus(id, 'awaiting-approval')
  }
  successToast(`${rows.length} ${t('tax documents submitted to DJP')}`)
  clearDrafts()
}

function onPairAction(message: string) { infoToast(message) }

// ── Row helpers ───────────────────────────────────────────────────────────────
function metaFor(pair: ReconPair) { return MATCH_META[pair.match] }
function isDiffField(pair: ReconPair, field: string) { return isFieldDiff(pair, field) }
function fieldValue(row: ReconRecord | null, key: keyof ReconRecord, money?: boolean): string {
  if (!row) return '—'
  const v = row[key]
  if (v == null || v === '') return '—'
  return money ? formatIDR(Number(v)) : String(v)
}
/** Subtitle under the Coretax side of a "Not found in Coretax" row. */
function fakturHint(pair: ReconPair): string {
  const f = erpFakturOf(pair)
  return f ? t(ERP_FAKTUR_HINTS[f.state]) : t('No matching faktur pajak issued in Coretax.')
}
const erpDocLabel = computed(() => (side.value === 'input' ? 'Purchase invoice' : 'Sales invoice'))

/**
 * Re-run (US-002): re-pull both sides and recompute every status. This is the
 * only way a row's status changes on its own — v1.0 dropped the auto-revert.
 */
/**
 * Matching runs automatically per masa pajak, so this is a refresh, not a start:
 * it re-pulls both sides and recomputes every status against what has synced
 * since. It is the only thing that moves a status on its own (US-002).
 */
/** A refused Re-run explains itself in the sign-off banner, never a toast (rule/form-errors-inline). */
const rerunBlocked = ref(false)
watch([finalized, periodId], () => { rerunBlocked.value = false })

/** Needs attention with nothing left and no narrowing → all clear, not "no match". */
const isAllClear = computed(() =>
  isAttentionScope.value && !statusFilter.value && !query.value.trim()
  && pairs.value.length > 0 && pairs.value.every(p => p.match === 'matched'))
function showAllFaktur() {
  router.push({ query: { ...route.query, tab: 'All faktur' } })
}

function reRun() {
  // US-002: a finalized period is a record. Rewriting it silently would defeat
  // the point, so the way back in is explicit.
  if (finalized.value) { rerunBlocked.value = true; return }
  runPeriod(periodId.value)
  infoToast(`${t('Match re-run')} — ${matchCounts(pairs.value).matched} ${t('matched')}`)
}

/**
 * Airene suggests candidates for Find & match; it never sets a status. The
 * matching engine itself is deterministic (US-014/015 live in OD-001-AI-01).
 */
function reviewWithAirene() {
  infoToast(t('Airene is looking for candidates…'))
}
</script>

<template>
  <div class="vr-page">
    <!-- Signed off: say who and when, and that Jurnal is not locked (R5). -->
    <div v-if="finalized && finalization" class="vr-finalized">
      <MpIcon name="receipt-lock" size="sm" color="icon.success" />
      <span class="vr-finalized-text">
        <strong>{{ t('Finalized') }}</strong>
        {{ t('by') }} {{ finalization.finalizedBy }} · {{ formatDate(finalization.finalizedAt) }}.
        {{ t('Sales invoices stay editable in Jurnal; changes will be flagged here.') }}
        <!-- Unfinalize lives once, in the title bar. -->
        <span v-if="rerunBlocked" class="vr-finalized-error" role="alert" data-devchange="vat-recon-ui-review-2">
          {{ t('Re-run is not available while the period is finalized. Unfinalize it first.') }}
        </span>
      </span>
    </div>

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

      <div class="vr-kpi" :class="taxGap === 0 ? 'is-clear' : 'is-gap'" data-devchange="vat-recon-prd-fixes">
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
        <ErpFilterSelect
          id="vr-status-filter"
          v-model="statusFilter"
          :placeholder="t('Status')"
          :options="statusOptions"
          width="200px"
        />
      </div>

      <div class="filter-right" data-devchange="vat-recon-ui-review">
        <MpAireneButton
          v-if="periodReviewCount > 0"
          id="vr-airene-review"
          is-show-badge
          @click="reviewWithAirene"
        >
          {{ t('Review with Airene') }}
        </MpAireneButton>

        <!-- Icon tools = ghost icon MpButtons in one MpButtonGroup + tooltips
             (rule/filter-bar-icon-group); Export lives here, not in the title bar. -->
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip id="vr-tt-export" :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
          </MpTooltip>
        </MpButtonGroup>

        <!-- Pill search (sanctioned ErpFilterBar pill) -->
        <div class="filter-search">
          <MpIcon name="search" size="sm" class="vr-search-icon" />
          <input v-model="query" class="filter-search-input" type="text" :placeholder="t('Search...')" >
          <MpButton v-if="query" class="search-clear-btn" variant="ghost" type="button" :aria-label="t('Clear search')" left-icon="close" @click="query = ''" />
        </div>

        <!-- Search-adjacent action = black tertiary (rule/filter-bar-action-tertiary) -->
        <MpButton variant="tertiary" is-rounded @click="reRun">
          {{ t('Re-run') }}
        </MpButton>
      </div>
    </div>

    <!-- Workspace -->
    <div class="vr-workspace">
      <div class="vr-cols-head">
        <span />
        <div class="vr-col-head vr-col-head--right">
          <div class="vr-col-text vr-col-text--right">
            <span class="vr-col-title">
              {{ t(L.erpHeader) }} <span class="vr-col-count">({{ erpTotals.count }})</span>
            </span>
            <span class="vr-col-sub">{{ L.erpHeaderSub }}</span>
          </div>
          <div class="vr-col-icon"><MpIcon name="database" size="sm" /></div>
        </div>
        <span />
        <div class="vr-col-head">
          <div class="vr-col-icon"><MpIcon name="cloud" size="sm" /></div>
          <div class="vr-col-text">
            <span class="vr-col-title">
              {{ t(L.djpHeader) }} <span class="vr-col-count">({{ djpTotals.count }})</span>
            </span>
            <span class="vr-col-sub">{{ L.djpHeaderSub }}</span>
          </div>
        </div>
        <span />
      </div>

      <div class="vr-rows" data-devchange="vat-recon-bank-style">
        <div v-if="filtered.length === 0 && isAllClear" class="vr-empty" data-devchange="vat-recon-ui-review-2">
          <img src="/illustrations/empty-folder.png" alt="" class="vr-empty-illustration" width="288" height="240" >
          <div class="vr-empty-title">{{ t('Nothing needs attention') }}</div>
          <div class="vr-empty-body">{{ t('Every pair in this period is reconciled.') }}</div>
          <MpButton variant="secondary" is-rounded class="vr-empty-cta" @click="showAllFaktur">{{ t('View all faktur') }}</MpButton>
        </div>
        <div v-else-if="filtered.length === 0" class="vr-empty">
          <div class="vr-empty-title">{{ t('No faktur match your filters') }}</div>
          <div class="vr-empty-body">{{ t('Recheck the filters you have applied and try filtering again.') }}</div>
        </div>

        <!-- Bulk: submit the selected drafts in one go -->
        <!-- Same anatomy as ErpTablePage's bulk bar (rule/table-bulk-actions-bar):
             select-all checkbox → count → one secondary-sm "Actions" dropdown. -->
        <div v-if="draftRows.length" class="vr-bulk" :class="{ 'is-active': selectedDraftRows.length }" data-devchange="vat-recon-ui-review">
          <div class="vr-bulk-left">
            <MpCheckbox
              id="vr-bulk-select-all"
              :is-checked="allDraftsSelected"
              :is-indeterminate="someDraftsSelected"
              :aria-label="t('Select all drafts')"
              @change="toggleAllDrafts"
            />
            <template v-if="selectedDraftRows.length">
              <span class="vr-bulk-count">{{ selectedDraftRows.length }} {{ t('drafts selected') }}</span>
              <MpPopover id="vr-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                <MpPopoverTrigger>
                  <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
                </MpPopoverTrigger>
                <MpPopoverContent class="erp-dropdown-menu">
                  <MpPopoverList>
                    <MpPopoverListItem @click="askBulkSubmit">{{ t('Submit to DJP') }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </template>
            <span v-else class="vr-caption">{{ draftRows.length }} {{ t('draft tax documents are waiting to be submitted.') }}</span>
          </div>
          <p v-if="bulkError" class="vr-bulk-error" role="alert">
            {{ t("You don't have permission to submit tax documents to DJP. Ask an administrator for access.") }}
          </p>
        </div>

        <section v-for="g in groups" :key="g.key" class="vr-group">
          <button
            type="button"
            class="btn-enterprise vr-group-head"
            :aria-expanded="!collapsedGroups.has(g.key)"
            @click="toggleGroup(g.key)"
          >
            <MpIcon :name="collapsedGroups.has(g.key) ? 'chevrons-right' : 'chevrons-down'" size="sm" />
            <span class="vr-group-label">{{ g.label }}</span>
            <span class="vr-group-count">{{ g.pairs.length }}</span>
          </button>

          <template v-if="!collapsedGroups.has(g.key)">
            <div
              v-for="pair in g.pairs"
              :key="pair.id"
              class="vr-item"
              :class="{ 'is-open': isExpanded(pair) }"
            >
              <!-- Compact line: chevron | ERP ⋯ Coretax | actions | ✓ -->
              <div class="vr-line">
                <MpButton
                  variant="ghost" is-rounded class="vr-chevron"
                  :aria-label="isExpanded(pair) ? t('Collapse') : t('Expand')"
                  :aria-expanded="isExpanded(pair)"
                  @click="toggleRow(pair)"
                >
                  <MpIcon :name="isExpanded(pair) ? 'chevrons-up' : 'chevrons-down'" size="sm" />
                </MpButton>

                <!-- ERP side — right-aligned against the connector, like the bank side -->
                <button type="button" class="btn-enterprise vr-erp" @click="toggleRow(pair)">
                    <template v-if="pair.erp">
                      <span class="vr-caption">{{ pair.erp.date }}</span>
                      <span class="vr-amount" :class="{ 'is-diff': isDiffField(pair, 'total') }">
                        {{ formatAmountPlain(pair.erp.total) }}{{ isDiffField(pair, 'total') ? ' *' : '' }}
                      </span>
                      <span class="vr-caption">{{ pair.erp.ref }} · {{ partyOf(pair.erp) }}</span>
                    </template>
                    <template v-else>
                      <span class="vr-missing">{{ t('No match in ERP') }}</span>
                      <span class="vr-caption">{{ side === 'input' ? t('No purchase invoice carries this faktur.') : t('No sales invoice carries this faktur.') }}</span>
                    </template>
                </button>

                <span class="vr-dash" aria-hidden="true" />

                <!-- Coretax side, with the fix-on-the-invoice actions at its end
                     (on the line itself — no expand needed) -->
                <div class="vr-djp-cell">
                  <button type="button" class="btn-enterprise vr-djp" @click="toggleRow(pair)">
                    <template v-if="pair.djp">
                      <span class="vr-caption">{{ pair.djp.date }}</span>
                      <span class="vr-amount-row">
                        <span class="vr-amount" :class="{ 'is-diff': isDiffField(pair, 'total') }">
                          {{ formatAmountPlain(pair.djp.total) }}{{ isDiffField(pair, 'total') ? ' *' : '' }}
                        </span>
                        <MpBadge :type="metaFor(pair).badgeType" for="tableStatus" size="sm">{{ t(metaFor(pair).label) }}</MpBadge>
                        <span v-if="pair.match === 'matched' && pair.matchedBy === 'manual'" class="vr-manual-tag">{{ t('Manual') }}</span>
                        <span v-if="isWaitingOnBuyer(pair)" class="vr-manual-tag vr-waiting-tag">
                          <MpIcon name="time" size="sm" />{{ t('Waiting on buyer') }}
                        </span>
                      </span>
                      <span class="vr-caption">
                        {{ pair.djp.ref }} · {{ pair.djp.approved ? t('Approved') : t('Not approved') }}
                      </span>
                    </template>
                    <template v-else>
                      <span class="vr-amount-row">
                        <span class="vr-missing">{{ t('Not found in Coretax') }}</span>
                        <MpBadge
                          v-if="erpFakturOf(pair)?.doc"
                          :type="DJP_STATUS_CONFIG[erpFakturOf(pair)!.doc!.status].type"
                          for="tableStatus" size="sm"
                        >{{ t(DJP_STATUS_CONFIG[erpFakturOf(pair)!.doc!.status].label) }}</MpBadge>
                      </span>
                      <span class="vr-caption">{{ fakturHint(pair) }}</span>
                    </template>
                  </button>
                  <label v-if="draftDocId(pair)" class="vr-draft-check">
                    <MpCheckbox
                      :id="`vr-draft-${pair.id}`"
                      :is-checked="selectedDrafts.has(pair.id)"
                      :aria-label="`${t('Select draft for')} ${pair.erp?.ref}`"
                      @change="(v: boolean) => toggleDraft(pair, v)"
                    />
                  </label>
                  <VatReconciliationTaxDocActions v-if="erpFakturOf(pair)" :pair="pair" layout="row" class="vr-line-actions" />
                </div>

                <!-- Round ✓ — reconciled (filled) or confirm match (outline) -->
                <div class="vr-confirm-cell">
                  <MpTooltip
                    v-if="confirmKind(pair) !== 'none'"
                    :id="`vr-confirm-${pair.id}`"
                    :label="confirmKind(pair) === 'reconciled' ? t('Reconciled') : t('Confirm match')"
                    placement="top"
                    use-portal
                  >
                    <button
                      type="button"
                      class="btn-enterprise vr-confirm"
                      :class="{ 'is-done': confirmKind(pair) === 'reconciled' }"
                      :aria-label="confirmKind(pair) === 'reconciled' ? t('Reconciled') : t('Confirm match')"
                      @click="onConfirm(pair)"
                    >
                      <MpIcon name="check" size="sm" :color="confirmKind(pair) === 'reconciled' ? 'icon.inverse' : 'icon.default'" />
                    </button>
                  </MpTooltip>
                </div>
              </div>

              <!-- Inline detail -->
              <div v-if="isExpanded(pair)" class="vr-detail">
                <div class="vr-detail-col">
                  <div class="vr-detail-title">{{ t(erpDocLabel) }}</div>
                  <dl v-if="pair.erp" class="vr-kv">
                    <template v-for="f in compareFields(side)" :key="f.key">
                      <dt>{{ t(f.label) }}</dt>
                      <dd :class="{ 'is-diff': isDiffField(pair, f.key) }">
                        <NuxtLink
                          v-if="f.key === 'ref' && pair.erp.salesInvoiceId"
                          :to="`/sales-invoices/${pair.erp.salesInvoiceId}`"
                          class="vr-link"
                        >{{ pair.erp.ref }}</NuxtLink>
                        <template v-else>{{ fieldValue(pair.erp, f.key, f.money) }}</template>
                      </dd>
                    </template>
                  </dl>
                  <p v-else class="vr-detail-empty">{{ t('No match in ERP') }}</p>
                  <template v-if="pair.erp?.returnRef">
                    <div class="vr-detail-title vr-detail-title--sub" data-devchange="vat-recon-ui-review-2">{{ t('Sales return') }}</div>
                    <dl class="vr-kv">
                      <dt>{{ t('Number') }}</dt><dd>{{ pair.erp.returnRef }}</dd>
                      <dt>{{ t('Date') }}</dt><dd>{{ pair.erp.returnDate ?? '—' }}</dd>
                      <dt>{{ t('Total') }}</dt><dd>{{ pair.erp.returnTotal != null ? formatIDR(pair.erp.returnTotal) : '—' }}</dd>
                      <dt>{{ t('Invoice − return') }}</dt><dd>{{ formatIDR(nettedAnchor(pair)) }}</dd>
                    </dl>
                  </template>
                </div>

                <div class="vr-detail-col">
                  <!-- Open pair: pick the counterpart, bank-reconciliation style -->
                  <template v-if="hasCandidates(pair)">
                    <!-- Duplicate reference: the invoice is known, the choice is between
                         the Approved faktur that carry its number (US-003). -->
                    <template v-if="pair.match === 'duplicate-reference'">
                      <div class="vr-detail-title">{{ t('Select the correct faktur') }}</div>
                      <p class="vr-detail-sub">{{ t('More than one Approved faktur carries this invoice number. Select the one that is current.') }}</p>
                    </template>
                    <template v-else>
                      <div class="vr-detail-title">{{ t('Select the correct match') }}</div>
                      <p class="vr-detail-sub">{{ t('These possibly match this row. Select the correct one.') }}</p>
                    </template>
                    <div class="vr-cands" role="radiogroup" :aria-label="t('Select the correct match')">
                      <label v-for="c in candidatesFor(pair)" :key="c.ref" class="vr-cand">
                        <MpRadio
                          :id="`vr-cand-${pair.id}-${c.ref}`"
                          :name="`vr-cand-${pair.id}`"
                          :is-checked="picked[pair.id] === c.ref"
                          :aria-label="c.ref"
                          @change="pick(pair, c.ref)"
                        />
                        <span class="vr-cand-main">
                          <span class="vr-cand-ref">{{ c.ref }}</span>
                          <span class="vr-caption">{{ c.date }} · {{ t(c.why) }}</span>
                        </span>
                        <span class="vr-cand-party">{{ c.party }}</span>
                        <span class="vr-cand-total">{{ formatIDR(c.total) }}</span>
                      </label>
                    </div>
                    <!-- Nothing picked yet → no verdict. A red "Difference: <whole
                         amount>" before any choice read as an error on first view. -->
                    <div v-if="pickedCandidate(pair)" class="vr-cand-sum" data-devchange="vat-recon-ui-review">
                      <div>{{ t('Selected total') }}: <strong>{{ formatIDR(pickedCandidate(pair)!.total) }}</strong></div>
                      <div :class="pickDifference(pair) === 0 ? 'is-ok' : 'is-bad'">
                        {{ t('Difference') }}: {{ formatIDR(Math.abs(pickDifference(pair))) }}
                      </div>
                    </div>
                    <p v-else class="vr-caption vr-cand-hint">{{ t('Select a match to see the difference.') }}</p>
                    <p v-if="finalizedBlocked.has(pair.id)" class="vr-pick-error" role="alert">{{ t('This period is finalized. Unfinalize it first to change matches.') }}</p>
                    <p v-else-if="pickError.has(pair.id)" class="vr-pick-error" role="alert">{{ t('Select a match first, then confirm.') }}</p>
                    <div class="vr-find-another">
                      <span class="vr-caption">{{ t("Don't see the correct match?") }}</span>
                      <MpButton variant="ghost" is-rounded @click="infoToast(t('Opening match picker…'))">{{ t('Find another') }}</MpButton>
                    </div>
                  </template>

                  <!-- Both sides present: the faktur, field by field -->
                  <template v-else>
                    <div class="vr-detail-title">{{ pair.match === 'matched' ? t('Matched faktur') : t('Faktur pajak') }}</div>
                    <dl v-if="pair.djp" class="vr-kv">
                      <template v-for="f in compareFields(side)" :key="f.key">
                        <dt>{{ t(f.label) }}</dt>
                        <dd :class="{ 'is-diff': isDiffField(pair, f.key) }">{{ fieldValue(pair.djp, f.key, f.money) }}</dd>
                      </template>
                    </dl>
                    <p v-else class="vr-detail-empty">{{ t('Not found in Coretax') }}</p>
                  </template>
                </div>

                <div class="vr-detail-foot">
                  <p v-if="pair.reason" class="vr-reason-line">
                    <strong :style="{ color: metaFor(pair).fg }">{{ t(metaFor(pair).longLabel) }}</strong>
                    · {{ pair.reason }}
                  </p>
                  <VatReconciliationPairActions :pair="pair" :side="side" inline :finalized="finalized" :period-id="periodId" @action="onPairAction" />
                </div>

                <!-- Audit trail (goal G4): who matched what, when, and why -->
                <div class="vr-activity" data-devchange="vat-recon-review-fixes">
                  <div class="vr-activity-title">{{ t('Activity') }}</div>
                  <div class="vr-activity-list" role="list">
                    <div v-for="(a, i) in activityFor(pair)" :key="i" class="vr-activity-row" role="listitem">
                      <MpIcon :name="a.icon" size="sm" class="vr-activity-icon" />
                      <span class="vr-activity-text">
                        {{ t(a.label) }}<template v-if="a.status">: {{ t(a.status) }}</template>
                        <span v-if="a.detail" class="vr-activity-detail">{{ a.detail }}</span>
                      </span>
                      <span class="vr-caption vr-activity-meta">{{ t(a.who) }} · {{ a.time }}</span>
                    </div>
                  </div>
                  <MpButton v-if="activityCount(pair) > 3" variant="ghost" is-rounded @click="toggleActivity(pair)">
                    {{ activityShowAll.has(pair.id) ? t('Show less') : `${t('Show all')} (${activityCount(pair)})` }}
                  </MpButton>
                </div>
              </div>
            </div>
          </template>
        </section>
      </div>

      <div class="vr-foot" data-devchange="vat-recon-prd-fixes">
        <ErpPagination
          v-if="filtered.length"
          class="vr-pagination"
          :total="filtered.length"
          :current-page="currentPage"
          :per-page="perPage"
          @page-change="(p: number) => (currentPage = p)"
          @per-page-change="setPerPage"
        />
        <span>
          {{ t('Showing') }} {{ filtered.length }} {{ t('of') }} {{ pairs.length }} {{ t('pairs') }}
          · {{ footer.matched }} {{ t('matched') }}
          · {{ footer.review }} {{ t('need review') }}
          · {{ footer.unmatched }} {{ t('unmatched') }}
          <!-- Rows parked on the buyer are not work the user can do, so they are
               counted apart rather than inflating "need review" (US-020). -->
          <template v-if="footer.waiting">· {{ footer.waiting }} {{ t('waiting on buyer') }}</template>
        </span>
        <span>{{ t('Last sync') }}: {{ lastSyncedAt }}</span>
      </div>
    </div>

    <VatReconciliationMatchConfirmModal
      :is-open="!!pendingMatch"
      :row-ref="(pendingMatch?.pair.erp ?? pendingMatch?.pair.djp)?.ref ?? ''"
      :row-total="pendingMatch?.anchor ?? 0"
      :candidate-ref="pendingMatch?.candidate.ref ?? ''"
      :candidate-total="pendingMatch?.candidate.total ?? 0"
      @close="pendingMatch = null"
      @confirm="onMatchModalConfirm"
    />
    <ConfirmModal
      v-model:is-open="bulkConfirmOpen"
      :title="`${t('Submit')} ${selectedDraftRows.length} ${t('tax documents to DJP?')}`"
      :description="t('The selected drafts will be sent to DJP for approval. They can no longer be edited after this.')"
      :confirm-label="t('Submit to DJP')"
      :cancel-label="t('Cancel')"
      :is-danger="false"
      @confirm="doBulkSubmit"
    />
    <ConfirmModal
      v-model:is-open="finalizeOpen"
      :title="`${t('Finalize')} ${periodName}?`"
      :description="t('This records what was reconciled and who signed it off. It does not lock Jurnal — sales invoices in this period stay editable, and any change will be flagged here.')"
      :confirm-label="t('Finalize')"
      :cancel-label="t('Cancel')"
      :is-danger="false"
      @confirm="doFinalize"
    />
    <!-- Finalize pressed before every pair is reconciled: say why, offer the way on. -->
    <ConfirmModal
      v-model:is-open="notReadyOpen"
      :title="`${periodName} ${t('is not ready to finalize')}`"
      :description="`${openPairCount} ${t('pairs still need review. Reconcile every pair in this period, then finalize it.')}`"
      :confirm-label="t('Show pairs to review')"
      :cancel-label="t('Close')"
      :is-danger="false"
      @confirm="showPairsToReview"
    />
    <ExportModal
      :open="exportOpen"
      :title="`${t('Export')} ${periodName}`"
      :entity-label="t('pairs')"
      :columns="exportColumns"
      :total="filtered.length"
      @close="exportOpen = false"
      @export="exportOpen = false"
    />
    <ConfirmModal
      v-model:is-open="unfinalizeOpen"
      :title="`${t('Unfinalize')} ${periodName}?`"
      :description="t('The period goes back to Reconciled and can be re-run. The sign-off is logged either way.')"
      :confirm-label="t('Unfinalize')"
      :cancel-label="t('Cancel')"
      :is-danger="false"
      @confirm="doUnfinalize"
    />

  </div>
</template>

<style scoped>
/* Sign-off banner — green like the status, informational not celebratory. */
.vr-finalized {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-colors-green-200);
  border-radius: var(--mp-radii-md);
  background: var(--mp-colors-green-100);
  color: var(--mp-colors-emerald-800);
}
.vr-finalized-text { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.vr-finalized-error { display: block; margin-top: var(--mp-spacing-1); color: var(--mp-colors-red-800); font-weight: var(--mp-font-weights-semi-bold); }


.vr-page {
  --vr-badge-p: 1px var(--mp-spacing-2);
  --vr-search-w: 248px;
  --vr-search-h: 36px;
  --vr-status-w: 160px;
  --vr-chevron-sz: 20px;
  --vr-col-icon-sz: 28px;
  --vr-connector-gap: 2px;
  --vr-delta-gap: 2px;
  --vr-dot-sz: 32px;
  --vr-tag-p: 1px var(--mp-spacing-2);
  --vr-chevron-col: 40px;
  --vr-dash-col: 40px;
  --vr-confirm-col: 56px;
  --vr-confirm-sz: 32px;
  --vr-line-h: 64px;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-height: 0;
}

/* ── KPI strip ── */
.vr-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--mp-spacing-3); }
/* Narrower than desktop: the four side cards stay on one row and Tax difference —
   the headline — takes its own full-width row, rather than truncating amounts. */
@media (max-width: 1279px) {
  .vr-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .vr-kpis > .vr-kpi:last-child { grid-column: 1 / -1; }
}
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
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.vr-kpi.is-clear .vr-kpi-value { color: var(--mp-colors-emerald-800); }
.vr-kpi.is-gap .vr-kpi-value { color: var(--mp-colors-red-800); }
.vr-kpi-sub-row { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.vr-kpi-sub { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle); }
.vr-kpi.is-clear .vr-kpi-sub, .vr-kpi.is-gap .vr-kpi-sub { color: inherit; }
.vr-delta {
  display: inline-flex; align-items: center; gap: var(--vr-delta-gap);
  padding: var(--vr-badge-p); border-radius: var(--mp-radii-full);
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
  width: var(--vr-search-w); height: var(--vr-search-h);
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
/* Icon tools sit 8px apart (MpButtonGroup default) — rule/btn-group-gap-8,
   same as PurchaseOrdersPage's filter bar. */
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
/* ── Workspace card ── */
.vr-workspace {
  /* White card; rows sit on it as light-grey cards (bank-reconciliation layering).
     Note --mp-background-surface is #f8f9f9 in this build, not white. */
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  /* clip, not hidden: keeps the rounded corners without making this a scroll
     container, so the column header and footer can stick to the page scroll. */
  display: flex; flex-direction: column; overflow: clip;
}
/* One grid for the header and every line, so ERP / Coretax columns align down
   the whole list: chevron | ERP | connector | Coretax (+ actions) | ✓ */
.vr-cols-head,
.vr-line {
  display: grid;
  grid-template-columns: var(--vr-chevron-col) minmax(0, 1fr) var(--vr-dash-col) minmax(0, 1.4fr) var(--vr-confirm-col);
  align-items: center;
}
.vr-cols-head {
  position: sticky; top: 0; z-index: 2;
  background: var(--mp-background-neutral);
  border-bottom: 1px solid var(--mp-border-default);
}
.vr-col-head {
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0;
}
.vr-col-head--right { justify-content: flex-end; }
.vr-col-icon {
  width: var(--vr-col-icon-sz); height: var(--vr-col-icon-sz); border-radius: var(--mp-radii-sm);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
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

.vr-rows { padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-4); }

/* Pushes what follows to the right edge (finalized banner, bulk bar). */
.vr-toolbar-spacer { flex: 1; }

/* ── Bulk bar ── */
.vr-bulk {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2);
  border: 1px dashed var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.vr-bulk.is-active { border-style: solid; border-color: var(--mp-colors-neutral-400); background: var(--mp-background-neutral-subtle); }
.vr-bulk-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
/* Count reads like ErpTablePage's bulk bar (sm, regular). */
.vr-bulk-count { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); white-space: nowrap; }
.vr-cand-hint { margin: var(--mp-spacing-3) 0 0; }
.vr-bulk-error { flex-basis: 100%; margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); }
.vr-draft-check { display: flex; align-items: center; flex-shrink: 0; cursor: pointer; }

/* ── Activity in the expand ── */
.vr-activity { grid-column: 1 / -1; padding: var(--mp-spacing-3) var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default); }
.vr-activity-title { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-2); }
.vr-activity-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.vr-activity-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: var(--mp-spacing-2); align-items: start; font-size: var(--mp-font-sizes-sm); }
.vr-activity-icon { color: var(--mp-text-subtle); margin-top: 2px; }
.vr-activity-text { color: var(--mp-text-default); }
.vr-activity-detail { display: block; color: var(--mp-text-secondary); overflow-wrap: anywhere; }
.vr-activity-meta { white-space: nowrap; }

/* ── Date groups ── */
.vr-group + .vr-group { margin-top: var(--mp-spacing-2); }
.vr-group-head {
  all: unset; cursor: pointer;
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vr-group-count {
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-subtle);
}

/* ── One pair: a neutral card, the status lives in the tag ── */
.vr-item {
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.vr-item + .vr-item { margin-top: var(--mp-spacing-2); }
.vr-item.is-open { background: var(--mp-background-neutral); border-color: var(--mp-colors-neutral-400); }
.vr-line { min-height: var(--vr-line-h); }
.vr-chevron { justify-self: center; }

.vr-erp,
.vr-djp {
  all: unset; cursor: pointer;
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  min-width: 0;
}
.vr-erp { align-items: flex-end; text-align: right; }
.vr-djp { align-items: flex-start; text-align: left; flex: 1; }
.vr-erp:focus-visible, .vr-djp:focus-visible { outline: 2px solid var(--mp-colors-neutral-400); outline-offset: -2px; }
.vr-djp-cell { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; padding-right: var(--mp-spacing-2); }
.vr-line-actions { flex-shrink: 0; }

.vr-caption {
  font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle);
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vr-amount {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.vr-amount.is-diff { color: var(--mp-colors-orange-800); }
.vr-amount-row { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.vr-missing { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* The dotted connector between the two sides, like the bank reconciliation */
.vr-dash {
  justify-self: center; width: 24px;
  border-top: 2px dotted var(--mp-border-default);
}

/* Round ✓ — outline = confirm match; filled green = reconciled */
.vr-confirm-cell { display: flex; justify-content: center; }
.vr-confirm {
  all: unset; cursor: pointer;
  width: var(--vr-confirm-sz); height: var(--vr-confirm-sz);
  border-radius: var(--mp-radii-full);
  border: 1.5px solid var(--mp-border-default);
  background: var(--mp-background-neutral);
  display: flex; align-items: center; justify-content: center;
}
.vr-confirm:hover { border-color: var(--mp-colors-neutral-400); }
.vr-confirm:focus-visible { outline: 2px solid var(--mp-colors-neutral-400); outline-offset: 2px; }
.vr-waiting-tag { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.vr-confirm.is-done { background: var(--mp-colors-emerald-700); border-color: var(--mp-colors-emerald-700); }

/* Who judged it — quiet next to the status tag */
.vr-manual-tag {
  padding: var(--vr-tag-p);
  border-radius: var(--mp-radii-full);
  background: var(--mp-colors-neutral-100);
  color: var(--mp-text-subtle);
  font-size: var(--mp-font-sizes-xs);
  font-weight: var(--mp-font-weights-semi-bold);
  white-space: nowrap;
}

/* ── Inline detail ── */
.vr-detail {
  display: grid; grid-template-columns: 1fr 1.4fr;
  border-top: 1px solid var(--mp-border-default);
}
.vr-detail-col { padding: var(--mp-spacing-4) var(--mp-spacing-5); min-width: 0; }
.vr-detail-col + .vr-detail-col { border-left: 1px solid var(--mp-border-default); }
.vr-detail-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-3); }
.vr-detail-sub { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.vr-detail-empty { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.vr-kv {
  margin: 0; display: grid; grid-template-columns: 120px minmax(0, 1fr);
  row-gap: var(--mp-spacing-2); column-gap: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
}
.vr-kv dt { color: var(--mp-text-secondary); }
.vr-kv dd { margin: 0; color: var(--mp-text-default); overflow-wrap: anywhere; }
.vr-kv dd.is-diff { color: var(--mp-colors-orange-800); font-weight: var(--mp-font-weights-semi-bold); }
.vr-link { color: var(--mp-text-link, var(--mp-colors-blue-700)); text-decoration: none; }
.vr-link:hover { text-decoration: underline; }

.vr-cands { display: flex; flex-direction: column; }
.vr-cand {
  display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 0.8fr) auto;
  align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) 0; cursor: pointer;
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md);
}
.vr-cand-main { display: flex; flex-direction: column; min-width: 0; }
.vr-cand-ref { color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.vr-cand-party { color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vr-cand-total { font-variant-numeric: tabular-nums; white-space: nowrap; }
.vr-cand-sum { margin-top: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); display: flex; flex-direction: column; gap: 2px; }
.vr-cand-sum .is-ok { color: var(--mp-colors-emerald-800); font-weight: var(--mp-font-weights-semi-bold); }
.vr-cand-sum .is-bad { color: var(--mp-colors-red-800); font-weight: var(--mp-font-weights-semi-bold); }
.vr-pick-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); }
.vr-find-another { margin-top: var(--mp-spacing-3); display: flex; align-items: center; gap: var(--mp-spacing-1); }

.vr-detail-foot {
  grid-column: 1 / -1;
  display: flex; align-items: center; gap: var(--mp-spacing-4); justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
.vr-reason-line { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.vr-detail-foot :deep(.vpa) { margin-left: auto; }

/* ── Empty / footer ── */
.vr-empty { padding: var(--mp-spacing-16) var(--mp-spacing-6); text-align: center; }
.vr-empty-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); margin-bottom: var(--mp-spacing-2);
}
.vr-empty-body { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.vr-empty-illustration { --vr-illus-w: 288px; --vr-illus-h: 240px; width: var(--vr-illus-w); height: var(--vr-illus-h); object-fit: contain; display: block; margin: 0 auto var(--mp-spacing-2); }
.vr-empty-cta { margin-top: var(--mp-spacing-4); }
.vr-detail-title--sub { margin-top: var(--mp-spacing-4); }
.vr-foot {
  /* Sticks to the bottom of the page scroll, so counts and paging stay in reach.
     The page scroller (.stage in [...slug].vue) has an 80px bottom padding
     (--mp-spacing-20) and sticky stops inside it — the negative offset lands
     the footer on the visible bottom edge instead of 80px above it. */
  position: sticky; bottom: calc(-1 * var(--mp-spacing-20, 80px)); z-index: 2;
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-xs); color: var(--mp-text-subtle);
  flex-wrap: wrap;
}
.vr-pagination { flex-basis: 100%; }
</style>
