import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateTimeLong } from './date'

/** One printable line — one row per delivery the shipment doc covers. */
export interface ShipmentPdfRow {
  salesNo: string
  packingTaskNo: string
  trackingNo: string
  skuQty: number
  orderQty: number
  shippedQty: number
}

export interface ShipmentPdfInfo {
  shipmentNo: string
  warehouseName: string
  assignee: string
  /** a shipment doc is per courier (a batch is split into one shipment per courier) —
   *  shown as its own header above the table, not repeated on every row. */
  courier: string
}

/**
 * Builds a printable shipment document — every delivery the shipment doc covers
 * (all handed to the same courier in one batch), for the driver/courier to carry
 * alongside the goods. Not a screenshot/copy of the on-screen shipment details
 * page. Returns the jsPDF instance for the caller to preview/save (doesn't save
 * it itself).
 */
export function generateShipmentPdf(shipment: ShipmentPdfInfo, rows: ShipmentPdfRow[]): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 40

  let y = 44
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('SHIPMENT', marginX, y)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(shipment.shipmentNo, pageWidth - marginX, y, { align: 'right' })

  y += 16
  doc.setDrawColor(200)
  doc.setLineWidth(0.75)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 22

  const leftInfo: [string, string][] = [
    ['Warehouse', shipment.warehouseName || '-'],
    ['Assignee', shipment.assignee || '-'],
  ]
  const rightInfo: [string, string][] = [
    ['Printed on', formatDateTimeLong(new Date().toISOString())],
  ]

  doc.setFontSize(10)
  const rightX = pageWidth / 2 + 20
  let ly = y
  for (const [label, value] of leftInfo) {
    doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, marginX, ly)
    doc.setFont('helvetica', 'normal'); doc.text(value, marginX + 92, ly)
    ly += 16
  }
  let ry = y
  for (const [label, value] of rightInfo) {
    doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, rightX, ry)
    doc.setFont('helvetica', 'normal'); doc.text(value, rightX + 92, ry)
    ry += 16
  }
  y = Math.max(ly, ry) + 20

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`Courier: ${shipment.courier || '-'}`, marginX, y)
  y += 20

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['No.', 'Sales order no.', 'Packing no.', 'Tracking no.', 'SKU qty', 'Order qty']],
    body: rows.map((r, i) => [i + 1, r.salesNo, r.packingTaskNo, r.trackingNo, r.skuQty, r.orderQty]),
    styles: { fontSize: 9, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 26, halign: 'center' },
      4: { cellWidth: 60, halign: 'right' },
      5: { cellWidth: 70, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  })

  const totalShippedQty = rows.reduce((s, r) => s + r.shippedQty, 0)
  // @ts-expect-error lastAutoTable is attached to the doc instance by the plugin at runtime
  let finalY: number = (doc.lastAutoTable?.finalY ?? y) + 24

  if (finalY + 90 > pageHeight - marginX) {
    doc.addPage()
    finalY = 44
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total deliveries: ${rows.length}     Total shipped qty: ${totalShippedQty}`, marginX, finalY)

  const sigY = finalY + 56
  const sigWidth = 160
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.line(marginX, sigY, marginX + sigWidth, sigY)
  doc.text('Shipped by', marginX, sigY + 14)
  doc.line(pageWidth - marginX - sigWidth, sigY, pageWidth - marginX, sigY)
  doc.text('Received by', pageWidth - marginX - sigWidth, sigY + 14)

  return doc
}
