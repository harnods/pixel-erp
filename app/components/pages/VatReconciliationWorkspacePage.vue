<script setup lang="ts">
/**
 * VAT reconciliation workspace — one masa pajak, one side (keluaran / masukan).
 *
 * Laid out like Jurnal's bank Reconciliations (the shipped reference for this
 * kind of work), one tab per job:
 *
 *   To match       — pairs a person has to pair up or confirm: a missing
 *                    counterpart, a duplicate reference, a netted return. The
 *                    bank-style matching rows: date groups, ERP ⋯ Coretax line,
 *                    round ✓ (solid = a match to confirm, dashed = no match yet).
 *   Not reconciled — a root cause to fix on a document. A table.
 *   Matched        — reconciled, auto or manual. A table.
 *
 * Above the tabs, a summary strip in the reference's style (divider columns, no
 * cards) carries the five period totals (US-020 AC-01/02).
 *
 * The masa is not selectable here: it arrives as `?masa=` from the index, and the
 * tab as `?tab=` (both wired in [...slug].vue, which also owns the title bar).
 */
import type { Ref } from 'vue'
import {
  MpIcon, MpButton, MpButtonGroup, MpTooltip, MpCheckbox, MpBadge, MpTag,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpBanner, MpBannerIcon, MpBannerDescription, MpTabs, MpTabList, MpTab,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import ReconciliationDetailDrawer from '~/components/patterns/ReconciliationDetailDrawer.vue'
import VatReconciliationMatchConfirmModal from '~/components/patterns/VatReconciliationMatchConfirmModal.vue'
import VatReconciliationRemarkModal from '~/components/patterns/VatReconciliationRemarkModal.vue'
import VatReconciliationRowMarkers from '~/components/patterns/VatReconciliationRowMarkers.vue'
import VatReconciliationTaxDocActions from '~/components/patterns/VatReconciliationTaxDocActions.vue'
import VatReconciliationAireneSuggestions from '~/components/patterns/VatReconciliationAireneSuggestions.vue'
import { isAireneEligible, suggestionState, shownSuggestions } from '~/data/vatReconSuggest'
import { formatIDR } from '~/utils/currency'
import { formatDate as formatShortDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  reloadTaxDocumentsFromStorage, TAX_DOCUMENTS_STORE_KEY, updateTaxDocumentStatus, formatTaxDocumentNumber, DJP_STATUS_CONFIG,
} from '~/data/taxDocuments'
import {
  MATCH_META, ATTENTION_STATES, SIDE_LABELS, pairsForPeriod, activePeriodId,
  periodLabelById, periodMasaById, runPeriod, reconVersion, reconTotals, matchCounts,
  isPeriodFinalized, canFinalizePeriod, finalizePeriod, unfinalizePeriod, periodFinalization,
  formatAmountPlain, partyOf, exposureOf, reconDateValue,
  groupPairsByDate, candidatesFor, hasCandidates, compareFields, isFieldDiff,
  erpFakturOf, salesInvoiceTaxDocUrl, isWaitingOnBuyer, canWaitOnBuyer, setWaitingOnBuyer,
  confirmManualMatch, undoManualMatch, manualMatchOf, unmatchAutoPair,
  ownFakturCandidate, nettedAnchor, isSideInScope,
  periodAccountCodes, periodSetupChange, periodLastSync, accountLabels, RERUN_SIMULATED_MS,
  footerCounts, canRemark, isNotApproved, notApprovedHint, hiddenNotApprovedFor,
  taxDocSubState, statusLabelOf, statusBadgeOf, statusReasonOf, statusFgOf, statusBadgeTypeOf, TAX_DOC_SUBSTATES, TAX_DOC_SUBSTATE_META,
  WORKSPACE_TABS, TO_MATCH_STATES, workspaceTabOf, workspaceTabRows, workspaceTabCounts,
  type ReconPair, type ReconSide, type MatchState, type ReconRecord, type MatchCandidate,
  type WorkspaceTab,
} from '~/data/vatReconciliation'

const { t } = useLocale()
const { currentPageKey } = useNavigation()
const route = useRoute()
const router = useRouter()

// VAT In (OD-008) is hidden while VAT_IN_ENABLED is off: a /faktur-masukan link
// renders and then lands on the output workspace, same masa and tab.
const wantsInput = computed(() => currentPageKey.value === 'Faktur masukan')
const side = computed<ReconSide>(() => (wantsInput.value && isSideInScope('input') ? 'input' : 'output'))
watch(wantsInput, (isInput) => {
  if (isInput && !isSideInScope('input')) router.replace({ path: '/faktur-keluaran', query: route.query })
}, { immediate: true })
const L = computed(() => SIDE_LABELS[side.value])
// The two sides are Transaction and Tax document (PM, 2026-11-05) — both live in
// ERP, so no label names Coretax or ERP as a side.
const erpDocLabel = computed(() => 'Transaction')

// Scoped to the masa the index sent us (?masa=).
const periodId = computed(() => String(route.query.masa ?? activePeriodId))
const periodName = computed(() => periodLabelById(periodId.value) ?? '')
const periodMasa = computed(() => periodMasaById(periodId.value) ?? '')
// reconVersion is read so the pairs re-derive after a run or a match.
const pairs = computed(() => {
  void reconVersion.value
  return pairsForPeriod(periodId.value, side.value)
})

// ── Tab (?tab=) ───────────────────────────────────────────────────────────────
const activeTab = computed<WorkspaceTab>(() => {
  const q = String(route.query.tab ?? '')
  return (WORKSPACE_TABS as string[]).includes(q) ? (q as WorkspaceTab) : 'To match'
})
function goToTab(tab: WorkspaceTab) { router.push({ query: { ...route.query, tab } }) }
/**
 * The tabs sit under the summary, like the bank Reconciliations page — so they
 * are in-page tabs (docs/patterns/tabs.md §2: MpTabs inside the stage), not the
 * title-bar page tabs. Still synced to ?tab= so a link or refresh lands on it.
 */
// MpTabs addresses tabs by INDEX (as in ProductDetailsPage) — map to/from ?tab=.
const tabModel = computed({
  get: (): number => WORKSPACE_TABS.indexOf(activeTab.value),
  set: (idx: number) => {
    const tab = WORKSPACE_TABS[idx] ?? 'To match'
    if (tab !== activeTab.value) router.replace({ query: { ...route.query, tab } })
  },
})
const tabCounts = computed(() => workspaceTabCounts(pairs.value))

// ── Finalize (US-021) ─────────────────────────────────────────────────────────
const finalized = computed(() => { void reconVersion.value; return isPeriodFinalized(periodId.value) })
const canFinalize = computed(() => { void reconVersion.value; return canFinalizePeriod(periodId.value) })
const finalization = computed(() => { void reconVersion.value; return periodFinalization(periodId.value) })
function formatDate(iso: string) { return formatShortDate(iso) }

const finalizeOpen = ref(false)
const unfinalizeOpen = ref(false)
// rule/btn-save-toast — a sign-off is a save; it confirms with a success toast.
function doFinalize() { finalizePeriod(periodId.value); successToast(`${periodName.value} ${t('finalized')}`) }
function doUnfinalize() { unfinalizePeriod(periodId.value); successToast(`${periodName.value} ${t('unfinalized')}`) }

/** Finalize is never disabled (rule/btn-no-disabled-validation): pressed early it explains. */
const notReadyOpen = ref(false)
// A not-approved faktur (§5.1 row 13) is excluded from matching — nothing to reconcile.
const openPairCount = computed(() => pairs.value.filter(p => p.match !== 'matched' && !isNotApproved(p)).length)
function showPairsToReview() {
  goToTab(pairs.value.some(p => workspaceTabOf(p) === 'To match') ? 'To match' : 'Not reconciled')
}
const finalizeSignal = inject<Ref<number>>('vatFinalize', ref(0))
watch(finalizeSignal, () => {
  if (finalized.value) unfinalizeOpen.value = true
  else if (canFinalize.value) finalizeOpen.value = true
  else notReadyOpen.value = true
})

// ── Period header: Last sync + Accounts used (US-016 AC-08, VR-4) ────────────
const lastSync = computed(() => { void reconVersion.value; return periodLastSync(periodId.value) })
const accountsUsed = computed(() => { void reconVersion.value; return accountLabels(periodAccountCodes(periodId.value)) })

/** A refused Re-run explains itself in the sign-off banner, never a toast (rule/form-errors-inline). */
const rerunBlocked = ref(false)
watch([finalized, periodId], () => { rerunBlocked.value = false })

/**
 * Re-run (US-002, VR-5). If setup changed since this period last ran, it warns
 * first (US-016 AC-07) — Cancel does nothing, Confirm runs with the current
 * setup, which then becomes the period's snapshot. The run is simulated so the
 * "Reconciling…" state shows; afterwards each row whose status moved says
 * "from X → Y" until reload (US-002 AC-01).
 */
const setupChange = computed(() => { void reconVersion.value; return periodSetupChange(periodId.value) })
const setupChangeOpen = ref(false)
const setupChangeDescription = computed(() => {
  const c = setupChange.value
  if (!c) return ''
  return `${t('Account setup changed since this period was reconciled.')} ${t('Was')}: ${accountLabels(c.was)}. ${t('Now')}: ${accountLabels(c.now)}. ${t('The Reconcile again button uses the current setup.')}`
})
const rerunning = ref(false)
const statusChanges = ref(new Map<string, MatchState>())
watch([periodId, side], () => { statusChanges.value = new Map() })
function reRun() {
  if (finalized.value) { rerunBlocked.value = true; return }
  if (rerunning.value) return
  if (setupChange.value) { setupChangeOpen.value = true; return }
  startRerun()
}
function startRerun() {
  rerunning.value = true
  const run = { periodId: periodId.value, side: side.value }
  const before = new Map(pairsForPeriod(run.periodId, run.side).map(p => [p.id, p.match]))
  setTimeout(() => {
    runPeriod(run.periodId)
    const after = pairsForPeriod(run.periodId, run.side)
    const moved = new Map<string, MatchState>()
    for (const p of after) {
      const was = before.get(p.id)
      if (was && was !== p.match) moved.set(p.id, was)
    }
    statusChanges.value = moved
    rerunning.value = false
    const changedNote = moved.size ? ` · ${moved.size} ${moved.size === 1 ? t('row changed status') : t('rows changed status')}` : ''
    infoToast(`${t('Match re-run')} — ${matchCounts(after).matched} ${t('matched')}${changedNote}`)
  }, RERUN_SIMULATED_MS)
}

// ── Footer counts (US-020 AC-03/AC-04) — "Showing X of Y" follows the view;
// the four counts are period-level, waiting-on-buyer rows outside need review.
const periodFooter = computed(() => footerCounts(pairs.value))


// ── Summary strip (US-020 AC-01/02) — period-level, never filtered ───────────
const erpTotals = computed(() => reconTotals(pairs.value, 'erp'))
const djpTotals = computed(() => reconTotals(pairs.value, 'djp'))
const dppDelta = computed(() => djpTotals.value.dpp - erpTotals.value.dpp)
const ppnDelta = computed(() => djpTotals.value.ppn - erpTotals.value.ppn)
/** Tax difference = |PPN Sales − PPN Faktur| (US-020 AC-02). */
const taxGap = computed(() => Math.abs(djpTotals.value.ppn - erpTotals.value.ppn))

// ── Filters (shared toolbar for every tab) ───────────────────────────────────
/** `matched-auto` / `matched-manual` are views of one MatchState — an audit tells them apart. */
/** `not-approved` lists Draft/Batal/Rejected faktur — the only way to see Batal/Rejected ones. */
/** `not-in-coretax:<sub>` — one option per Tax document not found sub-state (PM, 2026-11-05). */
type StatusFilter = MatchState | 'matched-auto' | 'matched-manual' | 'not-approved' | `not-in-coretax:${string}` | ''
const statusFilter = ref<StatusFilter>('')
const query = ref('')
watch([side, activeTab, periodId], () => { statusFilter.value = ''; query.value = '' })

const tabPairs = computed(() => workspaceTabRows(pairs.value, activeTab.value))
/**
 * The tab has rows at all (before any filter/search). An empty tab shows only its
 * empty state: no toolbar, no footer. A filter or search that empties the list
 * keeps both, so the filter can be cleared.
 */
const tabHasRows = computed(() => tabPairs.value.length > 0)
const counts = computed(() => matchCounts(tabPairs.value))
/**
 * Not-approved faktur on To match (§5.1 row 13): Draft ones are already rows;
 * Batal/Rejected ones are in no tab or count and appear only under this filter.
 */
const hiddenNotApproved = computed(() => { void reconVersion.value; return hiddenNotApprovedFor(periodId.value, side.value) })
const notApprovedRows = computed(() => [...tabPairs.value.filter(isNotApproved), ...hiddenNotApproved.value])

const statusOptions = computed(() => {
  if (activeTab.value === 'Matched') {
    return [
      { value: 'matched-auto', label: `${t('Auto')} (${counts.value['matched-auto'] ?? 0})` },
      { value: 'matched-manual', label: `${t('Manual')} (${counts.value['matched-manual'] ?? 0})` },
    ].filter(o => !o.label.endsWith('(0)'))
  }
  const states = activeTab.value === 'To match'
    ? TO_MATCH_STATES
    : ATTENTION_STATES.filter(s => !TO_MATCH_STATES.includes(s))
  // Not approved is one option below, including the Batal/Rejected faktur no tab lists.
  const options = states
    .filter(k => k !== 'not-approved' && (counts.value[k] ?? 0) > 0)
    .flatMap(k => k === 'not-in-coretax'
      // Tax document not found splits by the transaction's own tax document.
      ? TAX_DOC_SUBSTATES
        .map(sub => ({ sub, n: tabPairs.value.filter(p => taxDocSubState(p) === sub).length }))
        .filter(x => x.n > 0)
        .map(x => ({ value: `not-in-coretax:${x.sub}`, label: `${t(TAX_DOC_SUBSTATE_META[x.sub].label)} (${x.n})` }))
      : [{ value: k as string, label: `${t(MATCH_META[k].chipLabel)} (${counts.value[k] ?? 0})` }])
  if (activeTab.value === 'To match' && notApprovedRows.value.length) {
    options.push({ value: 'not-approved', label: `${t('Not approved')} (${notApprovedRows.value.length})` })
  }
  return options
})

function matchesStatus(p: ReconPair) {
  if (statusFilter.value === 'not-approved') return isNotApproved(p)
  if (statusFilter.value.startsWith('not-in-coretax:')) return taxDocSubState(p) === statusFilter.value.slice('not-in-coretax:'.length)
  if (statusFilter.value === 'matched-manual') return p.matchedBy === 'manual'
  if (statusFilter.value === 'matched-auto') return p.matchedBy !== 'manual'
  return !statusFilter.value || p.match === statusFilter.value
}
function matchesQuery(p: ReconPair) {
  if (!query.value.trim()) return true
  const q = query.value.trim().toLowerCase()
  // No NPWP: the API never sends the buyer's NPWP/NIK (VR-4).
  return [p.erp?.ref, p.erp && partyOf(p.erp), p.djp?.ref, p.djp && partyOf(p.djp)]
    .filter(Boolean).join(' ').toLowerCase().includes(q)
}
const filtered = computed(() => {
  const source = statusFilter.value === 'not-approved' && activeTab.value === 'To match'
    ? [...tabPairs.value, ...hiddenNotApproved.value]
    : tabPairs.value
  const rows = source.filter(p => matchesStatus(p) && matchesQuery(p))
  // Work queues lead with the biggest money at stake; Matched reads newest first.
  return activeTab.value === 'Matched'
    ? [...rows].sort((a, b) => reconDateValue(pairDateOf(b)) - reconDateValue(pairDateOf(a)))
    : [...rows].sort((a, b) => exposureOf(b) - exposureOf(a))
})
const hasNarrowing = computed(() => !!statusFilter.value || !!query.value.trim())
function clearFilters() { statusFilter.value = ''; query.value = '' }
function pairDateOf(p: ReconPair) { return p.erp?.date ?? p.djp?.date ?? '' }

// ── Export (rule/export-modal) ────────────────────────────────────────────────
const exportOpen = ref(false)
const exportColumns = computed(() => [
  { key: 'status', label: t('Status'), required: true },
  { key: 'erpRef', label: t(erpDocLabel.value), required: true },
  { key: 'djpRef', label: t('Tax document') },
  { key: 'party', label: side.value === 'input' ? t('Vendor') : t('Customer') },
  { key: 'dpp', label: 'DPP' },
  { key: 'ppn', label: 'PPN' },
  { key: 'total', label: t('Total') },
  { key: 'reason', label: t('Remarks') },
  // US-014: how a match was made (engine / manual / Airene suggestion, confirmed) and Airene's reason.
  { key: 'origin', label: t('Match origin') },
  { key: 'matchReason', label: t('Match reason') },
])

// Tax documents edited in another tab come back through the `storage` event.
function onStorage(e: StorageEvent) {
  if (e.key?.endsWith(TAX_DOCUMENTS_STORE_KEY)) reloadTaxDocumentsFromStorage()
}
onMounted(() => window.addEventListener('storage', onStorage))
onUnmounted(() => window.removeEventListener('storage', onStorage))

// ── Detail drawer (View details / Find another faktur) ───────────────────────
const drawerOpen = ref(false)
const drawerPair = ref<ReconPair | null>(null)
function openDetail(pair: ReconPair) { drawerPair.value = pair; drawerOpen.value = true }
// The drawer reads the live pair, so a match made inside it shows straight away.
watch(pairs, (list) => {
  if (drawerPair.value) drawerPair.value = list.find(p => p.id === drawerPair.value!.id) ?? drawerPair.value
})

// ═════ To match — bank-style matching rows ═══════════════════════════════════
const currentPage = ref(1)
const perPage = ref(50)
watch([statusFilter, query, side, activeTab, periodId], () => { currentPage.value = 1 })
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
// rule/table-accordion-row-click — the whole line toggles, not only the chevron.
function toggleRow(pair: ReconPair, open?: boolean) {
  const next = new Set(expanded.value)
  if (open ?? !next.has(pair.id)) next.add(pair.id)
  else next.delete(pair.id)
  expanded.value = next
}

/**
 * The counterpart the line proposes. Only records that exist (candidatesFor):
 * the best one, or — for a duplicate reference / netted return — the faktur the
 * pair already carries. `null` → "No match found" and a dashed ✓.
 */
function suggestion(pair: ReconPair): MatchCandidate | null {
  if (pair.match === 'return-netted') return ownFakturCandidate(pair)
  // Airene (US-014) answers for these rows on expand — no heuristic "Match found".
  if (isAireneEligible(pair)) return null
  return hasCandidates(pair) ? (candidatesFor(pair)[0] ?? null) : null
}
/**
 * Airene is filling the missing side's column — loading, or with candidates.
 * Then that column is titled by what it proposes (Tax document / Transaction);
 * "No match" only once Airene has nothing (no_candidates, timeout, flag off).
 */
function aireneFills(pair: ReconPair): boolean {
  if (!isAireneEligible(pair)) return false
  const st = suggestionState(pair)
  return !st || st.status === 'loading' || shownSuggestions(pair, st.response).length > 0
}
/** Which side is missing and is being proposed — the other one is the anchor. */
function proposesFaktur(pair: ReconPair) { return !!pair.erp && (!pair.djp || pair.match === 'duplicate-reference') }

const pickError = ref(new Set<string>())
const finalizedBlocked = ref(new Set<string>())
function anchorTotal(pair: ReconPair) {
  return pair.match === 'return-netted' ? nettedAnchor(pair) : (pair.erp ?? pair.djp)?.total ?? 0
}
const pendingMatch = ref<{ pair: ReconPair; candidate: MatchCandidate; anchor: number } | null>(null)

function onConfirm(pair: ReconPair) {
  if (finalized.value) {
    finalizedBlocked.value = new Set(finalizedBlocked.value).add(pair.id)
    toggleRow(pair, true)
    return
  }
  // Duplicate reference: a person picks the faktur from the list (US-003) —
  // the ✓ opens that list rather than choosing for them.
  if (pair.match === 'duplicate-reference') { toggleRow(pair, true); return }
  const candidate = suggestion(pair)
  // Airene rows: the ✓ opens the row, which asks Airene — nothing to pick yet.
  if (!candidate && isAireneEligible(pair)) { toggleRow(pair, true); return }
  if (!candidate) {
    // Never disabled (rule/btn-no-disabled-validation): say what's missing, where.
    pickError.value = new Set(pickError.value).add(pair.id)
    toggleRow(pair, true)
    return
  }
  const anchor = anchorTotal(pair)
  // A match whose sides differ is never one click — the modal asks why (review P0).
  if (anchor !== candidate.total) { pendingMatch.value = { pair, candidate, anchor }; return }
  saveMatch(pair, candidate, anchor)
}
function saveMatch(pair: ReconPair, candidate: MatchCandidate, anchor: number) {
  const ok = confirmManualMatch({ pair, periodId: periodId.value, side: side.value, candidate, anchorTotal: anchor })
  if (!ok) return
  pendingMatch.value = null
  successToast(t('Match confirmed'))
  toggleRow(pair, false)
}
function onMatchModalConfirm() {
  const m = pendingMatch.value
  if (m) saveMatch(m.pair, m.candidate, m.anchor)
}

/** The transaction's own tax document when the sub-state is draft / submitted / rejected. */
function ownTaxDoc(pair: ReconPair) {
  const sub = taxDocSubState(pair)
  return sub && sub !== 'none' ? erpFakturOf(pair)?.doc ?? null : null
}

/** Duplicate reference picker (US-003 AC-01/02) — Select faktur reconciles the pair (manual). */
function duplicateCandidates(pair: ReconPair): MatchCandidate[] {
  return pair.match === 'duplicate-reference' ? candidatesFor(pair) : []
}
function selectFaktur(pair: ReconPair, candidate: MatchCandidate) {
  if (finalized.value) { finalizedBlocked.value = new Set(finalizedBlocked.value).add(pair.id); return }
  const anchor = anchorTotal(pair)
  if (anchor !== candidate.total) { pendingMatch.value = { pair, candidate, anchor }; return }
  saveMatch(pair, candidate, anchor)
}

function fieldValue(row: ReconRecord | null, key: keyof ReconRecord, money?: boolean): string {
  if (!row) return '—'
  const v = row[key]
  if (v == null || v === '') return '—'
  return money ? formatIDR(Number(v)) : String(v)
}

/** The engine's reason, as a Pixel banner in the state's colour (as in the drawer). */
const BANNER_VARIANT = { completed: 'success', information: 'info', announcement: 'info', warning: 'warning', critical: 'danger' } as const
function bannerVariant(pair: ReconPair) { return BANNER_VARIANT[statusBadgeTypeOf(pair)] }
// Which expand column reads "No match" — the row's reason sits there as plain text
// (under the "No match" title) instead of in a banner above both columns.
function erpIsNoMatch(pair: ReconPair) { return !(pair.erp || (suggestion(pair) && !proposesFaktur(pair)) || aireneFills(pair)) }
function djpIsNoMatch(pair: ReconPair) { return !(pair.djp || ownTaxDoc(pair) || aireneFills(pair) || suggestion(pair)) }
/** Airene is still searching that column — no banner until it answers. */
function aireneSearching(pair: ReconPair) {
  if (!isAireneEligible(pair)) return false
  const st = suggestionState(pair)
  return !st || st.status === 'loading'
}
function reasonInColumn(pair: ReconPair) { return !!statusReasonOf(pair) && (erpIsNoMatch(pair) || djpIsNoMatch(pair)) }
function reasonTitleOf(pair: ReconPair) { return taxDocSubState(pair) ? statusLabelOf(pair) : MATCH_META[pair.match].longLabel }

// ── Per-side ⋮ menus (the reference's menu under each column title) ──────────
interface MenuItem { label: string; run: () => void }
function erpMenu(pair: ReconPair): MenuItem[] {
  const items: MenuItem[] = [{ label: 'View details', run: () => openDetail(pair) }]
  if (canRemark(pair)) items.push({ label: 'Remarks', run: () => openRemarks(pair) })
  if (pair.erp?.salesInvoiceId) {
    const id = pair.erp.salesInvoiceId
    items.push({ label: 'View sales invoice', run: () => window.open(`/sales-invoices/${id}`, '_blank', 'noopener') })
    const f = erpFakturOf(pair)
    if (f?.state === 'none') items.push({ label: 'Create tax document', run: () => window.open(salesInvoiceTaxDocUrl(id, 'create'), '_blank', 'noopener') })
    else if (f?.state === 'draft' && f.doc) {
      items.push({ label: 'Edit tax document', run: () => window.open(salesInvoiceTaxDocUrl(id, 'edit', f.doc!.id), '_blank', 'noopener') })
      items.push({ label: 'Submit tax document', run: () => submitOne(pair) })
    } else if (f?.doc) items.push({ label: 'View tax document', run: () => window.open(salesInvoiceTaxDocUrl(id, 'view'), '_blank', 'noopener') })
  }
  return items
}
function djpMenu(pair: ReconPair): MenuItem[] {
  const items: MenuItem[] = [{ label: 'View details', run: () => openDetail(pair) }]
  if (pair.djp) items.push({ label: 'View tax document', run: () => infoToast(t('Opening tax document…')) })
  if (!pair.erp) {
    items.push({
      label: side.value === 'input' ? 'Create purchase invoice' : 'Create sales invoice',
      run: () => infoToast(t('Opening sales invoice…')),
    })
  }
  return items
}

// ── Remarks (US-013) ─────────────────────────────────────────────────────────
const remarkTarget = ref<ReconPair | null>(null)
function openRemarks(pair: ReconPair) { remarkTarget.value = pair }
function onRemarkSaved() { remarkTarget.value = null; successToast(t('Remarks saved')) }

// ── Drafts: submit to DJP in bulk (To match) ─────────────────────────────────
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
function clearDrafts() { selectedDrafts.value = new Set(); bulkError.value = false }
const allDraftsSelected = computed(() => draftRows.value.length > 0 && selectedDraftRows.value.length === draftRows.value.length)
const someDraftsSelected = computed(() => selectedDraftRows.value.length > 0 && !allDraftsSelected.value)
function toggleAllDrafts() {
  if (allDraftsSelected.value) clearDrafts()
  else { selectedDrafts.value = new Set(draftRows.value.map(p => p.id)); bulkError.value = false }
}
const bulkConfirmOpen = ref(false)
const bulkError = ref(false)
function askBulkSubmit() {
  bulkError.value = !canSubmitTaxDocument.value
  if (bulkError.value) return
  bulkConfirmOpen.value = true
}
function submitOne(pair: ReconPair) { selectedDrafts.value = new Set([pair.id]); askBulkSubmit() }
function doBulkSubmit() {
  const rows = selectedDraftRows.value
  for (const p of rows) {
    const id = draftDocId(p)
    if (id) updateTaxDocumentStatus(id, 'awaiting-approval')
  }
  // One document reads like the row's own Submit tax document.
  successToast(rows.length === 1 ? t('Tax document submitted') : `${rows.length} ${t('tax documents submitted to DJP')}`)
  clearDrafts()
}

// ═════ Not reconciled + Matched — ErpTablePage tables ════════════════════════
interface TableRow {
  id: string
  pair: ReconPair
  date: string
  dateValue: number
  erpRef: string
  djpRef: string
  party: string
  erpTotal: number | null
  djpTotal: number | null
  erpDate: string
  djpDate: string
}
const tableRows = computed<TableRow[]>(() => filtered.value.map(p => ({
  id: p.id,
  pair: p,
  date: pairDateOf(p),
  dateValue: reconDateValue(pairDateOf(p)),
  erpRef: p.erp?.ref ?? '',
  djpRef: p.djp?.ref ?? '',
  party: (p.erp ?? p.djp) ? partyOf((p.erp ?? p.djp)!) : '',
  erpTotal: p.erp?.total ?? null,
  djpTotal: p.djp?.total ?? null,
  erpDate: p.erp?.date ?? '',
  djpDate: p.djp?.date ?? '',
})))
const {
  currentPage: tablePage, perPage: tablePerPage, paginated, total: tableTotal,
  setPage: setTablePage, setPerPage: setTablePerPage, sortKey, sortDir, toggleSort,
} = useTableState<TableRow>(tableRows, { perPage: 25 })
watch([activeTab, statusFilter, query], () => setTablePage(1))

/** Dates in tables are DD/MM/YYYY (rule/format-date); fixtures store "15 Feb 2027". */
function tableDate(d: string) {
  const v = reconDateValue(d)
  return v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '—'
}

const notReconciledColumns = computed<TableColumn[]>(() => [
  { key: 'date',     label: t('Date'),            kind: 'date' },
  { key: 'erpRef',   label: t('Transaction number'), kind: 'number' },
  { key: 'party',    label: side.value === 'input' ? t('Vendor') : t('Customer'), kind: 'name' },
  { key: 'erpTotal', label: t('Transaction amount'),  kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'djpTotal', label: t('Tax document amount'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'status',   label: t('Status'),          kind: 'status' },
])
// Like the reference's Matched table: each document's number rides as a caption
// under its amount (Statement amount / Book amount), so the table stays 5 columns.
const matchedColumns = computed<TableColumn[]>(() => [
  { key: 'erpDate',  label: t('Transaction date'),    kind: 'date' },
  { key: 'erpRef',   label: t('Transaction number'),  kind: 'number' },
  { key: 'erpTotal', label: t('Transaction amount'),  kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'djpDate',  label: t('Tax document date'),   kind: 'date' },
  { key: 'djpTotal', label: t('Tax document amount'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'method',   label: t('Method'),          kind: 'status' },
])

// Unmatch (Matched tab) — confirmed first; a person's match is undone, an
// engine match splits back into its two open rows (US-002 AC-03).
const unmatchTarget = ref<ReconPair | null>(null)
function doUnmatch() {
  const p = unmatchTarget.value
  if (!p) return
  if (manualMatchOf(p.id)) undoManualMatch(p.id)
  else unmatchAutoPair(p)
  successToast(t('Match canceled'))
  unmatchTarget.value = null
}
</script>

<template>
  <div class="vr-page">
    <!-- Signed off — MpBanner, as the work order notices use it. -->
    <MpBanner v-if="finalized && finalization" variant="success" is-inline class="vr-finalized" data-devchange="vat-recon-workspace-reconciliations">
      <MpBannerIcon />
      <MpBannerDescription>
        <strong>{{ t('Finalized') }}</strong>
        {{ t('by') }} {{ finalization.finalizedBy }} · {{ formatDate(finalization.finalizedAt) }}.
        {{ t('Transactions stay editable in Jurnal; changes will be flagged here.') }}
        <span v-if="rerunBlocked" class="vr-finalized-error" role="alert">
          {{ t('The Reconcile again button is not available while the period is finalized. Unfinalize it first.') }}
        </span>
      </MpBannerDescription>
    </MpBanner>

    <!-- Period header: Last sync + the accounts this period's last run used
         (US-016 AC-08). The snapshot can differ from today's setup; Re-run warns. -->
    <div class="vr-meta" data-devchange="vat-recon-prd-align-header" data-test-id="vr-meta">
      <span data-devchange="vat-recon-masa-in-meta" data-test-id="vr-masa"><span class="vr-meta-label">{{ t('Masa pajak') }}:</span> {{ periodMasa }}</span>
      <span class="vr-meta-sep" aria-hidden="true">·</span>
      <span><span class="vr-meta-label">{{ t('Last sync') }}:</span> {{ lastSync }}</span>
      <span class="vr-meta-sep" aria-hidden="true">·</span>
      <span><span class="vr-meta-label">{{ t('Accounts used') }}:</span> <span data-test-id="vr-accounts-used">{{ accountsUsed }}</span></span>
    </div>
    <MpBanner v-if="rerunning" variant="info" is-inline data-devchange="vat-recon-prd-align-rerun" data-test-id="vr-reconciling">
      <MpBannerIcon />
      <MpBannerDescription>{{ t('Reconciling…') }}</MpBannerDescription>
    </MpBanner>

    <!-- Summary — the bank Reconciliations header: divider columns, no cards. -->
    <div class="vr-summary" data-devchange="vat-recon-workspace-reconciliations">
      <div class="vr-sum" data-devchange="vat-recon-transaction-vs-tax-document">
        <span class="vr-sum-label">{{ t(L.kpiErpDpp) }}</span>
        <span class="vr-sum-value">{{ formatIDR(erpTotals.dpp) }}</span>
      </div>
      <div class="vr-sum">
        <span class="vr-sum-label">{{ t(L.kpiDjpDpp) }}</span>
        <span class="vr-sum-value">{{ formatIDR(djpTotals.dpp) }}</span>
        <span v-if="dppDelta !== 0" class="vr-sum-delta">{{ dppDelta > 0 ? '▲' : '▼' }} {{ formatIDR(Math.abs(dppDelta)) }} {{ t('vs transactions') }}</span>
      </div>
      <div class="vr-sum">
        <span class="vr-sum-label">{{ t(L.kpiErpPpn) }}</span>
        <span class="vr-sum-value">{{ formatIDR(erpTotals.ppn) }}</span>
      </div>
      <div class="vr-sum">
        <span class="vr-sum-label">{{ t(L.kpiDjpPpn) }}</span>
        <span class="vr-sum-value">{{ formatIDR(djpTotals.ppn) }}</span>
        <span v-if="ppnDelta !== 0" class="vr-sum-delta">{{ ppnDelta > 0 ? '▲' : '▼' }} {{ formatIDR(Math.abs(ppnDelta)) }} {{ t('vs transactions') }}</span>
      </div>
      <div class="vr-sum" data-devchange="vat-recon-prd-align-approved-totals">
        <span class="vr-sum-label">{{ t('Tax difference') }}</span>
        <span class="vr-sum-sub">{{ openPairCount }} {{ t('pairs to reconcile') }}</span>
        <span class="vr-sum-value" :class="taxGap === 0 ? 'is-clear' : 'is-gap'">{{ formatIDR(taxGap) }}</span>
      </div>
    </div>

    <!-- Tabs under the summary (reference layout) — MpTabs, tabs.md §2. Counts
         use the same warning badge as the title-bar page tabs. -->
    <MpTabs id="vr-workspace-tabs" v-model="tabModel" is-manual variant-color="green" class="vr-tabs" data-devchange="vat-recon-workspace-tabs-inline">
      <MpTabList>
        <MpTab v-for="tab in WORKSPACE_TABS" :id="`vr-tab-${tab.toLowerCase().replace(/ /g, '-')}`" :key="tab" :value="tab">
          <span class="vr-tab-label">
            {{ t(tab) }}
            <MpBadge v-if="tabCounts[tab] > 0" class="vr-tab-count" for="additionalInformation" type="warning" size="sm">{{ tabCounts[tab] }}</MpBadge>
          </span>
        </MpTab>
      </MpTabList>
    </MpTabs>

    <!-- Filter bar — same anatomy on every tab -->
    <div v-if="tabHasRows" class="vr-toolbar" data-devchange="vat-recon-empty-tab-chrome">
      <div class="filter-left">
        <ErpFilterSelect id="vr-status-filter" v-model="statusFilter" data-devchange="vat-recon-prd-align-not-approved-filter" :placeholder="t('Status')" :options="statusOptions" width="220px" />
      </div>
      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip id="vr-tt-export" :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
          </MpTooltip>
        </MpButtonGroup>
        <div class="filter-search">
          <MpIcon name="search" size="sm" class="vr-search-icon" />
          <input v-model="query" class="filter-search-input" type="text" :placeholder="t('Search...')" >
          <MpButton v-if="query" class="search-clear-btn" variant="ghost" type="button" :aria-label="t('Clear search')" left-icon="close" @click="query = ''" />
        </div>
        <!-- Search-adjacent action = black tertiary (rule/filter-bar-action-tertiary) -->
        <MpButton variant="tertiary" is-rounded :is-loading="rerunning" data-devchange="vat-recon-prd-align-rerun" data-test-id="vr-rerun" @click="reRun">{{ t('Reconcile again') }}</MpButton>
      </div>
    </div>

    <!-- ═════ To match ═════ -->
    <template v-if="activeTab === 'To match'">
      <div class="vr-rows" :class="{ 'has-drafts': draftRows.length }" data-devchange="vat-recon-workspace-reconciliations">
        <!-- Empty: nothing to match at all vs nothing for these filters -->
        <div v-if="filtered.length === 0 && !hasNarrowing" class="vr-empty">
          <img src="/illustrations/empty-folder.png" alt="" class="vr-empty-illustration" width="288" height="240" >
          <div class="vr-empty-title">{{ t('Nothing to match') }}</div>
          <div class="vr-empty-body">{{ t('Every pair in this period has its counterpart.') }}</div>
          <MpButton variant="secondary" is-rounded class="vr-empty-cta" @click="goToTab('Matched')">{{ t('View matched') }}</MpButton>
        </div>
        <div v-else-if="filtered.length === 0" class="vr-empty">
          <div class="vr-empty-title">{{ t('No pairs match your filters') }}</div>
          <div class="vr-empty-body">{{ t('Recheck the filters you have applied and try filtering again.') }}</div>
          <MpButton variant="secondary" is-rounded class="vr-empty-cta" @click="clearFilters">{{ t('Clear all filters') }}</MpButton>
        </div>

        <!-- Drafts — ErpTablePage bulk-bar anatomy -->
        <div v-if="draftRows.length" class="vr-bulk" :class="{ 'is-active': selectedDraftRows.length }">
          <div class="vr-bulk-left">
            <MpCheckbox id="vr-bulk-select-all" :is-checked="allDraftsSelected" :is-indeterminate="someDraftsSelected" :aria-label="t('Select all drafts')" @change="toggleAllDrafts" />
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
          <button type="button" class="btn-enterprise vr-group-head" :aria-expanded="!collapsedGroups.has(g.key)" @click="toggleGroup(g.key)">
            <MpIcon :name="collapsedGroups.has(g.key) ? 'chevrons-right' : 'chevrons-down'" size="sm" />
            <span>{{ g.label }}</span>
          </button>

          <template v-if="!collapsedGroups.has(g.key)">
            <div v-for="pair in g.pairs" :key="pair.id" class="vr-item" :class="{ 'is-open': isExpanded(pair) }" :data-pair-id="pair.id">
              <!-- One line: chevron | ERP ⋯ Coretax | ✓ — the whole line toggles -->
              <div class="vr-line" @click="toggleRow(pair)">
                <div class="vr-lead">
                  <!-- Draft rows are selectable for bulk Submit — the row-selection spot, left of the chevron. -->
                  <label v-if="draftDocId(pair)" class="vr-draft-check" data-devchange="vat-recon-expand-fixes" @click.stop>
                    <MpCheckbox :id="`vr-draft-${pair.id}`" :is-checked="selectedDrafts.has(pair.id)" :aria-label="`${t('Select draft for')} ${pair.erp?.ref}`" @change="(v: boolean) => toggleDraft(pair, v)" />
                  </label>
                  <span v-else-if="draftRows.length" class="vr-draft-check-spacer" aria-hidden="true" />
                  <MpButton variant="ghost" is-rounded class="vr-chevron" :aria-label="isExpanded(pair) ? t('Collapse') : t('Expand')" :aria-expanded="isExpanded(pair)" @click.stop="toggleRow(pair)">
                  <MpIcon :name="isExpanded(pair) ? 'chevrons-up' : 'chevrons-down'" size="sm" />
                </MpButton>
                </div>

                <!-- ERP side (right-aligned against the connector) -->
                <div class="vr-erp">
                  <template v-if="pair.erp">
                    <span class="vr-caption">{{ pair.erp.date }}</span>
                    <span class="vr-amount">{{ formatAmountPlain(pair.erp.total) }}</span>
                    <span class="vr-caption">{{ pair.erp.ref }} · {{ partyOf(pair.erp) }}</span>
                  </template>
                  <template v-else-if="suggestion(pair)">
                    <span class="vr-caption">{{ suggestion(pair)!.date }}</span>
                    <span class="vr-amount">{{ formatAmountPlain(suggestion(pair)!.total) }}</span>
                    <span class="vr-caption">{{ suggestion(pair)!.ref }} · {{ suggestion(pair)!.party }}</span>
                  </template>
                  <template v-else>
                    <span class="vr-missing">{{ t('No match found') }}</span>
                    <!-- A tax-document-only row says why under "No match found", the way an
                         invoice-only row does on its side (Not approved sits beside the number). -->
                    <span v-if="pair.djp && !isNotApproved(pair)" class="vr-state" :style="{ color: statusFgOf(pair) }" data-devchange="vat-recon-row-why-left">{{ t(statusLabelOf(pair)) }}</span>
                  </template>
                </div>

                <span class="vr-dash" aria-hidden="true" />

                <!-- Coretax side, with the status as coloured text (no badge) -->
                <div class="vr-djp-cell">
                  <div class="vr-djp">
                    <template v-if="pair.djp">
                      <span class="vr-caption">{{ pair.djp.date }}</span>
                      <span class="vr-amount">{{ formatAmountPlain(pair.djp.total) }}</span>
                      <!-- number · status, with the row's state beside it (reference layout). -->
                      <!-- One caption line: number · status · row state (same size and colour). -->
                      <span class="vr-caption" data-devchange="vat-recon-row-state-beside-number">{{ pair.djp.ref }} · {{ pair.djp.approved !== false ? t('Approved') : t(pair.djp.coretaxStatus ?? 'Draft') }}<template v-if="!pair.erp && suggestion(pair)"> · <span class="vr-state-text">{{ t('Match found') }}</span></template><template v-else-if="isNotApproved(pair)"> · <MpTooltip :id="`vr-not-approved-${pair.id}`" :label="t(notApprovedHint(pair.djp))" placement="top" use-portal><span class="vr-state-text" data-test-id="vr-not-approved" data-devchange="vat-recon-prd-align-not-approved">{{ t('Not approved') }}</span></MpTooltip></template><template v-else-if="pair.erp"> · <span class="vr-state-text">{{ t(statusLabelOf(pair)) }}</span></template></span>
                    </template>
                    <template v-else-if="suggestion(pair)">
                      <span class="vr-caption">{{ suggestion(pair)!.date }}</span>
                      <span class="vr-amount">{{ formatAmountPlain(suggestion(pair)!.total) }}</span>
                      <span class="vr-caption">{{ suggestion(pair)!.ref }} · {{ t(suggestion(pair)!.why) }} · <span class="vr-state-text">{{ t('Match found') }}</span></span>
                    </template>
                    <template v-else-if="pair.djp">
                      <span class="vr-caption">{{ pair.djp.date }}</span>
                      <span class="vr-amount">{{ formatAmountPlain(pair.djp.total) }}</span>
                      <span class="vr-caption">{{ pair.djp.ref }} · {{ partyOf(pair.djp) }}</span>
                    </template>
                    <template v-else>
                      <span class="vr-missing">{{ t('No match found') }}</span>
                      <!-- Tax document not found: which sub-state, in its colour (PM, 2026-11-05) -->
                      <span v-if="taxDocSubState(pair)" class="vr-state" :style="{ color: statusFgOf(pair) }" data-devchange="vat-recon-tax-doc-substates">{{ t(statusLabelOf(pair)) }}</span>
                    </template>
                    <VatReconciliationRowMarkers :pair="pair" :changed-from="statusChanges.get(pair.id)" />
                  </div>
                </div>

                <!-- ✓ ring: solid = a match to confirm, dashed = no match yet -->
                <div class="vr-confirm-cell" @click.stop>
                  <MpTooltip :id="`vr-confirm-${pair.id}`" :label="pair.match === 'duplicate-reference' ? t('Select faktur') : suggestion(pair) ? t('Confirm match') : t('No match to confirm yet')" placement="top" use-portal>
                    <button type="button" class="btn-enterprise vr-confirm" :class="{ 'is-dashed': !suggestion(pair) }" :aria-label="t('Confirm match')" @click="onConfirm(pair)">
                      <MpIcon name="check" size="sm" />
                    </button>
                  </MpTooltip>
                </div>
              </div>

              <!-- Expand: two columns, each titled with its ⋮ menu (reference layout) -->
              <div v-if="isExpanded(pair)" class="vr-detail">
                <MpBanner v-if="statusReasonOf(pair) && !reasonInColumn(pair) && !aireneSearching(pair)" :variant="bannerVariant(pair)" is-inline class="vr-reason" data-devchange="vat-recon-workspace-banner-top">
                  <MpBannerIcon />
                  <MpBannerDescription>
                    <strong>{{ t(reasonTitleOf(pair)) }}</strong> · {{ t(statusReasonOf(pair)!) }}
                  </MpBannerDescription>
                </MpBanner>
                <div class="vr-detail-col">
                  <div class="vr-detail-head">
                    <span class="vr-detail-title">{{ erpIsNoMatch(pair) ? t('No match') : t(erpDocLabel) }}</span>
                    <MpPopover :id="`vr-erp-menu-${pair.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                      <MpPopoverTrigger>
                        <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
                      </MpPopoverTrigger>
                      <MpPopoverContent class="erp-dropdown-menu">
                        <MpPopoverList>
                          <MpPopoverListItem v-for="item in erpMenu(pair)" :key="item.label" @click="item.run()">{{ t(item.label) }}</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </div>
                  <!-- Why there's no match — plain text under "No match", in the state's colour. -->
                  <div v-if="erpIsNoMatch(pair) && statusReasonOf(pair)" class="vr-no-match-reason" data-devchange="vat-recon-reason-under-no-match">
                    <span class="vr-no-match-reason__title" :style="isNotApproved(pair) ? undefined : { color: statusFgOf(pair) }">{{ t(reasonTitleOf(pair)) }}</span>
                    <p class="vr-no-match-reason__text">{{ t(statusReasonOf(pair)!) }}</p>
                  </div>
                  <div v-if="pair.erp" class="vr-kv">
                    <ContentList v-for="f in compareFields(side)" :key="f.key" horizontal :label="t(f.label)" :value="fieldValue(pair.erp, f.key, f.money)" :class="{ 'is-diff': isFieldDiff(pair, f.key) }" />
                    <template v-if="pair.erp.returnRef">
                      <div class="vr-detail-title vr-detail-title--sub">{{ t('Sales return') }}</div>
                      <ContentList horizontal :label="t('Number')" :value="pair.erp.returnRef" />
                      <ContentList horizontal :label="t('Total')" :value="pair.erp.returnTotal != null ? formatIDR(pair.erp.returnTotal) : '—'" />
                      <ContentList horizontal :label="t('Invoice − return')" :value="formatIDR(nettedAnchor(pair))" />
                    </template>
                  </div>
                  <template v-else-if="suggestion(pair)">
                    <div class="vr-kv">
                      <ContentList horizontal :label="t('Number')" :value="suggestion(pair)!.ref" />
                      <ContentList horizontal :label="t('Date')" :value="suggestion(pair)!.date" />
                      <ContentList horizontal :label="t('Total')" :value="formatIDR(suggestion(pair)!.total)" />
                    </div>
                    <p class="vr-caption vr-why">{{ t(suggestion(pair)!.why) }}</p>
                  </template>
                  <template v-else>
                    <VatReconciliationAireneSuggestions
                      v-if="isAireneEligible(pair)"
                      :pair="pair" :side="side" :period-id="periodId" :finalized="finalized"
                      @matched="toggleRow(pair, false)"
                    />
                    <p class="vr-detail-sub">{{ t("Don't see the correct transaction?") }}</p>
                    <div class="vr-detail-actions">
                      <MpButton variant="secondary" size="sm" is-rounded @click="openDetail(pair)">{{ t('Find another transaction') }}</MpButton>
                      <MpButton v-if="pair.match === 'no-match-in-erp'" variant="tertiary" size="sm" is-rounded data-devchange="vat-recon-expand-tertiary" @click="infoToast(t('Opening sales invoice…'))">{{ t('Create sales invoice') }}</MpButton>
                    </div>
                  </template>
                </div>

                <div class="vr-detail-col">
                  <div class="vr-detail-head">
                    <span class="vr-detail-title">{{ pair.djp || ownTaxDoc(pair) || aireneFills(pair) ? t('Tax document') : suggestion(pair) ? t('Matched tax document') : t('No match') }}</span>
                    <MpPopover :id="`vr-djp-menu-${pair.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                      <MpPopoverTrigger>
                        <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
                      </MpPopoverTrigger>
                      <MpPopoverContent class="erp-dropdown-menu">
                        <MpPopoverList>
                          <MpPopoverListItem v-for="item in djpMenu(pair)" :key="item.label" @click="item.run()">{{ t(item.label) }}</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </div>
                  <!-- Why there's no match — plain text under "No match", in the state's colour. -->
                  <div v-if="djpIsNoMatch(pair) && statusReasonOf(pair)" class="vr-no-match-reason" data-devchange="vat-recon-reason-under-no-match">
                    <span class="vr-no-match-reason__title" :style="isNotApproved(pair) ? undefined : { color: statusFgOf(pair) }">{{ t(reasonTitleOf(pair)) }}</span>
                    <p class="vr-no-match-reason__text">{{ t(statusReasonOf(pair)!) }}</p>
                  </div>
                  <!-- Tax document not found, own tax document past "none": show THAT
                       document and its next step — never "Find another" (PM, 2026-11-05). -->
                  <template v-if="ownTaxDoc(pair)">
                    <div class="vr-kv" data-devchange="vat-recon-tax-doc-substates" data-test-id="vr-own-tax-doc">
                      <ContentList horizontal :label="t('Number')" :value="formatTaxDocumentNumber(ownTaxDoc(pair)!)" />
                      <ContentList horizontal :label="t('Status')" :value="t(DJP_STATUS_CONFIG[ownTaxDoc(pair)!.status].label)" />
                      <ContentList horizontal :label="t('Date')" :value="ownTaxDoc(pair)!.date" />
                      <ContentList horizontal label="DPP" :value="formatIDR(pair.erp?.dpp ?? 0)" />
                      <ContentList horizontal label="PPN" :value="formatIDR(pair.erp?.ppn ?? 0)" />
                      <ContentList v-if="ownTaxDoc(pair)!.djpRemark" horizontal :label="t('DJP remark')" :value="ownTaxDoc(pair)!.djpRemark!" />
                    </div>
                    <VatReconciliationTaxDocActions class="vr-detail-actions-block" :pair="pair" :show-hint="false" layout="row" size="sm" main-variant="tertiary" data-devchange="vat-recon-expand-tertiary" />
                  </template>
                  <div v-else-if="pair.djp" class="vr-kv">
                    <ContentList v-for="f in compareFields(side)" :key="f.key" horizontal :label="t(f.label)" :value="fieldValue(pair.djp, f.key, f.money)" :class="{ 'is-diff': isFieldDiff(pair, f.key) }" />
                  </div>
                  <template v-else-if="suggestion(pair)">
                    <div class="vr-kv">
                      <ContentList horizontal :label="t('Number')" :value="suggestion(pair)!.ref" />
                      <ContentList horizontal :label="t('Date')" :value="suggestion(pair)!.date" />
                      <ContentList horizontal :label="side === 'input' ? t('Vendor') : t('Customer')" :value="suggestion(pair)!.party" />
                      <ContentList horizontal label="DPP" :value="formatIDR(suggestion(pair)!.dpp)" />
                      <ContentList horizontal label="PPN" :value="formatIDR(suggestion(pair)!.ppn)" />
                      <ContentList horizontal :label="t('Total')" :value="formatIDR(suggestion(pair)!.total)" />
                    </div>
                  </template>
                  <template v-if="taxDocSubState(pair) === 'none' || pair.match === 'duplicate-reference'">
                    <VatReconciliationAireneSuggestions
                      v-if="isAireneEligible(pair)"
                      :pair="pair" :side="side" :period-id="periodId" :finalized="finalized"
                      @matched="toggleRow(pair, false)"
                    />
                    <p class="vr-detail-sub vr-find-lead">{{ t("Don't see the correct tax document?") }}</p>
                    <!-- none: Find another (secondary) + Create tax document (primary) -->
                    <VatReconciliationTaxDocActions v-if="taxDocSubState(pair) === 'none'" :pair="pair" :show-hint="false" layout="row" size="sm" main-variant="tertiary" data-devchange="vat-recon-expand-tertiary" show-find @find="openDetail(pair)" />
                    <MpButton v-else variant="secondary" is-rounded @click="openDetail(pair)">{{ t('Find another tax document') }}</MpButton>
                  </template>
                  <p v-if="finalizedBlocked.has(pair.id)" class="vr-pick-error" role="alert">{{ t('This period is finalized. Unfinalize it first to change matches.') }}</p>
                  <p v-else-if="pickError.has(pair.id) && isNotApproved(pair)" class="vr-pick-error" role="alert">{{ t('This tax document is not approved yet, so it is excluded from matching.') }}</p>
                  <p v-else-if="pickError.has(pair.id)" class="vr-pick-error" role="alert">{{ t('There is no tax document to match yet. Find another tax document, or fix it on the document.') }}</p>
                </div>

                <!-- Duplicate reference (US-003 AC-01/02): every Approved faktur
                     carrying this invoice number; the latest pengganti is Suggested. -->
                <div v-if="duplicateCandidates(pair).length" class="vr-dup" data-devchange="vat-recon-prd-align-duplicate" data-test-id="vr-dup-picker">
                  <div class="vr-detail-title">{{ t('Select the correct faktur') }}</div>
                  <div v-for="c in duplicateCandidates(pair)" :key="c.ref" class="vr-dup-row" :data-ref="c.ref">
                    <div class="vr-dup-id">
                      <span class="vr-dup-ref">{{ c.ref }}</span>
                      <span class="vr-caption">{{ c.date }} · {{ t(c.why) }}</span>
                    </div>
                    <span v-if="c.suggested" class="vr-tag" data-test-id="vr-dup-suggested"><MpTag>{{ t('Suggested') }}</MpTag></span>
                    <span class="vr-amount vr-dup-total">{{ formatAmountPlain(c.total) }}</span>
                    <MpButton variant="secondary" size="sm" is-rounded @click="selectFaktur(pair, c)">{{ t('Select faktur') }}</MpButton>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </section>

        <ErpPagination
          v-if="filtered.length"
          class="vr-pagination"
          :total="filtered.length"
          :current-page="currentPage"
          :per-page="perPage"
          @page-change="(p: number) => (currentPage = p)"
          @per-page-change="setPerPage"
        />
      </div>
    </template>

    <!-- ═════ Not reconciled / Matched — tables ═════ -->
    <ErpTablePage
      v-else
      :columns="activeTab === 'Matched' ? matchedColumns : notReconciledColumns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="tableTotal"
      :current-page="tablePage"
      :per-page="tablePerPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :search="query"
      :has-active-filter="hasNarrowing"
      filter-empty-label="pair"
      data-devchange="vat-recon-workspace-reconciliations"
      @page-change="setTablePage"
      @per-page-change="setTablePerPage"
      @sort="toggleSort"
      @clear-filters="clearFilters"
    >
      <template #cell-date="{ value }">{{ tableDate(value as string) }}</template>
      <template #cell-erpDate="{ value }">{{ value ? tableDate(value as string) : '—' }}</template>
      <template #cell-djpDate="{ value }">{{ value ? tableDate(value as string) : '—' }}</template>
      <!-- The identifier opens the detail drawer (rule/table-name-link-span) -->
      <template #cell-erpRef="{ row }">
        <span v-if="(row as unknown as TableRow).erpRef" class="cell-link cell-text" @click.stop="openDetail((row as unknown as TableRow).pair)">{{ (row as unknown as TableRow).erpRef }}</span>
        <span v-else class="cell-link cell-text" @click.stop="openDetail((row as unknown as TableRow).pair)">{{ t('Transaction not found') }}</span>
      </template>
      <template #cell-djpRef="{ value }">{{ value || '—' }}</template>
      <template #cell-erpTotal="{ row, value }">
        <span class="vr-cell-stack">
          <span>{{ value == null ? '—' : formatAmountPlain(value as number) }}</span>
        </span>
      </template>
      <template #cell-djpTotal="{ row, value }">
        <span class="vr-cell-stack">
          <span>{{ value == null ? '—' : formatAmountPlain(value as number) }}</span>
          <span v-if="activeTab === 'Matched' && (row as unknown as TableRow).djpRef" class="vr-cell-sub">{{ (row as unknown as TableRow).djpRef }}</span>
        </span>
      </template>
      <template #cell-status="{ row }">
        <span class="vr-status">
          <MpTooltip :id="`vr-status-tt-${(row as unknown as TableRow).id}`" :label="t(statusLabelOf((row as unknown as TableRow).pair))" placement="top" use-portal>
            <span class="vr-tag"><MpBadge :type="statusBadgeTypeOf((row as unknown as TableRow).pair)" for="tableStatus">{{ t(statusBadgeOf((row as unknown as TableRow).pair)) }}</MpBadge></span>
          </MpTooltip>
          <MpTag v-if="isWaitingOnBuyer((row as unknown as TableRow).pair)">{{ t('Waiting on buyer') }}</MpTag>
          <VatReconciliationRowMarkers :pair="(row as unknown as TableRow).pair" :changed-from="statusChanges.get((row as unknown as TableRow).id)" />
        </span>
      </template>
      <!-- Method — plain text (Auto / Manual / Airene), no tag -->
      <template #cell-method="{ row }">
        <span class="vr-status">
          <!-- Airene = a suggestion a person confirmed (US-014); the tooltip says who. -->
          <MpTooltip v-if="(row as unknown as TableRow).pair.matchOrigin === 'ai_suggested_human_confirmed'" :id="`vr-method-tt-${(row as unknown as TableRow).id}`" :label="`${t('Suggested by Airene, confirmed by')} ${manualMatchOf((row as unknown as TableRow).id)?.by ?? ''}`" placement="top" use-portal>
            <span class="vr-method-text" data-devchange="vat-recon-airene-suggest" data-test-id="vr-method-airene">{{ t('Airene') }}</span>
          </MpTooltip>
          <span v-else class="vr-method-text" data-devchange="vat-recon-matched-columns">{{ (row as unknown as TableRow).pair.matchedBy === 'manual' ? t('Manual') : t('Auto') }}</span>
          <VatReconciliationRowMarkers :pair="(row as unknown as TableRow).pair" :changed-from="statusChanges.get((row as unknown as TableRow).id)" />
        </span>
      </template>

      <template #actions="{ row }">
        <MpPopover :id="`vr-row-actions-${(row as unknown as TableRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openDetail((row as unknown as TableRow).pair)">{{ t('View details') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="canRemark((row as unknown as TableRow).pair)" @click="openRemarks((row as unknown as TableRow).pair)">{{ t('Remarks') }}</MpPopoverListItem>
              <MpPopoverListItem
                v-if="canWaitOnBuyer((row as unknown as TableRow).pair)"
                @click="setWaitingOnBuyer((row as unknown as TableRow).pair, !isWaitingOnBuyer((row as unknown as TableRow).pair))"
              >{{ isWaitingOnBuyer((row as unknown as TableRow).pair) ? t('Stop waiting on buyer') : t('Waiting on buyer') }}</MpPopoverListItem>
              <!-- A finalized masa is a record: Unmatch is not offered (the banner says why). -->
              <MpPopoverListItem
                v-if="activeTab === 'Matched' && !finalized"
                @click="unmatchTarget = (row as unknown as TableRow).pair"
              >{{ t('Unmatch') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="vr-empty-illustration" width="288" height="240" >
          <p class="vr-empty-title">{{ activeTab === 'Matched' ? t('Nothing matched yet') : t('Nothing to fix') }}</p>
          <p class="vr-empty-body">{{ activeTab === 'Matched' ? t('Pairs appear here once they are reconciled.') : t('No pair in this period has a root cause to fix.') }}</p>
        </div>
      </template>
    </ErpTablePage>

    <!-- US-020 AC-03/04: "Showing" follows the tab/filter/search; the four
         counts are period-level, and waiting-on-buyer rows are not need review. -->
    <p v-if="tabHasRows" class="vr-footer" data-devchange="vat-recon-prd-align-footer" data-test-id="vr-footer">
      {{ t('Showing') }} {{ filtered.length }} {{ t('of') }} {{ pairs.length }} {{ t('pairs') }}
      · {{ periodFooter.matched }} {{ t('matched') }}
      · {{ periodFooter.review }} {{ t('need review') }}
      · {{ periodFooter.unmatched }} {{ t('unmatched') }}
      · {{ periodFooter.waiting }} {{ t('waiting on buyer') }}
    </p>

    <ReconciliationDetailDrawer
      v-model:is-open="drawerOpen"
      :pair="drawerPair"
      :side="side"
      :finalized="finalized"
      :period-id="periodId"
      @action="infoToast"
    />
    <VatReconciliationMatchConfirmModal
      :is-open="!!pendingMatch"
      :row-ref="(pendingMatch?.pair.erp ?? pendingMatch?.pair.djp)?.ref ?? ''"
      :row-total="pendingMatch?.anchor ?? 0"
      :candidate-ref="pendingMatch?.candidate.ref ?? ''"
      :candidate-total="pendingMatch?.candidate.total ?? 0"
      @close="pendingMatch = null"
      @confirm="onMatchModalConfirm"
    />
    <VatReconciliationRemarkModal
      :is-open="!!remarkTarget"
      :pair="remarkTarget"
      :row-ref="(remarkTarget?.erp ?? remarkTarget?.djp)?.ref ?? ''"
      :side="side"
      @close="remarkTarget = null"
      @saved="onRemarkSaved"
    />
    <ConfirmModal
      v-model:is-open="setupChangeOpen"
      :title="t('Account setup changed')"
      :description="setupChangeDescription"
      :confirm-label="t('Reconcile again')"
      :cancel-label="t('Cancel')"
      :is-danger="false"
      data-devchange="vat-recon-prd-align-rerun"
      @confirm="startRerun"
    />
    <ConfirmModal
      :is-open="!!unmatchTarget"
      :title="t('Unmatch this pair?')"
      :description="t('Both documents go back to their own open status, and the pair returns to To match.')"
      :confirm-label="t('Unmatch')"
      :cancel-label="t('Cancel')"
      :is-danger="false"
      @update:is-open="(v: boolean) => { if (!v) unmatchTarget = null }"
      @confirm="doUnmatch"
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
      :description="t('This records what was reconciled and who signed it off. It does not lock Jurnal — transactions in this period stay editable, and any change will be flagged here.')"
      :confirm-label="t('Finalize')"
      :cancel-label="t('Cancel')"
      :is-danger="false"
      @confirm="doFinalize"
    />
    <ConfirmModal
      v-model:is-open="notReadyOpen"
      :title="`${periodName} ${t('is not ready to finalize')}`"
      :description="`${openPairCount} ${t('pairs still need review. Reconcile every pair in this period, then finalize it.')}`"
      :confirm-label="t('Show pairs to review')"
      :cancel-label="t('Close')"
      :is-danger="false"
      @confirm="showPairsToReview"
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
    <ExportModal
      :open="exportOpen"
      :title="`${t('Export')} ${periodName}`"
      :entity-label="t('pairs')"
      :columns="exportColumns"
      :total="filtered.length"
      @close="exportOpen = false"
      @export="exportOpen = false"
    />
  </div>
</template>

<style scoped>
.vr-page {
  --vr-search-w: 248px;
  --vr-search-h: 36px;
  --vr-chevron-col: 48px;
  --vr-chevron-col-drafts: 104px;
  --vr-dash-col: 48px;
  --vr-confirm-col: 64px;
  --vr-confirm-sz: 36px;
  --vr-line-h: 72px;
  --vr-illus-w: 288px;
  --vr-illus-h: 240px;
  --vr-dup-total-w: 120px;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}

/* ── Period header: Last sync · Accounts used ── */
.vr-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.vr-meta-label { color: var(--mp-text-secondary); }
.vr-meta-sep { color: var(--mp-text-subtle); }

/* ── Sign-off banner ── */
.vr-finalized-error { display: block; margin-top: var(--mp-spacing-1); color: var(--mp-colors-red-800); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Summary: the bank Reconciliations header — divider columns, no cards ── */
.vr-summary {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-auto-rows: auto;
  padding: var(--mp-spacing-4) 0;
}
.vr-tab-label { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.vr-sum {
  /* Subgrid rows (label · sub · value · delta) keep the values on one line even
     though only Tax difference carries a subtitle now. */
  display: grid; grid-row: span 4; grid-template-rows: subgrid; row-gap: var(--mp-spacing-1);
  align-content: start;
  padding: 0 var(--mp-spacing-6); min-width: 0;
}
.vr-sum-label { grid-row: 1; }
.vr-sum-sub { grid-row: 2; }
.vr-sum-value { grid-row: 3; }
.vr-sum-delta { grid-row: 4; }
.vr-sum:first-child { padding-left: 0; }
.vr-sum + .vr-sum { border-left: 1px solid var(--mp-border-default); }
.vr-sum-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.vr-sum-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vr-sum-delta { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); font-variant-numeric: tabular-nums; }
.vr-sum-value {
  margin-top: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums; white-space: nowrap;
}
.vr-sum-value.is-gap { color: var(--mp-colors-red-800); }
.vr-sum-value.is-clear { color: var(--mp-colors-emerald-800); }
@media (max-width: 1279px) {
  .vr-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: var(--mp-spacing-4); }
  .vr-sum:nth-child(4) { padding-left: 0; border-left: 0; }
}

/* ── Filter bar ── */
.vr-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: var(--vr-search-w); height: var(--vr-search-h);
  padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full);
  color: var(--mp-text-subtle);
}
.vr-search-icon { color: var(--mp-text-subtle); flex-shrink: 0; }
.filter-search-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }

/* ── To match: date groups + card rows (bank Reconciliations "To match") ── */
.vr-rows { display: flex; flex-direction: column; }
.vr-group + .vr-group { margin-top: var(--mp-spacing-2); }
.vr-group-head {
  all: unset; cursor: pointer;
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.vr-item {
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.vr-item + .vr-item { margin-top: var(--mp-spacing-4); }
.vr-item.is-open { background: var(--mp-background-neutral); }
.vr-rows.has-drafts { --vr-chevron-col: var(--vr-chevron-col-drafts); }
.vr-line {
  display: grid;
  grid-template-columns: var(--vr-chevron-col) minmax(0, 1fr) var(--vr-dash-col) minmax(0, 1fr) var(--vr-confirm-col);
  align-items: center; min-height: var(--vr-line-h); cursor: pointer;
}
.vr-chevron { justify-self: center; }
.vr-lead { display: flex; align-items: center; justify-content: center; gap: var(--mp-spacing-1); }
.vr-rows.has-drafts .vr-lead { justify-content: flex-start; padding-left: var(--mp-spacing-3); }
.vr-draft-check-spacer { width: 28px; flex-shrink: 0; }
.vr-erp, .vr-djp { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); padding: var(--mp-spacing-3) var(--mp-spacing-2); min-width: 0; }
.vr-erp { align-items: flex-end; text-align: right; }
.vr-djp { align-items: flex-start; text-align: left; flex: 1; }
.vr-djp-cell { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.vr-caption {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vr-amount {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums; white-space: nowrap;
}
/* The status reads as coloured text beside the amount, like "Match found" */
.vr-state { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); }
.vr-state.is-found { color: var(--mp-colors-emerald-800); }
.vr-missing { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
/* The dashed connector between the two sides */
.vr-dash { justify-self: center; width: 28px; border-top: 2px dashed var(--mp-border-bold); }
/* Round ✓ — solid ring = a match to confirm; dashed ring = no match yet */
.vr-confirm-cell { display: flex; justify-content: center; }
.vr-confirm {
  all: unset; cursor: pointer;
  width: var(--vr-confirm-sz); height: var(--vr-confirm-sz);
  border-radius: var(--mp-radii-full);
  border: 1.5px solid var(--mp-text-secondary);
  display: flex; align-items: center; justify-content: center;
}
.vr-confirm.is-dashed { border-style: dashed; border-color: var(--mp-border-bold); }
.vr-confirm:hover { background: var(--mp-background-neutral-hovered); }
.vr-confirm:focus-visible { outline: 2px solid var(--mp-colors-neutral-400); outline-offset: 2px; }
.vr-draft-check { display: flex; align-items: center; flex-shrink: 0; cursor: pointer; }

/* Expand — two titled columns, each with a ⋮ menu */
.vr-detail {
  display: grid; grid-template-columns: 1fr 1fr;
  border-top: 1px solid var(--mp-border-default);
}
.vr-detail-col { padding: var(--mp-spacing-4) var(--mp-spacing-6); min-width: 0; }
.vr-detail-col + .vr-detail-col { border-left: 1px solid var(--mp-border-default); }
.vr-detail-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }
.vr-detail-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.vr-detail-title--sub { display: block; margin-top: var(--mp-spacing-4); }
.vr-detail-sub { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.vr-no-match-reason { display: flex; flex-direction: column; gap: var(--mp-spacing-1); margin-bottom: var(--mp-spacing-4); }
.vr-no-match-reason__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.vr-no-match-reason__text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.vr-find-lead { margin-top: var(--mp-spacing-4); }
.vr-detail-actions { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.vr-detail-actions-block { margin-top: var(--mp-spacing-3); }
.vr-kv { display: flex; flex-direction: column; }
.vr-kv :deep(.is-diff) { color: var(--mp-colors-orange-800); font-weight: var(--mp-font-weights-semi-bold); }
.vr-why { margin: var(--mp-spacing-2) 0 0; }
.vr-pick-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); }
.vr-reason { grid-column: 1 / -1; margin: var(--mp-spacing-4) var(--mp-spacing-6); }
.vr-tag { display: inline-flex; }
/* Row state on the caption line: same size and colour as the document number. */
.vr-state-text { font: inherit; color: inherit; }
/* Duplicate reference picker — full width under the two columns */
.vr-dup { grid-column: 1 / -1; display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); border-top: 1px solid var(--mp-border-default); }
.vr-dup-row { display: flex; align-items: center; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; }
.vr-dup-row + .vr-dup-row { border-top: 1px solid var(--mp-border-default); }
.vr-dup-id { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.vr-dup-ref { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.vr-dup-total { min-width: var(--vr-dup-total-w); text-align: right; }
/* ── Footer counts ── */
.vr-footer { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }

/* ── Drafts bar (ErpTablePage bulk-bar anatomy) ── */
.vr-bulk {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); margin-bottom: var(--mp-spacing-2);
  border: 1px dashed var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.vr-bulk.is-active { border-style: solid; border-color: var(--mp-colors-neutral-400); background: var(--mp-background-neutral-subtle); }
.vr-bulk-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.vr-bulk-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); white-space: nowrap; }
.vr-bulk-error { flex-basis: 100%; margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-800); }

/* ── Tables ── */
/* Badge + "Waiting on buyer" tag stack in the status column (128–160px). */
.vr-method-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.vr-status { display: inline-flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-1); }
.vr-status > * { white-space: nowrap; }
.vr-cell-stack { display: inline-flex; flex-direction: column; align-items: flex-end; }
.vr-cell-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cell-link.vr-cell-sub { color: var(--mp-colors-text-link) !important; }

/* ── Empty states (rule/empty-state-structure) ── */
/* Same inset as ErpTablePage's empty cell, so every tab's blank slate sits at one height. */
.vr-empty { padding: var(--mp-spacing-6) var(--mp-spacing-4); text-align: center; }
.empty-full { display: flex; flex-direction: column; align-items: center; }
.vr-empty-illustration { width: var(--vr-illus-w); height: var(--vr-illus-h); object-fit: contain; display: block; margin: 0 auto var(--mp-spacing-2); }
.vr-empty-title { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.vr-empty-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.vr-empty-cta { margin-top: var(--mp-spacing-4); }
.vr-pagination { margin-top: var(--mp-spacing-4); }
</style>
