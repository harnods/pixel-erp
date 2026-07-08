<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpToggle, MpIcon,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig, saveWarehouseConfig, rankStorageLeaves, type WarehouseConfig } from '~/data/warehouseConfig'
import { getStorageLeaves } from '~/data/storageLocations'
import { previewDisablePutAway, disablePutAwayForWarehouse } from '~/data/putAwayTasks'
import { previewDisablePicking, disablePickingForWarehouse } from '~/data/pickingTasks'
import LocationPriorityDrawer from '~/components/patterns/LocationPriorityDrawer.vue'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const warehouse = computed(() => getWarehouseDetail(props.orderId))

function goBack() {
  router.push(`/warehouses/${props.orderId}`)
}

// ─── State ───────────────────────────────────────────────────────────────────
const committed = reactive<WarehouseConfig>(getWarehouseConfig(props.orderId))
const draft     = reactive<WarehouseConfig>({ ...committed })

const isEditing   = ref(false)
const isSaving    = ref(false)
const discardOpen = ref(false)

const hasChanges = computed(() =>
  draft.pickingEnabled         !== committed.pickingEnabled         ||
  draft.putAwayEnabled         !== committed.putAwayEnabled         ||
  draft.allowPartialPicking    !== committed.allowPartialPicking    ||
  draft.requireSourceLabel      !== committed.requireSourceLabel      ||
  draft.preventDuplicateLabel  !== committed.preventDuplicateLabel  ||
  draft.locationPriority.join(',') !== committed.locationPriority.join(',') ||
  draft.scanThreshold          !== committed.scanThreshold          ||
  draft.scanThresholdValue     !== committed.scanThresholdValue     ||
  draft.cycleCountRec          !== committed.cycleCountRec          ||
  draft.cycleCountAutoTask     !== committed.cycleCountAutoTask     ||
  draft.cycleCountRuleNeg      !== committed.cycleCountRuleNeg      ||
  draft.cycleCountRuleVar      !== committed.cycleCountRuleVar      ||
  draft.cycleCountRuleMin      !== committed.cycleCountRuleMin
)

const cycleCountActiveRules = computed(() =>
  [draft.cycleCountRuleNeg, draft.cycleCountRuleVar, draft.cycleCountRuleMin].filter(Boolean).length
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
  isEditing.value = false
  discardOpen.value = false
}
async function saveEdit() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  if (committed.pickingEnabled && !draft.pickingEnabled) disablePickingForWarehouse(props.orderId)
  if (committed.putAwayEnabled && !draft.putAwayEnabled) disablePutAwayForWarehouse(props.orderId)
  Object.assign(committed, draft)
  saveWarehouseConfig(props.orderId, { ...committed })
  isSaving.value = false
  isEditing.value = false
  toast.notify({ variant: 'success', title: 'Warehouse configuration saved.', maxWidth: 'max-content' })
}

// ─── Toggle-intercept confirm dialog (Picking / Put-away only — the other two
// toggles have no cascading side effects, so they flip immediately). ───────────
type GuardedField = 'pickingEnabled' | 'putAwayEnabled'
const toggleConfirmOpen = ref(false)
const toggleConfirmField = ref<GuardedField | null>(null)
const toggleConfirmNextValue = ref(false)

function requestToggle(field: GuardedField, next: boolean) {
  toggleConfirmField.value = field
  toggleConfirmNextValue.value = next
  toggleConfirmOpen.value = true
}
function cancelToggleConfirm() {
  toggleConfirmOpen.value = false
  toggleConfirmField.value = null
}
function confirmToggle() {
  const field = toggleConfirmField.value
  if (field) {
    draft[field] = toggleConfirmNextValue.value
    // Partial picking only makes sense when picking itself runs.
    if (field === 'pickingEnabled' && !toggleConfirmNextValue.value) draft.allowPartialPicking = false
  }
  toggleConfirmOpen.value = false
  toggleConfirmField.value = null
}

const partialPickingLocked = computed(() => !draft.pickingEnabled)

// ─── Storage location priority (rule, not a toggle — auto-selection always runs
// when an outbound omits a location; this is the order it follows). ───────────
const locationPriorityDrawerOpen = ref(false)
const storageLeaves = computed(() => getStorageLeaves(props.orderId).filter((l) => l.type === 'Storage'))
const locationPriorityPreview = computed(() => rankStorageLeaves(storageLeaves.value, draft.locationPriority))
const locationPriorityIsCustom = computed(() => draft.locationPriority.length > 0)
const locationPrioritySummary = computed(() => {
  if (!storageLeaves.value.length) return 'No storage locations yet'
  if (!locationPriorityIsCustom.value) return 'Default order (ascending name)'
  return 'Custom order'
})
function onLocationPrioritySaved(order: string[]) {
  draft.locationPriority = order
}

