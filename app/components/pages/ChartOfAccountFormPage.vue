<!-- prod-parity: jurnal-frontend-app/src/pages/accounts/new_and_edit/index.vue -->
<script setup lang="ts">
/**
 * Create / edit account (/chart-of-accounts/new, /chart-of-accounts/:id/edit).
 * Fields as prod: Account name · Account code · Account category · Currency (cash &
 * bank / credit card) · Set this account a part of another account (sub-account of /
 * header account of) · Bank name + Bank account number (cash & bank) · Tax ·
 * Description · Account access. Save / Save & add new; saved accounts persist
 * (chartOfAccounts.ts → persist.ts).
 */
import {
  MpButton, MpCheckbox, MpFormControl, MpFormErrorMessage, MpFormLabel, MpIcon, MpInput, MpRadio, MpTextarea, MpTooltip,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import UnsavedChangesModal from '~/components/patterns/UnsavedChangesModal.vue'
import { infoToast, successToast } from '~/utils/toasts'
import { banks } from '~/data/banks'
import { companyTaxes } from '~/data/companyTaxes'
import { currencyLists } from '~/data/currencyList'
import { accessUsers, accessRoles } from '~/data/accessControl'
import {
  ACCOUNT_CATEGORIES, CASH_AND_BANK, CREDIT_CARD, coaRecords, getAccount, isHeader, descendantsOf, hasTransactions,
  isNameTaken, isCodeTaken, createAccount, updateAccount, accountOptionLabel,
} from '~/data/chartOfAccounts'

const props = defineProps<{ orderId?: string }>()
const { t } = useLocale()
const router = useRouter()

const MAX = 255
const editingId = computed(() => (props.orderId && props.orderId !== 'new' ? decodeURIComponent(props.orderId) : ''))
const editing = computed(() => (editingId.value ? getAccount(editingId.value) : undefined))
const isEdit = computed(() => !!editingId.value)
const isLocked = computed(() => !!editing.value && hasTransactions(editing.value))
const isEditHeader = computed(() => !!editing.value && isHeader(editing.value.id))

// ── Form state ──
function blank() {
  return {
    name: '', code: '', categoryId: String(CASH_AND_BANK), currency: 'IDR', parentId: '', childIds: [] as string[],
    bankName: '', bankAccountNo: '', tax: '', description: '', access: 'all' as 'all' | 'user' | 'customrole', users: [] as string[], roles: [] as string[],
  }
}
const form = reactive(blank())
const partOfAnother = ref(false)
const anotherType = ref<'sub-account' | 'header-account'>('sub-account')
const errors = reactive<Record<string, string>>({})
let initial = ''

function load() {
  Object.assign(form, blank())
  partOfAnother.value = false
  anotherType.value = 'sub-account'
  const a = editing.value
  if (a) {
    Object.assign(form, {
      name: a.name, code: a.code, categoryId: String(a.categoryId), currency: a.currency, parentId: a.parentId ?? '',
      bankName: a.bankName ?? '', bankAccountNo: a.bankAccountNo ?? '', tax: a.tax ?? '', description: a.description ?? '',
    })
  }
  Object.keys(errors).forEach(k => delete errors[k])
  initial = JSON.stringify(form)
}
watch(editingId, load, { immediate: true })

const categoryId = computed(() => Number(form.categoryId))
const isCashAndBank = computed(() => categoryId.value === CASH_AND_BANK)
const isCreditCardOrCash = computed(() => categoryId.value === CASH_AND_BANK || categoryId.value === CREDIT_CARD)
const asHeader = computed(() => partOfAnother.value && anotherType.value === 'header-account')

// ── Options ──
const categoryOptions = ACCOUNT_CATEGORIES.map(c => ({ value: String(c.id), label: t(c.name) }))
const currencyOptions = computed(() => ['IDR', ...currencyLists.map(c => c.code)].map(c => ({ value: c, label: c })))
const bankOptions = banks.map(b => ({ value: b, label: b }))
const taxOptions = computed(() => companyTaxes.map(x => ({ value: x.name, label: x.name })))
/** Header candidates: same category, not this account or its own sub-accounts. */
const headerOptions = computed(() => {
  const exclude = new Set([editingId.value, ...(editing.value ? descendantsOf(editing.value.id).map(d => d.id) : [])])
  return coaRecords
    .filter(a => a.categoryId === categoryId.value && !exclude.has(a.id) && !a.archived)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map(a => ({ value: a.id, label: accountOptionLabel(a) }))
})
/** Child candidates (create as header): same category, standalone accounts. */
const childCandidates = computed(() => coaRecords
  .filter(a => a.categoryId === categoryId.value && !a.parentId && !a.archived)
  .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })))
