import jsPDF from 'jspdf'
import type { OutgoingOrder } from '~/data/outgoing'
import { shippingLabelInfo, type ShipLabelInfo } from '~/data/shippingLabels'
import { orderSkuLines } from '~/data/inventory'
import { generateBarcodeDataUrl } from './barcode'

export interface ShippingLabelEntry { order: OutgoingOrder; info: ShipLabelInfo }

function toEntries(input: Array<ShippingLabelEntry | OutgoingOrder>): ShippingLabelEntry[] {
  return input.map((x) => ('order' in x ? x : { order: x, info: shippingLabelInfo(x) }))
}

// "Shopee: Central Perk" → { channel: 'Shopee', store: 'Central Perk' }; ERP/manual → the source as channel.
function splitSource(source: string): { channel: string; store: string } {
  const i = source.indexOf(':')
  return i >= 0 ? { channel: source.slice(0, i).trim(), store: source.slice(i + 1).trim() } : { channel: source, store: source }
}
function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}
function hashNum(s: string): number { return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0) }

/**
 * Marketplace-style courier shipping label (one per page; bulk = multi-page).
 * Mirrors the usual marketplace label layout — sort code, resi barcode, recipient
 * / sender, weight / deadline / order no. + QR, and the SKU/area table — but with
 * our own wordmark instead of any marketplace/courier brand logo, filled from our
 * order data (source channel, resi = order.shippingLabel or the WMS label code).
 */
export async function generateShippingLabelPdf(
  input: Array<ShippingLabelEntry | OutgoingOrder>,
): Promise<jsPDF> {
  const entries = toEntries(input)
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' })
  const W = doc.internal.pageSize.getWidth()
  const M = 6
  const R = W - M
  const rect = (x: number, y: number, w: number, h: number) => { doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(x, y, w, h) }

  for (let i = 0; i < entries.length; i++) {
    if (i > 0) doc.addPage()
    const { order, info } = entries[i]
    const { channel, store } = splitSource(order.source)
    const lines = orderSkuLines(order)
    const totalQty = lines.reduce((s, l) => s + l.qty, 0)
    const resi = info.code || order.number
    const [resiBar, orderBar, qr] = await Promise.all([
      generateBarcodeDataUrl(resi, 'barcode').catch(() => ''),
      generateBarcodeDataUrl(order.number, 'barcode').catch(() => ''),
      generateBarcodeDataUrl(order.number, 'qrcode').catch(() => ''),
    ])
    let y = M

    // Repeated resi strip across the top (marketplace labels print it as a guide).
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(90)
    doc.text(`${resi}     ${resi}     ${resi}`, W / 2, y + 1, { align: 'center' })
    doc.setTextColor(0); y += 4

    const contentW = R - M
    // Header band: wordmark · service · channel
    const hH = 12; rect(M, y, contentW, hH)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    doc.text('MEKARI WMS', M + 3, y + 7)
    doc.setFontSize(16); doc.text('STD', W / 2, y + 8, { align: 'center' })
    doc.setFontSize(11); doc.text(info.kind === 'source' ? channel : 'WMS', R - 3, y + 7, { align: 'right' })
    y += hH

    // Sort row: big sort box | resi + barcode
    const sortH = 26, sortW = 40
    rect(M, y, sortW, sortH)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(22)
    const sortCode = `${String.fromCharCode(65 + (hashNum(order.number) % 26))}-${(hashNum(order.number) % 9) + 1}`
    doc.text(sortCode, M + sortW / 2, y + sortH / 2 + 3, { align: 'center' })
    const rx = M + sortW, rw = contentW - sortW
    rect(rx, y, rw, 8)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(`No. Resi: ${resi}`, rx + 2, y + 5.5)
    if (resiBar) doc.addImage(resiBar, 'PNG', rx + 2, y + 9, rw - 4, sortH - 11)
    y += sortH

    // Recipient / sender band
    const recH = 26; rect(M, y, contentW, recH)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold'); doc.text('Penerima:', M + 2, y + 5)
    doc.setFont('helvetica', 'normal'); doc.text(order.customer ?? '—', M + 22, y + 5)
    doc.setFont('helvetica', 'bold'); doc.text('Pengirim:', W / 2 + 4, y + 5)
    doc.setFont('helvetica', 'normal'); doc.text(info.kind === 'source' ? store : order.warehouseName, W / 2 + 24, y + 5)
    doc.setFontSize(8); doc.setTextColor(60)
    doc.text(doc.splitTextToSize('Alamat penerima — sync dari channel', W / 2 - M - 6), M + 2, y + 11)
    doc.text(order.warehouseName, W / 2 + 4, y + 11)
    doc.setTextColor(0); y += recH

    // Weight / COD / deadline / order no. + QR + order barcode
    const infoH = 30; rect(M, y, contentW, infoH)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold'); doc.text('Berat:', M + 2, y + 6)
    doc.setFont('helvetica', 'normal'); doc.text(`${totalQty * 200} gr`, M + 16, y + 6)
    doc.setFont('helvetica', 'bold'); doc.text('COD Cek Dulu:', W / 2 + 4, y + 6)
    doc.setFont('helvetica', 'normal'); doc.text('Tidak', W / 2 + 33, y + 6)
    doc.setFont('helvetica', 'bold'); doc.text('Batas Kirim:', M + 2, y + 12)
    doc.setFont('helvetica', 'normal'); doc.text(fmtDate(order.dueDate), M + 24, y + 12)
    doc.setFont('helvetica', 'bold'); doc.text('No. Pesanan:', M + 2, y + 18)
    doc.setFont('helvetica', 'normal'); doc.text(order.number, M + 27, y + 18)
    if (orderBar) doc.addImage(orderBar, 'PNG', M + 2, y + 20, 50, 8)
    if (qr) doc.addImage(qr, 'PNG', R - 26, y + 3, 24, 24)
    y += infoH

    // SKU / Area & Shelf / Qty table
    const thH = 6; rect(M, y, contentW, thH)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
    const cNo = M + 2, cSku = M + 12, cArea = W / 2 + 4, cQty = R - 10
    doc.text('#', cNo, y + 4); doc.text('SKU', cSku, y + 4); doc.text('Area & Shelf', cArea, y + 4); doc.text('Qty', cQty, y + 4)
    y += thH
    doc.setFont('helvetica', 'normal')
    lines.forEach((l, idx) => {
      const rowH = 7; rect(M, y, contentW, rowH)
      doc.text(String(idx + 1), cNo, y + 4.5)
      doc.text(doc.splitTextToSize(l.sku, cArea - cSku - 4), cSku, y + 4.5)
      doc.text('Default Picking Area', cArea, y + 4.5)
      doc.text(String(l.qty), cQty, y + 4.5)
      y += rowH
    })

    // Footer — store + total
    y += 2
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
    doc.text(`Store Name: ${info.kind === 'source' ? store : order.warehouseName}`, M + 2, y + 3)
    doc.text(`Total: ${totalQty}`, R - 2, y + 3, { align: 'right' })
  }

  return doc
}
