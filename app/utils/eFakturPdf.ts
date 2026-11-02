import jsPDF from 'jspdf'
import type { TaxDocument } from '~/data/taxDocuments'
import { formatTaxDocumentNumber, taxDocumentStamp } from '~/data/taxDocuments'
import { COMPANY_TAX_PROFILE } from '~/data/companyTaxProfile'
import type { SalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import { VAT_CODES, computeTaxDocumentSummary } from '~/data/vatCodes'
import { computeForeignTaxDocumentSummary } from '~/data/foreignTransactionDetails'

/**
 * "Print e-faktur" — renders the DJP Faktur Pajak form, populated from the
 * source Sales Invoice.
 *
 * The layout follows the printed faktur DJP issues: a centred title, the seller
 * block, then one bordered stack of rows — faktur number, Pengusaha Kena Pajak,
 * Pembeli, the goods/services table, and the DPP/PPN/PPnBM totals — closing with
 * the electronic-signature notice. Everything is drawn by hand rather than via
 * autotable because the form is one continuous ruled box whose cells hold
 * multi-line label/value text, which a data-table layout fights.
 *
 * Money is printed the way the form does it: grouped digits with two decimals
 * and NO "Rp" prefix in the amount column (the column header carries the unit),
 * but WITH the prefix inside the goods description, matching DJP's own output.
 *
 * DPP / PPN / PPnBM come from the same computeTaxDocumentSummary the drawers use,
 * so a printed faktur can never disagree with the Summary shown on screen.
 */

const M = 40          // page margin
const PAD = 6         // cell padding
const LH = 12         // line height at body size
const FS = 9.5        // body font size
const FS_SMALL = 8    // signature notice

/** "2.000.000,00" — grouped, two decimals, no currency symbol. */
function amount(n: number): string {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
/** "Rp 200,00" — as it appears inside a goods description line. */
function rp(n: number): string {
  return `Rp ${amount(n)}`
}
/** Quantities print with decimals on the faktur ("10.000,00 Lembar"). */
function qty(n: number): string {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

export function generateEFakturPdf(doc: TaxDocument, invoice: SalesInvoiceDetail): jsPDF {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const x0 = M
  const x1 = pageW - M
  const W = x1 - x0
  let y = M

  // Goods-table columns: No / Kode Barang / Nama / Harga. The Nama column takes
  // whatever the three fixed ones leave.
  const cNo = 32
  const cKode = 64
  const cHarga = 132
  const cNama = W - cNo - cKode - cHarga
  const colX = [x0, x0 + cNo, x0 + cNo + cKode, x0 + cNo + cKode + cNama, x1]

  pdf.setLineWidth(0.7)
  pdf.setDrawColor(0)

  /** Wrap `text` to `maxW`, returning the lines jsPDF would draw. */
  function wrap(text: string, maxW: number): string[] {
    return pdf.splitTextToSize(text, maxW - PAD * 2) as string[]
  }

  /**
   * Start a fresh page when `h` more points won't fit. `onBreak` runs on the new
   * page before the caller draws — the goods table uses it to repeat its column
   * header, so a faktur long enough to paginate doesn't leave headerless rows.
   */
  function ensure(h: number, onBreak?: () => void) {
    if (y + h <= pageH - M) return
    pdf.addPage()
    y = M
    onBreak?.()
  }

  /** One full-width bordered row holding pre-wrapped lines. */
  function row(lines: string[]) {
    const h = lines.length * LH + PAD * 2
    ensure(h)
    pdf.rect(x0, y, W, h)
    lines.forEach((line, i) => pdf.text(line, x0 + PAD, y + PAD + i * LH, { baseline: 'top' }))
    y += h
  }

  /**
   * One row of the goods table. `cells` holds pre-wrapped lines per column;
   * `align` picks per-column alignment. Column dividers are drawn to the row's
   * full height so the ruled grid stays continuous.
   */
  function gridRow(cells: string[][], align: ('left' | 'center' | 'right')[], onBreak?: () => void) {
    const rows = Math.max(...cells.map(c => c.length))
    const h = rows * LH + PAD * 2
    ensure(h, onBreak)
    pdf.rect(x0, y, W, h)
    for (let i = 1; i < colX.length - 1; i++) pdf.line(colX[i]!, y, colX[i]!, y + h)

    cells.forEach((lines, ci) => {
      const left = colX[ci]!
      const width = colX[ci + 1]! - left
      const a = align[ci] ?? 'left'
      const tx = a === 'right' ? left + width - PAD : a === 'center' ? left + width / 2 : left + PAD
      lines.forEach((line, li) => {
        pdf.text(line, tx, y + PAD + li * LH, { baseline: 'top', align: a })
      })
    })
    y += h
  }

  /** A totals row: label spans the first three columns, amount sits in the last. */
  function totalRow(label: string, value: string) {
    const labelW = colX[3]! - x0
    const lines = wrap(label, labelW)
    const h = Math.max(lines.length, 1) * LH + PAD * 2
    ensure(h)
    pdf.rect(x0, y, W, h)
    pdf.line(colX[3]!, y, colX[3]!, y + h)
    lines.forEach((line, i) => pdf.text(line, x0 + PAD, y + PAD + i * LH, { baseline: 'top' }))
    if (value) pdf.text(value, x1 - PAD, y + PAD, { baseline: 'top', align: 'right' })
    y += h
  }

  // ── Title ───────────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text('Faktur Pajak', pageW / 2, y, { baseline: 'top', align: 'center' })
  y += 26

  // ── Seller identity, offset right the way the form prints it ────────────────
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(FS)
  const sellerX = x0 + W * 0.5
  const sellerW = x1 - sellerX
  pdf.text(`Nama: ${COMPANY_TAX_PROFILE.name}`, sellerX, y, { baseline: 'top' })
  y += LH
  for (const line of pdf.splitTextToSize(`Alamat: ${COMPANY_TAX_PROFILE.address}`, sellerW) as string[]) {
    pdf.text(line, sellerX, y, { baseline: 'top' })
    y += LH
  }
  y += 14

  // ── Faktur number ───────────────────────────────────────────────────────────
  const number = formatTaxDocumentNumber(doc)
  row(wrap(`Kode dan Nomor Seri Faktur Pajak. ${number === '—' ? '' : number}`, W))

  // ── Pengusaha Kena Pajak (seller) ───────────────────────────────────────────
  row(wrap('Pengusaha Kena Pajak:', W))
  row([
    ...wrap(`Nama : ${COMPANY_TAX_PROFILE.name}`, W),
    ...wrap(`Alamat : ${COMPANY_TAX_PROFILE.address}`, W),
    '',
    ...wrap(`NPWP : ${COMPANY_TAX_PROFILE.npwp}`, W),
  ])

  // ── Pembeli (customer) ──────────────────────────────────────────────────────
  // The prototype's customer master carries no NPWP/NIK/passport, so those print
  // as the form's own "-" placeholder rather than inventing an identity.
  //
  // The DIGANTI / BATAL cap belongs across this block, so remember where it
  // starts — it can only be drawn once everything else is down (see below),
  // otherwise the ruled rows would paint over it.
  const stampY = y + LH
  row(wrap('Pembeli Barang Kena Pajak/Penerima Jasa Kena Pajak:', W))
  row([
    ...wrap(`Nama : ${invoice.customer.name}`, W),
    ...wrap(`Alamat : ${invoice.billingAddress}`, W),
    '',
    'NPWP : -',
    'NIK : -',
    'Nomor Paspor : -',
    'Identitas Lain : -',
    ...wrap(`Email: ${invoice.email[0] ?? '-'}`, W),
  ])

  // ── Goods / services table ──────────────────────────────────────────────────
  pdf.setFont('helvetica', 'normal')
  function goodsHeader() {
    gridRow(
      [
        ['No.'],
        wrap('Kode Barang/ Jasa', cKode),
        wrap('Nama Barang Kena Pajak / Jasa Kena Pajak', cNama),
        wrap('Harga Jual / Penggantian / Uang Muka / Termin (Rp)', cHarga),
      ],
      ['center', 'center', 'center', 'center'],
    )
  }
  goodsHeader()

  invoice.lineItems.forEach((it, i) => {
    const gross = it.qty * it.unitPrice
    const lineDiscount = gross - it.amount
    gridRow(
      [
        [String(i + 1)],
        wrap(it.sku, cKode),
        [
          ...wrap(it.product, cNama),
          ...wrap(`${rp(it.unitPrice)} x ${qty(it.qty)} ${it.unit}`, cNama),
          ...wrap(`Potongan Harga = ${rp(lineDiscount)}`, cNama),
          ...wrap('PPnBM (0,00%) = Rp 0,00', cNama),
        ],
        [amount(gross)],
      ],
      ['center', 'center', 'left', 'right'],
      goodsHeader,
    )
  })

  // ── Totals ──────────────────────────────────────────────────────────────────
  // Summary figures come from the same helpers the on-screen drawers use, so the
  // VAT code's own treatment (DPP nilai lain, reduced rate, non-collected) is
  // reflected here rather than re-derived.
  const dppBase = invoice.totals.total - invoice.totals.taxAmount
  const vatCode = VAT_CODES.find(c => c.code === doc.djpCode)
  const summary = doc.lane === 'foreign'
    ? computeForeignTaxDocumentSummary(invoice.total, dppBase)
    : vatCode
      ? computeTaxDocumentSummary(vatCode, invoice.total, dppBase, invoice.totals.taxAmount)
      : null

  const grossTotal = invoice.lineItems.reduce((s, it) => s + it.qty * it.unitPrice, 0)
  const potongan = invoice.totals.discountPerLine + invoice.totals.globalDiscount

  totalRow('Harga Jual / Penggantian / Uang Muka / Termin', amount(grossTotal))
  totalRow('Dikurangi Potongan Harga', amount(potongan))
  totalRow('Dikurangi Uang Muka yang telah diterima', amount(0))
  totalRow('Dasar Pengenaan Pajak', amount(summary?.dpp ?? dppBase))
  if (summary?.dppLain != null) {
    totalRow('Dasar Pengenaan Pajak Nilai Lain', amount(summary.dppLain))
  }
  totalRow('Jumlah PPN (Pajak Pertambahan Nilai)', amount(summary?.ppn ?? invoice.totals.taxAmount))
  totalRow('Jumlah PPnBM (Pajak Penjualan atas Barang Mewah)', amount(summary?.ppnbm ?? 0))

  // ── Electronic-signature notice ─────────────────────────────────────────────
  y += 6
  pdf.setFontSize(FS_SMALL)
  const notice = 'Sesuai dengan ketentuan yang berlaku, Direktorat Jenderal Pajak mengatur bahwa Faktur Pajak ini telah ditandatangani secara elektronik sehingga tidak diperlukan tanda tangan basah pada Faktur Pajak ini.'
  for (const line of pdf.splitTextToSize(notice, W) as string[]) {
    ensure(LH)
    pdf.text(line, x0, y, { baseline: 'top' })
    y += 10
  }

  // ── DIGANTI / BATAL cap ─────────────────────────────────────────────────────
  // Drawn last, and explicitly back on page 1, so it lands ON TOP of the ruled
  // rows instead of being painted over by them. Light grey and letter-spaced,
  // matching the cap on DJP's own printed output.
  const stamp = taxDocumentStamp(doc)
  if (stamp) {
    pdf.setPage(1)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(44)
    pdf.setTextColor(178)
    pdf.text(stamp, pageW / 2, stampY, { align: 'center', baseline: 'top', charSpace: 15 })
    // Leave the graphics state as found — a caller reusing this doc would
    // otherwise inherit grey 34pt text.
    pdf.setTextColor(0)
    pdf.setFontSize(FS)
  }

  return pdf
}
