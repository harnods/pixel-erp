<script setup lang="ts">
/**
 * CrmGenericRecordDetailPage — record detail for ANY custom module created via
 * "+ New module". Breadcrumb + inline-editable name → stage stepper (click a
 * stage to move) → inline-editable default fields (Customer, Contact person,
 * Value, Currency, Transaction/Due date, Payment terms, Description/Memo) bound
 * directly to the record — no separate "Edit" mode, matching the app's inline-edit
 * convention. Core-workspace scope: no tabs/line-items/won-lost-reason modal.
 */
import { computed } from 'vue'
import { MpButton, MpIcon, MpInput, MpTextarea, MpDatePicker } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  getCrmModule, getGenericRecord, genericModuleStages, moveGenericRecordStage,
  persistGenericRecordEdit, DATA_SOURCES, dataSourceByKey, DEAL_CURRENCIES,
} from '~/data/crm'

// `orderId` = the record id (matches the { orderId } contract every detailMatch
// page receives, e.g. CrmServiceDetailPage). The module id isn't threaded through
// detailMatch — derived from the route itself instead.
const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const { t } = useLocale()
const moduleId = computed(() => route.path.split('/').filter(Boolean)[1] ?? '')

const moduleName = computed(() => getCrmModule(moduleId.value)?.name ?? moduleId.value)
const rec = computed(() => getGenericRecord(moduleId.value, props.orderId))
const stages = computed(() => genericModuleStages(moduleId.value))
const currentIndex = computed(() => stages.value.findIndex((s) => s.name === rec.value?.stage))

function back() { router.push(`/crm/${moduleId.value}`) }
function onFieldChange() { persistGenericRecordEdit() }
function moveStage(stage: string) {
  if (!rec.value || stage === rec.value.stage) return
  moveGenericRecordStage(moduleId.value, props.orderId, stage)
}

const currencyOptions = DEAL_CURRENCIES.map((c) => ({ value: c, label: c }))
const paymentTermsOptions = (dataSourceByKey('erp-payment-terms')?.values ?? []).map((v) => ({ value: v, label: v }))
</script>

<template>
  <div class="crm">
    <template v-if="rec">
      <header class="crm-titlebar">
        <div class="crm-titlebar__left">
          <a class="detail-breadcrumb" @click="back">{{ moduleName }}</a>
          <MpInput v-model="rec.name" class="grd-title-input" is-full-width @update:model-value="onFieldChange" />
        </div>
      </header>

      <div class="grd-body">
        <!-- Stage stepper — click a stage to move the record -->
        <section class="grd-stepper">
          <button
            v-for="(s, i) in stages" :key="s.name" type="button" class="grd-step"
            :class="{ 'grd-step--done': i <= currentIndex, 'grd-step--current': i === currentIndex }"
            @click="moveStage(s.name)"
          >
            <span class="grd-step-label">{{ s.name }}</span>
            <span class="grd-step-bar" />
          </button>
        </section>

        <!-- Default fields — inline-editable -->
        <section class="grd-grid">
          <div class="grd-field">
            <label class="grd-label">{{ t('Customer') }}</label>
            <MpInput v-model="rec.values.customer" is-full-width @update:model-value="onFieldChange" />
          </div>
          <div class="grd-field">
            <label class="grd-label">{{ t('Contact person') }}</label>
            <MpInput v-model="rec.values.contactPerson" is-full-width @update:model-value="onFieldChange" />
          </div>
          <div class="grd-field">
            <label class="grd-label">{{ t('Owner') }}</label>
            <MpInput :model-value="rec.owner" is-full-width disabled />
          </div>

          <div class="grd-field">
            <label class="grd-label">{{ t('Record value') }}</label>
            <MpInput type="number" :model-value="rec.values.dealValue" is-full-width @update:model-value="(v: string) => { rec!.values.dealValue = Number(v) || 0; onFieldChange() }" />
          </div>
          <div class="grd-field">
            <label class="grd-label">{{ t('Currency') }}</label>
            <ErpFilterSelect
              id="grd-currency" :model-value="rec.values.currency ?? ''" :options="currencyOptions" is-full-width
              @update:model-value="(v: string) => { rec!.values.currency = v; onFieldChange() }"
            />
          </div>
          <div class="grd-field">
            <label class="grd-label">{{ t('Payment terms') }}</label>
            <ErpFilterSelect
              id="grd-payment-terms" :model-value="rec.values.paymentTerms ?? ''" :options="paymentTermsOptions" is-full-width
              @update:model-value="(v: string) => { rec!.values.paymentTerms = v; onFieldChange() }"
            />
          </div>

          <div class="grd-field">
            <label class="grd-label">{{ t('Transaction date') }}</label>
            <MpDatePicker :model-value="rec.values.transactionDate" @update:model-value="(v: string) => { rec!.values.transactionDate = v; onFieldChange() }" />
          </div>
          <div class="grd-field">
            <label class="grd-label">{{ t('Due date') }}</label>
            <MpDatePicker :model-value="rec.values.dueDate" @update:model-value="(v: string) => { rec!.values.dueDate = v; onFieldChange() }" />
          </div>
          <div class="grd-field">
            <label class="grd-label">{{ t('Reference no.') }}</label>
            <MpInput v-model="rec.values.referenceNo" is-full-width @update:model-value="onFieldChange" />
          </div>
        </section>

        <section class="grd-field grd-field--wide">
          <label class="grd-label">{{ t('Description') }}</label>
          <MpTextarea v-model="rec.values.description" is-full-width :rows="3" @update:model-value="onFieldChange" />
        </section>
        <section class="grd-field grd-field--wide">
          <label class="grd-label">{{ t('Memo') }}</label>
          <MpTextarea v-model="rec.values.memo" is-full-width :rows="2" @update:model-value="onFieldChange" />
        </section>
      </div>
    </template>

    <div v-else class="grd-empty">
      <img src="/illustrations/empty-folder.png" alt="" class="grd-empty-illustration" width="288" height="240" />
      <p class="grd-empty-title">{{ t('Record not found') }}</p>
      <p class="grd-empty-caption">{{ t('This record does not exist or was removed.') }}</p>
      <MpButton variant="secondary" is-rounded @click="back">{{ t('Back') }}</MpButton>
    </div>
  </div>
</template>

<style scoped>
.detail-breadcrumb { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.detail-breadcrumb:hover { text-decoration: underline; }
.grd-title-input { max-width: 420px; margin-top: var(--mp-spacing-1); }
.grd-title-input :deep(input) { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); }

.grd-body { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-8); }

.grd-stepper { display: flex; gap: var(--mp-spacing-2); }
.grd-step { flex: 1; display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; border: none; background: none; padding: 0; cursor: pointer; text-align: left; }
.grd-step-label { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grd-step--current .grd-step-label { color: var(--mp-colors-text-success, #16b364); font-weight: var(--mp-font-weights-semi-bold, 600); }
.grd-step-bar { display: block; height: 6px; border-radius: 3px; background: var(--mp-colors-background-neutral-subtle, #eef1f1); }
.grd-step--done .grd-step-bar { background: var(--mp-colors-background-success-bold, #16b364); }

.grd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-5); }
.grd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.grd-field--wide { grid-column: 1 / -1; }
.grd-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary, #6b7678); }

.grd-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-12) var(--mp-spacing-6); text-align: center; color: var(--mp-colors-text-secondary, #6b7678); }
.grd-empty-illustration { max-width: 288px; height: auto; }
.grd-empty-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
.grd-empty-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
