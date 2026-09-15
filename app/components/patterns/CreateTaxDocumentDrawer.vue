<script setup lang="ts">
/**
 * "Create tax document" drawer — Sales Invoice detail page, Actions ▸ Create
 * tax document. Two lanes, switched by the "Scenario state" control (bottom
 * of the header, sliders icon — same control as InvoiceReviewPage.vue's demo
 * FAB): Domestic (VAT Code) and Foreign (Transaction detail export
 * classification, Figma node 4223:28322 State=Foreign). Real invoices don't
 * carry a domestic/foreign flag yet, so this is a manual preview toggle
 * rather than something the invoice itself decides.
 *
 * The VAT Code select drives the Summary block: which rows appear and how PPN
 * is calculated. That logic is ported from a reference implementation the
 * user supplied (see vatCodes.ts) — only the codes' effects are reused here,
 * not that file's markup/styling. The Foreign lane's summary has no such
 * reference — it assumes exports are zero-rated (PPN always Rp0); see
 * foreignTransactionDetails.ts.
 */
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpDatePicker, MpSelect, MpRadio, MpInput, MpButton, MpText, MpIcon,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { salesInvoices } from '~/data'
import type { SalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import { VAT_CODES, computeTaxDocumentSummary } from '~/data/vatCodes'
import { FOREIGN_TRANSACTION_DETAILS, computeForeignTaxDocumentSummary } from '~/data/foreignTransactionDetails'
import {
  addTaxDocument,
  type TaxDocumentPaymentStage, type TaxDocumentStatus, type TaxDocumentLane,
} from '~/data/taxDocuments'
import { buildTaxSnapshot } from '~/data/taxDocumentChanges'

const props = defineProps<{
  isOpen: boolean
  invoice: SalesInvoiceDetail
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved'): void
}>()

const { t } = useLocale()

function todayDMY(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

const DOCUMENT_TYPE_OPTIONS = [
  'Output tax invoice',
  'Certain documents treated as equivalent to a tax invoice',
  'CK-1 excise document',
  'Bonded zone document',
] as const

// ── Lane switcher ("Scenario state") — Domestic vs Foreign preview ─────────────
const lane = ref<TaxDocumentLane>('domestic')
const LANES: { value: TaxDocumentLane; label: string }[] = [
  { value: 'domestic', label: 'Domestic' },
  { value: 'foreign',  label: 'Foreign'  },
]
function setLane(l: TaxDocumentLane) {
  lane.value = l
  resetLaneFields()
}

const taxDocDate = ref(todayDMY())
const documentType = ref<string>(DOCUMENT_TYPE_OPTIONS[0])
const salesInvoiceType = ref<'full-payment' | 'down-payment' | 'settlement' | ''>('')
const invoiceNumberRef = ref('')
const vatCode = ref('')

// Foreign lane only
const transactionDetail = ref<'11' | '12' | '13' | ''>('')
const pebReference = ref('')
const exportNoticeReference = ref('')
const classificationCode = ref('')

// VAT Code popover is sized to match its trigger field's width rather than
// its own content — tracked via ResizeObserver since the trigger is a plain
// button whose width comes from its FormControl's layout, not a fixed value.
const vatTriggerEl = ref<HTMLElement | null>(null)
const vatTriggerWidth = ref(0)
let vatTriggerResizeObserver: ResizeObserver | null = null
onMounted(() => {
  vatTriggerResizeObserver = new ResizeObserver(([entry]) => {
    vatTriggerWidth.value = entry.contentRect.width
  })
  if (vatTriggerEl.value) vatTriggerResizeObserver.observe(vatTriggerEl.value)
})
onUnmounted(() => { vatTriggerResizeObserver?.disconnect(); vatTriggerResizeObserver = null })

// Every document type besides the standard "Output tax invoice" has no PPN
// code of its own to pick — it's fixed to "07 — not collected" and locked.
const isVatCodeLocked = computed(() => documentType.value !== DOCUMENT_TYPE_OPTIONS[0])
function selectDocumentType(opt: string) {
  documentType.value = opt
  if (opt !== DOCUMENT_TYPE_OPTIONS[0]) {
    vatCode.value = '07'
    vatCodeError.value = false
  } else {
    vatCode.value = ''
  }
}

const salesInvoiceTypeError = ref(false)
const invoiceNumberRefError = ref(false)
const vatCodeError = ref(false)
const transactionDetailError = ref(false)
const pebReferenceError = ref(false)
const exportNoticeReferenceError = ref(false)
const classificationCodeError = ref(false)

/** Clears only the lane-specific selections (VAT Code vs Transaction detail
 *  and its nested fields, plus Sales invoice type — Domestic-only) — used
 *  both on full reset and when switching lanes, so a Domestic pick never
 *  survives into a Foreign document or vice versa. */
function resetLaneFields() {
  salesInvoiceType.value = ''
  salesInvoiceTypeError.value = false
  invoiceNumberRef.value = ''
  invoiceNumberRefError.value = false
  vatCode.value = ''
  vatCodeError.value = false
  transactionDetail.value = ''
  transactionDetailError.value = false
  pebReference.value = ''
  pebReferenceError.value = false
  exportNoticeReference.value = ''
  exportNoticeReferenceError.value = false
  classificationCode.value = ''
  classificationCodeError.value = false
}

function reset() {
  taxDocDate.value = todayDMY()
  documentType.value = DOCUMENT_TYPE_OPTIONS[0]
  resetLaneFields()
}
// Reset each time the drawer opens, so a leftover selection from a previous
// invoice never bleeds into the next one. `lane` itself is left alone — like
// InvoiceReviewPage's demo scenario, it's a dev preview toggle meant to persist
// across opens rather than always snapping back to Domestic.
watch(() => props.isOpen, (open) => { if (open) reset() })

// "Settlement" ties this tax document back to the down-payment invoice it
// settles — every other sales invoice is a candidate reference.
const invoiceReferenceOptions = computed(() =>
  salesInvoices.filter(inv => inv.id !== props.invoice.id).map(inv => ({ id: inv.id, number: inv.number })),
)

function selectSalesInvoiceType(type: 'full-payment' | 'down-payment' | 'settlement') {
  salesInvoiceType.value = type
  salesInvoiceTypeError.value = false
}

/** Switching between 11/12/13 clears whichever nested field(s) the previous
 *  code revealed — 11's PEB reference and 12/13's export-notice pair are
 *  mutually exclusive, never shown together. */
function selectTransactionDetail(code: '11' | '12' | '13') {
  transactionDetail.value = code
  transactionDetailError.value = false
  pebReference.value = ''
  pebReferenceError.value = false
  exportNoticeReference.value = ''
  exportNoticeReferenceError.value = false
  // 12/13 lock Classification code to a fixed, pre-filled value — no free text.
  classificationCode.value = FOREIGN_TRANSACTION_DETAILS.find(d => d.code === code)?.fixedClassificationCode ?? ''
  classificationCodeError.value = false
}

const dpp = computed(() => props.invoice.totals.total - props.invoice.totals.taxAmount)
const standardPpn = computed(() => props.invoice.totals.taxAmount)
const selectedVatCode = computed(() => VAT_CODES.find(c => c.code === vatCode.value) ?? null)
const selectedTransactionDetail = computed(() => FOREIGN_TRANSACTION_DETAILS.find(c => c.code === transactionDetail.value) ?? null)

const summary = computed(() => {
  if (lane.value === 'domestic') {
    return selectedVatCode.value
      ? computeTaxDocumentSummary(selectedVatCode.value, props.invoice.total, dpp.value, standardPpn.value)
      : null
  }
  return selectedTransactionDetail.value
    ? computeForeignTaxDocumentSummary(props.invoice.total, dpp.value)
    : null
})

function close() { emit('update:isOpen', false) }

function validate(): boolean {
  let ok = true

  if (lane.value === 'domestic') {
    if (!salesInvoiceType.value) { salesInvoiceTypeError.value = true; ok = false }
    if (salesInvoiceType.value === 'settlement' && !invoiceNumberRef.value) { invoiceNumberRefError.value = true; ok = false }
    if (!vatCode.value) { vatCodeError.value = true; ok = false }
    return ok
  }

  if (!transactionDetail.value) { transactionDetailError.value = true; ok = false }
  else if (selectedTransactionDetail.value?.fields === 'peb' && !pebReference.value.trim()) {
    pebReferenceError.value = true; ok = false
  } else if (selectedTransactionDetail.value?.fields === 'export-notice') {
    if (!exportNoticeReference.value.trim()) { exportNoticeReferenceError.value = true; ok = false }
    if (!classificationCode.value.trim()) { classificationCodeError.value = true; ok = false }
  }
  return ok
}

function save(status: TaxDocumentStatus) {
  if (!validate()) return
  addTaxDocument({
    salesInvoiceId: props.invoice.id,
    date: taxDocDate.value,
    documentType: documentType.value,
    paymentStage: lane.value === 'domestic' ? (salesInvoiceType.value as TaxDocumentPaymentStage) : undefined,
    lane: lane.value,
    djpCode: lane.value === 'domestic' ? vatCode.value : transactionDetail.value,
    ...(lane.value === 'foreign' ? {
      pebReference: selectedTransactionDetail.value?.fields === 'peb' ? pebReference.value.trim() : undefined,
      exportNoticeReference: selectedTransactionDetail.value?.fields === 'export-notice' ? exportNoticeReference.value.trim() : undefined,
      classificationCode: selectedTransactionDetail.value?.fields === 'export-notice' ? classificationCode.value.trim() : undefined,
    } : {}),
    status,
    // What this document reports — the baseline a later Sales Invoice edit is
    // diffed against (PRD-05 AC-001).
    invoiceSnapshot: buildTaxSnapshot(props.invoice),
  })
  emit('saved')
  close()
}
function saveDraft() { save('draft') }
function submitToDjp() { save('awaiting-approval') }
</script>

<template>
  <MpDrawer
    id="create-tax-document-drawer"
    :is-open="isOpen"
    placement="right"
    size="full"
    variant="floating"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="close"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="ctd-card">
          <div class="ctd-header">
            <MpText weight="semiBold">{{ t('Create tax document') }}</MpText>
            <div class="ctd-header-actions">
              <!-- Lane switcher ("Scenario state") — same control as InvoiceReviewPage.vue's
                   demo FAB, resized to sit inline in the drawer header instead of floating
                   fixed over the viewport (this drawer isn't teleported, so a fixed-position
                   FAB would anchor to whatever ancestor establishes the containing block,
                   not reliably the viewport). -->
              <MpPopover id="ctd-lane-popover" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                <MpPopoverTrigger>
                  <MpButton class="ctd-lane-fab" :aria-label="t('Change scenario state')">
                    <MpIcon name="sliders" size="sm" color="icon.inverse" />
                  </MpButton>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
                  <p class="ctd-lane-fab-heading">{{ t('Scenario state') }}</p>
                  <MpPopoverList>
                    <MpPopoverListItem
                      v-for="l in LANES" :key="l.value"
                      :is-active="l.value === lane" @click="setLane(l.value)"
                    >{{ t(l.label) }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
              <MpButton left-icon="close" variant="ghost" size="sm" :aria-label="t('Close')" @click="close" />
            </div>
          </div>

          <div class="ctd-form">
            <div class="ctd-section">
              <MpText size="h3" weight="semiBold" class="ctd-section-title">{{ t('Document info') }}</MpText>

              <div class="ctd-row">
                <MpFormControl id="ctd-date" is-required class="ctd-row-field">
                  <MpFormLabel>{{ t('Tax document date') }}</MpFormLabel>
                  <MpDatePicker id="ctd-date-inp" v-model="taxDocDate" format="DD/MM/YYYY" value-type="format" :use-portal="false" />
                </MpFormControl>

                <MpFormControl id="ctd-doctype" is-required class="ctd-row-field">
                  <MpFormLabel>{{ t('Document type') }}</MpFormLabel>
                  <MpPopover id="ctd-doctype-popover" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                    <MpPopoverTrigger>
                      <MpButton id="ctd-doctype-inp" class="ctd-select-trigger">
                        <span>{{ t(documentType) }}</span>
                        <MpIcon name="chevrons-down" size="sm" />
                      </MpButton>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '280px', width: 'max-content' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="opt in DOCUMENT_TYPE_OPTIONS" :key="opt"
                          :is-active="documentType === opt"
                          @click="selectDocumentType(opt)"
                        >
                          {{ t(opt) }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </MpFormControl>
              </div>

              <!-- Foreign lane doesn't collect a sales invoice type at all. -->
              <MpFormControl v-if="lane === 'domestic'" id="ctd-invtype" is-required :is-invalid="salesInvoiceTypeError">
                <MpFormLabel>{{ t('Sales invoice type') }}</MpFormLabel>
                <div class="ctd-radio-group">
                  <div class="ctd-radio-row">
                    <MpRadio
                      id="ctd-invtype-full" name="ctd-invtype" value="full-payment"
                      :is-checked="salesInvoiceType === 'full-payment'"
                      @change="selectSalesInvoiceType('full-payment')"
                    >
                      {{ t('Full payment') }}
                    </MpRadio>
                  </div>

                  <div class="ctd-radio-row">
                    <MpRadio
                      id="ctd-invtype-dp" name="ctd-invtype" value="down-payment"
                      :is-checked="salesInvoiceType === 'down-payment'"
                      @change="selectSalesInvoiceType('down-payment')"
                    >
                      {{ t('Down payment') }}
                    </MpRadio>
                  </div>

                  <div class="ctd-radio-row">
                    <MpRadio
                      id="ctd-invtype-settlement" name="ctd-invtype" value="settlement"
                      :is-checked="salesInvoiceType === 'settlement'"
                      @change="selectSalesInvoiceType('settlement')"
                    >
                      {{ t('Settlement') }}
                    </MpRadio>

                    <!-- Nested reveal: appears immediately once Settlement is picked. -->
                    <MpFormControl
                      v-if="salesInvoiceType === 'settlement'"
                      id="ctd-invref" is-required class="ctd-nested-field" :is-invalid="invoiceNumberRefError"
                    >
                      <MpFormLabel>{{ t('Invoice number reference') }}</MpFormLabel>
                      <MpSelect
                        id="ctd-invref-inp" v-model="invoiceNumberRef" :placeholder="t('Select invoice number')" is-full-width
                        @update:model-value="invoiceNumberRefError = false"
                      >
                        <option v-for="opt in invoiceReferenceOptions" :key="opt.id" :value="opt.id">
                          {{ t('Sales Invoice') }} #{{ opt.number }}
                        </option>
                      </MpSelect>
                      <MpFormErrorMessage>{{ t('You must select invoice number reference') }}</MpFormErrorMessage>
                    </MpFormControl>
                  </div>
                </div>
                <MpFormErrorMessage>{{ t('You must select sales invoice type') }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- Domestic: VAT Code select -->
              <MpFormControl v-if="lane === 'domestic'" id="ctd-vat" is-required :is-invalid="vatCodeError">
                <MpFormLabel>{{ t('VAT Code') }}</MpFormLabel>
                <MpPopover id="ctd-vat-popover" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                  <MpPopoverTrigger>
                    <button
                      id="ctd-vat-inp" ref="vatTriggerEl" type="button" class="ctd-select-trigger"
                      :class="{ 'ctd-select-trigger--invalid': vatCodeError, 'ctd-select-trigger--disabled': isVatCodeLocked }"
                      :disabled="isVatCodeLocked"
                    >
                      <span :class="{ 'ctd-select-trigger__placeholder': !selectedVatCode }">
                        {{ selectedVatCode ? selectedVatCode.label : t('Select VAT Code') }}
                      </span>
                      <MpIcon name="chevrons-down" size="sm" />
                    </button>
                  </MpPopoverTrigger>
                  <MpPopoverContent
                    :class="css({ minWidth: '280px' })"
                    :style="vatTriggerWidth ? { width: `${vatTriggerWidth}px` } : undefined"
                  >
                    <MpPopoverList>
                      <MpPopoverListItem
                        v-for="opt in VAT_CODES" :key="opt.code"
                        :is-active="vatCode === opt.code"
                        @click="vatCode = opt.code; vatCodeError = false"
                      >
                        {{ opt.label }}
                      </MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
                <MpFormErrorMessage>{{ t('You must select VAT Code') }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- Foreign: Transaction detail (export classification) — each code reveals
                   its own nested reference field(s) directly below it (accordion-style,
                   see Form Control reference node 4252:38269). -->
              <MpFormControl v-else id="ctd-txndetail" is-required :is-invalid="transactionDetailError">
                <MpFormLabel>{{ t('Transaction detail') }}</MpFormLabel>
                <div class="ctd-radio-group">
                  <div v-for="opt in FOREIGN_TRANSACTION_DETAILS" :key="opt.code" class="ctd-radio-row">
                    <MpRadio
                      :id="`ctd-txndetail-${opt.code}`" name="ctd-txndetail" :value="opt.code"
                      :is-checked="transactionDetail === opt.code"
                      @change="selectTransactionDetail(opt.code)"
                    >
                      {{ opt.label }}
                    </MpRadio>

                    <template v-if="transactionDetail === opt.code">
                      <MpFormControl
                        v-if="opt.fields === 'peb'"
                        id="ctd-peb" is-required class="ctd-nested-field" :is-invalid="pebReferenceError"
                      >
                        <MpFormLabel>{{ t('PEB reference') }}</MpFormLabel>
                        <MpInput
                          id="ctd-peb-inp" v-model="pebReference" is-full-width
                          @update:model-value="pebReferenceError = false"
                        />
                        <MpFormErrorMessage>{{ t('You must fill in PEB reference') }}</MpFormErrorMessage>
                      </MpFormControl>

                      <template v-else>
                        <MpFormControl
                          id="ctd-exportnotice" is-required class="ctd-nested-field" :is-invalid="exportNoticeReferenceError"
                        >
                          <MpFormLabel>{{ t('Export notice reference') }}</MpFormLabel>
                          <MpInput
                            id="ctd-exportnotice-inp" v-model="exportNoticeReference" is-full-width
                            @update:model-value="exportNoticeReferenceError = false"
                          />
                          <MpFormErrorMessage>{{ t('You must fill in export notice reference') }}</MpFormErrorMessage>
                        </MpFormControl>

                        <MpFormControl
                          id="ctd-classcode" is-required class="ctd-nested-field" :is-invalid="classificationCodeError"
                        >
                          <MpFormLabel>{{ t('Classification code') }}</MpFormLabel>
                          <MpInput
                            id="ctd-classcode-inp" v-model="classificationCode" is-full-width
                            :is-disabled="!!opt.fixedClassificationCode"
                            @update:model-value="classificationCodeError = false"
                          />
                          <MpFormErrorMessage>{{ t('You must fill in classification code') }}</MpFormErrorMessage>
                        </MpFormControl>
                      </template>
                    </template>
                  </div>
                </div>
                <MpFormErrorMessage>{{ t('You must select transaction detail') }}</MpFormErrorMessage>
              </MpFormControl>
            </div>

            <div v-if="summary" class="ctd-summary">
              <MpText size="h3" weight="semiBold" class="ctd-section-title">{{ t('Summary') }}</MpText>

              <div class="ctd-summary-rows">
                <div class="ctd-summary-row">
                  <span>{{ t('Sales invoice total') }}</span>
                  <span>{{ formatIDR(summary.salesInvoiceTotal) }}</span>
                </div>
                <div class="ctd-summary-row">
                  <span>Dasar pengenaan pajak (DPP)</span>
                  <span>{{ formatIDR(summary.dpp) }}</span>
                </div>
                <div v-if="summary.dppLain !== null" class="ctd-summary-row">
                  <span>Dasar pengenaan pajak lainnya (DPP lain)</span>
                  <span>{{ formatIDR(summary.dppLain) }}</span>
                </div>
                <div class="ctd-summary-row">
                  <span>Pajak pertambahan nilai (PPN)</span>
                  <span>{{ formatIDR(summary.ppn) }}</span>
                </div>
                <div class="ctd-summary-row">
                  <span>Pajak penjualan atas Barang Mewah (PPnBM)</span>
                  <span>{{ formatIDR(summary.ppnbm) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="ctd-footer">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="close">{{ t('Cancel') }}</button>
            <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="saveDraft">{{ t('Save as draft') }}</button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="submitToDjp">{{ t('Save & submit to DJP') }}</button>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* Floating drawer: MpDrawerBody is the rounded white card (no built-in padding),
   so the card owns header / scrollable form / pinned footer. Mirrors
   NewLocationDrawer.vue's structure. */
.ctd-card { display: flex; flex-direction: column; height: 100%; }
/* MpDrawer's size presets (sm/md/lg/...) don't land on 600px — override the
   drawer content's inline max-width directly. Requires size="full" on
   <MpDrawer> above: pixel3-modal's slide animation reads a hardcoded px
   value from a size→width lookup table for every size EXCEPT "full", where
   it measures the element's actual rendered width instead — with a fixed
   preset (e.g. "md" = 448px) that lookup goes stale the moment this CSS
   forces a different width, and the drawer sticks mid-slide (verified: with
   size="md" + this override, computed transform froze at translateX(448px)
   forever — visually a ~150px sliver stuck off the right edge). */
:deep([data-pixel-component="MpDrawerContent"]) {
  width: var(--mp-spacing-150, 600px) !important;
  max-width: 600px !important;
}
.ctd-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.ctd-header-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
/* Lane switcher — same visual as InvoiceReviewPage.vue's .demo-fab, sized down
   to sit inline in the header instead of floating fixed over the viewport. */
.ctd-lane-fab {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-spacing-8, 32px) !important; height: var(--mp-spacing-8, 32px) !important; min-width: 0 !important;
  padding: 0 !important; border: none !important; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse) !important; color: var(--mp-text-inverse);
  cursor: pointer;
}
.ctd-lane-fab:hover { opacity: 0.9; }
.ctd-lane-fab-heading {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.ctd-form {
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
  flex: 1; overflow-y: auto;
  padding: var(--mp-spacing-4);
}
.ctd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.ctd-section-title { display: block; margin-bottom: var(--mp-spacing-1); }
.ctd-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-6); }
/* min-width:0 — without it a grid item's default auto min-width lets long
   unbreakable content (e.g. a document type label) blow past its 1fr share
   and squeeze the sibling column instead of truncating in place. */
.ctd-row-field { min-width: 0; }

.ctd-radio-group { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.ctd-radio-row { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
/* nested field revealed under the selected radio — indented to read as its child */
.ctd-nested-field { padding-left: var(--mp-spacing-6); }

.ctd-summary {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.ctd-summary-rows { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ctd-summary-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
}
.ctd-summary-row span:first-child { color: var(--mp-text-secondary); }
.ctd-summary-row span:last-child { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); white-space: nowrap; }

.ctd-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4) 0;
}

/* Document type / VAT Code — form-field-styled popover triggers (MpSelect
   doesn't do custom option markup); metrics copied from the MpSelect they replaced. */
.ctd-select-trigger {
  display: flex !important; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  width: 100% !important; min-width: 0 !important; height: var(--mp-sizes-9\.5, 38px) !important; box-sizing: border-box;
  padding: var(--mp-spacing-2) var(--mp-spacing-3) !important;
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)) !important;
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral, #fff) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  cursor: pointer;
  text-align: left;
}
.ctd-select-trigger:hover { border-color: var(--mp-border-bold); }
.ctd-select-trigger span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctd-select-trigger :deep(svg) { color: var(--mp-icon-default, var(--mp-text-secondary)); flex-shrink: 0; }
.ctd-select-trigger__placeholder { color: var(--mp-text-placeholder); }
.ctd-select-trigger--invalid { border-color: var(--mp-border-danger, #dc2626); }
.ctd-select-trigger--disabled {
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-disabled, var(--mp-text-subtle));
  cursor: not-allowed;
}
.ctd-select-trigger--disabled:hover { border-color: var(--mp-border-form, rgba(29, 31, 36, 0.16)); }
</style>
