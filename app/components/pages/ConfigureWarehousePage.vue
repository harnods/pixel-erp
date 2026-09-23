<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpToggle, MpIcon, MpTooltip, MpBadge,
  MpInputGroup, MpInput, MpInputRightAddon, MpFormControl, MpFormLabel,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig, saveWarehouseConfig, rankStorageLeaves, type WarehouseConfig } from '~/data/warehouseConfig'
import { getStorageLeaves } from '~/data/storageLocations'
import { previewDisablePutAway, disablePutAwayForWarehouse } from '~/data/putAwayTasks'
import { previewDisablePicking, disablePickingForWarehouse } from '~/data/pickingTasks'
import { useScenario } from '~/composables/useScenario'
import { PRODUCTS } from '~/data/inventory'
import LocationPriorityDrawer from '~/components/patterns/LocationPriorityDrawer.vue'
import SelectProductDrawer, { type PickerProduct } from '~/components/patterns/SelectProductDrawer.vue'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()
const { activeScenario } = useScenario()

const warehouse = computed(() => getWarehouseDetail(props.orderId))

function goBack() {
  router.push(`/warehouses/${props.orderId}`)
}

// ─── State ───────────────────────────────────────────────────────────────────
const committed = reactive<WarehouseConfig>(getWarehouseConfig(props.orderId))
const draft     = reactive<WarehouseConfig>({ ...committed })

const isEditing       = ref(false)
const isSaving        = ref(false)
const discardOpen     = ref(false)
const ruleConfirmOpen = ref(false)

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
  draft.cycleCountRuleMin      !== committed.cycleCountRuleMin      ||
  draft.cycleCountRuleOrder.join(',') !== committed.cycleCountRuleOrder.join(',') ||
  draft.cycleCountNegLookbackDays    !== committed.cycleCountNegLookbackDays    ||
  draft.cycleCountMinGuardDays       !== committed.cycleCountMinGuardDays       ||
  draft.cycleCountWatchList.join(',') !== committed.cycleCountWatchList.join(',') ||
  draft.replenishmentEnabled          !== committed.replenishmentEnabled          ||
  draft.replenishmentSafetyDays       !== committed.replenishmentSafetyDays       ||
  draft.replenishmentIncludeInTransit !== committed.replenishmentIncludeInTransit
)
// The location priority order only decides where a NEW order reserves from —
// orders already reserved (at their own creation time) keep their original bin,
// so changing this needs an explicit heads-up before it's saved.
const hasLocationPriorityChange = computed(() =>
  draft.locationPriority.join(',') !== committed.locationPriority.join(',')
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
function requestSave() {
  if (hasLocationPriorityChange.value) ruleConfirmOpen.value = true
  else void saveEdit()
}

async function confirmRuleChange() {
  ruleConfirmOpen.value = false
  await saveEdit()
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
  toast.notify({ variant: 'success', title: t('Warehouse configuration saved'), maxWidth: 'max-content' })
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
  if (!storageLeaves.value.length) return t('No storage locations yet')
  if (!locationPriorityIsCustom.value) return t('Default order (ascending name)')
  return t('Custom order')
})
function onLocationPrioritySaved(order: string[]) {
  draft.locationPriority = order
}

// ─── Cycle counts (WMS Standalone + ERP) ────────────────────────────────────
const cycleCountActiveRules = computed(() =>
  [draft.cycleCountRuleNeg, draft.cycleCountRuleVar, draft.cycleCountRuleMin].filter(Boolean).length
)