const toggleConfirmTitle = computed(() => {
  const field = toggleConfirmField.value
  if (!field) return ''
  const label = field === 'pickingEnabled' ? 'Picking' : 'Put-away'
  return toggleConfirmNextValue.value ? `Turn on ${label} for this warehouse?` : `Turn off ${label} for this warehouse?`
})

function joinParts(parts: string[]): string {
  return parts.length ? ` ${parts.join(' and ')}.` : ''
}

const toggleConfirmBody = computed(() => {
  const field = toggleConfirmField.value
  if (!field) return ''
  const turningOn = toggleConfirmNextValue.value

  if (field === 'putAwayEnabled') {
    if (turningOn) {
      return "New receiving tasks in this warehouse will need a put-away step again. Already-completed transactions aren't affected."
    }
    const { openPutAways, pendingReceiving } = previewDisablePutAway(props.orderId)
    const parts: string[] = []
    if (openPutAways > 0) parts.push(`${openPutAways} in-progress put-away task${openPutAways === 1 ? '' : 's'} will be canceled right away`)
    if (pendingReceiving > 0) parts.push(`${pendingReceiving} receiving task${pendingReceiving === 1 ? '' : 's'} awaiting put-away will be marked complete right away`)
    return `New receiving tasks will skip put-away and complete immediately.${joinParts(parts)} Already-completed put-away tasks aren't affected.`
  }

  // pickingEnabled
  if (turningOn) {
    return "New outbound orders in this warehouse will need a picking step again. Already-completed transactions aren't affected."
  }
  const { openPickings } = previewDisablePicking(props.orderId)
  const parts = openPickings > 0
    ? [`${openPickings} in-progress picking task${openPickings === 1 ? '' : 's'} will be canceled right away`]
    : []
  return `New outbound orders will skip picking and go straight to packing.${joinParts(parts)} Already-completed picking tasks aren't affected.`
})
</script>

