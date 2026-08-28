<script setup lang="ts">
/**
 * AdvanceDateFilter — the "advanced date" filter popover: a left column of
 * quick presets (Today / Last 7 days / Last 30 days) and granularities (Per day /
 * week / month / quarter / year / Custom), and a right-side month calendar to pick
 * the anchor date (or, for Custom, a two-click start/end range).
 *
 * Presets apply and close immediately. Granularities switch the calendar's
 * selection unit; clicking a day then applies the whole containing period
 * (day/week/month/quarter/year) and closes.
 *
 * v-model is a DateFilterValue | null (see ~/utils/dateFilter.ts, which also
 * exports resolveDateFilterRange()/dateFilterMatches() for the consuming page's
 * row filtering).
 */
import { ref, computed, watch } from 'vue'
import { MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'
import {
  resolveDateFilterRange, dateFilterLabel, toIso, fromIso,
  type DateFilterValue, type DateFilterMode,
} from '~/utils/dateFilter'

const props = withDefaults(defineProps<{
  id: string
  modelValue: DateFilterValue | null
  placeholder?: string
  /** Reference "today" — the mock's fixed timeline, not the real clock. */
  today?: Date
  /** Whether the trigger shows a clear ("x") to reset back to no filter. */
  clearable?: boolean
}>(), {
  placeholder: 'Select date',
  today: () => new Date(),
  clearable: true,
})

const emit = defineEmits<{ 'update:modelValue': [DateFilterValue | null] }>()

const isOpen = ref(false)

const PRESETS: { mode: DateFilterMode; label: string }[] = [
  { mode: 'today', label: 'Today' },
  { mode: 'last7', label: 'Last 7 days' },
  { mode: 'last30', label: 'Last 30 days' },
]
const GRANULARITIES: { mode: DateFilterMode; label: string }[] = [
  { mode: 'day', label: 'Per day' },
  { mode: 'week', label: 'Per week' },
  { mode: 'month', label: 'Per month' },
  { mode: 'quarter', label: 'Per quarter' },
  { mode: 'year', label: 'Per year' },
  { mode: 'custom', label: 'Custom' },
]

// Left-panel active granularity (drives the calendar's click behaviour). Presets
// don't "activate" a sidebar state — they apply immediately — but if the current
// value is a granularity mode, keep that highlighted when the popover reopens.
const activeMode = ref<DateFilterMode>('day')
// The month the calendar is showing.
const viewYear = ref(props.today.getFullYear())
const viewMonth = ref(props.today.getMonth())
// Custom range — in-progress picks (committed once both ends are chosen).
const customStart = ref<string | null>(null)
const customEnd = ref<string | null>(null)

/** Point the sidebar + calendar at whatever the bound value currently says. */
function syncFromValue() {
  const v = props.modelValue
  const anchorIso = v?.mode === 'custom' ? (v.rangeStart ?? undefined) : v?.date
  const anchor = anchorIso ? fromIso(anchorIso) : props.today
  activeMode.value = (v && ['day', 'week', 'month', 'quarter', 'year', 'custom'].includes(v.mode))
    ? v.mode : 'day'
  viewYear.value = anchor.getFullYear()
  viewMonth.value = anchor.getMonth()
  customStart.value = v?.mode === 'custom' ? (v.rangeStart ?? null) : null
  customEnd.value = v?.mode === 'custom' ? (v.rangeEnd ?? null) : null
}
// Sync on the value itself (and once up front), not only when the popover opens:
// MpPopover manages its own open state here, so `isOpen` never flips and a caller
// that starts with a granularity value (e.g. the DUI report's default month) would
// otherwise open on "Per day" with its range unhighlighted.
syncFromValue()
watch(() => props.modelValue, syncFromValue)
watch(isOpen, (open) => { if (open) syncFromValue() })

const label = computed(() => dateFilterLabel(props.modelValue, props.today))

function apply(value: DateFilterValue) {
  emit('update:modelValue', value)
  isOpen.value = false
}
function clear(e: Event) {
  e.stopPropagation()
  emit('update:modelValue', null)
}
function applyPreset(mode: DateFilterMode) {
  apply({ mode })
}
function selectGranularity(mode: DateFilterMode) {
  activeMode.value = mode
  if (mode === 'custom') { customStart.value = null; customEnd.value = null }
}

// ─── Calendar grid ────────────────────────────────────────────────────────────
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABEL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

interface Cell { iso: string; dayNum: number; inMonth: boolean }
const calendarCells = computed<Cell[]>(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const startOffset = first.getDay() // days to back up to Sunday
  const gridStart = new Date(viewYear.value, viewMonth.value, 1 - startOffset)
  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    cells.push({ iso: toIso(d), dayNum: d.getDate(), inMonth: d.getMonth() === viewMonth.value })
  }
  return cells
})
const monthTitle = computed(() => `${MONTH_LABEL[viewMonth.value]} ${viewYear.value}`)

