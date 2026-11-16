// @vitest-environment happy-dom
/**
 * Invite / Edit user — the CRM role section and the seat checks on save
 * (PRD US-001 AC-01/02, US-002 AC-03/04, US-003 AC-03/07, US-010 AC-03,
 * US-011 AC-01).
 *
 * Mounts the real InviteUserPage. The CRM add-on state is the shared mock
 * Billing singleton, set per test with setCrmSubscription(); tests/setup.ts
 * already provides the Vue globals and a `useLocale` identity stub, so only
 * the page's Nuxt-only auto-imports are stubbed here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import InviteUserPage from '~/components/pages/InviteUserPage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import UsersListPage from '~/components/pages/UsersListPage.vue'
import { useTableState } from '~/composables/useTableState'
import SeatContactSalesModal from '~/components/patterns/SeatContactSalesModal.vue'
import {
  defaultCrmSubscriptionState, setCrmSubscription, erpUsage, type CrmSubscriptionState,
} from '~/data/crmSubscription'
import { accountUsers, deleteAccountUser } from '~/data/usersRoles'
import { useCrmSubscriptionScenario } from '~/composables/useCrmSubscriptionScenario'

vi.stubGlobal('useRouter', () => ({ push: vi.fn() }))
vi.stubGlobal('useRoute', () => ({ query: {}, path: '/users-and-roles/invite' }))
vi.stubGlobal('useTableState', useTableState)
vi.stubGlobal('useApprovalWorkflowScenario', () => ({ projectAccountingEnabled: { value: true } }))
class FakeObserver { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', FakeObserver)
vi.stubGlobal('IntersectionObserver', FakeObserver)

function billing(patch: Partial<CrmSubscriptionState> = {}, snap: Partial<CrmSubscriptionState['snapshot']> = {}) {
  const base = defaultCrmSubscriptionState()
  setCrmSubscription({ ...base, ...patch, snapshot: { ...base.snapshot, ...snap } })
}

const seededIds = new Set(accountUsers.map((u) => u.id))
afterEach(() => {
  // Drop users a test invited, so every test starts from the seed.
  for (const u of [...accountUsers]) if (!seededIds.has(u.id)) deleteAccountUser(u.id)
  billing()
})
beforeEach(() => billing())

/** Seat usage card row text (label + value), whitespace-collapsed. */
function cardRow(wrapper: ReturnType<typeof mount>, id: string) {
  const row = wrapper.find(`[data-test-id="inv-seat-card"] [data-test-id="${id}"]`)
  return row.exists() ? row.text().replace(/\s+/g, ' ').trim() : ''
}

async function mountInvite() {
  const wrapper = mount(InviteUserPage, { props: { orderId: 'invite' }, attachTo: document.body })
  await flushPromises()
  return wrapper
}

