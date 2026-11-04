<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/settings/production/views/ProductionSettingsView.vue -->
<script setup lang="ts">
import {
  MpToggle, MpIcon,
  MpBanner, MpBannerIcon, MpBannerDescription,
  MpFormControl, MpFormLabel,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  getProductionSettings, saveProductionSettings, PLAN_PERIOD_OPTIONS,
  type ProductionSettings, type PlanPeriodRule,
} from '~/data/productionSettings'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()

type SectionKey = 'general' | 'readiness' | 'integration'

const committed = reactive<ProductionSettings>(getProductionSettings())
const draft = reactive<ProductionSettings>({ ...committed })
const editing = ref<SectionKey | null>(null)
const isSaving = ref(false)

const planPeriodOptions = PLAN_PERIOD_OPTIONS.map(o => ({ value: o.id, label: o.name }))
const planPeriodLabel = computed(() => PLAN_PERIOD_OPTIONS.find(o => o.id === committed.productionPlanDate)?.name ?? '-')

// Partial production and partial consumption are mutually exclusive: turning one
// on turns the other off.
watch(() => draft.partialProduction, (on) => { if (on) draft.partialConsumption = false })
watch(() => draft.partialConsumption, (on) => { if (on) draft.partialProduction = false })

function edit(section: SectionKey) {
  Object.assign(draft, committed)
  editing.value = section
}
function cancel() {
  Object.assign(draft, committed)
  editing.value = null
}
async function save() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 500))
  Object.assign(committed, draft)
  saveProductionSettings({ ...committed })
  isSaving.value = false
  editing.value = null
  successToast(t('Production settings changes saved'))
}

// View mode always reads the committed value; the draft only drives the section in edit.
function val<K extends keyof ProductionSettings>(section: SectionKey, key: K): ProductionSettings[K] {
  return editing.value === section ? draft[key] : committed[key]
}
</script>

