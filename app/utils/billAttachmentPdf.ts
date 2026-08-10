import jsPDF from 'jspdf'
import type { Bill, BillAttachment } from '~/data'
import { formatDateTimeLong } from './date'

/**
 * Attachments in this prototype carry no persisted binary (session-only object
 * URLs at best), so there's nothing real to render in an iframe. Builds a
 * one-page-per-file placeholder document instead — same shape as the other
 * generate*Pdf helpers — so the row's attachment icon can reuse PdfPreviewModal
 * like every other print-preview flow in the app.
 */
export function generateBillAttachmentPreviewPdf(bill: Pick<Bill, 'number' | 'beneficiary'>, attachments: BillAttachment[]): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 40

  attachments.forEach((a, i) => {
    if (i > 0) doc.addPage()
    let y = 44
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('ATTACHMENT', marginX, y)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(`Expense #${String(bill.number).padStart(5, '0')}`, pageWidth - marginX, y, { align: 'right' })

    y += 16
    doc.setDrawColor(200)
    doc.setLineWidth(0.75)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 32

    const rows: [string, string][] = [
      ['File name', a.name],
      ['File size', `${a.sizeKB.toFixed(1)} KB`],
      ['Beneficiary', bill.beneficiary.name],
      ['Viewed on', formatDateTimeLong(new Date().toISOString())],
    ]
    doc.setFontSize(10)
    for (const [label, value] of rows) {
      doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, marginX, y)
      doc.setFont('helvetica', 'normal'); doc.text(value, marginX + 92, y)
      y += 18
    }
  })

  return doc
}
