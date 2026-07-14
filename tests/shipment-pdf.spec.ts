/**
 * generateShipmentPdf() builds a real, downloadable PDF document (jsPDF +
 * jspdf-autotable) — one row per delivery the shipment doc covers. Printed at
 * dispatch time (before the courier/customer confirms receipt), so it never
 * shows a "Date received"/"Received by" — those aren't known yet. These tests
 * can't practically inspect the rendered PDF's pixel content, so they verify the
 * thing actually at risk of breaking: the function runs without throwing.
 */
import { describe, it, expect } from 'vitest'
import { generateShipmentPdf, type ShipmentPdfInfo, type ShipmentPdfRow } from '~/utils/shipmentPdf'

const BASE_SHIPMENT: ShipmentPdfInfo = {
  shipmentNo: 'Shipment #70001',
  warehouseName: 'Gudang Makassar Selatan',
  assignee: 'Test Operator',
  courier: 'JNE',
}

const ROWS: ShipmentPdfRow[] = [
  { salesNo: 'SO-0001', packingTaskNo: 'Packing #40001', trackingNo: 'SD1234567', skuQty: 1, orderQty: 2, shippedQty: 2 },
  { salesNo: 'SO-0002', packingTaskNo: 'Packing #40002', trackingNo: 'SD1234568', skuQty: 2, orderQty: 3, shippedQty: 3 },
]

describe('generateShipmentPdf', () => {
  it('generates a PDF for a shipment without throwing', () => {
    expect(() => generateShipmentPdf(BASE_SHIPMENT, ROWS)).not.toThrow()
  })

  it('does not throw for a shipment with no delivery rows', () => {
    expect(() => generateShipmentPdf(BASE_SHIPMENT, [])).not.toThrow()
  })
})
