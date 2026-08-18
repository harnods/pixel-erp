/**
 * Print Shipping Label — shared handler for the Picking and Packing flows
 * (PRD Outbound D3 / D4 / D9). Resolves which of the selected orders' labels can
 * print (marketplace source label vs WMS label; skips marketplace orders whose
 * label hasn't arrived), enforces the D9 duplicate control per warehouse, renders
 * the label PDF into a preview, marks the printed labels, and toasts what was
 * skipped. Used by the index rows, the bulk bar, and the task detail pages.
 *
 * Packing callers pass `requireCourier: true`: a non-marketplace order with no
 * courier yet is held back and surfaced via `courierModalOrders` so the page can
 * open the shipping-details modal; on save it re-prints those orders. Picking
 * callers omit it — courier is only assigned later, at handover.
 */
import { ref } from 'vue'
import type jsPDF from 'jspdf'
import { toast } from '@mekari/pixel3'
import { isMarketplaceOrder, type OutgoingOrder } from '~/data/outgoing'
import { resolveShippingLabelPrint, commitShippingLabelsPrinted, type ShipLabelInfo } from '~/data/shippingLabels'
import { setWmsShipping, wmsShippingForOrder, courierForOrder } from '~/data/deliveryTasks'
import { generateShippingLabelPdf, type ShippingLabelEntry } from '~/utils/shippingLabelPdf'

export interface ShippingDetailsInput { courier: string; trackingNo: string }

export function usePrintShippingLabel() {
  const pdfOpen = ref(false)
  const pdfDoc = ref<jsPDF | null>(null)
  const pdfFilename = ref('shipping-labels.pdf')

  // Shipping-details modal (missing courier at packing). Held here so the flow —
  // print → prompt → save → print — lives in one place; the page just renders the
  // modal bound to this state.
  const courierModalOpen = ref(false)
  const courierModalOrders = ref<OutgoingOrder[]>([])

  function entryFor(order: OutgoingOrder, info: ShipLabelInfo): ShippingLabelEntry {
    const ship = wmsShippingForOrder(order.id)
    return { order, info, courier: ship?.courier, trackingNo: ship?.trackingNo }
  }

  async function printShippingLabels(
    orders: OutgoingOrder[],
    opts: { requireCourier?: boolean } = {},
  ) {
    if (!orders.length) return
    const results = resolveShippingLabelPrint(orders)
    // Packing gate: a non-marketplace order with no courier yet is fixable inline —
    // reclassify it to 'missing-courier' so we prompt instead of print. A not-yet-
    // arrived marketplace label ('unavailable') takes precedence and is left as-is.
    if (opts.requireCourier) {
      for (const r of results) {
        if (r.status !== 'unavailable' && !isMarketplaceOrder(r.order) && !courierForOrder(r.order)) {
          r.status = 'missing-courier'
        }
      }
    }
    const ok = results.filter((r) => r.status === 'ok')
    const dup = results.filter((r) => r.status === 'duplicate')
    const unavailable = results.filter((r) => r.status === 'unavailable')
    const missingCourier = results.filter((r) => r.status === 'missing-courier')

    // Print whatever is printable now (the missing-courier ones are handled via the
    // modal below, so an all-ready bulk still prints in one go).
    if (ok.length) {
      pdfDoc.value = await generateShippingLabelPdf(ok.map((r) => entryFor(r.order, r.info)))
      pdfFilename.value = ok.length === 1
        ? `shipping-label-${ok[0].order.number}.pdf`
        : `shipping-labels-${ok.length}.pdf`
      pdfOpen.value = true
      commitShippingLabelsPrinted(ok)
    }

    // Non-marketplace orders with no courier yet → prompt for it, then re-print.
    if (missingCourier.length) {
      courierModalOrders.value = missingCourier.map((r) => r.order)
      courierModalOpen.value = true
    }

    if (!ok.length && !missingCourier.length) {
      // Nothing printable and nothing to fix — say why (most specific first).
      if (unavailable.length) {
        toast.notify({ variant: 'error', title: 'Waiting for marketplace shipping label — nothing to print', maxWidth: 'max-content' })
      } else if (dup.length) {
        toast.notify({ variant: 'error', title: 'Shipping label already printed (duplicate print not allowed)', maxWidth: 'max-content' })
      } else {
        toast.notify({ variant: 'error', title: 'No shipping label to print', maxWidth: 'max-content' })
      }
      return
    }

    // Surface anything skipped (no silent caps).
    if (dup.length) {
      toast.notify({ variant: 'warning', title: `${dup.length} label${dup.length > 1 ? 's' : ''} already printed — skipped (duplicate control)`, maxWidth: 'max-content' })
    }
    if (unavailable.length) {
      toast.notify({ variant: 'warning', title: `${unavailable.length} order${unavailable.length > 1 ? 's' : ''} still waiting for the marketplace shipping label — skipped`, maxWidth: 'max-content' })
    }
  }

  /** Modal "Save & print" — persist courier + tracking for each order, then print. */
  async function saveShippingDetailsAndPrint(details: Record<string, ShippingDetailsInput>) {
    const orders = courierModalOrders.value
    for (const order of orders) {
      const d = details[order.id]
      if (d) setWmsShipping(order.id, { courier: d.courier, trackingNo: d.trackingNo })
    }
    courierModalOpen.value = false
    courierModalOrders.value = []
    // Courier is on file now → these resolve to `ok` and print.
    await printShippingLabels(orders, { requireCourier: true })
  }

  function cancelShippingDetails() {
    courierModalOpen.value = false
    courierModalOrders.value = []
  }

  return {
    pdfOpen, pdfDoc, pdfFilename, printShippingLabels,
    courierModalOpen, courierModalOrders, saveShippingDetailsAndPrint, cancelShippingDetails,
  }
}
