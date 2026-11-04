<!-- prod-parity: quickbook/app/views/recurring_schedules/_modal_form_edit_recurring_schedule.html.haml -->
<script setup lang="ts">
/**
 * Set Up Recurring — edit a recurring schedule (Name, Repeats every, Ends, Start
 * Date, Next Date + by End of Months, Auto Send Email). Shared by the Recurring
 * transactions index and its detail page. Saves into the session store.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpInput, MpRadio, MpCheckbox, MpDatePicker, MpFormControl, MpFormLabel, MpFormErrorMessage,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatDate } from '~/utils/date'
import { successToast } from '~/utils/toasts'
import { updateRecurringSchedule, type RecurringSchedule, type RecurringPeriod, type RecurringEndType } from '~/data/otherLists'

const props = defineProps<{ isOpen: boolean; schedule: RecurringSchedule | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useLocale()

const periodOptions = computed(() => [
  { value: 'day', label: t('Days') },
  { value: 'week', label: t('Weeks') },
  { value: 'month', label: t('Months') },
  { value: 'year', label: t('Years') },
])

function toDisplay(iso: string | null) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function toIso(display: string) { const [d, m, y] = display.split('/'); return `${y}-${m}-${d}` }

const name = ref('')
const repeatEvery = ref('1')
const period = ref<RecurringPeriod>('month')
const endType = ref<RecurringEndType>('never')
const occurrences = ref('1')
const endDate = ref('')
const startDate = ref('')
const endOfMonth = ref(false)
const autoSendEmail = ref(false)
const nameError = ref(false)
const occurrenceError = ref(false)

watch(() => props.isOpen, (open) => {
  if (!open || !props.schedule) return
  const s = props.schedule
  name.value = s.name
  repeatEvery.value = String(s.repeatEvery)
  period.value = s.period
  endType.value = s.endType
  occurrences.value = String(s.occurrences ?? 1)
  endDate.value = toDisplay(s.endDate ?? s.startDate)
  startDate.value = toDisplay(s.startDate)
  endOfMonth.value = s.endOfMonth
  autoSendEmail.value = s.autoSendEmail
  nameError.value = false
  occurrenceError.value = false
}, { immediate: true })

// Next Date — first run on/after today, stepping from the start date.
const nextDate = computed(() => {
  if (!startDate.value) return ''
  const n = Math.max(1, Number(repeatEvery.value) || 1)
  let d = new Date(toIso(startDate.value))
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let guard = 0
  while (d < today && guard++ < 2000) {
    const nd = new Date(d)
    if (period.value === 'day') nd.setDate(nd.getDate() + n)
    else if (period.value === 'week') nd.setDate(nd.getDate() + n * 7)
    else if (period.value === 'month') nd.setMonth(nd.getMonth() + n)
    else nd.setFullYear(nd.getFullYear() + n)
    d = nd
  }
  if (endOfMonth.value) d = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const appliedCount = computed(() => props.schedule?.lines.filter((l) => l.transactionNo).length ?? 0)

function save() {
  if (!props.schedule) return
  nameError.value = !name.value.trim()
  occurrenceError.value = endType.value === 'after' && (Number(occurrences.value) || 0) < appliedCount.value
  if (nameError.value || occurrenceError.value) return
  updateRecurringSchedule(props.schedule.id, {
    name: name.value.trim(),
    repeatEvery: Math.max(1, Number(repeatEvery.value) || 1),
    period: period.value,
    endType: endType.value,
    occurrences: endType.value === 'after' ? Math.max(1, Number(occurrences.value) || 1) : null,
    endDate: endType.value === 'on' ? toIso(endDate.value) : null,
    startDate: toIso(startDate.value),
    nextDate: props.schedule.endedReason ? props.schedule.nextDate : nextDate.value,
    endOfMonth: endOfMonth.value,
    autoSendEmail: autoSendEmail.value,
  })
  successToast(t('Recurring schedule saved'))
  emit('close')
}
</script>

<template>
  <MpModal id="recurring-schedule-edit" :is-open="isOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="emit('close')">
    <MpModalContent>
      <MpModalHeader>{{ t('Set Up Recurring') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="rse-body">
          <p v-if="schedule" class="rse-source">{{ schedule.sourceNo }}</p>

          <MpFormControl id="rse-name" :is-invalid="nameError" is-required>
            <MpFormLabel>{{ t('Name') }}</MpFormLabel>
            <MpInput id="rse-name-input" v-model="name" :maxlength="60" :is-invalid="nameError" @update:model-value="nameError = false" />
            <MpFormErrorMessage>{{ t('Name can\'t be blank') }}</MpFormErrorMessage>
          </MpFormControl>

          <div class="rse-field">
            <span class="rse-label">{{ t('Repeats every') }}<span class="rse-req">*</span></span>
            <div class="rse-row">
              <div class="rse-num"><MpInput id="rse-repeat-every" v-model="repeatEvery" type="number" /></div>
              <ErpFilterSelect id="rse-period" :model-value="period" :placeholder="t('Period')" :options="periodOptions" :is-clearable="false" width="160px" @update:model-value="period = ($event as RecurringPeriod) || period" />
            </div>
          </div>

          <div class="rse-field">
            <span class="rse-label">{{ t('Ends') }}</span>
            <div class="rse-radios">
              <label class="rse-radio">
                <MpRadio id="rse-end-never" name="rse-end" value="never" :is-checked="endType === 'never'" @change="endType = 'never'" />
                <span>{{ t('Never') }}</span>
              </label>
              <label class="rse-radio">
                <MpRadio id="rse-end-after" name="rse-end" value="after" :is-checked="endType === 'after'" @change="endType = 'after'" />
                <span>{{ t('After Occurance') }}</span>
              </label>
              <div v-if="endType === 'after'" class="rse-indent">
                <div class="rse-row">
                  <div class="rse-num"><MpInput id="rse-occurrences" v-model="occurrences" type="number" @update:model-value="occurrenceError = false" /></div>
                  <span class="rse-suffix">{{ t('Occurances') }}</span>
                </div>
                <p class="rse-help">{{ t('How many times duplicate invoices will be created as to schedule') }}</p>
                <p v-if="occurrenceError" class="rse-error">{{ t('Occurance can\'t smaller rather than applied occurance') }}</p>
              </div>
              <label class="rse-radio">
                <MpRadio id="rse-end-on" name="rse-end" value="on" :is-checked="endType === 'on'" @change="endType = 'on'" />
                <span>{{ t('On Date') }}</span>
              </label>
              <div v-if="endType === 'on'" class="rse-indent rse-date">
                <MpDatePicker id="rse-end-date" v-model="endDate" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" />
              </div>
            </div>
          </div>

          <div class="rse-field">
            <span class="rse-label">{{ t('Start Date') }}</span>
            <div class="rse-date">
              <MpDatePicker id="rse-start-date" v-model="startDate" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" />
            </div>
          </div>

          <div class="rse-field">
            <span class="rse-label">{{ t('Next Date') }}</span>
            <div class="rse-row rse-row--between">
              <span class="rse-value">{{ formatDate(nextDate) }}</span>
              <label class="rse-check">
                <MpCheckbox id="rse-end-of-month" :is-checked="endOfMonth" @change="endOfMonth = !endOfMonth" />
                <span>{{ t('by End of Months') }}</span>
              </label>
            </div>
          </div>

          <div class="rse-field">
            <label class="rse-check">
              <MpCheckbox id="rse-auto-email" :is-checked="autoSendEmail" @change="autoSendEmail = !autoSendEmail" />
              <span>{{ t('Auto Send Email') }}</span>
            </label>
            <p class="rse-help rse-help--indent">{{ t('Template can be changed in setting') }}</p>
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.rse-body { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.rse-source { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rse-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rse-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rse-req { color: var(--mp-text-danger); margin-left: var(--mp-spacing-0\.5, 2px); }
.rse-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.rse-row--between { justify-content: space-between; }
.rse-num { width: 96px; }
.rse-radios { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.rse-radio, .rse-check { display: flex; align-items: center; gap: 0; cursor: pointer; color: var(--mp-text-default); }
.rse-indent { padding-left: calc(var(--mp-sizes-5) + var(--mp-spacing-3)); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.rse-suffix { color: var(--mp-text-default); white-space: nowrap; }
.rse-date { width: 220px; }
.rse-indent.rse-date { width: calc(220px + var(--mp-sizes-5) + var(--mp-spacing-3)); }
.rse-value { color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.rse-help { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rse-help--indent { padding-left: calc(var(--mp-sizes-5) + var(--mp-spacing-3)); }
.rse-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
</style>
