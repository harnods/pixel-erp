<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/settings/production/views/ProductionSettingsView.vue -->
<script setup lang="ts">
import {
  MpToggle, MpIcon,
  MpBanner, MpBannerIcon, MpBannerDescription,
  MpFormControl, MpFormLabel,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  productionSettings, saveProductionSettings, RESERVATION_METHOD_OPTIONS,
  type PlanDateField, type ReservationMethod,
} from '~/data/productionSettings'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()

type SectionKey = 'general' | 'readiness' | 'reservation' | 'integration'

/**
 * What this page edits, in the prod page's own terms. It reads and writes the ONE
 * production settings store (`~/data/productionSettings`) that work orders and the
 * reservation flow read, so a change here is a change everywhere:
 *  • plan period Hide / Optional / Required ↔ `planDateField`;
 *  • partial production / partial consumption ↔ `partialMode` completion / consume
 *    (mutually exclusive, so one three-way value underneath);
 *  • Component request & reservation (PRD Work Order: Material Reservation v0.6,
 *    UC-00) ↔ `componentsMustBeReserved` (S-0, default off, forward only) and
 *    `reservationMethod` (S-1).
 */
type PlanPeriodRule = 'hide' | 'optional' | 'required'
interface View {
  productionPlanDate: PlanPeriodRule
  backdated: boolean
  partialProduction: boolean
  partialConsumption: boolean
  salesOrderIntegration: boolean
  componentsMustBeReserved: boolean
  reservationMethod: ReservationMethod
}
const PLAN_PERIOD_OPTIONS: { id: PlanPeriodRule; name: string }[] = [
  { id: 'hide', name: 'Hide' },
  { id: 'optional', name: 'Optional' },
  { id: 'required', name: 'Required' },
]
const TO_FIELD: Record<PlanPeriodRule, PlanDateField> = { hide: 'hidden', optional: 'optional', required: 'required' }
const FROM_FIELD: Record<PlanDateField, PlanPeriodRule> = { hidden: 'hide', optional: 'optional', required: 'required' }

function fromStore(): View {
  return {
    productionPlanDate: FROM_FIELD[productionSettings.planDateField],
    backdated: productionSettings.allowBackdate,
    partialProduction: productionSettings.partialMode === 'completion',
    partialConsumption: productionSettings.partialMode === 'consume',
    salesOrderIntegration: productionSettings.salesOrderIntegration,
    componentsMustBeReserved: productionSettings.componentsMustBeReserved,
    reservationMethod: productionSettings.reservationMethod,
  }
}
function toStore(v: View) {
  saveProductionSettings({
    planDateField: TO_FIELD[v.productionPlanDate],
    allowBackdate: v.backdated,
    partialMode: v.partialProduction ? 'completion' : v.partialConsumption ? 'consume' : 'none',
    salesOrderIntegration: v.salesOrderIntegration,
    componentsMustBeReserved: v.componentsMustBeReserved,
    reservationMethod: v.reservationMethod,
  })
}

const committed = reactive<View>(fromStore())
const draft = reactive<View>({ ...committed })
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
  toStore(committed)
  isSaving.value = false
  editing.value = null
  successToast(t('Production settings changes saved'))
}

const methodOptions = computed(() =>
  RESERVATION_METHOD_OPTIONS.map(o => ({ value: o.value, label: t(o.label), description: t(o.description) })))
const methodLabel = computed(() => methodOptions.value.find(o => o.value === committed.reservationMethod))

/**
 * UC-04 / D-8 — what the partial mode means for starting a work order, read off
 * the committed settings. The two modes protect different things: partial
 * consumption lets work begin with whatever has arrived, so one secured component
 * is enough; partial production posts output in tranches, and even one finished
 * unit needs a complete set. With reservation off (S-0) the same rule counts stock
 * on hand.
 */
const startGateNote = computed(() => {
  const mode = committed.partialConsumption ? 'consume' : committed.partialProduction ? 'completion' : 'none'
  if (!committed.componentsMustBeReserved) {
    return {
      consume: 'Reservation is off, so a work order can start once at least one component has stock on hand.',
      completion: 'Reservation is off, so a work order can start once every component has some stock on hand.',
      none: 'Reservation is off, so a work order can start only once every component is fully on hand.',
    }[mode]
  }
  return {
    consume: 'A work order can start once at least one component holds a reservation.',
    completion: 'A work order can start once every component holds a reservation, even a partial one.',
    none: 'A work order can start only once every component is reserved in full.',
  }[mode]
})

