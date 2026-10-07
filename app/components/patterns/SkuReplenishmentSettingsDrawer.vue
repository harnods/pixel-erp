<script setup lang="ts">
/**
 * Per-SKU-per-warehouse replenishment settings (PRD US-024, US-013, US-003,
 * US-011).
 *
 * The grain matters: OD-008 is explicit that each location replenishes to its own
 * demand, so every field here is scoped to ONE product in ONE warehouse. Leaving a
 * field empty is meaningful — it falls back down the precedence chain (warehouse →
 * category → company), and the caption under each field says what it would inherit.
 *
 * Canonical Teleport drawer shell; closes only via × or Cancel
 * (rule/modal-drawer-close-explicit-only). Nothing is written until Save — "Use
 * calculated" only clears the field, so Cancel still discards it. Closing with
 * edits asks first, so a stray × never loses them (reachable-states.md).
 */
import {
  MpIcon, MpTooltip, MpButton, MpButtonGroup, MpTextlink, MpInput, MpInputGroup, MpInputRightAddon,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpToggle,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import type { WorklistRow } from '~/data/replenishment'
import { getSkuWarehouseOverride, saveSkuWarehouseOverride } from '~/data/replenishmentSettings'

const props = defineProps<{ isOpen: boolean; row: WorklistRow | null }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved'): void
}>()

const { t, tf } = useLocale()
const router = useRouter()

type Field = 'reorderPoint' | 'safetyDays'

const reorderPoint = ref('')
const safetyDays = ref('')
const tracked = ref(true)
const errors = reactive<Partial<Record<Field, string>>>({})
const muteConfirmOpen = ref(false)
const discardConfirmOpen = ref(false)
/** Inline, never a toast (rule/form-errors-inline); every edit stays in the form. */
const saveError = ref('')
/** The form as it was loaded — what "unsaved" is measured against. */
const initial = ref('')
const snapshot = () => JSON.stringify([reorderPoint.value, safetyDays.value, tracked.value])
const isDirty = computed(() => initial.value !== '' && snapshot() !== initial.value)
/** Set once the user confirms turning tracking off, so Save then goes through. */
let muteConfirmed = false
let hadSafetyOverride = false

const num = (v: number, digits = 0) =>
  v.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** The form opens FILLED: the reorder point shows the calculated figure and safety
 *  days the value in force, so nothing is blank. Saving a value that still equals
 *  its default stores no override (see `commit`), so it keeps inheriting. */
watch(() => props.isOpen, (open) => {
  const row = props.row
  if (!open || !row) return
  const override = getSkuWarehouseOverride(row.sku, row.warehouseId)
  const calc = row.calculatedReorderPoint
  reorderPoint.value = override.reorderPoint !== undefined ? String(override.reorderPoint) : calc !== null ? String(calc) : ''
  safetyDays.value = String(row.safetyDays)
  hadSafetyOverride = override.safetyDays !== undefined
  tracked.value = row.fsn.tracked
  muteConfirmed = false
  saveError.value = ''
  discardConfirmOpen.value = false
  for (const k of Object.keys(errors)) delete errors[k as Field]
  initial.value = snapshot()
})

/**
 * A hand-set floor well under what demand justifies is how a busy location quietly
 * stops being flagged (US-021 VR-05) — surfaced, not blocked. Same 20% tolerance
 * as `isManualFloorTooLow` on product detail.
 */
const overrideTooLow = computed(() => {
  const calc = props.row?.calculatedReorderPoint ?? null
  if (reorderPoint.value === '' || calc === null || calc <= 0) return false
  const v = Number(reorderPoint.value)
  return !Number.isNaN(v) && v < calc * 0.8
})

/** The order-up-to (Max) level — the ceiling a manual reorder point is clamped to. */
const maxLevel = computed(() => (props.row ? Math.round(props.row.suggestion.targetQty) : 0))

/**
 * A reorder point above the order-up-to (Max) is self-contradictory: the trigger
 * would sit above the level we ever stock up to. The engine caps it to Max (D13),
 * so the form says so rather than imply a number that won't take effect.
 */
