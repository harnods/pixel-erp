import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PickingTask, PickingBatchPick, PickingSerialPick } from '~/data/pickingTasks'
import { formatDateTimeLong } from './date'
import { loadImagesByUrl } from './pdfImage'
import { drawCanceledRibbon } from './pdfRibbon'

/** Minimal shape this module actually needs — satisfied by both a raw per-order
 *  PickLineItem and a SKU-merged PickGroupItem, so a caller printing a task that
 *  bundles the same SKU across 2+ orders can pass the merged rows (one SKU, one
 *  combined qty) instead of duplicate-looking per-order rows. */
export interface PickingListPrintItem {
  skuCode: string
  productName: string
  image: string
  binLocation: string
  expectedQty: number
  unit: string
  batchPicks?: PickingBatchPick[]
  serialPicks?: PickingSerialPick[]
  plannedBatchPicks?: PickingBatchPick[]
  plannedSerialPicks?: PickingSerialPick[]
}

/** One printable line per SKU — a batch/serial-tracked SKU still lists every
 *  batch/serial actually assigned to it (so the operator knows exactly where
 *  each unit sits), but as multiple lines within that SAME row's Batch/Serial
 *  no. and Bin location cells, not as separate rows — Total SKU already counts
 *  it once, so the table shouldn't visually split it into 2+ rows. */
export interface PickingListRow {
  no: number
  sku: string
  product: string
  img: string
  batchOrSerial: string
  bin: string
  qty: number
  unit: string
}

const PHOTO_COL_WIDTH = 48
const PHOTO_SIZE = 38
const PHOTO_ROW_HEIGHT = 46

/** Exported so tests can assert row-count/merge behavior directly — the printed
 *  PDF's own pixel content isn't practically inspectable, but this is the exact
 *  data the table renders from, one array entry per printed row. */
export function buildRows(lineItems: PickingListPrintItem[]): PickingListRow[] {
  const rows: PickingListRow[] = []
  let no = 1
  for (const item of lineItems) {
    const batches = item.plannedBatchPicks?.length ? item.plannedBatchPicks : item.batchPicks
    const serials = item.plannedSerialPicks?.length ? item.plannedSerialPicks : item.serialPicks
    if (batches?.length) {
      rows.push({
        no: no++, sku: item.skuCode, product: item.productName, img: item.image,
        batchOrSerial: batches.map((b) => b.batchNo).join('\n'),
        bin: [...new Set(batches.map((b) => b.location || '-'))].join('\n'),
        qty: batches.reduce((s, b) => s + b.qty, 0),
        unit: batches[0]?.unit || item.unit,
      })
    } else if (serials?.length) {
      rows.push({
        no: no++, sku: item.skuCode, product: item.productName, img: item.image,
        batchOrSerial: serials.map((s) => s.serial).join('\n'),
        bin: [...new Set(serials.map((s) => s.location || '-'))].join('\n'),
        qty: serials.length,
        unit: item.unit,
      })
    } else {
      rows.push({ no: no++, sku: item.skuCode, product: item.productName, img: item.image, batchOrSerial: '-', bin: item.binLocation || '-', qty: item.expectedQty, unit: item.unit })
    }
  }
  return rows
}

/**
 * Builds a printable warehouse picking-list document — a real document layout
 * (title, task header, a batch/serial-expanded pick table, totals, signature
 * lines), not a screenshot/copy of the on-screen page. Returns the jsPDF instance
 * for the caller to preview/save (doesn't save it itself).
 */
export async function generatePickingListPdf(task: PickingTask, lineItems: PickingListPrintItem[]): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 40

  let y = 44
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('PICKING LIST', marginX, y)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(task.taskNo, pageWidth - marginX, y, { align: 'right' })

  y += 16
  doc.setDrawColor(200)
  doc.setLineWidth(0.75)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 22

  const leftInfo: [string, string][] = [
    ['Warehouse', task.warehouseName || '-'],
    ['Assignee', task.assignee || '-'],
    ['Sales order(s)', task.salesNos.join(', ') || '-'],
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
  y = Math.max(ly, ry) + 12

  const rows = buildRows(lineItems)
  const imagesByUrl = await loadImagesByUrl(rows.map((r) => r.img))
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['No.', 'Photo', 'SKU', 'Product', 'Batch/Serial no.', 'Bin location', 'Qty to pick', 'Unit']],
    body: rows.map((r) => [r.no, '', r.sku, r.product, r.batchOrSerial, r.bin, r.qty, r.unit]),
    styles: { fontSize: 9, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 28, halign: 'center' },
      1: { cellWidth: PHOTO_COL_WIDTH, minCellHeight: PHOTO_ROW_HEIGHT },
      2: { cellWidth: 60 },
      4: { cellWidth: 90 },
      6: { cellWidth: 60, halign: 'right' },
      7: { cellWidth: 50 },
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

  const totalQty = lineItems.reduce((s, it) => s + it.expectedQty, 0)
  // @ts-expect-error lastAutoTable is attached to the doc instance by the plugin at runtime
  let finalY: number = (doc.lastAutoTable?.finalY ?? y) + 24

  if (finalY + 90 > pageHeight - marginX) {
    doc.addPage()
    finalY = 44
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total SKU: ${lineItems.length}     Total qty to pick: ${totalQty}`, marginX, finalY)

  const sigY = finalY + 56
  const sigWidth = 160
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.line(marginX, sigY, marginX + sigWidth, sigY)
  doc.text('Picked by', marginX, sigY + 14)
  doc.line(pageWidth - marginX - sigWidth, sigY, pageWidth - marginX, sigY)
  doc.text('Checked by', pageWidth - marginX - sigWidth, sigY + 14)

  if (task.status === 'canceled') drawCanceledRibbon(doc)

  return doc
}