function prevMonth() {
  if (viewMonth.value === 0) { viewMonth.value = 11; viewYear.value-- } else viewMonth.value--
}
function nextMonth() {
  if (viewMonth.value === 11) { viewMonth.value = 0; viewYear.value++ } else viewMonth.value++
}

const todayIso = computed(() => toIso(props.today))

// Highlight range: the currently-applied selection for the active granularity
// (or the in-progress custom pick), so the calendar reflects what will apply.
const highlightRange = computed(() => {
  if (activeMode.value === 'custom') {
    if (customStart.value) {
      return resolveDateFilterRange({ mode: 'custom', rangeStart: customStart.value, rangeEnd: customEnd.value ?? customStart.value }, props.today)
    }
    return null
  }
  if (props.modelValue?.mode === activeMode.value) {
    return resolveDateFilterRange(props.modelValue, props.today)
  }
  return null
})
function cellInRange(iso: string): boolean {
  const r = highlightRange.value
  if (!r) return false
  const d = fromIso(iso).getTime()
  return d >= r.start.getTime() && d <= r.end.getTime()
}

// Only prompts while something is genuinely unpicked — with a range already applied
// and highlighted on the calendar, "you haven't chosen a date yet" would be untrue.
const hint = computed(() => {
  if (activeMode.value === 'custom' && customStart.value && !customEnd.value) return 'Select the end date'
  return highlightRange.value ? '' : "You haven't chosen a date yet!"
})

function onDayClick(cell: Cell) {
  if (activeMode.value === 'custom') {
    if (!customStart.value || customEnd.value) {
      customStart.value = cell.iso
      customEnd.value = null
      return
    }
    const start = cell.iso < customStart.value ? cell.iso : customStart.value
    const end = cell.iso < customStart.value ? customStart.value : cell.iso
    apply({ mode: 'custom', rangeStart: start, rangeEnd: end })
    return
  }
  apply({ mode: activeMode.value, date: cell.iso })
}
</script>

<template>
  <MpPopover :id="id" use-portal :is-keep-alive="false" :is-open="isOpen" @update:is-open="isOpen = $event">
    <MpPopoverTrigger>
      <button class="adf-trigger" :class="{ 'adf-trigger--placeholder': !modelValue }" type="button">
        <span class="adf-trigger-label">{{ modelValue ? label : placeholder }}</span>
        <svg
          v-if="modelValue && clearable" class="adf-clear" width="16" height="16" viewBox="0 0 24 24" fill="none"
          aria-label="Clear" @click="clear"
        >
          <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ padding: '0', width: 'max-content' })">
      <div class="adf-panel">
        <!-- ── Left: time range ── -->
        <div class="adf-sidebar">
          <p class="adf-sidebar-label">Time range</p>
          <button
            v-for="p in PRESETS" :key="p.mode" type="button"
            class="adf-sidebar-item" @click="applyPreset(p.mode)"
          >{{ p.label }}</button>
          <div class="adf-divider" />
          <button
            v-for="g in GRANULARITIES" :key="g.mode" type="button"
            class="adf-sidebar-item" :class="{ 'adf-sidebar-item--active': activeMode === g.mode }"
            @click="selectGranularity(g.mode)"
          >{{ g.label }}</button>
        </div>

        <!-- ── Right: calendar ── -->
        <div class="adf-calendar">
          <div class="adf-cal-header">
            <button class="adf-nav-btn" type="button" aria-label="Previous month" @click="prevMonth">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <span class="adf-cal-title">{{ monthTitle }}</span>
            <button class="adf-nav-btn" type="button" aria-label="Next month" @click="nextMonth">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <div class="adf-weekdays">
            <span v-for="d in WEEKDAYS" :key="d">{{ d }}</span>
          </div>
          <div class="adf-days">
            <button
              v-for="cell in calendarCells" :key="cell.iso" type="button"
              class="adf-day"
              :class="{
                'adf-day--muted': !cell.inMonth,
                'adf-day--today': cell.iso === todayIso,
                'adf-day--selected': cellInRange(cell.iso),
              }"
              @click="onDayClick(cell)"
            >{{ cell.dayNum }}</button>
          </div>

          <p v-if="hint" class="adf-hint">{{ hint }}</p>
        </div>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* Trigger — matches the plain select-style trigger used across index filter bars */