const overrideAboveMax = computed(() => {
  if (reorderPoint.value === '' || maxLevel.value <= 0) return false
  const v = Number(reorderPoint.value)
  return !Number.isNaN(v) && v > maxLevel.value
})

/** The "how it gets resolved" note, split around the link to the lead-time defaults. */
const leadNoteParts = computed(() =>
  tf('No purchase orders for this vendor and product yet, so lead time cannot be measured. Add a preferred vendor, make a purchase, or set a default in {link}', { link: '\u0000' }).split('\u0000'))
function goToDefaults() {
  leave()
  router.push('/replenishment-settings#lead-time')
}

function leave() { discardConfirmOpen.value = false; emit('update:isOpen', false) }

/** × and Cancel both land here: with edits, ask before discarding them. */
function close() {
  if (isDirty.value) { discardConfirmOpen.value = true; return }
  leave()
}

/** Back to the calculated figure in the form only; Save commits it, Cancel discards it. */
const differsFromCalculated = computed(() => {
  const calc = props.row?.calculatedReorderPoint ?? null
  return calc !== null && reorderPoint.value !== String(calc)
})
function useCalculated() {
  const calc = props.row?.calculatedReorderPoint
  if (calc !== null && calc !== undefined) reorderPoint.value = String(calc)
}

/**
 * A safety-days value of 0 is not usable, so it starts at 1; the reorder point may be 0. `required` fields cannot be left empty.
 */
function parse(field: Field, raw: string, min = 0, required = false): number | null | undefined {
  if (raw === '' && !required) return null
  const v = raw === '' ? Number.NaN : Number(raw)
  if (!Number.isInteger(v) || v < min) {
    errors[field] = min === 1 ? t('Enter a whole number of 1 or more') : t('Enter a whole number of 0 or more')
    return undefined
  }
  return v
}

function save() {
  const row = props.row
  if (!row) return

  // Validate on click and show the error at the field — never a disabled button
  // (rule/btn-no-disabled-validation, rule/form-errors-inline).
  saveError.value = ''
  for (const k of Object.keys(errors)) delete errors[k as Field]
  // With a calculated figure the field is pre-filled and cannot be emptied; with no
  // demand yet there is nothing to pre-fill, so it may stay blank.
  const rop = parse('reorderPoint', reorderPoint.value, 0, row.calculatedReorderPoint !== null)
  const safety = parse('safetyDays', safetyDays.value, 1, true)
  if (Object.keys(errors).length) return

  // Turning tracking off hides the row from the worklist — confirm it, as the
  // worklist's own "Turn off tracking" does.
  if (row.fsn.tracked && !tracked.value && !muteConfirmed) {
    muteConfirmOpen.value = true
    return
  }
  // A value still equal to its default is not an override: store nothing so it keeps inheriting.
  const ropOverride = rop !== null && rop !== undefined && rop !== row.calculatedReorderPoint ? rop : null
  const safetyOverride = safety !== null && safety !== undefined && (hadSafetyOverride || safety !== row.safetyDays) ? safety : null
  commit({ rop: ropOverride, safety: safetyOverride })
}

function commit(v: { rop: number | null; safety: number | null }) {
  const row = props.row
  if (!row) return
  // Passing `undefined` CLEARS a key rather than storing it: the settings module
  // spreads the patch over the existing record and then drops empty values. So an
  // emptied field goes back to inheriting, and tracking-on drops the override
  // instead of pinning the default.
  try {
    saveSkuWarehouseOverride(row.sku, row.warehouseId, {
      reorderPoint: v.rop ?? undefined,
      safetyDays: v.safety ?? undefined,
      tracked: tracked.value ? undefined : false,
    })
  } catch {
    saveError.value = t('The settings could not be saved. Try again')
    return
  }
  emit('saved')
  leave()
}

function confirmMute() {
  muteConfirmed = true
  save()
  muteConfirmed = false
}
</script>

