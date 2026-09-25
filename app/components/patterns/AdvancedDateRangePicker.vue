<script setup lang="ts">
/**
 * AdvancedDateRangePicker — replicates the Pixel "Advance" date-picker pattern
 * (docs.mekari.design/components/date-picker.html#advance, backed by the
 * AdvancedCalendar component): a sidebar of quick presets (Today / Last 7 days /
 * Last 30 days) plus granularity pickers (Per day / Per week / Per month /
 * Per year / Custom), each showing an appropriate calendar view on the right.
 *
 * Label lives OUTSIDE/above the field (4px gap) and describes the selection in
 * human terms ("Date range: Last 30 days", "Date range: December 2026"); the
 * field itself always shows the resolved dates (dd/mm/yyyy - dd/mm/yyyy).
 *
 * Self-contained trigger + popover (own button, is-manual control) — see the
 * ERP Approval/Comment Icon Pattern memory for why MpTooltip/slot-forwarded
 * triggers break MpPopoverTrigger's cloneVNode injection; same reasoning
 * applies here, so this renders its own button directly.
 */
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpButton, css } from '@mekari/pixel3'

const props = withDefaults(defineProps<{
  id: string
  /** null = unapplied — shows `placeholder` and hides the "Date range: ..."
   *  label instead of resolving to a default range. */
  modelValue: Date[] | null
  isFullWidth?: boolean
  placeholder?: string
  /** Suppresses the internal "Date range: ..." label — for callers (e.g. the
   *  Inbox "All filters" drawer) that already render their own outer field
   *  label and would otherwise show it twice. */
  hideLabel?: boolean
  /** 'past' (default) → Today / Last 7 days / Last 30 days presets, resolving
   *  backwards from today. 'future' → Next 7 / 14 / 30 days, resolving forwards
   *  (today → today+N) — used for forward-looking fields like Due date. */
  direction?: 'past' | 'future'
  /** Report/period mode → the sidebar shows This month / This quarter / Per
   *  month / Per year / Custom instead of the day-based presets. Used by the
   *  Credit Memo report and other period reports. */
  periodMode?: boolean
  /** Names the label prefix after the granularity in play — "Month: December
   *  2026", "Year: 2026" — instead of the fixed "Date range:". Opt-in, so every
   *  existing caller keeps its current label. Used by the Multidimensional
   *  report (Figma 4836-56598). */
  labelPrefixMode?: boolean
  /** Opt-in: replace the sidebar quick presets with an explicit list (e.g. the
   *  Deals close-date filter: Today / This week / This month / Next month). When
   *  set, the only granularity option is Custom date range. Existing callers that
   *  omit this keep their direction/periodMode presets unchanged. */
  presets?: { key: Mode; label: string }[]
}>(), {
  direction: 'past',
  periodMode: false,
  labelPrefixMode: false,
})
const emit = defineEmits<{ 'update:modelValue': [Date[]] }>()

type Mode = 'today' | 'last7' | 'last14' | 'last30' | 'next7' | 'next14' | 'next30' | 'day' | 'week' | 'month' | 'year' | 'custom' | 'thisMonth' | 'thisQuarter' | 'thisYear' | 'thisWeek' | 'nextMonth'

const open = ref(false)
const mode = ref<Mode>(props.direction === 'future' ? 'next30' : 'last30')

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function startOfWeek(d: Date) { return addDays(d, -d.getDay()) }
function endOfWeek(d: Date) { return addDays(startOfWeek(d), 6) }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
function startOfQuarter(d: Date) { return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1) }
function endOfQuarter(d: Date) { return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3, 0) }

