<script setup lang="ts">
/**
 * Create a new cash / bank / credit-card account (Figma 4660-96485).
 * Mirrors the NewWarehousePage form shell (title bar + white stage + 564px form
 * column + bottom actions). Two sections: Account info and Advanced settings
 * (sub-account + who-can-access). The user/role pickers open the shared
 * SelectAccessDrawer.
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpAutocomplete,
  MpCheckbox, MpRadio, MpIcon, MpTooltip, toast,
} from '@mekari/pixel3'
import SelectAccessDrawer, { type AccessOption } from '~/components/patterns/SelectAccessDrawer.vue'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import { cashAccounts, addCashAccount, type CashAccountCurrency } from '~/data'
import { banks } from '~/data/banks'
import { accessUsers, accessRoles } from '~/data/accessControl'

// orderId from the catch-all route: undefined/'new' → create, an account id → edit.
const props = defineProps<{ orderId?: string }>()
const router = useRouter()
const { t } = useLocale()

const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')
const editing = computed(() => cashAccounts.find(a => a.id === props.orderId))

const NAME_MAX = 60

// ─── Form state ────────────────────────────────────────────────────────────
const accountType = ref('cash-bank')
const code = ref('')
const name = ref('')
const currency = ref<CashAccountCurrency>('IDR')
const defaultTax = ref('')
const bankName = ref('')
const bankAccountNumber = ref('')

const isSubAccount = ref(false)
const parentAccount = ref('')

const access = ref<'all' | 'users' | 'roles'>('all')
const selectedUsers = ref<string[]>([])
const selectedRoles = ref<string[]>([])
const userDrawerOpen = ref(false)
const roleDrawerOpen = ref(false)

// ─── Account-code numbering settings (reusable NumberFormatSettingsModal) ────
const codeSettingsOpen = ref(false)
// The next sequential account number (the numeric part of the next auto code).
const nextCodeNumber = computed(() => nextCode().replace('1-', ''))
const accountCodeFormats = [
  { label: '1-[Auto]', value: '1-[Auto]' },
  { label: '2-[Auto]', value: '2-[Auto]' },
  { label: '[Auto]', value: '[Auto]' },
]
function onCodeFormatSave(_config: NumberFormatConfig) {
  toast.notify({ variant: 'success', title: t('Account code format saved'), maxWidth: 'max-content' })
}

// ─── Dropdown options ──────────────────────────────────────────────────────
const accountTypeOptions = [
  { label: 'Cash & Bank', value: 'cash-bank' },
  { label: 'Credit card', value: 'credit-card' },
]
const currencyOptions = [
  { label: 'Indonesian Rupiah (Rp)', value: 'IDR' },
  { label: 'United States Dollar (US$)', value: 'USD' },
  { label: 'Australian Dollar (AUS$)', value: 'AUD' },
]
const taxOptions = [
  { label: 'PPN 11%', value: 'PPN 11%' },
  { label: 'PPh 21', value: 'PPh 21' },
  { label: 'PPh 23', value: 'PPh 23' },
  { label: 'PPh Final 0.5%', value: 'PPh Final 0.5%' },
]
const bankOptions = banks.map(b => ({ label: b, value: b }))
// Parent-account candidates: existing, non-archived accounts.
const parentOptions = computed(() =>
  cashAccounts
    .filter(a => !a.isArchived)
    .map(a => ({ label: `${a.code} ${a.name}`, value: a.id })),
)

// ─── Access pickers ────────────────────────────────────────────────────────
const userOptions: AccessOption[] = accessUsers.map(u => ({ id: u.id, name: u.name, subtitle: u.roles.join(', ') }))
const roleOptions: AccessOption[] = accessRoles.map(r => ({ id: r, name: r }))

const selectedUserRows = computed(() => userOptions.filter(u => selectedUsers.value.includes(u.id)))
const selectedRoleRows = computed(() => roleOptions.filter(r => selectedRoles.value.includes(r.id)))

function removeUser(id: string) { selectedUsers.value = selectedUsers.value.filter(u => u !== id) }
function removeRole(id: string) { selectedRoles.value = selectedRoles.value.filter(r => r !== id) }
function onUsersSaved(ids: string[]) { selectedUsers.value = ids; if (ids.length) accessError.value = '' }
function onRolesSaved(ids: string[]) { selectedRoles.value = ids; if (ids.length) accessError.value = '' }

// ─── Validation + save ─────────────────────────────────────────────────────
const nameError = ref('')
const accessError = ref('')
const isSaving = ref(false)

function goBack() { router.push(isEdit.value ? `/cash-management/${props.orderId}` : '/cash-management') }

// Edit mode — prefill from the existing account. Account type & currency are
// locked once the account exists (you can't change what a ledger is denominated
// in), so they're read-only here; everything else stays editable.
onMounted(() => {
  const a = editing.value
  if (!a) return
  accountType.value = a.code.startsWith('2-') ? 'credit-card' : 'cash-bank'
  code.value = a.code
  name.value = a.name
  currency.value = a.currency
  bankName.value = ''
  bankAccountNumber.value = a.accountNumber ?? ''
  if (a.parentId) { isSubAccount.value = true; parentAccount.value = a.parentId }
})

async function save() {
  nameError.value = ''
  accessError.value = ''

  if (!name.value.trim()) nameError.value = t('You must fill in account name')
  if (access.value === 'users' && selectedUsers.value.length === 0) accessError.value = t('Select at least one user')
  if (access.value === 'roles' && selectedRoles.value.length === 0) accessError.value = t('Select at least one role')
  if (nameError.value || accessError.value) return

  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))

  const parent = isSubAccount.value ? cashAccounts.find(a => a.id === parentAccount.value) : undefined

  if (isEdit.value && editing.value) {
    const a = editing.value
    a.name = name.value.trim()
    a.accountNumber = bankAccountNumber.value.trim() || undefined
    a.parentId = parent?.id
    // account type & currency intentionally not changed (locked)
    toast.notify({ variant: 'success', title: `${a.name} ${t('updated')}`, maxWidth: 'max-content' })
    router.push(`/cash-management/${a.id}`)
    return
  }

  addCashAccount({
    code: code.value.trim() || nextCode(),
    name: name.value.trim(),
    currency: currency.value,
    statementBalance: null,
    bookBalance: 0,
    unreconciledCount: 0,
    hasTransactions: false,
    accountNumber: bankAccountNumber.value.trim() || undefined,
    parentId: parent?.id,
    lastUpdated: new Date().toISOString(),
  })

  toast.notify({ variant: 'success', title: `${name.value.trim()} ${t('created')}`, maxWidth: 'max-content' })
  router.push('/cash-management')
}

// Next asset code in the 1-10xxx series — mirrors the "Auto" placeholder.
function nextCode() {
  const nums = cashAccounts
    .map(a => a.code.match(/^1-100(\d\d)$/)?.[1])
    .filter(Boolean)
    .map(n => Number(n))
  const next = (nums.length ? Math.max(...nums) : 8) + 1
  return `1-100${String(next).padStart(2, '0')}`
}
</script>

<template>
  <div class="cca-page">

    <!-- ── Title bar ── -->
    <div class="cca-titlebar">
      <div class="cca-titlebar-left">
        <button class="cca-breadcrumb" @click="goBack">{{ t('Cash management') }}</button>
        <h1 class="cca-title">{{ isEdit ? t('Edit account') : t('New account') }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="cca-stage">
      <div class="cca-form-group">

        <!-- ── Section: Account info ── -->
        <div class="cca-section">
          <h2 class="cca-section-title">{{ t('Account info') }}</h2>
          <div class="cca-section-spacer" />

          <div class="cca-fields">
            <!-- Account type -->
            <MpFormControl id="cca-type" class="cca-field-half">
              <MpFormLabel>{{ t('Account type') }}</MpFormLabel>
              <MpAutocomplete
                id="cca-type-ac" v-model="accountType" :data="accountTypeOptions"
                label-prop="label" value-prop="value" use-portal is-full-width :is-disabled="isEdit"
              />
            </MpFormControl>

            <!-- Account code + Account name -->
            <div class="cca-row">
              <MpFormControl id="cca-code" class="cca-field-code" is-required>
                <div class="cca-label-inline">
                  <MpFormLabel>{{ t('Account code') }}</MpFormLabel>
                  <button class="cca-gear" type="button" :aria-label="t('Account code settings')" @click="codeSettingsOpen = true">
                    <MpIcon name="settings" size="sm" />
                  </button>
                </div>
                <MpInput id="cca-code-input" v-model="code" :is-disabled="true" :placeholder="t('Auto')" />
              </MpFormControl>

              <MpFormControl id="cca-name" class="cca-field-name" is-required :is-invalid="!!nameError">
                <div class="cca-label-row">
                  <MpFormLabel>{{ t('Account name') }}</MpFormLabel>
                  <span class="cca-counter">{{ name.length }} / {{ NAME_MAX }}</span>
                </div>
                <MpInput id="cca-name-input" v-model="name" :maxlength="NAME_MAX" @update:model-value="nameError = ''" />
                <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
              </MpFormControl>
            </div>

            <!-- Currency + Default tax -->
            <div class="cca-row">
              <MpFormControl id="cca-currency" class="cca-field-code" is-required>
                <MpFormLabel>{{ t('Currency') }}</MpFormLabel>
                <MpAutocomplete
                  id="cca-currency-ac" v-model="currency" :data="currencyOptions"
                  label-prop="label" value-prop="value" use-portal is-full-width :is-disabled="isEdit"
                />
              </MpFormControl>

              <MpFormControl id="cca-tax" class="cca-field-name">
                <MpFormLabel>{{ t('Default tax') }}</MpFormLabel>
                <MpAutocomplete
                  id="cca-tax-ac" v-model="defaultTax" :data="taxOptions"
                  label-prop="label" value-prop="value" :placeholder="t('Select default tax')"
                  use-portal is-full-width is-clearable
                />
              </MpFormControl>
            </div>

            <!-- Bank name + Bank account number -->
            <div class="cca-row">
              <MpFormControl id="cca-bank" class="cca-field-code">
                <MpFormLabel>{{ t('Bank name') }}</MpFormLabel>
                <MpAutocomplete
                  id="cca-bank-ac" v-model="bankName" :data="bankOptions"
                  label-prop="label" value-prop="value" :placeholder="t('Select bank')"
                  is-searchable use-portal is-full-width is-clearable
                />
              </MpFormControl>

              <MpFormControl id="cca-bank-no" class="cca-field-name">
                <MpFormLabel>{{ t('Bank account number') }}</MpFormLabel>
                <MpInput id="cca-bank-no-input" v-model="bankAccountNumber" />
              </MpFormControl>
            </div>
          </div>
        </div>

        <!-- ── Section: Advanced settings ── -->
        <div class="cca-section">
          <h2 class="cca-section-title">{{ t('Advanced settings') }}</h2>
          <div class="cca-section-spacer" />

          <div class="cca-fields cca-fields--wide">
            <!-- Sub-account -->
            <div class="cca-subsection">
              <p class="cca-sub-label">{{ t('Sub-account') }}</p>
              <p class="cca-sub-caption">{{ t('Group this account under a main category. Example: 1-10002 BCA Emergency Card is a sub-account of Bank BCA.') }}</p>
              <label class="cca-check">
                <MpCheckbox id="cca-subaccount" :is-checked="isSubAccount" @change="isSubAccount = !isSubAccount" />
                <span>{{ t('Make this a sub-account') }}</span>
              </label>

              <MpFormControl v-if="isSubAccount" id="cca-parent" class="cca-parent-field">
                <MpFormLabel>{{ t('Parent account') }}</MpFormLabel>
                <MpAutocomplete
                  id="cca-parent-ac" v-model="parentAccount" :data="parentOptions"
                  label-prop="label" value-prop="value" :placeholder="t('Select parent account')"
                  is-searchable use-portal is-full-width is-clearable
                />
              </MpFormControl>
            </div>

            <!-- Who can access -->
            <div class="cca-subsection">
              <p class="cca-sub-label cca-sub-label--required">{{ t('Who can access this account?') }}<span class="cca-req">*</span></p>
              <p class="cca-sub-caption">{{ t('Control which users can view balances and create transactions with this account.') }}</p>

              <div class="cca-radio-group">
                <label class="cca-radio-item">
                  <MpRadio id="cca-access-all" name="cca-access" value="all" :is-checked="access === 'all'" @change="access = 'all'" />
                  <span>{{ t('All users') }}</span>
                </label>

                <label class="cca-radio-item">
                  <MpRadio id="cca-access-users" name="cca-access" value="users" :is-checked="access === 'users'" @change="access = 'users'" />
                  <span>{{ t('Selected users') }}</span>
                </label>
                <!-- Selected-users picker -->
                <div v-if="access === 'users'" class="cca-access-body">
                  <div v-if="selectedUserRows.length" class="cca-sel-list">
                    <div v-for="u in selectedUserRows" :key="u.id" class="cca-sel-row">
                      <span class="cca-sel-info">
                        <span class="cca-sel-name">{{ u.name }}</span>
                        <span v-if="u.subtitle" class="cca-sel-sub">{{ u.subtitle }}</span>
                      </span>
                      <MpTooltip :id="`cca-rm-user-${u.id}`" label="Remove" placement="top" use-portal class="cca-sel-tip">
                        <button class="cca-sel-remove" type="button" :aria-label="t('Remove')" @click="removeUser(u.id)">
                          <MpIcon name="minus-circular" size="sm" />
                        </button>
                      </MpTooltip>
                    </div>
                  </div>
                  <button class="btn-enterprise btn-enterprise--secondary cca-add-btn" type="button" @click="userDrawerOpen = true">{{ t('Add user') }}</button>
                </div>

                <label class="cca-radio-item">
                  <MpRadio id="cca-access-roles" name="cca-access" value="roles" :is-checked="access === 'roles'" @change="access = 'roles'" />
                  <span>{{ t('Selected roles') }}</span>
                </label>
                <!-- Selected-roles picker -->
                <div v-if="access === 'roles'" class="cca-access-body">
                  <div v-if="selectedRoleRows.length" class="cca-sel-list">
                    <div v-for="r in selectedRoleRows" :key="r.id" class="cca-sel-row">
                      <span class="cca-sel-info">
                        <span class="cca-sel-name">{{ r.name }}</span>
                      </span>
                      <MpTooltip :id="`cca-rm-role-${r.id}`" label="Remove" placement="top" use-portal class="cca-sel-tip">
                        <button class="cca-sel-remove" type="button" :aria-label="t('Remove')" @click="removeRole(r.id)">
                          <MpIcon name="minus-circular" size="sm" />
                        </button>
                      </MpTooltip>
                    </div>
                  </div>
                  <button class="btn-enterprise btn-enterprise--secondary cca-add-btn" type="button" @click="roleDrawerOpen = true">{{ t('Add role') }}</button>
                </div>
              </div>
              <p v-if="accessError" class="cca-access-error">{{ accessError }}</p>
            </div>
          </div>
        </div>

        <!-- ── Actions ── -->
        <div class="cca-action-group">
          <div class="cca-action-right">
            <button class="cca-btn-cancel" @click="goBack">{{ t('Cancel') }}</button>
            <button class="cca-btn-save" :disabled="isSaving" @click="save">{{ isSaving ? t('Saving…') : (isEdit ? t('Save changes') : t('Save')) }}</button>
          </div>
        </div>

      </div>
    </div>

    <!-- ── Access drawers ── -->
    <SelectAccessDrawer
      v-model:open="userDrawerOpen"
      :title="t('Select users')"
      :list-title="t('Users')"
      :options="userOptions"
      :model-value="selectedUsers"
      :empty-title="t('No selected users')"
      :empty-caption="t('Selected users will appear here.')"
      @save="onUsersSaved"
    />
    <SelectAccessDrawer
      v-model:open="roleDrawerOpen"
      :title="t('Select roles')"
      :list-title="t('Roles')"
      :options="roleOptions"
      :model-value="selectedRoles"
      :empty-title="t('No selected roles')"
      :empty-caption="t('Selected roles will appear here.')"
      @save="onRolesSaved"
    />

    <!-- ── Account-code numbering (reusable NumberFormatSettingsModal) ── -->
    <NumberFormatSettingsModal
      v-model:open="codeSettingsOpen"
      :title="t('Account code settings')"
      :caption="t('Account codes are auto-generated by the system.')"
      :next-number="nextCodeNumber"
      :existing-formats="accountCodeFormats"
      @save="onCodeFormatSave"
    />
  </div>
</template>


<style scoped>
/* Shell mirrors NewWarehousePage (page-title-bar.md: 72px bar, breadcrumb above H1). */
.cca-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.cca-titlebar {
  flex-shrink: 0; height: 72px; background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between; padding: 0 var(--mp-spacing-6);
}
.cca-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.cca-breadcrumb {
  background: none; border: none; cursor: pointer; padding: 0; font-size: 12px;
  font-weight: var(--mp-font-weights-regular); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link); font-family: inherit; white-space: nowrap;
}
.cca-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cca-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}

