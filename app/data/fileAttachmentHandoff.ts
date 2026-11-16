/**
 * Hand-off for "Add file › Create a new transaction".
 *
 * The drawer uploads the files, then routes to that page's create form. The
 * form has no idea it was reached from the File manager, so the files ride
 * across in this module-level ref — the same shape the forms already keep in
 * their own `attachments` ref, so they can seed straight from it. Same pattern
 * as `pendingSalesPrefill` (CRM Deal → sales order).
 *
 * It is a one-shot: `takePendingAttachments()` clears as it reads, so a later
 * visit to the same form doesn't pick the files up a second time.
 */
import { ref } from 'vue'

export interface PendingAttachment {
  name: string
  sizeKB: number
}

export const pendingFormAttachments = ref<PendingAttachment[]>([])

export function setPendingAttachments(files: PendingAttachment[]): void {
  pendingFormAttachments.value = files.map(f => ({ ...f }))
}

export function takePendingAttachments(): PendingAttachment[] {
  const files = pendingFormAttachments.value
  pendingFormAttachments.value = []
  return files
}
