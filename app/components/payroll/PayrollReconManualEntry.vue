<script setup lang="ts">
/**
 * A manual journal on a payroll account, recorded from the reconciliation (Ledger = payroll
 * journals + manual entries). Its memo becomes a suggested variance note that counts only
 * once a user confirms or edits it.
 */
import { MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpDatePicker, MpSegmentedControl } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import PayrollPayDrawer from '~/components/payroll/PayrollPayDrawer.vue'
import { payroll, accountLabel, lastDayOf } from '~/data/payrollStore'
import { payrollLedgerAccounts, offsetAccounts, recordManualEntry } from '~/data/payrollUiRecon'
import { toIso, fromIso } from '~/data/payrollUiPayables'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; month: string }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()
const { t } = useLocale()

const date = ref('')
const account = ref('')
const org = ref('')
const branch = ref('')
const side = ref<'debit' | 'credit'>('debit')
const amount = ref('')
const offset = ref('')
const memo = ref('')
const error = ref('')
watch(() => props.isOpen, (o) => {
  if (!o) return
  date.value = fromIso(lastDayOf(props.month)); account.value = ''; org.value = ''; branch.value = ''; side.value = 'debit'; amount.value = ''; offset.value = ''; memo.value = ''; error.value = ''
})
const accountOptions = computed(() => payrollLedgerAccounts.value.map((a) => ({ value: a.code, label: accountLabel(a.code) })))
const offsetOptions = computed(() => offsetAccounts.value.map((a) => ({ value: a.code, label: accountLabel(a.code) })))
const orgOptions = computed(() => payroll.tags.filter((x) => x.dimension === 'Organization').map((x) => x.name))
const branchOptions = computed(() => payroll.tags.filter((x) => x.dimension === 'Branch').map((x) => x.name))
const sideOptions = computed(() => [{ id: 'pme-d', label: t('Debit'), value: 'debit' }, { id: 'pme-c', label: t('Credit'), value: 'credit' }])

function save() {
  const r = recordManualEntry({ date: toIso(date.value), account: account.value, tags: { Organization: org.value || null, Branch: branch.value || null }, side: side.value, amount: Number(amount.value.replace(/[^\d]/g, '')), offset: offset.value, memo: memo.value })
  if (!r.ok) { error.value = r.message ?? ''; return }
  successToast(`${t('Manual entry posted as')} ${r.number as string}`)
  emit('update:isOpen', false)
}
</script>

<template>
  <PayrollPayDrawer :is-open="isOpen" :title="t('Record manual entry')" @update:is-open="(v: boolean) => emit('update:isOpen', v)">
    <MpFormControl id="pme-date" is-required>
      <MpFormLabel>{{ t('Date') }}</MpFormLabel>
      <MpDatePicker id="pme-date-input" v-model="date" format="DD/MM/YYYY" value-type="format" use-portal />
    </MpFormControl>
    <MpFormControl id="pme-account" is-required>
      <MpFormLabel>{{ t('Payroll account') }}</MpFormLabel>
      <ErpFilterSelect id="pme-account-select" :model-value="account" :placeholder="t('Select account')" :options="accountOptions" :is-clearable="false" width="100%" @update:model-value="(v: string) => (account = v)" />
    </MpFormControl>
    <div class="pme-pair">
      <MpFormControl id="pme-org">
        <MpFormLabel>{{ t('Organization tag') }}</MpFormLabel>
        <ErpFilterSelect id="pme-org-select" :model-value="org" :placeholder="t('No tag')" :options="orgOptions" width="100%" @update:model-value="(v: string) => (org = v)" />
      </MpFormControl>
      <MpFormControl id="pme-branch">
        <MpFormLabel>{{ t('Branch tag') }}</MpFormLabel>
        <ErpFilterSelect id="pme-branch-select" :model-value="branch" :placeholder="t('No tag')" :options="branchOptions" width="100%" @update:model-value="(v: string) => (branch = v)" />
      </MpFormControl>
    </div>
    <MpSegmentedControl id="pme-side" v-model="side" name="pme-side" :data="sideOptions" />
    <MpFormControl id="pme-amount" is-required>
      <MpFormLabel>{{ t('Amount') }}</MpFormLabel>
      <MpInput id="pme-amount-input" v-model="amount" autocomplete="off" />
    </MpFormControl>
    <MpFormControl id="pme-offset" is-required>
      <MpFormLabel>{{ t('Offset account') }}</MpFormLabel>
      <ErpFilterSelect id="pme-offset-select" :model-value="offset" :placeholder="t('Select account')" :options="offsetOptions" :is-clearable="false" width="100%" @update:model-value="(v: string) => (offset = v)" />
    </MpFormControl>
    <MpFormControl id="pme-memo" is-required :is-invalid="!!error">
      <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
      <MpInput id="pme-memo-input" v-model="memo" autocomplete="off" />
      <MpFormErrorMessage>{{ error }}</MpFormErrorMessage>
    </MpFormControl>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="emit('update:isOpen', false)">{{ t('Cancel') }}</MpButton>
      <MpButton is-rounded @click="save">{{ t('Post entry') }}</MpButton>
    </template>
  </PayrollPayDrawer>
</template>

<style scoped>
.pme-pair { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }
</style>