type RuleKey = 'neg' | 'var' | 'min'
const RULE_META: Record<RuleKey, {
  draftKey: 'cycleCountRuleNeg' | 'cycleCountRuleVar' | 'cycleCountRuleMin'
  title: string; desc: string; ariaLabel: string
  // The Variance signal rule carries no input of its own — its tolerance is
  // fixed in the scoring logic, so a configurable % had no effect on anything.
  inputKey?: 'cycleCountNegLookbackDays' | 'cycleCountMinGuardDays'
  inputLabel?: string; inputSuffix?: string
}> = {
  neg: {
    draftKey: 'cycleCountRuleNeg', title: t('Negative stock'), ariaLabel: t('Negative stock rule'),
    desc: t('Flag SKUs that went negative within the lookback window, a confirmed signal of a system-vs-physical mismatch.'),
    inputKey: 'cycleCountNegLookbackDays', inputLabel: t('Lookback window'), inputSuffix: t('days'),
  },
  var: {
    draftKey: 'cycleCountRuleVar', title: t('Variance signal'), ariaLabel: t('Variance signal rule'),
    desc: t('Flag SKUs whose last count exceeded the variance tolerance, likely to drift again.'),
  },
  min: {
    draftKey: 'cycleCountRuleMin', title: t('Min stock (watch list)'), ariaLabel: t('Min stock rule'),
    desc: t('Flag watch-listed SKUs at or below their minimum stock level, a predictive signal for high-priority products.'),
    inputKey: 'cycleCountMinGuardDays', inputLabel: t('Count guard window'), inputSuffix: t('days'),
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

// Shared inputs live below the card list (not per-card) — fixed left-to-right
// order, independent of the cards' drag-reorder (that's priority rank, not layout).
const INPUT_ORDER: RuleKey[] = ['neg', 'min']

// Count guard window matters while EITHER Min stock or auto-create is on (it
// drives both); Lookback window stays enabled regardless — it also scopes the
// Variance signal's own lookback, so it still does useful work on its own.
function inputDisabledFor(key: RuleKey): boolean {
  if (!isEditing.value) return true
  if (key === 'neg') return !draft.cycleCountRuleNeg && !draft.cycleCountRuleVar
  if (key === 'min') return !draft.cycleCountRuleMin && !draft.cycleCountAutoTask
  return false
}

function inputCaptionFor(key: RuleKey): string {
  if (key === 'neg') {
    const negOn = draft.cycleCountRuleNeg
    const varOn = draft.cycleCountRuleVar
    if (!negOn && !varOn) return ''
    if (negOn && !varOn) return t('How far recent lookback negative stock period')
    return negOn
      ? t('How far recent lookback negative stock & variance threshold period')
      : t('How far recent lookback variance threshold period')
  }
  if (key === 'min') {
    const minOn = draft.cycleCountRuleMin
    const autoOn = draft.cycleCountAutoTask
    if (!minOn && !autoOn) return ''
    if (minOn && !autoOn) return t('Used for min stock watchlist')
    return minOn
      ? t('Used for auto creation cycle count window & min stock watchlist')
      : t('Used for auto creation cycle count window')
  }
  return ''
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

// Cycle-count watch list — SKUs the Min stock rule always evaluates. Minimum
// stock mirrors the same deterministic formula warehouseDetails.ts uses to
// generate each stock item's minStock, keyed by catalog position.
const watchListDrawerOpen = ref(false)
const pickerProducts = computed<PickerProduct[]>(() =>
  PRODUCTS.map((p, i) => ({
    sku: p.sku, name: p.name, img: p.img, desc: p.desc, unit: p.unit,
    minStock: Math.round((((i * 11) % 200) + 10) / 10) * 10,
  })),
)
function applyWatchListPicker(skus: string[]) {
  draft.cycleCountWatchList = skus
}

const toggleConfirmTitle = computed(() => {
  const field = toggleConfirmField.value
  if (!field) return ''
  const label = field === 'pickingEnabled' ? t('Picking') : t('Put-away')
  return toggleConfirmNextValue.value ? `${t('Turn on')} ${label} ${t('for this warehouse?')}` : `${t('Turn off')} ${label} ${t('for this warehouse?')}`
})

const toggleConfirmItems = computed((): string[] => {
  const field = toggleConfirmField.value
  if (!field) return []
  const turningOn = toggleConfirmNextValue.value

  if (field === 'putAwayEnabled') {
    if (turningOn) {
      return [
        t('New receiving tasks will require a put-away step before completing.'),
        t('Existing tasks in progress are not affected by this change.'),
        t("Already-completed transactions aren't affected."),
      ]
    }
    const { openPutAways, pendingReceiving } = previewDisablePutAway(props.orderId)
    const parts: string[] = []
    if (openPutAways > 0) parts.push(`${openPutAways} put-away task${openPutAways === 1 ? '' : 's'} in progress`)
    if (pendingReceiving > 0) parts.push(`${pendingReceiving} receiving task${pendingReceiving === 1 ? '' : 's'} awaiting put-away`)
    const existingNote = parts.length > 0
      ? `There ${parts.join(' and ')} — ${parts.length === 1 ? 'it' : 'they'} can still be completed normally.`
      : t('No tasks are currently in progress or awaiting put-away.')
    return [
      t('New receiving tasks will skip put-away and complete immediately.'),
      existingNote,
      t("Already-completed put-away tasks aren't affected."),
    ]
  }

  // pickingEnabled
  if (turningOn) {
    return [
      t('New outbound orders will require a picking step before packing.'),
      t('Existing tasks in progress are not affected by this change.'),
      t("Already-completed transactions aren't affected."),
    ]
  }
  const { openPickings } = previewDisablePicking(props.orderId)
  const pickingNote = openPickings > 0
    ? `There ${openPickings === 1 ? 'is' : 'are'} ${openPickings} picking task${openPickings === 1 ? '' : 's'} in progress — ${openPickings === 1 ? 'it' : 'they'} can still be completed normally.`
    : t('No picking tasks are currently in progress.')
  return [
    t('New outbound orders will skip picking and go straight to packing.'),
    pickingNote,
    t("Already-completed picking tasks aren't affected."),
  ]
})
</script>

<template>
  <div v-if="warehouse" class="cw-page">

    <!-- ── Page title bar (neutral-subtle bg, 72px, breadcrumb + title) ── -->
    <div class="cw-titlebar">
      <div class="cw-titlebar-left">
        <button class="cw-breadcrumb" @click="goBack">{{ warehouse.name }}</button>
        <h1 class="cw-title">{{ t('Configure warehouse') }}</h1>
      </div>
    </div>

    <!-- ── Stage (white, rounded tl/tr, scrollable) ── -->
    <div class="cw-stage">
      <section class="cw-section">
        <div class="cw-section-header">
          <div class="cw-section-meta">
            <h2 class="cw-section-title">{{ t('Settings') }}</h2>
            <p class="cw-section-desc">{{ t('Configure how inbound and outbound tasks run in this warehouse.') }}</p>
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

        <div class="cw-toggle-list">

          <h3 class="cw-subsection-title">{{ t('Outbound delivery') }}</h3>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">{{ t('Picking') }}</span>
              <span class="cw-toggle-desc">{{ t('When off, outbound orders in this warehouse skip picking entirely and go straight to packing.') }}</span>
            </div>
            <MpToggle
              :is-checked="draft.pickingEnabled"
              :is-disabled="!isEditing"
              :aria-label="t('Picking')"
              @update:is-checked="(v: boolean) => requestToggle('pickingEnabled', v)"
            />
          </div>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">{{ t('Allow partial picking') }}</span>
              <span class="cw-toggle-desc">
                {{ partialPickingLocked ? t("Not applicable while Picking is off.") : t("Let a picking list in this warehouse be finished with less than the full planned quantity.") }}
              </span>
            </div>
            <MpToggle
              v-model:is-checked="draft.allowPartialPicking"
              :is-disabled="!isEditing || partialPickingLocked"
              :aria-label="t('Allow partial picking')"
            />
          </div>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">{{ t('Require source shipping label') }}</span>
              <span class="cw-toggle-desc">{{ t('Packing cannot begin until the shipping label from the order source (e.g. marketplace) has been received.') }}</span>
            </div>
            <MpToggle
              v-model:is-checked="draft.requireSourceLabel"
              :is-disabled="!isEditing"
              :aria-label="t('Require source shipping label')"
            />
          </div>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">{{ t('Prevent duplicate packing label printing') }}</span>
              <span class="cw-toggle-desc">{{ t('Once a packing label has been printed for an outbound order, it cannot be printed again. Prevents duplicate labels from being issued.') }}</span>
            </div>
            <MpToggle
              v-model:is-checked="draft.preventDuplicateLabel"
              :is-disabled="!isEditing"
              :aria-label="t('Prevent duplicate packing label printing')"
            />
          </div>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">{{ t('Storage location priority') }}</span>
              <span class="cw-toggle-desc">{{ t("WMS reserves from the highest-priority location with available stock when an outbound doesn't already specify one.") }}</span>
            </div>
          </div>

          <div class="cw-sub-row">
            <span class="cw-sub-label">{{ t('Priority order') }}</span>
            <div class="cw-sub-priority">
              <span class="cw-sub-value">{{ locationPrioritySummary }}</span>
              <button
                v-if="isEditing && storageLeaves.length"
                class="btn-enterprise btn-enterprise--secondary cw-manage-priority-btn"
                @click="locationPriorityDrawerOpen = true"
              >
                {{ t('Manage storage priority') }}
              </button>
            </div>
          </div>

          <h3 class="cw-subsection-title cw-subsection-title--spaced">{{ t('Inbound delivery') }}</h3>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">{{ t('Put-away') }}</span>
              <span class="cw-toggle-desc">{{ t('When off, receiving tasks in this warehouse skip put-away entirely. Finishing receiving completes the inbound flow.') }}</span>
            </div>
            <MpToggle
              :is-checked="draft.putAwayEnabled"
              :is-disabled="!isEditing"
              :aria-label="t('Put-away')"
              @update:is-checked="(v: boolean) => requestToggle('putAwayEnabled', v)"
            />
          </div>

          <h3 class="cw-subsection-title cw-subsection-title--spaced">{{ t('General settings') }}</h3>

          <div class="cw-toggle-row">
            <div class="cw-toggle-info">
              <span class="cw-toggle-title">{{ t('Barcode scan threshold') }}</span>
              <span class="cw-toggle-desc">{{ t('Items at or below this quantity must be scanned one by one. Above the limit, operators can enter the quantity manually.') }}</span>
            </div>
            <MpToggle v-model:is-checked="draft.scanThreshold" :is-disabled="!isEditing" :aria-label="t('Barcode scan threshold')" />
          </div>

          <div v-if="draft.scanThreshold" class="cw-sub-row">
            <span class="cw-sub-label">{{ t('Threshold qty') }}</span>
            <template v-if="isEditing">
              <input
                class="cw-sub-input"
                type="number"
                min="1"
                max="9999"
                :value="draft.scanThresholdValue"
                @input="draft.scanThresholdValue = Math.max(1, parseInt(($event.target as HTMLInputElement).value) || 1)"
              />
              <span class="cw-sub-unit">{{ t('pcs') }}</span>
            </template>
            <span v-else class="cw-sub-value">{{ draft.scanThresholdValue }} {{ t('pcs') }}</span>
          </div>

          <template v-if="activeScenario === 'WMS Standalone' || activeScenario === 'ERP'">
            <h3 class="cw-subsection-title cw-subsection-title--spaced">{{ t('Replenishment') }}</h3>

            <!-- Master toggle: off removes this warehouse from the worklist entirely,
                 which is what produces the "not set up" empty state. -->
            <div class="cw-toggle-row">
              <div class="cw-toggle-info">
                <span class="cw-toggle-title">{{ t('Replenishment worklist') }}</span>
                <span class="cw-toggle-desc">{{ t('Show this warehouse in Inventory › Replenishment and calculate reorder points for its stock.') }}</span>
              </div>
              <MpToggle v-model:is-checked="draft.replenishmentEnabled" :is-disabled="!isEditing" :aria-label="t('Replenishment worklist')" />
            </div>

            <template v-if="draft.replenishmentEnabled">
              <div class="cw-sub-row">
                <span class="cw-sub-label">{{ t('Safety days') }}</span>
                <template v-if="isEditing">
                  <input
                    class="cw-sub-input"
                    type="number"
                    min="0"
                    max="365"
                    :value="draft.replenishmentSafetyDays ?? ''"
                    :placeholder="t('Company default')"
                    @input="draft.replenishmentSafetyDays = ($event.target as HTMLInputElement).value === '' ? null : Math.max(0, parseInt(($event.target as HTMLInputElement).value) || 0)"
                  />
                  <span class="cw-sub-unit">{{ t('days') }}</span>
                </template>
                <span v-else class="cw-sub-value">
                  {{ draft.replenishmentSafetyDays === null
                    ? t('Company default')
                    : `${draft.replenishmentSafetyDays} ${t('days')}` }}
                </span>
              </div>

              <div class="cw-toggle-row">
                <div class="cw-toggle-info">
                  <span class="cw-toggle-title">{{ t('Count in-transit transfers as incoming supply') }}</span>
                  <span class="cw-toggle-desc">{{ t('Include stock already on its way from another warehouse when working out what is still needed.') }}</span>
                </div>
                <MpToggle v-model:is-checked="draft.replenishmentIncludeInTransit" :is-disabled="!isEditing" :aria-label="t('Count in-transit transfers as incoming supply')" />
              </div>
            </template>

            <h3 class="cw-subsection-title cw-subsection-title--spaced">{{ t('Cycle counts') }}</h3>

            <!-- Cycle count recommendation master toggle -->
            <div class="cw-toggle-row">
              <div class="cw-toggle-info">
                <span class="cw-toggle-title">{{ t('Cycle count recommendation') }}</span>
                <span class="cw-toggle-desc">{{ t('Show a recommendation board that surfaces which SKUs to prioritize for counting, based on negative stock, count variance, and minimum stock signals.') }}</span>
              </div>
              <MpToggle v-model:is-checked="draft.cycleCountRec" :is-disabled="!isEditing" :aria-label="t('Cycle count recommendation')" />
            </div>

            <!-- Sub-settings: only visible when master toggle is ON -->
            <template v-if="draft.cycleCountRec">

              <!-- Recommendation priority (drag to reorder when editing) -->
              <div class="cw-rec-group" :class="{ 'cw-rec-group--editing': isEditing }">
                <span class="cw-rec-group-label">{{ t('Recommendation priority') }}</span>

                <div
                  v-for="(ruleKey, i) in draft.cycleCountRuleOrder"
                  :key="ruleKey"
                  class="cw-rec-card"
                  :class="{
                    'cw-rec-card--dragging':   isEditing && ruleDragSrc === i,
                    'cw-rec-card--over-above': isEditing && ruleDragOver === i && ruleDragSrc !== null && ruleDragSrc > i,
                    'cw-rec-card--over-below': isEditing && ruleDragOver === i && ruleDragSrc !== null && ruleDragSrc < i,
                  }"
                  :draggable="isEditing ? 'true' : 'false'"
                  @dragstart="isEditing && onRuleDragStart(i, $event)"
                  @dragover="isEditing && onRuleDragOver(i, $event)"
                  @drop="isEditing && onRuleDrop(i, $event)"
                  @dragend="isEditing && onRuleDragEnd()"
                >
                  <div class="cw-rec-card-row">
                    <span v-if="isEditing" class="cw-rec-handle" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
                        <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
                        <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
                      </svg>
                    </span>

                    <div class="cw-toggle-info">
                      <span class="cw-rec-title-row">
                        <span class="cw-toggle-title">{{ RULE_META[ruleKey as RuleKey].title }}</span>
                        <MpTooltip
                          v-if="weightPercentFor(ruleKey as RuleKey) !== null"
                          :id="`cw-rec-weight-tt-${ruleKey}`"
                          placement="top"
                          use-portal
                        >
                          <template #label>
                            <strong>{{ t('Count priority rank:') }} {{ weightRankFor(ruleKey as RuleKey) }}</strong><br />
                            {{ t('impact') }} {{ weightPercentFor(ruleKey as RuleKey) }}% {{ t('to recommendation priority') }}
                          </template>
                          <MpBadge for="additionalInformation" type="information" size="sm">{{ weightPercentFor(ruleKey as RuleKey) }}%</MpBadge>
                        </MpTooltip>
                        <MpBadge v-else for="additionalInformation" type="announcement" size="sm">{{ t('Not applied') }}</MpBadge>
                      </span>
                      <span class="cw-toggle-desc">{{ RULE_META[ruleKey as RuleKey].desc }}</span>
                    </div>
                    <MpToggle
                      :is-checked="draft[RULE_META[ruleKey as RuleKey].draftKey]"
                      :is-disabled="!isEditing || (draft[RULE_META[ruleKey as RuleKey].draftKey] && cycleCountActiveRules === 1)"
                      :aria-label="RULE_META[ruleKey as RuleKey].ariaLabel"
                      @update:is-checked="draft[RULE_META[ruleKey as RuleKey].draftKey] = $event"
                    />
                  </div>
                </div>
              </div>

              <!-- Shared inputs (below the card list, single row) — fixed order,
                   not tied to the cards' drag-reorder. -->
              <div class="cw-rec-inputs-row">
                <MpFormControl
                  v-for="ruleKey in INPUT_ORDER" :key="ruleKey"
                  :id="`cw-rec-input-fc-${ruleKey}`" class="cw-rec-input"
                >
                  <MpFormLabel>{{ RULE_META[ruleKey].inputLabel }}</MpFormLabel>
                  <MpInputGroup :id="`cw-rec-input-group-${ruleKey}`" is-full-width class="cw-rec-input-group">
                    <MpInput
                      :id="`cw-rec-input-${ruleKey}`"
                      :model-value="String(draft[RULE_META[ruleKey].inputKey!])"
                      type="number"
                      min="0"
                      is-full-width
                      :is-disabled="inputDisabledFor(ruleKey)"
                      :aria-label="`${RULE_META[ruleKey].title} — ${RULE_META[ruleKey].inputLabel}`"
                      @update:model-value="(v: string) => draft[RULE_META[ruleKey].inputKey!] = Math.max(0, parseInt(v) || 0)"
                    />
                    <MpInputRightAddon>{{ RULE_META[ruleKey].inputSuffix }}</MpInputRightAddon>
                  </MpInputGroup>
                  <span v-if="inputCaptionFor(ruleKey)" class="cw-rec-input-caption">{{ inputCaptionFor(ruleKey) }}</span>
                </MpFormControl>
              </div>

              <!-- Auto-create toggle -->
              <div class="cw-toggle-row">
                <div class="cw-toggle-info">
                  <span class="cw-toggle-title">{{ t('Auto-create cycle count tasks') }}</span>
                  <span class="cw-toggle-desc">{{ t('Automatically create pending cycle count tasks for all recommended SKUs. When off, the recommendation board is advisory only; no tasks are created.') }}</span>
                </div>
                <MpToggle v-model:is-checked="draft.cycleCountAutoTask" :is-disabled="!isEditing" :aria-label="t('Auto-create cycle count tasks')" />
              </div>

              <!-- Cycle-count watch list -->
              <div class="cw-watchlist-row">
                <div class="cw-toggle-info">
                  <span class="cw-toggle-title">{{ t('Cycle-count watch list') }}</span>
                  <span class="cw-toggle-desc">{{ t('List of SKUs that will show on the cycle count recommendation list.') }}</span>
                </div>
                <button
                  class="btn-enterprise btn-enterprise--secondary"
                  :disabled="!isEditing"
                  @click="watchListDrawerOpen = true"
                >
                  {{ t('Select product') }}{{ draft.cycleCountWatchList.length ? ` (${draft.cycleCountWatchList.length})` : '' }}
                </button>
              </div>

            </template>
          </template>

        </div>

        <div v-if="isEditing" class="cw-action-bar">
          <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="requestCancel">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="requestSave">
            {{ isSaving ? t('Saving…') : t('Save changes') }}
          </button>
        </div>
      </section>
    </div>

    <!-- ── Discard confirmation dialog ────────────────────────────────────── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
      id="cw-discard-dialog"
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
          <p class="cw-dialog-body">{{ t('Your changes will not be saved.') }}</p>
        </MpModalBody>
        <MpModalFooter>
          <button class="btn-enterprise btn-enterprise--ghost" @click="discardOpen = false">{{ t('Keep editing') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="exitEdit">{{ t('Discard') }}</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Picking / Put-away toggle confirmation ─────────────────────────── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
      id="cw-toggle-confirm-dialog"
      :is-open="toggleConfirmOpen"
      size="md"
      @close="cancelToggleConfirm"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ toggleConfirmTitle }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <ul class="cw-dialog-list">
            <li v-for="item in toggleConfirmItems" :key="item">{{ item }}</li>
          </ul>
        </MpModalBody>
        <MpModalFooter>
          <button class="btn-enterprise btn-enterprise--ghost" @click="cancelToggleConfirm">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmToggle">{{ t('Confirm') }}</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Non-retroactive location priority change confirmation ────────────── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
      id="cw-rule-confirm-dialog"
      :is-open="ruleConfirmOpen"
      size="md"
      @close="ruleConfirmOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ t('Apply new storage location priority?') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <p class="cw-dialog-body">
            {{ t("This only applies to orders created from now on. Orders that already reserved a storage location keep their original bin — they won't be recalculated.") }}
          </p>
        </MpModalBody>
        <MpModalFooter>
          <button class="btn-enterprise btn-enterprise--ghost" @click="ruleConfirmOpen = false">{{ t('Keep editing') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmRuleChange">{{ t('Save changes') }}</button>
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

    <SelectProductDrawer
      v-model:open="watchListDrawerOpen"
      :products="pickerProducts"
      :model-value="draft.cycleCountWatchList"
      @save="applyWatchListPicker"
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
.cw-subsection-title--spaced { margin-top: var(--mp-spacing-4); padding-top: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.cw-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; }
.cw-toggle-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.cw-toggle-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cw-toggle-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.cw-action-bar { grid-column: 1 / 7; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-4); }
.cw-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }

.cw-dialog-body { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cw-dialog-list { margin: 0; padding-left: var(--mp-spacing-5); list-style-type: disc; display: flex; flex-direction: column; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.cw-section--spaced { margin-top: var(--mp-spacing-6); padding-top: var(--mp-spacing-6); border-top: 1px solid var(--mp-border-default); }

.cw-sub-row {
  display: flex; align-items: flex-start;
  gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; padding-left: var(--mp-spacing-4);
}
.cw-sub-label { width: 160px; flex-shrink: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cw-sub-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cw-sub-priority { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2); }
.cw-manage-priority-btn { font-size: var(--mp-font-sizes-sm) !important; }
.cw-sub-input {
  width: 80px; padding: 6px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); outline: none; text-align: right;
}
.cw-sub-input:focus { border-color: var(--mp-border-focused, #2563eb); }
.cw-sub-unit { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }

.cw-rec-group {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  margin: var(--mp-spacing-2) 0;
}
.cw-rec-group-label {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-subtle); text-transform: uppercase; letter-spacing: 0.4px;
}

.cw-rec-card {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
  transition: opacity 150ms, border-color 150ms;
}
.cw-rec-card[draggable="true"] { cursor: grab; user-select: none; }
.cw-rec-card[draggable="true"]:active { cursor: grabbing; }
.cw-rec-card--dragging { opacity: 0.4; }
.cw-rec-card--over-above { border-top: 2px solid var(--mp-border-selected, #0f6d4d); }
.cw-rec-card--over-below { border-bottom: 2px solid var(--mp-border-selected, #0f6d4d); }

.cw-rec-card-row {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
}
.cw-rec-card-row .cw-toggle-info { flex: 1; }
.cw-rec-title-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cw-rec-title-row :deep(.mp-badge) { flex-shrink: 0; cursor: default; }
.cw-rec-handle {
  flex-shrink: 0; color: var(--mp-text-disabled, #b0b6b8);
  display: flex; align-items: center;
}
.cw-rec-card:hover .cw-rec-handle { color: var(--mp-text-subtle); }

/* Shared inputs, below the card list, arranged in a single row. */
.cw-rec-inputs-row {
  display: flex; flex-wrap: wrap; gap: var(--mp-spacing-6);
  margin-top: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) 0;
}
.cw-rec-input {
  display: flex; flex-direction: column; align-items: flex-start;
  flex: 1 1 180px; min-width: 160px;
  padding: 0 0 var(--mp-spacing-4);
}
.cw-rec-input :deep(.mp-form-control__label) {
  margin-bottom: var(--mp-spacing-2);
}
.cw-rec-input-group {
  width: 100%;
}
.cw-rec-input-caption {
  margin-top: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle);
}

.cw-watchlist-row {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 0;
}
</style>
