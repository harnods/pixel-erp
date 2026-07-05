<script setup lang="ts">
import {
  MpToggle, MpIcon,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'

// ─── Persist ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'erp-db:warehouse-settings'

function loadSettings(): { multiLocationStorage: boolean } {
  if (!import.meta.client) return { multiLocationStorage: true }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { multiLocationStorage: true }
  } catch { return { multiLocationStorage: true } }
}

function persistSettings(v: { multiLocationStorage: boolean }) {
  if (!import.meta.client) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch {}
}

// ─── State ───────────────────────────────────────────────────────────────────

const committed = reactive(loadSettings())
const draft     = reactive({ ...committed })

const isEditing   = ref(false)
const isSaving    = ref(false)
const discardOpen = ref(false)

const hasChanges = computed(() =>
  draft.multiLocationStorage !== committed.multiLocationStorage
)

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
  isEditing.value  = false
  discardOpen.value = false
}

async function saveEdit() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  Object.assign(committed, draft)
  persistSettings({ ...committed })
  isSaving.value    = false
  isEditing.value   = false
  toast.notify({ variant: 'success', title: 'Warehouse settings saved.' })
}
</script>

<template>
  <div class="ws-page">

    <!-- ── Warehouse settings section ──────────────────────────────────────── -->
    <section class="ws-section">

      <!-- Header: title + description + Edit button -->
      <div class="ws-header">
        <div class="ws-header-content">
          <h2 class="ws-title">Warehouse settings</h2>
          <p class="ws-desc">Configure how products are stored and tracked across warehouse locations.</p>
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

      <!-- Settings list -->
      <div class="ws-toggle-list">

        <!-- Multi-location storage -->
        <div class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">Multi-location storage</span>
            <span class="ws-toggle-desc">Enable storing a single product across more than one location within the same warehouse.</span>
          </div>
          <MpToggle
            v-model:is-checked="draft.multiLocationStorage"
            :is-disabled="!isEditing"
            aria-label="Multi-location storage"
          />
        </div>

      </div>

      <!-- Action bar (edit mode only) -->
      <div v-if="isEditing" class="ws-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="requestCancel">
          Cancel
        </button>
        <button
          class="btn-enterprise btn-enterprise--primary"
          :disabled="isSaving"
          @click="saveEdit"
        >
          {{ isSaving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>

    </section>

    <!-- ── Discard confirmation dialog ─────────────────────────────────────── -->
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
/* ─── Page root ───────────────────────────────────────────────────────────── */

.ws-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  overflow-y: auto;
  height: 100%;
}

/* ─── Section ─────────────────────────────────────────────────────────────── */

.ws-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  padding-bottom: var(--mp-spacing-6);
}

/* ─── Header row ──────────────────────────────────────────────────────────── */

.ws-header {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--mp-spacing-4);
  align-items: flex-start;
  margin-bottom: var(--mp-spacing-3);
}

.ws-header-content {
  grid-column: 1 / 7;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.ws-header > button {
  grid-column: 7 / -1;
  justify-self: start;
}

.ws-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ws-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
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
  padding: var(--mp-spacing-3) 0;
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
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
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