.cca-stage {
  flex: 1; background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}
.cca-form-group { width: 564px; max-width: 100%; display: flex; flex-direction: column; gap: 20px; }

.cca-section { display: flex; flex-direction: column; }
.cca-section-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cca-section-spacer { height: 12px; }
.cca-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

/* Half-width single control (Account type) */
.cca-field-half { width: 270px; max-width: 100%; }

/* Two-column rows — left fixed 270px, right fills */
.cca-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.cca-field-code { width: 270px; flex-shrink: 0; }
.cca-field-name { flex: 1; min-width: 0; }

.cca-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); width: 100%; }
/* Label + settings gear sitting directly beside the "Account code" label. */
.cca-label-inline { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cca-counter { flex-shrink: 0; font-size: 12px; font-weight: var(--mp-font-weights-regular); line-height: 16px; color: var(--mp-text-secondary); text-align: right; }
.cca-gear {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
  padding: 0; border: none; background: none; cursor: pointer; border-radius: var(--mp-radii-sm); color: var(--mp-icon-default, var(--mp-text-secondary));
}
.cca-gear:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* Advanced settings sub-sections */
.cca-fields--wide { gap: var(--mp-spacing-6); }
.cca-subsection { display: flex; flex-direction: column; }
.cca-sub-label { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cca-req { color: var(--mp-text-critical, var(--mp-text-danger)); margin-left: 2px; }
.cca-sub-caption { margin: var(--mp-spacing-1) 0 var(--mp-spacing-3); font-size: 12px; line-height: 16px; color: var(--mp-text-secondary); }

/* gap:0 — MpCheckbox/MpRadio render their own 12px control-to-label gap internally
   (an extra wrapper gap stacks into a double 24px gap). See docs/patterns/Form.md. */
.cca-check { display: inline-flex; align-items: center; gap: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
/* Indented to line up with the checkbox LABEL text: control width + the 12px gap. */
.cca-parent-field { margin-top: var(--mp-spacing-3); margin-left: calc(var(--mp-sizes-4, 16px) + var(--mp-spacing-3)); width: 368px; max-width: 100%; }

.cca-radio-group { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cca-radio-item { display: inline-flex; align-items: center; gap: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); width: fit-content; }

/* Selected users/roles — a plain list (name + role subtitle, border-bottom rows,
   no outer box), indented to line up with the radio label text. */
.cca-access-body { margin-left: calc(var(--mp-sizes-4, 16px) + var(--mp-spacing-3)); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cca-sel-list { display: flex; flex-direction: column; width: 320px; max-width: 100%; }
.cca-sel-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); min-height: 44px; padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); }
.cca-sel-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cca-sel-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cca-sel-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cca-sel-tip { display: inline-flex; flex-shrink: 0; }
.cca-sel-remove { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-sm); }
.cca-sel-remove:hover { color: var(--mp-text-default); background: var(--mp-background-neutral-hovered); }
.cca-add-btn { width: fit-content; }
.cca-access-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical, var(--mp-text-danger)); }

/* Actions */
.cca-action-group { display: flex; align-items: center; padding: var(--mp-spacing-4) 0; }
.cca-action-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.cca-btn-cancel {
  background: transparent; border: none; border-radius: var(--mp-radii-full, 999px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary); cursor: pointer; font-family: inherit;
}
.cca-btn-cancel:hover { background: var(--mp-background-neutral-hovered); }
.cca-btn-save {
  background: var(--mp-colors-emerald-700, #029861); border: 1px solid var(--mp-colors-emerald-700, #029861);
  border-radius: var(--mp-radii-full, 999px); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-inverse); cursor: pointer; font-family: inherit; white-space: nowrap;
}
.cca-btn-save:hover { background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a); }
</style>
