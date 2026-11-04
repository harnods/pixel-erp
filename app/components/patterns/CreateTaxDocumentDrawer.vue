<script setup lang="ts">
/**
 * "Create tax document" drawer — Sales Invoice detail page, Actions ▸ Create
 * tax document. Implements the eFaktur CTAS **keluaran** spec: the two output
 * documents and their conditional fields.
 *
 *   FK  Faktur Keluaran        "Output tax invoice"     1 level  (code 01–10)
 *   DK  Dokumen Lain Keluaran  "Other output document"  3 levels (code → detail → document)
 *
 * **Which one it starts on comes from the BUYER, not from a toggle.** A
 * domestic contact defaults to FK, a foreign contact to DK — a foreign buyer is
 * an export, and an export is never raised on a faktur. The contact record owns
 * `domicile` (contacts.ts) and the Contacts form can flip it, so this resolves
 * from real data; it stays a default, and the user can still pick the other.
 * This replaced the old manual Domestic/Foreign "lane" toggle, which asked the
 * user for something the buyer already answers.
 *
 * Three things the spec allows that this form deliberately does not ask:
 *   • **Tax document date** is fixed to today and shown disabled, which settles
 *     R-FK-9 / R-DK-9 by construction.
 *   • **Sales invoice type** (termin) is gone, so R-FK-1's 06/07/08 block and
 *     R-FK-8's settlement reference have no input left to guard. An FK records
 *     `full-payment`; a DK carries no termin block at all (§6).
 *   • **FK reference** is gone — the faktur IS the invoice's document and the
 *     invoice number already identifies it. DK export 12/13 keeps its own
 *     reference, which names the export notice (R-DK-5).
 *
 * Two patterns from §8 of the spec run through the whole form:
 *   • **Cascade reset** — when a level changes, every level below it resets.
 *   • **Hidden ⇒ null** — a field that isn't shown is cleared before save, so a
 *     stale value from an abandoned branch can never reach the payload.
 *
 * Known deviations, with reasons (see the pixel-erp-design authority order):
 *   • `rule/form-select-half` — selects run full width, not ~267px. The options
 *     here are regulatory designations up to ~70 characters ("07 — Delivery
 *     where PPN is not collected", the 30-item remarks catalogue); at half width
 *     the menu clips exactly the text that tells two options apart.
 */
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpInput, MpButton, MpText, MpIcon,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDR } from '~/utils/currency'
import { findContactByDisplayName } from '~/data/contacts'
import type { SalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import { findVatCode, vatCodeOptions, computeTaxDocumentSummary } from '~/data/vatCodes'
import { computeForeignTaxDocumentSummary } from '~/data/foreignTransactionDetails'
import {
  DOC_OUT_TRANSACTION_CODES, DOC_OUT_DOMESTIC_DOCUMENTS, DOC_OUT_EXPORT_DETAILS,
  findExportDetail, type DocOutTransactionCode,
} from '~/data/docOutCodes'
import { remarkOptions, findRemark, hasRemarks } from '~/data/efakturRemarks'
import { addTaxDocument, type TaxDocumentStatus, type TaxDocumentLane } from '~/data/taxDocuments'
import { buildTaxSnapshot } from '~/data/taxDocumentChanges'
import { useTaxInfoScenario, TAX_INFO_SCENARIOS } from '~/composables/useTaxInfoScenario'

const props = defineProps<{
  isOpen: boolean
  invoice: SalesInvoiceDetail
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved'): void
}>()

const { t } = useLocale()

// Tax-info scenario — which gap (if any) blocks creation. This drawer only
// renders when nothing blocks, but it carries the switcher so the blocked
// states stay reachable from here; the parent swaps the drawer when it changes.
const { taxInfoScenario, setTaxInfoScenario } = useTaxInfoScenario()

// ── Document type, defaulted from the buyer ───────────────────────────────────
type DocumentKind = 'FK' | 'DK'
const DOCUMENT_KINDS: { value: DocumentKind; label: string }[] = [
  { value: 'FK', label: 'Output tax invoice' },
  { value: 'DK', label: 'Other output document' },
]

/** The buyer's own record — transactions carry a lean customer FK, so the
 *  contact that owns `domicile` is resolved by name. No contact record (a
 *  customer never set up in Contacts) reads as domestic, the common case. */
const buyerContact = computed(() => findContactByDisplayName(props.invoice.customer.name))
const buyerIsForeign = computed(() => buyerContact.value?.domicile === 'foreign')
/** A foreign buyer means an export, and an export is a DK — never a faktur. */
const defaultDocumentKind = computed<DocumentKind>(() => (buyerIsForeign.value ? 'DK' : 'FK'))

const documentKind = ref<DocumentKind>('FK')

// ── FK state ──────────────────────────────────────────────────────────────────
const fkCode = ref('')

// ── DK state ──────────────────────────────────────────────────────────────────
const dkCode = ref<DocOutTransactionCode | ''>('')
const dkDetail = ref('')
const dkDocument = ref('')
const dkReference = ref('')
const dkDocumentNumber = ref('')

// ── Shared between the two (code 07/08 on either side) ────────────────────────
const remark = ref('')
const description = ref('')

// ── Errors (inline, never a toast — rule/form-errors-inline) ──────────────────
const errors = reactive({
  fkCode: false,
  dkCode: false,
  dkDetail: false,
  dkDocument: false,
  remark: false,
  description: false,
  dkReference: false,
  dkDocumentNumber: false,
})
function clearErrors() { for (const k of Object.keys(errors) as (keyof typeof errors)[]) errors[k] = false }

/**
 * The document is dated the day it is raised — always today, never editable.
 * That also settles R-FK-9 / R-DK-9 (document_date ≥ 2025-01-01 and ≤ today)
 * by construction, so the form carries no date validation: there is no input
 * through which an out-of-range date could arrive.
 */
function todayDMY(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
const taxDocDate = ref(todayDMY())

// ── Cascade resets (§8.1) ─────────────────────────────────────────────────────
/** Everything below "Document type". */
function resetBelowDocumentKind() {
  fkCode.value = ''
  dkCode.value = ''
  resetBelowDkCode()
  remark.value = ''
  description.value = ''
  clearErrors()
}
function resetBelowDkCode() {
  dkDetail.value = ''
  dkDocument.value = ''
  dkReference.value = ''
  dkDocumentNumber.value = ''
  remark.value = ''
  description.value = ''
}

function selectDocumentKind(kind: DocumentKind) {
  if (kind === documentKind.value) return
  documentKind.value = kind
  resetBelowDocumentKind()
}

/**
 * Switching FK transaction code. 07/08 open a remarks catalogue and default to
 * its first option (spec test #3); every other code clears remarks entirely.
 */
function selectFkCode(code: string) {
  fkCode.value = code
  errors.fkCode = false
  applyRemarksFor(code)
}

function applyRemarksFor(code: string) {
  if (hasRemarks(code)) {
    remark.value = remarkOptions(code)[0]?.value ?? ''
  } else {
    remark.value = ''
  }
  description.value = ''
  errors.remark = false
  errors.description = false
}

function selectRemark(code: string) {
  remark.value = code
  errors.remark = false
  // A remark that needs no supporting document must leave Description empty
  // (§2.3) — the field disappears and its value goes with it.
  if (!findRemark(code)?.refDocRequired) description.value = ''
  errors.description = false
}

function selectDkCode(code: DocOutTransactionCode) {
  dkCode.value = code
  errors.dkCode = false
  resetBelowDkCode()
  clearErrors()
}

/**
 * Switching DK detail. Under transaction code 4 the detail forces its own
 * transaction document and invoice code (R-DK-4); under code 5 the document
 * stays the user's to pick and 07/08 open the remarks catalogue (R-DK-3).
 */
function selectDkDetail(code: string) {
  dkDetail.value = code
  errors.dkDetail = false
  dkReference.value = ''
  dkDocumentNumber.value = ''
  errors.dkReference = false
  errors.dkDocumentNumber = false

  if (dkCode.value === '4') {
    dkDocument.value = findExportDetail(code)?.documentCode ?? ''
    remark.value = ''
    description.value = ''
  } else {
    dkDocument.value = ''
    applyRemarksFor(code)
  }
  errors.dkDocument = false
}

// ── Derived visibility (the conditional-field matrix, §6) ─────────────────────
const isFk = computed(() => documentKind.value === 'FK')
const isDkExport = computed(() => documentKind.value === 'DK' && dkCode.value === '4')
const isDkDomestic = computed(() => documentKind.value === 'DK' && dkCode.value === '5')

/** The 01–10 code currently in force, whichever side of the form it came from —
 *  DK code 5's details are the same ten codes (§4.1). */
const activeVatCode = computed(() => {
  if (isFk.value) return findVatCode(fkCode.value) ?? null
  if (isDkDomestic.value) return findVatCode(dkDetail.value) ?? null
  return null
})
const exportDetail = computed(() => (isDkExport.value ? findExportDetail(dkDetail.value) ?? null : null))

const dkDetailOptions = computed(() =>
  dkCode.value === '4'
    ? DOC_OUT_EXPORT_DETAILS.map(d => ({ value: d.code, label: d.label }))
    : vatCodeOptions(),
)
const dkDocumentOptions = computed(() =>
  dkCode.value === '4'
    ? DOC_OUT_EXPORT_DETAILS.filter(d => d.code === dkDetail.value)
        .map(d => ({ value: d.documentCode, label: d.documentLabel }))
    : DOC_OUT_DOMESTIC_DOCUMENTS,
)
/** Code 4's transaction document is forced by the detail — shown, never chosen. */
const dkDocumentForced = computed(() => isDkExport.value)

/** Remarks appear for FK 07/08 and for DK code 5 detail 07/08 — never for an export. */
const showRemarks = computed(() => {
  if (isFk.value) return hasRemarks(fkCode.value)
  if (isDkDomestic.value) return hasRemarks(dkDetail.value)
  return false
})
const remarkCatalogueCode = computed(() => (isFk.value ? fkCode.value : dkDetail.value))
const selectedRemark = computed(() => findRemark(remark.value) ?? null)
const showDescription = computed(() => showRemarks.value && !!selectedRemark.value?.refDocRequired)

/** R-DK-5 / R-DK-6 — reference and document number swap places on 12/13. */
const showDkReference = computed(() => !!exportDetail.value?.referenceRequired)
const showDkDocumentNumber = computed(() =>
  documentKind.value === 'DK' && !!dkCode.value && (isDkDomestic.value || !!exportDetail.value?.documentNumberRequired),
)
const showInvoiceCode = computed(() => !!exportDetail.value?.invoiceCode)

// ── Summary ───────────────────────────────────────────────────────────────────
const dpp = computed(() => props.invoice.totals.total - props.invoice.totals.taxAmount)
const standardPpn = computed(() => props.invoice.totals.taxAmount)
const summary = computed(() => {
  // R-DK-2 — an export is forced to zero PPN, not merely validated.
  if (isDkExport.value) {
    return dkDetail.value ? computeForeignTaxDocumentSummary(props.invoice.total, dpp.value) : null
  }
  return activeVatCode.value
    ? computeTaxDocumentSummary(activeVatCode.value, props.invoice.total, dpp.value, standardPpn.value)
    : null
})

// ── Reset on open ─────────────────────────────────────────────────────────────
function reset() {
  taxDocDate.value = todayDMY()
  documentKind.value = defaultDocumentKind.value
  resetBelowDocumentKind()
  // An export is the only thing a foreign buyer can be sent, so code 4 is the
  // only sensible starting point once the form has defaulted to DK.
  if (documentKind.value === 'DK') selectDkCode('4')
}
watch(() => props.isOpen, (open) => { if (open) reset() })

// ── Validation ────────────────────────────────────────────────────────────────
function validate(): boolean {
  clearErrors()
  let ok = true
  const fail = (k: keyof typeof errors) => { errors[k] = true; ok = false }

  if (isFk.value) {
    if (!fkCode.value) fail('fkCode')
  } else {
    if (!dkCode.value) fail('dkCode')
    if (!dkDetail.value) fail('dkDetail')
    if (!dkDocument.value) fail('dkDocument')
    if (showDkReference.value && !dkReference.value.trim()) fail('dkReference')
    if (showDkDocumentNumber.value && !dkDocumentNumber.value.trim()) fail('dkDocumentNumber')
  }

  if (showRemarks.value && !remark.value) fail('remark')
  if (showDescription.value && !description.value.trim()) fail('description')

  return ok
}

function close() { emit('update:isOpen', false) }

/**
 * Hidden ⇒ null (§8.2). Everything the current branch doesn't show is dropped
 * here rather than trusted to have been cleared on the way — the backend
 * validates "must be empty", so a leftover value is a rejected submit.
 */
function save(status: TaxDocumentStatus) {
  if (!validate()) return

  const lane: TaxDocumentLane = isDkExport.value ? 'foreign' : 'domestic'
  const djpCode = isFk.value ? fkCode.value : dkDetail.value

  addTaxDocument({
    salesInvoiceId: props.invoice.id,
    date: taxDocDate.value,
    documentType: isFk.value ? 'Output tax invoice' : 'Other output document',
    docKind: documentKind.value,
    // The form no longer asks: an FK raised against a whole invoice IS a full
    // payment, and a DK carries no termin block at all (§6). Still recorded —
    // no column shows it any more, but the "View details" drawer reads it as
    // Sales invoice type, and the e-faktur print needs the termin.
    paymentStage: isFk.value ? 'full-payment' : undefined,
    lane,
    djpCode,
    dkTransactionCode: isFk.value ? undefined : (dkCode.value || undefined),
    dkDocumentCode: isFk.value ? undefined : (dkDocument.value || undefined),
    invoiceCode: showInvoiceCode.value ? exportDetail.value?.invoiceCode : undefined,
    additionalRemark: showRemarks.value ? remark.value : undefined,
    description: showDescription.value ? description.value.trim() : undefined,
    // FK carries no reference of its own — it IS the invoice's document, and the
    // invoice number already identifies it. DK export 12/13 still collects one:
    // there it names the export notice, which nothing else records (R-DK-5).
    reference: !isFk.value && showDkReference.value ? dkReference.value.trim() : undefined,
    documentNumber: showDkDocumentNumber.value ? dkDocumentNumber.value.trim() : undefined,
    status,
    invoiceSnapshot: buildTaxSnapshot(props.invoice),
  })
  emit('saved')
  close()
}
function saveDraft() { save('draft') }
function submitToDjp() { save('awaiting-approval') }
</script>

<template>
  <Teleport to="body">
    <Transition name="ctd">
      <div v-if="isOpen" class="ctd-overlay">
        <div class="ctd-panel" role="dialog" :aria-label="t('Create tax document')">
          <div class="ctd-header">
            <MpText weight="semiBold">{{ t('Create tax document') }}</MpText>
            <div class="ctd-header-actions">
              <MpPopover id="ctd-scenario-popover" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                <MpPopoverTrigger>
                  <MpButton class="ctd-lane-fab" is-rounded :aria-label="t('Change scenario state')">
                    <MpIcon name="sliders" size="sm" color="icon.inverse" />
                  </MpButton>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content' })">
                  <p class="ctd-lane-fab-heading">{{ t('Scenario state') }}</p>
                  <MpPopoverList>
                    <MpPopoverListItem
                      v-for="s in TAX_INFO_SCENARIOS" :key="s.value"
                      :is-active="s.value === taxInfoScenario" @click="setTaxInfoScenario(s.value)"
                    >{{ t(s.label) }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
              <MpButton left-icon="close" variant="ghost" size="sm" :aria-label="t('Close')" @click="close" />
            </div>
          </div>

          <div class="ctd-form">
            <div class="ctd-section">
              <MpText size="h3" weight="semiBold" class="ctd-section-title">{{ t('Document info') }}</MpText>

              <!-- Always the day the document is raised, so there is nothing to pick.
                   A disabled MpInput rather than a locked date picker: the calendar
                   affordance would invite an edit that is never possible. -->
              <MpFormControl id="ctd-date" is-required>
                <MpFormLabel>{{ t('Tax document date') }}</MpFormLabel>
                <MpInput id="ctd-date-inp" :model-value="taxDocDate" is-full-width is-disabled />
              </MpFormControl>

              <MpFormControl id="ctd-doctype" is-required>
                <MpFormLabel>{{ t('Document type') }}</MpFormLabel>
                <ErpFilterSelect
                  id="ctd-doctype-inp"
                  :model-value="documentKind"
                  :placeholder="t('Select document type')"
                  :options="DOCUMENT_KINDS.map(k => ({ value: k.value, label: t(k.label) }))"
                  :is-clearable="false"
                  width="100%"
                  @update:model-value="selectDocumentKind($event as DocumentKind)"
                />
                <MpFormHelpText v-if="buyerIsForeign">
                  {{ t('This buyer is a foreign contact, so an export document is the default.') }}
                </MpFormHelpText>
              </MpFormControl>

              <!-- ══ FK — Faktur Keluaran ══════════════════════════════════ -->
              <template v-if="isFk">
                <MpFormControl id="ctd-fkcode" is-required :is-invalid="errors.fkCode">
                  <MpFormLabel>{{ t('Transaction code') }}</MpFormLabel>
                  <ErpFilterSelect
                    id="ctd-fkcode-inp"
                    :model-value="fkCode"
                    :placeholder="t('Select transaction code')"
                    :options="vatCodeOptions()"
                    :is-clearable="false"
                    width="100%"
                    @update:model-value="selectFkCode"
                  />
                  <MpFormHelpText v-if="activeVatCode">{{ activeVatCode.note }}</MpFormHelpText>
                  <MpFormErrorMessage>{{ t('You must select transaction code') }}</MpFormErrorMessage>
                </MpFormControl>
              </template>

              <!-- ══ DK — Dokumen Lain Keluaran ════════════════════════════ -->
              <template v-else>
                <MpFormControl id="ctd-dkcode" is-required :is-invalid="errors.dkCode">
                  <MpFormLabel>{{ t('Transaction code') }}</MpFormLabel>
                  <ErpFilterSelect
                    id="ctd-dkcode-inp"
                    :model-value="dkCode"
                    :placeholder="t('Select transaction code')"
                    :options="DOC_OUT_TRANSACTION_CODES.map(c => ({ value: c.code, label: t(c.label) }))"
                    :is-clearable="false"
                    width="100%"
                    @update:model-value="selectDkCode($event as DocOutTransactionCode)"
                  />
                  <MpFormErrorMessage>{{ t('You must select transaction code') }}</MpFormErrorMessage>
                </MpFormControl>

                <MpFormControl v-if="dkCode" id="ctd-dkdetail" is-required :is-invalid="errors.dkDetail">
                  <MpFormLabel>{{ t('Transaction detail') }}</MpFormLabel>
                  <ErpFilterSelect
                    id="ctd-dkdetail-inp"
                    :model-value="dkDetail"
                    :placeholder="t('Select transaction detail')"
                    :options="dkDetailOptions"
                    :is-clearable="false"
                    width="100%"
                    @update:model-value="selectDkDetail"
                  />
                  <MpFormErrorMessage>{{ t('You must select transaction detail') }}</MpFormErrorMessage>
                </MpFormControl>

                <MpFormControl v-if="dkDetail" id="ctd-dkdoc" is-required :is-invalid="errors.dkDocument">
                  <MpFormLabel>{{ t('Transaction document') }}</MpFormLabel>
                  <ErpFilterSelect
                    id="ctd-dkdoc-inp"
                    :model-value="dkDocument"
                    :placeholder="t('Select transaction document')"
                    :options="dkDocumentOptions"
                    :is-clearable="false"
                    :disabled="dkDocumentForced"
                    width="100%"
                    @update:model-value="dkDocument = $event; errors.dkDocument = false"
                  />
                  <MpFormHelpText v-if="dkDocumentForced">
                    {{ t('Set by the transaction detail.') }}
                  </MpFormHelpText>
                  <MpFormErrorMessage>{{ t('You must select transaction document') }}</MpFormErrorMessage>
                </MpFormControl>

                <MpFormControl v-if="showInvoiceCode" id="ctd-invoicecode">
                  <MpFormLabel>{{ t('Invoice code') }}</MpFormLabel>
                  <ErpFilterSelect
                    id="ctd-invoicecode-inp"
                    :model-value="exportDetail?.invoiceCode ?? ''"
                    :placeholder="''"
                    :options="[{ value: exportDetail?.invoiceCode ?? '', label: exportDetail?.invoiceCode ?? '' }]"
                    :is-clearable="false"
                    disabled
                    width="100%"
                  />
                  <MpFormHelpText>{{ t('Set by the transaction detail.') }}</MpFormHelpText>
                </MpFormControl>

                <MpFormControl v-if="showDkReference" id="ctd-dkref" is-required :is-invalid="errors.dkReference">
                  <MpFormLabel>{{ t('Reference') }}</MpFormLabel>
                  <MpInput
                    id="ctd-dkref-inp" v-model="dkReference" maxlength="300" is-full-width
                    @update:model-value="errors.dkReference = false"
                  />
                  <MpFormErrorMessage>{{ t('You must fill in reference') }}</MpFormErrorMessage>
                </MpFormControl>

                <MpFormControl v-if="showDkDocumentNumber" id="ctd-dknum" is-required :is-invalid="errors.dkDocumentNumber">
                  <MpFormLabel>{{ t('Document number') }}</MpFormLabel>
                  <MpInput
                    id="ctd-dknum-inp" v-model="dkDocumentNumber" is-full-width
                    @update:model-value="errors.dkDocumentNumber = false"
                  />
                  <MpFormErrorMessage>{{ t('You must fill in document number') }}</MpFormErrorMessage>
                </MpFormControl>
              </template>

              <!-- ══ Shared: remarks + description (code 07 / 08) ══════════ -->
              <MpFormControl v-if="showRemarks" id="ctd-remark" is-required :is-invalid="errors.remark">
                <MpFormLabel>{{ t('Additional remarks') }}</MpFormLabel>
                <ErpFilterSelect
                  id="ctd-remark-inp"
                  :model-value="remark"
                  :placeholder="t('Select additional remarks')"
                  :options="remarkOptions(remarkCatalogueCode)"
                  :is-clearable="false"
                  width="100%"
                  @update:model-value="selectRemark"
                />
                <MpFormErrorMessage>{{ t('You must select additional remarks') }}</MpFormErrorMessage>
              </MpFormControl>

              <MpFormControl v-if="showDescription" id="ctd-description" is-required :is-invalid="errors.description">
                <MpFormLabel>{{ t('Remarks detail') }}</MpFormLabel>
                <MpInput
                  id="ctd-description-inp" v-model="description" maxlength="255" is-full-width
                  @update:model-value="errors.description = false"
                />
                <MpFormHelpText v-if="selectedRemark?.refDocHint">
                  {{ t(selectedRemark.refDocHint) }}
                </MpFormHelpText>
                <MpFormErrorMessage>{{ t('You must fill in remarks detail') }}</MpFormErrorMessage>
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
            <MpButton type="button" class="btn-enterprise btn-enterprise--ghost" variant="ghost" @click="close">{{ t('Cancel') }}</MpButton>
            <MpButton type="button" class="btn-enterprise btn-enterprise--secondary" variant="secondary" @click="saveDraft">{{ t('Save as draft') }}</MpButton>
            <MpButton type="button" class="btn-enterprise btn-enterprise--primary" variant="primary" @click="submitToDjp">{{ t('Save & submit to DJP') }}</MpButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Standard ERP drawer shell (rule/drawer-custom-shell) — copied from
   BillsFiltersDrawer.vue. Pixel's MpDrawer has no structural CSS in this build:
   its header and footer detach and the body renders as a bare floating card.
   That is exactly what this drawer did once it was widened past 600px — the
   600px override had been holding a broken component together by luck.
   The overlay carries NO click handler and there is no Esc listener, so a
   half-filled form is never lost (rule/modal-drawer-close-explicit-only). */
.ctd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.ctd-panel {
  margin: var(--mp-spacing-3);
  width: min(920px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.ctd-enter-active, .ctd-leave-active { transition: background-color 250ms ease; }
.ctd-enter-from, .ctd-leave-to { background-color: transparent; }
.ctd-enter-active .ctd-panel { transition: transform 350ms ease-out; }
.ctd-leave-active .ctd-panel { transition: transform 250ms ease-in; }
.ctd-enter-from .ctd-panel,
.ctd-leave-to .ctd-panel { transform: translateX(calc(100% + 12px)); }
.ctd-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.ctd-header-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
/* Scenario switcher — same visual as InvoiceReviewPage.vue's .demo-fab, sized down
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

.ctd-summary {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
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
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
