import { reactive } from 'vue'
import type { Bill } from './types'

// Company operating expenses (electricity, internet, water, rent, subscriptions,
// employee reimbursements, services). A healthy AP list: most bills are already
// PAID; only a few slipped past their due date and show as overdue.
// Overdue = still unpaid AND past due; everything else here is paid.
export const bills = reactive<Bill[]>([
  { id: 'BILL001', number: 1, beneficiary: { id: 'V006', name: 'CV Bersih Sejahtera' },          category: 'Services',      date: '2026-06-20', dueDate: '2026-07-04', total: 5_450_000,  balanceDue: 0,          status: 'paid',   tags: ['Recurring'], reconciled: true,
    memo: 'Monthly office cleaning & security service for HQ — approved by Finance Manager.',
    attachments: [
      { name: 'invoice-BILL001.pdf', sizeKB: 245.3 },
      { name: 'service-report-june.jpg', sizeKB: 512.8 },
    ],
    payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 5_450_000, paymentDate: '2026-07-03', reference: 'TRX-000112' },
    subtotal: 5_000_000,
    taxAmount: 550_000,
    withholding: { name: 'PPh 23 - Jasa', amount: 100_000, account: '2-20502 Withholding Tax Payable' },
    lineItems: [
      { account: '560 - Professional services', description: 'Daily office cleaning (June)', tax: 'PPN 11%', amount: 3_000_000 },
      { account: '560 - Professional services', description: 'Security guard service (June)', tax: 'PPN 11%', amount: 2_000_000 },
    ]},
  { id: 'BILL002', number: 2, beneficiary: { id: 'V001', name: 'PT PLN (Persero)' },             category: 'Utilities',     date: '2026-06-25', dueDate: '2026-07-08', total: 6_200_000,  balanceDue: 6_200_000,  status: 'unpaid'                          , lineItems: [{ account: '610 - Electricity', description: 'Electricity — June', tax: 'No tax', amount: 6_200_000 }]},
  { id: 'BILL003', number: 3, beneficiary: { id: 'V003', name: 'Biznet Networks' },              category: 'Internet',      date: '2026-06-26', dueDate: '2026-07-11', total: 2_200_000,  balanceDue: 0,          status: 'paid', reconciled: true, payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 2_200_000, paymentDate: '2026-07-09', reference: 'TRX-000116' } , lineItems: [{ account: '630 - Internet & telecom', description: 'Office internet 100 Mbps — June', tax: 'No tax', amount: 2_200_000 }]},
  { id: 'BILL004', number: 4, beneficiary: { id: 'V002', name: 'PT Telkom Indonesia' },          category: 'Internet',      date: '2026-06-22', dueDate: '2026-06-30', total: 1_450_000,  balanceDue: 0,          status: 'paid', reconciled: true, payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 1_450_000, paymentDate: '2026-06-28', reference: 'TRX-000114' } , lineItems: [{ account: '631 - Telephone', description: 'Office landline & fax — June', tax: 'No tax', amount: 1_450_000 }]},
  { id: 'BILL005', number: 5, beneficiary: { id: 'V004', name: 'PDAM Tirta Pakuan' },            category: 'Utilities',     date: '2026-06-24', dueDate: '2026-07-05', total: 620_000,    balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 620_000, paymentDate: '2026-07-02', reference: 'TRX-000115' } , lineItems: [{ account: '611 - Water', description: 'Water usage — June', tax: 'No tax', amount: 620_000 }]},
  { id: 'BILL006', number: 6, beneficiary: { id: 'V005', name: 'PT Graha Perkantoran Sudirman' },category: 'Rent',          date: '2026-06-20', dueDate: '2026-07-01', total: 28_000_000, balanceDue: 0,          status: 'paid', tags: ['Rent'], payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 28_000_000, paymentDate: '2026-06-30', reference: 'TRX-000110' } , lineItems: [{ account: '620 - Office rent', description: 'HQ office rent — July', tax: 'No tax', amount: 28_000_000 }]},
  { id: 'BILL007', number: 7, beneficiary: { id: 'V007', name: 'Toko ATK Sinar Jaya' },          category: 'Office supplies',date: '2026-06-26', dueDate: '2026-07-10', total: 1_850_000,  balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 1_850_000, paymentDate: '2026-07-01' } , lineItems: [{ account: '520 - Office supplies', description: 'A4 paper, pens, and printer toner', tax: 'No tax', amount: 1_850_000 }]},
  { id: 'BILL008', number: 8, beneficiary: { id: 'V008', name: 'Google Workspace' },             category: 'Software',      date: '2026-06-27', dueDate: '2026-07-05', total: 2_500_000,  balanceDue: 0,          status: 'paid', tags: ['Recurring'], payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 2_500_000, paymentDate: '2026-06-28' } , lineItems: [{ account: '485 - Subscriptions', description: 'Google Workspace — 25 seats', tax: 'No tax', amount: 2_500_000 }]},
  { id: 'BILL009', number: 9, beneficiary: { id: 'V009', name: 'Telkomsel' },                    category: 'Telephone',     date: '2026-06-28', dueDate: '2026-07-12', total: 1_100_000,  balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 1_100_000, paymentDate: '2026-07-05' } , lineItems: [{ account: '631 - Telephone', description: 'Corporate mobile plan — June', tax: 'No tax', amount: 1_100_000 }]},
  { id: 'BILL010', number: 10, beneficiary: { id: 'EMP01', name: 'Andi Wijaya' },                category: 'Reimbursement', date: '2026-06-29', dueDate: '2026-07-05', total: 1_800_000,  balanceDue: 1_800_000,  status: 'unpaid', tags: ['Reimbursement'], lineItems: [{ account: '550 - Employee reimbursement', description: 'Client visit — transport & meals', tax: 'No tax', amount: 1_800_000 }]},
  { id: 'BILL011', number: 11, beneficiary: { id: 'V010', name: 'PT Catering Nusantara' },        category: 'Meals',         date: '2026-06-30', dueDate: '2026-07-14', total: 2_100_000,  balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 2_100_000, paymentDate: '2026-07-07', reference: 'TRX-000121' } , lineItems: [{ account: '570 - Meals & entertainment', description: 'Team lunch catering — month-end', tax: 'No tax', amount: 2_100_000 }]},
  { id: 'BILL012', number: 12, beneficiary: { id: 'V001', name: 'PT PLN (Persero)' },             category: 'Utilities',     date: '2026-07-01', dueDate: '2026-07-15', total: 3_500_000,  balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 3_500_000, paymentDate: '2026-07-10', reference: 'TRX-000124' } , lineItems: [{ account: '610 - Electricity', description: 'Electricity — branch office', tax: 'No tax', amount: 3_500_000 }]},
  { id: 'BILL013', number: 13, beneficiary: { id: 'V002', name: 'PT Telkom Indonesia' },          category: 'Internet',      date: '2026-07-02', dueDate: '2026-07-16', total: 1_200_000,  balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 1_200_000, paymentDate: '2026-07-06', reference: 'TRX-000131' } , lineItems: [{ account: '630 - Internet & telecom', description: 'Branch internet — June', tax: 'No tax', amount: 1_200_000 }]},
  { id: 'BILL014', number: 14, beneficiary: { id: 'EMP02', name: 'Siti Rahmawati' },             category: 'Reimbursement', date: '2026-07-03', dueDate: '2026-07-17', total: 650_000,    balanceDue: 0,          status: 'paid', tags: ['Reimbursement'], payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 650_000, paymentDate: '2026-07-09' } , lineItems: [{ account: '550 - Employee reimbursement', description: 'Parking & toll — site inspection', tax: 'No tax', amount: 650_000 }]},
  { id: 'BILL015', number: 15, beneficiary: { id: 'V007', name: 'Toko ATK Sinar Jaya' },          category: 'Office supplies',date: '2026-07-04', dueDate: '2026-07-18', total: 2_900_000,  balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 2_900_000, paymentDate: '2026-07-08' } , lineItems: [{ account: '520 - Office supplies', description: 'Pantry & printing supplies restock', tax: 'No tax', amount: 2_900_000 }]},
  { id: 'BILL016', number: 16, beneficiary: { id: 'V001', name: 'PT PLN (Persero)' },             category: 'Utilities',     date: '2026-07-05', dueDate: '2026-07-19', total: 2_800_000,  balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 2_800_000, paymentDate: '2026-07-11', reference: 'TRX-000138' } , lineItems: [{ account: '610 - Electricity', description: 'Electricity — warehouse', tax: 'No tax', amount: 2_800_000 }]},
  { id: 'BILL017', number: 17, beneficiary: { id: 'V003', name: 'Biznet Networks' },              category: 'Internet',      date: '2026-07-06', dueDate: '2026-07-20', total: 2_200_000,  balanceDue: 0,          status: 'paid', tags: ['Recurring'], payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 2_200_000, paymentDate: '2026-07-13' } , lineItems: [{ account: '630 - Internet & telecom', description: 'Office internet 100 Mbps — July', tax: 'No tax', amount: 2_200_000 }]},
  { id: 'BILL018', number: 18, beneficiary: { id: 'V004', name: 'PDAM Tirta Pakuan' },            category: 'Utilities',     date: '2026-07-07', dueDate: '2026-07-21', total: 480_000,    balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 480_000, paymentDate: '2026-07-12' } , lineItems: [{ account: '611 - Water', description: 'Water usage — branch', tax: 'No tax', amount: 480_000 }]},
  { id: 'BILL019', number: 19, beneficiary: { id: 'EMP01', name: 'Andi Wijaya' },                category: 'Reimbursement', date: '2026-07-08', dueDate: '2026-07-22', total: 320_000,    balanceDue: 0,          status: 'paid', tags: ['Reimbursement'], payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 320_000, paymentDate: '2026-07-12', reference: 'TRX-000144' } , lineItems: [{ account: '550 - Employee reimbursement', description: 'Taxi — vendor meeting', tax: 'No tax', amount: 320_000 }]},
  { id: 'BILL020', number: 20, beneficiary: { id: 'V008', name: 'Google Workspace' },             category: 'Software',      date: '2026-07-09', dueDate: '2026-07-23', total: 2_500_000,  balanceDue: 0,          status: 'paid', tags: ['Recurring'], payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 2_500_000, paymentDate: '2026-07-14' } , lineItems: [{ account: '485 - Subscriptions', description: 'Google Workspace — 25 seats (July)', tax: 'No tax', amount: 2_500_000 }]},
  { id: 'BILL021', number: 21, beneficiary: { id: 'V006', name: 'CV Bersih Sejahtera' },          category: 'Services',      date: '2026-07-10', dueDate: '2026-07-13', total: 5_200_000,  balanceDue: 5_200_000,  status: 'unpaid'                          , lineItems: [{ account: '560 - Professional services', description: 'Office cleaning & security — July', tax: 'No tax', amount: 5_200_000 }]},
  { id: 'BILL022', number: 22, beneficiary: { id: 'V009', name: 'Telkomsel' },                    category: 'Telephone',     date: '2026-07-11', dueDate: '2026-07-25', total: 950_000,    balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 950_000, paymentDate: '2026-07-14' } , lineItems: [{ account: '631 - Telephone', description: 'Corporate mobile plan — July', tax: 'No tax', amount: 950_000 }]},
  { id: 'BILL023', number: 23, beneficiary: { id: 'V010', name: 'PT Catering Nusantara' },        category: 'Meals',         date: '2026-07-12', dueDate: '2026-07-26', total: 1_600_000,  balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10003 Bank BCA', amountPaid: 1_600_000, paymentDate: '2026-07-15', reference: 'TRX-000151' } , lineItems: [{ account: '570 - Meals & entertainment', description: 'Client meeting refreshments', tax: 'No tax', amount: 1_600_000 }]},
  { id: 'BILL024', number: 24, beneficiary: { id: 'V007', name: 'Toko ATK Sinar Jaya' },          category: 'Office supplies',date: '2026-07-13', dueDate: '2026-07-27', total: 850_000,    balanceDue: 0,          status: 'paid', payment: { paymentAccount: '1-10004 VISA 8265', amountPaid: 850_000, paymentDate: '2026-07-16' } , lineItems: [{ account: '520 - Office supplies', description: 'Stationery top-up', tax: 'No tax', amount: 850_000 }]},
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
