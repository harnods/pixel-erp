<script setup lang="ts">
/**
 * Pay items: payable accounts per party on top, then one row per Talenta pay item with its one
 * Jurnal account. A cost item (allowance, benefit) has its own account and a toggle: Use group
 * account (each staff's group account, else Everyone else, see Groups; the own account is greyed
 * out) or Use default account (its own account for everyone). A deduction or tax item takes its payable.
 * The type is Talenta's and read-only; "Owed to" follows it. Items with no account come first:
 * they hold the run.
 */
import { computed, reactive, ref } from 'vue'
import { MpIcon, MpToggle, MpTooltip } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { sectionLabel } from '~/data/payrollUiRunCopy'
import { successToast } from '~/utils/toasts'
import {
  payroll, can, accountLabel, payItemType, isCostItem, payItemAccount, payItemParty, setPayItemAccount,
  setPayableAccount, useChartAccount, payrollAccount,
  type PayItemMapping, type PayItemType,
  setTaxAccount, TAX_ACCOUNT_LABEL, type TaxAccountKind, payItemOwnAccount, setCostUsesGroup,
} from '~/data/payrollStore'
import { PAYABLE_PARTIES, type PayableParty, type PayrollAccountType } from '~/data/payrollMaster'
import {
  accountChoices, type AccountOption, payItemPinned, setCostAccount, payItemNeedsAccount,
} from '~/data/payrollUiSettings'
import { PARTY_LABEL } from '~/data/payrollUiPay'

const { t } = useLocale()

const TYPE_ORDER: PayItemType[] = ['allowance', 'benefit', 'deduction', 'tax']

const needsAccount = (m: PayItemMapping) => payItemNeedsAccount(m)
const rows = computed(() => [...payroll.settings.mapping].sort((a, b) =>
  Number(needsAccount(b)) - Number(needsAccount(a))
  || TYPE_ORDER.indexOf(payItemType(a)) - TYPE_ORDER.indexOf(payItemType(b))
  || a.name.localeCompare(b.name)))
const openCount = computed(() => payroll.settings.mapping.filter(needsAccount).length)
/** The first set-up cost item carries the tour marker on its account cell. */
const firstCostKey = computed(() => rows.value.find((m) => isCostItem(m) && !needsAccount(m))?.key ?? null)

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
/** A cost item uses the group account while it is not pinned to its own account. */
const usesGroup = (m: PayItemMapping) => isCostItem(m) && !payItemPinned(m)
/** The select's value: a cost item's own account (shown greyed out while it uses the group account), else the row account. */
function selected(m: PayItemMapping): string {
  if (isCostItem(m) && m.roleConfirmed && m.role) return payItemOwnAccount(m) ?? ''
  return needsAccount(m) ? '' : (payItemAccount(m) ?? '')
}
function readLabel(m: PayItemMapping): string {
  if (needsAccount(m)) return t('No account yet')
  if (isCostItem(m)) return accountLabel(payItemOwnAccount(m))
  return accountLabel(payItemAccount(m))
}
function onAccount(m: PayItemMapping, code: string) {
  if (!code || code === selected(m)) return
  adopt(code, optionsFor(m))
  const r = isCostItem(m) && m.roleConfirmed && m.role ? setCostAccount(m.key, code) : setPayItemAccount(m.key, code)
  rowErrors[m.key] = r.ok ? '' : t(r.message ?? 'Not saved. Pick another account.')
  if (r.ok) successToast(t(`${m.name} now posts to ${accountLabel(code)}`))
}
function onToggle(m: PayItemMapping, on: boolean) {
  const r = setCostUsesGroup(m.key, on)
  rowErrors[m.key] = r.ok ? '' : t(r.message ?? 'Not saved. Try again.')
  if (r.ok) successToast(t(on ? `${m.name} now uses the group account` : `${m.name} now uses its default account for every group`))
}
function partyLabel(m: PayItemMapping) {
  const p = payItemParty(m)
  return p ? t(PARTY_LABEL[p]) : t('Company keeps it')
}
const ACCOUNT_TIP = 'Use group account: staff post to their group\'s expense account, or Everyone else (see Groups). Use default account: everyone posts to the account shown.'
const TYPE_TIP = 'From Talenta: the payslip section the item sits in (allowance, deduction or benefit). Tax items are found by name. Change it in Talenta.'

