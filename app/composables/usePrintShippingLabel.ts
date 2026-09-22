/**
 * Print Shipping Label — shared handler for the Picking and Packing flows
 * (PRD Outbound D3 / D4 / D9). Resolves which of the selected orders' labels can
 * print (marketplace source label vs WMS label; skips marketplace orders whose
 * label hasn't arrived), enforces the D9 duplicate control per warehouse, renders
 * the label PDF into a preview, marks the printed labels, and toasts what was
 * skipped. Used by the index rows, the bulk bar, and the task detail pages.
 *
 * Packing callers pass `requireCourier: true`: a non-marketplace order with no
 * courier yet is held back and surfaced via `courierModalRows` so the page can
 * open the shipping-details modal; on save it re-prints those orders. Picking
 * callers omit it — courier is only assigned later, at handover.
 *
 * PACKAGES. An outbound can leave as several parcels, and each parcel is its own
 * shipment with its own AWB. So packing callers also pass the `packages` they are
 * printing (one per packing task): the label, the modal and the saved details then
 * all work per outbound+package, and one order with two packages prints two labels.
 * Picking callers pass none — no parcel exists yet at picking, so that board prints
 * the PARENT outbound's courier/tracking, which is the only thing it knows.
 */
import { ref } from 'vue'
import type jsPDF from 'jspdf'
import { toast } from '@mekari/pixel3'
import { isMarketplaceOrder, type OutgoingOrder } from '~/data/outgoing'
import { resolveShippingLabelPrint, commitShippingLabelsPrinted, type ShipLabelInfo } from '~/data/shippingLabels'
import {
  setWmsShipping, setWmsPackageShipping, wmsShippingForOrder, wmsShippingForPackage, courierForOrder,
} from '~/data/deliveryTasks'
import { generateShippingLabelPdf, type ShippingLabelEntry } from '~/utils/shippingLabelPdf'

export interface ShippingDetailsInput { courier: string; trackingNo: string }

/** One parcel being labelled: the packing task that produced it. */
export interface PackageRef { id: string; no: string; orderId: string }

/** A courier/tracking pair the modal asks for — one per outbound, or per
 *  outbound+package once packages are in play. */
export interface ShippingDetailRow {
  key: string
  orderId: string
  orderNumber: string
  customer?: string
  packageId?: string
  packageNo?: string
  courier: string
  trackingNo: string
}