// View mode always reads the committed value; the draft only drives the section in edit.
function val<K extends keyof View>(section: SectionKey, key: K): View[K] {
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
      <!-- UC-04 — the start rule these settings imply. -->
      <p class="ps-note" data-devchange="ps-start-gate-partial-mode">
        <MpIcon name="info" size="sm" />
        {{ t(startGateNote) }}
      </p>

      <div v-if="editing === 'readiness'" class="ps-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="cancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="save">{{ isSaving ? t('Saving…') : t('Save changes') }}</button>
      </div>
    </section>

    <!-- ── Component request & reservation (PRD Material Reservation v0.6, UC-00) ── -->
    <section class="ps-section">
      <div class="ps-section-header">
        <div class="ps-section-meta">
          <h2 class="ps-section-title">{{ t('Component request & reservation') }}</h2>
          <p class="ps-section-desc">{{ t('Configure how work order components are requested from and reserved in the warehouse.') }}</p>
        </div>
        <button v-if="editing !== 'reservation'" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="edit('reservation')">
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <div class="ps-rows">
        <!-- S-0 — the reservation master switch, as the Figma draws it. -->
        <div class="ps-row" data-devchange="ps-reservation-toggle">
          <div class="ps-row-info">
            <span class="ps-row-title">{{ t('Product components must be reserved') }}</span>
            <span class="ps-row-desc">{{ t('Triggers reservation when a work order is created') }}</span>
          </div>
          <span class="ps-toggle">
            <MpToggle
              id="ps-must-reserve"
              :is-checked="val('reservation', 'componentsMustBeReserved')"
              :is-disabled="editing !== 'reservation' || isSaving"
              :aria-label="t('Product components must be reserved')"
              @update:is-checked="(v: boolean) => (draft.componentsMustBeReserved = v)"
            />
          </span>
        </div>

        <!-- S-1 — the method only means anything while reservation is on. -->
        <template v-if="val('reservation', 'componentsMustBeReserved')">
          <div v-if="editing === 'reservation'" class="ps-edit-field" data-devchange="ps-reservation-method">
            <MpFormControl id="ps-method" is-required>
              <MpFormLabel>{{ t('Reservation method') }}</MpFormLabel>
              <ErpFilterSelect
                id="ps-method-select"
                :model-value="draft.reservationMethod"
                :placeholder="t('Reservation method')"
                :options="methodOptions"
                :is-clearable="false"
                width="270px"
                @update:model-value="(v: string) => (draft.reservationMethod = v as ReservationMethod)"
              />
            </MpFormControl>
          </div>
          <div v-else class="ps-row" data-devchange="ps-reservation-method">
            <div class="ps-row-info">
              <span class="ps-row-title">{{ t('Reservation method') }}</span>
              <span class="ps-row-desc">{{ methodLabel?.description }}</span>
            </div>
            <span class="ps-row-value">{{ methodLabel?.label }}</span>
          </div>
        </template>
      </div>

      <div class="ps-notes">
        <!-- S-0 (v0.6) — forward only: each work order keeps the setting it was created under. -->
        <p class="ps-note" data-devchange="ps-reservation-forward-only">
          <MpIcon name="info" size="sm" />
          {{ t('Applies to work orders created after the change. Existing work orders keep the setting they were created with.') }}
        </p>
        <p v-if="!val('reservation', 'componentsMustBeReserved')" class="ps-note">
          <MpIcon name="info" size="sm" />
          {{ t('New work orders raise no stock request; they start, and consume, against stock on hand.') }}
        </p>
        <p v-else-if="val('reservation', 'reservationMethod') === 'two-step'" class="ps-note">
          <MpIcon name="info" size="sm" />
          {{ t('Work orders show an info badge instead of reservation actions: "Reservation via Stock requests only (PPIC / stockist)".') }}
        </p>
      </div>

      <div v-if="editing === 'reservation'" class="ps-action-bar">
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
.ps-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ps-note {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2); margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle);
}
.ps-note :deep(svg) { flex-shrink: 0; margin-top: var(--mp-spacing-0\.5); }
.ps-action-bar { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); }
.ps-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
