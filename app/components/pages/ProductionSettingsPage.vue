<script setup lang="ts">
/**
 * Production settings — built to the Figma "Production Material Requisition &
 * Reservation" › Production settings: three groups, each row a label on the left
 * and its control right-aligned.
 *
 * Cross-reference: PRD UC-00 (S-1 reservation method, S-2 entry-point gating,
 * S-3 retained v1 settings).
 */
import { MpToggle, MpIcon, MpTooltip } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  productionSettings, saveProductionSettings,
  PLAN_DATE_FIELD_OPTIONS, RESERVATION_METHOD_OPTIONS,
} from '~/data/productionSettings'

const { t } = useLocale()

// ErpFilterSelect speaks strings; these adapt it to the typed setting.
const planDateField = computed({
  get: () => productionSettings.planDateField,
  set: (v) => saveProductionSettings({ planDateField: (v || 'required') as typeof productionSettings.planDateField }),
})
const reservationMethod = computed({
  get: () => productionSettings.reservationMethod,
  set: (v) => saveProductionSettings({ reservationMethod: (v || 'one-step') as typeof productionSettings.reservationMethod }),
})

const planDateOptions = computed(() => PLAN_DATE_FIELD_OPTIONS.map(o => ({ ...o, label: t(o.label) })))
const methodOptions = computed(() =>
  RESERVATION_METHOD_OPTIONS.map(o => ({ ...o, label: t(o.label), description: t(o.description) })))
</script>

<template>
  <div class="ps-page">
    <!-- ── Production planning ── -->
    <section class="ps-section">
      <h2 class="ps-heading">{{ t('Production planning') }}</h2>

      <div class="ps-row">
        <span class="ps-label">{{ t('Production plan date field') }}</span>
        <ErpFilterSelect
          id="ps-plan-date" v-model="planDateField"
          :placeholder="t('Production plan date field')" :options="planDateOptions"
          :is-clearable="false" width="100%" class="ps-control"
        />
      </div>

      <div class="ps-row">
        <span class="ps-label">{{ t('Allow backdate') }}</span>
        <div class="ps-control">
          <MpToggle
            id="ps-allow-backdate" :is-checked="productionSettings.allowBackdate"
            @change="saveProductionSettings({ allowBackdate: !productionSettings.allowBackdate })"
          />
        </div>
      </div>
    </section>

    <!-- ── Production readiness ── -->
    <section class="ps-section">
      <h2 class="ps-heading">{{ t('Production readiness') }}</h2>

      <div class="ps-row">
        <span class="ps-label">
          {{ t('Allow partial production') }}
          <MpTooltip :label="t('Close a work order in batches, before the full planned quantity is produced.')" placement="top">
            <MpIcon name="information" size="sm" class="ps-info" />
          </MpTooltip>
        </span>
        <div class="ps-control">
          <MpToggle
            id="ps-allow-partial" :is-checked="productionSettings.allowPartialProduction"
            @change="saveProductionSettings({ allowPartialProduction: !productionSettings.allowPartialProduction })"
          />
        </div>
      </div>

      <div class="ps-row">
        <span class="ps-label">
          {{ t('Can start work order with limited stock') }}
          <MpTooltip :label="t('When off, a work order can only start once every component is reserved.')" placement="top">
            <MpIcon name="information" size="sm" class="ps-info" />
          </MpTooltip>
        </span>
        <div class="ps-control">
          <MpToggle
            id="ps-start-limited" :is-checked="productionSettings.allowStartWithLimitedStock"
            @change="saveProductionSettings({ allowStartWithLimitedStock: !productionSettings.allowStartWithLimitedStock })"
          />
        </div>
      </div>
    </section>

    <!-- ── Component request & reservation ── -->
    <section class="ps-section">
      <h2 class="ps-heading">{{ t('Component request & reservation') }}</h2>

      <div class="ps-row">
        <span class="ps-label">
          {{ t('Product components must be reserved') }}
          <span class="ps-label-desc">{{ t('Triggers reservation when a work order is created') }}</span>
        </span>
        <div class="ps-control">
          <MpToggle
            id="ps-must-reserve" :is-checked="productionSettings.componentsMustBeReserved"
            @change="saveProductionSettings({ componentsMustBeReserved: !productionSettings.componentsMustBeReserved })"
          />
        </div>
      </div>

      <!-- The method only means anything while reservation is on. -->
      <div v-if="productionSettings.componentsMustBeReserved" class="ps-row">
        <span class="ps-label">{{ t('Reservation method') }}</span>
        <ErpFilterSelect
          id="ps-method" v-model="reservationMethod"
          :placeholder="t('Reservation method')" :options="methodOptions"
          :is-clearable="false" width="100%" class="ps-control"
        />
      </div>

      <p v-if="productionSettings.componentsMustBeReserved && productionSettings.reservationMethod === 'two-step'" class="ps-note">
        <MpIcon name="information" size="sm" />
        {{ t('Work orders show an info badge instead of reservation actions: "Reservation via Stock requests only (PPIC / stockist)".') }}
      </p>
    </section>
  </div>
</template>

<style scoped>
.ps-page { display: flex; flex-direction: column; gap: var(--mp-spacing-8); max-width: 880px; }

.ps-section { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.ps-heading {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-default, #080d0e);
}

/* Label left, control right — the control column is a fixed share of the row so
   every select and toggle in the page lines up on one edge. */
.ps-row {
  display: grid; grid-template-columns: minmax(0, 1fr) 320px;
  align-items: start; gap: var(--mp-spacing-6);
}
.ps-label {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #3a4749);
  padding-top: var(--mp-spacing-2);
}
.ps-label-desc {
  flex-basis: 100%;
  font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-subtle, #656f80);
}
.ps-info { color: var(--mp-colors-icon-subtle, #97a0af); flex-shrink: 0; }

.ps-control { width: 100%; justify-self: start; padding-top: var(--mp-spacing-2); }
/* The select fills the control column rather than its own default width. */
.ps-control :deep(.efs) { width: 100%; }

.ps-note {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2); margin: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #3a4749);
}
</style>
