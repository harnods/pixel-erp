<script setup lang="ts">
/**
 * DeliveryBatchDrawer — "Manage batch" for one batch-tracked line of a New purchase
 * delivery (Batch Attribute PRD story 10; plan Phase 5).
 *
 * Splits the line's qty across batches: existing batches picked from the product, and
 * new ones described here (number + the product's attributes) and created only when
 * the delivery is saved. A new batch's Vendor starts as the delivery's vendor; an
 * existing batch from another vendor is flagged but allowed (the form confirms once
 * on save), and one with no vendor gets the delivery's vendor on save.
 *
 * Shell: rule/drawer-custom-shell (BillsFiltersDrawer), opened via a Manage button
 * (rule/drawer-open-via-manage). It's a form — overlay clicks don't close it, and it
 * edits a working copy that commits only on Save. Rules live in
 * app/data/purchaseDeliveryBatches.ts; this maps their errors to inline messages.
 */
import { computed, ref, watch } from 'vue'
import {
  MpButton, MpIcon, MpInput, MpAutocomplete, MpDatePicker, MpFormControl, MpFormLabel, MpFormErrorMessage,
} from '@mekari/pixel3'
import { batchAttributeDef, getBatchAttributeConfig, type BatchAttributeKey } from '~/data/batchAttributes'
import { getProductBatches, type BatchError } from '~/data/productDetails'
import { activeGrades } from '~/data/grades'
import { vendors } from '~/data/vendors'
import {
  checkDeliveryBatches, deliveryBatchCheckOk, productUsesVendor, type DeliveryBatchAllocation,
} from '~/data/purchaseDeliveryBatches'

const props = withDefaults(defineProps<{
  open: boolean
  sku: string
  productName: string
  unit: string
  /** The line's qty the batches must add up to. */
  qty: number
  /** The delivery's vendor — new batches start with it. */
  vendorId: string
  modelValue: DeliveryBatchAllocation[]
  /** New batch numbers for this product on the delivery's other lines. */
  otherNewBatchNos?: string[]
}>(), {
  otherNewBatchNos: () => [],
})
const emit = defineEmits<{ 'update:open': [boolean]; save: [batches: DeliveryBatchAllocation[]] }>()

const { t } = useLocale()

const DATE_KEYS: readonly BatchAttributeKey[] = ['expiry_date', 'manufacturing_date', 'best_before_date']
const REQUIRED_TEXT: Record<BatchAttributeKey, string> = {
  expiry_date: 'You must select expiry date',
  manufacturing_date: 'You must select manufacturing date',
  best_before_date: 'You must select best before date',
  supplier: 'You must select vendor',
  grade: 'You must select grade',
}

type Values = Record<BatchAttributeKey, string>
interface Row { key: string; batchId?: string; batchNo: string; qty: string; values: Values }

const config = computed(() => getBatchAttributeConfig(props.sku))
const usesVendor = computed(() => productUsesVendor(props.sku))
const productBatches = computed(() => getProductBatches(props.sku))

const rows = ref<Row[]>([])
const rowErrors = ref<Record<string, Partial<Record<'batchNo' | 'qty' | BatchAttributeKey, string>>>>({})
const formError = ref('')
let seq = 0

function emptyValues(): Values {
  return { expiry_date: '', manufacturing_date: '', best_before_date: '', supplier: '', grade: '' }
}
function toDisplay(iso: string | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d ? `${d}/${m}/${y}` : `${m}/${y}`
}
function toIso(display: string): string {
  if (!display) return ''
  const p = display.split('/')
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : `${p[1]}-${p[0]}`
}

watch(() => props.open, (open) => {
  if (!open) return
  rows.value = props.modelValue.map((b) => {
    const values = emptyValues()
    for (const key of Object.keys(values) as BatchAttributeKey[]) {
      const v = b.attributes?.[key]
      values[key] = DATE_KEYS.includes(key) ? toDisplay(v) : (v ?? '')
    }
    return { key: b.key, batchId: b.batchId, batchNo: b.batchNo, qty: String(b.qty), values }
  })
  rowErrors.value = {}
  formError.value = ''
}, { immediate: true })

