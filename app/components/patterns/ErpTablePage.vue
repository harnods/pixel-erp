<script setup lang="ts">
/**
 * ErpTablePage — standard index page pattern: filter bar + table + pagination.
 *
 * ⚠️  MpTable (Enterprise) does not match the ERP table design in Figma.
 *     This is a CUSTOM implementation using Pixel design tokens.
 *     Request to Pixel team: update MpTable Enterprise to match this spec:
 *       • Header: bg surface (#f1f5f9), 28px height, uppercase 12px semibold, pl-8 pr-16 py-4
 *       • Row: 40px min-height, border-bottom, pl-8 pr-16 py-6, 14px regular
 *       • Sticky right column with inset left box-shadow
 *
 * Props:
 *   columns     – column definitions (see TableColumn)
 *   rows        – current page's data (already paginated)
 *   total       – total record count
 *   currentPage – active page number (1-based)
 *   perPage     – rows per page (default 25)
 *   sortKey     – active sort column key
 *   sortDir     – 'asc' | 'desc'
 *   hasCheckbox – show row-selection checkboxes (default false)
 *   hasAiChat   – show Airene AI chat icon on row hover (default false)
 *
 * Slots:
 *   filters          – filter bar content (search, selects, buttons)
 *   cell-{key}       – custom cell renderer: { row, value }
 *   actions          – per-row action cell: { row }  — enables sticky-right actions column
 *   empty            – empty state content
 *
 * Emits:
 *   pageChange(page)
 *   perPageChange(perPage)
 *   sort(key)
 */

