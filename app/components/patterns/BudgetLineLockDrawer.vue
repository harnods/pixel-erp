<script setup lang="ts">
/**
 * Lock the budget year (FG-1.2, FG1-AC4): the approved total must match the
 * draft total to the rupiah. Lock posts Version 0 and turns the checks on.
 */
import { MpInput, MpFormControl, MpFormLabel, MpFormErrorMessage } from '@mekari/pixel3'
import BudgetLineDrawerShell from '~/components/patterns/BudgetLineDrawerShell.vue'
import { draftTotal, lockYearAs, budget } from '~/data/budgetStore'
import { parseAmount } from '~/data/budgetUiLines'
import { formatIDRWhole } from '~/utils/currency'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; year: number }>()
const emit = defineEmits<{ close: []; locked: [] }>()
const { t } = useLocale()

const approved = ref('')
const error = ref('')
watch(() => props.isOpen, (open) => { if (open) { approved.value = ''; error.value = '' } })

const total = computed(() => draftTotal(props.year))
const lineCount = computed(() => budget.lines.filter((l) => l.year === props.year).length)
const approvedValue = computed(() => parseAmount(approved.value))
const gap = computed(() => (approved.value && Number.isFinite(approvedValue.value) ? approvedValue.value - total.value : null))

function lock() {
  if (!approved.value.trim() || !Number.isFinite(approvedValue.value)) { error.value = t('Enter the approved total signed by the Board.'); return }
  const res = lockYearAs(props.year, approvedValue.value)
  if (!res.ok) { error.value = t(res.message ?? 'The budget could not be locked.'); return }
  successToast(t(`${props.year} budget locked as Version 0`))
  emit('locked')
  emit('close')
}
</script>

<template>
  <BudgetLineDrawerShell :is-open="isOpen" :title="t(`Lock budget · ${year}`)" @close="emit('close')">
    <div class="blk-figures">
      <div class="blk-row">
        <span>{{ t('Lines in the draft') }}</span>
        <span class="blk-value">{{ lineCount }}</span>
      </div>
      <div class="blk-row">
        <span>{{ t('Draft total') }}</span>
        <span class="blk-value">{{ formatIDRWhole(total) }}</span>
      </div>
    </div>

    <MpFormControl id="blk-approved" is-required :is-invalid="!!error">
      <MpFormLabel>{{ t('Approved total (Rp)') }}</MpFormLabel>
      <MpInput id="blk-approved-input" v-model="approved" inputmode="numeric" is-full-width @update:model-value="error = ''" @keyup.enter="lock" />
      <MpFormErrorMessage v-if="error">{{ error }}</MpFormErrorMessage>
    </MpFormControl>

    <div v-if="gap !== null" class="blk-row blk-gap" :class="gap === 0 ? 'blk-gap--ok' : 'blk-gap--bad'">
      <span>{{ t('Gap') }}</span>
      <span class="blk-value">{{ gap === 0 ? t('Totals match') : formatIDRWhole(gap) }}</span>
    </div>

    <p class="blk-note">{{ t('Locking makes this budget Version 0 and turns the budget checks on for requests, orders and bills. After that, lines change only by revision or transfer.') }}</p>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" @click="lock">{{ t('Lock budget') }}</button>
    </template>
  </BudgetLineDrawerShell>
</template>

<style scoped>
.blk-figures { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.blk-row { display: flex; justify-content: space-between; align-items: center; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.blk-value { font-weight: var(--mp-font-weights-semi-bold); }
.blk-gap { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-radius: var(--mp-radii-md); }
.blk-gap--ok { background: var(--mp-colors-background-success); color: var(--mp-colors-text-success); }
.blk-gap--bad { background: var(--mp-colors-background-danger); color: var(--mp-text-danger); }
.blk-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
