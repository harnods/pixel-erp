import { useRouter } from 'vue-router'
import { getContactIdByName } from '~/data/contacts'

export type ContactListKind = 'customers' | 'vendors'

/** The contact detail route for a transaction's customer / vendor name, or
 *  undefined when no contact record matches (transactions join contacts on name). */
export function contactHref(kind: ContactListKind, name: string): string | undefined {
  const id = getContactIdByName(name)
  return id ? `/${kind}/${id}` : undefined
}

/**
 * Opens a transaction's customer / vendor in a new tab — the contact link on
 * every detail page (ContentList "Customer" / "Vendor" / "Beneficiary").
 *
 * Detail templates used to call `window.open(...)` inline, but `window` is not
 * exposed to Vue templates, so the click threw in the production build and
 * nothing opened. Call this from script instead:
 *   const openContact = useOpenContact()
 *   <a class="detail-value-link" @click="openContact('customers', name)">
 */
export function useOpenContact() {
  const router = useRouter()
  return (kind: ContactListKind, name: string): void => {
    const href = contactHref(kind, name)
    if (!href) return
    window.open(router.resolve(href).href, '_blank', 'noopener')
  }
}
