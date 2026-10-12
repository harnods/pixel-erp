<script setup lang="ts">
/**
 * Pay items: one row per Talenta pay item with its one Jurnal account. A cost item (allowance,
 * benefit) takes any expense or COGS account and may split by group ("For Sales use Sales
 * Salaries") or carry a fixed dimension value; a deduction or tax item takes its payable. The
 * "Owed to" column follows the type. Payable accounts per party sit above the table. Unmapped
 * items come first: they hold the run.
 */
import { computed, reactive, ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { successToast } from '~/utils/toasts'
import {
  payroll, can, accountLabel, payItemType, isCostItem, payItemAccount, payItemParty, setPayItemAccount, setPayItemSplit,
  setPayableAccount, useChartAccount, payrollAccount, payrollDimensions,
  type PayItemMapping, type PayItemType, type GroupAccount,
} from '~/data/payrollStore'
import { PAYABLE_PARTIES, TALENTA_FIELDS, type PayableParty, type PayrollAccountType, type TalentaField } from '~/data/payrollMaster'
import { accountChoices, valuesSeen, fieldSent, type AccountOption } from '~/data/payrollUiSettings'
import { PARTY_LABEL } from '~/data/payrollUiPay'

const { t } = useLocale()

const TYPE_LABEL: Record<PayItemType, string> = { allowance: 'Allowance', deduction: 'Deduction', benefit: 'Benefit', tax: 'Tax' }
const TYPE_ORDER: PayItemType[] = ['allowance', 'benefit', 'deduction', 'tax']

const needsAccount = (m: PayItemMapping) => !m.roleConfirmed || !m.role || !m.debit || !m.credit
const rows = computed(() => [...payroll.settings.mapping].sort((a, b) =>
  Number(needsAccount(b)) - Number(needsAccount(a))
  || TYPE_ORDER.indexOf(payItemType(a)) - TYPE_ORDER.indexOf(payItemType(b))
  || a.name.localeCompare(b.name)))
const openCount = computed(() => payroll.settings.mapping.filter(needsAccount).length)

// ── Account choices: any expense or COGS account for cost items, payables for the rest ──
const COST: PayrollAccountType[] = ['expense', 'cogs']
const costOptions = computed(() => accountChoices(COST))
const balanceOptions = computed(() => accountChoices(['liability', 'asset']))
const liabilityOptions = computed(() => accountChoices(['liability']))
function optionsFor(m: PayItemMapping) {
  if (isCostItem(m)) return costOptions.value
  return payItemType(m) === 'tax' ? liabilityOptions.value : balanceOptions.value
}
function adopt(code: string, list: AccountOption[]) {
  const o = list.find((x) => x.value === code)
  if (o && !payrollAccount(code)) useChartAccount({ code: o.value, name: o.name, type: o.type })
}
const rowErrors = reactive<Record<string, string>>({})
function onAccount(m: PayItemMapping, code: string) {
  if (!code || code === payItemAccount(m)) return
  adopt(code, optionsFor(m))
  const r = setPayItemAccount(m.key, code)
  rowErrors[m.key] = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t(`${m.name} now posts to ${accountLabel(code)}`))
}
function partyLabel(m: PayItemMapping) {
  const p = payItemParty(m)
  return p ? t(PARTY_LABEL[p]) : t('None')
}
function splitSummary(m: PayItemMapping) {
  const parts: string[] = []
  const n = m.groupAccounts?.length ?? 0
  if (n) parts.push(t(`${n} group account${n > 1 ? 's' : ''}`))
  if (m.fixedTag) parts.push(`${m.fixedTag.dimension}: ${m.fixedTag.value}`)
  return parts.join(' · ')
}

// ── Payable accounts per party ──
const payables = computed(() => PAYABLE_PARTIES.map((p) => ({ party: p, label: PARTY_LABEL[p], code: payroll.settings.payables[p] })))
const payableError = ref('')
function onPayable(party: PayableParty, code: string) {
  if (!code || code === payroll.settings.payables[party]) return
  adopt(code, liabilityOptions.value)
  const r = setPayableAccount(party, code)
  payableError.value = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t(`Payable account for ${PARTY_LABEL[party]} saved`))
}