import { MpCheckbox, MpSkeleton, MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ErpPagination from './ErpPagination.vue'

const sendAireneMessage = inject<(text: string, context?: string) => void>('sendAireneMessage')
const slots = useSlots()

export interface TableColumn {
  key: string
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  /** Enables the ERP column-header sort menu (hover icon → popover). The options shown
   *  depend on the type: text = A–Z / Z–A, number = Low→High / High→Low, date =
   *  Oldest / Newest first. Plus "Hide column". */
  sortType?: 'text' | 'number' | 'date'
  isFixed?: boolean  // sticky right (for a data column; actions are always sticky)
  noHeader?: boolean // render empty <th> — use for icon-only columns (e.g. attachment)
}

const props = withDefaults(defineProps<{
  columns: TableColumn[]
  rows: Record<string, unknown>[]
  total: number
  currentPage: number
  perPage?: number
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  hasCheckbox?: boolean
  hasAiChat?: boolean
  /** Show skeleton placeholder rows instead of data (e.g. first load) */
  loading?: boolean
  /** True when a search/filter is active — switches the empty state to the inline
   *  "No results found" variant (vs the full illustrated empty state). */
  hasActiveFilter?: boolean
  /** Returns a context label string for a given row — shown as a chip in the AI chat input */
  contextLabel?: (row: Record<string, unknown>) => string
  /** Return true for rows that cannot be selected (checkbox disabled) */
  rowDisabled?: (row: Record<string, unknown>, index: number) => boolean
  /** Singular noun shown in the bulk bar count, e.g. "warehouse" → "2 warehouses selected" */
  bulkLabel?: string
  /** Override the sticky actions column width (default 44px) — use when the #actions
   *  slot renders more than a single kebab button (several buttons in a row). */
  actionsWidth?: string
}>(), {
  perPage: 25,
  sortKey: '',
  sortDir: 'asc',
  hasCheckbox: false,
  hasAiChat: false,
  loading: false,
  hasActiveFilter: false,
  contextLabel: undefined,
  rowDisabled: undefined,
  bulkLabel: 'item',
  actionsWidth: undefined,
})

const emit = defineEmits<{
  pageChange: [page: number]
  perPageChange: [perPage: number]
  sort: [key: string]
  sortChange: [key: string, dir: 'asc' | 'desc']
  hideColumn: [key: string]
  clearFilters: []
  selectionChange: [count: number]
}>()

// ERP column sort: picking the already-active direction clears the sort (back to
// default order); otherwise apply the chosen direction. Empty key = unsorted.
function onSortOpt(key: string, dir: 'asc' | 'desc') {
  if (props.sortKey === key && props.sortDir === dir) emit('sortChange', '', 'asc')
  else emit('sortChange', key, dir)
}

// ─── Pagination skeleton ────────────────────────────────────────────────────
// Briefly show the skeleton when the user changes page or rows-per-page, so every
// module gets a "loading next page" state without extra page code.
const paginating = ref(false)
let paginatingTimer: ReturnType<typeof setTimeout> | null = null

/** true on first load (prop) OR while a pagination change is settling */
const showSkeleton = computed(() => props.loading || paginating.value)

/** Full (illustrated) empty state — no data ever AND no active filter. In this
 *  state the table header is hidden so the empty state replaces the whole table.
 *  (The inline "no results" filtered state keeps the header.) */
const isFullEmpty = computed(
  () => !showSkeleton.value && displayRows.value.length === 0 && !props.hasActiveFilter,
)

/** Rows currently rendered — frozen during a pagination change so the OLD rows stay
 *  visible while the 3 skeleton rows for the incoming page show below them. */
const displayRows = ref<Record<string, unknown>[]>([])
watch(() => props.rows, (val) => { if (!paginating.value) displayRows.value = val }, { immediate: true })

function triggerPaginating() {
  paginating.value = true
  if (paginatingTimer) clearTimeout(paginatingTimer)
  paginatingTimer = setTimeout(() => {
    displayRows.value = props.rows   // swap in the new page
    paginating.value = false
  }, 500)
}
function onPageChange(page: number) {
  emit('pageChange', page)
  triggerPaginating()
}
function onPerPageChange(per: number) {
  emit('perPageChange', per)
  triggerPaginating()
}
onUnmounted(() => { if (paginatingTimer) clearTimeout(paginatingTimer) })

// ─── Row selection ────────────────────────────────────────────────────────────

const selectedRows = ref(new Set<number>())

const selectableIndices = computed(() =>
  props.rows.map((r, i) => i).filter(i => !(props.rowDisabled?.(props.rows[i], i) ?? false))
)

const allSelected = computed(() =>
  selectableIndices.value.length > 0 &&
  selectableIndices.value.every(i => selectedRows.value.has(i))
)

const someSelected = computed(() =>
  selectedRows.value.size > 0 && !allSelected.value
)

function toggleAll() {
  selectedRows.value = allSelected.value
    ? new Set()
    : new Set(selectableIndices.value)
}

function toggleRow(i: number) {
  if (props.rowDisabled?.(props.rows[i], i)) return
  const s = new Set(selectedRows.value)
  s.has(i) ? s.delete(i) : s.add(i)
  selectedRows.value = s
}

function deselectAll() {
  selectedRows.value = new Set()
}

watch(selectedRows, (s) => emit('selectionChange', s.size))

// Reset selection when rows change (page change, filter, sort)
watch(() => props.rows, () => {
  selectedRows.value = new Set()
  hoveredRowIndex.value = null
  activeAiRow.value = null
})

// ─── AI Chat ──────────────────────────────────────────────────────────────────

const hoveredRowIndex = ref<number | null>(null)
const tooltipVisible = ref(false)
const tooltipPos = ref({ x: 0, y: 0 })
const activeAiRow = ref<number | null>(null)
const popoverPos = ref({ x: 0, y: 0 })
const aiInput = ref('')

function onRowEnter(ri: number) {
  hoveredRowIndex.value = ri
}

function onRowLeave(ri: number) {
  if (hoveredRowIndex.value === ri && activeAiRow.value !== ri) {
    hoveredRowIndex.value = null
  }
}

function onIconEnter(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  tooltipPos.value = { x: rect.left + rect.width / 2, y: rect.top }
  tooltipVisible.value = true
}

function onIconLeave() {
  tooltipVisible.value = false
}

function onIconClick(e: MouseEvent, ri: number) {
  e.stopPropagation()
  tooltipVisible.value = false
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  if (activeAiRow.value === ri) {
    activeAiRow.value = null
    hoveredRowIndex.value = null
    aiInput.value = ''
    return
  }
  popoverPos.value = {
    x: Math.max(8, rect.right - 296),
    y: rect.bottom + 4,
  }
  activeAiRow.value = ri
}

function closePopover() {
  activeAiRow.value = null
  hoveredRowIndex.value = null
  aiInput.value = ''
}

function sendAndClose() {
  const text = aiInput.value.trim()
  if (text) {
    const context = (activeAiRow.value !== null && props.contextLabel)
      ? props.contextLabel(props.rows[activeAiRow.value])
      : undefined
    sendAireneMessage?.(text, context)
  }
  closePopover()
}

function onEscKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (selectedRows.value.size > 0) {
    deselectAll()
  } else {
    closePopover()
  }
}

onMounted(() => {
  document.addEventListener('click', closePopover)
  document.addEventListener('keydown', onEscKey)
})
onUnmounted(() => {
  document.removeEventListener('click', closePopover)
  document.removeEventListener('keydown', onEscKey)
})

