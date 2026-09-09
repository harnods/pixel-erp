<script setup lang="ts">
/**
 * CRM (Qontak) — Settings section shell (/crm/settings/:section).
 *
 * The CRM sidebar provides the level-2 nav (Company profile · User & roles ·
 * Teams · Custom views · Integrations) and routes to
 * `/crm/settings/{company,users,teams,views,integrations}`. `[...slug].vue`
 * binds the active section id to `:order-id` (default 'company').
 *
 * This is a full-bleed CRM page: it owns its `.detail-bar` title bar + a
 * scrollable `.detail-stage`, mirroring CrmCustomerDetailPage's shell. Each
 * section renders inside the padded stage via `v-if`.
 *
 * • company       → mirrors the ERP Company profile page by REUSING it
 *                   (<SettingsCompanyProfilePage />) — not reimplemented.
 * • users         → roster grounded in CRM_OWNERS.
 * • teams         → team cards grounded in CRM_OWNERS.
 * • views         → illustrative saved views for Deals.
 * • integrations  → connection cards (WhatsApp, Email, Jurnal, Klikpajak, Marketplace).
 */
import { computed, reactive, ref } from 'vue'
import {
  MpButton, MpIcon, MpCheckbox,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import SettingsCompanyProfilePage from '~/components/pages/SettingsCompanyProfilePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import CrmTeamFormDrawer, { type CrmTeamDraft } from '~/components/patterns/CrmTeamFormDrawer.vue'
import CrmUserAccessDrawer from '~/components/patterns/CrmUserAccessDrawer.vue'
import {
  CRM_OWNERS,
  crmTeams, CRM_TEAM_MODULES, type CrmTeam,
  crmTeamMemberOptions, teamMemberNames, teamNamesForPerson,
  upsertCrmTeam, crmTeamNameExists, setCrmTeamStatus, persistCrmTeams,
  type CrmPermSet, fullPermSet, defaultPermSet, permSummary,
} from '~/data/crm'
import { infoToast, successToast } from '~/utils/toasts'
import { formatDate } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

function soon(what: string) { infoToast(`${what} — coming soon`) }

const section = computed(() => props.orderId || 'company')

const TITLES: Record<string, string> = {
  company: 'Company profile',
  users: 'Users',
  teams: 'Teams',
  views: 'Custom views',
  integrations: 'Integrations',
}
const title = computed(() => t(TITLES[section.value] ?? 'Settings'))

// slugify a person's name → local-part of an email (dewi.lestari@…)
function emailFor(name: string): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, '.')}@centralperk.co.id`
}

// ── User & roles — CRM has NO CRM-roles: access is a per-module permission matrix.
// (ERP role is a separate, read-only column sourced from the ERP account.) ──
type CrmUser = {
  id: string; name: string; email: string; empId: string
  role: string; teams: string[]; modules: string[]; status: string; joinDate: string; lastUpdated: string
  perms: CrmPermSet; accessLabel: string
}

// Per-user permission sets (persisted). The workspace owner (first user) gets full
// access by default; everyone else the read-only baseline.
const PERMS_KEY = 'crm-user-perm-set-v1'
const userPermSet = reactive<Record<string, CrmPermSet>>(
  import.meta.client ? (() => { try { return JSON.parse(localStorage.getItem(PERMS_KEY) || '{}') } catch { return {} } })() : {},
)
function permSetOf(id: string, i: number): CrmPermSet {
  return userPermSet[id] ?? (i === 0 ? fullPermSet() : defaultPermSet())
}

// ERP role — sourced from the ERP account (read-only here). The workspace owner is
// the Company Owner; everyone else cycles through the standard ERP roles.
const ERP_ROLE_CYCLE = ['Sales', 'Sales Manager', 'Marketing', 'Admin']

// A user's effective CRM access is Enabled unless every permission is off.
function accessEnabled(perms: CrmPermSet): boolean {
  return Object.values(perms).some(Boolean)
}

// Effective CRM modules a user can open: Reports + Contacts are always available
// company-wide; Deals is added only when the user is on an ACTIVE team that grants
// the deals module. When CRM access is disabled, the user reaches no modules.
function modulesForUser(empId: string, perms: CrmPermSet): string[] {
  if (!accessEnabled(perms)) return []
  const mods = ['Reports', 'Contacts']
  const hasDeals = !!empId && crmTeams.some(
    (tm) => tm.status === 'active' && tm.memberIds.includes(empId) && tm.modules.includes('deals'),
  )
  if (hasDeals) mods.push('Deals')
  return mods
}

// A user can belong to MANY teams — resolved from the real Teams store
// (teamNamesForPerson), so this column always matches the Teams index.
const crmUsers = computed<CrmUser[]>(() =>
  CRM_OWNERS.map((name, i) => {
    const id = `CU${String(i + 1).padStart(2, '0')}`
    const perms = permSetOf(id, i)
    const empId = empIdByName(name) ?? ''
    return {
      id,
      name,
      email: emailFor(name),
      empId,
      role: i === 0 ? 'Business owner' : ERP_ROLE_CYCLE[(i - 1) % ERP_ROLE_CYCLE.length]!,
      teams: teamNamesForPerson(name),
      modules: modulesForUser(empId, perms),
      status: i % 5 === 3 ? 'invited' : (i % 5 === 4 ? 'inactive' : 'active'),
      // deterministic, coherent mock (no Date.now)
      joinDate: `202${4 + (i % 2)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
      lastUpdated: `2026-0${1 + (i % 9)}-${String(1 + ((i * 7) % 27)).padStart(2, '0')}`,
      perms,
      accessLabel: permSummary(perms),
    }
  }),
)