<template>
  <Teleport to="body">
  <Transition name="rp-set">
    <div v-if="isOpen && row" class="rp-set-overlay">
      <div class="rp-set-panel" role="dialog" :aria-label="t('Product replenishment settings')">
        <header class="rp-set-header">
          <span class="rp-set-title">{{ t('Product replenishment settings') }}</span>
          <MpButton class="rp-set-close" is-rounded :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="rp-set-body">
          <!-- Identity: key/value pairs are ContentList (docs/patterns/ContentList.md). -->
          <div class="rp-set-identity">
            <ContentList :label="t('Product')" :value="row.productName" />
            <ContentList :label="t('SKU')" :value="row.sku" />
            <ContentList :label="t('Warehouse')" :value="row.warehouseName" />
            <!-- Coverage is a category policy: shown read-only, with where to change it on hover
                 (PRD US-005 AC-06 — no SKU or SKU-warehouse entry point). -->
            <ContentList :value="tf('{n} days', { n: row.coverageDays })">
              <template #label>
                <span class="rp-set-label">
                  {{ t('Order coverage') }}
                  <MpTooltip :label="t('Set per product category in Replenishment settings.')" placement="top">
                    <MpIcon name="info" size="sm" class="rp-set-info" :aria-label="t('Order coverage')" />
                  </MpTooltip>
                </span>
              </template>
            </ContentList>
          </div>

          <MpFormControl id="rp-set-tracked-fc" class="rp-set-toggle-row">
            <div class="rp-set-toggle-text">
              <MpFormLabel>{{ t('Track for replenishment') }}</MpFormLabel>
              <span class="rp-set-hint">
                {{ t('When off, this product never appears in the worklist for this warehouse, but a genuine stockout still raises an alert') }}
              </span>
            </div>
            <MpToggle id="rp-set-tracked" v-model:is-checked="tracked" :aria-label="t('Track for replenishment')" />
          </MpFormControl>

          <!-- Reorder point and safety days sit side by side. -->
          <div class="rp-set-pair">
            <MpFormControl id="rp-set-rop-fc" :is-invalid="!!errors.reorderPoint">
              <MpFormLabel>{{ t('Reorder point') }}</MpFormLabel>
              <MpInputGroup id="rp-set-rop-g">
                <MpInput id="rp-set-rop" v-model="reorderPoint" type="number" />
                <MpInputRightAddon has-background>{{ row.unit }}</MpInputRightAddon>
              </MpInputGroup>
              <MpFormErrorMessage v-if="errors.reorderPoint">{{ errors.reorderPoint }}</MpFormErrorMessage>
              <!-- Always the ENGINE's figure, even while an override is the trigger (D17). -->
              <span class="rp-set-hint">
                <template v-if="row.calculatedReorderPoint === null">
                  {{ t('No demand yet, so nothing is calculated') }}
                </template>
                <template v-else>
                  {{ tf('Calculated reorder point: {n} {unit}', { n: num(row.calculatedReorderPoint), unit: row.unit }) }}
                  <MpTextlink v-if="differsFromCalculated" id="rp-set-use-calculated" as="a" class="rp-set-link" @click.prevent="useCalculated">
                    {{ t('Use calculated') }}
                  </MpTextlink>
                </template>
              </span>
              <span v-if="overrideTooLow" class="rp-set-hint rp-set-hint--warning">
                {{ t('This is well below the calculated reorder point, so this warehouse may stock out before it is flagged') }}
              </span>
              <span v-if="overrideAboveMax" class="rp-set-hint rp-set-hint--warning" data-devchange="replenishment-manual-min-clamped-to-max">
                {{ tf('This is above the order-up-to level ({n} {unit}), so {n} is used as the reorder point', { n: num(maxLevel), unit: row.unit }) }}
              </span>
            </MpFormControl>

            <MpFormControl id="rp-set-safety-fc" :is-invalid="!!errors.safetyDays">
              <MpFormLabel>{{ t('Safety days') }}</MpFormLabel>
              <MpInputGroup id="rp-set-safety-g">
                <MpInput id="rp-set-safety" v-model="safetyDays" type="number" />
                <MpInputRightAddon has-background>{{ t('days') }}</MpInputRightAddon>
              </MpInputGroup>
              <MpFormErrorMessage v-if="errors.safetyDays">{{ errors.safetyDays }}</MpFormErrorMessage>
            </MpFormControl>
          </div>

          <!-- Lead time is never typed (US-001 AC-09). With nothing to measure it is simply not set:
               say how it gets resolved instead of offering a field. -->
          <div v-if="row.leadTimeTier === 'none'" class="rp-set-lead" data-devchange="sku-settings-lead-time-not-set">
            <ContentList :label="t('Lead time')" :value="t('Not set')" />
            <p class="rp-set-hint">
              {{ leadNoteParts[0] }}<MpTextlink id="rp-set-lead-defaults" as="a" class="rp-set-link" @click.prevent="goToDefaults">{{ t('Replenishment settings') }}</MpTextlink>{{ leadNoteParts[1] }}
            </p>
          </div>

          <!-- A failed save keeps every edit and says so here, never in a toast. -->
          <p v-if="saveError" class="rp-set-error" role="alert">{{ saveError }}</p>
        </div>

        <footer class="rp-set-footer">
          <MpButtonGroup class="erp-action-footer">
            <MpButton id="rp-set-cancel" variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
            <MpButton id="rp-set-save" variant="primary" is-rounded @click="save">{{ t('Save changes') }}</MpButton>
          </MpButtonGroup>
        </footer>
      </div>
    </div>
  </Transition>
  </Teleport>

  <ConfirmModal
    v-model:is-open="muteConfirmOpen"
    :title="t('Turn off tracking for this product?')"
    :description="t('It stops appearing in the replenishment worklist. Its reorder point and safety days are kept, so turning tracking back on restores them. Existing purchase orders are not affected.')"
    :confirm-label="t('Turn off tracking')"
    :is-danger="false"
    @confirm="confirmMute"
  />

  <!-- Unsaved changes: × or Cancel with edits never silently loses them. -->
  <ConfirmModal
    :is-open="discardConfirmOpen"
    :title="t('Discard unsaved changes?')"
    :description="t('Your changes to this product\'s replenishment settings have not been saved.')"
    :confirm-label="t('Discard changes')"
    :cancel-label="t('Keep editing')"
    @update:is-open="(v: boolean) => { discardConfirmOpen = v }"
    @confirm="leave"
  />
