<script setup lang="ts">
/**
 * BatchFormModal — New batch / Edit batch for a batch-tracked product (Batch Attribute
 * PRD stories 7, 8; plan Phase 3, docs/prd/batch-attribute-plan.md).
 *
 * Master data only: batch number, description and the product's attributes. There is
 * no qty, price or location — stock enters a batch through inventory transactions.
 *
 * - Fields follow the product's CURRENT attribute set, in its order. In edit mode an
 *   attribute the product has since dropped isn't shown, and is removed on save.
 * - Expiry date is day or month precision per batch (PM answer A2): a Date | Month
 *   switch swaps the picker, and switching clears the value rather than guess a day.
 * - The batch number can change only while the batch has no stock movements (PM
 *   answers A4 + A9); a used batch shows it read-only with the reason.
 * - Every rule lives in productDetails.ts (createBatch / updateBatch); this component
 *   only maps their errors to inline field messages (rule/form-errors-inline).
 */
import { computed, ref, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea, MpAutocomplete, MpDatePicker,
  MpSegmentedControl, MpButton, MpButtonGroup,
} from '@mekari/pixel3'
import { successToast } from '~/utils/toasts'
import {
  batchAttributeDef, expiryPrecision, getBatchAttributeConfig, type BatchAttributeKey,
} from '~/data/batchAttributes'
import {
  createBatch, updateBatch, getProductBatchById, batchHasMovements,
  type BatchAttributeInput, type BatchError, type ProductBatchSummary,
} from '~/data/productDetails'
import { vendors } from '~/data/vendors'
import { activeGrades, gradeById } from '~/data/grades'

const props = defineProps<{
  open: boolean
  sku: string
  /** Edit mode when set; create mode when omitted or null. */
  batchId?: string | null
}>()
const emit = defineEmits<{ close: []; saved: [batch: ProductBatchSummary] }>()

const { t } = useLocale()

const DATE_KEYS: readonly BatchAttributeKey[] = ['expiry_date', 'manufacturing_date', 'best_before_date']
// Required copy per attribute — every attribute is picked, so "select" (uxw-mekari-erp-terms).
const REQUIRED_TEXT: Record<BatchAttributeKey, string> = {
  expiry_date: 'You must select expiry date',
  manufacturing_date: 'You must select manufacturing date',
  best_before_date: 'You must select best before date',
  supplier: 'You must select vendor',
  grade: 'You must select grade',
}

type FieldKey = 'batchNo' | BatchAttributeKey

const editing = computed(() => (props.batchId ? getProductBatchById(props.sku, props.batchId) : undefined))
const config = computed(() => getBatchAttributeConfig(props.sku))
const numberLocked = computed(() => !!editing.value && batchHasMovements(props.sku, editing.value.id))

const batchNo = ref('')
const description = ref('')
const values = ref<Record<BatchAttributeKey, string>>(emptyValues())
const expiryMode = ref<'date' | 'month'>('date')
const errors = ref<Partial<Record<FieldKey, string>>>({})
const formError = ref('')
const isSaving = ref(false)

function emptyValues(): Record<BatchAttributeKey, string> {
  return { expiry_date: '', manufacturing_date: '', best_before_date: '', supplier: '', grade: '' }
}

/** Stored ISO (YYYY-MM-DD, or YYYY-MM for a month expiry) → the picker's format. */
function toDisplay(iso: string | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d ? `${d}/${m}/${y}` : `${m}/${y}`
}
/** Picker format (DD/MM/YYYY or MM/YYYY) → stored ISO. */
function toIso(display: string): string {
  if (!display) return ''
  const parts = display.split('/')
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : `${parts[1]}-${parts[0]}`
}