// ── Payable accounts per party ──
const payables = computed(() => PAYABLE_PARTIES.map((p) => ({ party: p, label: PARTY_LABEL[p], code: payroll.settings.payables[p] })))
const payableError = ref('')
function onPayable(party: PayableParty, code: string) {
  if (!code || code === payroll.settings.payables[party]) return
  adopt(code, liabilityOptions.value)
  const r = setPayableAccount(party, code)
  payableError.value = r.ok ? '' : t(r.message ?? 'Not saved. Pick a liability account.')
  if (r.ok) successToast(t(`Payable account for ${PARTY_LABEL[party]} saved`))
}
// OQ19: the two tax accounts that are not a party's payable sit in the same card.
const taxAccounts = computed(() => (['dtp', 'resign'] as TaxAccountKind[]).map((k) => ({ kind: k, label: TAX_ACCOUNT_LABEL[k], code: payroll.settings.taxPresets[k] })))
function onTaxAccount(kind: TaxAccountKind, code: string) {
  if (!code || code === payroll.settings.taxPresets[kind]) return
  adopt(code, kind === 'dtp' ? balanceOptions.value : liabilityOptions.value)
  const r = setTaxAccount(kind, code)
  payableError.value = r.ok ? '' : t(r.message ?? 'Not saved. Pick a liability account.')
  if (r.ok) successToast(t(`${TAX_ACCOUNT_LABEL[kind]} account saved`))
}

</script>

