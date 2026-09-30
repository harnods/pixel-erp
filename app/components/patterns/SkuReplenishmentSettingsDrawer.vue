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
 * calculated" only clears the field, so Cancel still discards it.
 */
import {
  MpIcon, MpButton, MpInput, MpInputGroup, MpInputRightAddon, MpFormControl, MpFormLabel,
  MpFormErrorMessage, MpToggle,
} from '@mekari/pixel3'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import type { WorklistRow } from '~/data/replenishment'
import { getSkuWarehouseOverride, saveSkuWarehouseOverride } from '~/data/replenishmentSettings'

const props = defineProps<{ isOpen: boolean; row: WorklistRow | null }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved'): void
}>()

const { t } = useLocale()

type Field = 'reorderPoint' | 'safetyDays' | 'manualLeadTime'

const reorderPoint = ref('')
const safetyDays = ref('')
const manualLeadTime = ref('')
const tracked = ref(true)
const errors = reactive<Partial<Record<Field, string>>>({})
const muteConfirmOpen = ref(false)
/** Set once the user confirms turning tracking off, so Save then goes through. */
let muteConfirmed = false

const num = (v: number, digits = 0) =>
  v.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Load the raw OVERRIDES, not the resolved values — an empty box must mean
 *  "inherit", so pre-filling it with the inherited number would silently turn a
 *  fallback into a hard-coded override on the next save. */
