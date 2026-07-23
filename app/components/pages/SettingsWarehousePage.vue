<script setup lang="ts">
import {
  MpToggle, MpIcon, MpAutocomplete, MpTooltip, MpBadge,
  MpInputGroup, MpInput, MpInputRightAddon, MpFormControl, MpFormLabel,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import {
  getWarehouseSettings, saveWarehouseSettings,
  BATCH_RULE_OPTIONS, SERIAL_RULE_OPTIONS, BARCODE_STYLE_OPTIONS,
  type WarehouseSettings,
} from '~/data/warehouseSettings'
import { useScenario } from '~/composables/useScenario'
import { PRODUCTS } from '~/data/inventory'
import SelectProductDrawer, { type PickerProduct } from '~/components/patterns/SelectProductDrawer.vue'

const { activeScenario } = useScenario()

// ─── Persist ─────────────────────────────────────────────────────────────────

function loadSettings(): WarehouseSettings { return getWarehouseSettings() }
function persistSettings(v: WarehouseSettings): void { saveWarehouseSettings(v) }

// ─── State ───────────────────────────────────────────────────────────────────

const committed = reactive(loadSettings())
const draft     = reactive({ ...committed })

const isEditing     = ref(false)
const isSaving      = ref(false)
const discardOpen   = ref(false)
const ruleConfirmOpen = ref(false)

const hasChanges = computed(() =>
  draft.multiLocationStorage !== committed.multiLocationStorage ||
  draft.batchSelectionRule   !== committed.batchSelectionRule   ||
  draft.serialSelectionRule  !== committed.serialSelectionRule  ||
  draft.barcodeStyle         !== committed.barcodeStyle         ||
  draft.cycleCountRec          !== committed.cycleCountRec          ||
  draft.cycleCountAutoTask     !== committed.cycleCountAutoTask     ||
  draft.cycleCountRuleNeg      !== committed.cycleCountRuleNeg      ||
  draft.cycleCountRuleVar      !== committed.cycleCountRuleVar      ||
  draft.cycleCountRuleMin      !== committed.cycleCountRuleMin      ||
  draft.cycleCountRuleOrder.join(',') !== committed.cycleCountRuleOrder.join(',') ||
  draft.cycleCountNegLookbackDays    !== committed.cycleCountNegLookbackDays    ||
  draft.cycleCountVarianceThreshold  !== committed.cycleCountVarianceThreshold  ||
  draft.cycleCountMinGuardDays       !== committed.cycleCountMinGuardDays       ||
  draft.cycleCountWatchList.join(',') !== committed.cycleCountWatchList.join(',')
)
// The batch/serial rule only decides what a NEW order reserves — orders already
// reserved (at their own creation time) never get recomputed, so changing this
// needs an explicit heads-up before it's saved.
const hasRuleChange = computed(() =>
  draft.batchSelectionRule  !== committed.batchSelectionRule ||
  draft.serialSelectionRule !== committed.serialSelectionRule
)

const batchRuleLabel  = computed(() => BATCH_RULE_OPTIONS.find(o => o.id === draft.batchSelectionRule)?.name ?? '')
const serialRuleLabel = computed(() => SERIAL_RULE_OPTIONS.find(o => o.id === draft.serialSelectionRule)?.name ?? '')
const barcodeStyleLabel = computed(() => BARCODE_STYLE_OPTIONS.find(o => o.id === draft.barcodeStyle)?.name ?? '')

const cycleCountActiveRules = computed(() =>
  [draft.cycleCountRuleNeg, draft.cycleCountRuleVar, draft.cycleCountRuleMin].filter(Boolean).length
)

// ─── Cycle count rule ordering ────────────────────────────────────────────────
type RuleKey = 'neg' | 'var' | 'min'
const RULE_META: Record<RuleKey, {
  draftKey: 'cycleCountRuleNeg' | 'cycleCountRuleVar' | 'cycleCountRuleMin'
  title: string; desc: string; ariaLabel: string
  inputKey: 'cycleCountNegLookbackDays' | 'cycleCountVarianceThreshold' | 'cycleCountMinGuardDays'
  inputLabel: string; inputSuffix: string
}> = {
  neg: {
    draftKey: 'cycleCountRuleNeg', title: 'Negative stock', ariaLabel: 'Negative stock rule',
    desc: 'Flag SKUs that went negative within the lookback window, a confirmed signal of a system-vs-physical mismatch.',
    inputKey: 'cycleCountNegLookbackDays', inputLabel: 'Lookback window', inputSuffix: 'days',
  },
  var: {
    draftKey: 'cycleCountRuleVar', title: 'Variance signal', ariaLabel: 'Variance signal rule',
    desc: 'Flag SKUs whose last count exceeded the variance tolerance, likely to drift again.',
    inputKey: 'cycleCountVarianceThreshold', inputLabel: 'Variance threshold', inputSuffix: '%',
  },
  min: {
    draftKey: 'cycleCountRuleMin', title: 'Min stock (watch list)', ariaLabel: 'Min stock rule',
    desc: 'Flag watch-listed SKUs at or below their minimum stock level, a predictive signal for high-priority products.',
    inputKey: 'cycleCountMinGuardDays', inputLabel: 'Count guard window', inputSuffix: 'days',
  },
}

// Weight each active rule contributes to the priority score, by rank among the
// active rules (mirrors the scoring formula in ~/data/cycleCountRecommendations).
const WEIGHT_TABLE: Record<number, number[]> = { 3: [0.5, 0.3, 0.2], 2: [0.6, 0.4], 1: [1] }
const activeRuleOrder = computed(() => draft.cycleCountRuleOrder.filter((k) => draft[RULE_META[k as RuleKey].draftKey]))
function weightPercentFor(ruleKey: RuleKey): number | null {
  const idx = activeRuleOrder.value.indexOf(ruleKey)
  if (idx === -1) return null
  const weights = WEIGHT_TABLE[activeRuleOrder.value.length] ?? []
  const w = weights[idx]
  return w === undefined ? null : Math.round(w * 100)
}
function weightRankFor(ruleKey: RuleKey): number {
  return activeRuleOrder.value.indexOf(ruleKey) + 1
}

// ─── Cycle-count watch list — SKUs the Min stock rule always evaluates ─────────
const watchListDrawerOpen = ref(false)
// Minimum stock mirrors the same deterministic formula warehouseDetails.ts uses to
// generate each stock item's minStock, keyed by catalog position — a stable reference
// figure for a picker that isn't scoped to any one warehouse.
const pickerProducts = computed<PickerProduct[]>(() =>
  PRODUCTS.map((p, i) => ({
    sku: p.sku, name: p.name, img: p.img, desc: p.desc, unit: p.unit,
    minStock: Math.round((((i * 11) % 200) + 10) / 10) * 10,
  })),
)
function applyWatchListPicker(skus: string[]) {
  draft.cycleCountWatchList = skus
}

const ruleDragSrc  = ref<number | null>(null)
const ruleDragOver = ref<number | null>(null)

function onRuleDragStart(i: number, e: DragEvent) {
  ruleDragSrc.value = i
  e.dataTransfer!.effectAllowed = 'move'
}
function onRuleDragOver(i: number, e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  ruleDragOver.value = i
}
function onRuleDrop(i: number, e: DragEvent) {
  e.preventDefault()
  if (ruleDragSrc.value === null || ruleDragSrc.value === i) { ruleDragOver.value = null; return }
  const r = [...draft.cycleCountRuleOrder]
  const [moved] = r.splice(ruleDragSrc.value, 1)
  r.splice(i, 0, moved!)
  draft.cycleCountRuleOrder = r
  ruleDragSrc.value = null
  ruleDragOver.value = null
}
function onRuleDragEnd() { ruleDragSrc.value = null; ruleDragOver.value = null }

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

function requestSave() {
  if (hasRuleChange.value) ruleConfirmOpen.value = true
  else void saveEdit()
}

async function confirmRuleChange() {
  ruleConfirmOpen.value = false
  await saveEdit()
}

async function saveEdit() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  Object.assign(committed, draft)
  persistSettings({ ...committed })
  isSaving.value = false
  isEditing.value = false
  toast.notify({ variant: 'success', title: 'Warehouse settings saved', maxWidth: 'max-content' })
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
            <span class="ws-toggle-desc">Serial numbers have no expiry date, so FEFO doesn't apply. Pick a picking order instead.</span>
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

        <h3 class="ws-subsection-title ws-subsection-title--spaced">Print barcode</h3>

        <div class="ws-toggle-row ws-toggle-row--rule">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">Barcode format</span>
            <span class="ws-toggle-desc">Symbology used when printing labels for SKUs, batches, serial numbers, and storage bins.</span>
          </div>
          <MpAutocomplete
            v-if="isEditing"
            id="ws-barcode-style-ac"
            v-model="draft.barcodeStyle"
            :data="BARCODE_STYLE_OPTIONS"
            label-prop="name"
            value-prop="id"
            use-portal
            class="ws-rule-select"
          />
          <span v-else class="ws-rule-value">{{ barcodeStyleLabel }}</span>
        </div>

        <template v-if="activeScenario === 'WMS Standalone'">
          <h3 class="ws-subsection-title ws-subsection-title--spaced">Cycle counts</h3>

          <!-- Cycle count recommendation master toggle -->
          <div class="ws-toggle-row">
            <div class="ws-toggle-info">
              <span class="ws-toggle-title">Cycle count recommendation</span>
              <span class="ws-toggle-desc">Show a recommendation board that surfaces which SKUs to prioritize for counting, based on negative stock, count variance, and minimum stock signals.</span>
            </div>
            <MpToggle v-model:is-checked="draft.cycleCountRec" :is-disabled="!isEditing" aria-label="Cycle count recommendation" />
          </div>

          <!-- Sub-settings: only visible when master toggle is ON -->
          <template v-if="draft.cycleCountRec">

            <!-- Recommendation priority (drag to reorder when editing) -->
            <div class="ws-rec-group" :class="{ 'ws-rec-group--editing': isEditing }">
              <span class="ws-rec-group-label">Recommendation priority</span>

              <div
                v-for="(ruleKey, i) in draft.cycleCountRuleOrder"
                :key="ruleKey"
                class="ws-rec-card"
                :class="{
                  'ws-rec-card--dragging':   isEditing && ruleDragSrc === i,
                  'ws-rec-card--over-above': isEditing && ruleDragOver === i && ruleDragSrc !== null && ruleDragSrc > i,
                  'ws-rec-card--over-below': isEditing && ruleDragOver === i && ruleDragSrc !== null && ruleDragSrc < i,
                }"
                :draggable="isEditing ? 'true' : 'false'"
                @dragstart="isEditing && onRuleDragStart(i, $event)"
                @dragover="isEditing && onRuleDragOver(i, $event)"
                @drop="isEditing && onRuleDrop(i, $event)"
                @dragend="isEditing && onRuleDragEnd()"
              >
                <div class="ws-rec-card-row">
                  <span v-if="isEditing" class="ws-rec-handle" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
                      <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
                      <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
                    </svg>
                  </span>
                  <div class="ws-toggle-info">
                    <span class="ws-toggle-title">{{ RULE_META[ruleKey as RuleKey].title }}</span>
                    <span class="ws-toggle-desc">{{ RULE_META[ruleKey as RuleKey].desc }}</span>
                  </div>
                  <MpToggle
                    :is-checked="draft[RULE_META[ruleKey as RuleKey].draftKey]"
                    :is-disabled="!isEditing || (draft[RULE_META[ruleKey as RuleKey].draftKey] && cycleCountActiveRules === 1)"
                    :aria-label="RULE_META[ruleKey as RuleKey].ariaLabel"
                    @update:is-checked="draft[RULE_META[ruleKey as RuleKey].draftKey] = $event"
                  />
                </div>

                <div class="ws-rec-card-footer">
                  <MpFormControl :id="`ws-rec-input-fc-${ruleKey}`" class="ws-rec-input">
                    <MpFormLabel>{{ RULE_META[ruleKey as RuleKey].inputLabel }}</MpFormLabel>
                    <MpInputGroup :id="`ws-rec-input-group-${ruleKey}`" is-full-width class="ws-rec-input-group">
                      <MpInput
                        :id="`ws-rec-input-${ruleKey}`"
                        :model-value="String(draft[RULE_META[ruleKey as RuleKey].inputKey])"
                        type="number"
                        min="0"
                        is-full-width
                        :is-disabled="!isEditing || !draft[RULE_META[ruleKey as RuleKey].draftKey]"
                        :aria-label="`${RULE_META[ruleKey as RuleKey].title} — ${RULE_META[ruleKey as RuleKey].inputLabel}`"
                        @update:model-value="(v: string) => draft[RULE_META[ruleKey as RuleKey].inputKey] = Math.max(0, parseInt(v) || 0)"
                      />
                      <MpInputRightAddon>{{ RULE_META[ruleKey as RuleKey].inputSuffix }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpFormControl>

                  <MpTooltip
                    v-if="weightPercentFor(ruleKey as RuleKey) !== null"
                    :id="`ws-rec-weight-tt-${ruleKey}`"
                    placement="top"
                    use-portal
                  >
                    <template #label>
                      <strong>Count priority rank: {{ weightRankFor(ruleKey as RuleKey) }}</strong><br />
                      impact {{ weightPercentFor(ruleKey as RuleKey) }}% to recommendation priority
                    </template>
                    <MpBadge for="additionalInformation" type="information" size="sm">{{ weightPercentFor(ruleKey as RuleKey) }}%</MpBadge>
                  </MpTooltip>
                  <MpBadge v-else for="additionalInformation" type="announcement" size="sm">Not applied</MpBadge>
                </div>
              </div>
            </div>

            <!-- Cycle-count watch list -->
            <div class="ws-watchlist-row">
              <div class="ws-toggle-info">
                <span class="ws-toggle-title">Cycle-count watch list</span>
                <span class="ws-toggle-desc">List of SKUs that will show on the cycle count recommendation list.</span>
              </div>
              <button
                class="btn-enterprise btn-enterprise--secondary"
                :disabled="!isEditing"
                @click="watchListDrawerOpen = true"
              >
                Select product{{ draft.cycleCountWatchList.length ? ` (${draft.cycleCountWatchList.length})` : '' }}
              </button>
            </div>

            <!-- Auto-create nested toggle -->
            <div class="ws-toggle-row">
              <div class="ws-toggle-info">
                <span class="ws-toggle-title">Auto-create cycle count tasks</span>
                <span class="ws-toggle-desc">Automatically create pending cycle count tasks for all recommended SKUs. When off, the recommendation board is advisory only; no tasks are created.</span>
              </div>
              <MpToggle v-model:is-checked="draft.cycleCountAutoTask" :is-disabled="!isEditing" aria-label="Auto-create cycle count tasks" />
            </div>

          </template>
        </template>

      </div>

      <div v-if="isEditing" class="ws-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="requestCancel">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="requestSave">
          {{ isSaving ? 'Saving…' : 'Save changes' }}
        </button>
      </div>
    </section>

    <!-- ── Discard confirmation dialog ────────────────────────────────────── -->
    <MpModal
      id="ws-discard-dialog"
      :is-open="discardOpen"
      size="md"
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

    <!-- ── Non-retroactive rule change confirmation ──────────────────────────── -->
    <MpModal
      id="ws-rule-confirm-dialog"
      :is-open="ruleConfirmOpen"
      size="md"
      is-close-on-esc
      is-close-on-overlay-click
      @close="ruleConfirmOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          Apply new selection rule?
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <p class="ws-dialog-body">
            This only applies to orders created from now on. Orders that already reserved a
            batch/serial keep their original pick — they won't be recalculated.
          </p>
        </MpModalBody>
        <MpModalFooter>
          <button class="btn-enterprise btn-enterprise--ghost" @click="ruleConfirmOpen = false">Keep editing</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmRuleChange">Save changes</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <SelectProductDrawer
      v-model:open="watchListDrawerOpen"
      :products="pickerProducts"
      :model-value="draft.cycleCountWatchList"
      @save="applyWatchListPicker"
    />

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

.ws-rec-group {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  margin: var(--mp-spacing-2) 0;
}
.ws-rec-group-label {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-subtle); text-transform: uppercase; letter-spacing: 0.4px;
}

