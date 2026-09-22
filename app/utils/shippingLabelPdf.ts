import jsPDF from 'jspdf'
import type { OutgoingOrder } from '~/data/outgoing'
import { shippingLabelInfo, type ShipLabelInfo } from '~/data/shippingLabels'
import { customers } from '~/data/customers'
import { orderSkuLines } from '~/data/inventory'
import { generateBarcodeDataUrl } from './barcode'

export interface ShippingLabelEntry {
  order: OutgoingOrder
  info: ShipLabelInfo
  /** carrier printed on the label */
  courier?: string
  /** this shipment's tracking / AWB — one label is one parcel is one tracking no. */
  trackingNo?: string
  /** which parcel of the order this label is for, when it ships as several */
  packageNo?: string
  /** what is IN this parcel — set for a per-package label, where the order's own
   *  lines would overstate a parcel that carries part of the order. */
  lines?: { sku: string; name: string; qty: number; unit: string }[]
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
 * Shipping label — 100 × 150 mm thermal sticker, one PARCEL per page.
 *
 * Laid out to the format Jurnal already prints (see "Shipping Labels - 22 orders",
 * 22 Sep 2026), measured off that PDF rather than re-imagined: 4 mm side margins,
 * a SHIPPING LABEL / order-no. header, a Source·Sales order·Customer·Address block,
 * the RESI barcode over its number, then ORDER ID with a Code128 + a QR captioned
 * SCAN RESI, the No·SKU·Product·Qty·Unit table, a totals line and a
 * Resi / Printed-on footer, separated by full-width hairlines.
 *
 * Two WMS-specific rows join the meta block — Courier and Package — because a WMS
 * parcel's label has to say who is carrying it, and an outbound that splits into
 * several parcels prints several labels that must be tellable apart.
 *
 * NO RESI YET: the whole RESI block collapses and ORDER ID moves up into it, the
 * same way the source PDF does it (page 2 there) — a label with an empty barcode
 * frame is worse than one without the frame.
 */
export async function generateShippingLabelPdf(
  input: Array<ShippingLabelEntry | OutgoingOrder>,
): Promise<jsPDF> {
  const entries = toEntries(input)
  const W = 100, H = 150, M = 4 // mm — the source label's own size and margin
  const doc = new jsPDF({ unit: 'mm', format: [W, H] })
  const L = M, R = W - M, innerW = W - M * 2
  const VALUE_X = 27 // where the meta block's values start

  const rule = (y: number) => {
    doc.setDrawColor(210); doc.setLineWidth(0.2); doc.line(L, y, R, y)
  }
  const metaRow = (y: number, label: string, value: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(0)
    doc.text(label, L, y)
    doc.setFont('helvetica', 'normal')
    doc.text(fit(doc, value || '-', R - VALUE_X), VALUE_X, y)
  }

  for (let i = 0; i < entries.length; i++) {
    const { order, info, packageNo } = entries[i]!
    if (i > 0) doc.addPage([W, H], 'portrait')

    const customer = order.customerId ? customers.find((c) => c.id === order.customerId) : undefined
    // For a marketplace order the AWB IS the source label code; for a WMS order it is
    // the AWB entered against this parcel (info.code is the internal SL-xxx id).
    const tracking = ((info.kind === 'source' ? info.code : entries[i]!.trackingNo) || '').trim()
    // A per-parcel label lists the parcel; an order-level one lists the order.
    const lines = entries[i]!.lines
      ?? orderSkuLines(order).map((l) => ({ sku: l.sku, name: l.product.name, qty: l.qty, unit: l.product.unit ?? '' }))
    const totalQty = lines.reduce((sum, l) => sum + l.qty, 0)

    // ── Header ────────────────────────────────────────────────────────────────
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
    doc.text('SHIPPING LABEL', L, 8.9)
    doc.setFontSize(11)
    doc.text(fit(doc, order.number, 45), R, 8.0, { align: 'right' })
    rule(12.6)

    // ── Who it is for, and who carries it ─────────────────────────────────────
    metaRow(16.0, 'Source', info.kind === 'source' ? `${channelOf(order.source)} order` : order.source)
    metaRow(20.0, 'Sales order', order.salesNo || '-')
    metaRow(24.0, 'Customer', order.customer || customer?.name || '-')
    metaRow(28.1, 'Address', customer?.city || '-')
    let y = 32.1
    if (entries[i]!.courier) { metaRow(y, 'Courier', entries[i]!.courier!); y += 4 }
    // One outbound, several parcels — each label says which parcel it belongs on.
    if (packageNo) { metaRow(y, 'Package', packageNo); y += 4 }
    rule(y - 2.2)

    // ── RESI / TRACKING NO. — barcode over its number ─────────────────────────
    if (tracking) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
      doc.text('RESI / TRACKING NO.', L, y + 1.2)
      const drew = await drawBarcode(doc, tracking, 15.5, y + 2.4, 69, 22.6)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      if (!drew) doc.text(tracking, W / 2, y + 14, { align: 'center' })
      doc.text(tracking, W / 2, y + 28.4, { align: 'center' })
      y += 30
      rule(y)
      y += 3.4
    } else {
      y += 1.2
    }

    // ── ORDER ID — Code128 + a QR to scan ─────────────────────────────────────
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    doc.text('ORDER ID', L, y)
    const orderBarcodeDrawn = await drawBarcode(doc, order.number, 11.7, y + 1.2, 46, 15.1)
    const qr = await tryQr(tracking || order.number)
    if (qr) doc.addImage(qr, 'PNG', 73.7, y + 0.6, 13.9, 13.9)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    if (!orderBarcodeDrawn) doc.text(order.number, 27.4, y + 10)
    doc.text(order.number, 27.4, y + 19.7)
    if (qr) {
      doc.setFontSize(7)
      doc.text(tracking ? 'SCAN RESI' : 'SCAN ORDER', 74, y + 20.3)
    }
    y += 21.3
    if (info.kind === 'source') {
      // A marketplace parcel ships on the channel's OWN sticker; this sheet is the
      // picking/packing copy, so say where the real label comes from.
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90)
      doc.text(`Marketplace label — print from the ${channelOf(order.source)} channel.`, L, y)
      doc.setTextColor(0)
      y += 3
    }
    rule(y)

