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
    render: () =>
      h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
        h(MpIcon, { name: icon, size: 'md', color }),
        h('span', title),
      ]),
  })
}

/** Neutral info toast — blue `info` icon. */
export function infoToast(title: string) {
  iconToast('info', 'icon.information', title)
}
