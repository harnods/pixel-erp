// ─── Shared ───────────────────────────────────────────────────────────────────

export type InvoiceStatus    = 'paid' | 'open' | 'overdue'
export type BillStatus       = 'open' | 'paid' | 'unpaid' | 'overdue' | 'draft'
/** 'bill' reviews as an Expense; 'invoice' as a Purchase invoice; 'receipt' as
 *  a Payment receipt; 'bank_statement' as a Cash management bank statement;
 *  'unclassified' gets the "Other documents" action list. */
export type FileClassification = 'bill' | 'invoice' | 'receipt' | 'bank_statement' | 'unclassified'
export type SalesOrderStatus = 'open' | 'partially processed' | 'closed' | 'voided'
export type SalesQuoteStatus = 'open' | 'closed' | 'declined'
/** Purchase request statuses mirror the sales-order set (same badge colours). */
export type PurchaseRequestStatus = 'open' | 'partially processed' | 'closed' | 'voided'
export type UrgencyLevel = 'low' | 'medium' | 'high'
export type ProductStatus    = 'active' | 'inactive'
export type ContactType      = 'company' | 'individual'

// Sales delivery — fulfillment + billing lifecycle
export type FulfillmentStatus = 'in transit' | 'direct' | 'delivered'
export type BillingStatus     = 'unbilled' | 'invoiced'

// WMS
export type WarehouseStatus = 'active' | 'archived'

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
  number: number                          // rendered as "Sales Invoice #40001"
  customer: Pick<Customer, 'id' | 'name'>
  date: string          // ISO date string
  dueDate: string
  total: number         // invoice total IDR
  balance: number       // remaining unpaid amount IDR (0 when fully paid)
  status: InvoiceStatus
  itemCount: number
  hasAttachment?: boolean
  tags?: string[]
  /** false for a small subset of invoices — those carry no PPN component at
   *  all, so "Create tax document" has nothing to document and is hidden. */
  hasPpn: boolean
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
  /** Source purchase order number, when the invoice was billed against one. */
  referenceNo?: string
  /** Real lines, set when the invoice was created through the form. Seeded
   *  invoices leave this undefined and the detail page synthesizes lines from the
   *  amount instead — same arrangement as `PurchaseOrder.lineItems`. */
  lineItems?: PurchaseOrderLine[]
}

export interface BillAttachment {
  name: string
  sizeKB: number
  /** object URL — only valid for the current session (not persisted) */
  url?: string
}

export interface BillLineItem {
  account: string
  description: string
  tax: string
  amount: number
  /** dimensionId -> selected value name (Settings > Dimensions line tagging). */
  dimensions?: Record<string, string>
}

/** Recorded when a bill is created already marked "I have paid this bill" —
 * a bill created unpaid has no payment until one is added later. */
export interface BillPayment {
  paymentAccount: string
  amountPaid: number
  paymentDate: string
  reference?: string
}

/** "Less: Withholding" deduction — see NewExpensePage's withholding rows. */
export interface BillWithholding {
  name: string
  amount: number
  account: string
}

export interface Bill {
  id: string
  number: number                            // rendered as "Expense #00001"
  beneficiary: { id: string; name: string } // customer or vendor
  category: string
  date: string
  dueDate: string
  total: number         // bill total IDR (after withholding deduction, if any)
  balanceDue: number    // remaining unpaid amount IDR (0 when fully paid)
  status: BillStatus
  tags?: string[]
  memo?: string
  attachments?: BillAttachment[]
  lineItems?: BillLineItem[]
  subtotal?: number
  taxAmount?: number
  /** true when line prices already include tax (tax is extracted from the total,
   * not added on top) — see NewExpensePage's "price includes tax" toggle. */
  priceIncludesTax?: boolean
  withholding?: BillWithholding
  /** only set when the bill was created (or later marked) as paid */
  payment?: BillPayment
  /** true once the payment has been matched against a bank transaction */
  reconciled?: boolean
}

export interface ReviewFile {
  id: string
  file: string                               // uploaded filename
  /** Document number as OCR read it off the file — format varies by document
   *  (invoice numbers, kwitansi numbers, etc. are never uniform), and it's
   *  absent when OCR couldn't extract one (typically unclassified files). */
  number?: string
  beneficiary: { id: string; name: string }  // customer or vendor
  confidence: number                         // AI extraction confidence, 0-100
  classification: FileClassification
  date: string
  amount: number
  /** true while OCR is still extracting this file's fields — only the
   *  filename is known yet, every other column renders a skeleton bar. */
  processing?: boolean
  /** false = uploaded but OCR hasn't run yet: only the filename is known, every
   *  other column is blank (no number/vendor/confidence/etc). Absent/true = the
   *  row's fields have been extracted. */
  scanned?: boolean
  /** true while the AI agent is actively OCR-ing this file (shows a spinner next
   *  to the filename). Cleared when scanning finishes (scanned → true). */
  scanning?: boolean
  /** When the file was uploaded (ISO) and by whom — surfaced in the Dropbox
   *  "Last updated" column. Absent on seed rows (fall back to lastUpdatedFor). */
  uploadedAt?: string
  uploadedBy?: string
}

/** A single stored sales invoice line: FKs to the invoice and to the product
 *  master (`Product.id` / `CatalogItem.id`) — name, SKU, unit, and price are
 *  never duplicated here, they're joined from the product record at read time. */
