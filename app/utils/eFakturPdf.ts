import jsPDF from 'jspdf'
import type { TaxDocument } from '~/data/taxDocuments'
import { formatTaxDocumentNumber } from '~/data/taxDocuments'

/**
 * "Print e-faktur" placeholder document — there's no real DJP e-Faktur backend
 * in this prototype, so this renders a one-page summary of the approved tax
 * document instead. Same shape as the other generate*Pdf helpers (see
 * billAttachmentPdf.ts) so it can reuse PdfPreviewModal.
 */
export function generateEFakturPdf(
  doc: TaxDocument, invoice: { number: number; customer: { name: string } },
): jsPDF {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const marginX = 40
  let y = 44

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('e-Faktur Pajak', marginX, y)
  pdf.setFontSize(11)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Sales Invoice #${invoice.number}`, pageWidth - marginX, y, { align: 'right' })

  y += 16
  pdf.setDrawColor(200)
  pdf.setLineWidth(0.75)
  pdf.line(marginX, y, pageWidth - marginX, y)
  y += 32

  const rows: [string, string][] = [
    ['Nomor faktur', formatTaxDocumentNumber(doc)],
    ['Tanggal faktur', doc.date],
    ['Customer', invoice.customer.name],
    ['Tahap pembayaran', doc.paymentStage === 'down-payment' ? 'Down payment' : 'Settlement'],
    ['Status DJP', 'Approved'],
  ]
  pdf.setFontSize(10)
  for (const [label, value] of rows) {
    pdf.setFont('helvetica', 'bold'); pdf.text(`${label}:`, marginX, y)
    pdf.setFont('helvetica', 'normal'); pdf.text(value, marginX + 120, y)
    y += 18
  }

  return pdf
}
