<!-- prod-parity: jurnal-accounting-frontend/src/modules/assets/views/AssetCreateView.vue + AssetEditView.vue + components/form/AssetForm.vue -->
<script setup lang="ts">
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea, MpDatePicker, MpCheckbox,
  MpInputTag, MpIcon, MpTooltip, type DataInterface,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { successToast } from '~/utils/toasts'
import {
  getCurrentAsset, createCurrentAsset, updateCurrentAsset, nextCurrentAssetNumber, currentAssetNumberTaken,
  currentAssetAccountOptions, currentCreditedAccountOptions, currentDepreciationAccountOptions,
  currentAccumulatedAccountOptions, caAccumulatedOf, caHistoryOf, CURRENT_ASSET_TODAY,
  type CurrentDepreciationMethod,
} from '~/data/currentAssets'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const NAME_MAX = 60
const DESCRIPTION_MAX = 256

const mode = computed<'create' | 'edit'>(() => (props.orderId === 'new' ? 'create' : 'edit'))
const editing = computed(() => (mode.value === 'edit' ? getCurrentAsset(props.orderId) ?? null : null))
const title = computed(() => (mode.value === 'create' ? t('New asset') : t('Edit asset')))

function isoToDisplay(iso: string | null | undefined) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function displayToIso(s: string) { const [d, m, y] = (s || '').split('/'); return y && m && d ? `${y}-${m}-${d}` : '' }
function toNum(s: string): number | null { const c = String(s ?? '').replace(/[^\d.]/g, ''); return c === '' ? null : Number(c) }

type MethodValue = CurrentDepreciationMethod | 'no_depreciation'
const methodOptions = computed(() => [
  { value: 'straight_line', label: t('Straight line') },
  { value: 'reducing_balance', label: t('Reducing balance') },
  { value: 'no_depreciation', label: t('No depreciation') },
])

function blank() {
  return {
    name: '', assetNumber: '', description: '', acquisitionDate: isoToDisplay(CURRENT_ASSET_TODAY), acquisitionCost: '',
    assetAccount: '', creditedAccount: '', tags: [] as DataInterface[],
    method: 'no_depreciation' as MethodValue, depreciationAccount: '', accumulatedAccount: '',
    usefulLife: '', rate: '', initialDepreciation: '0', initialDepreciationDate: isoToDisplay(CURRENT_ASSET_TODAY),
  }
}
const form = reactive(blank())
const addAnother = ref(false)
const errors = reactive<Record<string, string>>({})

function toTags(arr: string[]): DataInterface[] {
  return arr.map((s) => ({ id: s, text: s, value: s, isInvalid: false, isReadOnly: false }))
}

function load() {
  Object.assign(form, blank())
  Object.keys(errors).forEach((k) => delete errors[k])
  const a = editing.value
  if (!a) { form.assetNumber = nextCurrentAssetNumber(); return }
  form.name = a.name
  form.assetNumber = a.number
  form.description = a.description
  form.acquisitionDate = isoToDisplay(a.acquisitionDate)
  form.acquisitionCost = String(a.acquisitionCost)
  form.assetAccount = a.assetAccount ?? ''
  form.creditedAccount = a.creditedAccount ?? ''
  form.tags = toTags(a.tags)
  form.method = a.depreciable ? a.method : 'no_depreciation'
  form.depreciationAccount = a.depreciationAccount ?? ''
  form.accumulatedAccount = a.accumulatedAccount ?? ''
  form.usefulLife = a.usefulLife != null ? String(a.usefulLife) : ''
  form.rate = a.rate != null ? String(a.rate) : ''
  form.initialDepreciation = String(a.initialDepreciation)
  form.initialDepreciationDate = isoToDisplay(a.initialDepreciationDate) || isoToDisplay(CURRENT_ASSET_TODAY)
}
watch(() => props.orderId, load, { immediate: true })

const nonDepreciable = computed(() => form.method === 'no_depreciation')