// CRM access is intentionally NOT a column: every user in this list already has CRM
// access enabled (the roster is filtered to CRM-workspace-granted accounts), so an
// Enabled/Disabled column is redundant. Per-user access is edited from the row menu.
// Email shows as a caption under the Name cell (not a separate column).
const columns: TableColumn[] = [
  { key: 'name', label: 'Name', kind: 'name', sortable: true, sortType: 'text' },
  { key: 'role', label: 'ERP role', sortable: true, sortType: 'text' },
  { key: 'status', label: 'Status', kind: 'status', sortType: 'text' },
  { key: 'teams', label: 'Team', kind: 'tags' },
  { key: 'joinDate', label: 'Join date', kind: 'date', sortType: 'date' },
  { key: 'lastUpdated', label: 'Last updated', kind: 'date', sortType: 'date' },
]

// Filters: ERP role + Status + Team (multi-select) (left) + search (right). No
// CRM-access filter — the list is CRM-access-enabled by definition.
const roleFilter = ref('')
const teamFilter = ref<string[]>([])   // multi-select — match a user in ANY picked team
const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<CrmUser>(crmUsers, {
  filterFn: (row, s, status) =>
    (!s || row.name.toLowerCase().includes(s) || row.email.toLowerCase().includes(s))
    && (!status || row.status === status)
    && (!roleFilter.value || row.role === roleFilter.value)
    && (teamFilter.value.length === 0 || row.teams.some((tm) => teamFilter.value.includes(tm))),
})
sortKey.value = 'name'

// Team filter options — every CRM team name (matches the Team column + Teams index).
const TEAM_OPTS = computed(() => crmTeams.map((tm) => tm.name).sort((a, b) => a.localeCompare(b)))

const STATUS_OPTS = [
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'inactive', label: 'Inactive' },
]
// ERP role filter options — distinct roles present in the roster.
const ROLE_OPTS = computed(() =>
  [...new Set(crmUsers.value.map((u) => u.role))].map((r) => ({ value: r, label: r })),
)
const hasActiveUserFilter = computed(() => !!search.value || !!statusFilter.value || !!roleFilter.value || teamFilter.value.length > 0)
function clearUserFilters() { search.value = ''; statusFilter.value = ''; roleFilter.value = ''; teamFilter.value = [] }
const STATUS_LABEL: Record<string, string> = { active: 'Active', invited: 'Invited', inactive: 'Inactive' }

// Column settings (Name is locked visible). "Last updated" is hidden by default —
// turn it on from Column settings.
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, c.key !== 'lastUpdated'])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ── CRM access drawer — edit a user's permission matrix (persisted per user) ──
const accessDrawerOpen = ref(false)
const accessUser = ref<CrmUser | null>(null)
const accessDraft = reactive<CrmPermSet>({})
function openAccess(row: CrmUser) {
  accessUser.value = row
  // Clone the user's current perms into the working draft (edit in place, commit on save).
  for (const k of Object.keys(accessDraft)) delete accessDraft[k]
  Object.assign(accessDraft, row.perms)
  accessDrawerOpen.value = true
}
function saveAccess() {
  const u = accessUser.value
  if (!u) return
  userPermSet[u.id] = { ...accessDraft }
  if (import.meta.client) {
    try { localStorage.setItem(PERMS_KEY, JSON.stringify(userPermSet)) } catch { /* ignore */ }
  }
  accessDrawerOpen.value = false
  successToast(t('CRM access updated'))
}

