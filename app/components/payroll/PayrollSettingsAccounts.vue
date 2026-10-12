<script setup lang="ts">
/**
 * Accounts (TS-03): the payroll account set with one party label per payable,
 * Hutang Gaji, the tax presets, and Create account with the code clash proposal and
 * "Use existing" for a same-name chart account.
 */
import { computed, reactive, ref } from 'vue'
import { MpButton, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollSettingsDrawer from '~/components/payroll/PayrollSettingsDrawer.vue'
import { successToast } from '~/utils/toasts'
import {
  payroll, can, setPayableParty, setTaxPreset, addPayrollAccount, accountLabel,
  type TaxPresets,
} from '~/data/payrollStore'
import { PAYABLE_PARTIES, type PayableParty, type PayrollAccountType } from '~/data/payrollMaster'
import { codeHolder, nextFreeCode, existingByName, mappingUses } from '~/data/payrollUiSettings'

const { t } = useLocale()

const TYPE_LABEL: Record<PayrollAccountType, string> = { expense: 'Expense', cogs: 'Cost of sales', liability: 'Liability', asset: 'Current asset', cash: 'Cash and bank' }
const TYPE_ORDER: PayrollAccountType[] = ['cogs', 'expense', 'liability', 'asset', 'cash']
const accounts = computed(() => [...payroll.accounts].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.code.localeCompare(b.code)))
const s = computed(() => payroll.settings)
const role = (code: string) => {
  if (code === s.value.hutangGaji) return 'Hutang Gaji'
  return null
}

const partyOptions = [{ value: 'none', label: 'No party' }, ...PAYABLE_PARTIES.map((p) => ({ value: p, label: p }))]
const partyErrors = reactive<Record<string, string>>({})
function onParty(code: string, v: string) {
  const r = setPayableParty(code, v === 'none' ? null : (v as PayableParty))
  partyErrors[code] = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t('Party label saved'))
}

// Tax presets (OD-24).
const PRESETS: { key: keyof TaxPresets; label: string }[] = [
  { key: 'pph21', label: 'PPh 21 payable' },
  { key: 'dtp', label: 'PPh 21 DTP' },
  { key: 'pph26', label: 'PPh 26 payable' },
  { key: 'resign', label: 'PPh 21 on severance' },
  { key: 'trueUp', label: 'December PPh 21 true-up' },
]
const presetOptions = computed(() => payroll.accounts.filter((a) => (a.type === 'liability' || a.type === 'asset') && !a.archived).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })))
const presetError = ref('')
function onPreset(key: keyof TaxPresets, code: string) {
  const r = setTaxPreset(key, code)
  presetError.value = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t('Tax preset saved'))
}

// ── Create account ──
const createOpen = ref(false)
const form = reactive({ code: '', name: '', type: 'liability' as PayrollAccountType, party: 'none' })
const formError = ref('')
const typeOptions = TYPE_ORDER.map((x) => ({ value: x, label: TYPE_LABEL[x] }))
const clash = computed(() => (form.code.trim() ? codeHolder(form.code) : null))
const proposed = computed(() => (clash.value ? nextFreeCode(form.code) : null))
const existing = computed(() => existingByName(form.name))
function openCreate() { Object.assign(form, { code: '', name: '', type: 'liability', party: 'none' }); formError.value = ''; createOpen.value = true }
function create(reused = false) {
  const body = reused && existing.value
    ? { code: existing.value.code, name: existing.value.name, type: existing.value.type ?? form.type, party: form.party === 'none' ? null : (form.party as PayableParty), reused: true }
    : { code: form.code, name: form.name, type: form.type, party: form.party === 'none' ? null : (form.party as PayableParty) }
  if (!reused && clash.value) { formError.value = t(`Code ${form.code.trim()} is used by ${clash.value}.`); return }
  const r = addPayrollAccount(body)
  if (!r.ok) { formError.value = t(r.message ?? ''); return }
  createOpen.value = false
  successToast(t(`${body.code} ${body.name} added to the payroll accounts`))
}
</script>