// ─── Horizontal overflow detection ──────────────────────────────────────────────
// The sticky-right column border only shows when the table is actually wider than
// the stage (horizontal scroll). No overflow → no sticky border.

const tableWrapperEl = ref<HTMLElement | null>(null)
const tableEl = ref<HTMLElement | null>(null)
const isOverflowing = ref(false)
/** Indices of rows tall enough (a cell wrapped) to top-align all their cells */
const tallRows = ref<Set<number>>(new Set())
let resizeObserver: ResizeObserver | null = null

function checkOverflow() {
  const w = tableWrapperEl.value
  if (!w) return
  isOverflowing.value = w.scrollWidth > w.clientWidth + 1
}

// A row is "tall" when its height exceeds the single-line baseline (40px) by more
// than a small buffer. Using an absolute threshold (not relative to the shortest row)
// so that tables where ALL rows have multi-line content are still detected correctly.
const SINGLE_LINE_ROW_HEIGHT = 44 // 40px min-height + 4px render buffer
function updateRowAlignment() {
  const trs = tableEl.value?.querySelectorAll<HTMLElement>('tbody tr.erp-tr:not(.erp-tr--skeleton)')
  if (!trs || trs.length === 0) { tallRows.value = new Set(); return }
  const next = new Set<number>()
  trs.forEach((t, i) => { if (t.getBoundingClientRect().height > SINGLE_LINE_ROW_HEIGHT) next.add(i) })
  tallRows.value = next
}

function refresh() {
  checkOverflow()
  updateRowAlignment()
}

onMounted(() => {
  nextTick(refresh)
  resizeObserver = new ResizeObserver(() => refresh())
  if (tableWrapperEl.value) resizeObserver.observe(tableWrapperEl.value)
  if (tableEl.value) resizeObserver.observe(tableEl.value)
  window.addEventListener('resize', refresh)
})
onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', refresh)
})

// Recheck when content that affects table width/row height changes
watch(() => [props.columns, props.rows, props.loading, props.hasCheckbox, props.hasAiChat], () => {
  nextTick(refresh)
})

// ─── Bulk bar ─────────────────────────────────────────────────────────────────

const totalCols = computed(() =>
  props.columns.length +
  (slots.actions ? 1 : 0) +
  (props.hasAiChat ? 1 : 0)
)

const bulkCountLabel = computed(() => {
  const n = selectedRows.value.size
  const noun = props.bulkLabel ?? 'item'
  return `${n} ${n === 1 ? noun : noun + 's'} selected`
})
</script>

