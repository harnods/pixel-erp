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

import { MpCheckbox } from '@mekari/pixel3'
import ErpPagination from './ErpPagination.vue'

const sendAireneMessage = inject<(text: string, context?: string) => void>('sendAireneMessage')

export interface TableColumn {
  key: string
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
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
  /** Returns a context label string for a given row — shown as a chip in the AI chat input */
  contextLabel?: (row: Record<string, unknown>) => string
}>(), {
  perPage: 25,
  sortKey: '',
  sortDir: 'asc',
  hasCheckbox: false,
  hasAiChat: false,
  contextLabel: undefined,
})

const emit = defineEmits<{
  pageChange: [page: number]
  perPageChange: [perPage: number]
  sort: [key: string]
}>()

// ─── Row selection ────────────────────────────────────────────────────────────

const selectedRows = ref(new Set<number>())

const allSelected = computed(() =>
  props.rows.length > 0 && props.rows.every((_, i) => selectedRows.value.has(i))
)

function toggleAll() {
  selectedRows.value = allSelected.value
    ? new Set()
    : new Set(props.rows.map((_, i) => i))
}

function toggleRow(i: number) {
  const s = new Set(selectedRows.value)
  s.has(i) ? s.delete(i) : s.add(i)
  selectedRows.value = s
}

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
  if (e.key === 'Escape') closePopover()
}

onMounted(() => {
  document.addEventListener('click', closePopover)
  document.addEventListener('keydown', onEscKey)
})
onUnmounted(() => {
  document.removeEventListener('click', closePopover)
  document.removeEventListener('keydown', onEscKey)
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
    <div class="erp-table-wrapper" :class="{ 'has-ai': hasAiChat }">
      <table class="erp-table">

        <!-- ── Header ── -->
        <thead class="erp-thead">
          <tr>
            <!-- Checkbox th -->
            <th v-if="hasCheckbox" class="erp-th erp-th--checkbox">
              <MpCheckbox
                id="erp-select-all"
                :model-value="allSelected"
                @change="toggleAll"
              />
            </th>

            <!-- Column headers -->
            <th
              v-for="col in columns"
              :key="col.key"
              class="erp-th"
              :class="{
                'erp-th--sortable': col.sortable,
                'erp-th--right':    col.align === 'right',
                'erp-th--center':   col.align === 'center',
                'erp-th--fixed':    col.isFixed,
              }"
              :style="col.width ? { width: col.width, minWidth: col.width } : {}"
              @click="col.sortable ? emit('sort', col.key) : undefined"
            >
              <span v-if="!col.noHeader" class="th-label">
                {{ col.label }}
              </span>
            </th>

            <!-- Actions th — sticky right, no label -->
            <th
              v-if="$slots.actions"
              class="erp-th erp-th--actions erp-th--fixed"
            />

            <!-- AI chat th — outermost sticky right, 28px, no label -->
            <th
              v-if="hasAiChat"
              class="erp-th erp-th--ai"
            />
          </tr>
        </thead>

        <!-- ── Body ── -->
        <tbody>

          <!-- Data rows -->
          <template v-if="rows.length > 0">
            <tr
              v-for="(row, ri) in rows"
              :key="ri"
              class="erp-tr"
              @mouseenter="hasAiChat ? onRowEnter(ri) : undefined"
              @mouseleave="hasAiChat ? onRowLeave(ri) : undefined"
            >
              <!-- Checkbox td -->
              <td v-if="hasCheckbox" class="erp-td erp-td--checkbox">
                <MpCheckbox
                  :id="`erp-row-${ri}`"
                  :model-value="selectedRows.has(ri)"
                  @change="() => toggleRow(ri)"
                />
              </td>

              <!-- Data cells -->
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
                <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
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
                    <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="#651FFF"/>
                    <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="#651FFF"/>
                  </svg>
                </button>
              </td>
            </tr>
          </template>

          <!-- Empty state -->
          <tr v-else>
            <td
              class="erp-td erp-td--empty"
              :colspan="columns.length + (hasCheckbox ? 1 : 0) + ($slots.actions ? 1 : 0) + (hasAiChat ? 1 : 0)"
            >
              <slot name="empty">
                <div class="empty-default">
                  <p class="empty-title">No data found</p>
                  <p class="empty-hint">Try adjusting your filters.</p>
                </div>
              </slot>
            </td>
          </tr>

        </tbody>
      </table>
    </div>

    <!-- ── Pagination ── -->
    <ErpPagination
      v-if="total > 0"
      :current-page="currentPage"
      :per-page="perPage"
      :total="total"
      @page-change="emit('pageChange', $event)"
      @per-page-change="emit('perPageChange', $event)"
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
            <path d="M8 12.5V3.5M8 3.5L4 7.5M8 3.5L12 7.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
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
  margin-bottom: 40px;
  flex-shrink: 0;
}

/* Filter bar */
.erp-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  margin-bottom: 20px;
  flex-shrink: 0;
  gap: var(--mp-spacing-3);
}

/* Table scroll container */
.erp-table-wrapper {
  overflow-x: auto;
}

/* ─── Table base ──────────────────────────────────────────────────────────── */

