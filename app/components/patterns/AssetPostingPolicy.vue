<script setup lang="ts">
/**
 * AssetPostingPolicy: the two depreciation settings that change what the
 * engine writes (OD-09, OD-10). Stated once for the company, not chosen per
 * run. Each change applies from the next run posted; a posted journal keeps
 * the date it was posted with.
 */
import { computed, ref, watch } from 'vue'
import { MpInput, MpToggle } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { successToast } from '~/utils/toasts'
import {
  journalDatePolicy, journalPolicyDay, autoPostRuns, journalDateFor, journalDatePolicyLabel, type JournalDatePolicy,
} from '~/data/assetPolicy'
import { canChangeValue, viewAs, nextOpenPeriod, CURRENT_PERIOD } from '~/data/assetStore'
import { periodEndDate, periodLabel } from '~/data/assetEngine'

const { t } = useLocale()

const policyOptions = [
  { value: 'period-end', label: 'Last day of the period' },
  { value: 'posting-date', label: 'The date the run is posted' },
  { value: 'policy-day', label: 'A fixed day of the following month' },
]

const error = ref('')
const dayDraft = ref(String(journalPolicyDay.value))
watch(journalPolicyDay, (d) => { dayDraft.value = String(d) })

function guard(): boolean {
  if (canChangeValue.value) return true
  error.value = `Viewing as ${viewAs.value}. Only Owner or Accounting can change the posting policy.`
  return false
}

const policy = computed({
  get: () => journalDatePolicy.value,
  set: (v: string) => {
    error.value = ''
    if (!v || v === journalDatePolicy.value || !guard()) return
    journalDatePolicy.value = v as JournalDatePolicy
    successToast(t(`Journal date set to ${journalDatePolicyLabel()}`))
  },
})

function applyDay() {
  error.value = ''
  const n = Number(dayDraft.value)
  if (!Number.isInteger(n) || n < 1 || n > 28) { error.value = 'Enter a day from 1 to 28'; return }
  if (n === journalPolicyDay.value || !guard()) return
  journalPolicyDay.value = n
  successToast(t(`Journal date set to ${journalDatePolicyLabel()}`))
}

const autoPost = computed({
  get: () => autoPostRuns.value,
  set: (v: boolean) => {
    error.value = ''
    if (!guard()) return
    autoPostRuns.value = v
    successToast(t(v ? 'Automatic posting turned on' : 'Automatic posting turned off'))
  },
})

/** What the next run's journal will carry, so the setting's effect is visible here. */
const example = computed(() => {
  const p = nextOpenPeriod.value
  if (!p) return null
  return { label: periodLabel(p), date: journalDateFor(p, periodEndDate(CURRENT_PERIOD)) }
})
</script>

<template>
  <div class="app">
    <div class="app__row" data-tour="set-jdate">
      <div class="app__text">
        <div class="app__k">{{ t('Journal date') }}</div>
        <div class="app__v">
          <template v-if="example">{{ t(`The ${example.label} run will be dated ${example.date}.`) }}</template>
        </div>
      </div>
      <div class="app__controls">
        <ErpFilterSelect id="set-jdate-policy" v-model="policy" :placeholder="t('Journal date')" :options="policyOptions" width="280px" :is-clearable="false" />
        <div v-if="policy === 'policy-day'" class="app__day">
          <label class="app__daylabel" for="set-jdate-day">{{ t('Day') }}</label>
          <MpInput id="set-jdate-day" v-model="dayDraft" class="app__dayinput" @blur="applyDay" @keyup.enter="applyDay" />
        </div>
      </div>
    </div>
    <div class="app__row">
      <div class="app__text">
        <div class="app__k">{{ t('Post automatically when a run is generated') }}</div>
        <div class="app__v">
          {{ autoPost
            ? t('Generated runs post immediately. You can still reverse them from the schedule.')
            : t('Generated runs stay as drafts until someone posts them.') }}
        </div>
      </div>
      <MpToggle v-model:is-checked="autoPost" :aria-label="t('Post automatically when a run is generated')" />
    </div>
    <p v-if="error" class="app__error">{{ t(error) }}</p>
  </div>
</template>

<style scoped>
.app { display: flex; flex-direction: column; }
.app__row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.app__text { min-width: 0; }
.app__k { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.app__v { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.app__controls { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: none; }
.app__day { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.app__daylabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.app__dayinput { width: 72px; }
.app__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical); margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-4); }
</style>
