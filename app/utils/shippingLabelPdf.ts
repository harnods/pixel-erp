import jsPDF from 'jspdf'
import type { OutgoingOrder } from '~/data/outgoing'
import { shippingLabelInfo, type ShipLabelInfo } from '~/data/shippingLabels'
import { orderSkuLines } from '~/data/inventory'
import { generateBarcodeDataUrl } from './barcode'
import { formatDateTimeLong } from './date'

export interface ShippingLabelEntry {
  order: OutgoingOrder
  info: ShipLabelInfo
}

/** Normalize the caller input — accept either resolved entries or raw orders. */
function toEntries(input: Array<ShippingLabelEntry | OutgoingOrder>): ShippingLabelEntry[] {
  return input.map((x) =>
    'order' in x ? x : { order: x, info: shippingLabelInfo(x) },
  )
}

/**
 * One shipping label per page (bulk = multi-page). The label carries the source
 * channel, the recipient, the order no., a scannable barcode of the label code,
 * and the SKU/qty summary — a stand-in for the real source/WMS shipping label.
 */
export async function generateShippingLabelPdf(
  input: Array<ShippingLabelEntry | OutgoingOrder>,
): Promise<jsPDF> {
  const entries = toEntries(input)
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
  const W = doc.internal.pageSize.getWidth()
  const M = 12
  const printedAt = formatDateTimeLong(new Date().toISOString())

  for (let i = 0; i < entries.length; i++) {
    if (i > 0) doc.addPage()
    const { order, info } = entries[i]
    let y = M

    // Header — source channel + label kind badge
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    doc.text('SHIPPING LABEL', M, y)
    const badge = info.kind === 'source' ? 'SOURCE / MARKETPLACE' : 'WMS'
    doc.setFontSize(8); doc.setTextColor(120)
    doc.text(badge, W - M, y, { align: 'right' })
    doc.setTextColor(0)
    y += 4
    doc.setDrawColor(180); doc.setLineWidth(0.3); doc.line(M, y, W - M, y)
    y += 7

    // Channel / source
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text(`Channel: ${order.source}`, M, y); y += 6

    // Recipient
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120)
    doc.text('SHIP TO', M, y); doc.setTextColor(0); y += 5
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12)
    doc.text(order.customer ?? '—', M, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.text(`Warehouse: ${order.warehouseName}`, M, y); y += 8

    // Order + label codes
    doc.setFontSize(9)
    doc.text(`Order no.: ${order.number}`, M, y); y += 5
    doc.text(`Order ref: ${order.salesNo}`, M, y); y += 8

    // Barcode of the label code
    try {
      const bar = await generateBarcodeDataUrl(info.code || order.number, 'barcode')
      const bw = W - 2 * M, bh = 22
      doc.addImage(bar, 'PNG', M, y, bw, bh)
      y += bh + 2
    } catch { /* barcode render is best-effort */ }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text(info.code || order.number, W / 2, y, { align: 'center' }); y += 8

    // SKU / qty summary
    const lines = orderSkuLines(order)
    const totalQty = lines.reduce((s, l) => s + l.qty, 0)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    doc.setDrawColor(180); doc.line(M, y, W - M, y); y += 5
    doc.text(`SKU: ${lines.length}`, M, y)
    doc.text(`Total qty: ${totalQty}`, W - M, y, { align: 'right' }); y += 6

    // Footer
    doc.setFontSize(7); doc.setTextColor(150)
    doc.text(`Printed ${printedAt}`, M, doc.internal.pageSize.getHeight() - 8)
    doc.setTextColor(0)
  }

  return doc
}
