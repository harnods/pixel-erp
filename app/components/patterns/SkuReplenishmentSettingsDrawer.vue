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
 * Custom Teleport overlay, matching the other drawers in this repo.
 */
import { MpIcon, MpInput, MpInputGroup, MpInputRightAddon, MpFormControl, MpFormLabel, MpToggle } from '@mekari/pixel3'
import type { WorklistRow } from '~/data/replenishment'
import {
  getSkuWarehouseOverride, saveSkuWarehouseOverride, clearReorderPointOverride,
} from '~/data/replenishmentSettings'

const props = defineProps<{ isOpen: boolean; row: WorklistRow | null }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved'): void
}>()

const { t } = useLocale()

const reorderPoint = ref('')
const safetyDays = ref('')
const maxLevel = ref('')
const coverageDays = ref('')
const manualLeadTime = ref('')
const tracked = ref(true)
const error = ref('')

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
  maxLevel.value = override.maxLevel !== undefined ? String(override.maxLevel) : ''
  coverageDays.value = override.coverageDays !== undefined ? String(override.coverageDays) : ''
  manualLeadTime.value = override.manualLeadTimeDays !== undefined ? String(override.manualLeadTimeDays) : ''
  tracked.value = row.fsn.tracked
  error.value = ''
})

function close() { emit('update:isOpen', false) }

function useCalculated() {
  const row = props.row
  if (!row) return
  clearReorderPointOverride(row.sku, row.warehouseId)
  reorderPoint.value = ''
  emit('saved')
}

function save() {
  const row = props.row
  if (!row) return

  // Validate on click and show an inline error — never a disabled button (DESIGN.md).
  const rop = reorderPoint.value === '' ? null : Number(reorderPoint.value)
  const safety = safetyDays.value === '' ? null : Number(safetyDays.value)
  const max = maxLevel.value === '' ? null : Number(maxLevel.value)
  const coverage = coverageDays.value === '' ? null : Number(coverageDays.value)
  const lead = manualLeadTime.value === '' ? null : Number(manualLeadTime.value)

  for (const [label, value] of [
    [t('Reorder point'), rop], [t('Safety days'), safety],
    [t('Max level'), max],
  ] as const) {
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      error.value = `${label} ${t('must be a whole number of 0 or more')}`
      return
    }
  }
  if (max !== null && rop !== null && max < rop) {
    error.value = t('Max level cannot be below the reorder point')
    return
  }

  // Passing `undefined` CLEARS a key rather than storing it: the settings module
  // spreads the patch over the existing record and then drops empty values. So an
  // emptied field goes back to inheriting, and tracking-on drops the override
  // instead of pinning the default.
  saveSkuWarehouseOverride(row.sku, row.warehouseId, {
    reorderPoint: rop ?? undefined,
    safetyDays: safety ?? undefined,
    maxLevel: max ?? undefined,
    coverageDays: coverage ?? undefined,
    manualLeadTimeDays: lead ?? undefined,
    tracked: tracked.value ? undefined : false,
  })

  emit('saved')
  close()
}
</script>

<template>
  <Transition name="rp-set">
    <div v-if="isOpen && row" class="rp-set-overlay" @click.self="close">
      <div class="rp-set-panel" role="dialog" :aria-label="t('Replenishment settings')">
        <header class="rp-set-header">
          <span class="rp-set-title">{{ t('Replenishment settings') }}</span>
          <button class="rp-set-close" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </button>
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
            <MpToggle id="rp-set-tracked" v-model="tracked" />
          </div>

          <MpFormControl id="rp-set-rop-fc">
            <MpFormLabel>{{ t('Reorder point') }}</MpFormLabel>
            <MpInputGroup id="rp-set-rop-g">
              <MpInput id="rp-set-rop" v-model="reorderPoint" type="number" :placeholder="t('Calculated')" />
              <MpInputRightAddon>{{ row.unit }}</MpInputRightAddon>
            </MpInputGroup>
            <span class="rp-set-hint">
              <template v-if="row.reorderPointSource === 'none'">
                {{ t('No demand yet, so nothing is calculated.') }}
              </template>
              <template v-else>
                {{ t('Calculated') }}: {{ num(row.reorderPoint) }} {{ row.unit }}
                <a v-if="reorderPoint !== ''" class="rp-set-link" @click="useCalculated">
                  {{ t('Use calculated') }}
                </a>
              </template>
            </span>
          </MpFormControl>

          <MpFormControl id="rp-set-safety-fc">
            <MpFormLabel>{{ t('Safety days') }}</MpFormLabel>
            <MpInputGroup id="rp-set-safety-g">
              <MpInput id="rp-set-safety" v-model="safetyDays" type="number" :placeholder="String(row.safetyDays)" />
              <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
            </MpInputGroup>
            <span class="rp-set-hint">
              {{ t('Currently') }} {{ row.safetyDays }} {{ t('days') }} — {{ t('leave empty to keep inheriting it') }}
            </span>
          </MpFormControl>

          <MpFormControl id="rp-set-coverage-fc">
            <MpFormLabel>{{ t('Order coverage') }}</MpFormLabel>
            <MpInputGroup id="rp-set-coverage-g">
              <MpInput id="rp-set-coverage" v-model="coverageDays" type="number" :placeholder="String(row.coverageDays)" />
              <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
            </MpInputGroup>
            <span class="rp-set-hint">
              {{ t('How many days each order should cover. Sizes the quantity; it never changes when this product becomes due.') }}
            </span>
          </MpFormControl>

          <MpFormControl id="rp-set-max-fc">
            <MpFormLabel>{{ t('Max level') }}</MpFormLabel>
            <MpInputGroup id="rp-set-max-g">
              <MpInput id="rp-set-max" v-model="maxLevel" type="number" :placeholder="t('Use order coverage')" />
              <MpInputRightAddon>{{ row.unit }}</MpInputRightAddon>
            </MpInputGroup>
            <span class="rp-set-hint">
              {{ t('Order up to this level in units instead of using order coverage. Leave empty to size by days.') }}
            </span>
          </MpFormControl>

          <!-- Only shown when the ladder found nothing to measure (US-003 AC-02). -->
          <MpFormControl v-if="row.leadTimeTier === 'none' || row.leadTimeTier === 'manual'" id="rp-set-lead-fc">
            <MpFormLabel>{{ t('Lead time') }}</MpFormLabel>
            <MpInputGroup id="rp-set-lead-g">
              <MpInput id="rp-set-lead" v-model="manualLeadTime" type="number" />
              <MpInputRightAddon>{{ t('days') }}</MpInputRightAddon>
            </MpInputGroup>
            <span class="rp-set-hint">
              {{ t('No purchase-order history for this vendor and product, so lead time cannot be measured. Set it here, or start raising POs and it will be measured automatically.') }}
            </span>
          </MpFormControl>
        </div>

        <footer class="rp-set-footer">
          <span v-if="error" class="rp-set-error">{{ error }}</span>
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ t('Save changes') }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rp-set-enter-active, .rp-set-leave-active { transition: background-color 250ms ease; }
.rp-set-enter-from, .rp-set-leave-to { background-color: transparent; }
.rp-set-enter-active .rp-set-panel { transition: transform 350ms ease-out; }
.rp-set-leave-active .rp-set-panel { transition: transform 250ms ease-in; }
.rp-set-enter-from .rp-set-panel, .rp-set-leave-to .rp-set-panel { transform: translateX(calc(100% + 12px)); }

.rp-set-overlay {
  position: fixed; inset: 0; z-index: 1350;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.rp-set-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
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
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
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
.rp-set-error { flex: 1; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
</style>
