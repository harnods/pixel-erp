<script setup lang="ts">
/**
 * SubconOrderExportModal — Reports › Production › Subcon order › Export report.
 *
 * Narrows the Excel file before it is written: a required date range (matched
 * against each work order's plan start date, both ends inclusive), and an
 * optional finished good and vendor — empty means all. The rows and columns are
 * the Subcon order report's own (`subconReportRows` / R19 headings).
 *
 * Export is always enabled; a missing range or a range that matches nothing is
 * explained inline (rule/btn-no-disabled-validation, rule/form-errors-inline).
 * Closes only via × or Cancel (rule/modal-drawer-close-explicit-only).
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpModalCloseButton, MpButton, MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage,
  MpDatePicker, MpAutocomplete, toast,
} from '@mekari/pixel3'
import { workOrders } from '~/data/workOrders'
import {
  subconReportRows, filterSubconReportRows, toSubconExportRows, downloadSubconExport,
} from '~/data/subconExport'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useLocale()

const rows = computed(() => subconReportRows(workOrders))

/** Finished goods and vendors that actually appear on a subcon order. */
const productOptions = computed(() =>
  [...new Set(rows.value.map(r => r.product))].sort().map(name => ({ id: name, name })))
const vendorOptions = computed(() => {
  const byId = new Map(rows.value.map(r => [r.vendorId, r.vendor]))
  return [...byId].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ id, name }))
})

const dateRange = ref<Date[]>([])
const product = ref('')
const vendorId = ref('')
const rangeError = ref(false)
const noMatchError = ref(false)

watch(() => props.isOpen, (open) => {
  if (!open) return
  dateRange.value = []
  product.value = ''
  vendorId.value = ''
  rangeError.value = false
  noMatchError.value = false
})
watch([dateRange, product, vendorId], () => { noMatchError.value = false })

/** Local-date ISO (not toISOString(), which shifts a day back in UTC+ zones). */
function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isExporting = ref(false)
async function onExport() {
  const [start, end] = dateRange.value
  if (!start) { rangeError.value = true; return }
  const from = toLocalIso(start)
  const to = toLocalIso(end ?? start)
  const picked = filterSubconReportRows(rows.value, {
    from, to, product: product.value || undefined, vendorId: vendorId.value || undefined,
  })
  if (!picked.length) { noMatchError.value = true; return }
  isExporting.value = true
  await downloadSubconExport(toSubconExportRows(picked), new Date(), undefined, `subcon-order-report-${from}-to-${to}.xlsx`)
  isExporting.value = false
  toast.notify({ variant: 'success', title: t('Subcon order report exported'), maxWidth: 'max-content' })
  emit('close')
}
</script>

<template>
  <MpModal
    id="subcon-order-export-modal"
    :is-open="isOpen"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    :is-keep-alive="false"
    size="md"
    @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Export subcon order report') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="soe-fields" data-devchange="subcon-report-export-modal">
          <MpFormControl id="soe-range" is-required :is-invalid="rangeError">
            <MpFormLabel>{{ t('Date range') }}</MpFormLabel>
            <div class="soe-datepicker">
              <MpDatePicker
                id="soe-range-dp" v-model="dateRange" is-range format="DD/MM/YYYY"
                :placeholder="t('Select date range')"
                use-portal @update:model-value="rangeError = false"
              />
            </div>
            <MpFormHelpText v-if="!rangeError">{{ t('Filters by the plan start date') }}</MpFormHelpText>
            <MpFormErrorMessage>{{ t('You must select date range') }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="soe-product">
            <MpFormLabel>{{ t('Product') }}</MpFormLabel>
            <MpAutocomplete
              id="soe-product-ac" v-model="product" :data="productOptions"
              label-prop="name" value-prop="id" :placeholder="t('Select product')"
              is-clearable use-portal is-full-width
            />
            <MpFormHelpText>{{ t('Leave empty to include all products') }}</MpFormHelpText>
          </MpFormControl>

          <MpFormControl id="soe-vendor">
            <MpFormLabel>{{ t('Vendor') }}</MpFormLabel>
            <MpAutocomplete
              id="soe-vendor-ac" v-model="vendorId" :data="vendorOptions"
              label-prop="name" value-prop="id" :placeholder="t('Select vendor')"
              is-clearable use-portal is-full-width
            />
            <MpFormHelpText>{{ t('Leave empty to include all vendors') }}</MpFormHelpText>
          </MpFormControl>

          <p v-if="noMatchError" class="soe-error" role="alert">
            {{ t('No subcon order matches these filters. Please change the date range, product or vendor') }}
          </p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="emit('close')">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" :is-disabled="isExporting" @click="onExport">
          {{ t('Export') }}
        </MpButton>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.soe-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.soe-datepicker { width: 100%; }
.soe-datepicker :deep(.mp-datepicker__root) { width: 100%; }
.soe-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c9372c); }
</style>