watch(() => props.open, (open) => {
  if (!open) return
  const b = editing.value
  batchNo.value = b?.batchNo ?? ''
  description.value = b?.description ?? ''
  const next = emptyValues()
  for (const key of Object.keys(next) as BatchAttributeKey[]) {
    const stored = b?.attributes[key]
    next[key] = DATE_KEYS.includes(key) ? toDisplay(stored) : (stored ?? '')
  }
  values.value = next
  expiryMode.value = expiryPrecision(b?.attributes.expiry_date) === 'month' ? 'month' : 'date'
  errors.value = {}
  formError.value = ''
}, { immediate: true })

// ── Options ──────────────────────────────────────────────────────────────────────
const expiryModeOptions = [
  { id: 'bf-expiry-mode-date', label: t('Date'), value: 'date' },
  { id: 'bf-expiry-mode-month', label: t('Month'), value: 'month' },
]
function setExpiryMode(mode: string) {
  if (mode === expiryMode.value) return
  expiryMode.value = mode === 'month' ? 'month' : 'date'
  // A day can't be derived from a month (or back) without guessing — start over.
  values.value.expiry_date = ''
  errors.value.expiry_date = ''
}

const vendorOptions = vendors.map(v => ({ label: v.name, value: v.id }))
const gradeOptions = computed(() => {
  const options = activeGrades().map(g => ({ label: `${g.name} · ${t('Rank')} ${g.rank}`, value: g.id }))
  // A grade deactivated after this batch stored it stays shown on the batch — it can
  // be kept, just not newly picked (story 3).
  const stored = editing.value?.attributes.grade
  const grade = stored ? gradeById(stored) : undefined
  if (grade && grade.status !== 'active' && !grade.deleted) {
    options.push({ label: `${grade.name} · ${t('Rank')} ${grade.rank} (${t('Inactive')})`, value: grade.id })
  }
  return options
})

// ── Save ─────────────────────────────────────────────────────────────────────────
function errorText(e: BatchError): string {
  if (e.field === 'batchNo') {
    if (e.code === 'taken') return t('Batch number already taken')
    if (e.code === 'reserved') return t("Unassigned can't be used as a batch number")
    if (e.code === 'locked-in-use') return t("Batch number can't be changed after the batch is used in a transaction")
    return t('You must fill in batch number')
  }
  if (e.field && e.field !== 'description') {
    if (e.code === 'grade-inactive') return t('Grade is not active')
    return t(REQUIRED_TEXT[e.field] ?? 'Something went wrong, please try again')
  }
  // Product/batch-level codes (not batch-tracked, batch gone …) can't come from this form.
  return t('Something went wrong, please try again')
}

async function save() {
  if (isSaving.value) return
  errors.value = {}
  formError.value = ''
  isSaving.value = true
  await new Promise(r => setTimeout(r, 400))

  const attributes: BatchAttributeInput = {}
  for (const a of config.value) {
    const raw = values.value[a.key]
    attributes[a.key] = DATE_KEYS.includes(a.key) ? toIso(raw) : raw
  }
  const target = editing.value
  const result = target
    ? updateBatch(props.sku, target.id, {
      ...(numberLocked.value ? {} : { batchNo: batchNo.value }),
      description: description.value,
      attributes,
    })
    : createBatch(props.sku, { batchNo: batchNo.value, description: description.value, attributes })
  isSaving.value = false

  if (!result.ok) {
    for (const e of result.errors) {
      if (e.field && e.field !== 'description') errors.value[e.field] = errorText(e)
      else formError.value = errorText(e)
    }
    return
  }
  successToast(target ? t('Batch changes saved') : t('Batch saved'))
  emit('saved', result.value)
  emit('close')
}
</script>

