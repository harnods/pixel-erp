/**
 * useInviteEditStates — the 12 demo states of the Invite / Edit user spec
 * ("Invite user" and "Edit user" for the CRM add-on), switchable from the
 * Users & roles scenario FAB (CrmSeatsScenarioFab, "Invite / Edit states").
 *
 * Each state = a mock-Billing preset (useCrmSubscriptionScenario.applyPreset —
 * which also applies and later undoes any seed tweak the state needs) + where to
 * go + how to pre-fill the form, so the frame shows the spec's numbers:
 *
 *   1  Default                         essential     invite, nothing ticked
 *   2  CRM-only as CRM Administrator   essential     invite, CRM + Administrator
 *   3  Ultimate + CRM Basic            essential     invite
 *   4  Custom "Product only" + Basic   essential     invite, Custom tab
 *   5  No CRM seat left                crm-full      invite
 *   6  Only Basic seats left           basic-only    invite, CRM ticked → Basic auto-selected
 *   7  ERP limit full                  erp-full      invite
 *   8  Company without CRM             none          invite
 *   9  Edit user (CRM Administrator)   essential     /users-and-roles/au-10/edit (Fajar)
 *  10  Over quota                      over-quota    invite
 *  11  CRM expired                     expired       invite
 *  12  Custom role editor              essential     Custom role tab + "Add custom role" drawer
 *
 * The pre-fill is a one-shot request (`pendingPrefill`) that InviteUserPage
 * consumes when it is showing the matching route — the page may be mounted
 * already, or about to mount after the navigation. Module-level state, like
 * useCustomRoleDrawer, so the FAB and the page talk without prop-drilling.
 * The form draft itself is never persisted (a refresh shows a blank form).
 */
import { ref } from 'vue'
import type { CrmRole } from '~/data/crmSubscription'
import { useCrmSubscriptionScenario } from '~/composables/useCrmSubscriptionScenario'
import { useCustomRoleDrawer } from '~/composables/useCustomRoleDrawer'

export interface InviteFormPrefill {
  systemRoleIds?: string[]
  /** Custom roles by NAME (ids can differ once the demo data was edited). */
  customRoleNames?: string[]
  /** Tick CRM — at a level, or 'default' = what the form picks (Administrator when allowed, else Basic). */
  crm?: CrmRole | 'default'
  tab?: 'existing' | 'custom'
}

export interface InviteEditState {
  value: string
  label: string
  /** CRM_SCENARIO_PRESETS value applied first. */
  preset: string
  route: 'invite' | 'edit' | 'custom-role'
  /** route 'edit' only. */
  userId?: string
  prefill?: InviteFormPrefill
}

/** The user state 9 edits — Fajar Nugraha, Ultimate + CRM Administrator (invited). */
export const EDIT_STATE_USER_ID = 'au-10'

export const INVITE_EDIT_STATES: InviteEditState[] = [
  { value: '1', label: '1. Default', preset: 'essential', route: 'invite' },
  { value: '2', label: '2. CRM-only invite as CRM Administrator', preset: 'essential', route: 'invite', prefill: { crm: 'admin' } },
  { value: '3', label: '3. Ultimate + CRM Basic', preset: 'essential', route: 'invite', prefill: { systemRoleIds: ['ultimate'], crm: 'basic' } },
  { value: '4', label: '4. Custom role "Product only" + CRM Basic', preset: 'essential', route: 'invite', prefill: { customRoleNames: ['Product only'], crm: 'basic', tab: 'custom' } },
  { value: '5', label: '5. No CRM seat left', preset: 'crm-full', route: 'invite' },
  { value: '6', label: '6. Only CRM Basic seats left', preset: 'basic-only', route: 'invite', prefill: { crm: 'default' } },
  { value: '7', label: '7. ERP user limit full', preset: 'erp-full', route: 'invite' },
  { value: '8', label: '8. Company without CRM', preset: 'none', route: 'invite' },
  { value: '9', label: '9. Edit user (CRM Administrator)', preset: 'essential', route: 'edit', userId: EDIT_STATE_USER_ID },
  { value: '10', label: '10. Over quota', preset: 'over-quota', route: 'invite' },
  { value: '11', label: '11. CRM expired', preset: 'expired', route: 'invite' },
  { value: '12', label: '12. Custom role editor', preset: 'essential', route: 'custom-role' },
]

export function inviteStatePath(state: InviteEditState): string {
  if (state.route === 'edit') return `/users-and-roles/${state.userId}/edit`
  if (state.route === 'custom-role') return '/users-and-roles?tab=Custom%20role'
  return '/users-and-roles/invite'
}

const activeInviteState = ref('')
const pendingPrefill = ref<{ state: InviteEditState; nonce: number } | null>(null)
let nonce = 0

export function useInviteEditStates() {
  const { applyPreset } = useCrmSubscriptionScenario()
  const router = useRouter()
  const route = useRoute()
  const { openCreate } = useCustomRoleDrawer()

  function selectInviteState(value: string) {
    const state = INVITE_EDIT_STATES.find((s) => s.value === value)
    if (!state) return
    applyPreset(state.preset)
    activeInviteState.value = value
    const path = inviteStatePath(state)
    if (state.route === 'custom-role') {
      pendingPrefill.value = null
      if (route.path !== '/users-and-roles' || route.query?.tab !== 'Custom role') router.push(path)
      openCreate()
      return
    }
    pendingPrefill.value = { state, nonce: ++nonce }
    if (route.path !== path) router.push(path)
  }

  /** A Billing preset picked from the other list — the frame no longer matches a spec state. */
  function clearInviteState() { activeInviteState.value = '' }

  return { states: INVITE_EDIT_STATES, activeInviteState, pendingPrefill, selectInviteState, clearInviteState }
}
