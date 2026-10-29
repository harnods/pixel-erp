// @vitest-environment happy-dom
/**
 * Invite / Edit user — the 12 states of the CRM add-on spec, as switched from
 * the scenario FAB's "Invite / Edit states" (useInviteEditStates).
 *
 * Each test selects a state (mock Billing preset + form pre-fill), mounts the
 * real InviteUserPage on the route that state opens, and asserts the exact
 * numbers and strings from the spec: the Seat usage card, which options are
 * disabled and why (inline + hover), the CRM level default / auto-select, the
 * Edit transitions and the Save button labels. State 12 mounts the custom-role
 * drawer. Nuxt-only auto-imports are stubbed as in crm-user-seats-invite.spec.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import InviteUserPage from '~/components/pages/InviteUserPage.vue'
import CustomRoleDrawer from '~/components/patterns/CustomRoleDrawer.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import { useTableState } from '~/composables/useTableState'
import { useCrmSubscriptionScenario } from '~/composables/useCrmSubscriptionScenario'
import { useInviteEditStates, INVITE_EDIT_STATES, EDIT_STATE_USER_ID } from '~/composables/useInviteEditStates'
import { useCustomRoleDrawer } from '~/composables/useCustomRoleDrawer'
import {
  crmUsage, erpUsage, defaultCrmSubscriptionState, setCrmSubscription,
} from '~/data/crmSubscription'
import { AUTHORITY_CATEGORIES, accountUsers, customRoles, deleteAccountUser, getAccountUser } from '~/data/usersRoles'

const router = { push: vi.fn() }
vi.stubGlobal('useRouter', () => router)
vi.stubGlobal('useRoute', () => ({ query: {}, path: '/users-and-roles/invite' }))
vi.stubGlobal('useTableState', useTableState)
vi.stubGlobal('useApprovalWorkflowScenario', () => ({ projectAccountingEnabled: { value: true } }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

const { applyPreset } = useCrmSubscriptionScenario()
const { selectInviteState, pendingPrefill, activeInviteState } = useInviteEditStates()

const seededIds = new Set(accountUsers.map((u) => u.id))
const seededRoles = new Map(accountUsers.map((u) => [u.id, u.crmRole]))
beforeEach(() => { router.push.mockClear(); applyPreset('essential') })
afterEach(() => {
  applyPreset('essential')
  pendingPrefill.value = null
  activeInviteState.value = ''
  useCustomRoleDrawer().close()
  for (const u of [...accountUsers]) if (!seededIds.has(u.id)) deleteAccountUser(u.id)
  for (const u of accountUsers) if (seededRoles.has(u.id)) u.crmRole = seededRoles.get(u.id)!
  setCrmSubscription(defaultCrmSubscriptionState())
})

type W = ReturnType<typeof mount>

async function mountPage(orderId = 'invite') {
  const wrapper = mount(InviteUserPage, { props: { orderId }, attachTo: document.body })
  await flushPromises()
  return wrapper
}
/** Select spec state `n` and mount the page on the route it opens. */
async function openState(n: number) {
  selectInviteState(String(n))
  const state = INVITE_EDIT_STATES[n - 1]!
  return mountPage(state.route === 'edit' ? state.userId! : 'invite')
}

const txt = (w: W, testId: string) => {
  const el = w.find(`[data-test-id="${testId}"]`)
  return el.exists() ? el.text().replace(/\s+/g, ' ').trim() : ''
}
const card = (w: W, testId: string) => {
  const el = w.find(`[data-test-id="inv-seat-card"] [data-test-id="${testId}"]`)
  return el.exists() ? el.text().replace(/\s+/g, ' ').trim() : ''
}
const erpLine = (w: W) => card(w, 'seat-usage-erp').replace(/^ERP users\s*/, '')
const crmLine = (w: W) => card(w, 'seat-usage-crm-usage')
const afterSaving = (w: W) => w.find('[data-test-id="inv-seat-after-saving"]').exists()
const input = (w: W, sel: string) => w.find(sel).element as HTMLInputElement
const crmBox = (w: W) => input(w, 'input[data-test-id="inv-crm-checkbox"]')
/** Pixel's MpCheckbox clears the native `checked` while disabled but still draws the tick. */
const crmTickShown = (w: W) => !!crmBox(w).nextElementSibling?.querySelector('svg')
const radio = (w: W, level: 'basic' | 'admin') => input(w, `input[data-test-id="inv-crm-${level}-radio"]`)
const chips = (w: W, group: 'existing' | 'custom') =>
  w.findAll(`[data-test-id="inv-selected-${group}"] .mp-tag, [data-test-id="inv-selected-${group}"] [class*="tag"]`)
    .map((c) => c.text().trim()).filter((v, i, a) => v && a.indexOf(v) === i)
