<script setup lang="ts">
import {
  MpToggle, MpIcon,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'

// ─── Persist ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'erp-db:warehouse-settings'

interface Settings {
  multiLocationStorage: boolean
  scanThreshold: boolean
  scanThresholdValue: number
  packUsingSourceLabel: boolean
  doublePrintGuard: boolean
}

const DEFAULTS: Settings = {
  multiLocationStorage: true,
  scanThreshold:        true,
  scanThresholdValue:   50,
  packUsingSourceLabel: true,
  doublePrintGuard:     false,
}

function loadSettings(): Settings {
  if (!import.meta.client) return { ...DEFAULTS }
  try {
    const raw    = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return {
      multiLocationStorage: parsed.multiLocationStorage ?? DEFAULTS.multiLocationStorage,
      scanThreshold:        parsed.scanThreshold        ?? DEFAULTS.scanThreshold,
      scanThresholdValue:   parsed.scanThresholdValue   ?? DEFAULTS.scanThresholdValue,
      packUsingSourceLabel: parsed.packUsingSourceLabel ?? DEFAULTS.packUsingSourceLabel,
      doublePrintGuard:     parsed.doublePrintGuard     ?? DEFAULTS.doublePrintGuard,
    }
  } catch { return { ...DEFAULTS } }
}

function persistSettings(v: Settings) {
  if (!import.meta.client) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch {}
}

// ─── State ───────────────────────────────────────────────────────────────────

const committed = reactive(loadSettings())
const draft     = reactive({ ...committed })

const isEditingStorage  = ref(false)
const isEditingOutbound = ref(false)
const isSavingStorage   = ref(false)
const isSavingOutbound  = ref(false)
const discardOpen       = ref(false)
const discardSection    = ref<'storage' | 'outbound'>('storage')

const hasChangesStorage = computed(() =>
  draft.multiLocationStorage !== committed.multiLocationStorage ||
  draft.scanThreshold        !== committed.scanThreshold ||
  draft.scanThresholdValue   !== committed.scanThresholdValue
)

const hasChangesOutbound = computed(() =>
  draft.packUsingSourceLabel !== committed.packUsingSourceLabel ||
  draft.doublePrintGuard     !== committed.doublePrintGuard
)

// ─── Handlers ────────────────────────────────────────────────────────────────

function startEdit(section: 'storage' | 'outbound') {
  Object.assign(draft, committed)
  if (section === 'storage')  isEditingStorage.value  = true
  if (section === 'outbound') isEditingOutbound.value = true
}

function requestCancel(section: 'storage' | 'outbound') {
  const hasChanges = section === 'storage' ? hasChangesStorage.value : hasChangesOutbound.value
  if (hasChanges) { discardSection.value = section; discardOpen.value = true }
  else exitEdit(section)
}

function exitEdit(section: 'storage' | 'outbound') {
  Object.assign(draft, committed)
  if (section === 'storage')  isEditingStorage.value  = false
  if (section === 'outbound') isEditingOutbound.value = false
  discardOpen.value = false
}

async function saveEdit(section: 'storage' | 'outbound') {
  if (section === 'storage')  isSavingStorage.value  = true
  if (section === 'outbound') isSavingOutbound.value = true
  await new Promise(r => setTimeout(r, 600))
  Object.assign(committed, draft)
  persistSettings({ ...committed })
  if (section === 'storage')  { isSavingStorage.value  = false; isEditingStorage.value  = false }
  if (section === 'outbound') { isSavingOutbound.value = false; isEditingOutbound.value = false }
  toast.notify({ variant: 'success', title: 'Warehouse settings saved.' , maxWidth: 'max-content'})
}
</script>

<template>
  <div class="ws-page">

    <!-- ── Storage section ───────────────────────────────────────────────── -->
    <section class="ws-section">
      <div class="ws-section-header">
        <div class="ws-section-meta">
          <h2 class="ws-section-title">Storage</h2>
          <p class="ws-section-desc">Configure how products are stored and tracked across warehouse locations.</p>
        </div>
        <button
          v-if="!isEditingStorage"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="startEdit('storage')"
        >
          <MpIcon name="edit" size="sm" />
          Edit
        </button>
      </div>

      <div class="ws-toggle-list">

        <!-- Multi-location storage -->
        <div class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">Multi-location storage</span>
            <span class="ws-toggle-desc">Allow a single product to be stored across multiple locations within the same warehouse.</span>
          </div>
          <MpToggle
            v-model:is-checked="draft.multiLocationStorage"
            :is-disabled="!isEditingStorage"
            aria-label="Multi-location storage"
          />
        </div>

        <!-- Barcode scan threshold -->
        <div class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">Barcode scan threshold</span>
            <span class="ws-toggle-desc">Items at or below this quantity must be scanned one by one. Above the limit, operators can enter the quantity manually.</span>
          </div>
          <MpToggle
            v-model:is-checked="draft.scanThreshold"
            :is-disabled="!isEditingStorage"
            aria-label="Barcode scan threshold"
          />
        </div>

        <!-- Threshold qty sub-row -->
        <div v-if="draft.scanThreshold" class="ws-sub-row">
          <span class="ws-sub-label">Threshold qty</span>
          <span class="ws-sub-value">{{ draft.scanThresholdValue }} pcs</span>
        </div>

      </div>

      <div v-if="isEditingStorage" class="ws-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSavingStorage" @click="requestCancel('storage')">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSavingStorage" @click="saveEdit('storage')">
          {{ isSavingStorage ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </section>

    <!-- ── Outbound section ───────────────────────────────────────────────── -->
    <section class="ws-section">
      <div class="ws-section-header">
        <div class="ws-section-meta">
          <h2 class="ws-section-title">Outbound delivery</h2>
          <p class="ws-section-desc">Set rules for outbound order fulfillment, including shipping label handling and print restrictions.</p>
        </div>
        <button
          v-if="!isEditingOutbound"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="startEdit('outbound')"
        >
          <MpIcon name="edit" size="sm" />
          Edit
        </button>
      </div>

      <div class="ws-toggle-list">

        <!-- Require source shipping label -->
        <div class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">Require source shipping label</span>
            <span class="ws-toggle-desc">Packing cannot begin until the shipping label from the order source (e.g. marketplace) has been received.</span>
          </div>
          <MpToggle
            v-model:is-checked="draft.packUsingSourceLabel"
            :is-disabled="!isEditingOutbound"
            aria-label="Require source shipping label"
          />
        </div>

        <!-- Prevent label reprinting -->
        <div class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">Prevent label reprinting</span>
            <span class="ws-toggle-desc">Once an outbound shipping label has been printed, it cannot be printed again. Applies to labels from the order source.</span>
          </div>
          <MpToggle
            v-model:is-checked="draft.doublePrintGuard"
            :is-disabled="!isEditingOutbound"
            aria-label="Prevent label reprinting"
          />
        </div>

      </div>

      <div v-if="isEditingOutbound" class="ws-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSavingOutbound" @click="requestCancel('outbound')">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSavingOutbound" @click="saveEdit('outbound')">
          {{ isSavingOutbound ? 'Saving…' : 'Save changes' }}
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
          <button class="btn-enterprise btn-enterprise--danger" @click="exitEdit(discardSection)">Discard</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>
</template>

<style scoped>
/* ─── Page root ───────────────────────────────────────────────────────────── */

.ws-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  gap: var(--mp-spacing-6);
  overflow-y: auto;
  height: 100%;
}

/* ─── Section ─────────────────────────────────────────────────────────────── */

.ws-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  row-gap: 0;
}

/* ─── Section header ──────────────────────────────────────────────────────── */

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

/* ─── Toggle list ─────────────────────────────────────────────────────────── */

.ws-toggle-list {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
}

.ws-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
}

.ws-toggle-info {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
}

.ws-toggle-title {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.ws-toggle-desc {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}

/* ─── Threshold qty sub-row ──────────────────────────────────────────────── */

.ws-sub-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-2) 0;
  padding-left: var(--mp-spacing-4);
}

.ws-sub-label {
  width: 160px;
  flex-shrink: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
}

.ws-sub-value {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
}

/* ─── Action bar ──────────────────────────────────────────────────────────── */

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

/* ─── Dialog body ─────────────────────────────────────────────────────────── */

.ws-dialog-body {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}
</style>
