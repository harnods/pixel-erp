import { reactive } from 'vue'
import type { SalesInvoice } from './types'

export const salesInvoices = reactive<SalesInvoice[]>([
  { id: 'SI001', number: 40001, customer: { id: 'C009', name: 'PT Global Solusi Digital' },    date: '2025-04-01', dueDate: '2025-05-01', total: 48_500_000,  balance: 0,           status: 'paid',    itemCount: 3, hasPpn: true,  hasAttachment: true,  tags: ['VIP']         },
  { id: 'SI002', number: 40002, customer: { id: 'C014', name: 'PT Mega Konstruksi Utama' },    date: '2025-04-02', dueDate: '2025-05-02', total: 125_000_000, balance: 125_000_000, status: 'open',    itemCount: 8, hasPpn: true,  hasAttachment: false               },
  { id: 'SI003', number: 40003, customer: { id: 'C005', name: 'PT Cahaya Abadi Sentosa' },     date: '2025-04-03', dueDate: '2026-05-05', total: 23_750_000,  balance: 23_750_000,  status: 'overdue', itemCount: 2, hasPpn: false,  hasAttachment: false               },
  { id: 'SI004', number: 40004, customer: { id: 'C001', name: 'PT Maju Bersama Indonesia' },   date: '2025-04-05', dueDate: '2025-05-05', total: 15_200_000,  balance: 15_200_000,  status: 'open',    itemCount: 5, hasPpn: true,  hasAttachment: true                },
  { id: 'SI005', number: 40005, customer: { id: 'C012', name: 'PT Indah Persada Nusantara' },  date: '2025-04-07', dueDate: '2025-05-07', total: 67_000_000,  balance: 0,           status: 'paid',    itemCount: 4, hasPpn: true,  hasAttachment: false, tags: ['Retail'] },
  { id: 'SI006', number: 40006, customer: { id: 'C003', name: 'PT Teknologi Nusantara' },      date: '2025-04-08', dueDate: '2026-05-05', total: 8_900_000,   balance: 8_900_000,   status: 'overdue', itemCount: 1, hasPpn: true,  hasAttachment: false               },
  { id: 'SI007', number: 40007, customer: { id: 'C020', name: 'PT Bintang Timur Abadi' },      date: '2025-04-09', dueDate: '2025-05-09', total: 34_500_000,  balance: 34_500_000,  status: 'open',    itemCount: 6, hasPpn: true,  hasAttachment: true,  tags: ['B2B']   },
  { id: 'SI008', number: 40008, customer: { id: 'C007', name: 'PT Sinar Harapan Bangsa' },     date: '2025-04-10', dueDate: '2025-05-10', total: 12_000_000,  balance: 12_000_000,  status: 'open',    itemCount: 2, hasPpn: false,  hasAttachment: false               },
  { id: 'SI009', number: 40009, customer: { id: 'C016', name: 'PT Dharma Niaga Sejahtera' },   date: '2025-04-11', dueDate: '2025-05-11', total: 55_300_000,  balance: 55_300_000,  status: 'open',    itemCount: 7, hasPpn: true,  hasAttachment: true                },
  { id: 'SI010', number: 40010, customer: { id: 'C002', name: 'CV Sukses Makmur' },            date: '2025-04-12', dueDate: '2025-05-12', total: 7_650_000,   balance: 0,           status: 'paid',    itemCount: 3, hasPpn: true,  hasAttachment: false               },
  { id: 'SI011', number: 40011, customer: { id: 'C010', name: 'PT Anugrah Jaya Abadi' },       date: '2025-04-14', dueDate: '2025-05-14', total: 98_000_000,  balance: 98_000_000,  status: 'open',    itemCount: 9, hasPpn: true,  hasAttachment: false, tags: ['VIP']   },
  { id: 'SI012', number: 40012, customer: { id: 'C018', name: 'PT Kreasindo Media Cipta' },    date: '2025-04-15', dueDate: '2026-05-05', total: 11_200_000,  balance: 11_200_000,  status: 'overdue', itemCount: 2, hasPpn: true,  hasAttachment: true                },
  { id: 'SI013', number: 40013, customer: { id: 'C011', name: 'CV Berkah Bersama' },           date: '2025-04-16', dueDate: '2025-05-16', total: 5_500_000,   balance: 5_500_000,   status: 'open',    itemCount: 1, hasPpn: true,  hasAttachment: false               },
  { id: 'SI014', number: 40014, customer: { id: 'C004', name: 'Budi Santoso' },                date: '2025-04-17', dueDate: '2025-05-17', total: 3_200_000,   balance: 0,           status: 'paid',    itemCount: 2, hasPpn: false,  hasAttachment: false               },
  { id: 'SI015', number: 40015, customer: { id: 'C009', name: 'PT Global Solusi Digital' },    date: '2025-04-18', dueDate: '2025-05-18', total: 210_000_000, balance: 210_000_000, status: 'open',    itemCount: 12, hasPpn: true, hasAttachment: true,  tags: ['VIP']   },
  { id: 'SI016', number: 40016, customer: { id: 'C006', name: 'CV Karya Mandiri' },            date: '2025-04-19', dueDate: '2025-05-19', total: 6_800_000,   balance: 0,           status: 'paid',    itemCount: 2, hasPpn: true,  hasAttachment: false               },
  { id: 'SI017', number: 40017, customer: { id: 'C015', name: 'CV Putra Bangsa Mandiri' },     date: '2025-04-20', dueDate: '2025-05-20', total: 14_400_000,  balance: 14_400_000,  status: 'open',    itemCount: 4, hasPpn: true,  hasAttachment: false, tags: ['B2B']   },
  { id: 'SI018', number: 40018, customer: { id: 'C019', name: 'CV Mitra Usaha Bersama' },      date: '2025-04-21', dueDate: '2026-05-05', total: 9_000_000,   balance: 9_000_000,   status: 'overdue', itemCount: 3, hasPpn: false,  hasAttachment: false               },
  { id: 'SI019', number: 40019, customer: { id: 'C005', name: 'PT Cahaya Abadi Sentosa' },     date: '2025-04-22', dueDate: '2025-05-22', total: 78_500_000,  balance: 0,           status: 'paid',    itemCount: 6, hasPpn: true,  hasAttachment: true                },
  { id: 'SI020', number: 40020, customer: { id: 'C014', name: 'PT Mega Konstruksi Utama' },    date: '2025-04-23', dueDate: '2025-05-23', total: 320_000_000, balance: 320_000_000, status: 'open',    itemCount: 15, hasPpn: true, hasAttachment: false, tags: ['VIP', 'B2B'] },
  { id: 'SI021', number: 40021, customer: { id: 'C008', name: 'Dewi Rahayu' },                 date: '2025-04-23', dueDate: '2025-05-23', total: 1_500_000,   balance: 0,           status: 'paid',    itemCount: 1, hasPpn: true,  hasAttachment: false               },
  { id: 'SI022', number: 40022, customer: { id: 'C013', name: 'Ahmad Fauzi' },                 date: '2025-04-23', dueDate: '2025-05-23', total: 500_000,     balance: 500_000,     status: 'open',    itemCount: 1, hasPpn: false,  hasAttachment: false               },
  { id: 'SI023', number: 40023, customer: { id: 'C003', name: 'PT Teknologi Nusantara' },      date: '2025-04-24', dueDate: '2026-05-05', total: 44_000_000,  balance: 44_000_000,  status: 'overdue', itemCount: 5, hasPpn: true,  hasAttachment: true,  tags: ['Retail'] },
  { id: 'SI024', number: 40024, customer: { id: 'C001', name: 'PT Maju Bersama Indonesia' },   date: '2025-04-24', dueDate: '2025-05-24', total: 29_800_000,  balance: 29_800_000,  status: 'open',    itemCount: 4, hasPpn: true,  hasAttachment: false               },
  { id: 'SI025', number: 40025, customer: { id: 'C017', name: 'Siti Nurhaliza' },              date: '2025-04-24', dueDate: '2025-05-24', total: 2_200_000,   balance: 2_200_000,   status: 'paid',    itemCount: 2, hasPpn: true,  hasAttachment: false               },
])

/** Delete one or more sales invoices from the list (bulk or single). Returns the count actually removed. */
export function deleteSalesInvoices(ids: string[]): number {
  const idSet = new Set(ids)
  let removed = 0
  for (let i = salesInvoices.length - 1; i >= 0; i--) {
    if (idSet.has(salesInvoices[i]!.id)) {
      salesInvoices.splice(i, 1)
      removed++
    }
  }
  return removed
}