const reasonOf = (w: W, sel: string) => w.find(sel).element.closest('[data-disabled-reason]')?.getAttribute('data-disabled-reason') ?? null
function change(w: W, sel: string, checked = true) {
  const el = input(w, sel)
  el.checked = checked
  el.dispatchEvent(new Event('change', { bubbles: true }))
}
const primaryLabel = (w: W) => txt(w, 'inv-save')

describe('Invite / Edit states control', () => {
  it('lists the spec\'s 12 states, numbered, under "Invite / Edit states" on the Invite page', async () => {
    expect(INVITE_EDIT_STATES.map((s) => s.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'])
    INVITE_EDIT_STATES.forEach((s, i) => expect(s.label.startsWith(`${i + 1}. `)).toBe(true))
    const wrapper = await mountPage()
    const fab = wrapper.findComponent(ScenarioFab)
    expect(fab.props('heading')).toBe('Invite / Edit states')
    expect((fab.props('scenarios') as { label: string }[]).length).toBe(12)
    wrapper.unmount()
  })

  it('re-fills the open form live when another state is picked', async () => {
    const wrapper = await openState(1)
    expect(chips(wrapper, 'existing')).toEqual([])
    selectInviteState('3')
    await flushPromises()
    expect(chips(wrapper, 'existing')).toEqual(['Ultimate', 'CRM Basic'])
    selectInviteState('1')
    await flushPromises()
    expect(chips(wrapper, 'existing')).toEqual([])
    expect(afterSaving(wrapper)).toBe(false)
    wrapper.unmount()
  })

  it('state 1 restores the default seed after a state that changed it', () => {
    selectInviteState('10')
    expect(crmUsage(accountUsers).total).toBe(7)
    selectInviteState('7')
    expect(erpUsage(accountUsers)).toBe(10)
    selectInviteState('1')
    expect(crmUsage(accountUsers)).toEqual({ total: 4, admin: 2 })
    expect(erpUsage(accountUsers)).toBe(8)
    expect(accountUsers.some((u) => u.id.startsWith('au-demo-'))).toBe(false)
  })
})

describe('1. Default', () => {
  it('nothing ticked: ERP 10·8·2, CRM 5·4·1, "Up to 1 can be CRM Administrator"', async () => {
    const wrapper = await openState(1)
    expect(txt(wrapper, 'inv-title')).toBe('Invite user')
    expect(wrapper.find('.inv-breadcrumb').text()).toBe('Users & roles')
    expect(txt(wrapper, 'inv-seat-title')).toBe('Seat usage')
    expect(erpLine(wrapper)).toBe('10 total · 8 used · 2 left')
    expect(crmLine(wrapper)).toBe('5 total · 4 used · 1 left')
    expect(card(wrapper, 'seat-usage-crm-capacity')).toBe('5 included')
    expect(card(wrapper, 'seat-usage-crm-upto')).toBe('Up to 1 can be CRM Administrator')
    expect(crmBox(wrapper).checked).toBe(false)
    expect(crmBox(wrapper).disabled).toBe(false)
    expect(chips(wrapper, 'existing')).toEqual([])
    expect(txt(wrapper, 'inv-selected-roles')).toMatch(/Existing\s*-\s*Custom\s*-$/)
    expect(primaryLabel(wrapper)).toBe('Invite user')
    expect(wrapper.text()).toContain('Need more ERP or CRM seats?')
    expect(wrapper.text()).toContain('Can be applied to all roles except Owner and Ultimate with List manager ticked.')
    wrapper.unmount()
  })

  it('"Terms for selecting roles" carries the spec\'s CRM line', async () => {
    const wrapper = await openState(1)
    await wrapper.find('.inv-terms-head').trigger('click')
    expect(txt(wrapper, 'inv-terms-crm')).toBe('CRM can be combined with any role, including Ultimate and custom roles. It uses a CRM seat, not an ERP seat, unless the user also has an ERP role.')
    wrapper.unmount()
  })

  it('"(after saving)" appears as soon as a role is ticked, even one that moves no count', async () => {
    const wrapper = await mountPage(EDIT_STATE_USER_ID) // Fajar already holds an ERP seat
    expect(afterSaving(wrapper)).toBe(false)
    change(wrapper, 'input#inv-role-accountant')
    await flushPromises()
    expect(afterSaving(wrapper)).toBe(true)
    expect(erpLine(wrapper)).toBe('10 total · 8 used · 2 left')
    wrapper.unmount()
  })
})

describe('2. CRM-only invite as CRM Administrator', () => {
  it('CRM ticked, Administrator selected; "(after saving)": ERP 10·8·2, CRM 5·5·0, no "Up to" line', async () => {
    const wrapper = await openState(2)
    expect(crmBox(wrapper).checked).toBe(true)
    expect(radio(wrapper, 'admin').checked).toBe(true)
    expect(radio(wrapper, 'basic').checked).toBe(false)
    expect(txt(wrapper, 'inv-seat-title')).toBe('Seat usage (after saving)')
    expect(erpLine(wrapper)).toBe('10 total · 8 used · 2 left')
    expect(crmLine(wrapper)).toBe('5 total · 5 used · 0 left')
    expect(card(wrapper, 'seat-usage-crm-upto')).toBe('')
    expect(chips(wrapper, 'existing')).toEqual(['CRM Administrator'])
    wrapper.unmount()
  })
})

describe('3. ERP + CRM invite: Ultimate + CRM Basic', () => {
  it('both go up by one: ERP 10·9·1, CRM 5·5·0; Selected roles "Ultimate", "CRM Basic"', async () => {
    const wrapper = await openState(3)
    expect(input(wrapper, 'input#inv-role-ultimate').checked).toBe(true)
    expect(radio(wrapper, 'basic').checked).toBe(true)
    expect(erpLine(wrapper)).toBe('10 total · 9 used · 1 left')
    expect(crmLine(wrapper)).toBe('5 total · 5 used · 0 left')
    expect(chips(wrapper, 'existing')).toEqual(['Ultimate', 'CRM Basic'])
    wrapper.unmount()
  })
})

describe('4. Custom role "Product only" + CRM Basic', () => {
  it('"Product only" exists in the seed', () => {
    expect(customRoles.some((r) => r.name === 'Product only')).toBe(true)
  })

  it('opens the Custom tab with "Product only" ticked; CRM Basic is kept', async () => {
    const wrapper = await openState(4)
    const productOnly = customRoles.find((r) => r.name === 'Product only')!
    expect(input(wrapper, `input#inv-custom-${productOnly.id}`).checked).toBe(true)
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toMatch(/^Custom/)
    expect(txt(wrapper, 'inv-custom-crm-hint')).toBe('CRM access is set in Existing role. Selected: CRM Basic.')
    expect(chips(wrapper, 'custom')).toEqual(['Product only'])
    expect(chips(wrapper, 'existing')).toEqual(['CRM Basic'])
    expect(erpLine(wrapper)).toBe('10 total · 9 used · 1 left')
    expect(crmLine(wrapper)).toBe('5 total · 5 used · 0 left')
    wrapper.unmount()
  })
})

describe('5. No CRM seat left before ticking', () => {
  it('CRM 5·5·0; the CRM checkbox is disabled with the reason inline and on hover', async () => {
    const wrapper = await openState(5)
    expect(afterSaving(wrapper)).toBe(false)
    expect(crmLine(wrapper)).toBe('5 total · 5 used · 0 left')
    expect(card(wrapper, 'seat-usage-crm-upto')).toBe('')
    expect(crmBox(wrapper).disabled).toBe(true)
    expect(txt(wrapper, 'inv-crm-note')).toBe('No CRM seats left. Contact Sales to add seats.')
    expect(reasonOf(wrapper, 'input[data-test-id="inv-crm-checkbox"]')).toBe('No CRM seats left. Contact Sales to add seats.')
    // ERP roles are unaffected.
    expect(input(wrapper, 'input#inv-role-accountant').disabled).toBe(false)
    await wrapper.find('[data-test-id="inv-crm-note-link"]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-test-id="seat-contact-sales-body"]')!.textContent).toContain('To add CRM user seats')
    wrapper.unmount()
  })
})

describe('6. Only Basic seats left', () => {
  it('7 total (5 included + 2 Basic add-ons) · 6 used · 1 left; Administrator disabled, CRM Basic auto-selected', async () => {
    const wrapper = await openState(6)
    expect(crmBox(wrapper).checked).toBe(true)
    expect(radio(wrapper, 'basic').checked).toBe(true)
    expect(radio(wrapper, 'admin').disabled).toBe(true)
    expect(radio(wrapper, 'admin').checked).toBe(false)
    expect(txt(wrapper, 'inv-crm-admin-note')).toBe('No CRM Administrator seat left')
    expect(reasonOf(wrapper, 'input[data-test-id="inv-crm-admin-radio"]')).toBe('No CRM Administrator seat left')
    expect(crmLine(wrapper)).toBe('7 total · 6 used · 1 left')
    expect(card(wrapper, 'seat-usage-crm-capacity')).toBe('5 included + 2 Basic add-ons')
    expect(card(wrapper, 'seat-usage-crm-upto')).toBe('') // Administrator limit full
    expect(erpLine(wrapper)).toBe('10 total · 8 used · 2 left')
    // The Owner + 4 CRM Administrators fill the 5 Administrator-capable seats.
    expect(crmUsage(accountUsers)).toEqual({ total: 5, admin: 5 })
    wrapper.unmount()
  })

  it('re-ticking CRM starts at CRM Basic again; Administrator can\'t be picked', async () => {
    const wrapper = await openState(6)
    change(wrapper, 'input[data-test-id="inv-crm-checkbox"]', false)
    await flushPromises()
    expect(crmLine(wrapper)).toBe('7 total · 5 used · 2 left')
    change(wrapper, 'input[data-test-id="inv-crm-checkbox"]', true)
    await flushPromises()
    expect(radio(wrapper, 'basic').checked).toBe(true)
    change(wrapper, 'input[data-test-id="inv-crm-admin-radio"]')
    await flushPromises()
    expect(chips(wrapper, 'existing')).toEqual(['CRM Basic'])
    wrapper.unmount()
  })
})

describe('7. ERP limit full, CRM-only allowed', () => {
  it('ERP 10·10·0; every ERP role (Existing and Custom) disabled with "No ERP seats left"; CRM still selectable', async () => {
    const wrapper = await openState(7)
    expect(erpLine(wrapper)).toBe('10 total · 10 used · 0 left')
    expect(crmLine(wrapper)).toBe('5 total · 4 used · 1 left')
    for (const id of ['ultimate', 'administrator', 'accountant', 'warehouse']) {
      expect(input(wrapper, `input#inv-role-${id}`).disabled, id).toBe(true)
      expect(reasonOf(wrapper, `input#inv-role-${id}`)).toBe('No ERP seats left')
    }
    for (const r of customRoles) expect(input(wrapper, `input#inv-custom-${r.id}`).disabled, r.name).toBe(true)
    expect(txt(wrapper, 'inv-erp-note')).toBe('No ERP seats left')
    expect(txt(wrapper, 'inv-erp-note-custom')).toBe('No ERP seats left')
    expect(crmBox(wrapper).disabled).toBe(false)
    change(wrapper, 'input[data-test-id="inv-crm-checkbox"]')
    await flushPromises()
    expect(crmLine(wrapper)).toBe('5 total · 5 used · 0 left')
    expect(erpLine(wrapper)).toBe('10 total · 10 used · 0 left')
    wrapper.unmount()
  })
})

describe('8. Company without the CRM add-on', () => {
  it('no CRM row in the role list, no "CRM users" section in Seat usage', async () => {
    const wrapper = await openState(8)
    expect(wrapper.find('[data-test-id="inv-crm-row"]').exists()).toBe(false)
    expect(card(wrapper, 'seat-usage-crm')).toBe('')
    expect(txt(wrapper, 'inv-seat-card')).not.toContain('CRM users')
    expect(erpLine(wrapper)).toBe('10 total · 8 used · 2 left')
    wrapper.unmount()
  })
})

describe('9. Edit user (already CRM Administrator)', () => {
  it('opens Fajar in "Edit user" with a "Save" button; nothing changed yet', async () => {
    const wrapper = await openState(9)
    expect(router.push).toHaveBeenCalledWith('/users-and-roles/au-10/edit')
    expect(txt(wrapper, 'inv-title')).toBe('Edit user')
    expect(primaryLabel(wrapper)).toBe('Save')
    expect(input(wrapper, 'input#inv-name').value).toBe('Fajar Nugraha')
    expect(radio(wrapper, 'admin').checked).toBe(true)
    expect(afterSaving(wrapper)).toBe(false)
    expect(crmLine(wrapper)).toBe('5 total · 4 used · 1 left')
    wrapper.unmount()
  })

  it('switching to CRM Basic is always allowed — and Administrator stays open, it is their own seat', async () => {
    // Administrator limit full (Owner + Fajar on 2 Administrator-capable seats).
    setCrmSubscription({ ...defaultCrmSubscriptionState(), snapshot: { ...defaultCrmSubscriptionState().snapshot, includedSeats: 2, basicAddons: 5 } })
    const wrapper = await mountPage(EDIT_STATE_USER_ID)
    expect(radio(wrapper, 'basic').disabled).toBe(false)
    change(wrapper, 'input[data-test-id="inv-crm-basic-radio"]')
    await flushPromises()
    expect(chips(wrapper, 'existing')).toContain('CRM Basic')
    expect(radio(wrapper, 'admin').disabled).toBe(false)
    change(wrapper, 'input[data-test-id="inv-crm-admin-radio"]')
    await flushPromises()
    expect(chips(wrapper, 'existing')).toContain('CRM Administrator')
    wrapper.unmount()
  })

  it('switching Basic → Administrator is disabled unless the Administrator limit has room', async () => {
    setCrmSubscription({ ...defaultCrmSubscriptionState(), snapshot: { ...defaultCrmSubscriptionState().snapshot, includedSeats: 2, basicAddons: 5 } })
    let wrapper = await mountPage('au-5') // Bayu, CRM Basic
    expect(radio(wrapper, 'basic').checked).toBe(true)
    expect(radio(wrapper, 'admin').disabled).toBe(true)
    expect(txt(wrapper, 'inv-crm-admin-note')).toBe('No CRM Administrator seat left')
    wrapper.unmount()
    setCrmSubscription(defaultCrmSubscriptionState()) // 2 of 5 Administrator seats used → room
    wrapper = await mountPage('au-5')
    expect(radio(wrapper, 'admin').disabled).toBe(false)
    change(wrapper, 'input[data-test-id="inv-crm-admin-radio"]')
    await flushPromises()
    expect(chips(wrapper, 'existing')).toContain('CRM Administrator')
    wrapper.unmount()
  })

  it('unticking CRM frees a seat in the preview, and Save keeps the change', async () => {
    const wrapper = await openState(9)
    change(wrapper, 'input[data-test-id="inv-crm-checkbox"]', false)
    await flushPromises()
    expect(txt(wrapper, 'inv-seat-title')).toBe('Seat usage (after saving)')
    expect(crmLine(wrapper)).toBe('5 total · 3 used · 2 left')
    expect(card(wrapper, 'seat-usage-crm-upto')).toBe('Up to 2 can be CRM Administrator')
    expect(erpLine(wrapper)).toBe('10 total · 8 used · 2 left') // still has Ultimate
    // Re-tick → back to their saved level, CRM Administrator.
    change(wrapper, 'input[data-test-id="inv-crm-checkbox"]', true)
    await flushPromises()
    expect(radio(wrapper, 'admin').checked).toBe(true)
    change(wrapper, 'input[data-test-id="inv-crm-basic-radio"]')
    await flushPromises()
    vi.useFakeTimers()
    await wrapper.find('[data-test-id="inv-save"]').trigger('click')
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()
    await flushPromises()
    expect(getAccountUser(EDIT_STATE_USER_ID)!.crmRole).toBe('basic')
    wrapper.unmount()
  })
})

describe('10. Over quota (after a reduction)', () => {
  it('"5 total · 7 used · 2 over" in the warning colour; CRM disabled for new users with the note', async () => {
    const wrapper = await openState(10)
    expect(crmLine(wrapper)).toBe('5 total · 7 used · 2 over')
    expect(wrapper.find('[data-test-id="seat-usage-crm-usage"]').classes()).toContain('sus-over')
    expect(card(wrapper, 'seat-usage-crm-upto')).toBe('')
    expect(crmBox(wrapper).disabled).toBe(true)
    expect(txt(wrapper, 'inv-crm-note')).toBe('Remove CRM from some users or contact Sales to add seats.')
    expect(reasonOf(wrapper, 'input[data-test-id="inv-crm-checkbox"]')).toBe('Remove CRM from some users or contact Sales to add seats.')
    wrapper.unmount()
  })

  it('existing users are kept: everyone still holds CRM, and an existing CRM user stays editable', async () => {
    selectInviteState('10')
    expect(crmUsage(accountUsers).total).toBe(7)
    const wrapper = await mountPage('au-5') // Bayu, CRM Basic
    expect(crmBox(wrapper).checked).toBe(true)
    expect(crmBox(wrapper).disabled).toBe(false)
    expect(wrapper.find('[data-test-id="inv-crm-note"]').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('11. CRM expired', () => {
  it('disabled for new users with "CRM subscription has ended. Contact Sales to renew."', async () => {
    const wrapper = await openState(11)
    expect(crmTickShown(wrapper)).toBe(false)
    expect(crmBox(wrapper).disabled).toBe(true)
    expect(txt(wrapper, 'inv-crm-note')).toBe('CRM subscription has ended. Contact Sales to renew.')
    expect(reasonOf(wrapper, 'input[data-test-id="inv-crm-checkbox"]')).toBe('CRM subscription has ended. Contact Sales to renew.')
    wrapper.unmount()
  })

  it('read-only for a user who already has CRM: still ticked, level shown, nothing changeable', async () => {
    selectInviteState('11')
    const wrapper = await mountPage(EDIT_STATE_USER_ID)
    expect(crmTickShown(wrapper)).toBe(true)
    expect(crmBox(wrapper).disabled).toBe(true)
    expect(radio(wrapper, 'admin').checked).toBe(true)
    expect(radio(wrapper, 'admin').disabled).toBe(true)
    expect(radio(wrapper, 'basic').disabled).toBe(true)
    expect(txt(wrapper, 'inv-crm-note')).toBe('CRM subscription has ended. Contact Sales to renew.')
    wrapper.unmount()
  })
})

describe('12. Custom role editor', () => {
  it('opens the Custom role tab with the "Add custom role" drawer', () => {
    selectInviteState('12')
    expect(router.push).toHaveBeenCalledWith('/users-and-roles?tab=Custom%20role')
    expect(useCustomRoleDrawer().isOpen.value).toBe(true)
  })

  it('the drawer lists the feature groups with no CRM features', async () => {
    // ErpDrawer is Nuxt auto-imported in the SFC — register it, and keep the drawer in the wrapper.
    const wrapper = mount(CustomRoleDrawer, {
      props: { id: 'crd-test', isOpen: true, roleId: null },
      global: { components: { ErpDrawer }, stubs: { Teleport: true } },
    })
    await flushPromises()
    const groups = wrapper.findAll('.crd-td-label--category').map((el) => el.text().trim())
    expect(groups).toEqual(AUTHORITY_CATEGORIES.map((c) => c.label))
    expect(groups.some((g) => /crm/i.test(g))).toBe(false)
    expect(wrapper.find('[data-test-id="crd-crm-note"]').text()).toContain("CRM access isn't part of custom roles.")
    const matrix = wrapper.find('table').text()
    expect(matrix).not.toMatch(/Access to CRM|CRM module|Deals|Pipelines/)
    wrapper.unmount()
  })
})
