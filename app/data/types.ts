// ─── Shared ───────────────────────────────────────────────────────────────────

export type InvoiceStatus    = 'paid' | 'open' | 'overdue'
export type SalesOrderStatus = 'open' | 'partially processed' | 'closed' | 'voided'
export type SalesQuoteStatus = 'open' | 'closed' | 'declined'
export type ProductStatus    = 'active' | 'inactive'
export type ContactType      = 'company' | 'individual'

// Sales delivery — fulfillment + billing lifecycle
export type FulfillmentStatus = 'in transit' | 'direct' | 'delivered'
export type BillingStatus     = 'unbilled' | 'invoiced'

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
  hasAttachment?: boolean
  tags?: string[]
}

export interface SalesOrderItem {
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitPrice: number       // IDR
  discountPct: number     // 0 = none
  amount: number          // qty * unitPrice, net of line discount (excl. tax)
}

export interface SalesOrder {
  id: string
  number: number                          // rendered as "Sales Order #10090"
  customer: Pick<Customer, 'id' | 'name'>
  date: string                            // order date, ISO
  dueDate: string                         // ISO
  status: SalesOrderStatus
  balanceDue: number                      // remaining IDR (0 when fully invoiced/paid)
  total: number                           // order total IDR — derived from items + tax + shipping
  tags?: string[]
  // line items + the inputs the totals are derived from (source of truth for the detail page)
  items: SalesOrderItem[]
  globalDiscount: number                  // IDR, order-level discount
  shippingFee: number                     // IDR
}

export interface SalesQuote {
  id: string
  number: number                          // rendered as "Sales Quote #20090"
  customer: Pick<Customer, 'id' | 'name'>
  date: string                            // quote date, ISO
  expirationDate: string                  // ISO
  status: SalesQuoteStatus
  total: number                           // quote total IDR
  tags?: string[]
}

export interface SalesDelivery {
  id: string
  number: number                          // rendered as "Sales Delivery #20001"
  customer: Pick<Customer, 'id' | 'name'>
  date: string                            // delivery date, ISO
  fulfillmentStatus: FulfillmentStatus    // in transit | direct | delivered
  billingStatus: BillingStatus            // unbilled | invoiced
  total: number                           // delivery total IDR
  tags?: string[]
}