<template>
  <div class="erp-table-page">

    <!-- ── Stats bar ── -->
    <div v-if="$slots.stats" class="erp-stats-bar">
      <slot name="stats" />
    </div>

    <!-- ── Filter bar ── -->
    <div v-if="$slots.filters" class="erp-filter-bar">
      <slot name="filters" />
    </div>

    <!-- ── Table wrapper — handles horizontal overflow ── -->
    <div
      ref="tableWrapperEl"
      class="erp-table-wrapper"
      :class="{ 'has-ai': hasAiChat, 'is-overflowing': isOverflowing }"
      :style="actionsWidth ? { '--erp-actions-width': actionsWidth } : undefined"
    >
      <table ref="tableEl" class="erp-table" :class="{ 'erp-table--empty': isFullEmpty }">

        <!-- ── Colgroup — pins column widths even when header row swaps to bulk bar.
             Skipped on the full empty state so the table fits the container (no scroll). -->
        <colgroup v-if="!isFullEmpty">
          <col
            v-for="col in columns"
            :key="col.key"
            :style="col.width ? { width: col.width, minWidth: col.width } : {}"
          />
          <col v-if="$slots.actions" :style="{ width: actionsWidth ?? '44px', minWidth: actionsWidth ?? '44px' }" />
          <col v-if="hasAiChat" style="width: 28px; min-width: 28px" />
        </colgroup>

        <!-- ── Header ── (hidden on the full illustrated empty state) -->
        <thead v-if="!isFullEmpty" class="erp-thead">

          <!-- Bulk selection bar — replaces column headers when rows are selected -->
          <tr v-if="$slots['bulk-actions'] && selectedRows.size > 0" class="erp-tr-bulk">
            <th :colspan="totalCols" class="erp-th erp-th--bulk">
              <div class="erp-bulk-bar">
                <div class="erp-bulk-bar__left">
                  <MpCheckbox
                    id="erp-bulk-select-all"
                    :is-checked="allSelected"
                    :is-indeterminate="someSelected"
                    @change="toggleAll"
                    @click.stop
                  />
                  <span class="erp-bulk-bar__count">{{ bulkCountLabel }}</span>
                  <div class="erp-bulk-bar__actions">
                    <slot
                      name="bulk-actions"
                      :count="selectedRows.size"
                      :selected-rows="selectedRows"
                      :deselect-all="deselectAll"
                    />
                  </div>
                </div>
                <div class="erp-bulk-bar__right">
                  <span>Press</span>
                  <kbd class="erp-bulk-bar__kbd">Esc</kbd>
                  <span>to deselect</span>
                </div>
              </div>
            </th>
          </tr>

          <!-- Normal column headers -->
          <tr v-else>
            <th
              v-for="(col, ci) in columns"
              :key="col.key"
              class="erp-th"
              :class="{
                'erp-th--sortable': col.sortable && !col.sortType,
                'erp-th--menu':     !!col.sortType,
                'erp-th--right':    col.align === 'right',
                'erp-th--center':   col.align === 'center',
                'erp-th--fixed':    col.isFixed,
              }"
              :data-col="col.key"
              :style="col.width ? { width: col.width, minWidth: col.width } : {}"
              @click="(col.sortable && !col.sortType) ? emit('sort', col.key) : undefined"
            >
              <span class="th-inner">
                <MpCheckbox
                  v-if="hasCheckbox && ci === 0"
                  id="erp-select-all"
                  :is-checked="allSelected"
                  :is-indeterminate="someSelected"
                  @change="toggleAll"
                  @click.stop
                />
                <span v-if="!col.noHeader" class="th-label">{{ col.label }}</span>
                <!-- ERP column sort menu: hover reveals the icon; click opens options -->
                <MpPopover
                  v-if="col.sortType"
                  :id="`erp-sort-${col.key}`"
                  is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start"
                >
                  <MpPopoverTrigger>
                    <button
                      class="erp-sort-btn"
                      :class="{ 'erp-sort-btn--active': sortKey === col.key }"
                      aria-label="Sort column" @click.stop
                    >
                      <!-- Literal px, not "sm" — MpIcon's "sm" resolves to ~20px (token
                           spacing.5), which doesn't fit the 28px-fixed header row. -->
                      <MpIcon name="sort-default" size="16px" />
                    </button>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '184px', width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <template v-if="col.sortType === 'number'">
                        <MpPopoverListItem @click="onSortOpt(col.key, 'asc')"><span class="erp-sort-opt"><MpIcon name="arrows-up" size="sm" />Low to high<MpTooltip v-if="sortKey === col.key && sortDir === 'asc'" :id="`erp-sort-reset-${col.key}-a`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
                        <MpPopoverListItem @click="onSortOpt(col.key, 'desc')"><span class="erp-sort-opt"><MpIcon name="arrows-down" size="sm" />High to low<MpTooltip v-if="sortKey === col.key && sortDir === 'desc'" :id="`erp-sort-reset-${col.key}-d`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
                      </template>
                      <template v-else-if="col.sortType === 'date'">
                        <MpPopoverListItem @click="onSortOpt(col.key, 'asc')"><span class="erp-sort-opt"><MpIcon name="arrows-up" size="sm" />Oldest first<MpTooltip v-if="sortKey === col.key && sortDir === 'asc'" :id="`erp-sort-reset-${col.key}-a`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
                        <MpPopoverListItem @click="onSortOpt(col.key, 'desc')"><span class="erp-sort-opt"><MpIcon name="arrows-down" size="sm" />Newest first<MpTooltip v-if="sortKey === col.key && sortDir === 'desc'" :id="`erp-sort-reset-${col.key}-d`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
                      </template>
                      <template v-else>
                        <MpPopoverListItem @click="onSortOpt(col.key, 'asc')"><span class="erp-sort-opt"><MpIcon name="arrows-up" size="sm" />A - Z<MpTooltip v-if="sortKey === col.key && sortDir === 'asc'" :id="`erp-sort-reset-${col.key}-a`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
                        <MpPopoverListItem @click="onSortOpt(col.key, 'desc')"><span class="erp-sort-opt"><MpIcon name="arrows-down" size="sm" />Z - A<MpTooltip v-if="sortKey === col.key && sortDir === 'desc'" :id="`erp-sort-reset-${col.key}-d`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
                      </template>
                      <div class="erp-sort-divider" />
                      <MpPopoverListItem @click="emit('hideColumn', col.key)"><span class="erp-sort-opt"><MpIcon name="hide" size="sm" />Hide column</span></MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </span>
            </th>

            <!-- Actions th — sticky right, no label (hidden only on first-load skeleton) -->
            <th
              v-if="$slots.actions && !loading"
              class="erp-th erp-th--actions erp-th--fixed"
            />

            <!-- AI chat th — outermost sticky right, 28px (hidden only on first-load skeleton) -->
            <th
              v-if="hasAiChat && !loading"
              class="erp-th erp-th--ai"
            />
          </tr>
        </thead>

        <!-- ── Body ── -->
        <tbody>

          <!-- Data rows (hidden on first load; frozen during a pagination change) -->
          <template v-if="!loading">
            <tr
              v-for="(row, ri) in displayRows"
              :key="ri"
              class="erp-tr"
              :class="{ 'erp-tr--align-top': tallRows?.has(ri) }"
              @mouseenter="hasAiChat ? onRowEnter(ri) : undefined"
              @mouseleave="hasAiChat ? onRowLeave(ri) : undefined"
            >
              <!-- Data cells — checkbox merges into the first column's cell -->
              <td
                v-for="(col, ci) in columns"
                :key="col.key"
                class="erp-td"
                :class="{
                  'erp-td--right':  col.align === 'right',
                  'erp-td--center': col.align === 'center',
                  'erp-td--fixed':  col.isFixed,
                }"
                :data-col="col.key"
              >
                <span v-if="hasCheckbox && ci === 0" class="erp-cell-check">
                  <MpCheckbox
                    :id="`erp-row-${ri}`"
                    :is-checked="selectedRows.has(ri)"
                    :is-disabled="rowDisabled?.(row, ri) ?? false"
                    @change="() => toggleRow(ri)"
                    @click.stop
                  />
                  <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
                    <template v-if="typeof row[col.key] !== 'boolean'">{{ row[col.key] }}</template>
                  </slot>
                </span>
                <slot v-else :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
                  <!-- fallback: only render string / number — never render raw booleans -->
                  <template v-if="typeof row[col.key] !== 'boolean'">{{ row[col.key] }}</template>
                </slot>
              </td>

              <!-- Actions td — sticky right -->
              <td
                v-if="$slots.actions"
                class="erp-td erp-td--actions erp-td--fixed"
              >
                <slot name="actions" :row="row" />
              </td>

              <!-- AI chat td — outermost sticky right, 28px -->
              <td
                v-if="hasAiChat"
                class="erp-td erp-td--ai"
              >
                <button
                  v-show="hoveredRowIndex === ri || activeAiRow === ri"
                  class="ai-icon-btn"
                  :class="{ 'ai-icon-btn--active': activeAiRow === ri }"
                  aria-label="Ask Airene"
                  @mouseenter="onIconEnter($event)"
                  @mouseleave="onIconLeave"
                  @click.stop="onIconClick($event, ri)"
                >
                  <!-- Airene logo icon 20×20 -->
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                    <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                  </svg>
                </button>
              </td>
            </tr>
          </template>

          <!-- Skeleton rows — first load (alone) OR pagination change (appended below data) -->
          <template v-if="showSkeleton">
            <tr v-for="n in 3" :key="`sk-${n}`" class="erp-tr erp-tr--skeleton">
              <td
                v-for="col in columns"
                :key="col.key"
                class="erp-td"
                :class="{
                  'erp-td--right':  col.align === 'right',
                  'erp-td--center': col.align === 'center',
                  'erp-td--fixed':  col.isFixed,
                }"
              >
                <MpSkeleton
                  class="erp-skeleton"
                  height="14px"
                  rounded="sm"
                  duration="0s"
                  :width="col.align === 'right' ? '56px' : '72px'"
                />
              </td>
              <!-- match data-row columns during pagination; hidden on first load -->
              <td v-if="$slots.actions && !loading" class="erp-td erp-td--actions erp-td--fixed" />
              <td v-if="hasAiChat && !loading" class="erp-td erp-td--ai" />
            </tr>
          </template>

          <!-- Empty state -->
          <tr v-else-if="displayRows.length === 0">
            <td
              class="erp-td erp-td--empty"
              :colspan="columns.length + ($slots.actions ? 1 : 0) + (hasAiChat ? 1 : 0)"
            >
              <!-- Inline empty — search/filter eliminated all results (same illustration as
                   the full empty state, so both empty states read consistently) -->
              <div v-if="hasActiveFilter" class="empty-inline">
                <img src="/illustrations/empty-folder.png" alt="" class="empty-inline-illustration" width="288" height="240" />
                <p class="empty-inline-title">No results found</p>
                <p class="empty-inline-desc">Try adjusting your search or filters.</p>
                <a class="empty-inline-clear" @click="emit('clearFilters')">Clear all filters</a>
              </div>
              <!-- Full empty — no data ever; module supplies illustration + title + CTA -->
              <slot v-else name="empty">
                <div class="empty-default">
                  <p class="empty-title">No data yet</p>
                  <p class="empty-hint">There's nothing here yet.</p>
                </div>
              </slot>
            </td>
          </tr>

        </tbody>
      </table>
    </div>

    <!-- ── Pagination ── (hidden during first-load skeleton) -->
    <ErpPagination
      v-if="!loading && total > 0"
      :current-page="currentPage"
      :per-page="perPage"
      :total="total"
      @page-change="onPageChange"
      @per-page-change="onPerPageChange"
    />

    <!-- ── AI tooltip (Teleport to body) ── -->
    <Teleport to="body">
      <div
        v-if="hasAiChat && tooltipVisible"
        class="ai-tooltip"
        :style="{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }"
      >
        AI chat
      </div>
    </Teleport>

    <!-- ── AI popover (Teleport to body) ── -->
    <Teleport to="body">
      <div
        v-if="hasAiChat && activeAiRow !== null"
        class="ai-popover"
        :style="{ left: `${popoverPos.x}px`, top: `${popoverPos.y}px` }"
        @click.stop
      >
        <input
          v-model="aiInput"
          class="ai-popover__input"
          placeholder="Ask Airene..."
          @keydown.enter.prevent="sendAndClose"
          @keydown.esc="closePopover"
        />
        <button class="ai-popover__send" aria-label="Send" @click="sendAndClose">
          <!-- Arrow up send icon -->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M8 12.5V3.5M8 3.5L4 7.5M8 3.5L12 7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