    // ── Contents ──────────────────────────────────────────────────────────────
    const SKU_X = 11.7, PROD_X = 34.7, QTY_X = 76, UNIT_X = 88.4
    y += 2.9
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    doc.text('No', L, y); doc.text('SKU', SKU_X, y); doc.text('Product', PROD_X, y)
    doc.text('Qty', QTY_X, y, { align: 'right' }); doc.text('Unit', UNIT_X, y)
    y += 2.7
    rule(y)
    y += 4.5

    doc.setFont('helvetica', 'normal')
    const ROW_H = 5.6
    const MAX_Y = 128 // stop before the totals rule; the rest is summarised
    let shown = 0
    for (const l of lines) {
      if (y > MAX_Y - ROW_H && shown < lines.length - 1) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5)
        doc.text(`+ ${lines.length - shown} more SKU`, L, y)
        break
      }
      doc.text(String(shown + 1), L, y)
      doc.text(fit(doc, l.sku, PROD_X - SKU_X - 2), SKU_X, y)
      doc.text(fit(doc, l.name, QTY_X - PROD_X - 8), PROD_X, y)
      doc.text(String(l.qty), QTY_X, y, { align: 'right' })
      doc.text(fit(doc, l.unit, R - UNIT_X), UNIT_X, y)
      y += ROW_H
      shown++
    }

    // ── Totals + footer ───────────────────────────────────────────────────────
    rule(131.2)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0)
    doc.text(`Total SKU: ${lines.length} • Total Qty: ${totalQty}`, L, 134.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(tracking ? `Resi: ${tracking}` : 'Resi: -', L, 138.5)
    doc.setFontSize(7)
    doc.text(`Printed on: ${printedOn()}`, R, 138.5, { align: 'right' })
  }

  return doc
}

/** Code128 for `value`, or false when the runtime can't render one (non-DOM test
 *  env, where the canvas yields a blob: URL jsPDF can't embed) — the caller then
 *  falls back to plain text so a label always prints. */
async function drawBarcode(
  doc: jsPDF, value: string, x: number, y: number, w: number, h: number,
): Promise<boolean> {
  if (!value) return false
  try {
    const png = await generateBarcodeDataUrl(value, 'barcode')
    if (!png.startsWith('data:image')) return false
    doc.addImage(png, 'PNG', x, y, w, h)
    return true
  } catch { return false }
}

async function tryQr(value: string): Promise<string | undefined> {
  if (!value) return undefined
  try {
    const png = await generateBarcodeDataUrl(value, 'qrcode')
    return png.startsWith('data:image') ? png : undefined
  } catch { return undefined }
}

function printedOn(): string {
  const d = new Date()
  const month = d.toLocaleString('en-GB', { month: 'short' })
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${month} ${d.getFullYear()}, ${hh}:${mm}`
}
