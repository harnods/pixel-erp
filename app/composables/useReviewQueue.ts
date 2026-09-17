import { computed, type Ref } from 'vue'
import { reviewFiles, purchaseInvoiceReviewFiles, persistReviewFiles } from '~/data'
import type { ReviewFile } from '~/data'

/**
 * useReviewQueue — resolves which OCR review run a file-review page is showing.
 *
 * The same review pages are reachable from two surfaces: Expenses' "Review
 * files" tab and Purchase invoices'. Rather than duplicating the pages per
 * surface, the *route* decides which queue is being worked through and what the
 * breadcrumb points back to:
 *
 *   /expenses/review/:id          → Expenses queue
 *   /purchase-invoices/review/:id → Purchase invoices queue
 *
 * Everything the pages need to navigate the run (position, next file, removing
 * a finished file) is derived from that one decision.
 */
export function useReviewQueue(fileId: () => string) {
  const route = useRoute()
  const router = useRouter()
  const { t } = useLocale()

  /** Which surface the user came in through — read off the route prefix. */
  const isPurchaseInvoices = computed(() => route.path.startsWith('/purchase-invoices/'))

  const queue = computed<ReviewFile[]>(() =>
    isPurchaseInvoices.value ? purchaseInvoiceReviewFiles : reviewFiles,
  )
  const backLabel = computed(() => (isPurchaseInvoices.value ? t('Purchase invoices') : t('Expenses')))
  const queueBase = computed(() => (isPurchaseInvoices.value ? '/purchase-invoices/review' : '/expenses/review'))

  const index = computed(() => {
    const i = queue.value.findIndex((rf) => rf.id === fileId())
    return i === -1 ? 0 : i
  })

  /** Back to the surface's own Inbox tab. */
  function goBack() {
    if (isPurchaseInvoices.value) router.push({ path: '/purchase-invoices', query: { tab: 'Dropbox' } })
    else router.push({ path: '/expenses', query: { tab: 'Dropbox' } })
  }

  /**
   * Resolve where to go after this file, *before* it's removed from the queue —
   * splicing first would shift the indices out from under us. Returns a thunk so
   * the caller can remove the file and then navigate.
   */
  function goToNext(): () => void {
    const list = queue.value
    const here = index.value
    const next = list[here + 1] ?? list[here - 1]
    const nextId = next && next.id !== fileId() ? next.id : null
    const base = queueBase.value
    return () => {
      if (nextId) router.push(`${base}/${nextId}`)
      else goBack()
    }
  }

  function removeFromQueue(id: string) {
    const list = queue.value
    const i = list.findIndex((rf) => rf.id === id)
    if (i !== -1) {
      list.splice(i, 1)
      // Persist so a reviewed+saved file stays gone from the Dropbox after refresh.
      persistReviewFiles()
    }
  }

  return {
    queue: queue as Ref<ReviewFile[]>,
    isPurchaseInvoices,
    backLabel,
    queueBase,
    index,
    goBack,
    goToNext,
    removeFromQueue,
  }
}