// ── Split a cost item: group accounts and a fixed dimension value ──
const openKey = ref<string | null>(null)
const ed = reactive<{ lines: GroupAccount[]; dim: string; value: string; error: string }>({ lines: [], dim: '', value: '', error: '' })
function toggle(m: PayItemMapping) {
  if (openKey.value === m.key) { openKey.value = null; return }
  openKey.value = m.key
  Object.assign(ed, { lines: (m.groupAccounts ?? []).map((g) => ({ ...g })), dim: m.fixedTag?.dimension ?? '', value: m.fixedTag?.value ?? '', error: '' })
}
const groupFields = computed(() => TALENTA_FIELDS.filter((f) => fieldSent(f.field)).map((f) => ({ value: f.field, label: f.label })))
const valueOptions = (field: string) => valuesSeen(field).map((v) => ({ value: v, label: v }))
const dimOptions = computed(() => [{ value: '', label: t('None') }, ...payrollDimensions().map((d) => ({ value: d, label: d }))])
const dimValueOptions = computed(() => payroll.tags.filter((x) => x.dimension === ed.dim).map((x) => ({ value: x.name, label: x.name })))
function addLine() { ed.lines.push({ field: 'organization_name', value: '', account: '' }); ed.error = '' }
function saveSplit(m: PayItemMapping) {
  for (const l of ed.lines) adopt(l.account, costOptions.value)
  const r = setPayItemSplit(m.key, { groupAccounts: ed.lines, fixedTag: ed.dim && ed.value ? { dimension: ed.dim, value: ed.value } : null })
  if (!r.ok) { ed.error = t(r.message ?? ''); return }
  openKey.value = null
  successToast(t(`${m.name} split saved`))
}
</script>

