import { reactive } from 'vue'
import type { Bill } from './types'

// "Today" for demo purposes is 2026-07-15 — due dates before that are overdue,
// due dates after that are upcoming (still shown as unpaid, not overdue).
export const bills = reactive<Bill[]>([
  { id: 'BILL001', number: 1, beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  category: 'Office supplies', date: '2026-06-20', dueDate: '2026-07-04', total: 12_500_000, balanceDue: 0,           status: 'paid',   tags: ['Supplies'], reconciled: true,
    memo: 'Q3 office supplies restock for the HQ pantry and printing station — approved by Finance Manager.',
    attachments: [
      { name: 'invoice-BILL001.pdf', sizeKB: 245.3 },
      { name: 'receipt-office-supplies.jpg', sizeKB: 512.8 },
    ],
    payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 12_500_000, paymentDate: '2026-07-03', reference: 'TRX-000112' },
    subtotal: 12_000_000,
    taxAmount: 900_000,
    withholding: { name: 'PPh 23 - Jasa', amount: 400_000, account: '2-20502 Withholding Tax Payable' },
    lineItems: [
      { account: '520 - Office supplies', description: 'A4 paper, ballpoint pens, and folders', tax: 'PPN 10%', amount: 5_000_000 },
      { account: '520 - Office supplies', description: 'Printer toner cartridges', tax: 'PPN 10%', amount: 4_000_000 },
      { account: '710 - Equipment', description: 'Wireless keyboard and mouse set', tax: 'No tax', amount: 3_000_000 },
    ]},
  { id: 'BILL002', number: 2, beneficiary: { id: 'V002', name: 'CV Abadi Jaya Teknik' },        category: 'Equipment',       date: '2026-06-21', dueDate: '2026-07-25', total: 34_000_000, balanceDue: 34_000_000, status: 'unpaid'                          , lineItems: [{ account: '710 - Equipment', description: '', tax: 'No tax', amount: 34000000 }]},
  { id: 'BILL003', number: 3, beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },      category: 'Utilities',       date: '2026-06-22', dueDate: '2026-07-01', total: 8_200_000,  balanceDue: 8_200_000,  status: 'unpaid'                          , lineItems: [{ account: '610 - Utilities', description: '', tax: 'No tax', amount: 8200000 }]},
  { id: 'BILL004', number: 4, beneficiary: { id: 'V004', name: 'PT Karya Cipta Mandiri' },      category: 'Software',        date: '2026-06-23', dueDate: '2026-07-30', total: 15_800_000, balanceDue: 0,           status: 'paid', reconciled: true, payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 15_800_000, paymentDate: '2026-06-27' } , lineItems: [{ account: '485 - Subscriptions', description: '', tax: 'No tax', amount: 15800000 }]},
  { id: 'BILL005', number: 5, beneficiary: { id: 'V005', name: 'CV Berkah Utama Indonesia' },   category: 'Travel',          date: '2026-06-24', dueDate: '2026-06-30', total: 6_750_000,  balanceDue: 6_750_000,  status: 'unpaid', tags: ['Travel']       , lineItems: [{ account: '540 - Travel', description: '', tax: 'No tax', amount: 6750000 }]},
  { id: 'BILL006', number: 6, beneficiary: { id: 'V006', name: 'PT Teknindo Nusantara' },       category: 'Utilities',       date: '2026-06-25', dueDate: '2026-07-02', total: 21_000_000, balanceDue: 21_000_000, status: 'unpaid'                          , lineItems: [{ account: '610 - Utilities', description: '', tax: 'No tax', amount: 21000000 }]},
  { id: 'BILL007', number: 7, beneficiary: { id: 'V007', name: 'PT Solusi Pratama Abadi' },     category: 'Marketing',       date: '2026-06-26', dueDate: '2026-07-28', total: 9_300_000,  balanceDue: 0,           status: 'paid',   tags: ['B2B'], payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 9_300_000, paymentDate: '2026-06-30', reference: 'TRX-000119' } , lineItems: [{ account: '810 - Marketing', description: '', tax: 'No tax', amount: 9300000 }]},
  { id: 'BILL008', number: 8, beneficiary: { id: 'V008', name: 'CV Harapan Bangsa Jaya' },      category: 'Office supplies', date: '2026-06-27', dueDate: '2026-06-28', total: 4_500_000,  balanceDue: 4_500_000,  status: 'unpaid'                          , lineItems: [{ account: '520 - Office supplies', description: '', tax: 'No tax', amount: 4500000 }]},
  { id: 'BILL009', number: 9, beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },      category: 'Maintenance',     date: '2026-06-28', dueDate: '2026-07-18', total: 18_200_000, balanceDue: 0,           status: 'paid', payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 18_200_000, paymentDate: '2026-07-02' } , lineItems: [{ account: 'Maintenance', description: '', tax: 'No tax', amount: 18200000 }]},
  { id: 'BILL010', number: 10, beneficiary: { id: 'V009', name: 'PT Dinamika Usaha Bersama' },   category: 'Utilities',       date: '2026-06-29', dueDate: '2026-07-05', total: 3_400_000,  balanceDue: 3_400_000,  status: 'unpaid'                          , lineItems: [{ account: '610 - Utilities', description: '', tax: 'No tax', amount: 3400000 }]},
  { id: 'BILL011', number: 11, beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  category: 'Equipment',       date: '2026-06-30', dueDate: '2026-08-02', total: 42_000_000, balanceDue: 42_000_000, status: 'unpaid', tags: ['Supplies', 'VIP'] , lineItems: [{ account: '710 - Equipment', description: '', tax: 'No tax', amount: 42000000 }]},
  { id: 'BILL012', number: 12, beneficiary: { id: 'V010', name: 'CV Prima Sentosa Raya' },       category: 'Travel',          date: '2026-07-01', dueDate: '2026-07-10', total: 7_800_000,  balanceDue: 7_800_000,  status: 'unpaid'                          , lineItems: [{ account: '540 - Travel', description: '', tax: 'No tax', amount: 7800000 }]},
  { id: 'BILL013', number: 13, beneficiary: { id: 'V002', name: 'CV Abadi Jaya Teknik' },        category: 'Software',        date: '2026-07-02', dueDate: '2026-07-27', total: 5_200_000,  balanceDue: 0,           status: 'paid', payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 5_200_000, paymentDate: '2026-07-06', reference: 'TRX-000131' } , lineItems: [{ account: '485 - Subscriptions', description: '', tax: 'No tax', amount: 5200000 }]},
  { id: 'BILL014', number: 14, beneficiary: { id: 'V005', name: 'CV Berkah Utama Indonesia' },   category: 'Marketing',       date: '2026-07-03', dueDate: '2026-08-01', total: 26_500_000, balanceDue: 26_500_000, status: 'unpaid'                          , lineItems: [{ account: '810 - Marketing', description: '', tax: 'No tax', amount: 26500000 }]},
  { id: 'BILL015', number: 15, beneficiary: { id: 'V004', name: 'PT Karya Cipta Mandiri' },      category: 'Equipment',       date: '2026-07-04', dueDate: '2026-07-22', total: 68_000_000, balanceDue: 0,           status: 'paid',   tags: ['VIP'], payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 68_000_000, paymentDate: '2026-07-08' } , lineItems: [{ account: '710 - Equipment', description: '', tax: 'No tax', amount: 68000000 }]},
  { id: 'BILL016', number: 16, beneficiary: { id: 'V006', name: 'PT Teknindo Nusantara' },       category: 'Maintenance',     date: '2026-07-05', dueDate: '2026-07-11', total: 11_100_000, balanceDue: 11_100_000, status: 'unpaid'                          , lineItems: [{ account: 'Maintenance', description: '', tax: 'No tax', amount: 11100000 }]},
  { id: 'BILL017', number: 17, beneficiary: { id: 'V007', name: 'PT Solusi Pratama Abadi' },     category: 'Office supplies', date: '2026-07-06', dueDate: '2026-08-05', total: 3_900_000,  balanceDue: 3_900_000,  status: 'unpaid', tags: ['B2B']          , lineItems: [{ account: '520 - Office supplies', description: '', tax: 'No tax', amount: 3900000 }]},
  { id: 'BILL018', number: 18, beneficiary: { id: 'V008', name: 'CV Harapan Bangsa Jaya' },      category: 'Utilities',       date: '2026-07-07', dueDate: '2026-06-27', total: 6_700_000,  balanceDue: 6_700_000,  status: 'unpaid'                          , lineItems: [{ account: '610 - Utilities', description: '', tax: 'No tax', amount: 6700000 }]},
  { id: 'BILL019', number: 19, beneficiary: { id: 'V009', name: 'PT Dinamika Usaha Bersama' },   category: 'Travel',          date: '2026-07-08', dueDate: '2026-07-29', total: 14_300_000, balanceDue: 0,           status: 'paid', payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 14_300_000, paymentDate: '2026-07-12', reference: 'TRX-000144' } , lineItems: [{ account: '540 - Travel', description: '', tax: 'No tax', amount: 14300000 }]},
  { id: 'BILL020', number: 20, beneficiary: { id: 'V010', name: 'CV Prima Sentosa Raya' },       category: 'Software',        date: '2026-07-09', dueDate: '2026-08-08', total: 9_600_000,  balanceDue: 9_600_000,  status: 'unpaid', tags: ['VIP', 'B2B']   , lineItems: [{ account: '485 - Subscriptions', description: '', tax: 'No tax', amount: 9600000 }]},
  { id: 'BILL021', number: 21, beneficiary: { id: 'V003', name: 'PT Mitra Global Solusi' },      category: 'Marketing',       date: '2026-07-10', dueDate: '2026-07-13', total: 31_500_000, balanceDue: 31_500_000, status: 'unpaid'                          , lineItems: [{ account: '810 - Marketing', description: '', tax: 'No tax', amount: 31500000 }]},
  { id: 'BILL022', number: 22, beneficiary: { id: 'V001', name: 'PT Sumber Makmur Sejahtera' },  category: 'Equipment',       date: '2026-07-11', dueDate: '2026-08-03', total: 5_100_000,  balanceDue: 0,           status: 'paid', payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 5_100_000, paymentDate: '2026-07-14' } , lineItems: [{ account: '710 - Equipment', description: '', tax: 'No tax', amount: 5100000 }]},
  { id: 'BILL023', number: 23, beneficiary: { id: 'V006', name: 'PT Teknindo Nusantara' },       category: 'Maintenance',     date: '2026-07-12', dueDate: '2026-07-03', total: 17_800_000, balanceDue: 17_800_000, status: 'unpaid', tags: ['Retail']       , lineItems: [{ account: 'Maintenance', description: '', tax: 'No tax', amount: 17800000 }]},
  { id: 'BILL024', number: 24, beneficiary: { id: 'V004', name: 'PT Karya Cipta Mandiri' },      category: 'Office supplies', date: '2026-07-13', dueDate: '2026-08-04', total: 2_900_000,  balanceDue: 2_900_000,  status: 'unpaid'                          , lineItems: [{ account: '520 - Office supplies', description: '', tax: 'No tax', amount: 2900000 }]},
])

