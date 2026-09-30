import { h } from 'vue'
import { toast, MpIcon } from '@mekari/pixel3'

/**
 * Pixel's toast only supports variant `success | error | greeting` (default
 * `success`) and has NO `icon` prop — so passing `variant: 'info'` / `'warning'`
 * is not a real variant and renders the wrong (fallback "?") icon. `success` /
 * `error` do draw their own icon, but there's no info/warning equivalent.
 *
 * These helpers draw the intended icon themselves via the `render` VNode hook and
 * use the neutral `greeting` variant (which injects no status icon of its own).
 */
function iconToast(icon: string, color: string, title: string) {
  toast.notify({
    variant: 'greeting',
    maxWidth: 'max-content',
    // The `erp-info-toast` marker lets erp.css repaint just THIS toast (white
    // surface + blue border/text), leaving other `greeting` toasts dark.
    render: () =>
      h('div', { class: 'erp-info-toast', style: 'display:flex;align-items:center;gap:8px;' }, [
        h(MpIcon, { name: icon, size: 'md', variant: 'fill', color }),
        h('span', title),
      ]),
  })
}

/** Neutral info toast — white surface, blue border, filled blue `info` icon. */
export function infoToast(title: string) {
  iconToast('info', 'var(--mp-colors-blue-600)', title)
}

/**
 * Success toast — Pixel's `success` variant (green check). Show after a save /
 * submit / delete succeeds. Copy follows the UXW library
 * (.agents/skills/pixel-guardian/references/uxw-copy-library.md): a short
 * past-participle phrase — "[Object] saved" / "Changes saved" / "[Object]
 * submitted" — sentence case, NO period. See rule/btn-save-toast.
 */
export function successToast(title: string) {
  toast.notify({ variant: 'success', title, maxWidth: 'max-content' })
}

/**
 * Error toast — Pixel's `error` variant (red). Reserved for **system / async
 * failures** the user can't fix at a field: a save that hit a server/network
 * error, a background job that failed ("Server error, please try again").
 * **Form/field validation is NOT a toast** — those render inline near the field
 * (see rule/form-errors-inline). Copy: short, sentence case, no period.
 */
export function errorToast(title: string) {
  toast.notify({ variant: 'error', title, maxWidth: 'max-content' })
}

/**
 * Greeting toast — Pixel's neutral `greeting` variant (no status icon). Niche:
 * onboarding / time-of-day welcomes ("🌤️ Good morning, Fajar"). Rare in the ERP.
 */
export function greetingToast(title: string) {
  toast.notify({ variant: 'greeting', title, maxWidth: 'max-content' })
}
