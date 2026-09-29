/**
 * useProjectRole — prototype "view as" for the Projects module. The PRD splits
 * responsibility across roles (PM raises and overrides within threshold;
 * Finance/Controller owns policy and approves; Warehouse handles reservations;
 * Site supervisor captures field changes; Production edits project BOMs). The role drives labels such as the
 * role-labelled approval button and blocks self-approval in the inbox.
 */
export type ProjectRole = 'pm' | 'finance' | 'warehouse' | 'site' | 'production'

export const PROJECT_ROLES: { value: ProjectRole; label: string; actor: string; auditRole: 'PM' | 'Finance' | 'Warehouse' | 'Site supervisor' | 'Production' }[] = [
  { value: 'pm', label: 'Project manager', actor: 'Rizal Candra', auditRole: 'PM' },
  { value: 'finance', label: 'Finance / Controller', actor: 'Maya Kartika', auditRole: 'Finance' },
  { value: 'warehouse', label: 'Warehouse', actor: 'Budi Santoso', auditRole: 'Warehouse' },
  { value: 'site', label: 'Site supervisor', actor: 'Agus Wibowo', auditRole: 'Site supervisor' },
  // PRD v6.2 §7 / OQ37: Production edits the project BOM (publishes versions); the PM decides adoption.
  { value: 'production', label: 'Production', actor: 'Dewi Lestari', auditRole: 'Production' },
]

const KEY = 'erp-pm-role'
const role = ref<ProjectRole>('pm')
let loaded = false

export function useProjectRole() {
  if (!loaded && import.meta.client) {
    loaded = true
    try {
      const saved = localStorage.getItem(KEY) as ProjectRole | null
      if (saved && PROJECT_ROLES.some(r => r.value === saved)) role.value = saved
    } catch { /* storage blocked — default PM */ }
  }
  const current = computed(() => PROJECT_ROLES.find(r => r.value === role.value)!)
  function setRole(r: ProjectRole) {
    role.value = r
    try { localStorage.setItem(KEY, r) } catch { /* non-fatal */ }
  }
  return {
    role,
    current,
    actor: computed(() => current.value.actor),
    auditRole: computed(() => current.value.auditRole),
    isFinance: computed(() => role.value === 'finance'),
    isPm: computed(() => role.value === 'pm'),
    isProduction: computed(() => role.value === 'production'),
    /** { name, role } for projectActions — every action writes its audit entry with it */
    asActor: computed(() => ({ name: current.value.actor, role: current.value.auditRole })),
    setRole,
  }
}