.adf-trigger {
  display: inline-flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  min-width: 160px; height: var(--mp-sizes-9, 36px);
  padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); cursor: pointer;
}
.adf-trigger:hover { border-color: var(--mp-border-bold); }
.adf-trigger svg { color: var(--mp-icon-default, var(--mp-text-secondary)); flex-shrink: 0; }
.adf-trigger--placeholder { color: var(--mp-text-placeholder); }
.adf-trigger-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adf-clear { cursor: pointer; border-radius: var(--mp-radii-sm); }
.adf-clear:hover { color: var(--mp-text-default); }

/* Panel — 440px, two columns */
.adf-panel { display: flex; align-items: stretch; width: 440px; }

/* Left: time range list */
.adf-sidebar {
  display: flex; flex-direction: column; width: 140px; flex-shrink: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
}
.adf-sidebar-label {
  margin: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-xs, 11px); font-weight: var(--mp-font-weights-medium, 500);
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--mp-text-secondary);
}
.adf-sidebar-item {
  display: block; width: 100%; text-align: left;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
  border: none; background: none; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.adf-sidebar-item:hover { background: var(--mp-background-neutral-hovered); }
.adf-sidebar-item--active { background: var(--mp-background-brand-selected, #e4e7fb); }
.adf-sidebar-item--active:hover { background: var(--mp-background-brand-selected, #e4e7fb); }
.adf-divider { height: 1px; margin: var(--mp-spacing-2) var(--mp-spacing-1); background: var(--mp-border-default); }

/* Right: calendar */
.adf-calendar {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-4); border-left: 1px solid var(--mp-border-default);
}
.adf-cal-header { display: flex; align-items: center; justify-content: center; gap: var(--mp-spacing-2); }
.adf-nav-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default);
}
.adf-nav-btn:hover { background: var(--mp-background-neutral-hovered); }
.adf-cal-title {
  flex: 1; text-align: center; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.adf-weekdays, .adf-days { display: grid; grid-template-columns: repeat(7, 1fr); }
.adf-weekdays span {
  display: flex; align-items: center; justify-content: center; height: 36px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.adf-day {
  display: flex; align-items: center; justify-content: center; height: 36px;
  border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.adf-day:hover { background: var(--mp-background-neutral-hovered); }
.adf-day--muted { color: var(--mp-text-disabled, rgba(29,31,36,0.32)); }
.adf-day--today { background: var(--mp-background-warning-bold, #f5cd47); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.adf-day--selected { background: var(--mp-background-brand-bold, #029861); color: var(--mp-text-inverse, #fff); }
.adf-day--selected.adf-day--today { background: var(--mp-background-warning-bold, #f5cd47); color: var(--mp-text-default); box-shadow: inset 0 0 0 2px var(--mp-background-brand-bold, #029861); }

.adf-hint { margin: var(--mp-spacing-1) 0 0; text-align: right; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