const childLabels = computed(() => childCandidates.value.map(a => accountOptionLabel(a)))
const childLabelModel = computed({
  get: () => form.childIds.map(id => accountOptionLabel(getAccount(id)!)).filter(Boolean),
  set: (labels: string[]) => { form.childIds = childCandidates.value.filter(a => labels.includes(accountOptionLabel(a))).map(a => a.id); delete errors.asParent },
})
const userNames = accessUsers.map(u => u.name)

watch(() => form.categoryId, () => {
  form.parentId = editing.value?.categoryId === categoryId.value ? (editing.value?.parentId ?? '') : ''
  form.childIds = []
  if (!isCreditCardOrCash.value) form.currency = 'IDR'
})

// ── Save ──
function validate(): boolean {
  Object.keys(errors).forEach(k => delete errors[k])
  if (!form.name.trim()) errors.name = t('Account name cannot be empty')
  else if (isNameTaken(form.name, editingId.value || undefined)) errors.name = t('Account name is already used')
  if (isCodeTaken(form.code, editingId.value || undefined)) errors.code = t('Account code is already used')
  if (!isEdit.value && partOfAnother.value) {
    if (anotherType.value === 'sub-account' && !form.parentId) errors.asChild = t('You have to select an account')
    if (anotherType.value === 'header-account' && !form.childIds.length) errors.asParent = t('You have to select an account')
  }
  if (form.access === 'user' && !form.users.length) errors.users = t('You must select user')
  if (form.access === 'customrole' && !form.roles.length) errors.roles = t('You must select role')
  return !Object.keys(errors).length
}

function payload() {
  const sub = isEdit.value ? !!form.parentId : partOfAnother.value && anotherType.value === 'sub-account'
  return {
    name: form.name.trim(), code: form.code.trim(), categoryId: categoryId.value,
    currency: isCreditCardOrCash.value ? form.currency : 'IDR',
    parentId: sub ? form.parentId || undefined : undefined,
    bankName: isCashAndBank.value && !asHeader.value ? form.bankName || undefined : undefined,
    bankAccountNo: isCashAndBank.value && !asHeader.value && form.bankName ? form.bankAccountNo || undefined : undefined,
    tax: !asHeader.value ? form.tax || undefined : undefined,
    description: form.description.trim() || undefined,
  }
}

const saving = ref(false)
async function save(addNew = false) {
  if (!validate()) return
  saving.value = true
  await new Promise(r => setTimeout(r, 300))
  if (isEdit.value && editing.value) {
    updateAccount(editing.value.id, payload())
    successToast(t('Account changes saved'))
    saving.value = false
    initial = JSON.stringify(form)
    router.push(`/chart-of-accounts/${encodeURIComponent(editing.value.id)}`)
    return
  }
  const rec = createAccount(payload(), asHeader.value ? form.childIds : [])
  successToast(`${rec.name} ${t('saved')}`)
  saving.value = false
  initial = JSON.stringify(form)
  if (addNew) { load(); return }
  router.push(`/chart-of-accounts/${encodeURIComponent(rec.id)}`)
}

// ── Leave guard ──
const leaveOpen = ref(false)
function cancel() {
  if (JSON.stringify(form) !== initial) { leaveOpen.value = true; return }
  leave()
}
function leave() {
  leaveOpen.value = false
  if (editing.value) router.push(`/chart-of-accounts/${encodeURIComponent(editing.value.id)}`)
  else router.push('/chart-of-accounts')
}
</script>

