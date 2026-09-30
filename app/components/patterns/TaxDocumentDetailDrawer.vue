<script setup lang="ts">
/**
 * "Tax document" read-only detail drawer — Sales Invoice detail page ▸ Tax
 * document tab ▸ row kebab ▸ View details (Figma: E-Faktur node 4254-39021).
 * Mirrors CreateTaxDocumentDrawer.vue's chrome (600px floating drawer,
 * Document info / Summary sections) but every field is a plain label/value
 * row instead of an input.
 *
 * The "Actions" button reuses the exact same status-driven menu as the row
 * kebab in the Tax documents table — the parent builds that list (via
 * taxDocMenuItemDefs in ~/data/taxDocuments) with "View details" dropped,
 * since we're already inside the detail view, and hands it in as `menuItems`.
 */
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpButton, MpText, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import type { SalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import { VAT_CODES, computeTaxDocumentSummary } from '~/data/vatCodes'
import { FOREIGN_TRANSACTION_DETAILS, computeForeignTaxDocumentSummary } from '~/data/foreignTransactionDetails'
import { DJP_STATUS_CONFIG, formatPaymentStage, type TaxDocument } from '~/data/taxDocuments'

export interface TaxDocMenuItem { label: string; disabled?: boolean; tooltip?: string; onClick?: () => void }

/** Unique per-item tooltip id (MpTooltip requires one). */
function menuItemTooltipId(item: TaxDocMenuItem): string {
  return `tdd-tt-${item.label.toLowerCase().replace(/\s+/g, '-')}`
}
// Fixed (not max-content) so the Edit/Delete tooltip can be forced to the
// exact same width as the popover — fits the longest item label ("Refresh DJP status").
const menuWidth = '200px'

const props = defineProps<{
  isOpen: boolean
  doc: TaxDocument | null
  invoice: SalesInvoiceDetail
  menuItems: TaxDocMenuItem[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
}>()

const { t } = useLocale()

const isForeign = computed(() => props.doc?.lane === 'foreign')
const selectedVatCode = computed(() => (props.doc && !isForeign.value) ? VAT_CODES.find(c => c.code === props.doc!.djpCode) ?? null : null)
const selectedTransactionDetail = computed(() => (props.doc && isForeign.value) ? FOREIGN_TRANSACTION_DETAILS.find(c => c.code === props.doc!.djpCode) ?? null : null)
const dpp = computed(() => props.invoice.totals.total - props.invoice.totals.taxAmount)
const standardPpn = computed(() => props.invoice.totals.taxAmount)
const summary = computed(() => {
  if (!props.doc) return null
  if (isForeign.value) return computeForeignTaxDocumentSummary(props.invoice.total, dpp.value)
  return selectedVatCode.value
    ? computeTaxDocumentSummary(selectedVatCode.value, props.invoice.total, dpp.value, standardPpn.value)
    : null
})

function close() { emit('update:isOpen', false) }
</script>

<template>
  <MpDrawer :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="tax-document-detail-drawer"
    :is-open="isOpen"
    placement="right"
    size="full"
    variant="floating"
    :is-keep-alive="false"
    @close="close"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div v-if="doc" class="tdd-card">
          <div class="tdd-header">
            <MpText weight="semiBold">{{ t('Tax document') }}</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" :aria-label="t('Close')" @click="close" />
          </div>

          <div class="tdd-form">
            <div class="tdd-section">
              <MpText size="h3" weight="semiBold" class="tdd-section-title">{{ t('Document info') }}</MpText>

              <div class="tdd-row">
                <span class="tdd-row-label">{{ t('Tax document date') }}</span>
                <span class="tdd-row-value">{{ doc.date }}</span>
              </div>
              <div class="tdd-row">
                <span class="tdd-row-label">{{ t('Document type') }}</span>
                <span class="tdd-row-value">{{ t(doc.documentType) }}</span>
              </div>
              <!-- Foreign lane doesn't collect a sales invoice type at all. -->
              <div v-if="!isForeign" class="tdd-row">
                <span class="tdd-row-label">{{ t('Sales invoice type') }}</span>
                <span class="tdd-row-value">{{ t(formatPaymentStage(doc.paymentStage)) }}</span>
              </div>
              <!-- Domestic: VAT code. Foreign: Transaction detail + whichever nested
                   reference field(s) that code carries (see CreateTaxDocumentDrawer.vue). -->
              <template v-if="!isForeign">
                <div class="tdd-row">
                  <span class="tdd-row-label">{{ t('VAT code') }}</span>
                  <span class="tdd-row-value">{{ selectedVatCode ? selectedVatCode.label : '—' }}</span>
                </div>
              </template>
              <template v-else>
                <div class="tdd-row">
                  <span class="tdd-row-label">{{ t('Transaction detail') }}</span>
                  <span class="tdd-row-value">{{ selectedTransactionDetail ? selectedTransactionDetail.label : '—' }}</span>
                </div>
                <div v-if="selectedTransactionDetail?.fields === 'peb'" class="tdd-row">
                  <span class="tdd-row-label">{{ t('PEB reference') }}</span>
                  <span class="tdd-row-value">{{ doc.pebReference || '—' }}</span>
                </div>
                <template v-else-if="selectedTransactionDetail?.fields === 'export-notice'">
                  <div class="tdd-row">
                    <span class="tdd-row-label">{{ t('Export notice reference') }}</span>
                    <span class="tdd-row-value">{{ doc.exportNoticeReference || '—' }}</span>
                  </div>
                  <div class="tdd-row">
                    <span class="tdd-row-label">{{ t('Classification code') }}</span>
                    <span class="tdd-row-value">{{ doc.classificationCode || '—' }}</span>
                  </div>
                </template>
              </template>
              <div class="tdd-row">
                <span class="tdd-row-label">{{ t('DJP status') }}</span>
                <ErpStatusBadge
                  :status="doc.status"
                  :label="DJP_STATUS_CONFIG[doc.status].label"
                  :type="DJP_STATUS_CONFIG[doc.status].type"
                />
              </div>
            </div>

            <div v-if="summary" class="tdd-section">
              <MpText size="h3" weight="semiBold" class="tdd-section-title">{{ t('Summary') }}</MpText>

              <div class="tdd-row">
                <span class="tdd-row-label">{{ t('Sales invoice total') }}</span>
                <span class="tdd-row-value tdd-row-value--strong">{{ formatIDR(summary.salesInvoiceTotal) }}</span>
              </div>
              <div class="tdd-row">
                <span class="tdd-row-label">Dasar pengenaan pajak (DPP)</span>
                <span class="tdd-row-value tdd-row-value--strong">{{ formatIDR(summary.dpp) }}</span>
              </div>
              <div v-if="summary.dppLain !== null" class="tdd-row">
                <span class="tdd-row-label">Dasar pengenaan pajak lainnya (DPP lain)</span>
                <span class="tdd-row-value tdd-row-value--strong">{{ formatIDR(summary.dppLain) }}</span>
              </div>
              <div class="tdd-row">
                <span class="tdd-row-label">Pajak pertambahan nilai (PPN)</span>
                <span class="tdd-row-value tdd-row-value--strong">{{ formatIDR(summary.ppn) }}</span>
              </div>
              <div class="tdd-row">
                <span class="tdd-row-label">Pajak penjualan atas Barang Mewah (PPnBM)</span>
                <span class="tdd-row-value tdd-row-value--strong">{{ formatIDR(summary.ppnbm) }}</span>
              </div>
            </div>
          </div>

          <div class="tdd-footer">
            <MpButton type="button" class="btn-enterprise btn-enterprise--ghost" variant="ghost" @click="close">{{ t('Cancel') }}</MpButton>
            <MpPopover id="tdd-actions-popover" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
              <MpPopoverTrigger>
                <MpButton type="button" class="btn-enterprise btn-enterprise--primary" variant="primary">
                  {{ t('Actions') }}
                  <MpIcon name="chevrons-down" size="sm" />
                </MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ width: menuWidth, whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <template v-for="item in menuItems" :key="item.label">
                    <MpTooltip
                      v-if="item.tooltip"
                      :id="menuItemTooltipId(item)"
                      placement="top"
                      use-portal
                    >
                      <template #label>
                        <span class="tdd-tt-content" :style="{ width: menuWidth }">{{ t(item.tooltip) }}</span>
                      </template>
                      <span class="tdd-menu-item-wrap">
                        <MpPopoverListItem :is-disabled="item.disabled">{{ t(item.label) }}</MpPopoverListItem>
                      </span>
                    </MpTooltip>
                    <MpPopoverListItem v-else :is-disabled="item.disabled" @click="item.onClick?.()">
                      {{ t(item.label) }}
                    </MpPopoverListItem>
                  </template>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* Same floating-drawer chrome as CreateTaxDocumentDrawer.vue — including the
   size="full" requirement explained there (a fixed size preset's stale
   width lookup fights this override and freezes the open animation). */
.tdd-card { display: flex; flex-direction: column; height: 100%; }
:deep([data-pixel-component="MpDrawerContent"]) {
  width: var(--mp-spacing-150, 600px) !important;
  max-width: 600px !important;
}
.tdd-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.tdd-form {
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
  flex: 1; overflow-y: auto;
  padding: var(--mp-spacing-4);
}
.tdd-section { display: flex; flex-direction: column; }
.tdd-section-title { display: block; margin-bottom: var(--mp-spacing-2); }

/* label/value row — label left (fixed width), value right, both regular
   weight except Summary values (bolded via --strong). */
.tdd-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md);
}
.tdd-row-label { flex: 0 0 240px; color: var(--mp-text-default); }
.tdd-row-value { flex: 1; text-align: right; color: var(--mp-text-default); }
.tdd-row-value--strong { font-weight: var(--mp-font-weights-semi-bold); }

.tdd-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4) 0;
}
.tdd-footer .btn-enterprise--primary { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }

/* See SalesInvoiceDetailsPage.vue's identical comment: MpTooltip clones its
   trigger handlers onto a non-Pixel single child, so MpPopoverListItem must
   sit inside this plain, layout-transparent span rather than be wrapped directly. */
.tdd-menu-item-wrap { display: block; width: 100%; }
.tdd-tt-content { display: block; white-space: normal; }
/* Pixel's own popover-list-item recipe ships no :disabled visual treatment at
   all (verified: empty variant map) — this greys it out ourselves. */
:deep(.mp-popover-list-item:disabled) {
  color: var(--mp-text-disabled, rgba(29, 31, 36, 0.32)) !important;
  cursor: not-allowed !important;
}
</style>
