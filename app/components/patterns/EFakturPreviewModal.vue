<script setup lang="ts">
/**
 * "Print e-faktur" preview — the DJP Faktur Pajak form, rendered as UI.
 *
 * This deliberately does NOT embed a PDF. The previous version generated one
 * with jsPDF and showed it in an <iframe>, which depends on the viewer having a
 * PDF plugin — in an embedded browser pane there isn't one, so the preview came
 * up blank and the faktur couldn't be reviewed or demoed at all. Rendering the
 * form as markup always shows, is inspectable, and scales with the page.
 *
 * The layout is a facsimile of the printed faktur, so it intentionally ignores
 * Pixel tokens and uses plain black-on-white document styling — it should read
 * as a tax document, not as app chrome. For the same reason every label here
 * stays in Indonesian whatever the app locale is: these are the regulator's
 * field names, not UI copy. Only the modal chrome goes through `t()`.
 *
 * "Download PDF" still produces the real file via generateEFakturPdf, so the
 * document can be handed to someone outside the app.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButton,
} from '@mekari/pixel3'
import type { SalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import { formatTaxDocumentNumber, taxDocumentStamp, type TaxDocument } from '~/data/taxDocuments'
import { COMPANY_TAX_PROFILE } from '~/data/companyTaxProfile'
import { VAT_CODES, computeTaxDocumentSummary } from '~/data/vatCodes'
import { computeForeignTaxDocumentSummary } from '~/data/foreignTransactionDetails'
import { generateEFakturPdf } from '~/utils/eFakturPdf'

const props = defineProps<{
  open: boolean
  doc: TaxDocument | null
  invoice: SalesInvoiceDetail
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useLocale()

/** "2.000.000,00" — grouped, two decimals, no currency symbol (the column header carries it). */
function amount(n: number): string {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
/** "Rp 200,00" — as it appears inside a goods description. */
function rp(n: number): string {
  return `Rp ${amount(n)}`
}

/** "DIGANTI" / "BATAL" cap for a superseded faktur; empty while it still stands. */
const stamp = computed(() => (props.doc ? taxDocumentStamp(props.doc) : ''))

const number = computed(() => {
  if (!props.doc) return ''
  const n = formatTaxDocumentNumber(props.doc)
  return n === '—' ? '' : n
})

/** Same helpers the drawers use, so the printed figures can't disagree with the on-screen Summary. */
const summary = computed(() => {
  if (!props.doc) return null
  const dppBase = props.invoice.totals.total - props.invoice.totals.taxAmount
  if (props.doc.lane === 'foreign') return computeForeignTaxDocumentSummary(props.invoice.total, dppBase)
  const vatCode = VAT_CODES.find(c => c.code === props.doc!.djpCode)
  return vatCode
    ? computeTaxDocumentSummary(vatCode, props.invoice.total, dppBase, props.invoice.totals.taxAmount)
    : null
})

/** Gross of the line items, before any discount — what "Harga Jual" reports. */
const grossTotal = computed(() =>
  props.invoice.lineItems.reduce((s, it) => s + it.qty * it.unitPrice, 0),
)
const potongan = computed(() =>
  props.invoice.totals.discountPerLine + props.invoice.totals.globalDiscount,
)

interface FakturLine { no: number; sku: string; name: string; priceLine: string; discountLine: string; gross: string }
const lines = computed<FakturLine[]>(() =>
  props.invoice.lineItems.map((it, i) => {
    const gross = it.qty * it.unitPrice
    return {
      no: i + 1,
      sku: it.sku,
      name: it.product,
      priceLine: `${rp(it.unitPrice)} x ${amount(it.qty)} ${it.unit}`,
      discountLine: `Potongan Harga = ${rp(gross - it.amount)}`,
      gross: amount(gross),
    }
  }),
)

function downloadPdf() {
  if (!props.doc) return
  generateEFakturPdf(props.doc, props.invoice).save(`e-Faktur ${formatTaxDocumentNumber(props.doc)}.pdf`)
}
</script>

<template>
  <MpModal
    id="efaktur-preview-modal" :is-open="open" size="xl"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Print e-faktur') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div v-if="doc" class="fk-scroll">
          <div class="fk-sheet">
            <!-- Superseded faktur: DJP's own cap, laid over the identity blocks
                 exactly where the printed form puts it. Non-interactive and
                 aria-hidden — the status is already conveyed by the DJP Status
                 badge in the table, so this is decoration for print fidelity. -->
            <div v-if="stamp" class="fk-stamp" aria-hidden="true">{{ stamp }}</div>

            <h1 class="fk-title">Faktur Pajak</h1>

            <!-- Seller identity, offset right the way the form prints it -->
            <div class="fk-seller">
              <div>Nama: {{ COMPANY_TAX_PROFILE.name }}</div>
              <div>Alamat: {{ COMPANY_TAX_PROFILE.address }}</div>
            </div>

            <!-- One ruled grid: colspan rows for the identity blocks, four
                 columns for the goods table, label+amount for the totals. -->
            <table class="fk-form">
              <colgroup>
                <col class="fk-c-no" />
                <col class="fk-c-code" />
                <col />
                <col class="fk-c-amount" />
              </colgroup>
              <tbody>
                <tr>
                  <td colspan="4">Kode dan Nomor Seri Faktur Pajak. {{ number }}</td>
                </tr>
                <tr>
                  <td colspan="4">Pengusaha Kena Pajak:</td>
                </tr>
                <tr>
                  <td colspan="4">
                    <div>Nama : {{ COMPANY_TAX_PROFILE.name }}</div>
                    <div>Alamat : {{ COMPANY_TAX_PROFILE.address }}</div>
                    <div class="fk-spacer" />
                    <div>NPWP : {{ COMPANY_TAX_PROFILE.npwp }}</div>
                  </td>
                </tr>
                <tr>
                  <td colspan="4">Pembeli Barang Kena Pajak/Penerima Jasa Kena Pajak:</td>
                </tr>
                <tr>
                  <td colspan="4">
                    <div>Nama : {{ invoice.customer.name }}</div>
                    <div>Alamat : {{ invoice.billingAddress }}</div>
                    <div class="fk-spacer" />
                    <!-- The contact master carries no tax identity yet, so these
                         print the form's own "-" rather than inventing one. -->
                    <div>NPWP : -</div>
                    <div>NIK : -</div>
                    <div>Nomor Paspor : -</div>
                    <div>Identitas Lain : -</div>
                    <div>Email: {{ invoice.email[0] ?? '-' }}</div>
                  </td>
                </tr>

                <tr class="fk-head">
                  <th>No.</th>
                  <th>Kode Barang/ Jasa</th>
                  <th>Nama Barang Kena Pajak / Jasa Kena Pajak</th>
                  <th>Harga Jual / Penggantian / Uang Muka / Termin (Rp)</th>
                </tr>
                <tr v-for="line in lines" :key="line.no">
                  <td class="fk-center">{{ line.no }}</td>
                  <td class="fk-center">{{ line.sku }}</td>
                  <td>
                    <div>{{ line.name }}</div>
                    <div>{{ line.priceLine }}</div>
                    <div>{{ line.discountLine }}</div>
                    <div>PPnBM (0,00%) = Rp 0,00</div>
                  </td>
                  <td class="fk-num">{{ line.gross }}</td>
                </tr>

                <tr>
                  <td colspan="3">Harga Jual / Penggantian / Uang Muka / Termin</td>
                  <td class="fk-num">{{ amount(grossTotal) }}</td>
                </tr>
                <tr>
                  <td colspan="3">Dikurangi Potongan Harga</td>
                  <td class="fk-num">{{ amount(potongan) }}</td>
                </tr>
                <tr>
                  <td colspan="3">Dikurangi Uang Muka yang telah diterima</td>
                  <td class="fk-num">{{ amount(0) }}</td>
                </tr>
                <tr>
                  <td colspan="3">Dasar Pengenaan Pajak</td>
                  <td class="fk-num">{{ amount(summary?.dpp ?? 0) }}</td>
                </tr>
                <!-- Only codes that carry a DPP nilai lain (e.g. 04) show this row. -->
                <tr v-if="summary?.dppLain != null">
                  <td colspan="3">Dasar Pengenaan Pajak Nilai Lain</td>
                  <td class="fk-num">{{ amount(summary.dppLain) }}</td>
                </tr>
                <tr>
                  <td colspan="3">Jumlah PPN (Pajak Pertambahan Nilai)</td>
                  <td class="fk-num">{{ amount(summary?.ppn ?? 0) }}</td>
                </tr>
                <tr>
                  <td colspan="3">Jumlah PPnBM (Pajak Penjualan atas Barang Mewah)</td>
                  <td class="fk-num">{{ amount(summary?.ppnbm ?? 0) }}</td>
                </tr>
              </tbody>
            </table>

            <p class="fk-notice">
              Sesuai dengan ketentuan yang berlaku, Direktorat Jenderal Pajak mengatur bahwa Faktur
              Pajak ini telah ditandatangani secara elektronik sehingga tidak diperlukan tanda tangan
              basah pada Faktur Pajak ini.
            </p>
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="fk-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Close') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="downloadPdf">{{ t('Download PDF') }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* The sheet scrolls inside the modal body — a full faktur is taller than the
   viewport once an invoice has more than a couple of line items. */
.fk-scroll {
  max-height: 70vh;
  overflow-y: auto;
  background: var(--mp-background-neutral-subtle);
  padding: var(--mp-spacing-4);
}

/* ── Document facsimile ──────────────────────────────────────────────────────
   Plain black-on-white, NOT Pixel tokens: this is a reproduction of the printed
   DJP form, so it must not inherit app theming. 794px is A4 width at 96dpi. */
.fk-sheet {
  position: relative;   /* anchors the DIGANTI / BATAL cap */
  width: 794px;
  max-width: 100%;
  margin: 0 auto;
  background: #fff;
  color: #000;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  padding: 32px 28px;
  box-sizing: border-box;
}
.fk-title {
  margin: 0 0 20px;
  font-size: 22px;
  font-weight: 700;
  text-align: center;
}
/* Seller block sits in the right half, left-aligned within it */
.fk-seller {
  width: 50%;
  margin: 0 0 18px auto;
}

.fk-form {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.fk-form td,
.fk-form th {
  border: 1px solid #000;
  padding: 7px 9px;
  vertical-align: top;
  text-align: left;
  font-weight: 400;
  overflow-wrap: anywhere;
}
/* Column header block is centred, like the printed form */
.fk-head th {
  text-align: center;
  vertical-align: middle;
}
.fk-c-no     { width: 44px; }
.fk-c-code   { width: 88px; }
.fk-c-amount { width: 176px; }
.fk-center { text-align: center; }
.fk-num    { text-align: right; white-space: nowrap; }
/* The form leaves a blank line before NPWP in each identity block */
.fk-spacer { height: 1em; }

/* DIGANTI / BATAL cap — sits over the identity blocks, letter-spaced and light
   grey, like the printed faktur. `top` is a fixed offset rather than a
   percentage: the sheet's height varies with the line-item count, and the cap
   belongs against the Pembeli block, not the middle of the page. */
.fk-stamp {
  position: absolute;
  top: 248px;
  left: 0;
  right: 0;
  z-index: 1;
  pointer-events: none;
  text-align: center;
  font-size: 46px;
  font-weight: 400;
  letter-spacing: 0.36em;
  /* Light enough to read the fields underneath, dark enough to be unmissable. */
  color: rgba(0, 0, 0, 0.22);
  text-transform: uppercase;
  white-space: nowrap;
}

.fk-notice {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.35;
}

.fk-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  width: 100%;
}
</style>