/* ─── Layout ──────────────────────────────────────────────────────────────── */

.erp-table-page {
  display: flex;
  flex-direction: column;
}

/* Stats bar */
.erp-stats-bar {
  padding: 0;
  margin-bottom: var(--mp-spacing-10);
  flex-shrink: 0;
}

/* Filter bar */
.erp-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  margin-bottom: var(--mp-spacing-5);
  flex-shrink: 0;
  gap: var(--mp-spacing-3);
}

/* Table scroll container — persistent horizontal scrollbar when the table
   overflows, so users without a trackpad can always drag to scroll left/right
   (macOS overlay scrollbars auto-hide; styling forces a classic, always-visible bar) */
.erp-table-wrapper {
  overflow-x: auto;
  scrollbar-width: thin;                 /* Firefox */
  scrollbar-color: var(--mp-border-bold) var(--mp-background-neutral-subtle);
}
.erp-table-wrapper::-webkit-scrollbar {
  height: 10px;
}
.erp-table-wrapper::-webkit-scrollbar-track {
  background: var(--mp-background-neutral-subtle);
}
.erp-table-wrapper::-webkit-scrollbar-thumb {
  background: var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  border: 2px solid var(--mp-background-neutral-subtle);
}
.erp-table-wrapper::-webkit-scrollbar-thumb:hover {
  background: var(--mp-text-subtle);
}

