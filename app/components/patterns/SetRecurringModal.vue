<script setup lang="ts">
/**
 * Set as recurring — schedule a transaction to repeat. Reusable across modules
 * (internal transfer, expense, …). Fields: name, repeat interval + unit, an end
 * condition (never / after N occurrences / on a date), and a start date with the
 * computed next run shown below it. Demo-only: emits the config on save.
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpInput, MpAutocomplete, MpDatePicker, MpRadio, MpFormControl, MpFormLabel, MpFormErrorMessage,
} from '@mekari/pixel3'
import { formatDateLong } from '~/utils/date'

export interface RecurringConfig {
  name: string
  interval: number
  unit: 'day' | 'week' | 'month' | 'year'
  ends: 'never' | 'after' | 'on'
  occurrences?: number
  endDate?: string
  startDate: string // ISO
}

const props = defineProps<{ isOpen: boolean; minDate?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'save', config: RecurringConfig): void }>()
const { t } = useLocale()

function toDisplayDate(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toISODate(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))
// Start date can't precede the transaction date.
const startDateError = ref(false)
function disabledBeforeMin(date: Date): boolean {
  if (!props.minDate) return false
  const min = new Date(props.minDate); min.setHours(0, 0, 0, 0)
  return date < min
}

const name = ref('')
const nameError = ref(false)
const interval = ref('1')
const unit = ref<RecurringConfig['unit']>('month')
const unitOptions = computed(() => [
  { id: 'day', name: t('Day') },
  { id: 'week', name: t('Week') },
  { id: 'month', name: t('Month') },
  { id: 'year', name: t('Year') },
])
const ends = ref<RecurringConfig['ends']>('never')
const occurrences = ref('12')
const endDate = ref(todayDisplay)
const startDate = ref(todayDisplay)

// Reset each time the modal opens.
watch(() => props.isOpen, (open) => {
  if (!open) return
  name.value = ''; nameError.value = false
  interval.value = '1'; unit.value = 'month'
  ends.value = 'never'; occurrences.value = '12'
  startDateError.value = false
  // Default start = today, but never before the transaction date.
  const todayIso = new Date().toISOString().slice(0, 10)
  const startIso = props.minDate && props.minDate > todayIso ? props.minDate : todayIso
  endDate.value = toDisplayDate(startIso); startDate.value = toDisplayDate(startIso)
})

// Next run = first occurrence on/after today, stepping from the start date.
const nextDate = computed(() => {
  const n = Math.max(1, Number(interval.value) || 1)
  let d = new Date(toISODate(startDate.value))
  if (isNaN(d.getTime())) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const step = (date: Date) => {
    const nd = new Date(date)
    if (unit.value === 'day') nd.setDate(nd.getDate() + n)
    else if (unit.value === 'week') nd.setDate(nd.getDate() + n * 7)
    else if (unit.value === 'month') nd.setMonth(nd.getMonth() + n)
    else nd.setFullYear(nd.getFullYear() + n)
    return nd
  }
  let guard = 0
  while (d < today && guard++ < 1000) d = step(d)
  return d.toISOString().slice(0, 10)
})

function save() {
  let ok = true
  if (!name.value.trim()) { nameError.value = true; ok = false }
  if (props.minDate && toISODate(startDate.value) < props.minDate) { startDateError.value = true; ok = false }
  if (!ok) return
  emit('save', {
    name: name.value.trim(),
    interval: Math.max(1, Number(interval.value) || 1),
    unit: unit.value,
    ends: ends.value,
    occurrences: ends.value === 'after' ? Math.max(1, Number(occurrences.value) || 1) : undefined,
    endDate: ends.value === 'on' ? toISODate(endDate.value) : undefined,
    startDate: toISODate(startDate.value),
  })
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="set-recurring-modal" :is-open="isOpen" size="md" :is-keep-alive="false" @close="emit('close')">
    <MpModalContent>
      <MpModalHeader>{{ t('Set as recurring') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="sr-body">
          <!-- Name -->
          <MpFormControl id="sr-name" :is-invalid="nameError" is-required>
            <MpFormLabel>{{ t('Name') }}</MpFormLabel>
            <MpInput id="sr-name-input" v-model="name" is-full-width :maxlength="60" :placeholder="t('Example: Monthly rent transfer')" :is-invalid="nameError" @update:model-value="nameError = false" />
            <MpFormErrorMessage>{{ t('You must fill in name') }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Repeats every N unit -->
          <div class="sr-field">
            <label class="sr-label">{{ t('Repeats every') }}</label>
            <div class="sr-every">
              <MpInput id="sr-interval" v-model="interval" type="number" class="sr-interval" />
              <div class="sr-unit"><MpAutocomplete id="sr-unit" v-model="unit" :data="unitOptions" label-prop="name" value-prop="id" use-portal is-full-width /></div>
            </div>
          </div>

          <!-- Ends -->
          <div class="sr-field">
            <label class="sr-label">{{ t('Ends') }}</label>
            <div class="sr-radio-group">
              <label class="sr-radio">
                <MpRadio id="sr-ends-never" name="sr-ends" value="never" :is-checked="ends === 'never'" @change="ends = 'never'" />
                <span>{{ t('Never') }}</span>
              </label>
              <label class="sr-radio sr-radio--nowrap">
                <MpRadio id="sr-ends-after" name="sr-ends" value="after" :is-checked="ends === 'after'" @change="ends = 'after'" />
                <span>{{ t('After') }}</span>
                <div class="sr-num-wrap"><MpInput id="sr-occurrences" v-model="occurrences" type="number" is-full-width :is-disabled="ends !== 'after'" /></div>
                <span class="sr-radio-suffix">{{ t('occurrences') }}</span>
              </label>
              <label class="sr-radio">
                <MpRadio id="sr-ends-on" name="sr-ends" value="on" :is-checked="ends === 'on'" @change="ends = 'on'" />
                <span>{{ t('On date') }}</span>
                <div v-if="ends === 'on'" class="sr-inline-date">
                  <MpDatePicker id="sr-end-date" v-model="endDate" format="DD/MM/YYYY" value-type="format" use-portal />
                </div>
              </label>
            </div>
          </div>

          <!-- Start date + next run -->
          <div class="sr-field">
            <label class="sr-label">{{ t('Start date') }}</label>
            <div class="sr-date"><MpDatePicker id="sr-start-date" v-model="startDate" format="DD/MM/YYYY" value-type="format" use-portal :disabled-date="disabledBeforeMin" @update:model-value="startDateError = false" /></div>
            <p v-if="startDateError" class="sr-error">{{ t('Start date cannot be before the transaction date') }}</p>
            <p v-else-if="nextDate" class="sr-next">{{ t('Next date') }}: <strong>{{ formatDateLong(nextDate) }}</strong></p>
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="sr-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="emit('close')">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="save">{{ t('Save') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.sr-body { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.sr-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.sr-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sr-every { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.sr-interval { width: 96px; }
.sr-unit { width: 160px; }
.sr-radio-group { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.sr-radio { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.sr-radio--nowrap { flex-wrap: nowrap; }
.sr-radio-suffix { color: var(--mp-text-default); white-space: nowrap; }
.sr-num-wrap { width: 72px; flex: 0 0 72px; }
.sr-inline-date { width: 180px; }
.sr-date { width: 220px; }
.sr-date :deep(.mp-datepicker__root), .sr-inline-date :deep(.mp-datepicker__root) { width: 100%; }
.sr-next { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sr-next strong { color: var(--mp-text-default); }
.sr-error { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #dc2626); }
.sr-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
