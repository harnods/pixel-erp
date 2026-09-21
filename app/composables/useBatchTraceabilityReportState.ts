/**
 * useBatchTraceabilityReportState — the Batch Traceability report's filters, search,
 * sort, page and folded rows, kept OUTSIDE the page components.
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
import type { DateCondition } from '~/data/batchTraceability'

export interface TableViewState {
  search: string
  sortKey: string
  sortDir: 'asc' | 'desc'
  page: number
  perPage: number
}

/** Product / Batch number / Warehouse, as the filter bar holds them (names). */
export interface BatchFilterSelection {
  productNames: string[]
  batchNos: string[]
  warehouseNames: string[]
}

/** By batch is filter-first: the bar edits a draft, and nothing shows until Filter
 *  copies it to `applied` (null = not filtered yet). */
export interface BatchSearchState extends BatchFilterSelection {
  applied: BatchFilterSelection | null
  table: TableViewState
}

/** Transaction type and date, as the filter bar holds them. */
export interface TransactionFilterSelection {
  typeLabels: string[]
  dateCondition: DateCondition | null
}

/** Filter-first, like By batch: the bar edits a draft; Filter copies it to `applied`.
 *  `collapsed` lists the transactions whose batch rows the user folded away. */
export interface TransactionSearchState extends TransactionFilterSelection {
  applied: TransactionFilterSelection | null
  collapsed: string[]
  table: TableViewState
}

export interface BatchTraceabilityReportState {
  mode: 'batch' | 'transaction'
  batch: BatchSearchState
  transaction: TransactionSearchState
}

function emptyTable(): TableViewState {
  return { search: '', sortKey: '', sortDir: 'asc', page: 1, perPage: 25 }
}

function emptyBatchSearch(): BatchSearchState {
  return {
    productNames: [],
    batchNos: [],
    warehouseNames: [],
    applied: null,
    table: emptyTable(),
  }
}

function emptyTransactionSearch(): TransactionSearchState {
  return {
    typeLabels: [],
    dateCondition: null,
    applied: null,
    collapsed: [],
    table: emptyTable(),
  }
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