/* ─── Table base ──────────────────────────────────────────────────────────── */

.erp-table {
  width: 100%;
  min-width: max-content;     /* force overflow so sticky works */
  table-layout: fixed;        /* honour column widths; prevent content from expanding cells */
  border-collapse: collapse;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

/* Full empty state: drop the fixed column widths so the table fits the container
   (no horizontal scroll behind the illustrated empty state). */
.erp-table--empty {
  min-width: 0;
  table-layout: auto;
}

/* ─── Header ──────────────────────────────────────────────────────────────── */

/*
 * Figma spec → Pixel 3 2.4 Enterprise mapping:
 *   background : var(--mp-background-neutral-subtle)
 *   height     : var(--mp-sizes-7)         (28px)
 *   padding    : var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2)
 *   font       : var(--mp-font-sizes-sm) / var(--mp-font-weights-semi-bold), uppercase
 *   border-bot : 1px solid var(--mp-border-default)
 *   position   : sticky top:0
 */

.erp-thead {
  /* intentionally not sticky here — sticky on <th> is cross-browser reliable */
}

.erp-th {
  position: sticky;
  top: 0;
  z-index: 2;
  height: var(--mp-sizes-7);
  /* Table cells otherwise treat `height` as a minimum and let a tall child (e.g. the
     20px sort icon button) grow the row — this pins it at a hard 28px everywhere. */
  overflow: hidden;
  line-height: 1;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  font-style: normal;
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  text-align: left;
  white-space: nowrap;
  user-select: none;
  vertical-align: middle;
}

/* Right-aligned header — flip padding (Figma: pl-16 pr-8) */
.erp-th--right {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}

.erp-th--center {
  text-align: center;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
}

/* Checkbox merged into the first column's cell (body). Fill the cell so a slotted
   cell (e.g. a Number cell with a right-aligned "View details" chip) spans the full
   column width instead of shrink-wrapping to the text — otherwise the chip's right:0
   lands on top of the text. */
.erp-cell-check {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 100%;
  min-width: 0;
}
.erp-cell-check > :last-child { flex: 1 1 auto; min-width: 0; }

/* First-load skeleton — solid (no shimmer gradient, no animation) */
.erp-skeleton {
  display: inline-block;        /* honour the cell's text-align (right/center cols) */
  vertical-align: middle;
  background-image: none !important;
  background-color: var(--mp-border-default) !important;
  animation: none !important;
}

/* Sortable header */
.erp-th--sortable {
  cursor: pointer;
}
.erp-th--sortable:hover {
  background: var(--mp-background-neutral-subtle);
}

/* Sticky right column — shift by 28px when AI column is present */
.erp-th--fixed {
  position: sticky;
  right: 0;
  z-index: 3;
}
.has-ai .erp-th--fixed {
  right: var(--mp-sizes-7);
}

/* Actions header (no label) — width overridable via --erp-actions-width (actionsWidth prop) */
.erp-th--actions {
  width: var(--erp-actions-width, var(--mp-sizes-11));
  min-width: var(--erp-actions-width, var(--mp-sizes-11));
}

/* AI chat header column */
.erp-th--ai {
  position: sticky;
  right: 0;
  z-index: 3;
  width: var(--mp-sizes-7);
  min-width: var(--mp-sizes-7);
  padding: 0;
  background: var(--mp-background-neutral-subtle);
}

/* Sort arrows */
.th-label {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
}

/* ── Column sort menu (ERP behaviour) ── */
/* header content wraps label + sort icon; right-aligned columns push it to the end */
.th-inner { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); max-width: 100%; }
.erp-th--right .th-inner { flex-direction: row-reverse; }
/* icon button revealed on header hover; stays visible while its column is the sort */
.erp-sort-btn {
  display: inline-flex; align-items: center; justify-content: center;
  /* Must fit inside the 28px header row (28 - 2×4px padding - 1px border ≈ 19px). */
  width: 18px; height: 18px; flex-shrink: 0;
  border: none; background: none; cursor: pointer; border-radius: var(--mp-radii-sm);
  color: var(--mp-icon-default, var(--mp-text-secondary));
  visibility: hidden;
}
.erp-th:hover .erp-sort-btn,
.erp-sort-btn--active { visibility: visible; }
.erp-sort-btn:hover { background: var(--mp-background-neutral-hovered); }
.erp-sort-btn--active { color: var(--mp-text-selected, var(--mp-text-default)); }
/* popover option row: icon + label */
.erp-sort-opt { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); text-transform: none; width: 100%; }
.erp-sort-check-tt { margin-left: auto; display: inline-flex; }
.erp-sort-check { color: var(--mp-text-selected); }
.erp-sort-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }

