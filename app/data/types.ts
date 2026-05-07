// ─── Shared ───────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'paid' | 'open' | 'overdue'
export type ProductStatus = 'active' | 'inactive'
export type ContactType   = 'company' | 'individual'

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Customer {
  id: string
  code: string
  name: string
  type: ContactType
  email: string
  phone: string
  city: string
  balance: number
}

export interface Vendor {
  id: string
  code: string
  name: string
  type: ContactType
  email: string
  phone: string
  city: string
  payable: number
}

export interface Product {
  id: string
  code: string
  name: string
  category: string
  unit: string
  price: number
  stock: number
  status: ProductStatus
}

export interface SalesInvoice {
  id: string
  number: string
  customer: Pick<Customer, 'id' | 'name'>
  date: string          // ISO date string
  dueDate: string
  total: number         // invoice total IDR
  balance: number       // remaining unpaid amount IDR (0 when fully paid)
  status: InvoiceStatus
  itemCount: number
  hasAttachment?: boolean
  tags?: string[]
}

export interface PurchaseInvoice {
  id: string
  number: string
  vendor: Pick<Vendor, 'id' | 'name'>
  date: string
  dueDate: string
  amount: number
  status: InvoiceStatus
  itemCount: number
}
