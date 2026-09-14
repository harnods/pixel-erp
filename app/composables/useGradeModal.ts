/**
 * useGradeModal — shared open/edit intent for the grade create/edit modal.
 *
 * The modal is rendered by GradesPage (inside the stage), but its primary trigger —
 * the "New grade" button — lives in the page title bar, owned by
 * app/pages/[...slug].vue. Module-level state lets the two talk without prop-drilling
 * (same pattern as useCustomRoleDrawer).
 */
import { ref } from 'vue'

const isOpen = ref(false)
/** null = create mode; a grade id = edit mode. */
const editingId = ref<string | null>(null)

export function useGradeModal() {
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