.sort-arrows {
  display: inline-flex;
  flex-direction: column;
  font-size: var(--mp-font-sizes-3xs, 8px);
  line-height: 1;
  gap: 1px;
  color: var(--mp-text-disabled);
  margin-top: 1px;
}
.sort-active {
  color: var(--mp-text-selected);
}

/* ─── Body rows ───────────────────────────────────────────────────────────── */

/*
 * Figma spec → Pixel 3 2.4 Enterprise mapping:
 *   min-height : var(--mp-sizes-10)        (40px)
 *   padding    : var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2)
 *   font       : var(--mp-font-sizes-md) / var(--mp-font-weights-regular)
 *   border-bot : 1px solid var(--mp-border-default)
 */

.erp-tr {
  background: var(--mp-background-neutral);
  border-bottom: 1px solid var(--mp-border-default);
}
.erp-tr:hover .erp-td {
  background: var(--mp-background-neutral-hovered);
}

/* ─── Body cells ──────────────────────────────────────────────────────────── */

.erp-td {
  height: var(--mp-sizes-10);          /* 40px — single-line row height */
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);  /* 10px top/bottom always */
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  vertical-align: middle;              /* single-line rows are centred */
  white-space: nowrap;
  background: inherit;
}

/* Rows with a description, avatar, or multi-line cell switch ALL cells to top-aligned.
   Padding stays 10px — only alignment changes.
   `.erp-tr--align-top` is toggled by JS that measures row height. */