<template>
  <div class="cof-page">
    <div class="cof-titlebar">
      <div class="cof-titlebar-left">
        <MpButton variant="ghost" is-rounded class="cof-breadcrumb" @click="router.push('/chart-of-accounts')">{{ t('Chart of accounts') }}</MpButton>
        <h1 class="cof-title">{{ isEdit ? t('Edit account') : t('Add new account') }}</h1>
      </div>
      <MpButton variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Guide article') }}</MpButton>
    </div>

    <div class="cof-stage">
      <p v-if="isEdit && !editing" class="cof-missing">{{ t('Account not found') }}</p>
      <div v-else class="cof-form">
        <section class="cof-section">
          <h2 class="cof-section-title">{{ t('Account information') }}</h2>

          <div class="cof-fields">
            <div class="cof-row">
              <MpFormControl id="cof-name" class="cof-col" is-required :is-invalid="!!errors.name">
                <div class="cof-label-row">
                  <MpFormLabel>{{ t('Account name') }}</MpFormLabel>
                  <span class="cof-counter">{{ form.name.length }}/{{ MAX }}</span>
                </div>
                <MpInput id="cof-name-input" v-model="form.name" :maxlength="MAX" @update:model-value="delete errors.name" />
                <MpFormErrorMessage>{{ errors.name }}</MpFormErrorMessage>
              </MpFormControl>
              <MpFormControl id="cof-code" class="cof-col" :is-invalid="!!errors.code">
                <div class="cof-label-row">
                  <MpFormLabel>{{ t('Account code') }}</MpFormLabel>
                  <span class="cof-counter">{{ form.code.length }}/{{ MAX }}</span>
                </div>
                <MpInput id="cof-code-input" v-model="form.code" :maxlength="MAX" @update:model-value="delete errors.code" />
                <MpFormErrorMessage>{{ errors.code }}</MpFormErrorMessage>
              </MpFormControl>
            </div>

            <div class="cof-row">
              <MpFormControl id="cof-category" class="cof-col">
                <MpFormLabel>{{ t('Account category') }}</MpFormLabel>
                <ErpFilterSelect id="cof-category-select" v-model="form.categoryId" :placeholder="t('Account category')" :options="categoryOptions" :is-clearable="false" :is-disabled="isLocked" width="100%" />
                <span v-if="isLocked" class="cof-help">{{ t('This account cannot be deleted because it already has transactions and/or is used in products, contacts, and taxes.') }}</span>
              </MpFormControl>
              <MpFormControl v-if="isCreditCardOrCash" id="cof-currency" class="cof-col">
                <MpFormLabel>{{ t('Currency') }}</MpFormLabel>
                <ErpFilterSelect id="cof-currency-select" v-model="form.currency" :placeholder="t('Currency')" :options="currencyOptions" :is-clearable="false" :is-disabled="isLocked || isEditHeader" width="100%" />
              </MpFormControl>
              <div v-else class="cof-col" />
            </div>

            <!-- Part of another account -->
            <div class="cof-row">
              <MpFormControl v-if="isEdit" id="cof-parent-edit" class="cof-col">
                <MpFormLabel>{{ t('Make it a sub-account from') }}</MpFormLabel>
                <ErpFilterSelect id="cof-parent-edit-select" v-model="form.parentId" :placeholder="t('Select account')" :options="headerOptions" width="100%" empty-text="No result found" />
              </MpFormControl>
              <div v-else class="cof-col">
                <div class="cof-check-row">
                  <label class="cof-check">
                    <MpCheckbox id="cof-part-of" :is-checked="partOfAnother" @change="partOfAnother = !partOfAnother" />
                    <span>{{ t('Set this account a part of another account') }}</span>
                  </label>
                  <MpTooltip :label="t('Tick the box if you want to make this account a sub-account or a header account of another account with the same category.')" placement="top" use-portal>
                    <span class="cof-info"><MpIcon name="info" size="sm" color="icon.default" /></span>
                  </MpTooltip>
                </div>
                <div v-if="partOfAnother" class="cof-nested">
                  <label class="cof-check">
                    <MpRadio id="cof-radio-sub" name="cof-part" value="sub-account" :is-checked="anotherType === 'sub-account'" @change="anotherType = 'sub-account'" />
                    <span>{{ t('Make it a sub-account from') }}</span>
                  </label>
                  <MpFormControl v-if="anotherType === 'sub-account'" id="cof-as-child" class="cof-nested-field" is-required :is-invalid="!!errors.asChild">
                    <ErpFilterSelect id="cof-as-child-select" :model-value="form.parentId" :placeholder="t('Select account')" :options="headerOptions" width="100%" empty-text="No result found" @update:model-value="form.parentId = $event; delete errors.asChild" />
                    <MpFormErrorMessage>{{ errors.asChild }}</MpFormErrorMessage>
                  </MpFormControl>
                  <label class="cof-check">
                    <MpRadio id="cof-radio-header" name="cof-part" value="header-account" :is-checked="anotherType === 'header-account'" @change="anotherType = 'header-account'" />
                    <span>{{ t('Make it a header account from') }}</span>
                  </label>
                  <MpFormControl v-if="anotherType === 'header-account'" id="cof-as-parent" class="cof-nested-field" is-required :is-invalid="!!errors.asParent">
                    <MultiSelectDropdown id="cof-as-parent-select" v-model="childLabelModel" :options="childLabels" :placeholder="t('Select account')" is-full-width :is-invalid="!!errors.asParent" />
                    <MpFormErrorMessage>{{ errors.asParent }}</MpFormErrorMessage>
                    <span class="cof-help">{{ t('You can select more than 1 account') }}</span>
                  </MpFormControl>
                </div>
              </div>
              <div class="cof-col" />
            </div>

            <template v-if="!asHeader">
              <div v-if="isCashAndBank" class="cof-row">
                <MpFormControl id="cof-bank" class="cof-col">
                  <MpFormLabel>{{ t('Bank name') }}</MpFormLabel>
                  <ErpFilterSelect id="cof-bank-select" v-model="form.bankName" :placeholder="t('Select bank')" :options="bankOptions" width="100%" />
                </MpFormControl>
                <MpFormControl v-if="form.bankName" id="cof-bank-no" class="cof-col">
                  <MpFormLabel>{{ t('Bank account number') }}</MpFormLabel>
                  <MpInput id="cof-bank-no-input" v-model="form.bankAccountNo" :maxlength="MAX" inputmode="numeric" />
                </MpFormControl>
                <div v-else class="cof-col" />
              </div>
              <div class="cof-row">
                <MpFormControl id="cof-tax" class="cof-col">
                  <MpFormLabel>{{ t('Tax') }}</MpFormLabel>
                  <ErpFilterSelect id="cof-tax-select" v-model="form.tax" :placeholder="t('Select tax')" :options="taxOptions" width="100%" />
                </MpFormControl>
                <div class="cof-col" />
              </div>
            </template>

            <div class="cof-row">
              <MpFormControl id="cof-desc" class="cof-col">
                <div class="cof-label-row">
                  <MpFormLabel>{{ t('Description') }}</MpFormLabel>
                  <span class="cof-counter">{{ form.description.length }}/{{ MAX }}</span>
                </div>
                <MpTextarea id="cof-desc-input" v-model="form.description" :maxlength="MAX" />
              </MpFormControl>
              <div class="cof-col" />
            </div>
          </div>
        </section>

        <section v-if="!asHeader" class="cof-section">
          <h2 class="cof-section-title">{{ t('Account access') }}</h2>
          <div class="cof-fields">
            <div class="cof-access">
              <span class="cof-access-label">{{ t('Users who can access') }}</span>
              <label class="cof-check">
                <MpRadio id="cof-access-all" name="cof-access" value="all" :is-checked="form.access === 'all'" @change="form.access = 'all'" />
                <span>{{ t('All users') }}</span>
              </label>
              <label class="cof-check">
                <MpRadio id="cof-access-user" name="cof-access" value="user" :is-checked="form.access === 'user'" @change="form.access = 'user'" />
                <span>{{ t('Some users') }}</span>
              </label>
              <label class="cof-check">
                <MpRadio id="cof-access-role" name="cof-access" value="customrole" :is-checked="form.access === 'customrole'" @change="form.access = 'customrole'" />
                <span>{{ t('Specific roles') }}</span>
              </label>
            </div>
            <MpFormControl v-if="form.access === 'user'" id="cof-users" class="cof-col cof-nested-field" is-required :is-invalid="!!errors.users">
              <MpFormLabel>{{ t('User') }}</MpFormLabel>
              <MultiSelectDropdown id="cof-users-select" v-model="form.users" :options="userNames" :placeholder="t('Select user')" is-full-width :is-invalid="!!errors.users" @update:model-value="delete errors.users" />
              <MpFormErrorMessage>{{ errors.users }}</MpFormErrorMessage>
              <span class="cof-help">{{ t('Users with Owner, Ultimate, Accountant, Administrator, or Report Reader role cannot be limited to access accounts.') }}</span>
            </MpFormControl>
            <MpFormControl v-if="form.access === 'customrole'" id="cof-roles" class="cof-col cof-nested-field" is-required :is-invalid="!!errors.roles">
              <MpFormLabel>{{ t('Role') }}</MpFormLabel>
              <MultiSelectDropdown id="cof-roles-select" v-model="form.roles" :options="accessRoles" :placeholder="t('Select role')" is-full-width :is-invalid="!!errors.roles" @update:model-value="delete errors.roles" />
              <MpFormErrorMessage>{{ errors.roles }}</MpFormErrorMessage>
              <span class="cof-help">{{ t('Any custom role combination with Accountant, Administrator, or Report Reader role cannot be limited to access accounts.') }}</span>
            </MpFormControl>
          </div>
        </section>

        <div class="cof-actions">
          <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
          <MpButton v-if="!isEdit" variant="secondary" is-rounded :is-loading="saving" @click="save(true)">{{ t('Save & add new') }}</MpButton>
          <MpButton variant="primary" is-rounded :is-loading="saving" @click="save()">{{ isEdit ? t('Save changes') : t('Save') }}</MpButton>
        </div>
      </div>
    </div>

    <UnsavedChangesModal :is-open="leaveOpen" :has-save-draft="false" @leave="leave" @cancel="leaveOpen = false" @draft="leaveOpen = false" />
  </div>
