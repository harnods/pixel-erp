<script setup lang="ts">
/**
 * Production settings — the page behind Settings › Production and the Production
 * menu's settings shortcut (R21).
 *
 * Same read / Edit → Save changes shape as Warehouse settings. Layout follows the
 * Production settings design (2026-10-16): three sections, each row a label +
 * description on the left and its value in a column on the right. That puts the
 * toggle right of its label — a deliberate, user-directed exception to
 * rule/form-toggle-inline, which governs toggles inside forms.
 *
 * Edit appears only while the pointer is over the settings area, or while focus
 * is inside it, so keyboard users still reach it.
 */
import {
  MpButton, MpToggle, MpAutocomplete,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import { productionSettings, saveProductionSettings, type ProductionSettings } from '~/data/productionSettings'

const { t } = useLocale()

const draft = reactive<ProductionSettings>({ ...productionSettings })
const isEditing = ref(false)
const isSaving = ref(false)
const discardOpen = ref(false)

type ToggleKey = 'allowBackdatedEntries' | 'partialProduction' | 'partialConsumption' | 'salesOrderToWorkOrder'

const PLAN_PERIOD_OPTIONS = computed(() => [
  { id: 'required', name: t('Required') },
  { id: 'optional', name: t('Optional') },
])
/** The select speaks ids; the store keeps a boolean. */
const planPeriodChoice = computed({
  get: () => (draft.requirePlanPeriod ? 'required' : 'optional'),
  set: (v: string) => { draft.requirePlanPeriod = v !== 'optional' },
})

const hasChanges = computed(() =>
  (Object.keys(productionSettings) as (keyof ProductionSettings)[])
    .some(k => draft[k] !== productionSettings[k]))

function startEdit() {
  Object.assign(draft, productionSettings)
  isEditing.value = true
}
function requestCancel() {
  if (hasChanges.value) discardOpen.value = true
  else exitEdit()
}
function exitEdit() {
  Object.assign(draft, productionSettings)
  isEditing.value = false
  discardOpen.value = false
}
async function saveEdit() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  saveProductionSettings({ ...draft })
  isSaving.value = false
  isEditing.value = false
  toast.notify({ variant: 'success', title: t('Production settings changes saved'), maxWidth: 'max-content' })
}

const SECTIONS = computed<{ title: string; desc: string; rows: { key: ToggleKey | 'requirePlanPeriod'; title: string; desc: string }[] }[]>(() => [
  {
    title: t('General settings'),
    desc: t('Configure production planning rules and date entry preferences.'),
    rows: [
      { key: 'requirePlanPeriod', title: t('Require production plan period'), desc: t('Set whether a plan period must be filled in when creating a production plan.') },
      { key: 'allowBackdatedEntries', title: t('Allow backdated entries'), desc: t('Entries can be saved with a date earlier than today.') },
    ],
  },
  {
    title: t('Production readiness'),
    desc: t('Configure readiness conditions and material consumption rules for production.'),
    rows: [
      { key: 'partialProduction', title: t('Allow partial production'), desc: t('Users can partially complete a production process and continue the remaining work on the same work order or a new one.') },
      { key: 'partialConsumption', title: t('Allow partial consumption'), desc: t('Users can record material consumption in stages throughout the production process.') },
    ],
  },
  {
    title: t('Integration'),
    desc: t('Connect the Production module with other modules in Mekari ERP.'),
    rows: [
      { key: 'salesOrderToWorkOrder', title: t('Sales order to work order'), desc: t('Request a work order directly from a sales order without opening the Production module.') },
    ],
  },
])
</script>

<template>
  <div class="ps-page" :class="{ 'ps-page--editing': isEditing }" data-devchange="production-settings-layout">
    <MpButton
      v-if="!isEditing"
      variant="secondary"
      class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before ps-edit"
      left-icon="edit"
      data-devchange="production-settings-hover-edit"
      @click="startEdit"
    >
      {{ t('Edit') }}
    </MpButton>

    <section v-for="section in SECTIONS" :key="section.title" class="ps-section">
      <h2 class="ps-section-title">{{ section.title }}</h2>
      <p class="ps-section-desc">{{ section.desc }}</p>

      <div v-for="row in section.rows" :key="row.key" class="ps-row">
        <div class="ps-row-info">
          <span :id="`ps-${row.key}-label`" class="ps-row-title">{{ row.title }}</span>
          <span class="ps-row-desc">{{ row.desc }}</span>
        </div>
        <div class="ps-row-value">
          <template v-if="row.key === 'requirePlanPeriod'">
            <!-- Wrapper carries the width: the class on MpAutocomplete lands on
                 the inner input, and the root still filled the column. -->
            <div v-if="isEditing" class="ps-select">
              <MpAutocomplete
                id="ps-plan-period-ac"
                v-model="planPeriodChoice"
                :data="PLAN_PERIOD_OPTIONS"
                label-prop="name"
                value-prop="id"
                use-portal
              />
            </div>
            <span v-else class="ps-value-text">{{ draft.requirePlanPeriod ? t('Required') : t('Optional') }}</span>
          </template>
          <MpToggle
            v-else
            :id="`ps-${row.key}`"
            v-model:is-checked="draft[row.key]"
            :is-disabled="!isEditing"
            :aria-label="row.title"
          />
        </div>
      </div>
    </section>

    <div v-if="isEditing" class="ps-action-bar">
      <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" :is-disabled="isSaving" @click="requestCancel">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" :is-disabled="isSaving" @click="saveEdit">
        {{ isSaving ? t('Saving…') : t('Save changes') }}
      </MpButton>
    </div>

    <!-- Discard confirmation — closes only via its × or a button
         (rule/modal-drawer-close-explicit-only). -->
    <MpModal
      id="ps-discard-dialog"
      :is-close-on-esc="false" :is-close-on-overlay-click="false"
      :is-open="discardOpen"
      size="md"
      @close="discardOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ t('Discard unsaved changes?') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <p class="ps-dialog-body">{{ t('Your changes will not be saved.') }}</p>
        </MpModalBody>
        <MpModalFooter>
          <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="discardOpen = false">{{ t('Keep editing') }}</MpButton>
          <MpButton variant="danger" class="btn-enterprise btn-enterprise--danger" @click="exitEdit">{{ t('Discard') }}</MpButton>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.ps-page {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-10, 40px);
  overflow-y: auto;
  height: 100%;
}
/* Edit shows only while the settings area is hovered or holds focus. Opacity,
   not visibility, so the button stays in the tab order and appears on focus. */
.ps-edit {
  position: absolute;
  top: 0;
  right: 0;
  opacity: 0;
  transition: opacity 120ms ease;
}
.ps-page:hover .ps-edit,
.ps-page:focus-within .ps-edit { opacity: 1; }

.ps-section {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  column-gap: var(--mp-spacing-6);
  row-gap: var(--mp-spacing-6);
  align-content: start;
}
.ps-section-title {
  grid-column: 1 / 9;
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ps-section-desc {
  grid-column: 1 / -1;
  margin: calc(-1 * var(--mp-spacing-4)) 0 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}
.ps-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: start;
}
.ps-row-info { grid-column: 1 / 6; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ps-row-value { grid-column: 6 / 10; display: flex; align-items: center; min-height: 24px; }
.ps-row-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ps-row-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.ps-value-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ps-select { width: 267px; max-width: 100%; }
.ps-action-bar {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
}
.ps-dialog-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
</style>