<template>
  <div class="pset-stack">

    <!-- Payable accounts -->
    <div class="pset-card" data-tour="payroll-payable-accounts">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Payable accounts') }}</div>
          <div class="pset-card__sub">{{ t('Where Jurnal keeps what each party is still owed until it is paid.') }}</div>
        </div>
      </div>
      <div class="pset-card__body">
        <div class="pset-payables">
          <div v-for="p in payables" :key="p.party" class="pset-field">
            <label class="pset-label" :for="`pset-payable-${p.party.replace(/\s+/g, '-')}`">{{ t(p.label) }}</label>
            <ErpFilterSelect v-if="can('setup')" :id="`pset-payable-${p.party.replace(/\s+/g, '-')}`" :model-value="p.code" :placeholder="t('Select account')" :options="liabilityOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => onPayable(p.party, v)" />
            <span v-else class="pset-form__value">{{ accountLabel(p.code) }}</span>
          </div>
          <div v-for="x in taxAccounts" :key="x.kind" class="pset-field">
            <label class="pset-label" :for="`pset-tax-${x.kind}`">{{ t(x.label) }}</label>
            <ErpFilterSelect v-if="can('setup')" :id="`pset-tax-${x.kind}`" :model-value="x.code" :placeholder="t('Select account')" :options="x.kind === 'dtp' ? balanceOptions : liabilityOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => onTaxAccount(x.kind, v)" />
            <span v-else class="pset-form__value">{{ accountLabel(x.code) }}</span>
          </div>
        </div>
        <p v-if="payableError" class="pset-error">{{ payableError }}</p>
      </div>
    </div>

    <!-- Pay item mapping -->
    <div class="pset-card" data-tour="payroll-payitems">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Pay items') }}</div>
          <div class="pset-card__sub">{{ t('Each line on the payslip Talenta sends posts to one account. An item with no account holds the run.') }}</div>
        </div>
        <ErpStatusBadge v-if="openCount" status="needs-account" :label="t(`${openCount} need${openCount > 1 ? '' : 's'} an account`)" type="critical" />
      </div>
      <table class="pset-table pset-pi">
        <colgroup>
          <col class="pset-pi__name"><col class="pset-pi__type"><col class="pset-pi__acct"><col class="pset-pi__party">
        </colgroup>
        <thead>
          <tr>
            <th class="pset-th">{{ t('Pay item') }}</th>
            <th class="pset-th">
              <span class="pset-th__tip" data-tour="payroll-type-tip">{{ t('Type') }}
                <MpTooltip id="pset-type-tip" :label="t(TYPE_TIP)" placement="top" use-portal>
                  <span class="pset-th__icon" data-testid="pset-type-tip" tabindex="0" :aria-label="t(TYPE_TIP)"><MpIcon name="info" size="sm" /></span>
                </MpTooltip>
              </span>
            </th>
            <th class="pset-th">
              <span class="pset-th__tip">{{ t('Account') }}
                <MpTooltip id="pset-account-tip" :label="t(ACCOUNT_TIP)" placement="top" use-portal>
                  <span class="pset-th__icon" data-testid="pset-account-tip" tabindex="0" :aria-label="t(ACCOUNT_TIP)"><MpIcon name="info" size="sm" /></span>
                </MpTooltip>
              </span>
            </th>
            <th class="pset-th">{{ t('Owed to') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="m in rows" :key="m.key">
            <tr :data-pay-item="m.name">
              <td class="pset-td">
                <span>{{ m.name }}</span>
                <span v-if="needsAccount(m)" class="pset-chip"><ErpStatusBadge status="needs-account" :label="t('Needs account')" type="critical" /></span>
              </td>
              <td class="pset-td">{{ t(sectionLabel(payItemType(m))) }}</td>
              <td class="pset-td pset-pi__cell">
                <!-- A set-up cost item's cell keeps the .pset-gcc hook and the tour marker (PAY-1 step 6). -->
                <div
                  :class="{ 'pset-gcc': isCostItem(m) && !needsAccount(m) }"
                  :data-cost-account="isCostItem(m) && !needsAccount(m) ? (payItemPinned(m) ? 'pinned' : 'groups') : undefined"
                  :data-tour="m.key === firstCostKey ? 'payroll-groups-can-change' : undefined"
                >
                  <div :class="{ 'pset-acct--off': usesGroup(m) && !needsAccount(m) }">
                    <ErpFilterSelect v-if="can('setup')" :id="`pset-acct-${m.key.replace(/[^a-zA-Z0-9]/g, '-')}`" :model-value="selected(m)" :placeholder="t('Select account')" :options="optionsFor(m)" width="100%" :is-clearable="false" :is-disabled="usesGroup(m) && !needsAccount(m)" @update:model-value="(v: string) => onAccount(m, v)" />
                    <span v-else>{{ readLabel(m) }}</span>
                  </div>
                  <div v-if="isCostItem(m) && !needsAccount(m)" class="pset-toggle">
                    <MpToggle v-if="can('setup')" :id="`pset-gcc-${m.key.replace(/[^a-zA-Z0-9]/g, '-')}`" :is-checked="usesGroup(m)" :aria-label="t('Use group account')" @update:is-checked="(v: boolean) => onToggle(m, v)" />
                    <span class="pset-toggle__label">{{ t(usesGroup(m) ? 'Use group account' : 'Use default account') }}</span>
                  </div>
                </div>
                <span v-if="rowErrors[m.key]" class="pset-line pset-danger">{{ rowErrors[m.key] }}</span>
              </td>
              <td class="pset-td">{{ partyLabel(m) }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pset-payables :deep(.efs), .pset-payables :deep(.efs-trigger) { display: flex; width: 100%; }
/* 3 columns only where each select fits its longest account name (BPJS Ketenagakerjaan Payable); 2 below. */
.pset-payables { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--mp-spacing-4) var(--mp-spacing-5); }
.pset-pi { table-layout: fixed; }
.pset-pi__name { width: 28%; }
.pset-pi__type { width: 13%; }
.pset-pi__acct { width: 37%; }
.pset-pi__party { width: 22%; }
.pset-pi .pset-td { vertical-align: middle; }
.pset-chip { display: inline-block; margin-left: var(--mp-spacing-2); vertical-align: middle; }
.pset-th__tip { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.pset-th__icon { display: inline-flex; color: var(--mp-text-secondary); cursor: help; }
.pset-pi__cell :deep(.efs) { display: block; width: 100%; }
.pset-pi__cell :deep(.efs-trigger) { width: 100%; }
.pset-acct--off { opacity: 0.5; }
.pset-toggle { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }
.pset-toggle__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