// Useful life ⇄ rate: rate = factor / life, life = factor / rate (factor 200 reducing, 100 straight line).
function factor() { return form.method === 'reducing_balance' ? 200 : 100 }
function round2(n: number) { return Math.round(n * 100) / 100 }
function derive(src: number | null): string { if (!src) return '0'; const d = factor() / src; return Number.isFinite(d) ? String(round2(d)) : '0' }
function onUsefulLife(v: string) { form.usefulLife = v; form.rate = derive(toNum(v)); errors.usefulLife = ''; errors.rate = '' }
function onRate(v: string) { form.rate = v; form.usefulLife = derive(toNum(v)); errors.usefulLife = ''; errors.rate = '' }
function onMethod(v: string) {
  form.method = (v || 'no_depreciation') as MethodValue
  if (!nonDepreciable.value && toNum(form.usefulLife)) form.rate = derive(toNum(form.usefulLife))
  errors.method = ''
}
function onTags(data: DataInterface[]) { form.tags = data }

// Read-only opening balance on edit (current accumulated + last applied date).
const readonlyAccumulated = computed(() => (editing.value ? formatIDR(caAccumulatedOf(editing.value)) : ''))
const readonlyAsOf = computed(() => {
  if (!editing.value) return ''
  const last = [...caHistoryOf(editing.value)].reverse().find((h) => h.kind !== 'acquisition')
  return last ? formatDate(last.date) : '—'
})

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.name.trim()) errors.name = t('Asset name is required')
  if (!form.assetNumber.trim()) errors.assetNumber = t('You must fill in asset no.')
  else if (currentAssetNumberTaken(form.assetNumber, editing.value?.id)) errors.assetNumber = t('Asset no. has already been taken')
  if (!displayToIso(form.acquisitionDate)) errors.acquisitionDate = t('Acquisition date is required')
  const cost = toNum(form.acquisitionCost)
  if (cost === null || cost <= 0) errors.acquisitionCost = t('Acquisition cost is required')
  if (!form.assetAccount) errors.assetAccount = t('Asset account is required')
  if (!form.creditedAccount) errors.creditedAccount = t('Credited account is required')
  if (!nonDepreciable.value) {
    const life = toNum(form.usefulLife)
    const rate = toNum(form.rate)
    const reducing = form.method === 'reducing_balance'
    if (!life || life < 1) errors.usefulLife = t('Useful life must be at least 1 year')
    if (rate === null || rate <= 0 || (reducing ? rate >= 100 : rate > 100)) {
      errors.rate = reducing ? t('For reducing balance, rate must be more than 0 and less than 100') : t('Rate must be more than 0 and at most 100')
    }
    if (!form.depreciationAccount) errors.depreciationAccount = t('Depreciation account is required')
    if (!form.accumulatedAccount) errors.accumulatedAccount = t('Accumulated depreciation account is required')
    if (mode.value === 'create') {
      const init = toNum(form.initialDepreciation)
      if (init === null || init < 0) errors.initialDepreciation = t('Opening balance is required')
      else if (cost !== null && init > cost) errors.initialDepreciation = t('Accumulated depreciation cannot exceed acquisition cost')
      if (!displayToIso(form.initialDepreciationDate)) errors.initialDepreciationDate = t('As-of date is required')
    }
  }
  return Object.keys(errors).length === 0
}

function payload() {
  const dep = !nonDepreciable.value
  return {
    name: form.name.trim(),
    number: form.assetNumber.trim(),
    description: form.description.trim(),
    acquisitionDate: displayToIso(form.acquisitionDate),
    acquisitionCost: toNum(form.acquisitionCost) ?? 0,
    assetAccount: form.assetAccount || null,
    creditedAccount: form.creditedAccount || null,
    tags: form.tags.map((d) => String(d.value ?? d.text)).filter(Boolean),
    depreciable: dep,
    method: (dep ? form.method : 'straight_line') as CurrentDepreciationMethod,
    usefulLife: dep ? toNum(form.usefulLife) : null,
    rate: dep ? toNum(form.rate) : null,
    depreciationAccount: dep ? form.depreciationAccount || null : null,
    accumulatedAccount: dep ? form.accumulatedAccount || null : null,
  }
}

