import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PackingTask } from '~/data/packingTasks'
import type { PackLineItem } from '~/data/packingTaskDetails'
import { formatDateTimeLong } from './date'
import { generateBarcodeDataUrl } from './barcode'
import { loadImagesByUrl } from './pdfImage'
import { drawCanceledRibbon } from './pdfRibbon'

/** One printable line — a plain SKU is one row; a batch/serial-tracked SKU expands
 *  to one row per batch/serial actually picked FOR THIS ORDER, so the operator
 *  sorting the mixed, multi-order picked pile knows exactly which physical units
 *  (which batch, which serial) belong to this order, not just the SKU and total. */
interface PackingListRow {
  no: number
  sku: string
  product: string
  img: string
  batchOrSerial: string
  qty: number
  unit: string
}

const PHOTO_COL_WIDTH = 48
const PHOTO_SIZE = 38
const PHOTO_ROW_HEIGHT = 46

function buildRows(lineItems: PackLineItem[]): PackingListRow[] {
  const rows: PackingListRow[] = []
  let no = 1
  for (const item of lineItems) {
    if (item.batchPicks?.length) {
      for (const b of item.batchPicks) {
        rows.push({ no: no++, sku: item.skuCode, product: item.productName, img: item.image, batchOrSerial: b.batchNo, qty: b.qty, unit: b.unit || item.unit })
      }
    } else if (item.serialPicks?.length) {
      for (const s of item.serialPicks) {
        rows.push({ no: no++, sku: item.skuCode, product: item.productName, img: item.image, batchOrSerial: s.serial, qty: 1, unit: item.unit })
      }
    } else {
      rows.push({ no: no++, sku: item.skuCode, product: item.productName, img: item.image, batchOrSerial: '-', qty: item.pickedQty, unit: item.unit })
    }
  }
  return rows
}

/**
 * Builds a printable packing-list document for ONE order (a packing task is
 * always scoped to a single sales order) — the sorting reference for "Match
 * order": which SKU/batch/serial, and how much of it, belongs to THIS order out
 * of the picking task's (possibly multi-order) mixed picked pile. Not a
 * screenshot/copy of the on-screen packing details page. Returns the jsPDF
 * instance for the caller to preview/save (doesn't save it itself).
 */
export async function generatePackingListPdf(
  task: PackingTask,
  lineItems: PackLineItem[],
  order?: { salesNo?: string; customer?: string; source?: string; courier?: string; trackingNo?: string },
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 40

  let y = 44
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('PACKING LIST', marginX, y)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(task.taskNo, pageWidth - marginX, y, { align: 'right' })

  const barcodeWidth = 200
  const barcodeHeight = 60
  const barcodeDataUrl = await generateBarcodeDataUrl(task.taskNo)
  doc.addImage(barcodeDataUrl, 'PNG', pageWidth - marginX - barcodeWidth, y + 10, barcodeWidth, barcodeHeight)

  y += 10 + barcodeHeight + 14
  doc.setDrawColor(200)
  doc.setLineWidth(0.75)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 22

  const leftInfo: [string, string][] = [
    ['Sales order', order?.salesNo || task.salesNo || '-'],
    ['Customer', order?.customer || '-'],
    ['Warehouse', task.warehouseName || '-'],
    ['Assignee', task.assignee || '-'],
  ]
  if (order?.courier) leftInfo.push(['Courier', order.courier])
  if (order?.trackingNo) leftInfo.push(['Tracking no.', order.trackingNo])
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
  y = Math.max(ly, ry) + 12

  const rows = buildRows(lineItems)
  const imagesByUrl = await loadImagesByUrl(rows.map((r) => r.img))
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['No.', 'Photo', 'SKU', 'Product', 'Batch/Serial no.', 'Qty to pack', 'Unit']],
    body: rows.map((r) => [r.no, '', r.sku, r.product, r.batchOrSerial, r.qty, r.unit]),
    styles: { fontSize: 9, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 28, halign: 'center' },
      1: { cellWidth: PHOTO_COL_WIDTH, minCellHeight: PHOTO_ROW_HEIGHT },
      2: { cellWidth: 60 },
      4: { cellWidth: 100 },
      5: { cellWidth: 70, halign: 'right' },
      6: { cellWidth: 50 },
    },
    margin: { left: marginX, right: marginX },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return
      const loaded = imagesByUrl.get(rows[data.row.index]?.img ?? '')
      if (!loaded) return
      const px = data.cell.x + (data.cell.width - PHOTO_SIZE) / 2
      const py = data.cell.y + (data.cell.height - PHOTO_SIZE) / 2
      doc.addImage(loaded.dataUrl, loaded.format, px, py, PHOTO_SIZE, PHOTO_SIZE)
    },
  })

  const totalQty = lineItems.reduce((s, it) => s + it.pickedQty, 0)
  // @ts-expect-error lastAutoTable is attached to the doc instance by the plugin at runtime
  let finalY: number = (doc.lastAutoTable?.finalY ?? y) + 24

  if (finalY + 90 > pageHeight - marginX) {
    doc.addPage()
    finalY = 44
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total SKU: ${lineItems.length}     Total qty to pack: ${totalQty}`, marginX, finalY)

  const sigY = finalY + 56
  const sigWidth = 160
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.line(marginX, sigY, marginX + sigWidth, sigY)
  doc.text('Packed by', marginX, sigY + 14)
  doc.line(pageWidth - marginX - sigWidth, sigY, pageWidth - marginX, sigY)
  doc.text('Checked by', pageWidth - marginX - sigWidth, sigY + 14)

  if (task.status === 'canceled') drawCanceledRibbon(doc)

  return doc
}