<template>
  <div v-if="warehouse" class="cw-page">

    <!-- ── Page title bar (neutral-subtle bg, 72px, breadcrumb + title) ── -->
    <div class="cw-titlebar">
      <div class="cw-titlebar-left">
        <button class="cw-breadcrumb" @click="goBack">{{ warehouse.name }}</button>
        <h1 class="cw-title">Configure warehouse</h1>
      </div>
    </div>

    <!-- ── Stage (white, rounded tl/tr, scrollable) ── -->
    <div class="cw-stage">
      <section class="cw-section">
        <div class="cw-section-header">
          <div class="cw-section-meta">
            <h2 class="cw-section-title">Settings</h2>
            <p class="cw-section-desc">Configure how inbound and outbound tasks run in this warehouse.</p>
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

        <div class="cw-toggle-list">

          <h3 class="cw-subsection-title">Outbound delivery</h3>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">Picking</span>
              <span class="cw-toggle-desc">When off, outbound orders in this warehouse skip picking entirely and go straight to packing.</span>
            </div>
            <MpToggle
              :is-checked="draft.pickingEnabled"
              :is-disabled="!isEditing"
              aria-label="Picking"
              @update:is-checked="(v: boolean) => requestToggle('pickingEnabled', v)"
            />
          </div>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">Allow partial picking</span>
              <span class="cw-toggle-desc">
                {{ partialPickingLocked ? "Not applicable while Picking is off." : "Let a picking list in this warehouse be finished with less than the full planned quantity." }}
              </span>
            </div>
            <MpToggle
              v-model:is-checked="draft.allowPartialPicking"
              :is-disabled="!isEditing || partialPickingLocked"
              aria-label="Allow partial picking"
            />
          </div>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">Require source shipping label</span>
              <span class="cw-toggle-desc">Packing cannot begin until the shipping label from the order source (e.g. marketplace) has been received.</span>
            </div>
            <MpToggle
              v-model:is-checked="draft.requireSourceLabel"
              :is-disabled="!isEditing"
              aria-label="Require source shipping label"
            />
          </div>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">Prevent duplicate packing label printing</span>
              <span class="cw-toggle-desc">Once a packing label has been printed for an outbound order, it cannot be printed again. Prevents duplicate labels from being issued.</span>
            </div>
            <MpToggle
              v-model:is-checked="draft.preventDuplicateLabel"
              :is-disabled="!isEditing"
              aria-label="Prevent duplicate packing label printing"
            />
          </div>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">Storage location priority</span>
              <span class="cw-toggle-desc">WMS reserves from the highest-priority location with available stock when an outbound doesn't already specify one.</span>
              <span class="cw-rule-summary">{{ locationPrioritySummary }}</span>
            </div>
            <button
              v-if="isEditing && storageLeaves.length"
              class="btn-enterprise btn-enterprise--secondary"
              @click="locationPriorityDrawerOpen = true"
            >
              Manage priority
            </button>
          </div>

          <h3 class="cw-subsection-title cw-subsection-title--spaced">Inbound delivery</h3>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">Put-away</span>
              <span class="cw-toggle-desc">When off, receiving tasks in this warehouse skip put-away entirely — finishing receiving is the end of inbound.</span>
            </div>
            <MpToggle
              :is-checked="draft.putAwayEnabled"
              :is-disabled="!isEditing"
              aria-label="Put-away"
              @update:is-checked="(v: boolean) => requestToggle('putAwayEnabled', v)"
            />
          </div>

          <h3 class="cw-subsection-title cw-subsection-title--spaced">General settings</h3>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">Barcode scan threshold</span>
              <span class="cw-toggle-desc">Items at or below this quantity must be scanned one by one. Above the limit, operators can enter the quantity manually.</span>
            </div>
            <MpToggle v-model:is-checked="draft.scanThreshold" :is-disabled="!isEditing" aria-label="Barcode scan threshold" />
          </div>

          <div v-if="draft.scanThreshold" class="cw-sub-row">
            <span class="cw-sub-label">Threshold qty</span>
            <template v-if="isEditing">
              <input
                class="cw-sub-input"
                type="number"
                min="1"
                max="9999"
                :value="draft.scanThresholdValue"
                @input="draft.scanThresholdValue = Math.max(1, parseInt(($event.target as HTMLInputElement).value) || 1)"
              />
              <span class="cw-sub-unit">pcs</span>
            </template>
            <span v-else class="cw-sub-value">{{ draft.scanThresholdValue }} pcs</span>
          </div>

          <h3 class="cw-subsection-title cw-subsection-title--spaced">Cycle counts</h3>

          <!-- Cycle count recommendation master toggle -->
          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">Cycle count recommendation</span>
              <span class="cw-toggle-desc">Show a recommendation board that surfaces which SKUs to prioritize for counting, based on negative stock, count variance, and minimum stock signals.</span>
            </div>
            <MpToggle v-model:is-checked="draft.cycleCountRec" :is-disabled="!isEditing" aria-label="Cycle count recommendation" />
          </div>

          <!-- Sub-settings: only visible when master toggle is ON -->
          <template v-if="draft.cycleCountRec">

            <!-- Recommendation rules -->
            <div class="cw-rec-group">
              <span class="cw-rec-group-label">Recommendation rules</span>

              <div class="cw-rec-rule-row">
                <div class="cw-toggle-info">
                  <span class="cw-toggle-title">Negative stock</span>
                  <span class="cw-toggle-desc">Flag SKUs that went negative within the lookback window — a confirmed system-vs-physical mismatch.</span>
                </div>
                <MpToggle
                  v-model:is-checked="draft.cycleCountRuleNeg"
                  :is-disabled="!isEditing || (draft.cycleCountRuleNeg && cycleCountActiveRules === 1)"
                  aria-label="Negative stock rule"
                />
              </div>

              <div class="cw-rec-rule-row">
                <div class="cw-toggle-info">
                  <span class="cw-toggle-title">Variance signal</span>
                  <span class="cw-toggle-desc">Flag SKUs whose last count exceeded the variance tolerance — likely to drift again.</span>
                </div>
                <MpToggle
                  v-model:is-checked="draft.cycleCountRuleVar"
                  :is-disabled="!isEditing || (draft.cycleCountRuleVar && cycleCountActiveRules === 1)"
                  aria-label="Variance signal rule"
                />
              </div>

              <div class="cw-rec-rule-row">
                <div class="cw-toggle-info">
                  <span class="cw-toggle-title">Min stock (watch list)</span>
                  <span class="cw-toggle-desc">Flag watch-listed SKUs at or below their minimum stock level — a predictive signal for high-priority products.</span>
                </div>
                <MpToggle
                  v-model:is-checked="draft.cycleCountRuleMin"
                  :is-disabled="!isEditing || (draft.cycleCountRuleMin && cycleCountActiveRules === 1)"
                  aria-label="Min stock rule"
                />
              </div>
            </div>

            <!-- Auto-create nested toggle -->
            <div class="cw-toggle-row">
              <div class="cw-toggle-info">
                <span class="cw-toggle-title">Auto-create cycle count tasks</span>
                <span class="cw-toggle-desc">Automatically create pending cycle count tasks for all recommended SKUs. When off, the recommendation board is advisory only — no tasks are created.</span>
              </div>
              <MpToggle v-model:is-checked="draft.cycleCountAutoTask" :is-disabled="!isEditing" aria-label="Auto-create cycle count tasks" />
            </div>

          </template>

        </div>

        <div v-if="isEditing" class="cw-action-bar">
          <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="requestCancel">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="saveEdit">
            {{ isSaving ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      </section>
    </div>

    <!-- ── Discard confirmation dialog ────────────────────────────────────── -->
    <MpModal
      id="cw-discard-dialog"
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
          <p class="cw-dialog-body">Your changes will not be saved.</p>
        </MpModalBody>
        <MpModalFooter>
          <button class="btn-enterprise btn-enterprise--ghost" @click="discardOpen = false">Keep editing</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="exitEdit">Discard</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Picking / Put-away toggle confirmation ─────────────────────────── -->
    <MpModal
      id="cw-toggle-confirm-dialog"
      :is-open="toggleConfirmOpen"
      size="sm"
      is-close-on-esc
      is-close-on-overlay-click
      @close="cancelToggleConfirm"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ toggleConfirmTitle }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <p class="cw-dialog-body">{{ toggleConfirmBody }}</p>
        </MpModalBody>
        <MpModalFooter>
          <button class="btn-enterprise btn-enterprise--ghost" @click="cancelToggleConfirm">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmToggle">Confirm</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <LocationPriorityDrawer
      v-model:is-open="locationPriorityDrawerOpen"
      :warehouse-id="props.orderId"
      :model-value="draft.locationPriority"
      @saved="onLocationPrioritySaved"
    />

  </div>
</template>

<style scoped>
.cw-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.cw-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center;
}
.cw-titlebar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.cw-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.cw-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cw-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.cw-stage {
  flex: 1; min-height: 0; overflow-y: auto;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6);
}