function fmtDMY(d: Date) {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December']
function fmtDayLabel(d: Date) { return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}` }

const today = dayStart(new Date())

// Resolved [start, end] for each quick preset — inclusive N-day windows anchored
// to today (last N = today-(N-1)…today; next N = today…today+(N-1)). `today` is a
// single day.
function presetBounds(key: Mode): [Date, Date] {
  switch (key) {
    case 'today':  return [today, today]
    case 'last7':  return [addDays(today, -6), today]
    case 'last14': return [addDays(today, -13), today]
    case 'last30': return [addDays(today, -29), today]
    case 'next7':  return [today, addDays(today, 6)]
    case 'next14': return [today, addDays(today, 13)]
    case 'next30': return [today, addDays(today, 29)]
    case 'thisWeek':    return [startOfWeek(today), endOfWeek(today)]
    case 'thisMonth':   return [startOfMonth(today), endOfMonth(today)]
    case 'nextMonth': { const n = new Date(today.getFullYear(), today.getMonth() + 1, 1); return [startOfMonth(n), endOfMonth(n)] }
    case 'thisQuarter': return [startOfQuarter(today), endOfQuarter(today)]
    case 'thisYear':    return [new Date(today.getFullYear(), 0, 1), new Date(today.getFullYear(), 11, 31)]
    default:       return [today, today]
  }
}
// Range text shown to the RIGHT of each preset. `today` shows one date (no range).
function presetRangeText(key: Mode): string {
  const [s, e] = presetBounds(key)
  return key === 'today' ? fmtDayLabel(s) : `${fmtDayLabel(s)} - ${fmtDayLabel(e)}`
}

// ─── Committed range (what the field/table filter uses) ───────────────────────
// modelValue === null → unapplied. The fallback below only feeds the calendar's
// own internal positioning math; it's never shown as the field's resolved text.
const hasValue = computed(() => props.modelValue !== null)
const range = computed<[Date, Date]>(() => {
  const fallback: [Date, Date] = props.direction === 'future' ? [today, addDays(today, 29)] : [addDays(today, -29), today]
  const [s, e] = props.modelValue ?? fallback
  return [dayStart(s!), dayStart(e!)]
})
function commit(start: Date, end: Date) {
  emit('update:modelValue', [dayStart(start), dayStart(end)])
}

const fieldText = computed(() => {
  if (!hasValue.value) return props.placeholder ?? 'Select date range'
  const [s, e] = range.value
  // A single-day selection (Today / Per day) shows one date, not `x - x`.
  return isSameDay(s, e) ? fmtDMY(s) : `${fmtDMY(s)} - ${fmtDMY(e)}`
})

const labelText = computed(() => {
  switch (mode.value) {
    case 'today': return 'Today'
    case 'last7': return 'Last 7 days'
    case 'last14': return 'Last 14 days'
    case 'last30': return 'Last 30 days'
    case 'next7': return 'Next 7 days'
    case 'next14': return 'Next 14 days'
    case 'next30': return 'Next 30 days'
    case 'day': return fmtDayLabel(range.value[0])
    case 'week': return `${range.value[0].getDate()} - ${fmtDayLabel(range.value[1])}`
    case 'month': return `${MONTHS_LONG[range.value[0].getMonth()]} ${range.value[0].getFullYear()}`
    case 'year': return `${range.value[0].getFullYear()}`
    case 'custom': return 'Custom'
    case 'thisWeek': return 'This week'
    case 'nextMonth': return 'Next month'
    case 'thisMonth': return 'This month'
    case 'thisQuarter': return 'This quarter'
    case 'thisYear': return 'This year'
    default: return fieldText.value
  }
})

// With `labelPrefixMode`, the prefix names the granularity the label describes
// ("Month: December 2026") — anything else stays the generic "Date range:".
const labelPrefix = computed(() => {
  if (!props.labelPrefixMode) return 'Date range:'
  switch (mode.value) {
    case 'month': return 'Month:'
    case 'year': return 'Year:'
    case 'day': return 'Date:'
    case 'week': return 'Week:'
    default: return 'Date range:'
  }
})

// ─── Sidebar selection ──────────────────────────────────────────────────────────

const topPresets = computed<{ key: Mode; label: string }[]>(() => props.presets
  ? props.presets
  : props.periodMode
  ? [
      { key: 'thisMonth', label: 'This month' },
      { key: 'thisQuarter', label: 'This quarter' },
      { key: 'thisYear', label: 'This year' },
    ]
  : props.direction === 'future'
    ? [
        { key: 'next7', label: 'Next 7 days' },
        { key: 'next14', label: 'Next 14 days' },
        { key: 'next30', label: 'Next 30 days' },
      ]
    : [
        { key: 'today', label: 'Today' },
        { key: 'last7', label: 'Last 7 days' },
        { key: 'last14', label: 'Last 14 days' },
        { key: 'last30', label: 'Last 30 days' },
      ])
// `instant` items commit immediately (like the top presets); the rest open a
// calendar granularity view.
const granularityPresets = computed<{ key: Mode; label: string; instant?: boolean }[]>(() => props.presets
  ? [{ key: 'custom', label: 'Custom date range' }]
  : props.periodMode
  ? [
      { key: 'month', label: 'Per month' },
      { key: 'year', label: 'Per year' },
      { key: 'custom', label: 'Custom' },
    ]
  : [
      { key: 'day', label: 'Per day' },
      { key: 'week', label: 'Per week' },
      { key: 'month', label: 'Per month' },
      { key: 'year', label: 'Per year' },
      { key: 'custom', label: 'Custom' },
    ])

function selectInstant(key: Mode) {
  mode.value = key
  const [s, e] = presetBounds(key)
  commit(s, e)
  open.value = false
}

function selectGranularity(key: Mode) {
  mode.value = key
  customStart.value = null
  if (key === 'day' || key === 'week' || key === 'custom') viewMonth.value = startOfMonth(range.value[0])
  if (key === 'month') viewYear.value = range.value[0].getFullYear()
  if (key === 'year') decadeStart.value = Math.floor(range.value[0].getFullYear() / 10) * 10
}

const showCalendar = computed(() => ['day', 'week', 'month', 'year', 'custom'].includes(mode.value))

// ─── Day-grid calendar (Per day / Per week / Custom) ───────────────────────────

const viewMonth = ref(startOfMonth(today))
function prevMonth() { viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() - 1, 1) }
function nextMonth() { viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + 1, 1) }

const dayGrid = computed(() => {
  const first = viewMonth.value
  const gridStart = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
})

const customStart = ref<Date | null>(null)

function inRange(d: Date) {
  return d >= range.value[0] && d <= range.value[1]
}

function onDayClick(d: Date) {
  if (mode.value === 'day') { commit(d, d); open.value = false; return }
  if (mode.value === 'week') { commit(startOfWeek(d), endOfWeek(d)); open.value = false; return }
  // custom: first click sets start, second sets end (order-normalized) and commits
  if (!customStart.value) { customStart.value = d; commit(d, d); return }
  const start = customStart.value < d ? customStart.value : d
  const end = customStart.value < d ? d : customStart.value
  commit(start, end)
  customStart.value = null
  open.value = false
}

// ─── Month-grid calendar (Per month) ───────────────────────────────────────────

const viewYear = ref(today.getFullYear())
function onMonthClick(mi: number) {
  const start = new Date(viewYear.value, mi, 1)
  commit(startOfMonth(start), endOfMonth(start))
  open.value = false
}

// ─── Year-grid / decade calendar (Per year) ────────────────────────────────────

const decadeStart = ref(Math.floor(today.getFullYear() / 10) * 10)
function prevDecade() { decadeStart.value -= 10 }
function nextDecade() { decadeStart.value += 10 }
function onYearClick(y: number) {
  commit(new Date(y, 0, 1), new Date(y, 11, 31))
  open.value = false
}
</script>

<template>
  <div class="adr-wrap" :class="{ 'adr-wrap--full': isFullWidth }">
    <label v-if="hasValue && !hideLabel" class="adr-label">
      <span class="adr-label-prefix">{{ labelPrefix }}</span>
      <span class="adr-label-value">{{ labelText }}</span>
    </label>

    <MpPopover
      :id="id"
      is-manual
      :is-open="open"
      use-portal
      :is-keep-alive="false"
      placement="bottom-start"
      @open="open = true"
      @close="open = false"
    >
      <MpPopoverTrigger>
        <MpButton class="adr-field" :class="{ 'adr-field--full': isFullWidth }" type="button" @click.stop="open = !open">
          <span class="adr-field__value" :class="{ 'adr-field__value--placeholder': !hasValue }">{{ fieldText }}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
            <path d="M3 9.5H21M8 3V6M16 3V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ padding: '0' })" @blur="open = false" @escape="open = false">
        <div class="adr-popover">
          <div class="adr-sidebar">
            <template v-if="topPresets.length">
              <div class="adr-sidebar-title">Time range</div>
              <MpButton
                v-for="opt in topPresets" :key="opt.key"
                class="adr-sidebar-item adr-sidebar-item--preset" :class="{ 'adr-sidebar-item--active': mode === opt.key }"
                @click.stop="selectInstant(opt.key)"
              >
                <span class="adr-preset-label">{{ opt.label }}</span>
                <span class="adr-preset-range">{{ presetRangeText(opt.key) }}</span>
              </MpButton>
              <div class="adr-sidebar-divider" />
            </template>
            <MpButton
              v-for="opt in granularityPresets" :key="opt.key"
              class="adr-sidebar-item" :class="{ 'adr-sidebar-item--active': mode === opt.key }"
              @click.stop="opt.instant ? selectInstant(opt.key) : selectGranularity(opt.key)"
            >{{ opt.label }}</MpButton>
          </div>

          <div v-if="showCalendar" class="adr-calendar">
            <!-- Day-grid (Per day / Per week / Custom) -->
            <template v-if="mode === 'day' || mode === 'week' || mode === 'custom'">
              <div class="adr-cal-header">
                <MpButton class="adr-cal-nav" aria-label="Previous month" @click.stop="prevMonth">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </MpButton>
                <span class="adr-cal-title">{{ MONTHS_SHORT[viewMonth.getMonth()] }} {{ viewMonth.getFullYear() }}</span>
                <MpButton class="adr-cal-nav" aria-label="Next month" @click.stop="nextMonth">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </MpButton>
              </div>
              <div class="adr-cal-weekdays">
                <span v-for="wd in ['Su','Mo','Tu','We','Th','Fr','Sa']" :key="wd">{{ wd }}</span>
              </div>
              <div class="adr-cal-days">
                <MpButton
                  v-for="(d, i) in dayGrid" :key="i"
                  class="adr-cal-day"
                  :class="{
                    'adr-cal-day--outside': d.getMonth() !== viewMonth.getMonth(),
                    'adr-cal-day--today': isSameDay(d, today),
                    'adr-cal-day--inrange': inRange(d),
                    'adr-cal-day--edge': isSameDay(d, range[0]) || isSameDay(d, range[1]),
                  }"
                  @click.stop="onDayClick(d)"
                >{{ d.getDate() }}</MpButton>
              </div>
              <div class="adr-cal-anchor">Today</div>
            </template>

            <!-- Month-grid (Per month) -->
            <template v-else-if="mode === 'month'">
              <div class="adr-cal-header">
                <MpButton class="adr-cal-nav" aria-label="Previous year" @click.stop="viewYear--">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </MpButton>
                <span class="adr-cal-title">{{ viewYear }}</span>
                <MpButton class="adr-cal-nav" aria-label="Next year" @click.stop="viewYear++">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </MpButton>
              </div>
              <div class="adr-grid adr-grid--month">
                <MpButton
                  v-for="(m, mi) in MONTHS_SHORT" :key="mi"
                  class="adr-grid-cell"
                  :class="{ 'adr-grid-cell--current': viewYear === today.getFullYear() && mi === today.getMonth() }"
                  @click.stop="onMonthClick(mi)"
                >{{ m }}</MpButton>
              </div>
              <div class="adr-cal-anchor">This month</div>
            </template>

            <!-- Year-grid / decade (Per year) -->
            <template v-else-if="mode === 'year'">
              <div class="adr-cal-header">
                <MpButton class="adr-cal-nav" aria-label="Previous decade" @click.stop="prevDecade">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </MpButton>
                <span class="adr-cal-title">{{ decadeStart }} - {{ decadeStart + 9 }}</span>
                <MpButton class="adr-cal-nav" aria-label="Next decade" @click.stop="nextDecade">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </MpButton>
              </div>
              <div class="adr-grid adr-grid--year">
                <MpButton
                  v-for="y in Array.from({ length: 10 }, (_, i) => decadeStart + i)" :key="y"
                  class="adr-grid-cell"
                  :class="{ 'adr-grid-cell--current': y === today.getFullYear() }"
                  @click.stop="onYearClick(y)"
                >{{ y }}</MpButton>
              </div>
              <div class="adr-cal-anchor">This Year</div>
            </template>
          </div>
        </div>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
.adr-wrap { display: flex; flex-direction: column; gap: 4px; }
.adr-wrap--full { width: 100%; }

.adr-label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
}
.adr-label-prefix { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.adr-label-value { font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); margin-left: var(--mp-spacing-1); }

/* Rendered via MpButton, not a raw HTML control — default look reset so it
   can take on the field's own shape (see IconButton/.demo-fab precedent). */
.adr-field { display: inline-flex !important; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); min-width: 0 !important; width: 260px; height: var(--mp-sizes-9, 36px); padding: 0 var(--mp-spacing-3) !important; background: var(--mp-background-neutral, #ffffff) !important; border: 1px solid var(--mp-border-default, #e3e7e9) !important; border-radius: var(--mp-radii-md) !important; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); cursor: pointer; }
.adr-field--full { width: 100%; }
.adr-field:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.adr-field svg { flex-shrink: 0; color: var(--mp-text-subtle); }
.adr-field__value--placeholder { color: var(--mp-text-placeholder, #8690a2); }

/* ── Popover: sidebar + calendar ── */
.adr-popover { display: flex; }

.adr-sidebar { width: var(--mp-sizes-85, 340px); padding: var(--mp-spacing-3) 0; border-right: 1px solid var(--mp-border-default, #e3e7e9); display: flex; flex-direction: column; }
.adr-sidebar-title {
  padding: var(--mp-spacing-1) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-xs, 11px);
  font-weight: var(--mp-font-weights-semi-bold);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mp-text-subtle);
}
.adr-sidebar-item {
  text-align: left;
  padding: var(--mp-spacing-2) var(--mp-spacing-4) !important;
  min-width: 0 !important;
  background: transparent !important;
  border: none !important;
  border-radius: 0 !important;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
}
.adr-sidebar-item:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
/* Quick presets show their resolved range on the right (Today = a single date). */
.adr-sidebar-item--preset {
  display: flex !important;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.adr-preset-label { white-space: nowrap; }
.adr-preset-range { color: var(--mp-text-subtle); white-space: nowrap; }
/* Active/selected = neutral-subtle BG FILL + default text (matches Pixel's native
   MpPopoverListItem :is-active — rgb(248,249,249), NOT a green text/fill). */
.adr-sidebar-item--active {
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  color: var(--mp-text-default);
}
.adr-sidebar-divider { height: 1px; background: var(--mp-border-default, #e3e7e9); margin: var(--mp-spacing-2) 0; }

.adr-calendar { width: 280px; padding: var(--mp-spacing-3); }

.adr-cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--mp-spacing-2);
}
.adr-cal-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
/* Rendered via MpButton — default look reset (see IconButton/.demo-fab precedent). */
.adr-cal-nav {
  display: flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px);
  padding: 0 !important; min-width: 0 !important;
  border: none !important; background: transparent !important; border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-secondary); cursor: pointer;
}
.adr-cal-nav:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }

.adr-cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: var(--mp-font-sizes-xs, 11px);
  color: var(--mp-text-subtle);
  margin-bottom: var(--mp-spacing-1);
}

.adr-cal-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.adr-cal-day {
  height: var(--mp-sizes-7\.5, 30px);
  min-width: 0 !important;
  padding: 0 !important;
  border: none !important;
  background: transparent !important;
  border-radius: var(--mp-radii-sm) !important;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  cursor: pointer;
}
.adr-cal-day:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.adr-cal-day--outside { color: var(--mp-text-placeholder); }
.adr-cal-day--inrange { background: var(--mp-background-selected, #e5e2fb); }
.adr-cal-day--edge { background: var(--mp-background-selected-strong, #c7c1f5); font-weight: var(--mp-font-weights-semi-bold); }
.adr-cal-day--today { background: var(--mp-background-warning, #fcefc2); outline: 1.5px solid var(--mp-border-warning, #f2b90c); outline-offset: -1.5px; font-weight: var(--mp-font-weights-semi-bold); }

.adr-cal-anchor {
  text-align: center;
  margin-top: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

.adr-grid { display: grid; gap: var(--mp-spacing-2); }
.adr-grid--month { grid-template-columns: repeat(4, 1fr); }
.adr-grid--year { grid-template-columns: repeat(4, 1fr); }
.adr-grid-cell {
  padding: var(--mp-spacing-2) !important;
  min-width: 0 !important;
  border: none !important;
  background: var(--mp-background-neutral-subtle, #f8f9f9) !important;
  border-radius: var(--mp-radii-md) !important;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
  cursor: pointer;
}
.adr-grid-cell:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.adr-grid-cell--current { background: var(--mp-background-warning, #fcefc2); font-weight: var(--mp-font-weights-semi-bold); }
</style>
