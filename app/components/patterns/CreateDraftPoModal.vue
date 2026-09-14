<script setup lang="ts">
/**
 * Create draft purchase orders from the worklist (PRD OD-007, US-020..US-023).
 *
 * The confirmation step is deliberate: the user sees the per-vendor grouping, the
 * editable quantities and the SKIPPED lines BEFORE anything is created, so
 * "2 lines skipped — no vendor" is a decision rather than a surprise afterwards
 * (US-021 EH-01). The same summary is repeated in the success toast as a record.
 *
 * Custom Teleport overlay, matching ConfirmModal.vue — MpModal has no structural
 * CSS in this Pixel3 build.
 */
import { MpIcon, MpInput, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import type { WorklistRow } from '~/data/replenishment'
import { planDraftPos, skipReasonLabel } from '~/data/replenishmentDraftPo'
import { vendorItemsForSku, vendorNameFor } from '~/data/vendorItems'
import { formatIDR } from '~/utils/currency'

const props = defineProps<{ isOpen: boolean; rows: WorklistRow[] }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm', payload: { overrides: Record<string, number>; vendorChoices: Record<string, string> }): void
  (e: 'assign-vendor', sku: string): void
}>()

const { t } = useLocale()

/** Local, discarded on close — edits never leak out unless the user confirms. */
const overrides = reactive<Record<string, number>>({})
const vendorChoices = reactive<Record<string, string>>({})
const qtyError = ref('')

watch(() => props.isOpen, (open) => {
  if (!open) return
  for (const k of Object.keys(overrides)) delete overrides[k]
  for (const k of Object.keys(vendorChoices)) delete vendorChoices[k]
  qtyError.value = ''
})

/** Re-planned live, so changing a vendor visibly re-groups the line. */
const plan = computed(() => planDraftPos(props.rows, { ...overrides }, { ...vendorChoices }))

/** Every vendor that can supply this SKU — the alternate picker's options. */
function alternativesFor(sku: string) {
  return vendorItemsForSku(sku)
}

function chooseVendor(rowKey: string, vendorId: string) {
  vendorChoices[rowKey] = vendorId
}

function setQty(rowKey: string, raw: string) {
  const n = Number(raw)
  if (raw === '' || Number.isNaN(n)) delete overrides[rowKey]
  else overrides[rowKey] = Math.max(0, Math.floor(n))
  qtyError.value = ''
}

function rowKeyFor(sku: string, warehouseId: string) { return `${sku}::${warehouseId}` }

/** Vendor-rule advisories — shown per cell, never blocking (they are the vendor's
 *  rules, not validation of the user's intent). */
function qtyNote(line: ReturnType<typeof planDraftPos>['groups'][number]['lines'][number]): string {
  const vi = line.vendorItem
  if (line.finalQty < vi.moq) return `${t('Below MOQ')} ${vi.moq} ${vi.purchaseUnit}`
  if (line.finalQty % vi.packSize !== 0) return `${t('Not a whole pack of')} ${vi.packSize}`
  return ''
}

const confirmLabel = computed(() => {
  const n = plan.value.totals.poCount
  return n === 1 ? t('Create draft PO') : `${t('Create')} ${n} ${t('draft POs')}`
})

const summaryLine = computed(() => {
  const { poCount, vendorCount, lineCount } = plan.value.totals
  if (poCount === 0) return t('Nothing can be ordered from this selection.')
  const poPart = poCount === 1 ? t('1 draft PO') : `${poCount} ${t('draft POs')}`
  const vendorPart = vendorCount === 1 ? t('1 vendor') : `${vendorCount} ${t('vendors')}`
  const linePart = lineCount === 1 ? t('1 line') : `${lineCount} ${t('lines')}`
  return `${poPart} ${t('across')} ${vendorPart} · ${linePart}`
})

function close() { emit('update:isOpen', false) }

