<script setup lang="ts">
/**
 * DateConditionField — a date filter with a comparator prefix: Is between (a range),
 * Is before or Is after (one date). Built for the Batch Traceability "All filters"
 * drawer (PRD story 2: "date range picker / before certain date / after certain date").
 *
 * No new picker: it composes the two sanctioned date controls
 * (rule/date-picker-variants) — AdvancedDateRangePicker for the range, MpDatePicker for
 * a single date — behind the same prefix-chip comparator as AmountComparatorField.
 *
 * The model is the data layer's `DateCondition` (ISO dates), or null while nothing is
 * picked. Switching the comparator clears the value: a range can't become one date
 * without guessing which end was meant.
 */
import {
  MpIcon, MpButton, MpDatePicker, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import type { DateCondition } from '~/data/batchTraceability'

type Op = DateCondition['op']
const OPS: Op[] = ['between', 'before', 'after']
const OP_LABELS: Record<Op, string> = { between: 'Is between', before: 'Is before', after: 'Is after' }

const props = defineProps<{
  id: string
  modelValue: DateCondition | null
}>()
const emit = defineEmits<{ 'update:modelValue': [DateCondition | null] }>()
const { t } = useLocale()

// Held locally so the comparator can change before any date is picked.
const op = ref<Op>(props.modelValue?.op ?? 'between')
watch(() => props.modelValue, (v) => { if (v) op.value = v.op })

const open = ref(false)
function selectOp(next: Op) {
  open.value = false
  if (next === op.value) return
  op.value = next
  emit('update:modelValue', null)
}

function pad(n: number): string { return String(n).padStart(2, '0') }
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}
function dateToIso(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function dmyToIso(v: string): string {
  const [d, m, y] = v.split('/')
  return d && m && y ? `${y}-${m}-${d}` : ''
}
function isoToDmy(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const range = computed<Date[] | null>(() => {
  const v = props.modelValue
  return v?.op === 'between' ? [isoToDate(v.from), isoToDate(v.to)] : null
})
function onRange(v: Date[]) {
  const [from, to] = v
  emit('update:modelValue', from && to ? { op: 'between', from: dateToIso(from), to: dateToIso(to) } : null)
}

const single = computed(() => {
  const v = props.modelValue
  return v && v.op !== 'between' ? isoToDmy(v.date) : ''
})
function onSingle(v: string | null) {
  const iso = v ? dmyToIso(v) : ''
  const current = op.value
  emit('update:modelValue', iso && current !== 'between' ? { op: current, date: iso } : null)
}
</script>

<template>
  <div class="dcf">
    <MpPopover
      :id="`${id}-op`" is-manual :is-open="open" use-portal :is-keep-alive="false"
      placement="bottom-start" @open="open = true" @close="open = false"
    >
      <MpPopoverTrigger>
        <MpButton class="dcf-op" type="button" @click.stop="open = !open">
          <span>{{ t(OP_LABELS[op]) }}</span>
          <MpIcon name="chevrons-down" size="sm" />
        </MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })" @blur="open = false" @escape="open = false">
        <MpPopoverList>
          <MpPopoverListItem v-for="o in OPS" :key="o" :is-active="o === op" @click="selectOp(o)">
            {{ t(OP_LABELS[o]) }}
          </MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>

    <div class="dcf-value">
      <AdvancedDateRangePicker
        v-if="op === 'between'" :id="`${id}-range`" :model-value="range"
        is-full-width hide-label :placeholder="t('Select date range')"
        @update:model-value="onRange"
      />
      <!-- Keyed on the comparator so switching Before ↔ After remounts a clean picker. -->
      <MpDatePicker
        v-else :key="op" :model-value="single" format="DD/MM/YYYY" value-type="format"
        :placeholder="t('Select date')" use-portal is-full-width
        @update:model-value="onSingle"
      />
    </div>
  </div>
</template>

<style scoped>
.dcf { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); width: 100%; }
.dcf-value { flex: 1; min-width: 0; }

/* Select-like comparator trigger — same metrics as MultiSelectDropdown's field
   (rule/select-field-metrics: 38px, border-form). */
.dcf-op {
  display: inline-flex !important; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  flex-shrink: 0; min-width: 0 !important; width: 128px;
  height: var(--mp-sizes-9\.5, 38px); padding: 0 var(--mp-spacing-3) !important;
  background: var(--mp-colors-background-neutral, #fff) !important;
  border: 1px solid var(--mp-colors-border-form, #1d1f2429) !important;
  border-radius: var(--mp-radii-md) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-colors-text-default, #080d0e); white-space: nowrap; cursor: pointer;
}
.dcf-op:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }
</style>
