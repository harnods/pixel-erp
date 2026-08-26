import type { Vendor } from './types'

/**
 * Vendor master — the single source of truth for who the coffee business BUYS
 * from. Purchase orders (`purchaseOrders.ts`) and vendor invoices/AP
 * (`purchaseInvoices.ts`) reference these by `id`, so a vendor id means the same
 * supplier everywhere (mirrors how `customers.ts` works on the sell side).
 *
 * Coverage matches what a roastery+wholesale actually procures: green-bean
 * importers & cooperatives, packaging, machines/equipment, logistics, and the
 * recurring operating suppliers (utilities, internet, rent, software).
 */
export const vendors: Vendor[] = [
  { id: 'V001', code: 'VND-001', name: 'Klasik Beans Cooperative',   type: 'company', email: 'sales@klasikbeans.coop',      phone: '022-5560001', city: 'Bandung',    payable: 0 },
  { id: 'V002', code: 'VND-002', name: 'Sagaleh Coffee Supply',      type: 'company', email: 'order@sagaleh.co.id',         phone: '0751-556002', city: 'Padang',     payable: 0 },
  { id: 'V003', code: 'VND-003', name: 'Gayo Highland Exporters',    type: 'company', email: 'export@gayohighland.com',      phone: '0643-556003', city: 'Takengon',   payable: 0 },
  { id: 'V004', code: 'VND-004', name: 'Toraja Sapan Estate',        type: 'company', email: 'estate@torajasapan.co.id',    phone: '0423-556004', city: 'Toraja',     payable: 0 },
  { id: 'V005', code: 'VND-005', name: 'Lampung Robusta Traders',    type: 'company', email: 'trade@lampungrobusta.com',    phone: '0721-556005', city: 'Lampung',    payable: 0 },
  { id: 'V006', code: 'VND-006', name: 'PT Kemasan Prima Nusantara', type: 'company', email: 'sales@kemasanprima.co.id',    phone: '021-5560006', city: 'Tangerang',  payable: 0 },
  { id: 'V007', code: 'VND-007', name: 'Roast Machinery Indonesia',  type: 'company', email: 'info@roastmachinery.id',      phone: '021-5560007', city: 'Jakarta',    payable: 0 },
  { id: 'V008', code: 'VND-008', name: 'CV Logistik Antar Pulau',    type: 'company', email: 'ops@logistikantarpulau.co.id', phone: '031-5560008', city: 'Surabaya',   payable: 0 },
  { id: 'V009', code: 'VND-009', name: 'PLN (Persero)',              type: 'company', email: 'corporate@pln.co.id',         phone: '123',         city: 'Jakarta',    payable: 0 },
  { id: 'V010', code: 'VND-010', name: 'Telkom Indonesia',           type: 'company', email: 'corporate@telkom.co.id',      phone: '147',         city: 'Jakarta',    payable: 0 },
  { id: 'V011', code: 'VND-011', name: 'PT Properti Sentosa',        type: 'company', email: 'lease@propertisentosa.co.id', phone: '021-5560011', city: 'Jakarta',    payable: 0 },
  { id: 'V012', code: 'VND-012', name: 'Cloud & Software Partners',  type: 'company', email: 'billing@cloudsw.id',          phone: '021-5560012', city: 'Jakarta',    payable: 0 },
]

/** Lookup a vendor by id (falls back to the first vendor). */
export function vendorById(id: string): Vendor {
  return vendors.find((v) => v.id === id) ?? vendors[0]!
}