</template>

<style scoped>
.rp-set-enter-active, .rp-set-leave-active { transition: background-color 250ms ease; }
.rp-set-enter-from, .rp-set-leave-to { background-color: transparent; }
.rp-set-enter-active .rp-set-panel { transition: transform 350ms ease-out; }
.rp-set-leave-active .rp-set-panel { transition: transform 250ms ease-in; }
.rp-set-enter-from .rp-set-panel, .rp-set-leave-to .rp-set-panel { transform: translateX(calc(100% + 12px)); }

.rp-set-overlay {
  position: fixed; inset: 0; z-index: 1350;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.rp-set-panel {
  margin: var(--mp-spacing-3);
  width: min(720px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.rp-set-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-set-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-set-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.rp-set-close:hover { background: var(--mp-background-neutral-hovered); }

.rp-set-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
  padding: var(--mp-spacing-4);
}
/* Four fields on one row; the product name gets the most room. */
.rp-set-identity { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 0.7fr) minmax(0, 1.4fr) minmax(0, 1fr); column-gap: var(--mp-spacing-4); }
.rp-set-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--mp-spacing-4); align-items: start; }
.rp-set-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.rp-set-toggle-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  padding-bottom: var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-set-toggle-text { display: flex; flex-direction: column; min-width: 0; }

.rp-set-lead { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.rp-set-hint {
  display: block; margin-top: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rp-set-label { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.rp-set-info { color: var(--mp-colors-icon-default); cursor: help; }
/* 12px each side so the suffix is not cramped against its text (matches the settings page). */
.rp-set-body :deep(.mp-input-addon__root) { padding: 0 var(--mp-spacing-3); }
/* MpTextlink pins its font-size with a layered !important that no page CSS can beat, so
   scale it instead: 14px x 12/14 = the 12px of the caption it sits in. */
.rp-set-link { margin-left: var(--mp-spacing-1); zoom: calc(12 / 14); }
.rp-set-error { font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }

.rp-set-footer {
  flex-shrink: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.rp-set-hint--warning { color: var(--mp-colors-text-warning); }
</style>
