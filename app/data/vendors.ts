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
  { id: 'V013', code: 'VND-013', name: 'Flores Manggarai Arabica',   type: 'company', email: 'sales@floresmanggarai.co.id', phone: '0385-556013', city: 'Ruteng',     payable: 0 },
  { id: 'V014', code: 'VND-014', name: 'Kintamani Bali Coffee',      type: 'company', email: 'order@kintamanicoffee.com',   phone: '0366-556014', city: 'Bangli',     payable: 0 },
  { id: 'V015', code: 'VND-015', name: 'Wamena Papua Highlands',     type: 'company', email: 'highland@wamenacoffee.co.id', phone: '0969-556015', city: 'Wamena',     payable: 0 },
  { id: 'V016', code: 'VND-016', name: 'Bajawa Ngada Cooperative',   type: 'company', email: 'coop@bajawangada.org',        phone: '0384-556016', city: 'Bajawa',     payable: 0 },
  { id: 'V017', code: 'VND-017', name: 'Temanggung Java Estate',     type: 'company', email: 'estate@temanggung.co.id',     phone: '0293-556017', city: 'Temanggung', payable: 0 },
  { id: 'V018', code: 'VND-018', name: 'Enrekang Kalosi Traders',    type: 'company', email: 'trade@kalositraders.co.id',   phone: '0420-556018', city: 'Enrekang',   payable: 0 },
  { id: 'V019', code: 'VND-019', name: 'Simalungun Sidikalang Mill', type: 'company', email: 'mill@sidikalangcoffee.com',   phone: '0631-556019', city: 'Sidikalang', payable: 0 },
  { id: 'V020', code: 'VND-020', name: 'Bengkulu Rejang Lebong',     type: 'company', email: 'farm@rejanglebong.co.id',     phone: '0732-556020', city: 'Bengkulu',   payable: 0 },
  { id: 'V021', code: 'VND-021', name: 'PT Pallet & Crate Indonesia', type: 'company', email: 'sales@palletcrate.co.id',   phone: '021-5560021', city: 'Bekasi',     payable: 0 },
  { id: 'V022', code: 'VND-022', name: 'Jaya Label & Sticker',       type: 'company', email: 'info@jayalabel.co.id',        phone: '021-5560022', city: 'Jakarta',    payable: 0 },
  { id: 'V023', code: 'VND-023', name: 'CV Alat Ukur Presisi',       type: 'company', email: 'order@alatukur.co.id',        phone: '031-5560023', city: 'Surabaya',   payable: 0 },
  { id: 'V024', code: 'VND-024', name: 'Nusantara Freight Services',  type: 'company', email: 'booking@nusfreight.co.id',   phone: '021-5560024', city: 'Jakarta',    payable: 0 },
  { id: 'V025', code: 'VND-025', name: 'PT Fumigasi Mandiri',        type: 'company', email: 'service@fumigasi.co.id',      phone: '021-5560025', city: 'Tangerang',  payable: 0 },
  { id: 'V026', code: 'VND-026', name: 'Indo Water Treatment',       type: 'company', email: 'sales@indowater.co.id',       phone: '021-5560026', city: 'Jakarta',    payable: 0 },
  { id: 'V027', code: 'VND-027', name: 'Sampoerna Cleaning Supply',  type: 'company', email: 'order@sampoernaclean.co.id',  phone: '031-5560027', city: 'Surabaya',   payable: 0 },
  { id: 'V028', code: 'VND-028', name: 'Budi Jaya Safety Equipment', type: 'individual', email: 'budi@jayasafety.co.id',    phone: '021-5560028', city: 'Jakarta',    payable: 0 },
  { id: 'V029', code: 'VND-029', name: 'Ibu Ratna Catering',         type: 'individual', email: 'ratna.catering@gmail.com', phone: '0812-5560029', city: 'Bandung',   payable: 0 },
  { id: 'V030', code: 'VND-030', name: 'Dian Pest Control',          type: 'individual', email: 'dian.pestcontrol@gmail.com', phone: '0813-5560030', city: 'Bogor',   payable: 0 },
]

/** Lookup a vendor by id (falls back to the first vendor). */
export function vendorById(id: string): Vendor {
  return vendors.find((v) => v.id === id) ?? vendors[0]!
}
