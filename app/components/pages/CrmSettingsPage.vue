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
import { computed, reactive, ref, watch } from 'vue'
import {
  MpButton, MpIcon, MpToggle,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import SettingsCompanyProfilePage from '~/components/pages/SettingsCompanyProfilePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import CrmTeamFormDrawer, { type CrmTeamDraft } from '~/components/patterns/CrmTeamFormDrawer.vue'
import {
  CRM_OWNERS,
  crmTeams, CRM_TEAM_MODULES, type CrmTeam, type CrmTeamModule,
  crmTeamMemberOptions, teamMemberNames, upsertCrmTeam, deleteCrmTeam,
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
  users: 'User & roles',
  teams: 'Teams',
  views: 'Custom views',
  integrations: 'Integrations',
}
const title = computed(() => t(TITLES[section.value] ?? 'Settings'))

// slugify a person's name → local-part of an email (dewi.lestari@…)
function emailFor(name: string): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, '.')}@centralperk.co.id`
}

// ── User & roles — a roster grounded in the CRM sales/marketing owners ──
type CrmUser = {
  id: string; name: string; email: string; role: string
  teams: string[]; accessDays: string; accessHours: string; status: string; joinDate: string
  canExport: boolean; canViewReports: boolean
}
const ROLES = ['Admin', 'Sales rep', 'Marketing', 'Viewer']

// Per-user data permissions (beyond role): can export data / can view reports.
// Default by role (Admin gets both); an override map persists inline toggles.
function defaultPerms(role: string) {
  return role === 'Admin' ? { canExport: true, canViewReports: true } : { canExport: false, canViewReports: true }
}
const PERMS_KEY = 'crm-user-perms-v1'
const userPerms = reactive<Record<string, { canExport: boolean; canViewReports: boolean }>>(
  import.meta.client ? (() => { try { return JSON.parse(localStorage.getItem(PERMS_KEY) || '{}') } catch { return {} } })() : {},
)
function permOf(id: string, role: string) { return userPerms[id] ?? defaultPerms(role) }
function setPerm(id: string, role: string, key: 'canExport' | 'canViewReports', val: boolean) {
  userPerms[id] = { ...(userPerms[id] ?? defaultPerms(role)), [key]: val }
  if (import.meta.client) { try { localStorage.setItem(PERMS_KEY, JSON.stringify(userPerms)) } catch { /* ignore */ } }
}
// A user can belong to MANY teams (multi-value cell).
const TEAM_POOL = ['Sales', 'Marketing', 'Customer Success']
// Access window = a day scope (Weekdays / Weekend / Every day) + working hours;
// default hours are 08:00–17:00, "All day" = unrestricted (sepanjang hari).
const ACCESS_WINDOWS = [
  { days: 'Every day', hours: 'All day' },        // the admin
  { days: 'Weekdays', hours: '08:00 – 17:00' },
  { days: 'Weekend', hours: '08:00 – 17:00' },
  { days: 'Weekdays', hours: 'All day' },
  { days: 'Weekend', hours: 'All day' },
]
const crmUsers = computed<CrmUser[]>(() =>
  CRM_OWNERS.map((name, i) => {
    const access = i === 0 ? ACCESS_WINDOWS[0]! : ACCESS_WINDOWS[1 + (i % 4)]!
    const id = `CU${String(i + 1).padStart(2, '0')}`
    const role = i === 0 ? 'Admin' : ROLES[(i % 3) + 1]!   // first person is the Admin
    const perms = permOf(id, role)
    return {
      id,
      name,
      email: emailFor(name),
      role,
      teams: i === 0 ? [...TEAM_POOL] : [TEAM_POOL[i % 3]!, TEAM_POOL[(i + 1) % 3]!],
      accessDays: access.days,
      accessHours: access.hours,
      status: i % 5 === 3 ? 'invited' : (i % 5 === 4 ? 'inactive' : 'active'),
      // deterministic, coherent mock (no Date.now)
      joinDate: `202${4 + (i % 2)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`,
      canExport: perms.canExport,
      canViewReports: perms.canViewReports,
    }
  }),
)

const columns: TableColumn[] = [
  { key: 'name', label: 'Name', kind: 'name', sortable: true, sortType: 'text' },
  { key: 'role', label: 'Role', kind: 'status', sortType: 'text' },
  { key: 'teams', label: 'Team', kind: 'tags' },
  { key: 'canExport', label: 'Export data', kind: 'status' },
  { key: 'canViewReports', label: 'View reports', kind: 'status' },
  { key: 'accessDays', label: 'Access time', sortType: 'text' },
  { key: 'status', label: 'Status', kind: 'status', sortType: 'text' },
  { key: 'joinDate', label: 'Join date', kind: 'date', sortType: 'date' },
]

// Filters: Role + Status (left) + search (right). roleFilter is a 2nd filter fed
// into useTableState's filterFn via closure (Vue tracks it as a dependency).
const roleFilter = ref('')
const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<CrmUser>(crmUsers, {
  filterFn: (row, s, status) =>
    (!s || row.name.toLowerCase().includes(s) || row.email.toLowerCase().includes(s) || row.role.toLowerCase().includes(s))
    && (!status || row.status === status)
    && (!roleFilter.value || row.role === roleFilter.value),
})
sortKey.value = 'name'
watch(roleFilter, () => setPage(1))

const STATUS_OPTS = [
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'inactive', label: 'Inactive' },
]
const hasActiveUserFilter = computed(() => !!search.value || !!statusFilter.value || !!roleFilter.value)
function clearUserFilters() { search.value = ''; statusFilter.value = ''; roleFilter.value = '' }
const STATUS_LABEL: Record<string, string> = { active: 'Active', invited: 'Invited', inactive: 'Inactive' }

// Column settings (Name is locked visible)
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// Row actions (demo)
function viewUser(u: CrmUser) { soon(`${t('View details')} — ${u.name}`) }
function editUser(u: CrmUser) { soon(`${t('Edit')} — ${u.name}`) }
function deleteUser(u: CrmUser) { soon(`${t('Delete')} — ${u.name}`) }

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

const teamColumns: TableColumn[] = [
  { key: 'name',        label: 'Team name',         kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'memberCount', label: 'No. of members',    kind: 'number', sortable: true, sortType: 'number' },
  { key: 'modules',     label: 'Accessible modules', kind: 'tags'                                       },
  { key: 'updatedAt',   label: 'Last updated',      kind: 'date',   sortable: true, sortType: 'date'   },
]

// Filter: Module (left) + search (right).
const teamModuleFilter = ref('')
const teamModuleOptions = CRM_TEAM_MODULES.map((m) => ({ value: m.key, label: m.label }))
const {
  search: teamSearch, currentPage: teamPage, paginated: teamPaginated, total: teamTotal, perPage: teamPerPage,
  setPage: setTeamPage, setPerPage: setTeamPerPage, sortKey: teamSortKey, sortDir: teamSortDir,
  toggleSort: toggleTeamSort, setSort: setTeamSort,
} = useTableState<TeamRow>(teamRows, {
  filterFn: (row, s) =>
    (!s || row.name.toLowerCase().includes(s) || row.description.toLowerCase().includes(s))
    && (!teamModuleFilter.value || row.modules.includes(teamModuleFilter.value as CrmTeamModule)),
  defaultSort: { key: 'updatedAt', dir: 'desc' },
})
watch(teamModuleFilter, () => setTeamPage(1))
const hasActiveTeamFilter = computed(() => !!teamSearch.value || !!teamModuleFilter.value)
function clearTeamFilters() { teamSearch.value = ''; teamModuleFilter.value = '' }

// Column settings (Team name locked visible).
const teamColumnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(teamColumns.map((c) => [c.key, true])))
const teamColumnItems = teamColumns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const teamVisibleColumns = computed<TableColumn[]>(() => teamColumns.filter((c) => teamColumnVisibility[c.key]))
function hideTeamColumn(key: string) { teamColumnVisibility[key] = false }

// ── New / Edit team drawer ──
const teamFormOpen = ref(false)
const teamFormMode = ref<'create' | 'edit'>('create')
const editingTeamId = ref<string | null>(null)
const teamNameError = ref('')
const teamDraft = reactive<CrmTeamDraft>({ name: '', description: '', modules: [], memberIds: [] })
const teamDraftMemberNames = computed(() => teamMemberNames(teamDraft.memberIds))

function openNewTeam() {
  teamFormMode.value = 'create'
  editingTeamId.value = null
  teamNameError.value = ''
  Object.assign(teamDraft, { name: '', description: '', modules: [], memberIds: [] })
  teamFormOpen.value = true
}
function openEditTeam(tm: TeamRow) {
  teamFormMode.value = 'edit'
  editingTeamId.value = tm.id
  teamNameError.value = ''
  Object.assign(teamDraft, { name: tm.name, description: tm.description, modules: [...tm.modules], memberIds: [...tm.memberIds] })
  teamFormOpen.value = true
}
function saveTeam() {
  if (!teamDraft.name.trim()) { teamNameError.value = `${t('You must fill in')} ${t('team name')}`; return }
  const isEdit = teamFormMode.value === 'edit'
  upsertCrmTeam(
    { id: editingTeamId.value ?? undefined, name: teamDraft.name.trim(), description: teamDraft.description.trim(), memberIds: teamDraft.memberIds, modules: teamDraft.modules },
    CURRENT_USER, nowStamp(),
  )
  teamFormOpen.value = false
  successToast(isEdit ? t('Team updated') : t('Team created'))
}

// ── Member picker (SelectAccessDrawer) — opens on top of the form drawer ──
const membersPickerOpen = ref(false)
function onPickMembers() { membersPickerOpen.value = true }
function onMembersSaved(ids: string[]) { teamDraft.memberIds = ids; membersPickerOpen.value = false }

// ── Delete team ──
const teamDeleteOpen = ref(false)
const teamPendingDelete = ref<TeamRow | null>(null)
function askDeleteTeam(tm: TeamRow) { teamPendingDelete.value = tm; teamDeleteOpen.value = true }
function confirmDeleteTeam() {
  if (teamPendingDelete.value) {
    deleteCrmTeam(teamPendingDelete.value.id)
    successToast(t('Team deleted'))
  }
  teamPendingDelete.value = null
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
        <MpButton v-if="section === 'users'" variant="primary" is-rounded @click="router.push('/crm/settings/users/invite')">{{ t('Invite user') }}</MpButton>
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
          <!-- Filter bar: Role + Status (left) · column settings + search (right) -->
          <template #filters>
            <div class="filter-left">
              <ErpFilterSelect
                id="cru-role-filter"
                :model-value="roleFilter"
                placeholder="Role"
                :options="ROLES"
                @update:model-value="(v: string) => (roleFilter = v)"
              />
              <ErpFilterSelect
                id="cru-status-filter"
                :model-value="statusFilter"
                placeholder="Status"
                :options="STATUS_OPTS"
                @update:model-value="(v: string) => (statusFilter = v)"
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

          <!-- Name: name link + email caption (no avatar) -->
          <template #cell-name="{ row }">
            <div class="cru-name">
              <span class="cell-link cell-text" @click.stop="viewUser(row as CrmUser)">{{ (row as CrmUser).name }}</span>
              <span class="cru-email">{{ (row as CrmUser).email }}</span>
            </div>
          </template>
          <template #cell-role="{ value }">{{ value }}</template>
          <template #cell-canExport="{ row }">
            <MpToggle :id="`perm-exp-${(row as CrmUser).id}`" :is-checked="(row as CrmUser).canExport" :aria-label="t('Export data')" @update:is-checked="(v: boolean) => setPerm((row as CrmUser).id, (row as CrmUser).role, 'canExport', v)" />
          </template>
          <template #cell-canViewReports="{ row }">
            <MpToggle :id="`perm-rep-${(row as CrmUser).id}`" :is-checked="(row as CrmUser).canViewReports" :aria-label="t('View reports')" @update:is-checked="(v: boolean) => setPerm((row as CrmUser).id, (row as CrmUser).role, 'canViewReports', v)" />
          </template>
          <template #cell-teams="{ row }">
            <div v-if="(row as CrmUser).teams.length" class="cru-tags">
              <span v-for="tm in (row as CrmUser).teams" :key="tm" class="erp-tag">{{ tm }}</span>
            </div>
            <span v-else>—</span>
          </template>
          <template #cell-accessDays="{ row }">
            <div class="cru-name">
              <span>{{ (row as CrmUser).accessDays }}</span>
              <span class="cru-email">{{ (row as CrmUser).accessHours }}</span>
            </div>
          </template>
          <template #cell-status="{ value }"><ErpStatusBadge :status="(value as string)" :label="STATUS_LABEL[value as string]" /></template>
          <template #cell-joinDate="{ value }">{{ formatDate(value as string) }}</template>

          <!-- Actions: View details / Edit / Delete -->
          <template #actions="{ row }">
            <MpPopover :id="`cru-actions-${(row as CrmUser).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton class="row-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="viewUser(row as CrmUser)">{{ t('View details') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="editUser(row as CrmUser)">{{ t('Edit') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="deleteUser(row as CrmUser)">{{ t('Delete') }}</MpPopoverListItem>
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
          <!-- Filter bar: Module (left) · column settings + search (right) -->
          <template #filters>
            <div class="filter-left">
              <ErpFilterSelect
                id="cmt-module-filter"
                :model-value="teamModuleFilter"
                placeholder="Module"
                :options="teamModuleOptions"
                @update:model-value="(v: string) => (teamModuleFilter = v)"
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
            {{ (row as unknown as TeamRow).memberCount }} {{ (row as unknown as TeamRow).memberCount !== 1 ? t('members') : t('member') }}
          </template>

          <!-- Accessible modules — tag chips -->
          <template #cell-modules="{ row }">
            <div v-if="(row as unknown as TeamRow).moduleLabels.length" class="cmt-tags">
              <span v-for="m in (row as unknown as TeamRow).moduleLabels" :key="m" class="erp-tag">{{ t(m) }}</span>
            </div>
            <span v-else class="cmt-muted">—</span>
          </template>

          <!-- Last updated — date + time, author below -->
          <template #cell-updatedAt="{ row }">
            <LastUpdatedCell :at="(row as unknown as TeamRow).updatedAt" :by="(row as unknown as TeamRow).updatedBy" />
          </template>

          <!-- Actions: Edit / Delete -->
          <template #actions="{ row }">
            <MpPopover :id="`cmt-actions-${(row as unknown as TeamRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton class="row-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="openEditTeam(row as unknown as TeamRow)">{{ t('Edit') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="askDeleteTeam(row as unknown as TeamRow)">{{ t('Delete') }}</MpPopoverListItem>
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

    <!-- ── Teams: New/Edit drawer → swaps to the two-pane member picker ── -->
    <CrmTeamFormDrawer
      :open="teamFormOpen"
      :mode="teamFormMode"
      :draft="teamDraft"
      :member-names="teamDraftMemberNames"
      :name-error="teamNameError"
      @cancel="teamFormOpen = false"
      @save="saveTeam"
      @pick-members="onPickMembers"
      @clear-name-error="teamNameError = ''"
    />
    <SelectAccessDrawer
      :open="membersPickerOpen"
      :title="t('Select members')"
      :list-title="t('Members')"
      :options="crmTeamMemberOptions"
      :model-value="teamDraft.memberIds"
      :empty-title="t('No members selected')"
      :empty-caption="t('Pick employees from the list to add them to this team.')"
      @update:open="membersPickerOpen = $event"
      @save="onMembersSaved"
    />
    <ConfirmModal
      :is-open="teamDeleteOpen"
      :title="`${t('Delete team')} ${teamPendingDelete?.name ?? ''}?`"
      :description="t('Members lose this team\'s module access. This cannot be undone.')"
      :confirm-label="t('Delete')"
      is-danger
      @update:is-open="teamDeleteOpen = $event"
      @confirm="confirmDeleteTeam"
    />
  </div>
</template>

<style scoped>
/* ── Shell (mirrors CrmCustomerDetailPage) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* padding-top (not border-top) so the first row sits INSIDE the scroll padding —
   a bordered control (e.g. the search pill) flush at an overflow:auto edge gets its
   top border shaved otherwise. */
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

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
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary);
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
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
/* Search = rounded pill (rule/filter-bar-search-pill): leading icon + input + clear. */
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-colors-background-neutral, #fff);
  border: 1px solid var(--mp-colors-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
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
.set-viewlist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.set-viewrow { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
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
</style>