// ── Manage teams modal — add/remove a user across all CRM teams ──
const userTeamsModalOpen = ref(false)
const userTeamsUser = ref<CrmUser | null>(null)
// Draft membership: team.id → is this user a member?
const userTeamsDraft = reactive<Record<string, boolean>>({})
function openUserTeams(row: CrmUser) {
  if (!row.empId) return
  userTeamsUser.value = row
  for (const k of Object.keys(userTeamsDraft)) delete userTeamsDraft[k]
  for (const tm of crmTeams) userTeamsDraft[tm.id] = tm.memberIds.includes(row.empId)
  userTeamsModalOpen.value = true
}
function saveUserTeams() {
  const u = userTeamsUser.value
  if (!u || !u.empId) { userTeamsModalOpen.value = false; return }
  for (const tm of crmTeams) {
    const shouldBeMember = !!userTeamsDraft[tm.id]
    const isMember = tm.memberIds.includes(u.empId)
    if (shouldBeMember && !isMember) {
      tm.memberIds = [...tm.memberIds, u.empId]
    } else if (!shouldBeMember && isMember) {
      tm.memberIds = tm.memberIds.filter((id) => id !== u.empId)
      tm.adminIds = tm.adminIds.filter((id) => id !== u.empId)
    }
  }
  persistCrmTeams()
  userTeamsModalOpen.value = false
  successToast(t('Teams updated'))
}

// ── Teams — a full ErpTablePage grounded in crmTeams (persisted) ──────────────
// The signed-in user (shown in the top bar) authors every create/edit.
const CURRENT_USER = 'Rizal Candra'
function nowStamp(): string { return new Date().toISOString().slice(0, 19) }

type TeamRow = CrmTeam & { moduleLabels: string[]; memberCount: number }
const teamRows = computed<TeamRow[]>(() =>
  crmTeams.map((tm) => ({
    ...tm,
    memberCount: tm.memberIds.length,
    moduleLabels: tm.modules.map((k) => CRM_TEAM_MODULES.find((m) => m.key === k)?.label ?? k),
  })),
)

// PRD §5.7: Team Name · Number of users · Accessible modules · Created Time · Status · Manage.
const teamColumns: TableColumn[] = [
  { key: 'name',        label: 'Team name',          kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'memberCount', label: 'No. of members',     kind: 'number', sortable: true, sortType: 'number' },
  { key: 'modules',     label: 'Accessible modules', kind: 'tags'                                        },
  { key: 'createdAt',   label: 'Created time',       kind: 'date',   sortable: true, sortType: 'date'   },
  { key: 'status',      label: 'Status',             kind: 'status', sortable: true, sortType: 'text'   },
]

// Filters: Status (left) + search (right).
const {
  search: teamSearch, statusFilter: teamStatusFilter,
  currentPage: teamPage, paginated: teamPaginated, total: teamTotal, perPage: teamPerPage,
  setPage: setTeamPage, setPerPage: setTeamPerPage, sortKey: teamSortKey, sortDir: teamSortDir,
  toggleSort: toggleTeamSort, setSort: setTeamSort,
} = useTableState<TeamRow>(teamRows, {
  filterFn: (row, s, status) =>
    (!s || row.name.toLowerCase().includes(s) || row.description.toLowerCase().includes(s))
    && (!status || row.status === status),
  defaultSort: { key: 'createdAt', dir: 'desc' },
})
const TEAM_STATUS_OPTS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]
const hasActiveTeamFilter = computed(() => !!teamSearch.value || !!teamStatusFilter.value)
function clearTeamFilters() { teamSearch.value = ''; teamStatusFilter.value = '' }

// Column settings (Team name locked visible).
const teamColumnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(teamColumns.map((c) => [c.key, true])))
const teamColumnItems = teamColumns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const teamVisibleColumns = computed<TableColumn[]>(() => teamColumns.filter((c) => teamColumnVisibility[c.key]))
function hideTeamColumn(key: string) { teamColumnVisibility[key] = false }

// Resolve the signed-in author to an employee id (for creator-as-admin preselect).
function empIdByName(name: string): string | undefined {
  return crmTeamMemberOptions.value.find((o) => o.name === name)?.id
}

// ── New / Edit team drawer ──
const teamFormOpen = ref(false)
const teamFormMode = ref<'create' | 'edit'>('create')
const editingTeamId = ref<string | null>(null)
const teamNameError = ref('')
const teamFormError = ref('')
const teamDraft = reactive<CrmTeamDraft>({ name: '', description: '', modules: [], memberIds: [], adminIds: [], status: 'active' })
const teamDraftMemberNames = computed(() => teamMemberNames(teamDraft.memberIds))