const totalQty = computed(() => rows.value.reduce((s, r) => s + (Number(r.qty) > 0 ? Number(r.qty) : 0), 0))
const remaining = () => Math.max(0, props.qty - totalQty.value)

// ── Adding rows ─────────────────────────────────────────────────────────────────
const vendorName = (id: string | undefined) => (id ? vendors.find((v) => v.id === id)?.name ?? id : '')

const existingOptions = computed(() =>
  productBatches.value
    .filter((b) => !rows.value.some((r) => r.batchId === b.id))
    .map((b) => ({
      label: usesVendor.value && b.attributes.supplier ? `${b.batchNo} · ${vendorName(b.attributes.supplier)}` : b.batchNo,
      value: b.id,
    })),
)
const pickedExisting = ref('')
watch(pickedExisting, (id) => {
  if (!id) return
  const batch = productBatches.value.find((b) => b.id === id)
  if (batch) rows.value.push({ key: `ex-${++seq}`, batchId: batch.id, batchNo: batch.batchNo, qty: String(remaining()), values: emptyValues() })
  formError.value = ''
  // Reset on the next tick so the select is ready for another pick.
  setTimeout(() => { pickedExisting.value = '' })
})

function addNewBatch() {
  const values = emptyValues()
  if (usesVendor.value) values.supplier = props.vendorId
  rows.value.push({ key: `new-${++seq}`, batchNo: '', qty: String(remaining()), values })
  formError.value = ''
}
function removeRow(key: string) {
  rows.value = rows.value.filter((r) => r.key !== key)
  delete rowErrors.value[key]
}

/** An existing batch's vendor against the delivery's (rule 2 / rule 3 hints). */
function existingVendorNote(row: Row): { kind: 'other' | 'empty'; name?: string } | null {
  if (!row.batchId || !usesVendor.value) return null
  const supplier = productBatches.value.find((b) => b.id === row.batchId)?.attributes.supplier
  if (!supplier) return { kind: 'empty' }
  return props.vendorId && supplier !== props.vendorId ? { kind: 'other', name: vendorName(supplier) } : null
}

const vendorOptions = vendors.map((v) => ({ label: v.name, value: v.id }))
const gradeOptions = computed(() => activeGrades().map((g) => ({ label: `${g.name} · ${t('Rank')} ${g.rank}`, value: g.id })))

// ── Save ────────────────────────────────────────────────────────────────────────
function batchErrorText(e: BatchError): string {
  if (e.field === 'batchNo') {
    if (e.code === 'taken') return t('Batch number already taken')
    if (e.code === 'reserved') return t("Unassigned can't be used as a batch number")
    return t('You must fill in batch number')
  }
  if (e.field && e.field !== 'description') {
    if (e.code === 'grade-inactive') return t('Grade is not active')
    return t(REQUIRED_TEXT[e.field])
  }
  return t('Something went wrong, please try again')
}

function toAllocations(): DeliveryBatchAllocation[] {
  return rows.value.map((r) => {
    const qty = Number(r.qty)
    if (r.batchId) return { key: r.key, batchId: r.batchId, batchNo: r.batchNo, qty }
    const attributes: Partial<Record<BatchAttributeKey, string>> = {}
    for (const a of config.value) {
      const raw = r.values[a.key]
      if (raw) attributes[a.key] = DATE_KEYS.includes(a.key) ? toIso(raw) : raw
    }
    return {
      key: r.key, batchNo: r.batchNo.trim(), qty, attributes,
      // A vendor the user moved away from the delivery's stops following it (rule 1).
      vendorEdited: usesVendor.value && r.values.supplier !== props.vendorId,
    }
  })
}

function close() { emit('update:open', false) }

