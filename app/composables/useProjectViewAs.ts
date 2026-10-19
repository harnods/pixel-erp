/**
 * useProjectViewAs — prototype-only "View as" for Project accounting approvals.
 * Not a Jurnal feature: it lets a reviewer play the person who submits (the
 * project manager) and the person who approves. Persisted like useApprovalViewAs.
 */
import { ref, computed } from 'vue'

export type ProjectViewAs = 'pm' | 'approver'

export interface ProjectUser { name: string; role: string }

export const PROJECT_VIEW_AS_USERS: Record<ProjectViewAs, ProjectUser> = {
  pm: { name: 'Rina Wulandari', role: 'Project manager' },
  approver: { name: 'Rizal Candra', role: 'Owner · Approver' },
}

const STORAGE_KEY = 'erp-project-view-as'
const viewAs = ref<ProjectViewAs>('pm')
let hydrated = false

export function useProjectViewAs() {
  if (!hydrated && import.meta.client) {
    const saved = localStorage.getItem(STORAGE_KEY) as ProjectViewAs | null
    if (saved === 'pm' || saved === 'approver') viewAs.value = saved
    hydrated = true
  }
  function setViewAs(next: ProjectViewAs) {
    viewAs.value = next
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, next)
  }
  const currentUser = computed<ProjectUser>(() => PROJECT_VIEW_AS_USERS[viewAs.value])
  return { viewAs, setViewAs, currentUser }
}
