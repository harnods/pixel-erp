import jsPDF from 'jspdf'
import type { OutgoingOrder } from '~/data/outgoing'
import { shippingLabelInfo, type ShipLabelInfo } from '~/data/shippingLabels'
import { customers } from '~/data/customers'
import { warehouses } from '~/data/warehouses'
import { orderSkuLines } from '~/data/inventory'
import { generateBarcodeDataUrl } from './barcode'

export interface ShippingLabelEntry {
  order: OutgoingOrder
  info: ShipLabelInfo
  /** carrier printed on the label */
  courier?: string
  /** this shipment's tracking / AWB — one label is one parcel is one tracking no. */
  trackingNo?: string
}

function toEntries(input: Array<ShippingLabelEntry | OutgoingOrder>): ShippingLabelEntry[] {
  return input.map((x) => ('order' in x ? x : { order: x, info: shippingLabelInfo(x) }))
}
function channelOf(source: string): string {
  const i = source.indexOf(':')
  return i >= 0 ? source.slice(0, i).trim() : source
}
/** Truncate to one line that fits `maxW` mm, adding an ellipsis when clipped. */
function fit(doc: jsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text
  let t = text
  while (t.length && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1)
  return t + '…'
}

/**
 * Shipping label — one order per page (bulk = multi-page). Sized as a 4×6 in.
 * thermal sticker (A6, 105×148 mm) that gets peeled and stuck on the parcel:
 * high-contrast black-on-white, no photos, a prominent SHIP-TO block, and a
 * scannable Code128 barcode of the tracking / AWB number. One shipment = one
 * parcel = one label = one tracking number.
 */