watch(() => props.isOpen, (open) => {
  const row = props.row
  if (!open || !row) return
  const override = getSkuWarehouseOverride(row.sku, row.warehouseId)
  reorderPoint.value = override.reorderPoint !== undefined ? String(override.reorderPoint) : ''
  safetyDays.value = override.safetyDays !== undefined ? String(override.safetyDays) : ''
  manualLeadTime.value = override.manualLeadTimeDays !== undefined ? String(override.manualLeadTimeDays) : ''
  tracked.value = row.fsn.tracked
  muteConfirmed = false
  for (const k of Object.keys(errors)) delete errors[k as Field]
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

function close() { emit('update:isOpen', false) }

/** Clears the override in the form only; Save commits it, Cancel discards it. */
function useCalculated() { reorderPoint.value = '' }

function parse(field: Field, raw: string): number | null | undefined {
  if (raw === '') return null
  const v = Number(raw)
  if (!Number.isInteger(v) || v < 0) {
    errors[field] = t('Enter a whole number of 0 or more.')
    return undefined
  }
  return v
}

function save() {
  const row = props.row
  if (!row) return

  // Validate on click and show the error at the field — never a disabled button
  // (rule/btn-no-disabled-validation, rule/form-errors-inline).
  for (const k of Object.keys(errors)) delete errors[k as Field]
  const rop = parse('reorderPoint', reorderPoint.value)
  const safety = parse('safetyDays', safetyDays.value)
  const lead = parse('manualLeadTime', manualLeadTime.value)
  if (Object.keys(errors).length) return

  // Turning tracking off hides the row from the worklist — confirm it, as the
  // worklist's own "Turn off tracking" does.
  if (row.fsn.tracked && !tracked.value && !muteConfirmed) {
    muteConfirmOpen.value = true
    return
  }
  commit({ rop: rop ?? null, safety: safety ?? null, lead: lead ?? null })
}

function commit(v: { rop: number | null; safety: number | null; lead: number | null }) {
  const row = props.row
  if (!row) return
  // Passing `undefined` CLEARS a key rather than storing it: the settings module
  // spreads the patch over the existing record and then drops empty values. So an
  // emptied field goes back to inheriting, and tracking-on drops the override
  // instead of pinning the default.
  saveSkuWarehouseOverride(row.sku, row.warehouseId, {
    reorderPoint: v.rop ?? undefined,
    safetyDays: v.safety ?? undefined,
    manualLeadTimeDays: v.lead ?? undefined,
    tracked: tracked.value ? undefined : false,
  })
  emit('saved')
  close()
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
      <div class="rp-set-panel" role="dialog" :aria-label="t('Replenishment settings')">
        <header class="rp-set-header">
          <span class="rp-set-title">{{ t('Replenishment settings') }}</span>
          <MpButton class="rp-set-close" is-rounded :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="rp-set-body">
          <div class="rp-set-identity">
            <p class="rp-set-product">{{ row.productName }}</p>
            <p class="rp-set-sub">{{ row.sku }} · {{ row.warehouseName }}</p>
          </div>

          <div class="rp-set-toggle-row">
            <div class="rp-set-toggle-text">
              <span class="rp-set-toggle-label">{{ t('Track for replenishment') }}</span>
              <span class="rp-set-hint">
                {{ t('When off, this product never appears in the worklist for this warehouse — but a genuine stockout still raises an alert.') }}
              </span>
            </div>
            <MpToggle id="rp-set-tracked" v-model:is-checked="tracked" :aria-label="t('Track for replenishment')" />
          </div>

          <MpFormControl id="rp-set-rop-fc" :is-invalid="!!errors.reorderPoint">
            <MpFormLabel>{{ t('Reorder point') }}</MpFormLabel>
            <MpInputGroup id="rp-set-rop-g">
              <MpInput id="rp-set-rop" v-model="reorderPoint" type="number" />
              <MpInputRightAddon>{{ row.unit }}</MpInputRightAddon>
            </MpInputGroup>
            <MpFormErrorMessage v-if="errors.reorderPoint">{{ errors.reorderPoint }}</MpFormErrorMessage>
            <!-- Always the ENGINE's figure, even while an override is the trigger (D17). -->
            <span class="rp-set-hint">
              <template v-if="row.calculatedReorderPoint === null">
                {{ t('No demand yet, so nothing is calculated.') }}
              </template>
              <template v-else>
                {{ t('Calculated') }}: {{ num(row.calculatedReorderPoint) }} {{ row.unit }}
                <a v-if="reorderPoint !== ''" class="rp-set-link" @click="useCalculated">
                  {{ t('Use calculated') }}
                </a>
              </template>
            </span>
            <span v-if="overrideTooLow" class="rp-set-hint rp-set-hint--warning">
              {{ t('This is well below the calculated reorder point, so this warehouse may stock out before it is flagged.') }}
            </span>
          </MpFormControl>

          <MpFormControl id="rp-set-safety-fc" :is-invalid="!!errors.safetyDays">
            <MpFormLabel>{{ t('Safety days') }}</MpFormLabel>
            <MpInputGroup id="rp-set-safety-g">
              <MpInput id="rp-set-safety" v-model="safetyDays" type="number" />
              <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
            </MpInputGroup>
            <MpFormErrorMessage v-if="errors.safetyDays">{{ errors.safetyDays }}</MpFormErrorMessage>
            <span class="rp-set-hint">
              {{ t('Currently') }} {{ row.safetyDays }} {{ t('days') }} — {{ t('leave empty to keep inheriting it') }}
            </span>
          </MpFormControl>

          <!-- No order-coverage or max-level field: coverage is a CATEGORY policy set in
               Replenishment settings, with no SKU or SKU-warehouse entry point
               (PRD US-005 AC-06). Shown here read-only so the number is not a mystery. -->
          <div class="rp-set-readonly">
            <span class="rp-set-toggle-label">{{ t('Order coverage') }}</span>
            <span class="rp-set-hint">
              {{ row.coverageDays }} {{ t('days') }} — {{ t('set per product category in Replenishment settings') }}
            </span>
          </div>


          <!-- Only shown when the ladder found nothing to measure (US-003 AC-02). -->
          <MpFormControl
            v-if="row.leadTimeTier === 'none' || row.leadTimeTier === 'manual'"
            id="rp-set-lead-fc"
            :is-invalid="!!errors.manualLeadTime"
          >
            <MpFormLabel>{{ t('Lead time') }}</MpFormLabel>
            <MpInputGroup id="rp-set-lead-g">
              <MpInput id="rp-set-lead" v-model="manualLeadTime" type="number" />
              <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
            </MpInputGroup>
            <MpFormErrorMessage v-if="errors.manualLeadTime">{{ errors.manualLeadTime }}</MpFormErrorMessage>
            <span class="rp-set-hint">
              {{ t('No purchase-order history for this vendor and product, so lead time cannot be measured. Set it here, or start raising POs and it will be measured automatically.') }}
            </span>
          </MpFormControl>
        </div>

        <footer class="rp-set-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ t('Save changes') }}</button>
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
  width: min(420px, calc(100% - 24px));
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
.rp-set-identity { display: flex; flex-direction: column; }
.rp-set-product {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rp-set-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.rp-set-toggle-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  padding-bottom: var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-set-toggle-text { display: flex; flex-direction: column; min-width: 0; }
.rp-set-toggle-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.rp-set-hint {
  display: block; margin-top: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rp-set-link { margin-left: var(--mp-spacing-1); color: var(--mp-text-link); cursor: pointer; }

.rp-set-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.rp-set-hint--warning { color: var(--mp-colors-text-warning); }
.rp-set-readonly { display: flex; flex-direction: column; }
</style>
