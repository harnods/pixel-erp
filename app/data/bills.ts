import { reactive } from 'vue'
import type { Bill } from './types'

// "Today" for demo purposes is 2026-07-15 — due dates before that are overdue,
// due dates after that are upcoming (still shown as unpaid, not overdue).
export const bills = reactive<Bill[]>([
  { id: 'BILL001', number: 1, beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  category: 'Office supplies', date: '2026-06-20', dueDate: '2026-07-04', total: 12_500_000, balanceDue: 0,           status: 'paid',   tags: ['Supplies'], reconciled: true },
  { id: 'BILL002', number: 2, beneficiary: { id: 'V002', name: 'CV Abadi Jaya Teknik' },        category: 'Equipment',       date: '2026-06-21', dueDate: '2026-07-25', total: 34_000_000, balanceDue: 34_000_000, status: 'unpaid'                          },
  { id: 'BILL003', number: 3, beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },      category: 'Utilities',       date: '2026-06-22', dueDate: '2026-07-01', total: 8_200_000,  balanceDue: 8_200_000,  status: 'unpaid'                          },
  { id: 'BILL004', number: 4, beneficiary: { id: 'V004', name: 'PT Karya Cipta Mandiri' },      category: 'Software',        date: '2026-06-23', dueDate: '2026-07-30', total: 15_800_000, balanceDue: 0,           status: 'paid', reconciled: true },
  { id: 'BILL005', number: 5, beneficiary: { id: 'V005', name: 'CV Berkah Utama Indonesia' },   category: 'Travel',          date: '2026-06-24', dueDate: '2026-06-30', total: 6_750_000,  balanceDue: 6_750_000,  status: 'unpaid', tags: ['Travel']       },
  { id: 'BILL006', number: 6, beneficiary: { id: 'V006', name: 'PT Teknindo Nusantara' },       category: 'Utilities',       date: '2026-06-25', dueDate: '2026-07-02', total: 21_000_000, balanceDue: 21_000_000, status: 'unpaid'                          },
  { id: 'BILL007', number: 7, beneficiary: { id: 'V007', name: 'PT Solusi Pratama Abadi' },     category: 'Marketing',       date: '2026-06-26', dueDate: '2026-07-28', total: 9_300_000,  balanceDue: 0,           status: 'paid',   tags: ['B2B']          },
  { id: 'BILL008', number: 8, beneficiary: { id: 'V008', name: 'CV Harapan Bangsa Jaya' },      category: 'Office supplies', date: '2026-06-27', dueDate: '2026-06-28', total: 4_500_000,  balanceDue: 4_500_000,  status: 'unpaid'                          },
  { id: 'BILL009', number: 9, beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },      category: 'Maintenance',     date: '2026-06-28', dueDate: '2026-07-18', total: 18_200_000, balanceDue: 0,           status: 'paid'                            },
  { id: 'BILL010', number: 10, beneficiary: { id: 'V009', name: 'PT Dinamika Usaha Bersama' },   category: 'Utilities',       date: '2026-06-29', dueDate: '2026-07-05', total: 3_400_000,  balanceDue: 3_400_000,  status: 'unpaid'                          },
  { id: 'BILL011', number: 11, beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  category: 'Equipment',       date: '2026-06-30', dueDate: '2026-08-02', total: 42_000_000, balanceDue: 42_000_000, status: 'unpaid', tags: ['Supplies', 'VIP'] },
  { id: 'BILL012', number: 12, beneficiary: { id: 'V010', name: 'CV Prima Sentosa Raya' },       category: 'Travel',          date: '2026-07-01', dueDate: '2026-07-10', total: 7_800_000,  balanceDue: 7_800_000,  status: 'unpaid'                          },
  { id: 'BILL013', number: 13, beneficiary: { id: 'V002', name: 'CV Abadi Jaya Teknik' },        category: 'Software',        date: '2026-07-02', dueDate: '2026-07-27', total: 5_200_000,  balanceDue: 0,           status: 'paid'                            },
  { id: 'BILL014', number: 14, beneficiary: { id: 'V005', name: 'CV Berkah Utama Indonesia' },   category: 'Marketing',       date: '2026-07-03', dueDate: '2026-08-01', total: 26_500_000, balanceDue: 26_500_000, status: 'unpaid'                          },
  { id: 'BILL015', number: 15, beneficiary: { id: 'V004', name: 'PT Karya Cipta Mandiri' },      category: 'Equipment',       date: '2026-07-04', dueDate: '2026-07-22', total: 68_000_000, balanceDue: 0,           status: 'paid',   tags: ['VIP']          },
  { id: 'BILL016', number: 16, beneficiary: { id: 'V006', name: 'PT Teknindo Nusantara' },       category: 'Maintenance',     date: '2026-07-05', dueDate: '2026-07-11', total: 11_100_000, balanceDue: 11_100_000, status: 'unpaid'                          },
  { id: 'BILL017', number: 17, beneficiary: { id: 'V007', name: 'PT Solusi Pratama Abadi' },     category: 'Office supplies', date: '2026-07-06', dueDate: '2026-08-05', total: 3_900_000,  balanceDue: 3_900_000,  status: 'unpaid', tags: ['B2B']          },
  { id: 'BILL018', number: 18, beneficiary: { id: 'V008', name: 'CV Harapan Bangsa Jaya' },      category: 'Utilities',       date: '2026-07-07', dueDate: '2026-06-27', total: 6_700_000,  balanceDue: 6_700_000,  status: 'unpaid'                          },
  { id: 'BILL019', number: 19, beneficiary: { id: 'V009', name: 'PT Dinamika Usaha Bersama' },   category: 'Travel',          date: '2026-07-08', dueDate: '2026-07-29', total: 14_300_000, balanceDue: 0,           status: 'paid'                            },
  { id: 'BILL020', number: 20, beneficiary: { id: 'V010', name: 'CV Prima Sentosa Raya' },       category: 'Software',        date: '2026-07-09', dueDate: '2026-08-08', total: 9_600_000,  balanceDue: 9_600_000,  status: 'unpaid', tags: ['VIP', 'B2B']   },
  { id: 'BILL021', number: 21, beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },      category: 'Marketing',       date: '2026-07-10', dueDate: '2026-07-13', total: 31_500_000, balanceDue: 31_500_000, status: 'unpaid'                          },
  { id: 'BILL022', number: 22, beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  category: 'Equipment',       date: '2026-07-11', dueDate: '2026-08-03', total: 5_100_000,  balanceDue: 0,           status: 'paid'                            },
  { id: 'BILL023', number: 23, beneficiary: { id: 'V006', name: 'PT Teknindo Nusantara' },       category: 'Maintenance',     date: '2026-07-12', dueDate: '2026-07-03', total: 17_800_000, balanceDue: 17_800_000, status: 'unpaid', tags: ['Retail']       },
  { id: 'BILL024', number: 24, beneficiary: { id: 'V004', name: 'PT Karya Cipta Mandiri' },      category: 'Office supplies', date: '2026-07-13', dueDate: '2026-08-04', total: 2_900_000,  balanceDue: 2_900_000,  status: 'unpaid'                          },
])

let billAddSeq = bills.length

/** Create a new expense/bill from the New expense form — prepends to the Bills list. */
export function addBill(data: Omit<Bill, 'id' | 'number'>): Bill {
  const n = ++billAddSeq
  const bill: Bill = { ...data, id: `BILL-NEW-${n}`, number: n }
  bills.unshift(bill)
  return bill
}
