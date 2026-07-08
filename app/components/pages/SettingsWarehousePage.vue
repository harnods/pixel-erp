<script setup lang="ts">
import {
  MpToggle, MpIcon, MpAutocomplete,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import {
  getWarehouseSettings, saveWarehouseSettings,
  BATCH_RULE_OPTIONS, SERIAL_RULE_OPTIONS,
  type WarehouseSettings,
} from '~/data/warehouseSettings'

// ─── Persist ─────────────────────────────────────────────────────────────────

function loadSettings(): WarehouseSettings { return getWarehouseSettings() }
function persistSettings(v: WarehouseSettings): void { saveWarehouseSettings(v) }

// ─── State ───────────────────────────────────────────────────────────────────

const committed = reactive(loadSettings())
const draft     = reactive({ ...committed })

const isEditing   = ref(false)
const isSaving    = ref(false)
const discardOpen = ref(false)

const hasChanges = computed(() =>
  draft.multiLocationStorage !== committed.multiLocationStorage ||
  draft.batchSelectionRule   !== committed.batchSelectionRule   ||
  draft.serialSelectionRule  !== committed.serialSelectionRule
)

const batchRuleLabel  = computed(() => BATCH_RULE_OPTIONS.find(o => o.id === draft.batchSelectionRule)?.name ?? '')
const serialRuleLabel = computed(() => SERIAL_RULE_OPTIONS.find(o => o.id === draft.serialSelectionRule)?.name ?? '')

// ─── Handlers ────────────────────────────────────────────────────────────────

function startEdit() {
  Object.assign(draft, committed)
  isEditing.value = true
}

function requestCancel() {
  if (hasChanges.value) discardOpen.value = true
  else exitEdit()
}

function exitEdit() {
  Object.assign(draft, committed)
  isEditing.value = false
  discardOpen.value = false
}

async function saveEdit() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  Object.assign(committed, draft)
  persistSettings({ ...committed })
  isSaving.value = false
  isEditing.value = false
  toast.notify({ variant: 'success', title: 'Warehouse settings saved.', maxWidth: 'max-content' })
}
</script>

<template>
  <div class="ws-page">

    <section class="ws-section">
      <div class="ws-section-header">
        <div class="ws-section-meta">
          <h2 class="ws-section-title">Settings</h2>
          <p class="ws-section-desc">Configure global warehouse rules for storage and outbound fulfillment.</p>
        </div>
        <button
          v-if="!isEditing"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="startEdit"
        >
          <MpIcon name="edit" size="sm" />
          Edit
        </button>
      </div>

      <div class="ws-toggle-list">

        <h3 class="ws-subsection-title">Storage</h3>

        <div class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">Multi-location storage</span>
            <span class="ws-toggle-desc">Allow a single product to be stored across multiple locations within the same warehouse.</span>
          </div>
          <MpToggle
            v-model:is-checked="draft.multiLocationStorage"
            :is-disabled="!isEditing"
            aria-label="Multi-location storage"
          />
        </div>

        <h3 class="ws-subsection-title ws-subsection-title--spaced">Outbound delivery</h3>
        <p class="ws-subsection-desc">
          WMS auto-selects a batch/serial at outbound task creation using the rule below, only
          when the source doesn't already supply one. Supplied details are always honored as-is.
        </p>

        <div class="ws-toggle-row ws-toggle-row--rule">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">Batch selection rule</span>
            <span class="ws-toggle-desc">Falls back to batch created date (earliest first) when FEFO is selected but a batch has no expiry date.</span>
          </div>
          <MpAutocomplete
            v-if="isEditing"
            id="ws-batch-rule-ac"
            v-model="draft.batchSelectionRule"
            :data="BATCH_RULE_OPTIONS"
            label-prop="name"
            value-prop="id"
            use-portal
            class="ws-rule-select"
          />
          <span v-else class="ws-rule-value">{{ batchRuleLabel }}</span>
        </div>

        <div class="ws-toggle-row ws-toggle-row--rule">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">Serial number selection rule</span>
            <span class="ws-toggle-desc">Serial numbers have no expiry date, so FEFO doesn't apply — pick an ordering instead.</span>
          </div>
          <MpAutocomplete
            v-if="isEditing"
            id="ws-serial-rule-ac"
            v-model="draft.serialSelectionRule"
            :data="SERIAL_RULE_OPTIONS"
            label-prop="name"
            value-prop="id"
            use-portal
            class="ws-rule-select"
          />
          <span v-else class="ws-rule-value">{{ serialRuleLabel }}</span>
        </div>

      </div>

      <div v-if="isEditing" class="ws-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="requestCancel">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="saveEdit">
          {{ isSaving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </section>

    <!-- ── Discard confirmation dialog ────────────────────────────────────── -->
    <MpModal
      id="ws-discard-dialog"
      :is-open="discardOpen"
      size="sm"
      is-close-on-esc
      is-close-on-overlay-click
      @close="discardOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          Discard unsaved changes?
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <p class="ws-dialog-body">Your changes will not be saved.</p>
        </MpModalBody>
        <MpModalFooter>
          <button class="btn-enterprise btn-enterprise--ghost" @click="discardOpen = false">Keep editing</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="exitEdit">Discard</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>
</template>

<style scoped>
.ws-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  gap: var(--mp-spacing-6);
  overflow-y: auto;
  height: 100%;
}

.ws-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  row-gap: 0;
}

.ws-section-header {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
  margin-bottom: var(--mp-spacing-3);
}

.ws-section-meta {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
}

.ws-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ws-section-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}

.ws-section-header > button {
  grid-column: 7 / -1;
  justify-self: start;
}

.ws-toggle-list {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
}

.ws-subsection-title {
  margin: 0;
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ws-subsection-title--spaced {
  margin-top: var(--mp-spacing-3);
}

.ws-subsection-desc {
  margin: 0 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}

.ws-rule-select {
  width: 260px;
  flex-shrink: 0;
}

.ws-rule-value {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  flex-shrink: 0;
}

.ws-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
}

/* Rule rows (Batch/Serial selection): fixed-width label column so both rows'
   labels line up, then the value in its own column 24px away — top-aligned
   with the title, not centered against the 2-line info block. */
.ws-toggle-row--rule {
  display: grid;
  grid-template-columns: 320px auto;
  justify-content: start;
  column-gap: var(--mp-spacing-6);
  align-items: flex-start;
}

.ws-toggle-info {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
}

.ws-toggle-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ws-toggle-desc {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.ws-action-bar {
  grid-column: 1 / 7;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4);
}

.ws-action-bar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ws-dialog-body {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
</style>
