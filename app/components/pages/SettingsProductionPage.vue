<script setup lang="ts">
/**
 * Production settings — the page behind Settings › Production and the Production
 * menu's settings shortcut (R21).
 *
 * Same read / Edit → Save changes shape as Warehouse settings. One deliberate
 * difference: the toggle sits on the LEFT with its label on the right, 12px
 * apart (rule/form-toggle-inline) — the Warehouse page predates that rule.
 */
import {
  MpToggle, MpIcon,
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

const hasChanges = computed(() => draft.partialProduction !== productionSettings.partialProduction)

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
</script>

<template>
  <div class="ps-page">
    <section class="ps-section">
      <div class="ps-section-header">
        <div class="ps-section-meta">
          <h2 class="ps-section-title">{{ t('Production settings') }}</h2>
          <p class="ps-section-desc">{{ t('Configure how work orders are produced and closed.') }}</p>
        </div>
        <button
          v-if="!isEditing"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="startEdit"
        >
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <div class="ps-toggle-list">
        <h3 class="ps-subsection-title">{{ t('Work orders') }}</h3>

        <!-- Toggle LEFT, label RIGHT, 12px gap (rule/form-toggle-inline). -->
        <div class="ps-toggle-row">
          <MpToggle
            id="ps-partial-production"
            v-model:is-checked="draft.partialProduction"
            :is-disabled="!isEditing"
            :aria-label="t('Partial production')"
          />
          <span class="ps-toggle-info">
            <span class="ps-toggle-title">{{ t('Partial production') }}</span>
            <span class="ps-toggle-desc">{{ t('Record part of a work order’s output at a time. When off, a work order offers Complete alone, and a subcon order issues all its components when it starts.') }}</span>
          </span>
        </div>
      </div>

      <div v-if="isEditing" class="ps-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" @click="requestCancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" @click="saveEdit">
          {{ isSaving ? t('Saving…') : t('Save changes') }}
        </button>
      </div>
    </section>

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
          <button class="btn-enterprise btn-enterprise--ghost" @click="discardOpen = false">{{ t('Keep editing') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="exitEdit">{{ t('Discard') }}</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.ps-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  gap: var(--mp-spacing-6);
  overflow-y: auto;
  height: 100%;
}
.ps-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  row-gap: 0;
}
.ps-section-header {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
  margin-bottom: var(--mp-spacing-3);
}
.ps-section-meta { grid-column: 1 / 7; display: flex; flex-direction: column; }
.ps-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ps-section-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.ps-section-header > button { grid-column: 7 / -1; justify-self: start; }
.ps-toggle-list { grid-column: 1 / 7; display: flex; flex-direction: column; }
.ps-subsection-title {
  margin: 0;
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
/* rule/form-toggle-inline — toggle left, label right, 12px gap, left-aligned.
   A div, not a label: MpToggle is itself a <label>, and nesting one inside
   another collapsed it to nothing. */
.ps-toggle-row > :first-child { flex: none; }
.ps-toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) 0;
}
.ps-toggle-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.ps-toggle-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ps-toggle-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ps-action-bar {
  grid-column: 1 / 7;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4);
}
.ps-dialog-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
</style>