function save() {
  const batches = toAllocations()
  const check = checkDeliveryBatches(
    { sku: props.sku, productName: props.productName, qty: props.qty, batches },
    props.otherNewBatchNos,
  )
  const next: typeof rowErrors.value = {}
  for (const [key, errors] of Object.entries(check.rowErrors)) {
    next[key] = {}
    for (const e of errors) if (e.field && e.field !== 'description') next[key]![e.field] = batchErrorText(e)
  }
  for (const key of check.qtyInvalid) (next[key] ??= {}).qty = t('Qty must be more than 0')
  for (const key of check.duplicateBatch) (next[key] ??= {}).batchNo = t('This batch is already on this line')
  rowErrors.value = next
  formError.value = check.qtyMismatch
    ? t('Batch qty must add up to {qty} {unit}').replace('{qty}', String(props.qty)).replace('{unit}', props.unit)
    : ''
  if (!deliveryBatchCheckOk(check)) return
  emit('save', batches)
  close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dbd">
      <!-- A form: overlay clicks don't close it (only × / Cancel). -->
      <div v-if="open" class="dbd-overlay">
        <div class="dbd-panel" role="dialog" :aria-label="t('Manage batch')">
          <header class="dbd-header">
            <span class="dbd-title">{{ t('Manage batch') }}</span>
            <MpButton class="dbd-close" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="dbd-body">
            <div class="dbd-summary">
              <span class="dbd-product">{{ productName }}</span>
              <span class="dbd-progress" :class="{ 'dbd-progress--done': totalQty === qty }">
                {{ t('Received qty') }}: {{ totalQty }} / {{ qty }} {{ unit }}
              </span>
            </div>

            <div class="dbd-toolbar">
              <MpAutocomplete
                id="dbd-existing" v-model="pickedExisting" :data="existingOptions"
                label-prop="label" value-prop="value" is-searchable use-portal
                :placeholder="t('Select existing batch')" class="dbd-existing"
              />
              <MpButton variant="tertiary" is-rounded left-icon="add" @click="addNewBatch">{{ t('New batch') }}</MpButton>
            </div>

            <p v-if="!rows.length" class="dbd-empty">{{ t('No batches yet. Select an existing batch or add a new one.') }}</p>

            <div v-for="row in rows" :key="row.key" class="dbd-row">
              <div class="dbd-row-main">
                <MpFormControl
                  :id="`dbd-${row.key}-no`" class="dbd-no" :is-required="!row.batchId"
                  :is-invalid="!!rowErrors[row.key]?.batchNo"
                >
                  <MpFormLabel>{{ t('Batch number') }}</MpFormLabel>
                  <MpInput v-if="!row.batchId" v-model="row.batchNo" :is-invalid="!!rowErrors[row.key]?.batchNo" />
                  <p v-else class="dbd-static">{{ row.batchNo }}</p>
                  <MpFormErrorMessage>{{ rowErrors[row.key]?.batchNo }}</MpFormErrorMessage>
                </MpFormControl>

                <MpFormControl :id="`dbd-${row.key}-qty`" class="dbd-qty" is-required :is-invalid="!!rowErrors[row.key]?.qty">
                  <MpFormLabel>{{ t('Qty') }}</MpFormLabel>
                  <MpInput v-model="row.qty" type="number" :is-invalid="!!rowErrors[row.key]?.qty" />
                  <MpFormErrorMessage>{{ rowErrors[row.key]?.qty }}</MpFormErrorMessage>
                </MpFormControl>

                <span class="dbd-kind">{{ row.batchId ? t('Existing batch') : t('New batch') }}</span>

                <MpButton class="dbd-remove" :aria-label="`${t('Remove')} ${row.batchNo}`" @click="removeRow(row.key)">
                  <MpIcon name="minus-circular" size="sm" />
                </MpButton>
              </div>

              <p v-if="existingVendorNote(row)?.kind === 'other'" class="dbd-note dbd-note--warning">
                <MpIcon name="warning-triangle" size="sm" />
                {{ t('From another vendor: {vendor}. Its vendor won’t change.').replace('{vendor}', existingVendorNote(row)?.name ?? '') }}
              </p>
              <p v-else-if="existingVendorNote(row)?.kind === 'empty'" class="dbd-note">
                {{ t('No vendor yet. It gets this delivery’s vendor when you save.') }}
              </p>

              <!-- New batch: the product's attributes, in its order. -->
              <div v-if="!row.batchId && config.length" class="dbd-attrs">
                <template v-for="a in config" :key="a.key">
                  <MpFormControl
                    v-if="a.key === 'expiry_date' || a.key === 'manufacturing_date' || a.key === 'best_before_date'"
                    :id="`dbd-${row.key}-${a.key}`" :is-required="a.required" :is-invalid="!!rowErrors[row.key]?.[a.key]"
                  >
                    <MpFormLabel>{{ t(batchAttributeDef(a.key).label) }}</MpFormLabel>
                    <MpDatePicker
                      v-model="row.values[a.key]" format="DD/MM/YYYY" value-type="format"
                      :placeholder="t('Select date')" use-portal is-full-width
                      :is-invalid="!!rowErrors[row.key]?.[a.key]"
                    />
                    <MpFormErrorMessage>{{ rowErrors[row.key]?.[a.key] }}</MpFormErrorMessage>
                  </MpFormControl>
                  <MpFormControl
                    v-else :id="`dbd-${row.key}-${a.key}`"
                    :is-required="a.required" :is-invalid="!!rowErrors[row.key]?.[a.key]"
                  >
                    <MpFormLabel>{{ t(batchAttributeDef(a.key).label) }}</MpFormLabel>
                    <MpAutocomplete
                      v-model="row.values[a.key]" :data="a.key === 'supplier' ? vendorOptions : gradeOptions"
                      label-prop="label" value-prop="value" :is-searchable="a.key === 'supplier'"
                      :placeholder="a.key === 'supplier' ? t('Select vendor') : t('Select grade')"
                      use-portal is-full-width :is-invalid="!!rowErrors[row.key]?.[a.key]"
                    />
                    <MpFormErrorMessage>{{ rowErrors[row.key]?.[a.key] }}</MpFormErrorMessage>
                  </MpFormControl>
                </template>
              </div>
            </div>

            <p v-if="formError" class="dbd-error">{{ formError }}</p>
          </div>

          <footer class="dbd-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ t('Save') }}</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Shell — rule/drawer-custom-shell, copied from BillsFiltersDrawer (wider panel). */
.dbd-enter-active, .dbd-leave-active { transition: background-color 250ms ease; }
.dbd-enter-from, .dbd-leave-to { background-color: transparent; }
.dbd-enter-active .dbd-panel { transition: transform 350ms ease-out; }
.dbd-leave-active .dbd-panel { transition: transform 250ms ease-in; }
.dbd-enter-from .dbd-panel, .dbd-leave-to .dbd-panel { transform: translateX(calc(100% + 12px)); }

.dbd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.dbd-panel {
  margin: var(--mp-spacing-3);
  width: min(720px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px; overflow: hidden;
}
.dbd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.dbd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dbd-close, .dbd-remove {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.dbd-close:hover, .dbd-remove:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }
.dbd-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
.dbd-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}

/* ── Content ── */
.dbd-summary { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); }
.dbd-product { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dbd-progress { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dbd-progress--done { color: var(--mp-text-default); }
.dbd-toolbar { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.dbd-existing { flex: 1; min-width: 0; }
.dbd-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.dbd-row {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px);
}
.dbd-row-main { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.dbd-no { flex: 1; min-width: 0; }
.dbd-qty { width: 120px; flex-shrink: 0; }
.dbd-kind { align-self: center; margin-top: var(--mp-spacing-5); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.dbd-remove { margin-top: var(--mp-spacing-6); flex-shrink: 0; }
.dbd-static { margin: 0; height: var(--mp-sizes-9, 36px); display: flex; align-items: center; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dbd-attrs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-3) var(--mp-spacing-4); }
.dbd-note { margin: 0; display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.dbd-note--warning { color: var(--mp-text-warning, #a35f00); }
.dbd-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
</style>