.erp-tr--align-top .erp-td {
  vertical-align: top;
}

/* Right-aligned cells — flip padding */
.erp-td--right {
  text-align: right;
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
  font-variant-numeric: tabular-nums;
}

.erp-td--center {
  text-align: center;
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2);
}

/* Sticky right cell — shift by 28px when AI column is present */
.erp-td--fixed {
  position: sticky;
  right: 0;
  z-index: 1;
}

/* Sticky separator border only when the table actually overflows horizontally */
.erp-table-wrapper.is-overflowing .erp-th--fixed,
.erp-table-wrapper.is-overflowing .erp-td--fixed {
  box-shadow: inset 2px 0 var(--mp-border-default);
}
.has-ai .erp-td--fixed {
  right: var(--mp-sizes-7);
}

/* Actions cell — Figma: px-8 py-6 justify-end. Width overridable via --erp-actions-width. */
.erp-td--actions {
  width: var(--erp-actions-width, var(--mp-sizes-11));
  min-width: var(--erp-actions-width, var(--mp-sizes-11));
  text-align: right;
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2);
}

/* AI chat cell */
.erp-td--ai {
  position: sticky;
  right: 0;
  z-index: 1;
  width: var(--mp-sizes-7);
  min-width: var(--mp-sizes-7);
  padding: 0;
  text-align: center;
  background: inherit;
}

/* ─── AI icon button ──────────────────────────────────────────────────────── */

.ai-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-5, 20px);
  height: var(--mp-sizes-5, 20px);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  padding: 0;
  transition: background 0.1s ease;
}

.ai-icon-btn:hover,
.ai-icon-btn--active {
  background: var(--mp-airene-subtle);
}

/* ─── AI Tooltip ──────────────────────────────────────────────────────────── */

.ai-tooltip {
  position: fixed;
  z-index: 9999;
  transform: translate(-50%, calc(-100% - 6px));
  background: var(--mp-background-inverse);
  color: var(--mp-text-inverse);
  font-size: var(--mp-font-sizes-xs, 11px);
  font-weight: var(--mp-font-weights-medium, 500);
  line-height: 1;
  padding: 5px var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm);
  pointer-events: none;
  white-space: nowrap;
}

/* ─── AI Popover ──────────────────────────────────────────────────────────── */

.ai-popover {
  position: fixed;
  z-index: 9999;
  width: 296px;
  height: var(--mp-sizes-12, 48px);
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-4);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-2xl, 24px);
  box-shadow: var(--mp-shadows-lg);
}

.ai-popover__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  background: transparent;
}

.ai-popover__input::placeholder {
  color: var(--mp-text-placeholder);
}

.ai-popover__send {
  flex-shrink: 0;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border: none;
  border-radius: var(--mp-radii-full, 50%);
  background: var(--mp-airene-hovered);
  color: var(--mp-text-inverse);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s ease;
}

.ai-popover__send:hover {
  background: var(--mp-airene-pressed);
}

/* ─── Empty state ─────────────────────────────────────────────────────────── */

.erp-td--empty {
  text-align: center;
  padding: var(--mp-spacing-6) var(--mp-spacing-4) !important;
  height: auto;
  white-space: normal;
}

.empty-default {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-1);
}

.empty-title {
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  margin: 0;
}

.empty-hint {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
  margin: 0;
}

/* Inline empty (filtered/search → no results) — illustrated the same as the full
   empty state, so both read consistently across every index page. */
.empty-inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
}
.empty-inline-illustration {
  width: 288px;
  height: 240px;
  object-fit: contain;
  margin-bottom: var(--mp-spacing-1);
}
.empty-inline-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-inline-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.empty-inline-clear {
  margin-top: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  cursor: pointer;
}

/* ── Bulk selection bar ──────────────────────────────────────────────────────── */
.erp-tr-bulk .erp-th--bulk {
  padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  text-transform: none;
  letter-spacing: normal;
  font-weight: var(--mp-font-weights-regular);
}

.erp-bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  gap: var(--mp-spacing-3);
}

.erp-bulk-bar__left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  flex-shrink: 0;
}

.erp-bulk-bar__count {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  white-space: nowrap;
}

.erp-bulk-bar__actions {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}

.erp-bulk-bar__right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  flex-shrink: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}

.erp-bulk-bar__kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--mp-spacing-1);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  font-family: inherit;
  color: var(--mp-text-secondary);
}
</style>
