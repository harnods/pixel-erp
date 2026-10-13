<script setup lang="ts">
/**
 * Production settings — built to the Figma "Production Material Requisition &
 * Reservation" › Production settings: three groups, each row a label on the left
 * and its control right-aligned.
 *
 * Cross-reference: PRD v0.5 UC-00 — S-1 reservation method, S-2 entry-point
 * gating, S-3 partial consume / partial completion (mutually exclusive), S-4
 * "start with limited stock", which together decide the start gate (UC-04).
 *
 * There is NO "Product components must be reserved" toggle: reservation is always
 * on (L-12), so the method is the only reservation choice. The Figma still draws
 * that toggle and is stale on this point.
 */
import { MpToggle, MpIcon, MpTooltip } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  productionSettings, saveProductionSettings,
  PLAN_DATE_FIELD_OPTIONS, RESERVATION_METHOD_OPTIONS, PARTIAL_MODE_TOGGLES,
  type PartialMode,
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

/**
 * S-3 — the Figma draws two toggles, but they are one choice: turning either on
 * turns the other off. Turning the active one off returns to 'none'.
 */
function togglePartial(mode: Exclude<PartialMode, 'none'>) {
  saveProductionSettings({ partialMode: productionSettings.partialMode === mode ? 'none' : mode })
}

/**
 * UC-04 / D-8 — what the partial mode means for starting a work order. The two
 * modes protect different things: partial consume lets work begin with whatever
 * has arrived, so one secured component is enough; partial completion posts output
 * in tranches, and even one finished unit needs a complete set.
 */
const startGateNote = computed(() => {
  if (!productionSettings.allowStartWithLimitedStock)
    return 'A work order can start only once every component is reserved in full.'
  switch (productionSettings.partialMode) {
    case 'consume':
      return 'A work order can start once at least one component holds a reservation.'
    case 'completion':
      return 'A work order can start once every component holds a reservation, even a partial one.'
    default:
      return 'Full reservation is still required to start: this setting only takes effect with partial consume or partial completion.'
  }
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

      <!-- S-3 — mutually exclusive: switching one on switches the other off. -->
      <div v-for="opt in PARTIAL_MODE_TOGGLES" :key="opt.mode" class="ps-row">
        <span class="ps-label">
          {{ t(opt.label) }}
          <MpTooltip :label="t(opt.hint)" placement="top">
            <MpIcon name="information" size="sm" class="ps-info" />
          </MpTooltip>
        </span>
        <div class="ps-control">
          <MpToggle
            :id="`ps-partial-${opt.mode}`" :is-checked="productionSettings.partialMode === opt.mode"
            @change="togglePartial(opt.mode)"
          />
        </div>
      </div>

      <p v-if="productionSettings.partialMode !== 'none'" class="ps-note">
        <MpIcon name="information" size="sm" />
        {{ t('Partial consume and partial completion cannot both be on — turning one on turns the other off.') }}
      </p>

      <!-- S-4 — the start gate is a material-control decision, so it gets its own
           setting rather than riding on the partial toggles (which govern what may
           happen AFTER start). What it permits still depends on the partial mode. -->
      <div class="ps-row" data-devchange="ps-limited-stock">
        <span class="ps-label">
          {{ t('Start with limited stock') }}
          <span class="ps-label-desc">{{ t('Begin a work order before every component is reserved in full') }}</span>
        </span>
        <div class="ps-control">
          <MpToggle
            id="ps-limited-stock" :is-checked="productionSettings.allowStartWithLimitedStock"
            @change="saveProductionSettings({ allowStartWithLimitedStock: !productionSettings.allowStartWithLimitedStock })"
          />
        </div>
      </div>

      <!-- UC-04 — spell out what the settings mean for STARTING a work order,
           because no toggle label says it on its own. -->
      <p class="ps-note">
        <MpIcon name="information" size="sm" />
        {{ t(startGateNote) }}
      </p>
    </section>

    <!-- ── Component request & reservation ── -->
    <section class="ps-section">
      <h2 class="ps-heading">{{ t('Component request & reservation') }}</h2>

      <!-- L-12 — reservation itself is not a choice; who reserves is. -->
      <div class="ps-row" data-devchange="ps-reservation-method">
        <span class="ps-label">{{ t('Reservation method') }}</span>
        <ErpFilterSelect
          id="ps-method" v-model="reservationMethod"
          :placeholder="t('Reservation method')" :options="methodOptions"
          :is-clearable="false" width="100%" class="ps-control"
        />
      </div>

      <p class="ps-note">
        <MpIcon name="information" size="sm" />
        {{ t('Every work order raises a stock request — reservation cannot be switched off. The method decides who reserves.') }}
      </p>
      <p v-if="productionSettings.reservationMethod === 'two-step'" class="ps-note">
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
