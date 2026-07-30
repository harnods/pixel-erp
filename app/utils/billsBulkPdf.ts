import jsPDF from 'jspdf'
import type { Bill } from '~/data'

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
  }).format(amount).replace(/^(Rp)\s/, '$1')
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

/** One page per selected bill — same shape as the other generate*Pdf helpers, so
 *  bulk "Print PDF" can reuse PdfPreviewModal like every other print flow. */
export function generateBillsBulkPdf(selected: Bill[]): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 40

  selected.forEach((bill, i) => {
    if (i > 0) doc.addPage()
    let y = 44
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('EXPENSE', marginX, y)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'normal')
    doc.text(`Expense #${String(bill.number).padStart(5, '0')}`, pageWidth - marginX, y, { align: 'right' })

    y += 16
    doc.setDrawColor(200)
    doc.setLineWidth(0.75)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 32

    const rows: [string, string][] = [
      ['Beneficiary', bill.beneficiary.name],
      ['Category', bill.category],
      ['Date', formatDate(bill.date)],
      ['Due date', formatDate(bill.dueDate)],
      ['Status', bill.status],
      ['Total', formatIDR(bill.total)],
      ['Balance due', formatIDR(bill.balanceDue)],
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