.ws-rec-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
  transition: opacity 150ms, border-color 150ms;
}
.ws-rec-card[draggable="true"] { cursor: grab; user-select: none; }
.ws-rec-card[draggable="true"]:active { cursor: grabbing; }
.ws-rec-card--dragging { opacity: 0.4; }
.ws-rec-card--over-above { border-top: 2px solid var(--mp-border-selected, #0f6d4d); }
.ws-rec-card--over-below { border-bottom: 2px solid var(--mp-border-selected, #0f6d4d); }

.ws-rec-card-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.ws-rec-handle {
  flex-shrink: 0; color: var(--mp-text-disabled, #b0b6b8);
  display: flex; align-items: center;
}
.ws-rec-card:hover .ws-rec-handle { color: var(--mp-text-subtle); }

.ws-rec-card-footer {
  display: flex; align-items: flex-end; flex-wrap: wrap; justify-content: space-between;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default);
}
.ws-rec-card-footer :deep(.mp-badge) { flex-shrink: 0; margin-bottom: var(--mp-spacing-1); cursor: default; }

.ws-rec-input {
  display: flex; flex-direction: column; align-items: flex-start;
  flex: 0 1 220px; min-width: 160px;
}
.ws-rec-input-group {
  width: 100%; max-width: 160px;
}

.ws-watchlist-row {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 0;
}
</style>
