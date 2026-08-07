/**
 * Print Shipping Label — shared handler for the Picking and Packing flows
 * (PRD Outbound D3 / D4 / D9). Resolves which of the selected orders' labels can
 * print (marketplace source label vs WMS label; skips marketplace orders whose
 * label hasn't arrived), enforces the D9 duplicate control per warehouse, renders
 * the label PDF into a preview, marks the printed labels, and toasts what was
 * skipped. Used by the index rows, the bulk bar, and the task detail pages.
 */
import { ref } from 'vue'
import type jsPDF from 'jspdf'
import { toast } from '@mekari/pixel3'
import type { OutgoingOrder } from '~/data/outgoing'
import { resolveShippingLabelPrint, commitShippingLabelsPrinted } from '~/data/shippingLabels'
import { generateShippingLabelPdf } from '~/utils/shippingLabelPdf'

export function usePrintShippingLabel() {
  const pdfOpen = ref(false)
  const pdfDoc = ref<jsPDF | null>(null)
  const pdfFilename = ref('shipping-labels.pdf')

  async function printShippingLabels(orders: OutgoingOrder[]) {
    if (!orders.length) return
    const results = resolveShippingLabelPrint(orders)
    const ok = results.filter((r) => r.status === 'ok')
    const dup = results.filter((r) => r.status === 'duplicate')
    const unavailable = results.filter((r) => r.status === 'unavailable')

    if (!ok.length) {
      // Nothing printable — say why (most specific first).
      if (unavailable.length) {
        toast.notify({ variant: 'error', title: 'Waiting for marketplace shipping label — nothing to print', maxWidth: 'max-content' })
      } else if (dup.length) {
        toast.notify({ variant: 'error', title: 'Shipping label already printed (duplicate print not allowed)', maxWidth: 'max-content' })
      } else {
        toast.notify({ variant: 'error', title: 'No shipping label to print', maxWidth: 'max-content' })
      }
      return
    }

    pdfDoc.value = await generateShippingLabelPdf(ok.map((r) => ({ order: r.order, info: r.info })))
    pdfFilename.value = ok.length === 1
      ? `shipping-label-${ok[0].order.number}.pdf`
      : `shipping-labels-${ok.length}.pdf`
    pdfOpen.value = true
    commitShippingLabelsPrinted(ok)

    // Surface anything skipped (no silent caps).
    if (dup.length) {
      toast.notify({ variant: 'warning', title: `${dup.length} label${dup.length > 1 ? 's' : ''} already printed — skipped (duplicate control)`, maxWidth: 'max-content' })
    }
    if (unavailable.length) {
      toast.notify({ variant: 'warning', title: `${unavailable.length} order${unavailable.length > 1 ? 's' : ''} still waiting for the marketplace shipping label — skipped`, maxWidth: 'max-content' })
    }
  }

  return { pdfOpen, pdfDoc, pdfFilename, printShippingLabels }
}