function confirm() {
  // No disabled buttons for validation (DESIGN.md) — validate on click.
  if (plan.value.totals.poCount === 0) {
    qtyError.value = t('Add a vendor to at least one product.')
    return
  }
  const zeroLines = Object.entries(overrides).filter(([, v]) => v <= 0).length
  if (zeroLines > 0) {
    qtyError.value = `${t('Enter a quantity for')} ${zeroLines} ${zeroLines === 1 ? t('product') : t('products')}`
    return
  }
  emit('confirm', { overrides: { ...overrides }, vendorChoices: { ...vendorChoices } })
}
</script>

<template>
  <Transition name="rp-po">
    <div v-if="isOpen" class="rp-po-overlay" @click.self="close">
      <div class="rp-po-panel" role="dialog" aria-modal="true" :aria-label="t('Create draft purchase orders')">
        <header class="rp-po-header">
          <span class="rp-po-title">{{ t('Create draft purchase orders') }}</span>
          <button class="rp-po-close" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="rp-po-body">
          <p class="rp-po-summary">{{ summaryLine }}</p>
          <p v-if="plan.skipped.length" class="rp-po-summary rp-po-summary--warning">
            {{ plan.skipped.length }}
            {{ plan.skipped.length === 1 ? t('line skipped') : t('lines skipped') }}
            — {{ t('see below') }}
          </p>

          <!-- One card per vendor + warehouse: a PO has exactly one ship-to. -->
          <section v-for="group in plan.groups" :key="group.key" class="rp-po-card">
            <header class="rp-po-card-head">
              <div>
                <p class="rp-po-vendor">{{ group.vendorName }}</p>
                <p class="rp-po-card-sub">
                  {{ group.warehouseName }} · {{ t('Lead time') }} {{ group.leadTimeDays }} {{ t('days') }}
                </p>
              </div>
              <div class="rp-po-card-total">
                <span class="rp-po-card-total-label">{{ t('Est. total') }}</span>
                <span class="rp-po-card-total-value">{{ formatIDR(group.total) }}</span>
              </div>
            </header>

            <table class="rp-po-table">
              <thead>
                <tr>
                  <th class="rp-po-th">{{ t('Product') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Suggested') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Qty') }}</th>
                  <th class="rp-po-th">{{ t('Unit') }}</th>
                  <th class="rp-po-th rp-po-th--num">{{ t('Est. cost') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in group.lines" :key="`${line.sku}-${line.warehouseId}`">
                  <td class="rp-po-td">
                    <span class="rp-po-product">{{ line.productName }}</span>
                    <span class="rp-po-product-sub">{{ line.sku }}</span>
                    <!-- Switching vendor re-groups this line into the other card live. -->
                    <MpPopover
                      v-if="alternativesFor(line.sku).length > 1"
                      :id="`rp-po-vendor-${line.sku}-${line.warehouseId}`"
                      is-close-on-select
                      use-portal
                      :is-keep-alive="false"
                      placement="bottom-start"
                    >
                      <MpPopoverTrigger>
                        <a class="rp-po-change">{{ t('Change vendor') }}</a>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '260px', width: 'max-content' })">
                        <MpPopoverList>
                          <MpPopoverListItem
                            v-for="alt in alternativesFor(line.sku)"
                            :key="alt.id"
                            :is-active="alt.vendorId === line.vendorId"
                            @click="chooseVendor(rowKeyFor(line.sku, line.warehouseId), alt.vendorId)"
                          >
                            {{ vendorNameFor(alt.vendorId) }} · {{ alt.leadTimeDays }} {{ t('days') }}
                          </MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <td class="rp-po-td rp-po-td--num rp-po-td--muted">{{ line.recommendedQty }}</td>
                  <td class="rp-po-td rp-po-td--num">
                    <MpInput
                      :id="`rp-po-qty-${line.sku}-${line.warehouseId}`"
                      :model-value="String(line.finalQty)"
                      type="number"
                      :class="css({ width: '96px' })"
                      @update:model-value="(v: string) => setQty(rowKeyFor(line.sku, line.warehouseId), v)"
                    />
                    <span v-if="qtyNote(line)" class="rp-po-cell-note">{{ qtyNote(line) }}</span>
                  </td>
                  <td class="rp-po-td">{{ line.purchaseUnit }}</td>
                  <td class="rp-po-td rp-po-td--num">{{ formatIDR(line.finalQty * line.unitCost) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Skipped lines are listed, never silently dropped. -->
          <section v-if="plan.skipped.length" class="rp-po-card rp-po-card--skipped">
            <header class="rp-po-card-head">
              <p class="rp-po-vendor">{{ t('Skipped') }} ({{ plan.skipped.length }})</p>
            </header>
            <ul class="rp-po-skip-list">
              <li v-for="s in plan.skipped" :key="`${s.sku}-${s.warehouseId}`" class="rp-po-skip-item">
                <span class="rp-po-skip-name">{{ s.productName }}</span>
                <span class="rp-po-skip-sub">{{ s.sku }} · {{ s.warehouseName }}</span>
                <span class="rp-po-skip-reason">{{ skipReasonLabel(s.reason) }}</span>
              </li>
            </ul>
            <p class="rp-po-skip-hint">
              {{ t('Add a vendor to these products to include them.') }}
              <a
                v-if="plan.skipped[0]"
                class="rp-po-skip-link"
                @click="emit('assign-vendor', plan.skipped[0]!.sku)"
              >{{ t('Assign vendors') }}</a>
            </p>
          </section>
        </div>

        <footer class="rp-po-footer">
          <span v-if="qtyError" class="rp-po-error">{{ qtyError }}</span>
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="confirm">{{ confirmLabel }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rp-po-enter-active, .rp-po-leave-active { transition: opacity 200ms ease; }
.rp-po-enter-from, .rp-po-leave-to { opacity: 0; }
.rp-po-enter-active .rp-po-panel, .rp-po-leave-active .rp-po-panel { transition: transform 200ms ease, opacity 200ms ease; }
.rp-po-enter-from .rp-po-panel, .rp-po-leave-to .rp-po-panel { transform: scale(0.97); opacity: 0; }

.rp-po-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: rgba(8, 13, 14, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 48px var(--mp-spacing-4);
  overflow-y: auto;
}
.rp-po-panel {
  width: min(880px, 100%);
  max-height: calc(100vh - 96px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 16px);
  overflow: hidden;
}
.rp-po-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-po-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-po-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.rp-po-close:hover { background: var(--mp-background-neutral-hovered); }

.rp-po-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-5); }
.rp-po-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.rp-po-summary--warning { margin-top: 2px; color: var(--mp-text-warning); }

/* Cards are separated by a 1px border, never a drop-shadow (DESIGN.md). */
.rp-po-card {
  margin-top: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.rp-po-card--skipped { border-color: var(--mp-border-warning, var(--mp-border-default)); }
.rp-po-card-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-po-vendor { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-po-card-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-po-card-total { text-align: right; white-space: nowrap; }
.rp-po-card-total-label { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-po-card-total-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.rp-po-table { width: 100%; border-collapse: collapse; }
.rp-po-th {
  text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.rp-po-th--num { text-align: right; }
.rp-po-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
  vertical-align: top;
}
.rp-po-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-po-td--muted { color: var(--mp-text-subtle); }
.rp-po-product { display: block; }
.rp-po-product-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-po-change {
  display: inline-block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer;
}
.rp-po-cell-note {
  display: block; margin-top: 2px;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning);
}

.rp-po-skip-list { display: flex; flex-direction: column; }
.rp-po-skip-item {
  display: flex; align-items: baseline; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.rp-po-skip-name { flex: 1; min-width: 0; }
.rp-po-skip-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-po-skip-reason { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning); white-space: nowrap; }
.rp-po-skip-hint {
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.rp-po-skip-link { margin-left: var(--mp-spacing-1); color: var(--mp-text-link); cursor: pointer; }

.rp-po-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
.rp-po-error { flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger); }
</style>