<template>
  <div class="pset-stack">
    <!-- Payable accounts -->
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Payable accounts') }}</div>
          <div class="pset-card__sub">{{ t('The account that holds what is still owed to each party until it is paid.') }}</div>
        </div>
      </div>
      <div class="pset-card__body">
        <div class="pset-payables">
          <div v-for="p in payables" :key="p.party" class="pset-field">
            <label class="pset-label" :for="`pset-payable-${p.party.replace(/\s+/g, '-')}`">{{ t(p.label) }}</label>
            <ErpFilterSelect v-if="can('setup')" :id="`pset-payable-${p.party.replace(/\s+/g, '-')}`" :model-value="p.code" :placeholder="t('Select account')" :options="liabilityOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => onPayable(p.party, v)" />
            <span v-else class="pset-form__value">{{ accountLabel(p.code) }}</span>
          </div>
        </div>
        <p v-if="payableError" class="pset-error">{{ payableError }}</p>
      </div>
    </div>

    <!-- Pay item mapping -->
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Pay items') }}</div>
          <div class="pset-card__sub">{{ t('Each line on the payslip Talenta sends posts to one account. Items without an account hold the run.') }}</div>
        </div>
        <ErpStatusBadge v-if="openCount" status="needs-account" :label="t(`${openCount} need${openCount > 1 ? '' : 's'} an account`)" type="critical" />
      </div>
      <table class="pset-table pset-pi">
        <colgroup>
          <col class="pset-pi__name"><col class="pset-pi__type"><col class="pset-pi__acct"><col class="pset-pi__party"><col class="pset-pi__act">
        </colgroup>
        <thead>
          <tr>
            <th class="pset-th">{{ t('Pay item') }}</th>
            <th class="pset-th">{{ t('Type') }}</th>
            <th class="pset-th">{{ t('Account') }}</th>
            <th class="pset-th">{{ t('Owed to') }}</th>
            <th class="pset-th" />
          </tr>
        </thead>
        <tbody>
          <template v-for="m in rows" :key="m.key">
            <tr :data-pay-item="m.name">
              <td class="pset-td">
                <span>{{ m.name }}</span>
                <span v-if="needsAccount(m)" class="pset-chip"><ErpStatusBadge status="needs-account" :label="t('Needs account')" type="critical" /></span>
              </td>
              <td class="pset-td">{{ t(TYPE_LABEL[payItemType(m)]) }}</td>
              <td class="pset-td pset-pi__cell">
                <ErpFilterSelect v-if="can('setup')" :id="`pset-acct-${m.key.replace(/[^a-zA-Z0-9]/g, '-')}`" :model-value="needsAccount(m) ? '' : (payItemAccount(m) ?? '')" :placeholder="t('Select account')" :options="optionsFor(m)" width="100%" :is-clearable="false" @update:model-value="(v: string) => onAccount(m, v)" />
                <span v-else>{{ needsAccount(m) ? '' : accountLabel(payItemAccount(m)) }}</span>
                <span v-if="splitSummary(m)" class="pset-line">{{ splitSummary(m) }}</span>
                <span v-if="rowErrors[m.key]" class="pset-line pset-danger">{{ rowErrors[m.key] }}</span>
              </td>
              <td class="pset-td">{{ partyLabel(m) }}</td>
              <td class="pset-td pset-td--act">
                <MpButton v-if="isCostItem(m) && !needsAccount(m) && (can('setup') || splitSummary(m))" size="sm" variant="ghost" is-rounded :right-icon="openKey === m.key ? 'chevrons-up' : 'chevrons-down'" @click="toggle(m)">{{ t('Split') }}</MpButton>
              </td>
            </tr>
            <tr v-if="openKey === m.key" class="pset-pi__split">
              <td class="pset-td" colspan="5">
                <div class="pset-split">
                  <div class="pset-split__head">
                    <span class="pset-label">{{ t('Account by group') }}</span>
                    <span class="pset-hint">{{ t('Post staff in one group to a different account.') }}</span>
                  </div>
                  <div v-for="(l, i) in ed.lines" :key="i" class="pset-split__row">
                    <span class="pset-split__word">{{ t('For') }}</span>
                    <ErpFilterSelect :id="`pset-split-field-${i}`" :model-value="l.field" :placeholder="t('Group by')" :options="groupFields" width="160px" :is-clearable="false" :is-disabled="!can('setup')" @update:model-value="(v: string) => { l.field = v as TalentaField; l.value = '' }" />
                    <ErpFilterSelect :id="`pset-split-value-${i}`" v-model="l.value" :placeholder="t('Value')" :options="valueOptions(l.field)" width="200px" :is-clearable="false" :is-disabled="!can('setup')" />
                    <span class="pset-split__word">{{ t('use') }}</span>
                    <ErpFilterSelect :id="`pset-split-acct-${i}`" v-model="l.account" :placeholder="t('Select account')" :options="costOptions" width="260px" :is-clearable="false" :is-disabled="!can('setup')" />
                    <MpButton v-if="can('setup')" size="sm" variant="ghost" is-rounded @click="ed.lines.splice(i, 1)">{{ t('Remove') }}</MpButton>
                  </div>
                  <div v-if="can('setup')"><MpButton size="sm" variant="secondary" is-rounded left-icon="add" @click="addLine">{{ t('Add group account') }}</MpButton></div>
                  <div class="pset-split__head">
                    <span class="pset-label">{{ t('Same dimension on every line') }}</span>
                    <span class="pset-hint">{{ t('Optional. Every cost line of this pay item gets this dimension value.') }}</span>
                  </div>
                  <div class="pset-split__row">
                    <ErpFilterSelect id="pset-split-dim" :model-value="ed.dim" :placeholder="t('Dimension')" :options="dimOptions" width="160px" :is-clearable="false" :is-disabled="!can('setup')" @update:model-value="(v: string) => { ed.dim = v; ed.value = '' }" />
                    <ErpFilterSelect v-if="ed.dim" id="pset-split-dimvalue" v-model="ed.value" :placeholder="t('Value')" :options="dimValueOptions" width="200px" :is-clearable="false" :is-disabled="!can('setup')" />
                  </div>
                  <p v-if="ed.error" class="pset-error">{{ ed.error }}</p>
                  <div v-if="can('setup')" class="pset-split__foot">
                    <MpButton size="sm" variant="ghost" is-rounded @click="openKey = null">{{ t('Cancel') }}</MpButton>
                    <MpButton size="sm" is-rounded @click="saveSplit(m)">{{ t('Save split') }}</MpButton>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pset-payables :deep(.efs), .pset-payables :deep(.efs-trigger) { display: flex; width: 100%; }
.pset-payables { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-4) var(--mp-spacing-5); }
.pset-pi { table-layout: fixed; }
.pset-pi__name { width: 26%; }
.pset-pi__type { width: 11%; }
.pset-pi__acct { width: 33%; }
.pset-pi__party { width: 20%; }
.pset-pi__act { width: 10%; }
.pset-pi .pset-td { vertical-align: middle; }
.pset-chip { display: inline-block; margin-left: var(--mp-spacing-2); vertical-align: middle; }
.pset-pi__split .pset-td { background: var(--mp-background-neutral-subtle); }
.pset-split { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.pset-split__row { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pset-split__word { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); min-width: 28px; }
.pset-split__head { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.pset-split__head + .pset-split__row { margin-top: calc(-1 * var(--mp-spacing-1)); }
.pset-split__foot { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); }
.pset-pi__cell :deep(.efs) { display: block; width: 100%; }
.pset-pi__cell :deep(.efs-trigger) { width: 100%; }
</style>
