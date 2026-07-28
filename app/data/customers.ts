import type { Customer } from './types'

/**
 * Customer master — the single source of truth for who the business sells to.
 *
 * This is a wholesale + retail **coffee** business, so the customers are real
 * coffee-industry accounts (roasteries, cafés, hotels, distributors). Both the
 * accounting sales orders (`salesOrders.ts`) and the WMS outbound dispatch
 * (`outgoing.ts`) reference these records by `id` — no module keeps its own
 * private customer list, so a customer id means the same company everywhere.
 */
export const customers: Customer[] = [
  { id: 'C001', code: 'CUST-001', name: 'Anomali Coffee',            type: 'company',    email: 'purchasing@anomalicoffee.com',   phone: '021-5550001', city: 'Jakarta',           balance: 45_000_000  },
  { id: 'C002', code: 'CUST-002', name: 'Tanamera Coffee Roastery',  type: 'company',    email: 'order@tanameracoffee.com',       phone: '021-5550002', city: 'Jakarta',           balance: 62_500_000  },
  { id: 'C003', code: 'CUST-003', name: 'Hotel Mulia Senayan',       type: 'company',    email: 'fnb@hotelmulia.com',             phone: '021-5550003', city: 'Jakarta',           balance: 78_000_000  },
  { id: 'C004', code: 'CUST-004', name: 'Fore Coffee Thamrin',       type: 'company',    email: 'supply@fore.coffee',             phone: '021-5550004', city: 'Jakarta',           balance: 33_200_000  },
  { id: 'C005', code: 'CUST-005', name: 'Djournal Coffee',           type: 'company',    email: 'procurement@djournalcoffee.com', phone: '021-5550005', city: 'Jakarta',           balance: 27_400_000  },
  { id: 'C006', code: 'CUST-006', name: 'Kopi Kenangan Pusat',       type: 'company',    email: 'buyer@kopikenangan.com',         phone: '021-5550006', city: 'Jakarta',           balance: 120_000_000 },
  { id: 'C007', code: 'CUST-007', name: 'Common Grounds PIK',        type: 'company',    email: 'store.pik@commongrounds.co.id',  phone: '021-5550007', city: 'Jakarta',           balance: 18_750_000  },
  { id: 'C008', code: 'CUST-008', name: 'Titik Temu Coffee',         type: 'company',    email: 'hello@titiktemu.co',             phone: '021-5550008', city: 'Jakarta',           balance: 9_500_000   },
  { id: 'C009', code: 'CUST-009', name: 'Maxx Coffee Lippo Mall',    type: 'company',    email: 'purchasing@maxxcoffee.com',      phone: '021-5550009', city: 'Tangerang',         balance: 55_000_000  },
  { id: 'C010', code: 'CUST-010', name: 'Janji Jiwa Kemang',         type: 'company',    email: 'supply@janjijiwa.com',           phone: '021-5550010', city: 'Jakarta',           balance: 41_200_000  },
  { id: 'C011', code: 'CUST-011', name: 'Tuku Coffee Cipete',        type: 'company',    email: 'order@tuku.coffee',              phone: '021-5550011', city: 'Jakarta',           balance: 22_000_000  },
  { id: 'C012', code: 'CUST-012', name: 'Coffee Cult Bali',          type: 'company',    email: 'buyer@coffeecult.id',            phone: '0361-555012', city: 'Bali',              balance: 14_800_000  },
  { id: 'C013', code: 'CUST-013', name: 'Excelso Grand Indonesia',   type: 'company',    email: 'purchasing@excelso.com',         phone: '021-5550013', city: 'Jakarta',           balance: 98_000_000  },
  { id: 'C014', code: 'CUST-014', name: 'GoWork Office Tower',       type: 'company',    email: 'pantry@gowork.co',               phone: '021-5550014', city: 'Jakarta',           balance: 6_400_000   },
  { id: 'C015', code: 'CUST-015', name: 'Distributor Sentra Boga',   type: 'company',    email: 'po@sentraboga.co.id',            phone: '021-5550015', city: 'Bekasi',            balance: 230_000_000 },
  { id: 'C016', code: 'CUST-016', name: 'Warung Kopi Modern',        type: 'individual', email: 'warkopmodern@gmail.com',         phone: '0812-000016', city: 'Bandung',           balance: 1_500_000   },
  { id: 'C017', code: 'CUST-017', name: 'Santika Premiere Hotel',    type: 'company',    email: 'fnb@santika.com',                phone: '024-5550017', city: 'Semarang',          balance: 44_000_000  },
  { id: 'C018', code: 'CUST-018', name: 'Kopi Nako Bintaro',         type: 'company',    email: 'order@kopinako.id',              phone: '021-5550018', city: 'Tangerang Selatan', balance: 12_300_000  },
  { id: 'C019', code: 'CUST-019', name: 'Retail Mart Segar',         type: 'company',    email: 'buyer@martsegar.co.id',          phone: '021-5550019', city: 'Depok',             balance: 8_900_000   },
  { id: 'C020', code: 'CUST-020', name: 'Toko Mesin Kopi Bandung',   type: 'company',    email: 'sales@mesinkopibdg.com',         phone: '022-5550020', city: 'Bandung',           balance: 16_700_000  },
  { id: 'C021', code: 'CUST-021', name: 'Resto Bumbu Desa',          type: 'company',    email: 'procurement@bumbudesa.co.id',    phone: '022-5550021', city: 'Bandung',           balance: 19_500_000  },
  { id: 'C022', code: 'CUST-022', name: 'Cafe Halaman Jogja',        type: 'company',    email: 'halaman@cafejogja.id',           phone: '0274-555022', city: 'Yogyakarta',        balance: 4_200_000   },
  { id: 'C023', code: 'CUST-023', name: 'Filosofi Kopi Melawai',     type: 'company',    email: 'order@filosofikopi.id',          phone: '021-5550023', city: 'Jakarta',           balance: 11_000_000  },
  { id: 'C024', code: 'CUST-024', name: 'One Eighty Coffee',         type: 'company',    email: 'supply@oneeighty.coffee',        phone: '022-5550024', city: 'Bandung',           balance: 26_300_000  },
  { id: 'C025', code: 'CUST-025', name: 'Pochi Coffee Roasters',     type: 'company',    email: 'roastery@pochicoffee.com',       phone: '031-5550025', city: 'Surabaya',          balance: 31_800_000  },
]

/** Fast id → customer lookup, so any module can resolve a customer FK. */
const byId = new Map(customers.map((c) => [c.id, c]))

/** Resolve a customer by id (FK helper). Returns undefined for unknown ids. */
export function getCustomer(id: string): Customer | undefined {
  return byId.get(id)
}

/** Resolve a customer's display name by id, with a safe fallback. */
export function customerName(id: string): string {
  return byId.get(id)?.name ?? id
}