<template>
  <div class="pset-stack">
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Payroll accounts') }}</div>
          <div class="pset-card__sub">{{ t('Each payable carries one party. Two statutory parties never share a payable.') }}</div>
        </div>
        <div class="pset-card__actions">
          <MpButton v-if="can('settings.edit')" is-rounded left-icon="add" @click="openCreate">{{ t('New account') }}</MpButton>
        </div>
      </div>
      <table class="pset-table">
        <thead>
          <tr>
            <th class="pset-th">{{ t('Account') }}</th>
            <th class="pset-th">{{ t('Type') }}</th>
            <th class="pset-th">{{ t('Party') }}</th>
            <th class="pset-th">{{ t('Source') }}</th>
            <th class="pset-th pset-th--num">{{ t('Pay items') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in accounts" :key="a.code">
            <td class="pset-td">
              <span class="pset-td--strong">{{ a.code }} {{ a.name }}</span>
              <span v-if="role(a.code)" class="pset-line">{{ t(role(a.code)!) }}</span>
            </td>
            <td class="pset-td">{{ t(TYPE_LABEL[a.type]) }}</td>
            <td class="pset-td">
              <template v-if="a.type === 'liability'">
                <ErpFilterSelect v-if="can('settings.edit')" :id="`pset-party-${a.code}`" :model-value="a.party ?? 'none'" :placeholder="t('Party')" :options="partyOptions" width="220px" :is-clearable="false" @update:model-value="(v: string) => onParty(a.code, v)" />
                <span v-else>{{ a.party ?? t('No party') }}</span>
                <span v-if="partyErrors[a.code]" class="pset-line pset-danger">{{ partyErrors[a.code] }}</span>
              </template>
              <span v-else class="pset-muted">{{ t('Not a payable') }}</span>
            </td>
            <td class="pset-td">
              <ErpStatusBadge :status="a.reused ? 'completed' : 'draft'" :label="t(a.reused ? 'Existing account' : 'Payroll set')" :type="a.reused ? 'information' : 'announcement'" />
            </td>
            <td class="pset-td pset-td--num">{{ mappingUses(a.code) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Tax presets') }}</div>
          <div class="pset-card__sub">{{ t('PPh 21 DTP, PPh 26 and PPh 21 on severance leave PPh 21 payable for their own accounts.') }}</div>
        </div>
      </div>
      <div class="pset-card__body">
        <div class="pset-row">
          <div v-for="p in PRESETS" :key="p.key" class="pset-field">
            <span class="pset-label">{{ t(p.label) }}</span>
            <ErpFilterSelect v-if="can('presets.edit')" :id="`pset-preset-${p.key}`" :model-value="s.taxPresets[p.key]" :placeholder="t('Account')" :options="presetOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => onPreset(p.key, v)" />
            <span v-else>{{ accountLabel(s.taxPresets[p.key]) }}</span>
          </div>
        </div>
        <p v-if="presetError" class="pset-error">{{ presetError }}</p>
      </div>
    </div>

    <PayrollSettingsDrawer :is-open="createOpen" :title="t('New payroll account')" @close="createOpen = false">
      <div class="pset-field">
        <label class="pset-label" for="pset-acc-name">{{ t('Name') }}</label>
        <MpInput id="pset-acc-name" v-model="form.name" @update:model-value="formError = ''" />
      </div>
      <div v-if="existing" class="pset-note">
        <span>{{ t(`Use existing: ${existing.code} ${existing.name}. Jurnal links it instead of creating a duplicate.`) }}</span>
        <MpButton size="sm" variant="secondary" is-rounded @click="create(true)">{{ t('Use existing') }}</MpButton>
      </div>
      <div class="pset-field">
        <label class="pset-label" for="pset-acc-code">{{ t('Code') }}</label>
        <MpInput id="pset-acc-code" v-model="form.code" :is-invalid="!!clash" @update:model-value="formError = ''" />
      </div>
      <div v-if="clash" class="pset-note pset-note--warn">
        <span>{{ t(`Code ${form.code.trim()} is used by ${clash}.`) }}<template v-if="proposed"> {{ t(`Next free code: ${proposed}.`) }}</template></span>
        <MpButton v-if="proposed" size="sm" variant="secondary" is-rounded @click="form.code = proposed!">{{ t(`Use ${proposed}`) }}</MpButton>
      </div>
      <div class="pset-field">
        <span class="pset-label">{{ t('Type') }}</span>
        <ErpFilterSelect id="pset-acc-type" v-model="form.type" :placeholder="t('Type')" :options="typeOptions" width="100%" :is-clearable="false" />
      </div>
      <div v-if="form.type === 'liability'" class="pset-field">
        <span class="pset-label">{{ t('Party') }}</span>
        <ErpFilterSelect id="pset-acc-party" v-model="form.party" :placeholder="t('Party')" :options="partyOptions" width="100%" :is-clearable="false" />
      </div>
      <p v-if="formError" class="pset-error">{{ formError }}</p>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="createOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded @click="create(false)">{{ t('Create account') }}</MpButton>
      </template>
    </PayrollSettingsDrawer>
  </div>
</template>