export function usePrintShippingLabel() {
  const pdfOpen = ref(false)
  const pdfDoc = ref<jsPDF | null>(null)
  const pdfFilename = ref('shipping-labels.pdf')

  // Shipping-details modal (missing courier at packing). Held here so the flow —
  // print → prompt → save → print — lives in one place; the page just renders the
  // modal bound to this state.
  const courierModalOpen = ref(false)
  const courierModalOrders = ref<OutgoingOrder[]>([])
  const courierModalRows = ref<ShippingDetailRow[]>([])
  // Remembered so "Save & print" can re-print exactly what was held back.
  const pendingPackages = ref<PackageRef[]>([])

  function entryFor(order: OutgoingOrder, info: ShipLabelInfo, pkg?: PackageRef): ShippingLabelEntry {
    if (pkg) {
      // The parcel's own details, falling back to the parent outbound's — this is
      // what gets printed, so the label and the shipment agree.
      const ship = wmsShippingForPackage(pkg.id, order.id)
      return {
        order, info, packageNo: pkg.no,
        courier: ship?.courier || courierForOrder(order),
        trackingNo: ship?.trackingNo,
      }
    }
    const ship = wmsShippingForOrder(order.id)
    // courierForOrder covers both — a marketplace order's channel-fixed courier and
    // a WMS order's entered courier.
    return { order, info, courier: courierForOrder(order), trackingNo: ship?.trackingNo }
  }

  /** Every parcel of one order in this print job (none = print the order itself). */
  function packagesOf(order: OutgoingOrder, packages: PackageRef[]): PackageRef[] {
    return packages.filter((p) => p.orderId === order.id)
  }

  /** Has this parcel (or its parent) got a courier yet? */
  function hasCourier(order: OutgoingOrder, pkg?: PackageRef): boolean {
    if (!pkg) return !!courierForOrder(order)
    return !!(wmsShippingForPackage(pkg.id, order.id)?.courier || courierForOrder(order))
  }

  async function printShippingLabels(
    orders: OutgoingOrder[],
    opts: { requireCourier?: boolean; packages?: PackageRef[] } = {},
  ) {
    if (!orders.length) return
    const packages = opts.packages ?? []
    const results = resolveShippingLabelPrint(orders, undefined, (order) =>
      packagesOf(order, packages).map((p) => p.no))
    // Packing gate: a non-marketplace order with no courier yet is fixable inline —
    // reclassify it to 'missing-courier' so we prompt instead of print. A not-yet-
    // arrived marketplace label ('unavailable') takes precedence and is left as-is.
    if (opts.requireCourier) {
      for (const r of results) {
        if (r.status === 'unavailable' || isMarketplaceOrder(r.order)) continue
        // With packages, EVERY parcel needs a courier before the order prints —
        // one parcel left blank would otherwise print a label with no carrier.
        const pkgs = packagesOf(r.order, packages)
        const missing = pkgs.length
          ? pkgs.some((p) => !hasCourier(r.order, p))
          : !hasCourier(r.order)
        if (missing) r.status = 'missing-courier'
      }
    }
    const ok = results.filter((r) => r.status === 'ok')
    const dup = results.filter((r) => r.status === 'duplicate')
    const unavailable = results.filter((r) => r.status === 'unavailable')
    const missingCourier = results.filter((r) => r.status === 'missing-courier')

    // Print whatever is printable now (the missing-courier ones are handled via the
    // modal below, so an all-ready bulk still prints in one go).
    if (ok.length) {
      // One page per PARCEL: an order that ships as two packages gets two labels,
      // each with its own courier/AWB.
      const entries = ok.flatMap((r) => {
        // Only the parcels the resolver cleared — one already printed is skipped
        // (D9) without holding back the rest of the order.
        const printable = r.packageNos?.length
          ? packagesOf(r.order, packages).filter((p) => r.packageNos!.includes(p.no))
          : []
        return printable.length ? printable.map((p) => entryFor(r.order, r.info, p)) : [entryFor(r.order, r.info)]
      })
      pdfDoc.value = await generateShippingLabelPdf(entries)
      pdfFilename.value = entries.length === 1
        ? `shipping-label-${ok[0].order.number}.pdf`
        : `shipping-labels-${entries.length}.pdf`
      pdfOpen.value = true
      commitShippingLabelsPrinted(ok)
    }

    // Non-marketplace orders with no courier yet → prompt for it, then re-print.
    if (missingCourier.length) {
      courierModalOrders.value = missingCourier.map((r) => r.order)
      pendingPackages.value = packages
      courierModalRows.value = missingCourier.flatMap((r) => {
        const pkgs = packagesOf(r.order, packages)
        const parent = wmsShippingForOrder(r.order.id)
        // Each parcel starts from its own details, or inherits the outbound's —
        // filling the parent in once already covers every package under it.
        if (!pkgs.length) {
          return [{
            key: r.order.id, orderId: r.order.id, orderNumber: r.order.number, customer: r.order.customer,
            courier: parent?.courier ?? '', trackingNo: parent?.trackingNo ?? '',
          }]
        }
        return pkgs.map((p) => {
          const ship = wmsShippingForPackage(p.id, r.order.id)
          return {
            key: `${r.order.id}::${p.id}`, orderId: r.order.id, orderNumber: r.order.number,
            customer: r.order.customer, packageId: p.id, packageNo: p.no,
            courier: ship?.courier ?? '', trackingNo: ship?.trackingNo ?? '',
          }
        })
      })
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

  /**
   * Modal "Save & print" — persist what was entered, then print.
   *
   * Keyed by the row: a package row saves against the PACKAGE (that parcel keeps
   * its own courier/AWB from here on, whatever the parent says), an order row
   * against the outbound as before.
   */
  async function saveShippingDetailsAndPrint(details: Record<string, ShippingDetailsInput>) {
    const orders = courierModalOrders.value
    const packages = pendingPackages.value
    for (const row of courierModalRows.value) {
      const d = details[row.key]
      if (!d) continue
      if (row.packageId) setWmsPackageShipping(row.packageId, { courier: d.courier, trackingNo: d.trackingNo })
      else setWmsShipping(row.orderId, { courier: d.courier, trackingNo: d.trackingNo })
    }
    courierModalOpen.value = false
    courierModalOrders.value = []
    courierModalRows.value = []
    pendingPackages.value = []
    // Courier is on file now → these resolve to `ok` and print.
    await printShippingLabels(orders, { requireCourier: true, packages })
  }

  function cancelShippingDetails() {
    courierModalOpen.value = false
    courierModalOrders.value = []
    courierModalRows.value = []
    pendingPackages.value = []
  }

  return {
    pdfOpen, pdfDoc, pdfFilename, printShippingLabels,
    courierModalOpen, courierModalOrders, courierModalRows,
    saveShippingDetailsAndPrint, cancelShippingDetails,
  }
}