function openNewTeam() {
  teamFormMode.value = 'create'
  editingTeamId.value = null
  teamNameError.value = ''
  teamFormError.value = ''
  // PRD §5.8: the creator is preselected as a Team Admin (and therefore a member).
  const me = empIdByName(CURRENT_USER)
  Object.assign(teamDraft, { name: '', description: '', modules: [], memberIds: me ? [me] : [], adminIds: me ? [me] : [], status: 'active' })
  teamFormOpen.value = true
}
function openEditTeam(tm: TeamRow) {
  teamFormMode.value = 'edit'
  editingTeamId.value = tm.id
  teamNameError.value = ''
  teamFormError.value = ''
  Object.assign(teamDraft, { name: tm.name, description: tm.description, modules: [...tm.modules], memberIds: [...tm.memberIds], adminIds: [...tm.adminIds], status: tm.status })
  teamFormOpen.value = true
}
function saveTeam() {
  const name = teamDraft.name.trim()
  if (!name) { teamNameError.value = `${t('You must fill in')} ${t('team name')}`; return }
  if (crmTeamNameExists(name, editingTeamId.value ?? undefined)) {
    teamNameError.value = t('A team with this name already exists.'); return
  }
  // PRD §5.8/§5.9: a Team with members must keep at least one Team Admin.
  const admins = teamDraft.adminIds.filter((id) => teamDraft.memberIds.includes(id))
  if (teamDraft.memberIds.length && !admins.length) {
    teamFormError.value = t('Assign at least one Team Admin.'); return
  }
  const isEdit = teamFormMode.value === 'edit'
  upsertCrmTeam(
    { id: editingTeamId.value ?? undefined, name, description: teamDraft.description.trim(), memberIds: teamDraft.memberIds, adminIds: admins, modules: teamDraft.modules, status: teamDraft.status },
    CURRENT_USER, nowStamp(),
  )
  teamFormOpen.value = false
  successToast(isEdit ? t('Team updated') : t('Team created'))
}

// ── Member picker (SelectAccessDrawer) — opens on top of the form drawer, OR
// directly from the row "Assign members" action (persists immediately then). ──
const membersPickerOpen = ref(false)
const directAssignTeam = ref<TeamRow | null>(null)
function onPickMembers() { membersPickerOpen.value = true }
// Row action → skip the form, load the team and open the picker straight away.
function assignMembers(tm: TeamRow) {
  directAssignTeam.value = tm
  editingTeamId.value = tm.id
  Object.assign(teamDraft, { name: tm.name, description: tm.description, modules: [...tm.modules], memberIds: [...tm.memberIds], adminIds: [...tm.adminIds], status: tm.status })
  membersPickerOpen.value = true
}
function onMembersSaved(ids: string[]) {
  teamDraft.memberIds = ids
  // Drop admins who are no longer members (a Team Admin must be a member).
  teamDraft.adminIds = teamDraft.adminIds.filter((id) => ids.includes(id))
  membersPickerOpen.value = false
  // Direct assign (no form open) → persist the team's members right away.
  if (directAssignTeam.value) {
    const tm = directAssignTeam.value
    upsertCrmTeam(
      { id: tm.id, name: tm.name, description: tm.description, memberIds: ids, adminIds: teamDraft.adminIds, modules: tm.modules, status: tm.status },
      CURRENT_USER, nowStamp(),
    )
    successToast(t('Members updated'))
    directAssignTeam.value = null
  }
}

// ── Members modal — click the "N members" cell to see the full roster ──
const membersModalOpen = ref(false)
const membersModalTeam = ref<TeamRow | null>(null)
function openMembers(row: TeamRow) { membersModalTeam.value = row; membersModalOpen.value = true }
const membersModalList = computed(() => {
  const ids = membersModalTeam.value?.memberIds ?? []
  return ids.map((id) => {
    const m = crmTeamMemberOptions.value.find((o) => o.id === id)
    return { id, name: m?.name ?? id, subtitle: m?.subtitle }
  })
})

// ── Activate / deactivate team (no hard delete in V1 — PRD §5.10) ──
const teamStatusModalOpen = ref(false)
const teamPendingStatus = ref<TeamRow | null>(null)
const teamStatusBlock = ref('')   // non-empty → deactivation is blocked, shows why
function askToggleTeamStatus(tm: TeamRow) {
  teamPendingStatus.value = tm
  teamStatusBlock.value = ''
  // PRD §5.10 #4: block deactivation that would leave a module with no active team.
  if (tm.status === 'active') {
    const orphaned = tm.modules.filter((mod) =>
      !crmTeams.some((o) => o.id !== tm.id && o.status === 'active' && o.modules.includes(mod)))
    if (orphaned.length) {
      const labels = orphaned.map((k) => t(CRM_TEAM_MODULES.find((m) => m.key === k)?.label ?? k)).join(', ')
      teamStatusBlock.value = `${t('No other active team covers')} ${labels}. ${t('Assign another active team before deactivating.')}`
    }
  }
  teamStatusModalOpen.value = true
}
const teamStatusModalTitle = computed(() => {
  const tm = teamPendingStatus.value
  if (!tm) return ''
  if (teamStatusBlock.value) return `${t('Cannot deactivate')} ${tm.name}`
  return tm.status === 'active' ? `${t('Deactivate team')} ${tm.name}?` : `${t('Reactivate team')} ${tm.name}?`
})
const teamStatusModalDesc = computed(() => {
  const tm = teamPendingStatus.value
  if (!tm) return ''
  if (teamStatusBlock.value) return teamStatusBlock.value
  return tm.status === 'active'
    ? t('Members lose this team\'s module access until it is reactivated. History is kept.')
    : t('Members regain this team\'s module access. Only members who are still active are restored.')
})
const teamStatusConfirmLabel = computed(() => {
  const tm = teamPendingStatus.value
  if (teamStatusBlock.value) return t('OK')
  return tm?.status === 'active' ? t('Deactivate team') : t('Reactivate team')
})
function confirmToggleTeamStatus() {
  const tm = teamPendingStatus.value
  if (tm && !teamStatusBlock.value) {
    const next = tm.status === 'active' ? 'inactive' : 'active'
    setCrmTeamStatus(tm.id, next, CURRENT_USER, nowStamp())
    successToast(next === 'inactive' ? t('Team deactivated') : t('Team reactivated'))
  }
  teamPendingStatus.value = null
  teamStatusModalOpen.value = false
}