function save() {
  if (!validate()) return
  if (mode.value === 'create') {
    const init = !nonDepreciable.value ? toNum(form.initialDepreciation) ?? 0 : 0
    const a = createCurrentAsset({
      ...payload(),
      initialDepreciation: init,
      initialDepreciationDate: init > 0 ? displayToIso(form.initialDepreciationDate) : null,
    })
    successToast(t('Asset saved'))
    if (addAnother.value) { load(); return }
    router.push(`/current-assets/${a.id}`)
  } else if (editing.value) {
    const id = editing.value.id
    updateCurrentAsset(id, payload())
    successToast(t('Asset saved'))
    router.push(`/current-assets/${id}`)
  }
}
function cancel() {
  if (mode.value === 'edit' && editing.value) router.push(`/current-assets/${editing.value.id}`)
  else router.push('/current-assets')
}
function goIndex() { router.push('/current-assets') }
</script>

<template>
  <div class="caf-page">
    <div class="caf-titlebar">
      <div class="caf-titlebar-left">
        <button class="caf-breadcrumb" @click="goIndex">{{ t('Fixed assets (current)') }}</button>
        <h1 class="caf-title">{{ title }}</h1>
      </div>
    </div>

    <div class="caf-stage">
      <div v-if="mode === 'edit' && !editing" class="caf-not-found">
        <p class="caf-not-found-title">{{ t('Asset not found') }}</p>
        <p class="caf-not-found-desc">{{ t('This asset may have been deleted, or the link is incorrect.') }}</p>
      </div>
      <div v-else class="caf-form">
        <!-- Asset details -->
        <section class="caf-section">
          <h2 class="caf-section-title">{{ t('Asset details') }}</h2>

          <MpFormControl id="caf-name" is-required :is-invalid="!!errors.name">
            <div class="caf-label-row">
              <MpFormLabel>{{ t('Asset name') }}</MpFormLabel>
              <span class="caf-counter">{{ form.name.length }}/{{ NAME_MAX }}</span>
            </div>
            <MpInput id="caf-name-input" v-model="form.name" :maxlength="NAME_MAX" is-full-width @update:model-value="errors.name = ''" />
            <MpFormErrorMessage>{{ errors.name }}</MpFormErrorMessage>
          </MpFormControl>

          <div class="caf-row">
            <MpFormControl id="caf-number" is-required :is-invalid="!!errors.assetNumber">
              <div class="caf-label-inline">
                <MpFormLabel>{{ t('Asset no.') }}</MpFormLabel>
                <MpTooltip :label="t('Numbering settings')" placement="top">
                  <span class="caf-label-icon"><MpIcon name="settings" size="sm" /></span>
                </MpTooltip>
              </div>
              <MpInput id="caf-number-input" v-model="form.assetNumber" is-full-width @update:model-value="errors.assetNumber = ''" />
              <MpFormErrorMessage>{{ errors.assetNumber }}</MpFormErrorMessage>
            </MpFormControl>
            <div />
          </div>

          <MpFormControl id="caf-description">
            <div class="caf-label-row">
              <MpFormLabel>{{ t('Description') }}</MpFormLabel>
              <span class="caf-counter">{{ form.description.length }}/{{ DESCRIPTION_MAX }}</span>
            </div>
            <MpTextarea id="caf-description-input" v-model="form.description" :maxlength="DESCRIPTION_MAX" is-full-width />
          </MpFormControl>

          <div class="caf-row">
            <MpFormControl id="caf-acq-date" is-required :is-invalid="!!errors.acquisitionDate">
              <MpFormLabel>{{ t('Acquisition date') }}</MpFormLabel>
              <MpDatePicker id="caf-acq-date-dp" v-model="form.acquisitionDate" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" @update:model-value="errors.acquisitionDate = ''" />
              <MpFormErrorMessage>{{ errors.acquisitionDate }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="caf-cost" is-required :is-invalid="!!errors.acquisitionCost">
              <MpFormLabel>{{ t('Acquisition cost') }}</MpFormLabel>
              <div class="caf-amount">
                <span class="caf-amount-prefix">Rp</span>
                <MpInput id="caf-cost-input" v-model="form.acquisitionCost" inputmode="numeric" is-full-width @update:model-value="errors.acquisitionCost = ''" />
              </div>
              <MpFormErrorMessage>{{ errors.acquisitionCost }}</MpFormErrorMessage>
            </MpFormControl>
          </div>

          <div class="caf-row">
            <MpFormControl id="caf-asset-account" is-required :is-invalid="!!errors.assetAccount">
              <MpFormLabel>{{ t('Asset account') }}</MpFormLabel>
              <ErpFilterSelect id="caf-asset-account-select" :model-value="form.assetAccount" :placeholder="t('Select account')" :options="currentAssetAccountOptions" width="100%" empty-text="No matching account found" @update:model-value="(v: string) => { form.assetAccount = v; errors.assetAccount = '' }" />
              <MpFormErrorMessage>{{ errors.assetAccount }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="caf-credited-account" is-required :is-invalid="!!errors.creditedAccount">
              <MpFormLabel>{{ t('Credited account') }}</MpFormLabel>
              <ErpFilterSelect id="caf-credited-account-select" :model-value="form.creditedAccount" :placeholder="t('Select account')" :options="currentCreditedAccountOptions" width="100%" empty-text="No matching account found" @update:model-value="(v: string) => { form.creditedAccount = v; errors.creditedAccount = '' }" />
              <MpFormErrorMessage>{{ errors.creditedAccount }}</MpFormErrorMessage>
            </MpFormControl>
          </div>

          <MpFormControl id="caf-tags">
            <MpFormLabel>{{ t('Tags') }}</MpFormLabel>
            <MpInputTag id="caf-tags-input" :data="form.tags" @change="onTags" />
          </MpFormControl>
        </section>

        <!-- Depreciation settings -->
        <section class="caf-section">
          <h2 class="caf-section-title">{{ t('Depreciation settings') }}</h2>
          <div class="caf-row">
            <MpFormControl id="caf-method" is-required>
              <MpFormLabel>{{ t('Depreciation method') }}</MpFormLabel>
              <ErpFilterSelect id="caf-method-select" :model-value="form.method" :placeholder="t('Depreciation method')" :options="methodOptions" :is-clearable="false" width="100%" @update:model-value="onMethod" />
            </MpFormControl>
            <div />
          </div>

          <template v-if="!nonDepreciable">
            <div class="caf-row">
              <MpFormControl id="caf-dep-account" is-required :is-invalid="!!errors.depreciationAccount">
                <MpFormLabel>{{ t('Depreciation account') }}</MpFormLabel>
                <ErpFilterSelect id="caf-dep-account-select" :model-value="form.depreciationAccount" :placeholder="t('Select account')" :options="currentDepreciationAccountOptions" width="100%" empty-text="No matching account found" @update:model-value="(v: string) => { form.depreciationAccount = v; errors.depreciationAccount = '' }" />
                <MpFormErrorMessage>{{ errors.depreciationAccount }}</MpFormErrorMessage>
              </MpFormControl>
              <MpFormControl id="caf-acc-account" is-required :is-invalid="!!errors.accumulatedAccount">
                <MpFormLabel>{{ t('Accumulated depreciation account') }}</MpFormLabel>
                <ErpFilterSelect id="caf-acc-account-select" :model-value="form.accumulatedAccount" :placeholder="t('Select account')" :options="currentAccumulatedAccountOptions" width="100%" empty-text="No matching account found" @update:model-value="(v: string) => { form.accumulatedAccount = v; errors.accumulatedAccount = '' }" />
                <MpFormErrorMessage>{{ errors.accumulatedAccount }}</MpFormErrorMessage>
              </MpFormControl>
            </div>

            <div class="caf-row">
              <MpFormControl id="caf-life" is-required :is-invalid="!!errors.usefulLife">
                <MpFormLabel>{{ t('Useful life') }}</MpFormLabel>
                <div class="caf-amount">
                  <MpInput id="caf-life-input" :model-value="form.usefulLife" inputmode="decimal" is-full-width @update:model-value="onUsefulLife" />
                  <span class="caf-amount-suffix">{{ t('Years') }}</span>
                </div>
                <MpFormErrorMessage>{{ errors.usefulLife }}</MpFormErrorMessage>
              </MpFormControl>
              <MpFormControl id="caf-rate" is-required :is-invalid="!!errors.rate">
                <MpFormLabel>{{ t('Depreciation rate (%)') }}</MpFormLabel>
                <div class="caf-amount">
                  <MpInput id="caf-rate-input" :model-value="form.rate" inputmode="decimal" is-full-width @update:model-value="onRate" />
                  <span class="caf-amount-suffix">{{ t('per year') }}</span>
                </div>
                <MpFormErrorMessage>{{ errors.rate }}</MpFormErrorMessage>
              </MpFormControl>
            </div>

            <div class="caf-row">
              <MpFormControl id="caf-init" :is-required="mode === 'create'" :is-invalid="!!errors.initialDepreciation">
                <MpFormLabel>{{ t('Accumulated depreciation') }}</MpFormLabel>
                <div v-if="mode === 'create'" class="caf-amount">
                  <span class="caf-amount-prefix">Rp</span>
                  <MpInput id="caf-init-input" v-model="form.initialDepreciation" inputmode="numeric" is-full-width @update:model-value="errors.initialDepreciation = ''" />
                </div>
                <p v-else class="caf-readonly">{{ readonlyAccumulated }}</p>
                <MpFormErrorMessage>{{ errors.initialDepreciation }}</MpFormErrorMessage>
              </MpFormControl>
              <MpFormControl id="caf-init-date" :is-required="mode === 'create'" :is-invalid="!!errors.initialDepreciationDate">
                <MpFormLabel>{{ mode === 'create' ? t('Depreciation cut-off date') : t('As of date') }}</MpFormLabel>
                <MpDatePicker v-if="mode === 'create'" id="caf-init-date-dp" v-model="form.initialDepreciationDate" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" @update:model-value="errors.initialDepreciationDate = ''" />
                <p v-else class="caf-readonly">{{ readonlyAsOf }}</p>
                <MpFormErrorMessage>{{ errors.initialDepreciationDate }}</MpFormErrorMessage>
              </MpFormControl>
            </div>
          </template>
        </section>
      </div>
    </div>

    <div class="caf-footer">
      <div class="caf-footer-left">
        <label v-if="mode === 'create'" class="caf-check">
          <MpCheckbox id="caf-add-another" :is-checked="addAnother" @change="addAnother = !addAnother" />
          <span>{{ t('Add another') }}</span>
        </label>
      </div>
      <div class="caf-footer-right">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="cancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ t('Save') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.caf-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.caf-titlebar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.caf-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.caf-breadcrumb { background: none; border: none; cursor: pointer; padding: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-md); color: var(--mp-text-link); font-family: inherit; white-space: nowrap; }
.caf-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.caf-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.caf-stage { flex: 1; min-height: 0; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8); }
.caf-form { width: 640px; max-width: 100%; display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.caf-section { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.caf-section-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 24px); color: var(--mp-text-default); }
.caf-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-6); }
.caf-label-row { display: flex; align-items: center; justify-content: space-between; }
.caf-label-inline { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.caf-label-icon { display: inline-flex; color: var(--mp-colors-icon-default); }
.caf-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.caf-amount { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.caf-amount-prefix, .caf-amount-suffix { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); white-space: nowrap; }
.caf-readonly { margin: 0; min-height: var(--mp-sizes-9\.5, 38px); display: flex; align-items: center; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.caf-footer { flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default); }
.caf-footer-right { display: flex; gap: var(--mp-spacing-3); }
.caf-check { display: inline-flex; align-items: center; gap: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.caf-not-found { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.caf-not-found-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.caf-not-found-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
