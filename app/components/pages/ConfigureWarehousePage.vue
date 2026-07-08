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
import { getWarehouseConfig, saveWarehouseConfig, type WarehouseConfig } from '~/data/warehouseConfig'
import { previewDisablePutAway, disablePutAwayForWarehouse } from '~/data/putAwayTasks'
import { previewDisablePicking, disablePickingForWarehouse } from '~/data/pickingTasks'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const warehouse = computed(() => getWarehouseDetail(props.orderId))

function goBack() {
  router.push(`/warehouses/${props.orderId}`)
}

// ─── State ───────────────────────────────────────────────────────────────────
const committed = reactive<WarehouseConfig>(getWarehouseConfig(props.orderId))
const draft     = reactive<WarehouseConfig>({ ...committed })

const isEditing = ref(false)
const isSaving  = ref(false)
const discardOpen = ref(false)

const hasChanges = computed(() =>
  draft.pickingEnabled       !== committed.pickingEnabled ||
  draft.putAwayEnabled       !== committed.putAwayEnabled ||
  draft.allowPartialPicking  !== committed.allowPartialPicking ||
  draft.qcModule             !== committed.qcModule
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
  // Cascade only fires for OFF transitions actually committed by this save —
  // toggling off then back on before saving has no side effects.
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
            <h2 class="cw-section-title">Workflow</h2>
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

          <h3 class="cw-subsection-title">Outbound delivery settings</h3>

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

          <h3 class="cw-subsection-title cw-subsection-title--spaced">Inbound delivery settings</h3>

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

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">QC module</span>
              <span class="cw-toggle-desc">Require a quality-control check before goods can move on to the next stage in this warehouse.</span>
            </div>
            <MpToggle v-model:is-checked="draft.qcModule" :is-disabled="!isEditing" aria-label="QC module" />
          </div>

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
.cw-toggle-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cw-toggle-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }

.cw-action-bar { grid-column: 1 / 7; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); }
.cw-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }

.cw-dialog-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }
</style>
