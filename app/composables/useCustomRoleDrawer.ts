/**
 * useCustomRoleDrawer — shared open/edit intent for the "Add custom role" drawer.
 *
 * The drawer is rendered by CustomRolesPage (inside the stage), but its primary
 * trigger — the "New custom role" button — lives in the page title bar, which is
 * owned by app/pages/[...slug].vue. Module-level state lets the two talk without
 * prop-drilling through the tab machinery.
 */
import { ref } from 'vue'

const isOpen = ref(false)
/** null = create mode; a customRoles id = edit mode. */
const editingId = ref<string | null>(null)

export function useCustomRoleDrawer() {
  function openCreate() {
    editingId.value = null
    isOpen.value = true
  }
  function openEdit(id: string) {
    editingId.value = id
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
    editingId.value = null
  }
  return { isOpen, editingId, openCreate, openEdit, close }
}