.erp-table {
  width: 100%;
  min-width: max-content;     /* force overflow so sticky works */
  border-collapse: collapse;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

/* ─── Header ──────────────────────────────────────────────────────────────── */

/*
 * Figma spec:
 *   background : var(--color/background/surface, #f1f5f9)
 *   height     : 28px
 *   padding    : 4px 16px 4px 8px  (left-col) | 4px 8px 4px 16px (right-col)
 *   font       : 12px, semiBold (600), uppercase
 *   border-bot : 1px solid var(--color/border/default, #dcdfe4)
 *   position   : sticky top:0
 */

.erp-thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.erp-th {
  height: var(--mp-sizes-7);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  font-style: normal;
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default, #272b32);
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

/* Checkbox column */
.erp-th--checkbox {
  width: var(--mp-sizes-9);
  min-width: var(--mp-sizes-9);
  text-align: center;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
}

/* Sortable header */
.erp-th--sortable {
  cursor: pointer;
}
.erp-th--sortable:hover {
  background: var(--mp-background-neutral-subtle, #e8eaed);
}

/* Sticky right column — shift by 28px when AI column is present */
.erp-th--fixed {
  position: sticky;
  right: 0;
  z-index: 3;
  box-shadow: inset 2px 0 var(--mp-border-default);
}
.has-ai .erp-th--fixed {
  right: var(--mp-sizes-7);
}

/* Actions header (no label) */
.erp-th--actions {
  width: var(--mp-sizes-11);
  min-width: var(--mp-sizes-11);
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

.sort-arrows {
  display: inline-flex;
  flex-direction: column;
  font-size: 8px;
  line-height: 1;
  gap: 1px;
  color: var(--mp-text-disabled, #c0c6d0);
  margin-top: 1px;
}
.sort-active {
  color: var(--mp-text-selected);
}

/* ─── Body rows ───────────────────────────────────────────────────────────── */

/*
 * Figma spec:
 *   min-height : 40px
 *   padding    : 6px 16px 6px 8px  (left-col) | 6px 8px 6px 16px (right-col)
 *   font       : 14px, regular (400)
 *   border-bot : 1px solid var(--color/border/default, #dcdfe4)
 */

.erp-tr {
  background: var(--mp-background-neutral, #ffffff);
}
.erp-tr:not(:last-child) {
  border-bottom: 1px solid var(--mp-border-default);
}
.erp-tr:hover .erp-td {
  background: var(--mp-background-neutral-hovered);
}

/* ─── Body cells ──────────────────────────────────────────────────────────── */

.erp-td {
  height: var(--mp-sizes-10);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default, #272b32);
  vertical-align: middle;
  white-space: nowrap;
  background: inherit;
}

/* Right-aligned cells — flip padding */
.erp-td--right {
  text-align: right;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4);
  font-variant-numeric: tabular-nums;
}

.erp-td--center {
  text-align: center;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2);
}

/* Checkbox cell */
.erp-td--checkbox {
  width: var(--mp-sizes-9);
  min-width: var(--mp-sizes-9);
  text-align: center;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2);
}

/* Sticky right cell — shift by 28px when AI column is present */
.erp-td--fixed {
  position: sticky;
  right: 0;
  z-index: 1;
  box-shadow: inset 2px 0 var(--mp-border-default);
}
.has-ai .erp-td--fixed {
  right: var(--mp-sizes-7);
}

/* Actions cell — Figma: px-8 py-6 justify-end */
.erp-td--actions {
  width: var(--mp-sizes-11);
  min-width: var(--mp-sizes-11);
  text-align: right;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2);
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
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm, 4px);
  padding: 0;
  transition: background 0.1s ease;
}

.ai-icon-btn:hover,
.ai-icon-btn--active {
  background: #ede9fe;
}

/* ─── AI Tooltip ──────────────────────────────────────────────────────────── */

.ai-tooltip {
  position: fixed;
  z-index: 9999;
  transform: translate(-50%, calc(-100% - 6px));
  background: var(--mp-background-inverse, #272b32);
  color: #ffffff;
  font-size: var(--mp-font-sizes-xs, 11px);
  font-weight: var(--mp-font-weights-medium, 500);
  line-height: 1;
  padding: 5px 8px;
  border-radius: var(--mp-radii-sm, 4px);
  pointer-events: none;
  white-space: nowrap;
}

/* ─── AI Popover ──────────────────────────────────────────────────────────── */

.ai-popover {
  position: fixed;
  z-index: 9999;
  width: 296px;
  height: 48px;
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2, 8px);
  padding: 0 8px 0 16px;
  background: #ffffff;
  border: 1px solid var(--mp-border-default, #dcdfe4);
  border-radius: 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.ai-popover__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: var(--mp-font-sizes-md, 14px);
  color: var(--mp-text-default, #272b32);
  background: transparent;
}

.ai-popover__input::placeholder {
  color: var(--mp-text-placeholder, #9aa0ab);
}

.ai-popover__send {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: #7C3AED;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s ease;
}

.ai-popover__send:hover {
  background: #6D28D9;
}

/* ─── Empty state ─────────────────────────────────────────────────────────── */

.erp-td--empty {
  text-align: center;
  padding: 64px var(--mp-spacing-4) !important;   /* 64px: no token, intentional large spacing */
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
</style>