/* ─── Section (mirrors SettingsWarehousePage.vue's .ws-* pattern) ──────────── */
.cw-section { display: grid; grid-template-columns: repeat(12, 1fr); align-content: start; row-gap: 0; }
.cw-section-header { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(12, 1fr); align-items: start; margin-bottom: var(--mp-spacing-3); }
.cw-section-meta { grid-column: 1 / 7; display: flex; flex-direction: column; }
.cw-section-title { margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cw-section-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
.cw-section-header > button { grid-column: 7 / -1; justify-self: start; }

.cw-toggle-list { grid-column: 1 / 7; display: flex; flex-direction: column; }
.cw-subsection-title { margin: 0; padding: var(--mp-spacing-2) 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cw-subsection-title--spaced { margin-top: var(--mp-spacing-3); }
.cw-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; }
.cw-toggle-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.cw-toggle-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cw-toggle-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cw-rule-summary { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }

.cw-action-bar { grid-column: 1 / 7; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); }
.cw-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }

.cw-dialog-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.cw-section--spaced { margin-top: var(--mp-spacing-6); padding-top: var(--mp-spacing-6); border-top: 1px solid var(--mp-border-default); }

.cw-sub-row {
  display: flex; align-items: center;
  gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; padding-left: var(--mp-spacing-4);
}
.cw-sub-label { width: 160px; flex-shrink: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cw-sub-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cw-sub-input {
  width: 80px; padding: 6px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); outline: none; text-align: right;
}
.cw-sub-input:focus { border-color: var(--mp-border-focused, #2563eb); }
.cw-sub-unit { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }

.cw-rec-group {
  display: flex; flex-direction: column;
  margin: var(--mp-spacing-1) 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-1);
  border-left: 2px solid var(--mp-border-default);
  margin-left: var(--mp-spacing-2);
}
.cw-rec-group-label {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-subtle); text-transform: uppercase; letter-spacing: 0.4px;
  margin-bottom: var(--mp-spacing-1);
}
.cw-rec-rule-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0;
}
</style>
