import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PutAwayLineItem } from '~/data/putAwayTaskDetails'
import { formatDateTimeLong } from './date'
import { loadImagesByUrl } from './pdfImage'
import { drawCanceledRibbon } from './pdfRibbon'

/** One printable line — one row per SKU. No storage location (destination bin
 *  isn't decided yet at print time — that's picked during put-away itself, same
 *  as why the on-screen table only shows it once status !== "open"). */
interface PutAwaySlipRow {
  no: number
  sku: string
  product: string
  img: string
  receivingTaskNo: string
  qty: number
  unit: string
}

const PHOTO_COL_WIDTH = 48
const PHOTO_SIZE = 38
const PHOTO_ROW_HEIGHT = 46

function buildRows(lineItems: PutAwayLineItem[]): PutAwaySlipRow[] {
  return lineItems.map((item, i) => ({
    no: i + 1, sku: item.skuCode, product: item.productName, img: item.image,
    receivingTaskNo: item.receivingTaskNo, qty: item.qty, unit: item.unit,
  }))
}

/**
 * Builds a printable put-away-slip document — handed to the operator BEFORE
 * put-away starts, so it only shows what's expected (qty to put away from each
 * receiving task), never a live stored count or destination bin (neither is
 * decided/known until put-away is actually underway). Returns the jsPDF
 * instance for the caller to preview/save (doesn't save it itself).
 */
export async function generatePutAwaySlipPdf(
  task: { taskNo: string; warehouseName: string; assignee: string; status?: string },
  lineItems: PutAwayLineItem[],
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 40

  let y = 44
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('PUT-AWAY SLIP', marginX, y)
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
    head: [['No.', 'Photo', 'SKU', 'Product', 'Receiving task', 'Qty to put away', 'Unit']],
    body: rows.map((r) => [r.no, '', r.sku, r.product, r.receivingTaskNo, r.qty, r.unit]),
    styles: { fontSize: 9, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 28, halign: 'center' },
      1: { cellWidth: PHOTO_COL_WIDTH, minCellHeight: PHOTO_ROW_HEIGHT },
      2: { cellWidth: 60 },
      4: { cellWidth: 90 },
      5: { cellWidth: 80, halign: 'right' },
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

  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  // @ts-expect-error lastAutoTable is attached to the doc instance by the plugin at runtime
  let finalY: number = (doc.lastAutoTable?.finalY ?? y) + 24

  if (finalY + 90 > pageHeight - marginX) {
    doc.addPage()
    finalY = 44
  }

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`Total SKU: ${rows.length}     Total qty to put away: ${totalQty}`, marginX, finalY)

  const sigY = finalY + 56
  const sigWidth = 160
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.line(marginX, sigY, marginX + sigWidth, sigY)
  doc.text('Put away by', marginX, sigY + 14)
  doc.line(pageWidth - marginX - sigWidth, sigY, pageWidth - marginX, sigY)
  doc.text('Checked by', pageWidth - marginX - sigWidth, sigY + 14)

  if (task.status === 'canceled') drawCanceledRibbon(doc)

  return doc
}