<template>
  <div class="ps-page">

    <!-- ── General settings ── -->
    <section class="ps-section">
      <div class="ps-section-header">
        <div class="ps-section-meta">
          <h2 class="ps-section-title">{{ t('General settings') }}</h2>
          <p class="ps-section-desc">{{ t('Configure production planning rules and date entry preferences.') }}</p>
        </div>
        <button v-if="editing !== 'general'" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="edit('general')">
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <div class="ps-rows">
        <div v-if="editing === 'general'" class="ps-edit-field">
          <MpFormControl id="ps-plan-period" is-required>
            <MpFormLabel>{{ t('Production plan period') }}</MpFormLabel>
            <ErpFilterSelect
              id="ps-plan-period-select"
              :model-value="draft.productionPlanDate"
              placeholder="Production plan period"
              :options="planPeriodOptions"
              :is-clearable="false"
              width="270px"
              @update:model-value="(v: string) => (draft.productionPlanDate = v as PlanPeriodRule)"
            />
          </MpFormControl>
        </div>
        <div v-else class="ps-row">
          <div class="ps-row-info">
            <span class="ps-row-title">{{ t('Require production plan period') }}</span>
            <span class="ps-row-desc">{{ t('Set whether a plan period must be filled in when creating a production plan.') }}</span>
          </div>
          <span class="ps-row-value">{{ t(planPeriodLabel) }}</span>
        </div>

        <div class="ps-row">
          <div class="ps-row-info">
            <span class="ps-row-title">{{ t('Allow backdated entries') }}</span>
            <span class="ps-row-desc">{{ t('Entries can be saved with a date earlier than today.') }}</span>
          </div>
          <span class="ps-toggle">
            <MpToggle
              :is-checked="val('general', 'backdated')"
              :is-disabled="editing !== 'general' || isSaving"
              :aria-label="t('Allow backdated entries')"
              @update:is-checked="(v: boolean) => (draft.backdated = v)"
            />
          </span>
        </div>
      </div>

      <div v-if="editing === 'general'" class="ps-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="cancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="save">{{ isSaving ? t('Saving…') : t('Save changes') }}</button>
      </div>
    </section>

    <!-- ── Production readiness ── -->
    <section class="ps-section">
      <div class="ps-section-header">
        <div class="ps-section-meta">
          <h2 class="ps-section-title">{{ t('Production readiness') }}</h2>
          <p class="ps-section-desc">{{ t('Configure readiness conditions and material consumption rules for production.') }}</p>
        </div>
        <button v-if="editing !== 'readiness'" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="edit('readiness')">
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <MpBanner v-if="editing === 'readiness'" id="ps-exclusive-banner" variant="info" is-inline class="ps-banner">
        <MpBannerIcon id="ps-exclusive-banner-icon" />
        <MpBannerDescription>{{ t('Only one of these settings can be active at a time. Turning one on will automatically turn the other off.') }}</MpBannerDescription>
      </MpBanner>

      <div class="ps-rows">
        <div class="ps-row">
          <div class="ps-row-info">
            <span class="ps-row-title">{{ t('Allow partial production') }}</span>
            <span class="ps-row-desc">{{ t('Users can partially complete a production process and continue the remaining work on the same work order or a new one.') }}</span>
          </div>
          <span class="ps-toggle">
            <MpToggle
              :is-checked="val('readiness', 'partialProduction')"
              :is-disabled="editing !== 'readiness' || isSaving"
              :aria-label="t('Allow partial production')"
              @update:is-checked="(v: boolean) => (draft.partialProduction = v)"
            />
          </span>
        </div>
        <div class="ps-row">
          <div class="ps-row-info">
            <span class="ps-row-title">{{ t('Allow partial consumption') }}</span>
            <span class="ps-row-desc">{{ t('Users can record material consumption in stages throughout the production process.') }}</span>
          </div>
          <span class="ps-toggle">
            <MpToggle
              :is-checked="val('readiness', 'partialConsumption')"
              :is-disabled="editing !== 'readiness' || isSaving"
              :aria-label="t('Allow partial consumption')"
              @update:is-checked="(v: boolean) => (draft.partialConsumption = v)"
            />
          </span>
        </div>
      </div>

      <div v-if="editing === 'readiness'" class="ps-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="cancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="save">{{ isSaving ? t('Saving…') : t('Save changes') }}</button>
      </div>
    </section>

    <!-- ── Integration ── -->
    <section class="ps-section">
      <div class="ps-section-header">
        <div class="ps-section-meta">
          <h2 class="ps-section-title">{{ t('Integration') }}</h2>
          <p class="ps-section-desc">{{ t('Connect the Production module with other modules in Mekari ERP.') }}</p>
        </div>
        <button v-if="editing !== 'integration'" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="edit('integration')">
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <div class="ps-rows">
        <div class="ps-row">
          <div class="ps-row-info">
            <span class="ps-row-title">{{ t('Sales order to work order') }}</span>
            <span class="ps-row-desc">{{ t('Request a work order directly from a sales order without opening the Production module.') }}</span>
          </div>
          <span class="ps-toggle">
            <MpToggle
              :is-checked="val('integration', 'salesOrderIntegration')"
              :is-disabled="editing !== 'integration' || isSaving"
              :aria-label="t('Sales order to work order')"
              @update:is-checked="(v: boolean) => (draft.salesOrderIntegration = v)"
            />
          </span>
        </div>
      </div>

      <div v-if="editing === 'integration'" class="ps-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="cancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="save">{{ isSaving ? t('Saving…') : t('Save changes') }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ps-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  gap: var(--mp-spacing-8);
  overflow-y: auto;
  height: 100%;
}
.ps-section { grid-column: 1 / 8; display: flex; flex-direction: column; }
.ps-section-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3);
}
.ps-section-meta { display: flex; flex-direction: column; }
.ps-section-title { margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ps-section-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.ps-banner { margin-bottom: var(--mp-spacing-2); }
.ps-rows { display: flex; flex-direction: column; }
.ps-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-6); padding: var(--mp-spacing-3) 0;
}
.ps-edit-field { padding: var(--mp-spacing-3) 0; }
.ps-row-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.ps-row-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ps-row-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ps-row-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); flex-shrink: 0; }
.ps-toggle { display: inline-flex; flex-shrink: 0; }
.ps-action-bar { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); }
.ps-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
