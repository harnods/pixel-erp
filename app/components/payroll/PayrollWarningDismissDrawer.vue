<script setup lang="ts">
/**
 * Dismiss an early warning (TN-16): a reason of 10 characters or more; a transfer also needs
 * a pick, "Cost stays (accepted)" or "Post dimension reclass". Errors show inline; Dismiss stays clickable.
 */
import { MpTextarea, MpFormControl, MpFormLabel, MpFormErrorMessage, MpRadio } from '@mekari/pixel3'
import PayrollCompareDrawerShell from '~/components/payroll/PayrollCompareDrawerShell.vue'
import { dismissWarning, dateLabel, type EarlyWarning } from '~/data/payrollStore'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ runId: string; warning: EarlyWarning | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

type Pick = 'Cost stays (accepted)' | 'Post dimension reclass'
const PICKS: Pick[] = ['Cost stays (accepted)', 'Post dimension reclass']
const reason = ref('')
const pick = ref<Pick | ''>('')
const error = ref('')
const isTransfer = computed(() => props.warning?.type === 'talenta.employee.transfer.approved')

watch(() => props.warning, () => { reason.value = ''; pick.value = ''; error.value = '' })

function save() {
  const w = props.warning
  if (!w) return
  if (isTransfer.value && !pick.value) { error.value = t('Pick Cost stays (accepted) or Post dimension reclass.'); return }
  const r = dismissWarning(props.runId, w.id, reason.value, (pick.value || 'Cost stays (accepted)') as Pick)
  if (!r.ok) { error.value = t(r.message ?? 'The warning could not be dismissed.'); return }
  successToast(t('Warning dismissed'))
  emit('close')
}
</script>

<template>
  <PayrollCompareDrawerShell :is-open="!!warning" :title="t('Dismiss warning')" @close="emit('close')">
    <div v-if="warning" class="pwd__identity">
      {{ t(isTransfer ? 'Transfer' : 'Resignation') }} · {{ warning.employee_id }} · {{ t(`effective ${dateLabel(warning.effective)}`) }}
    </div>

    <MpFormControl v-if="isTransfer" id="pwd-pick" is-required>
      <MpFormLabel>{{ t('Outcome') }}</MpFormLabel>
      <div class="pwd__choices">
        <label v-for="p in PICKS" :key="p" class="pwd__choice">
          <MpRadio :id="`pwd-pick-${p === PICKS[0] ? 'stays' : 'reclass'}`" name="pwd-pick" :is-checked="pick === p" @change="pick = p; error = ''" />
          <span>{{ t(p) }}</span>
        </label>
      </div>
    </MpFormControl>

    <MpFormControl id="pwd-reason" is-required :is-invalid="!!error">
      <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
      <MpTextarea id="pwd-reason-input" v-model="reason" :rows="4" is-full-width @input="error = ''" />
      <MpFormErrorMessage v-if="error">{{ error }}</MpFormErrorMessage>
    </MpFormControl>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" data-testid="pwd-save" @click="save">{{ t('Dismiss warning') }}</button>
    </template>
  </PayrollCompareDrawerShell>
</template>

<style scoped>
.pwd__identity { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pwd__choices { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pwd__choice { display: flex; align-items: center; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
</style>
