import { ref } from 'vue'
import { ID_TRANSLATIONS } from '~/data/translations'

export type Locale = 'en' | 'id'

const LS_KEY = 'erp-locale'

// Module-level singleton — every component shares one reactive locale (the app
// is client-rendered, so no SSR cross-request state concern). Wired to the user
// menu's language switcher; persisted so it survives a refresh.
const locale = ref<Locale>('en')
if (import.meta.client) {
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved === 'id' || saved === 'en') locale.value = saved
  } catch { /* ignore */ }
}

function setLocale(next: Locale) {
  locale.value = next
  if (import.meta.client) {
    try { localStorage.setItem(LS_KEY, next) } catch { /* ignore */ }
  }
}

/**
 * Translate an English source string into the active locale, following the Mekari
 * UXW copy library. Reads `locale` reactively, so templates re-render on switch.
 * Falls back to the English source when no translation exists yet — so partially
 * translated screens stay fully readable during the incremental rollout.
 */
function t(en: string): string {
  if (locale.value === 'en') return en
  return ID_TRANSLATIONS[en] ?? en
}

export function useLocale() {
  return { locale, setLocale, t }
}
