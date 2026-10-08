/**
 * useBatchTraceabilityReportState — the Batch Traceability report's filters, sort,
 * page and folded rows, kept OUTSIDE the page components.
 *
 * Why: the app never keep-alives pages, so opening a batch's detail page unmounts the
 * report and every local ref is lost. PRD story 7 needs the breadcrumb back to land on
 * the report exactly as it was — same mode, filters, selected transactions, sort and
 * page. A module-level singleton survives that round trip (it lives for the browser
 * session, like the rest of the prototype's in-memory state).
 *
 * Switching modes resets both searches (story 6) — that's the only reset besides the
 * report's own Reset filter / Clear all filters.
 */
import { reactive } from 'vue'
import { emptyBatchFilters, type BatchFiltersValue } from '~/components/patterns/BatchTraceabilityFiltersDrawer.vue'
import { emptyTransactionFilters, type TransactionFiltersValue } from '~/components/patterns/BatchTransactionFiltersDrawer.vue'

export interface TableViewState {
  sortKey: string
  sortDir: 'asc' | 'desc'
  page: number
  perPage: number
}

/** By batch is filter-first: the All filters drawer edits `filters`, and nothing shows
 *  until Filter copies it to `applied` (null = not filtered yet). */
export interface BatchSearchState {
  filters: BatchFiltersValue
  applied: BatchFiltersValue | null
  table: TableViewState
}

/** Filter-first, like By batch; rows start folded, so `expanded` lists the transactions
 *  the user opened. */
export interface TransactionSearchState {
  filters: TransactionFiltersValue
  applied: TransactionFiltersValue | null
  expanded: string[]
  table: TableViewState
}

export interface BatchTraceabilityReportState {
  mode: 'batch' | 'transaction'
  batch: BatchSearchState
  transaction: TransactionSearchState
}

function emptyTable(): TableViewState {
  return { sortKey: '', sortDir: 'asc', page: 1, perPage: 25 }
}

function emptyBatchSearch(): BatchSearchState {
  return { filters: emptyBatchFilters(), applied: null, table: emptyTable() }
}

function emptyTransactionSearch(): TransactionSearchState {
  return { filters: emptyTransactionFilters(), applied: null, expanded: [], table: emptyTable() }
}

const state = reactive<BatchTraceabilityReportState>({
  mode: 'batch',
  batch: emptyBatchSearch(),
  transaction: emptyTransactionSearch(),
})

export function useBatchTraceabilityReportState() {
  function resetBatchSearch() { Object.assign(state.batch, emptyBatchSearch()) }
  function resetTransactionSearch() { Object.assign(state.transaction, emptyTransactionSearch()) }
  /** Switch search mode — both searches start clean (PRD story 6). */
  function setMode(mode: BatchTraceabilityReportState['mode']) {
    if (mode === state.mode) return
    state.mode = mode
    resetBatchSearch()
    resetTransactionSearch()
  }
  return { state, setMode, resetBatchSearch, resetTransactionSearch }
}