// ── Custom views — illustrative saved views for the Deals list ──
type SavedView = { id: string; name: string; desc: string }
const savedViews: SavedView[] = [
  { id: 'my-open', name: 'My open deals', desc: 'Deals you own that are still in play (not Won or Lost)' },
  { id: 'closing', name: 'Closing this month', desc: 'Open deals with an expected close date this month' },
  { id: 'won-q', name: 'Won this quarter', desc: 'Deals moved to Won in the current quarter' },
]

// ── Integrations — connection cards ──
type Integration = { id: string; icon: string; name: string; desc: string; connected: boolean }
const integrations: Integration[] = [
  { id: 'whatsapp', icon: 'WhatsApp', name: 'WhatsApp', desc: 'Chat with leads and reply from the CRM inbox', connected: false },
  { id: 'email', icon: 'envelope', name: 'Email', desc: 'Sync conversations and log emails to deals', connected: true },
  { id: 'jurnal', icon: 'jurnal-brand', name: 'Mekari Jurnal', desc: 'Push won deals to sales orders and invoices', connected: true },
  { id: 'klikpajak', icon: 'klikpajak-brand', name: 'Klikpajak', desc: 'Issue tax invoices for closed orders', connected: false },
  { id: 'marketplace', icon: 'shop', name: 'Marketplace', desc: 'Import orders from your marketplace stores', connected: false },
]
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ title }}</h1>
        </div>
      </div>
      <div class="cd-bar-actions">
        <!-- Users are managed in the ERP; Invite user is intentionally a no-op placeholder for now. -->
        <a v-if="section === 'users'" href="#" class="btn-enterprise btn-enterprise--primary cru-invite">{{ t('Invite user') }}</a>
        <MpButton v-else-if="section === 'teams'" variant="primary" is-rounded left-icon="add" @click="openNewTeam">{{ t('New team') }}</MpButton>
        <MpButton v-else-if="section === 'views'" variant="secondary" is-rounded @click="soon(t('Create view'))">{{ t('Create view') }}</MpButton>
      </div>
    </header>

    <div class="detail-stage">
      <!-- ── Company profile — reuse the ERP page verbatim ── -->
      <section v-if="section === 'company'" class="set-embed">
        <SettingsCompanyProfilePage embedded />
      </section>

      <!-- ── User & roles ── -->
      <section v-else-if="section === 'users'" class="set-section set-section--table">        <ErpTablePage
          :columns="visibleColumns"
          :rows="(paginated as Record<string, unknown>[])"
          :total="total"
          :current-page="currentPage"
          :per-page="perPage"
          :sort-key="sortKey"
          :sort-dir="sortDir"
          filter-empty-label="user"
          :search="search"
          :has-active-filter="hasActiveUserFilter"
          @page-change="setPage"
          @per-page-change="setPerPage"
          @sort="toggleSort"
          @sort-change="setSort"
          @hide-column="hideColumn"
          @clear-filters="clearUserFilters"
        >
          <!-- Filter bar: ERP role + CRM access + Status (left) · column settings + search (right) -->
          <template #filters>
            <div class="filter-left">
              <ErpFilterSelect
                id="cru-role-filter"
                :model-value="roleFilter"
                :placeholder="t('ERP role')"
                :options="ROLE_OPTS"
                @update:model-value="(v: string) => (roleFilter = v)"
              />
              <ErpFilterSelect
                id="cru-status-filter"
                :model-value="statusFilter"
                placeholder="Status"
                :options="STATUS_OPTS"
                @update:model-value="(v: string) => (statusFilter = v)"
              />
              <MultiSelectDropdown
                id="cru-team-filter"
                :model-value="teamFilter"
                :options="TEAM_OPTS"
                :placeholder="t('Team')"
                select-all-label="All teams"
                all-selected-label="All teams"
                @update:model-value="(v: string[]) => (teamFilter = v)"
              />
            </div>

            <div class="filter-right">
              <div class="filter-btn-group">
                <ColumnSettingsMenu id="cru-columns" :items="columnItems" :visibility="columnVisibility" />
              </div>
              <div class="filter-search">
                <MpIcon name="search" size="sm" />
                <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
              </div>
            </div>
          </template>

          <!-- Name + email caption -->
          <template #cell-name="{ row }">
            <div class="cru-name">
              <span class="cell-text">{{ (row as CrmUser).name }}</span>
              <span class="cru-email">{{ (row as CrmUser).email }}</span>
            </div>
          </template>
          <template #cell-role="{ row }">{{ t((row as CrmUser).role) }}</template>
          <template #cell-status="{ value }"><ErpStatusBadge :status="(value as string)" :label="STATUS_LABEL[value as string]" /></template>
          <!-- Team — clickable, opens the Manage teams modal for this user -->
          <template #cell-teams="{ row }">
            <span
              v-if="(row as CrmUser).empId"
              class="cell-link"
              role="button"
              tabindex="0"
              @click.stop="openUserTeams(row as CrmUser)"
              @keydown.enter.stop="openUserTeams(row as CrmUser)"
            >
              <ErpTagList v-if="(row as CrmUser).teams.length" :tags="(row as CrmUser).teams" />
              <span v-else>{{ t('Manage teams') }}</span>
            </span>
            <ErpTagList v-else-if="(row as CrmUser).teams.length" :tags="(row as CrmUser).teams" />
            <span v-else>—</span>
          </template>
          <template #cell-joinDate="{ value }">{{ formatDate(value as string) }}</template>
          <template #cell-lastUpdated="{ value }">{{ formatDate(value as string) }}</template>

          <!-- Row actions: Manage CRM access (the redundant enabled/disabled column
               was removed — everyone in this list already has CRM access). -->
          <template #actions="{ row }">
            <MpPopover :id="`cru-actions-${(row as CrmUser).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton class="row-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="openAccess(row as CrmUser)">{{ t('Manage CRM access') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </template>
        </ErpTablePage>
      </section>

      <!-- ── Teams ── -->
      <section v-else-if="section === 'teams'" class="set-section set-section--table">        <ErpTablePage
          :columns="teamVisibleColumns"
          :rows="(teamPaginated as unknown as Record<string, unknown>[])"
          :total="teamTotal"
          :current-page="teamPage"
          :per-page="teamPerPage"
          :sort-key="teamSortKey"
          :sort-dir="teamSortDir"
          filter-empty-label="team"
          :search="teamSearch"
          :has-active-filter="hasActiveTeamFilter"
          @page-change="setTeamPage"
          @per-page-change="setTeamPerPage"
          @sort="toggleTeamSort"
          @sort-change="setTeamSort"
          @hide-column="hideTeamColumn"
          @clear-filters="clearTeamFilters"
        >
          <!-- Filter bar: Status + Accessible module (left) · column settings + search (right) -->
          <template #filters>
            <div class="filter-left">
              <ErpFilterSelect
                id="cmt-status-filter"
                :model-value="teamStatusFilter"
                placeholder="Status"
                :options="TEAM_STATUS_OPTS"
                @update:model-value="(v: string) => (teamStatusFilter = v)"
              />
            </div>
            <div class="filter-right">
              <div class="filter-btn-group">
                <ColumnSettingsMenu id="cmt-columns" :items="teamColumnItems" :visibility="teamColumnVisibility" />
              </div>
              <div class="filter-search">
                <MpIcon name="search" size="sm" />
                <input v-model="teamSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                <button v-if="teamSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="teamSearch = ''"><MpIcon name="close" size="sm" /></button>
              </div>
            </div>
          </template>

          <!-- Team name + description caption -->
          <template #cell-name="{ row }">
            <div class="cru-name">
              <span class="cell-link cell-text" @click.stop="openEditTeam(row as unknown as TeamRow)">{{ (row as unknown as TeamRow).name }}</span>
              <span class="cru-email">{{ (row as unknown as TeamRow).description }}</span>
            </div>
          </template>

          <template #cell-memberCount="{ row }">
            <span
              v-if="(row as unknown as TeamRow).memberCount"
              class="cell-link cell-text"
              @click.stop="openMembers(row as unknown as TeamRow)"
            >{{ (row as unknown as TeamRow).memberCount }} {{ (row as unknown as TeamRow).memberCount !== 1 ? t('members') : t('member') }}</span>
            <span v-else class="cmt-muted">{{ t('No members') }}</span>
          </template>

          <!-- Accessible modules — tag chips -->
          <template #cell-modules="{ row }">
            <ErpTagList v-if="(row as unknown as TeamRow).moduleLabels.length" :tags="(row as unknown as TeamRow).moduleLabels.map((m: string) => t(m))" />
            <span v-else class="cmt-muted">—</span>
          </template>

          <!-- Created time — date + time, author below -->
          <template #cell-createdAt="{ row }">
            <LastUpdatedCell :at="(row as unknown as TeamRow).createdAt" :by="(row as unknown as TeamRow).createdBy" />
          </template>

          <!-- Status — Active / Inactive -->
          <template #cell-status="{ row }">
            <ErpStatusBadge :status="(row as unknown as TeamRow).status" :label="(row as unknown as TeamRow).status === 'active' ? t('Active') : t('Inactive')" />
          </template>

          <!-- Actions: Edit / Assign members / Deactivate | Reactivate (no hard delete) -->
          <template #actions="{ row }">
            <MpPopover :id="`cmt-actions-${(row as unknown as TeamRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton class="row-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="openEditTeam(row as unknown as TeamRow)">{{ t('Edit') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="assignMembers(row as unknown as TeamRow)">{{ t('Assign members') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="askToggleTeamStatus(row as unknown as TeamRow)">
                    {{ (row as unknown as TeamRow).status === 'active' ? t('Deactivate') : t('Reactivate') }}
                  </MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </template>
        </ErpTablePage>
      </section>

      <!-- ── Custom views ── -->
      <section v-else-if="section === 'views'" class="set-section">        <div class="set-tablewrap">
          <ul class="set-viewlist">
            <li v-for="v in savedViews" :key="v.id" class="set-viewrow">
              <span class="set-view-icon"><MpIcon name="table-view-list" size="md" /></span>
              <span class="set-view-text">
                <span class="set-view-name">{{ v.name }}</span>
                <span class="set-view-desc">{{ v.desc }}</span>
              </span>
            </li>
          </ul>
        </div>
      </section>

      <!-- ── Integrations ── -->
      <section v-else-if="section === 'integrations'" class="set-section">        <div class="set-grid">
          <div v-for="ig in integrations" :key="ig.id" class="set-card set-card--integration">
            <span class="set-int-icon"><MpIcon :name="ig.icon" size="lg" /></span>
            <span class="set-int-text">
              <span class="set-card-title">{{ ig.name }}</span>
              <span class="set-card-desc">{{ ig.desc }}</span>
            </span>
            <div class="set-int-action">
              <ErpStatusBadge v-if="ig.connected" status="active" :label="t('Connected')" />
              <MpButton v-else variant="secondary" is-rounded @click="soon(t('Connect') + ' ' + ig.name)">{{ t('Connect') }}</MpButton>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Users: CRM access drawer (edit the permission matrix) ── -->
    <CrmUserAccessDrawer
      :open="accessDrawerOpen"
      :user="accessUser ? { id: accessUser.id, name: accessUser.name, email: accessUser.email, role: accessUser.role, status: accessUser.status } : null"
      :perms="accessDraft"
      @cancel="accessDrawerOpen = false"
      @save="saveAccess"
    />

    <!-- ── Users: Manage teams modal (add/remove this user across CRM teams) ── -->
    <MpModal
      id="cru-teams-modal"
      :is-open="userTeamsModalOpen"
      size="md"
      is-close-on-esc
      :is-keep-alive="false"
      @close="userTeamsModalOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ t('Manage teams') }} · {{ userTeamsUser?.name }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <ul class="cru-teams-list">
            <li v-for="tm in crmTeams" :key="tm.id" class="cru-teams-row">
              <MpCheckbox
                :id="`cru-team-${tm.id}`"
                :is-checked="userTeamsDraft[tm.id] ?? false"
                @update:is-checked="(v: boolean) => (userTeamsDraft[tm.id] = v)"
              >{{ tm.name }}</MpCheckbox>
            </li>
          </ul>
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="userTeamsModalOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="saveUserTeams">{{ t('Save changes') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Teams: New/Edit drawer → swaps to the two-pane member picker ── -->
    <CrmTeamFormDrawer
      :open="teamFormOpen"
      :mode="teamFormMode"
      :draft="teamDraft"
      :member-names="teamDraftMemberNames"
      :member-options="crmTeamMemberOptions"
      :name-error="teamNameError"
      :form-error="teamFormError"
      @cancel="teamFormOpen = false"
      @save="saveTeam"
      @pick-members="onPickMembers"
      @clear-name-error="teamNameError = ''"
      @clear-form-error="teamFormError = ''"
    />
    <SelectAccessDrawer
      :open="membersPickerOpen"
      :title="t('Select members')"
      :list-title="t('Members')"
      :options="crmTeamMemberOptions"
      :model-value="teamDraft.memberIds"
      :empty-title="t('No members selected')"
      :empty-caption="t('Pick members from the list to add them to this team.')"
      @update:open="membersPickerOpen = $event"
      @save="onMembersSaved"
    />
    <ConfirmModal
      :is-open="teamStatusModalOpen"
      :title="teamStatusModalTitle"
      :description="teamStatusModalDesc"
      :confirm-label="teamStatusConfirmLabel"
      :is-danger="false"
      @update:is-open="teamStatusModalOpen = $event"
      @confirm="confirmToggleTeamStatus"
    />

    <!-- Members list — opened by clicking the "N members" cell -->
    <MpModal
      id="cmt-members-modal"
      :is-open="membersModalOpen"
      size="md"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="membersModalOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ membersModalTeam?.name }} · {{ membersModalList.length }} {{ membersModalList.length !== 1 ? t('members') : t('member') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <ul class="cmt-member-list">
            <li v-for="m in membersModalList" :key="m.id" class="cmt-member-row">
              <span class="cmt-member-name">{{ m.name }}</span>
              <span v-if="m.subtitle" class="cmt-member-sub">{{ m.subtitle }}</span>
            </li>
          </ul>
        </MpModalBody>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
/* Members modal list */
.cmt-member-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cmt-member-row { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cmt-member-row:last-child { border-bottom: none; }
.cmt-member-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cmt-member-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Shell (mirrors CrmCustomerDetailPage) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cru-invite { text-decoration: none; }

/* padding-top (not border-top) so the first row sits INSIDE the scroll padding —
   a bordered control (e.g. the search pill) flush at an overflow:auto edge gets its
   top border shaved otherwise. */
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

/* The embedded Company profile page is a bare 12-col grid (no title bar, no own
   padding) — it sits naturally inside the padded .detail-stage, matching how the
   ERP Settings stage frames it. No negative margins (they clipped the section's
   Edit button against the scroll top). */
.set-embed { display: contents; }

.set-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.set-lead { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.set-tablewrap { overflow-x: auto; }

/* ── User & roles: the section hosts a full ErpTablePage, so it fills the stage. ── */
.set-section--table { flex: 1; min-height: 0; }

/* Name cell — name link over an email caption (no avatar). */
.cru-name { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }

/* CRM access cell — Enabled/Disabled over a permission-summary caption. */
.cru-access { display: inline-flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.cru-access:hover { text-decoration: none; }
.cru-access:hover .cell-text { text-decoration: underline; text-underline-offset: 2px; }

/* Manage teams modal list */
.cru-teams-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cru-teams-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cru-teams-row:last-child { border-bottom: none; }
.cru-teams-status { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.cru-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cru-tags { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-colors-text-link, #165082); text-decoration: none; cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cru-action--danger :deep(*), .cru-action--danger { color: var(--mp-colors-text-danger, #a8352d); }

/* Accessible-modules tag chips (Teams table) */
.cmt-tags { display: flex; gap: var(--mp-spacing-1); flex-wrap: wrap; }
.erp-tag {
  display: inline-flex; align-items: center;
  background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-md); padding: 0 var(--mp-spacing-1\.5);
  max-height: var(--mp-sizes-5, 20px); border-radius: var(--mp-radii-sm); white-space: nowrap;
}
.cmt-muted { color: var(--mp-text-secondary); }

/* Row action kebab */
.row-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }

/* ── Filter bar (same classes as the index pages; erp.css owns :focus-within) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
/* margin-left:auto keeps the column-settings + search group right-aligned even when
   it's the only child of the space-between filter bar (Teams has no left filter). */
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.filter-btn-group { display: flex; align-items: center; }
/* Search pill (.filter-search + .filter-search-input) is owned entirely by
   erp.css — base box AND the neutral :focus-within ring (border #8c9596 + inset
   ring). Do NOT redefine .filter-search here: a scoped copy's [data-v] specificity
   overrides erp.css's :focus-within border-color, leaving a light border under the
   dark inset ring (a two-tone focus) — rule/form-focus-border-bold. */
.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important;
  border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }

/* ── Team cards ── */
.set-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.set-card { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); background: var(--mp-background-neutral, #fff); }
.set-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); }
.set-card-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.set-card-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.set-card-desc { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: 16px; color: var(--mp-text-secondary); }
.set-avatars { display: flex; align-items: center; gap: 4px; margin-top: var(--mp-spacing-1); }
.set-avatar { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-selected, #0f6d4d); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Custom views list ── */
.set-viewlist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.set-viewrow { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.set-viewrow:last-child { border-bottom: none; }
.set-view-icon { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-neutral-subtle, #f1f5f9); color: var(--mp-text-secondary); }
.set-view-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.set-view-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.set-view-desc { font-size: var(--mp-font-sizes-sm); line-height: 16px; color: var(--mp-text-secondary); }

/* ── Integration cards ── */
.set-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.set-card--integration { flex-direction: row; align-items: flex-start; gap: var(--mp-spacing-3); }
.set-int-icon { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-neutral-subtle, #f1f5f9); color: var(--mp-text-default); }
.set-int-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.set-int-action { flex-shrink: 0; display: flex; align-items: center; }

@media (max-width: 1100px) {
  .set-grid { grid-template-columns: repeat(2, 1fr); }
  .set-cards { grid-template-columns: 1fr; }
}

/* ── Edit user modal ── */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
.eu-body { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.eu-field { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); }
.eu-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.eu-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.eu-perms { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.eu-perm { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.eu-perm:last-child { border-bottom: none; }
.eu-perm-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.eu-perm-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.eu-perm-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