export async function generateShippingLabelPdf(
  input: Array<ShippingLabelEntry | OutgoingOrder>,
): Promise<jsPDF> {
  const entries = toEntries(input)
  const W = 105, H = 148, M = 5 // A6 portrait, mm
  const doc = new jsPDF({ unit: 'mm', format: [W, H] })
  const inner = { x: M, y: M, w: W - M * 2 }

  for (let i = 0; i < entries.length; i++) {
    const { order, info } = entries[i]!
    if (i > 0) doc.addPage([W, H], 'portrait')

    const customer = order.customerId ? customers.find((c) => c.id === order.customerId) : undefined
    const wh = warehouses.find((w) => w.id === order.warehouseId)
    const courier = entries[i]!.courier || '—'
    // For a marketplace order the AWB IS the source label code; for a WMS order the
    // tracking is the entered AWB (info.code is the internal SL-xxx label id).
    const tracking = (info.kind === 'source' ? info.code : entries[i]!.trackingNo) || ''
    const barcodeValue = tracking || info.code
    const lines = orderSkuLines(order)
    const totalQty = lines.reduce((s, l) => s + l.qty, 0)

    // Outer border.
    doc.setDrawColor(0); doc.setLineWidth(0.4)
    doc.rect(inner.x, inner.y, inner.w, H - M * 2)

    const L = inner.x + 3, R = W - M - 3 // text left / right
    let y = M + 5
    // ── Header: courier (large) + service — plain text, no ink-heavy fill ──────
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
    doc.text(fit(doc, courier.toUpperCase(), inner.w - 30), L, y)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal')
    doc.text(info.kind === 'source' ? channelOf(order.source).toUpperCase() : 'REGULAR', R, y, { align: 'right' })
    y += 2.5
    doc.setDrawColor(0); doc.setLineWidth(0.4); doc.line(inner.x, y, inner.x + inner.w, y)

    // ── FROM (small) ──────────────────────────────────────────────────────────
    y += 4.5
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(90)
    doc.text('FROM', L, y)
    doc.setTextColor(0); doc.setFontSize(8.5)
    doc.text(fit(doc, wh?.name ?? order.warehouseName ?? '-', inner.w - 16), L + 13, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(70)
    doc.text(fit(doc, wh?.address && wh.address !== '—' ? wh.address : '-', inner.w - 16), L + 13, y + 3.6)
    doc.setTextColor(0)
    y += 8

    // ── SHIP TO (prominent) ───────────────────────────────────────────────────
    doc.setLineWidth(0.3); doc.line(inner.x, y, inner.x + inner.w, y)
    y += 5
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(90)
    doc.text('SHIP TO', L, y)
    y += 5.5
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
    const name = doc.splitTextToSize(order.customer || customer?.name || '-', inner.w - 6)
    doc.text(name.slice(0, 2), L, y)
    y += name.slice(0, 2).length * 5.5
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    if (customer?.phone) { doc.text(customer.phone, L, y + 1); y += 5 }
    if (customer?.city) { doc.text(customer.city, L, y + 1); y += 5 }
    y += 3

    // ── Tracking ──────────────────────────────────────────────────────────────
    doc.setLineWidth(0.3); doc.line(inner.x, y, inner.x + inner.w, y)
    y += 4
    if (info.kind === 'source') {
      // Marketplace parcels ship on the channel's OWN label (its barcode/format) —
      // the WMS doesn't reprint it. Note where to get it + the resi for reference.
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text('Marketplace label', L, y + 4)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(70)
      doc.text(`Print from ${channelOf(order.source)} channel.`, L, y + 9)
      if (info.code) doc.text(`Resi: ${info.code}`, L, y + 13.5)
      doc.setTextColor(0)
      y += 16
    } else {
      // WMS label → scannable Code128 of the AWB; degrade to a bold text AWB when
      // the runtime can't render one (e.g. non-DOM/test env where the canvas yields
      // a blob: URL jsPDF can't embed) so the label always prints.
      let barcodeDrawn = false
      if (barcodeValue) {
        try {
          const png = await generateBarcodeDataUrl(barcodeValue, 'barcode')
          if (png.startsWith('data:image')) {
            const bw = inner.w - 16, bh = 17
            doc.addImage(png, 'PNG', inner.x + 8, y, bw, bh)
            y += bh + 1
            barcodeDrawn = true
          }
        } catch { /* fall through to text */ }
      }
      if (!barcodeDrawn) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(barcodeValue ? 13 : 10)
        doc.text(barcodeValue || 'NO TRACKING NUMBER', W / 2, y + 7, { align: 'center' })
        y += 12
      }
    }

    // ── Parcel contents: Product · SKU · Qty ──────────────────────────────────
    doc.setLineWidth(0.3); doc.line(inner.x, y, inner.x + inner.w, y)
    y += 4
    const skuX = inner.x + inner.w - 33, qtyX = R // column anchors
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(90)
    doc.text('PRODUCT', L, y)
    doc.text('SKU', skuX, y)
    doc.text('QTY', qtyX, y, { align: 'right' })
    doc.setTextColor(0)
    y += 1.5
    doc.setLineWidth(0.2); doc.line(inner.x, y, inner.x + inner.w, y)
    y += 3.6
    // Leave room for the total row + bottom margin; cap the list and note the rest.
    const totalRowY = H - M - 4
    const maxY = totalRowY - 8
    const rowH = 4
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
    let shown = 0
    for (const l of lines) {
      if (y + rowH > maxY && shown < lines.length) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(90)
        doc.text(`+ ${lines.length - shown} more SKU`, L, y)
        doc.setTextColor(0)
        break
      }
      doc.text(fit(doc, l.product.name, skuX - L - 2), L, y)
      doc.text(fit(doc, l.sku, qtyX - skuX - 8), skuX, y)
      doc.text(String(l.qty), qtyX, y, { align: 'right' })
      y += rowH
      shown++
    }

    // ── Total qty (bottom, bold) ──────────────────────────────────────────────
    doc.setLineWidth(0.3); doc.line(inner.x, totalRowY - 4.5, inner.x + inner.w, totalRowY - 4.5)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5)
    doc.text(order.number, L, totalRowY)
    doc.text(`${lines.length} SKU · Total ${totalQty} pcs`, R, totalRowY, { align: 'right' })
  }

  return doc
}
