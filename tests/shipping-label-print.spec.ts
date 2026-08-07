/**
 * Print Shipping Label (PRD Outbound D3 / D4 / D9) — the shared data logic behind
 * the Picking and Packing "Print Shipping Label" action.
 *
 *   - Which label prints: marketplace order → its SOURCE label (unavailable, i.e.
 *     button disabled, until the marketplace label arrives); ERP / Manual order →
 *     the WMS-generated label, always available.
 *   - D9 duplicate control: when the order's warehouse has preventDuplicateLabel
 *     = true, a 2nd print of the SAME label is blocked no matter whether the first
 *     print happened at the picking task or the packing task (shared registry).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { OutgoingOrder } from '~/data/outgoing'
import {
  shippingLabelInfo,
  resolveShippingLabelPrint,
  commitShippingLabelsPrinted,
  markLabelPrinted,
  resetPrintedLabels,
} from '~/data/shippingLabels'

// D9 warehouse setting is admin-configured; inject it directly (the real config
// store is a client-only localStorage layer that no-ops under vitest).
const DISALLOW = () => true
const ALLOW = () => false

const WH = 'wh-006', WH_NAME = 'Gudang Makassar Selatan'
let seq = 0

function order(source: string, shippingLabel?: string): OutgoingOrder {
  seq++
  return {
    id: `out-tst-${seq}`, number: `OUT-TST-${String(seq).padStart(4, '0')}`,
    salesNo: source === 'Sales Order' ? `Sales Order #${5000 + seq}` : `#SO${900 + seq}`,
    source, shippingLabel, warehouseId: WH, warehouseName: WH_NAME,
    skuQty: 1, orderQty: 1, shippedQty: 0, status: 'open', dueDate: '2026-08-01',
  } as OutgoingOrder
}
const mkt = (withLabel: boolean) => order('Shopee: Central Perk', withLabel ? `SPXID${1000 + seq}` : undefined)
const erp = () => order('Sales Order')

describe('Print Shipping Label — source vs WMS label + D9 duplicate control', () => {
  beforeEach(() => { resetPrintedLabels() })

  it('marketplace WITH source label → available (source label)', () => {
    const o = mkt(true)
    const info = shippingLabelInfo(o)
    expect(info.kind).toBe('source')
    expect(info.available).toBe(true)
    expect(info.code).toBe(o.shippingLabel)
  })

  it('marketplace WITHOUT source label → unavailable (Print disabled)', () => {
    const o = mkt(false)
    const info = shippingLabelInfo(o)
    expect(info.kind).toBe('source')
    expect(info.available).toBe(false)
    expect(resolveShippingLabelPrint([o])[0].status).toBe('unavailable')
  })

  it('ERP / non-marketplace → WMS-generated label, always available', () => {
    const o = erp()
    const info = shippingLabelInfo(o)
    expect(info.kind).toBe('wms')
    expect(info.available).toBe(true)
    expect(info.code).toBe(`SL-${o.number}`)
  })

  it('D9 Disallow: blocks the 2nd print of the same label (picking → packing)', () => {
    const o = mkt(true)
    const atPicking = resolveShippingLabelPrint([o], DISALLOW)
    expect(atPicking[0].status).toBe('ok')
    commitShippingLabelsPrinted(atPicking)                     // printed at the picking task
    const atPacking = resolveShippingLabelPrint([o], DISALLOW) // reprint attempt at packing
    expect(atPacking[0].status).toBe('duplicate')
  })

  it('D9 Allow: reprints are permitted', () => {
    const o = mkt(true)
    commitShippingLabelsPrinted(resolveShippingLabelPrint([o], ALLOW))
    expect(resolveShippingLabelPrint([o], ALLOW)[0].status).toBe('ok')
  })

  it('bulk resolve mixes ok / duplicate / unavailable', () => {
    const already = mkt(true); markLabelPrinted(shippingLabelInfo(already).code)
    const fresh = mkt(true)
    const waiting = mkt(false)
    const byId = Object.fromEntries(
      resolveShippingLabelPrint([already, fresh, waiting], DISALLOW).map((r) => [r.order.id, r.status]),
    )
    expect(byId[already.id]).toBe('duplicate')
    expect(byId[fresh.id]).toBe('ok')
    expect(byId[waiting.id]).toBe('unavailable')
  })
})