let billAddSeq = bills.length

/** Create a new expense/bill from the New expense form — prepends to the Bills list. */
export function addBill(data: Omit<Bill, 'id' | 'number'>): Bill {
  const n = ++billAddSeq
  const bill: Bill = { ...data, id: `BILL-NEW-${n}`, number: n }
  bills.unshift(bill)
  return bill
}

/** Duplicate an existing bill — every field carries over exactly as-is (status,
 * payment, reconciled included) except id/number, which addBill assigns fresh.
 * structuredClone() throws on Vue's reactive Proxy, so deep-clone via JSON instead —
 * safe here since Bill is plain JSON-shaped data (no Dates/functions). */
export function duplicateBill(id: string): Bill | null {
  const source = bills.find((b) => b.id === id)
  if (!source) return null
  const { id: _id, number: _number, ...rest } = JSON.parse(JSON.stringify(source)) as Bill
  return addBill(rest)
}

/** Approve a draft (awaiting-approval) bill — moves it into the normal unpaid lifecycle. */
export function approveBill(id: string): void {
  const bill = bills.find((b) => b.id === id)
  if (bill && bill.status === 'draft') bill.status = 'unpaid'
}

/** Delete one or more bills from the list (bulk or single). Returns the count actually removed. */
export function deleteBills(ids: string[]): number {
  const idSet = new Set(ids)
  let removed = 0
  for (let i = bills.length - 1; i >= 0; i--) {
    if (idSet.has(bills[i]!.id)) {
      bills.splice(i, 1)
      removed++
    }
  }
  return removed
}