export interface SalesInvoiceLineItem {
  invoiceId: string        // FK -> SalesInvoice.id
  productId: string        // FK -> Product.id (CATALOG.id)
  qty: number
  discountPct: number      // 0 = none
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

/** A sales invoice line item, hydrated (joined against the product master) for display. */
export type SILineItem = SalesOrderItem & { taxLabel: string; dimensions?: Record<string, string> }

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

/** A requested line on a purchase request — the source rows a purchase order
 *  is built from (grouped by request in the PO form's accordion table). */
export interface PurchaseRequestLine {
  product: string
  sku: string
  description: string
  requestedQty: number
  availableQty: number      // on-hand stock available now
  unit: string
  unitCost: number          // IDR
  taxLabel: string
}

export interface PurchaseRequest {
  id: string
  number: number                          // rendered as "Purchase Request #90010"
  date: string                            // request date, ISO
  procurementStaff: string                // who raised the request (the "requestor")
  requiredDate: string                    // ISO — when the goods are needed
  status: PurchaseRequestStatus
  totalProducts: number                   // number of line items requested (= lines.length)
  urgency: UrgencyLevel
  tags?: string[]
  attachment?: boolean                    // has a supporting document attached
  awaitingApproval?: boolean              // sits in the "Awaiting approval" queue
  lines: PurchaseRequestLine[]            // requested products
  /**
   * Where the request delivers, when it was chosen on the form. Seeded requests
   * leave this undefined and the detail page picks a plausible one instead.
   * A dropship component request carries the SUBCON VENDOR's warehouse here —
   * those goods never reach a company site.
   */
  warehouse?: string
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

export interface WarehousePIC {
  id: string
  name: string
}

export interface Warehouse {
  id: string
  name: string
  code: string
  skuTotal: number
  pics: WarehousePIC[]
  address: string
  status: WarehouseStatus
  hasTransactions: boolean
  hasStorageLocations?: boolean
  isDefault?: boolean
  description?: string    // set on user-created / edited warehouses
  updatedAt: string       // ISO date string
  updatedBy: string       // person name
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

// Purchase Quote — the buy-side mirror of SalesQuote (vendor-keyed). Lightweight
// index record; the detail page synthesises coherent line items (purchaseQuoteDetails.ts).
export type PurchaseQuoteStatus = 'open' | 'closed' | 'declined'

export interface PurchaseQuote {
  id: string
  number: number                          // rendered as "Purchase Quote #30090"
  vendor: Pick<Vendor, 'id' | 'name'>
  date: string                            // quote date, ISO
  expirationDate: string                  // ISO
  status: PurchaseQuoteStatus
  total: number                           // quote total IDR
  tags?: string[]
}

// Purchase Delivery — the buy-side mirror of SalesDelivery (vendor-keyed).
export interface PurchaseDelivery {
  id: string
  number: number                          // rendered as "Purchase Delivery #30001"
  vendor: Pick<Vendor, 'id' | 'name'>
  date: string                            // delivery date, ISO
  fulfillmentStatus: FulfillmentStatus    // in transit | direct | delivered
  billingStatus: BillingStatus            // unbilled | invoiced
  total: number                           // delivery total IDR
  tags?: string[]
}

/** Mirrors `SubconPriceBasis` in subcon.ts; declared here to keep types.ts free
 *  of module imports. */
export type SubconPriceBasis = 'gross' | 'net'

export type PurchaseOrderStatus = 'open' | 'partially-processed' | 'awaiting invoice' | 'closed' | 'voided' | 'draft' | 'rejected' | 'approved'

export interface PurchaseOrder {
  id: string
  number: string
  vendor: Pick<Vendor, 'id' | 'name'>
  date: string
  dueDate: string
  total: number
  balance: number
  status: PurchaseOrderStatus
  itemCount: number
  hasAttachment?: boolean
  tags?: string[]
  /** Set when this order was created via "Duplicate" — id of the source order. */
  duplicatedFromId?: string
  /** Set via the form's "Send to fulfillment" action. */
  sentToFulfillment?: boolean
  /** Set when this order is rejected — drives the persistent rejection banner. */
  rejection?: { user: string; date: string; reason: string }
  /**
   * ISO date the order was approved. A durable fact rather than a reading of
   * `status`, which moves on afterwards (a delivery takes it to "awaiting
   * invoice", the invoice to "closed"). Subcon accounting recognises the
   * vendor's charge on approval, so it needs to know that approval happened at
   * all, not merely that the order is in the approved state right now.
   */
  approvedAt?: string
  /**
   * How this order's price relates to withholding tax. Defaults from the vendor
   * and is overridable per order — it is a commercial term of this purchase, not
   * a permanent property of the vendor. Absent on non-subcon orders.
   */
  priceBasis?: SubconPriceBasis
  /**
   * The order's real line items, set when the order was actually created through
   * the form (raised from purchase requests, or duplicated). Seeded orders leave
   * this undefined and the detail page synthesizes plausible lines from the
   * total instead — see `getPurchaseOrderDetail`. Without this a subcon order
   * raised from a service PR came back showing generic stock parts.
   */
  lineItems?: PurchaseOrderLine[]
}

/** One line of a purchase order. Mirrors the detail page's `POLineItem`. */
export interface PurchaseOrderLine {
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  discountPct: number
  taxLabel: string
  amount: number
  dimensions?: Record<string, string>
}
