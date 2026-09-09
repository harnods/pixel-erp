/**
 * Prefill payload for the ERP "New sales order" / "New sales quote" forms when they
 * are embedded in a full-screen drawer from a CRM Deal (Deal → convert flow). The
 * forms accept a `prefill` prop of this shape and seed their fields from it; every
 * field stays editable. Dates are ISO here and converted to DD/MM/YYYY by the form.
 */
import type { Deal } from '~/data/crm'
import { lineSubtotal } from '~/data/crm'

export interface SalesFormPrefillItem {
  product: string
  sku?: string
  description?: string
  qty: number
  unit: string
  unitPrice: number
  discountPct?: number
  taxLabel?: string
}

export interface SalesFormPrefill {
  customerId?: string
  emails?: string[]
  billingAddress?: string
  shipTo?: string
  txDate?: string          // ISO
  dueDate?: string         // ISO
  shipDate?: string        // ISO
  shipVia?: string
  paymentTerms?: string
  trackingNo?: string
  referenceNo?: string
  warehouse?: string
  tags?: string[]
  shippingFee?: number
  globalDiscountType?: '%' | 'Rp'
  globalDiscountValue?: number
  priceIncludesTax?: boolean
  items?: SalesFormPrefillItem[]
}

/** Map a Deal to the sales order / quote prefill. The CRM and ERP customer masters
 *  share ids (C001…), so `customerId` maps straight through. Product lines use the
 *  Deal's own snapshots. `void lineSubtotal` keeps the import for downstream reuse. */
export function dealToSalesPrefill(d: Deal): SalesFormPrefill {
  void lineSubtotal
  return {
    customerId: d.customerId,
    emails: (d.contacts ?? []).map((c) => c.email).filter((e): e is string => !!e),
    billingAddress: d.billingAddress,
    shipTo: d.shipTo,
    txDate: d.transactionDate || d.createdAt,
    dueDate: d.expectedCloseDate,
    shipDate: d.shipDate,
    shipVia: d.shipVia,
    paymentTerms: d.paymentTerms,
    trackingNo: d.trackingNo,
    referenceNo: d.referenceNumber,
    warehouse: d.warehouse,
    tags: d.tags ? [...d.tags] : [],
    shippingFee: d.shippingFee,
    globalDiscountType: d.orderDiscountType === 'fixed' ? 'Rp' : '%',
    globalDiscountValue: d.orderDiscount ?? 0,
    items: (d.products ?? []).map((li) => ({
      product: li.productName,
      sku: li.sku,
      description: li.description,
      qty: li.quantity,
      unit: li.unit,
      unitPrice: li.originalPrice,
      discountPct: li.discountType === 'percentage' ? li.discount : 0,
      taxLabel: 'PPN 11%',
    })),
  }
}