</template>

<style scoped>
.cof-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.cof-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between; padding: 0 var(--mp-spacing-6);
}
.cof-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.cof-breadcrumb {
  height: auto !important; min-width: 0 !important; padding: 0 !important; background: none !important;
  font-size: var(--mp-font-sizes-sm) !important; font-weight: var(--mp-font-weights-regular) !important;
  line-height: var(--mp-line-heights-md) !important; color: var(--mp-text-link) !important;
}
.cof-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cof-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default); }
.cof-stage {
  flex: 1; background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-20, 80px);
}
.cof-missing { margin: 0; color: var(--mp-text-secondary); }
.cof-form { width: 760px; max-width: 100%; display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.cof-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cof-section-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cof-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.cof-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.cof-col { flex: 1 1 0; min-width: 0; }
.cof-label-row { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.cof-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cof-help { display: block; margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cof-check-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cof-check { display: inline-flex; align-items: center; gap: 0; cursor: pointer; color: var(--mp-text-default); width: fit-content; }
.cof-info { display: inline-flex; }
.cof-nested { display: flex; flex-direction: column; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-3); padding-left: calc(var(--mp-sizes-5) + var(--mp-spacing-3)); }
.cof-nested-field { padding-left: calc(var(--mp-sizes-5) + var(--mp-spacing-3)); }
.cof-access { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cof-access-label { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cof-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); }
</style>
