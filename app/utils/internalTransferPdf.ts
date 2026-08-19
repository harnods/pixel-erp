import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatIDR } from './currency'
import { formatDateTimeLong } from './date'
import { cashAccounts } from '~/data/cashAccounts'
import type { InternalTransfer } from '~/data/internalTransfers'

function accountLabel(id: string): string {
  const a = cashAccounts.find((c) => c.id === id)
  return a ? `${a.code} ${a.name}` : id
}

/** A4 document for an internal transfer — same title/rule/info-block/grid family
 *  as the other transaction PDFs. */
export function generateInternalTransferPdf(tr: InternalTransfer): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 40
  let y = 44

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18)
  doc.text('INTERNAL TRANSFER', marginX, y)
  doc.setFontSize(11); doc.setFont('helvetica', 'normal')
  doc.text(`#${String(tr.number).padStart(5, '0')}`, pageWidth - marginX, y, { align: 'right' })

  y += 16
  doc.setDrawColor(200); doc.setLineWidth(0.75)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 22

  const leftInfo: [string, string][] = [
    ['Transfer from', accountLabel(tr.fromAccountId)],
    ['Transaction date', formatDateTimeLong(tr.transactionDate)],
    ['Reference no.', tr.referenceNo || '-'],
  ]
  const rightInfo: [string, string][] = [
    ['Printed on', formatDateTimeLong(new Date().toISOString())],
    ['Total', formatIDR(tr.total)],
  ]
  doc.setFontSize(10)
  const rightX = pageWidth / 2 + 20
  let ly = y
  for (const [label, value] of leftInfo) {
    doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, marginX, ly)
    doc.setFont('helvetica', 'normal'); doc.text(value, marginX + 96, ly)
    ly += 16
  }
  let ry = y
  for (const [label, value] of rightInfo) {
    doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, rightX, ry)
    doc.setFont('helvetica', 'normal'); doc.text(value, rightX + 70, ry)
    ry += 16
  }
  y = Math.max(ly, ry) + 12

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Account', 'Description', 'Amount']],
    body: tr.lines.map((l) => [accountLabel(l.accountId), l.description || '-', formatIDR(l.amount)]),
    styles: { fontSize: 9, cellPadding: 6, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right', cellWidth: 120 } },
    margin: { left: marginX, right: marginX },
  })

  // @ts-expect-error lastAutoTable is attached by the plugin at runtime
  let finalY: number = (doc.lastAutoTable?.finalY ?? y) + 20
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text(`Total: ${formatIDR(tr.total)}`, pageWidth - marginX, finalY, { align: 'right' })

  if (tr.memo) {
    finalY += 24
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Memo', marginX, finalY)
    doc.setFont('helvetica', 'normal')
    doc.text(doc.splitTextToSize(tr.memo, pageWidth - marginX * 2), marginX, finalY + 14)
  }

  return doc
}