/** Pick a radio (MpRadio, like MpCheckbox, binds `change` to the native input). */
function pick(wrapper: ReturnType<typeof mount>, testId: string) {
  const input = wrapper.find(`input[data-test-id="${testId}"]`)
  expect(input.exists(), `${testId} radio`).toBe(true)
  const el = input.element as HTMLInputElement
  el.checked = true
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** MpCheckbox binds its Vue `change` straight to the native input's onChange;
 *  its `data-test-id` falls through to that native input. */
function tick(wrapper: ReturnType<typeof mount>, testId: string) {
  const input = wrapper.find(`input[data-test-id="${testId}"]`)
  expect(input.exists(), `${testId} checkbox`).toBe(true)
  const el = input.element as HTMLInputElement
  el.checked = !el.checked
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

async function fillUser(wrapper: ReturnType<typeof mount>, name: string, email: string) {
  // MpFormControl's id lands on the native input.
  await wrapper.find('input#inv-name').setValue(name)
  await wrapper.find('input#inv-email').setValue(email)
}

function setExistingRole(wrapper: ReturnType<typeof mount>, on: boolean, roleId = 'accountant') {
  const input = wrapper.find(`input#inv-role-${roleId}`)
  expect(input.exists(), `role ${roleId}`).toBe(true)
  const el = input.element as HTMLInputElement
  el.checked = on
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

async function clickInvite(wrapper: ReturnType<typeof mount>) {
  vi.useFakeTimers()
  const btn = wrapper.findAll('button').find((b) => b.text() === 'Invite user')
  expect(btn, 'Invite user button').toBeDefined()
  await btn!.trigger('click')
  await vi.advanceTimersByTimeAsync(600)
  vi.useRealTimers()
  await flushPromises()
}

describe('CRM section visibility (US-001)', () => {
  it('is hidden, with no CRM seat counter, when the company has no CRM add-on', async () => {
    billing({}, { package: 'none' })
    const wrapper = await mountInvite()
    expect(wrapper.find('[data-test-id="inv-crm-row"]').exists()).toBe(false)
    // The Seat usage card keeps ERP and drops its CRM part.
    expect(cardRow(wrapper, 'seat-usage-crm')).toBe('')
    expect(cardRow(wrapper, 'seat-usage-erp')).toContain('10 total · 8 used · 2 left')
    wrapper.unmount()
  })

  it('is hidden for a seat add-on without CRM Essential', async () => {
    billing({}, { package: 'seat-addon-only' })
    const wrapper = await mountInvite()
    expect(wrapper.find('[data-test-id="inv-crm-row"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('is shown with CRM Essential, with the CRM seat counter (US-002 AC-01/02)', async () => {
    const wrapper = await mountInvite()
    expect(wrapper.find('[data-test-id="inv-crm-row"]').exists()).toBe(true)
    const seats = cardRow(wrapper, 'seat-usage-crm')
    // Default demo: Owner + 3 CRM users on CRM Essential (5 included seats).
    expect(seats).toContain('5 total · 4 used · 1 left')
    expect(seats).toContain('Up to 1 can be CRM Administrator')
    wrapper.unmount()
  })
})

describe('"CRM access level" radios (CRM add-on spec)', () => {
  it('appear only once CRM is ticked, with CRM Administrator selected by default', async () => {
    const wrapper = await mountInvite()
    const radio = (id: string) => wrapper.find(`input[data-test-id="${id}"]`).element as HTMLInputElement
    expect(wrapper.find('[data-test-id="inv-crm-level"]').exists()).toBe(false)
    tick(wrapper, 'inv-crm-checkbox')
    await flushPromises()
    expect(wrapper.find('[data-test-id="inv-crm-level"]').text()).toMatch(/^CRM access level\s*CRM Basic\s*CRM Administrator$/)
    expect(radio('inv-crm-admin-radio').checked).toBe(true)
    expect(radio('inv-crm-basic-radio').checked).toBe(false)
    expect(radio('inv-crm-basic-radio').disabled).toBe(false)
    expect(radio('inv-crm-admin-radio').disabled).toBe(false)
    wrapper.unmount()
  })

  it('describes CRM in the four spec lines, with no permission bullets', async () => {
    const wrapper = await mountInvite()
    const row = wrapper.find('[data-test-id="inv-crm-row"]')
    const lines = row.findAll('[data-test-id="inv-crm-description"] p').map((p) => p.text())
    expect(lines).toEqual([
      'Use Mekari CRM from the product switcher.',
      'CRM Basic: use CRM without CRM Settings.',
      'CRM Administrator: use CRM, including CRM Settings.',
      'Detailed CRM permissions are set in CRM.',
    ])
    expect(row.find('li li').exists(), 'no bullets inside the row').toBe(false)
    expect(row.text()).not.toContain('CRM Manager')
    expect(row.text()).not.toContain('Default crm authority')
    wrapper.unmount()
  })

  it('shows the CRM level in the "Selected roles" card next to the ticked Existing roles', async () => {
    const wrapper = await mountInvite()
    setExistingRole(wrapper, true, 'ultimate')
    tick(wrapper, 'inv-crm-checkbox')
    await flushPromises()
    const existing = wrapper.find('[data-test-id="inv-selected-existing"]').text()
    expect(existing).toContain('Ultimate')
    expect(existing).toContain('CRM Administrator')
    pick(wrapper, 'inv-crm-basic-radio')
    await flushPromises()
    expect(wrapper.find('[data-test-id="inv-selected-existing"]').text()).toContain('CRM Basic')
    expect(wrapper.find('[data-test-id="inv-selected-existing"]').text()).not.toContain('CRM Administrator')
    wrapper.unmount()
  })
})

describe('CRM is a row in the Existing role list (US-011)', () => {
  it('renders inside the same list as Ultimate; the old inline seat lines under Role are gone', async () => {
    const wrapper = await mountInvite()
    const list = wrapper.find('input#inv-role-ultimate').element.closest('ul')!
    expect(list.querySelector('[data-test-id="inv-crm-row"]'), 'CRM row inside the Existing role list').not.toBeNull()
    expect(wrapper.find('[data-test-id="inv-crm-seats"]').exists()).toBe(false)
    expect(wrapper.find('[data-test-id="inv-erp-seats"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('ERP seats:')
    expect(wrapper.text()).not.toContain('CRM seats:')
    wrapper.unmount()
  })

  it('keeps Ultimate and CRM both ticked, and saves both (ERP seat + CRM seat)', async () => {
    const wrapper = await mountInvite()
    await fillUser(wrapper, 'Utami Wulan', 'utami.wulan@mekari.com')
    setExistingRole(wrapper, true, 'ultimate')
    tick(wrapper, 'inv-crm-checkbox')
    await flushPromises()
    expect((wrapper.find('input#inv-role-ultimate').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('input[data-test-id="inv-crm-checkbox"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.find('input[data-test-id="inv-crm-checkbox"]').element as HTMLInputElement).disabled).toBe(false)
    await clickInvite(wrapper)
    const added = accountUsers.find((u) => u.email === 'utami.wulan@mekari.com')
    expect(added?.systemRoleIds).toEqual(['ultimate'])
    expect(added?.crmRole).toBe('admin') // CRM Administrator is the default level
    wrapper.unmount()
  })

  it('keeps the CRM choice when switching to the Custom role tab, so custom role + CRM saves', async () => {
    const wrapper = await mountInvite()
    await fillUser(wrapper, 'Kurnia Sari', 'kurnia.sari@mekari.com')
    tick(wrapper, 'inv-crm-checkbox')
    await flushPromises()
    const customTab = wrapper.findAll('button, [role="tab"]').find((b) => b.text().startsWith('Custom'))
    expect(customTab, 'Custom tab').toBeDefined()
    await customTab!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test-id="inv-custom-crm-hint"]').text()).toContain('CRM access is set in Existing role.')
    const custom = wrapper.find('input#inv-custom-cr-2').element as HTMLInputElement
    custom.checked = true
    custom.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await clickInvite(wrapper)
    const added = accountUsers.find((u) => u.email === 'kurnia.sari@mekari.com')
    expect(added?.customRoleIds).toEqual(['cr-2'])
    expect(added?.systemRoleIds).toEqual([])
    expect(added?.crmRole).toBe('admin')
    wrapper.unmount()
  })
})

describe('blocked options are disabled up front; the save check stays as a safety net (US-002 AC-03/04)', () => {
  const input = (w: ReturnType<typeof mount>, sel: string) => w.find(sel).element as HTMLInputElement

  it('disables CRM for a new user when the CRM seats are used up, with the reason inline', async () => {
    billing({}, { includedSeats: 4 }) // 4 seats, 4 used → full
    const wrapper = await mountInvite()
    expect(input(wrapper, 'input[data-test-id="inv-crm-checkbox"]').disabled).toBe(true)
    expect(wrapper.find('[data-test-id="inv-crm-note"]').text()).toMatch(/No CRM seats left\.\s*Contact Sales\s*to add seats\./)
    wrapper.unmount()
  })

  it('still blocks on save when the seats ran out after CRM was ticked — and never traps the ticked box', async () => {
    const before = accountUsers.length
    const wrapper = await mountInvite()
    await fillUser(wrapper, 'Sari Indah', 'sari.indah@mekari.com')
    tick(wrapper, 'inv-crm-checkbox')
    await flushPromises()
    billing({}, { includedSeats: 3 }) // Billing reports fewer seats while the form is open
    await flushPromises()
    expect(input(wrapper, 'input[data-test-id="inv-crm-checkbox"]').disabled, 'ticked CRM stays untickable').toBe(false)
    await clickInvite(wrapper)
    const err = wrapper.find('[data-test-id="inv-crm-seat-error"]')
    expect(err.text()).toContain('No CRM seats left')
    expect(err.text()).toContain('Contact Sales')
    expect(accountUsers.length).toBe(before) // nothing saved
    wrapper.unmount()
  })

  it('disables CRM Administrator (not CRM Basic) when only the Administrator limit is full, and picks Basic (US-003 AC-07)', async () => {
    // 2 included + 5 Basic add-ons = 7 total, 2 Administrator-capable (Owner + Fajar).
    billing({}, { includedSeats: 2, basicAddons: 5, adminAddons: 0 })
    const wrapper = await mountInvite()
    await fillUser(wrapper, 'Sari Indah', 'sari.indah@mekari.com')
    tick(wrapper, 'inv-crm-checkbox')
    await flushPromises()
    expect(input(wrapper, 'input[data-test-id="inv-crm-admin-radio"]').disabled).toBe(true)
    expect(input(wrapper, 'input[data-test-id="inv-crm-basic-radio"]').checked).toBe(true)
    expect(wrapper.find('[data-test-id="inv-crm-admin-note"]').text()).toBe('No CRM Administrator seat left')
    await clickInvite(wrapper)
    expect(accountUsers.find((u) => u.email === 'sari.indah@mekari.com')?.crmRole).toBe('basic')
    wrapper.unmount()
  })

  it('disables the ERP roles when the ERP limit is full, but a CRM-only invite still saves (US-010 AC-03)', async () => {
    billing({ erpUserLimit: erpUsage(accountUsers) })
    const wrapper = await mountInvite()
    await fillUser(wrapper, 'Budi Santoso', 'budi.santoso@mekari.com')
    expect(input(wrapper, 'input#inv-role-accountant').disabled).toBe(true)
    expect(wrapper.find('[data-test-id="inv-erp-note"]').text()).toBe('No ERP seats left')
    expect(input(wrapper, 'input[data-test-id="inv-crm-checkbox"]').disabled).toBe(false)
    tick(wrapper, 'inv-crm-checkbox')
    await flushPromises()
    await clickInvite(wrapper)
    const added = accountUsers.find((u) => u.email === 'budi.santoso@mekari.com')
    expect(added).toBeDefined()
    expect(added!.systemRoleIds).toEqual([])
    expect(added!.crmRole).toBe('admin')
    wrapper.unmount()
  })

  it('still blocks an ERP invite on save when the ERP limit filled up after the role was ticked', async () => {
    const wrapper = await mountInvite()
    await fillUser(wrapper, 'Budi Santoso', 'budi.santoso@mekari.com')
    setExistingRole(wrapper, true)
    await flushPromises()
    billing({ erpUserLimit: erpUsage(accountUsers) })
    await flushPromises()
    expect(input(wrapper, 'input#inv-role-accountant').disabled, 'ticked ERP role stays untickable').toBe(false)
    await clickInvite(wrapper)
    expect(wrapper.find('[data-test-id="inv-erp-seat-error"]').text()).toContain('ERP user limit is full')
    expect(accountUsers.some((u) => u.email === 'budi.santoso@mekari.com')).toBe(false)
    wrapper.unmount()
  })
})

describe('"Seat usage" card on Invite / Edit user (US-002)', () => {
  it('sits in the right column ABOVE "Selected roles"', async () => {
    const wrapper = await mountInvite()
    const card = wrapper.find('[data-test-id="inv-seat-card"]').element
    const selected = wrapper.find('[data-test-id="inv-selected-roles"]').element
    expect(card.closest('aside'), 'card in the aside').not.toBeNull()
    expect(card.compareDocumentPosition(selected) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    wrapper.unmount()
  })

  it('shows ERP and CRM users, where the CRM seats come from and the Administrator headroom (default 10 / 5)', async () => {
    const wrapper = await mountInvite()
    expect(cardRow(wrapper, 'seat-usage-erp')).toMatch(/ERP users\s*10 total · 8 used · 2 left/)
    const crm = cardRow(wrapper, 'seat-usage-crm')
    expect(crm).toMatch(/CRM users\s*5 total · 4 used · 1 left/)
    expect(cardRow(wrapper, 'seat-usage-crm-capacity')).toBe('5 included')
    expect(crm).not.toMatch(/of \d+ used/) // no "CRM Administrator: N of 5 used" line
    expect(cardRow(wrapper, 'seat-usage-crm-upto')).toBe('Up to 1 can be CRM Administrator')
    expect(wrapper.find('[data-test-id="inv-seat-card"]').text()).toContain('Need more ERP or CRM seats?')
    expect(wrapper.find('[data-test-id="inv-seat-after-saving"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('previews the counts live "(after saving)" as roles are ticked', async () => {
    const wrapper = await mountInvite()
    tick(wrapper, 'inv-crm-checkbox') // CRM Administrator, CRM only → CRM seat, no ERP seat
    await flushPromises()
    expect(cardRow(wrapper, 'seat-usage-crm')).toContain('5 total · 5 used · 0 left')
    expect(cardRow(wrapper, 'seat-usage-crm')).not.toContain('Up to 0')
    expect(cardRow(wrapper, 'seat-usage-erp')).toContain('10 total · 8 used · 2 left')
    expect(wrapper.find('[data-test-id="inv-seat-after-saving"]').text()).toContain('(after saving)')
    setExistingRole(wrapper, true, 'accountant') // + an ERP role → ERP seat too
    await flushPromises()
    expect(cardRow(wrapper, 'seat-usage-erp')).toContain('10 total · 9 used · 1 left')
    wrapper.unmount()
  })

  it('reads "No limit on trial" on an ERP trial and "CRM expired" once CRM expired', async () => {
    billing({ erpOnTrial: true }, { package: 'expired' })
    const wrapper = await mountInvite()
    expect(cardRow(wrapper, 'seat-usage-erp')).toContain('No limit on trial')
    expect(cardRow(wrapper, 'seat-usage-crm')).toContain('CRM expired')
    wrapper.unmount()
  })

  it('opens Contact Sales for ERP or CRM seats from the card link', async () => {
    const wrapper = await mountInvite()
    await wrapper.find('[data-test-id="inv-seat-contact-sales"]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-test-id="seat-contact-sales-body"]')!.textContent).toContain('ERP or CRM user seats')
    wrapper.unmount()
  })
})

describe('Contact Sales covers ERP seats too', () => {
  it('the default Contact Sales copy is about ERP or CRM user seats', async () => {
    const wrapper = mount(SeatContactSalesModal, { props: { isOpen: true }, attachTo: document.body })
    await flushPromises()
    const body = document.body.querySelector('[data-test-id="seat-contact-sales-body"]')!.textContent!
    expect(body).toContain('ERP or CRM user seats')
    wrapper.unmount()
  })

  it('an ERP-limit block (save-time safety net) offers Contact Sales for ERP seats', async () => {
    const wrapper = await mountInvite()
    await fillUser(wrapper, 'Rina Putri', 'rina.putri@mekari.com')
    setExistingRole(wrapper, true)
    await flushPromises()
    billing({ erpUserLimit: erpUsage(accountUsers) }) // limit filled while the form was open
    await flushPromises()
    await clickInvite(wrapper)
    const err = wrapper.find('[data-test-id="inv-erp-seat-error"]')
    expect(err.text()).toContain('contact Sales to add ERP seats')
    await err.find('a').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[data-test-id="seat-contact-sales-body"]')!.textContent)
      .toContain('To add ERP user seats')
    wrapper.unmount()
  })
})

describe('"Owner + 5 CRM Administrators (PRD example)" preset', () => {
  const { applyPreset, crmSummary } = useCrmSubscriptionScenario()
  afterEach(() => applyPreset('essential'))

  it('sets 8 total · 6 used · 2 left with Administrator 6 of 6, so the "Up to" line is hidden', async () => {
    applyPreset('prd-admins')
    expect(crmSummary.value).toMatchObject({ total: 8, used: 6, left: 2, adminLeft: 0, adminUsed: 6, adminTotal: 6 })
    expect(erpUsage(accountUsers)).toBe(8) // ERP stays within its limit of 10
    const wrapper = await mountInvite()
    expect(cardRow(wrapper, 'seat-usage-crm-capacity')).toBe('5 included + 2 Basic, + 1 Administrator add-on')
    expect(cardRow(wrapper, 'seat-usage-crm-upto')).toBe('')
    wrapper.unmount()
  })

  it('disables a new CRM Administrator, auto-selects and saves CRM Basic', async () => {
    applyPreset('prd-admins')
    const wrapper = await mountInvite()
    await fillUser(wrapper, 'Prima Dewa', 'prima.dewa@mekari.com')
    tick(wrapper, 'inv-crm-checkbox')
    await flushPromises()
    expect((wrapper.find('input[data-test-id="inv-crm-admin-radio"]').element as HTMLInputElement).disabled).toBe(true)
    expect((wrapper.find('input[data-test-id="inv-crm-basic-radio"]').element as HTMLInputElement).checked).toBe(true)
    await clickInvite(wrapper)
    expect(accountUsers.find((u) => u.email === 'prima.dewa@mekari.com')?.crmRole).toBe('basic')
    wrapper.unmount()
  })

  it('switching back to the default preset restores the default seed (ERP 8/10, CRM 4/5)', () => {
    applyPreset('prd-admins')
    applyPreset('essential')
    expect(crmSummary.value).toMatchObject({ total: 5, used: 4, left: 1, adminUsed: 2 })
    expect(erpUsage(accountUsers)).toBe(8)
  })
})

describe('User list matches production (Role chips carry the CRM tier)', () => {
  async function mountList() {
    vi.useFakeTimers()
    const wrapper = mount(UsersListPage, { attachTo: document.body })
    await vi.advanceTimersByTimeAsync(800) // first-load skeleton
    vi.useRealTimers()
    await flushPromises()
    return wrapper
  }
  const headers = (w: ReturnType<typeof mount>) => w.findAll('th').map((th) => th.text().trim()).filter(Boolean)
  const roles = (w: ReturnType<typeof mount>, id: string) => w.find(`[data-test-id="usr-roles-${id}"]`).text()

  it('has the production columns and no separate CRM access column or filter', async () => {
    const wrapper = await mountList()
    const h = headers(wrapper).join(' | ')
    for (const label of ['User name', 'Role', 'Access time limits', 'Status', 'Type']) expect(h).toContain(label)
    expect(h).not.toContain('CRM access')
    expect(h).not.toContain('List manager')
    expect(wrapper.find('#usr-crm-filter').exists()).toBe(false)
    expect(wrapper.find('[data-test-id="usr-actions-au-2"]').text()).toContain('Actions')
    expect(wrapper.find('[data-test-id="usr-type-au-2"]').text()).toBe('Member')
    expect(wrapper.find('[data-test-id="usr-type-au-13"]').text()).toBe('Partner')
    expect(wrapper.find('[data-test-id="seat-usage-trigger"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('"All types" offers production\'s account types and filters the Type column to match', async () => {
    const wrapper = await mountList()
    const filter = wrapper.findAllComponents(ErpFilterSelect).find((c) => c.props('id') === 'usr-type-filter')!
    expect((filter.props('options') as { label: string }[]).map((o) => o.label)).toEqual(['Member', 'Partner'])
    expect(filter.props('placeholder')).toBe('All types')
    filter.vm.$emit('update:modelValue', 'partner')
    await flushPromises()
    const types = wrapper.findAll('[data-test-id^="usr-type-"]').map((c) => c.text())
    expect(types.length).toBeGreaterThan(0)
    expect(new Set(types)).toEqual(new Set(['Partner']))
    filter.vm.$emit('update:modelValue', 'member')
    await flushPromises()
    expect(new Set(wrapper.findAll('[data-test-id^="usr-type-"]').map((c) => c.text()))).toEqual(new Set(['Member']))
    wrapper.unmount()
  })

  it('has no "Seat usage" button in the title bar (seat counts live on Invite / Edit user)', () => {
    const slug = readFileSync(resolve(__dirname, '../app/pages/[...slug].vue'), 'utf8')
    const block = slug.slice(slug.indexOf("currentPageKey === 'Users and roles'\" class=\"page-title-actions\""))
    const titleBar = block.slice(0, block.indexOf('</div>'))
    expect(titleBar).toContain("t('Add custom role')")
    expect(titleBar).toContain("t('Invite user')")
    expect(titleBar).not.toContain('Seat usage')
    expect(slug).not.toContain('SeatUsageModal')
  })

  it('shows the CRM tier as a Role chip after the ERP roles', async () => {
    const wrapper = await mountList()
    expect(roles(wrapper, 'au-1')).toContain('Owner')
    expect(roles(wrapper, 'au-1')).toContain('CRM Administrator') // Owner always holds CRM Administrator
    expect(roles(wrapper, 'au-10')).toMatch(/Ultimate[\s\S]*CRM Administrator/)
    expect(wrapper.text()).not.toContain('CRM Manager')
    expect(roles(wrapper, 'au-12').trim()).toBe('CRM Basic') // CRM-only user: only the CRM chip
    expect(roles(wrapper, 'au-9')).toMatch(/Administrator[\s\S]*List manager/)
    expect(roles(wrapper, 'au-9')).not.toContain('CRM')
    wrapper.unmount()
  })

  it('drops the CRM chips when the company has no CRM add-on', async () => {
    billing({}, { package: 'none' })
    const wrapper = await mountList()
    expect(roles(wrapper, 'au-1')).not.toContain('CRM')
    expect(roles(wrapper, 'au-12').trim()).toBe('-')
    wrapper.unmount()
  })
})
