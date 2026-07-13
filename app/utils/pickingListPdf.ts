import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PickingTask } from '~/data/pickingTasks'
import type { PickLineItem } from '~/data/pickingTaskDetails'
import { formatDateTimeLong } from './date'

/** One printable line — a plain SKU is one row; a batch/serial-tracked SKU expands
 *  to one row per batch/serial actually assigned to it, so the operator knows
 *  exactly where each unit sits, not just the SKU's total. */
interface PickingListRow {
  no: number
  sku: string
  product: string
  batchOrSerial: string
  bin: string
  qty: number
  unit: string
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function buildRows(lineItems: PickLineItem[]): PickingListRow[] {
  const rows: PickingListRow[] = []
  let no = 1
  for (const item of lineItems) {
    const batches = item.plannedBatchPicks?.length ? item.plannedBatchPicks : item.batchPicks
    const serials = item.plannedSerialPicks?.length ? item.plannedSerialPicks : item.serialPicks
    if (batches?.length) {
      for (const b of batches) {
        rows.push({ no: no++, sku: item.skuCode, product: item.productName, batchOrSerial: b.batchNo, bin: b.location || '-', qty: b.qty, unit: b.unit || item.unit })
      }
    } else if (serials?.length) {
      for (const s of serials) {
        rows.push({ no: no++, sku: item.skuCode, product: item.productName, batchOrSerial: s.serial, bin: s.location || '-', qty: 1, unit: item.unit })
      }
    } else {
      rows.push({ no: no++, sku: item.skuCode, product: item.productName, batchOrSerial: '-', bin: item.binLocation || '-', qty: item.expectedQty, unit: item.unit })
    }
  }
  return rows
}

/**
 * Generates and downloads a printable warehouse picking-list document — a real
 * document layout (title, task header, a batch/serial-expanded pick table,
 * totals, signature lines), not a screenshot/copy of the on-screen page.
 */
export function generatePickingListPdf(task: PickingTask, lineItems: PickLineItem[]): void {
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
    ['Status', capitalize(task.status)],
    ['Start date', formatDateTimeLong(task.startDate)],
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
  autoTable(doc, {
    startY: y,
    head: [['No.', 'SKU', 'Product', 'Batch/Serial no.', 'Bin location', 'Qty to pick', 'Unit']],
    body: rows.map((r) => [r.no, r.sku, r.product, r.batchOrSerial, r.bin, r.qty, r.unit]),
    styles: { fontSize: 9, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.5 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 28, halign: 'center' },
      1: { cellWidth: 60 },
      3: { cellWidth: 90 },
      5: { cellWidth: 60, halign: 'right' },
      6: { cellWidth: 50 },
    },
    margin: { left: marginX, right: marginX },
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

  doc.save(`Picking List - ${task.taskNo}.pdf`)
}