<template>
  <!-- A form, so overlay clicks don't discard input (only × / Cancel / Esc close it). -->
  <MpModal
    id="batch-form-modal" :is-open="open" size="md"
    is-close-on-esc :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ editing ? t('Edit batch') : t('New batch') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="bf-form">
          <MpFormControl id="bf-batch-no" is-required :is-invalid="!!errors.batchNo">
            <MpFormLabel>{{ t('Batch number') }}</MpFormLabel>
            <MpInput
              v-model="batchNo" :is-read-only="numberLocked"
              :is-invalid="!!errors.batchNo" @input="errors.batchNo = ''"
            />
            <MpFormErrorMessage>{{ errors.batchNo }}</MpFormErrorMessage>
            <p v-if="!errors.batchNo && numberLocked" class="bf-caption">
              {{ t("Batch number can't be changed after the batch is used in a transaction") }}
            </p>
            <p v-else-if="!errors.batchNo && !editing" class="bf-caption">{{ t('New batches start at 0 qty') }}</p>
          </MpFormControl>

          <MpFormControl id="bf-description">
            <MpFormLabel>{{ t('Description') }}</MpFormLabel>
            <MpTextarea v-model="description" />
          </MpFormControl>

          <!-- One field per attribute on the product, in its order. -->
          <template v-for="a in config" :key="a.key">
            <MpFormControl
              v-if="a.key === 'expiry_date'" id="bf-expiry-date"
              :is-required="a.required" :is-invalid="!!errors.expiry_date"
            >
              <div class="bf-label-row">
                <MpFormLabel>{{ t('Expiry date') }}</MpFormLabel>
                <MpSegmentedControl
                  id="bf-expiry-mode" name="bf-expiry-mode"
                  :model-value="expiryMode" :data="expiryModeOptions"
                  @update:model-value="setExpiryMode"
                />
              </div>
              <!-- Keyed on the mode so the calendar remounts as a day or month picker. -->
              <MpDatePicker
                :key="expiryMode" v-model="values.expiry_date" :type="expiryMode"
                :format="expiryMode === 'month' ? 'MM/YYYY' : 'DD/MM/YYYY'" value-type="format"
                :placeholder="expiryMode === 'month' ? t('Select month') : t('Select date')"
                use-portal is-full-width :is-invalid="!!errors.expiry_date"
                @update:model-value="errors.expiry_date = ''"
              />
              <MpFormErrorMessage>{{ errors.expiry_date }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl
              v-else-if="a.key === 'manufacturing_date' || a.key === 'best_before_date'" :id="`bf-${a.key}`"
              :is-required="a.required" :is-invalid="!!errors[a.key]"
            >
              <MpFormLabel>{{ t(batchAttributeDef(a.key).label) }}</MpFormLabel>
              <MpDatePicker
                v-model="values[a.key]" format="DD/MM/YYYY" value-type="format"
                :placeholder="t('Select date')" use-portal is-full-width
                :is-invalid="!!errors[a.key]" @update:model-value="errors[a.key] = ''"
              />
              <MpFormErrorMessage>{{ errors[a.key] }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- Vendor / Grade — a select is half the form width (rule/form-select-half). -->
            <MpFormControl
              v-else :id="`bf-${a.key}`" class="bf-half"
              :is-required="a.required" :is-invalid="!!errors[a.key]"
            >
              <MpFormLabel>{{ t(batchAttributeDef(a.key).label) }}</MpFormLabel>
              <MpAutocomplete
                v-model="values[a.key]" :data="a.key === 'supplier' ? vendorOptions : gradeOptions"
                label-prop="label" value-prop="value"
                :placeholder="a.key === 'supplier' ? t('Select vendor') : t('Select grade')"
                :is-searchable="a.key === 'supplier'" use-portal is-full-width
                :is-invalid="!!errors[a.key]" @update:model-value="errors[a.key] = ''"
              />
              <MpFormErrorMessage>{{ errors[a.key] }}</MpFormErrorMessage>
            </MpFormControl>
          </template>

          <p v-if="formError" class="bf-form-error" role="alert">{{ formError }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="save">{{ editing ? t('Save changes') : t('Save') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.bf-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.bf-label-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2);
}
.bf-caption { margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #626b79); }
.bf-form-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-critical, #d93b3b); }
.bf-half { width: 50%; }
</style>
