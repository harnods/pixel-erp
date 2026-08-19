import { ref } from 'vue'

/**
 * Whether the far-left product-switcher rail (ERP/HR/CRM/…) is shown. Off by
 * default — the app looks like a plain ERP. Toggled from the top-right user menu
 * ("Show ERP Menu"). Module-level singleton so the header and layout share it.
 */
const STORAGE_KEY = 'erp-show-product-menu'

function load(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === '1'
}

const showProductMenu = ref(load())

export function useProductMenu() {
  function toggleProductMenu() {
    showProductMenu.value = !showProductMenu.value
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, showProductMenu.value ? '1' : '0')
    }
  }
  return { showProductMenu, toggleProductMenu }
}
