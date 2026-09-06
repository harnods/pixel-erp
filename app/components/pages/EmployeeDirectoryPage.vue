<script setup lang="ts">
/**
 * HR → Employee directory. Lists employees from the mini-DB in the shared
 * ErpTablePage — same stats / filter-bar / checkbox-in-first-cell / sticky
 * actions behaviour as the ERP index pages (Expenses, Sales invoices).
 */
import { type Ref } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpButton, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  MpIcon, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import EmployeesFiltersDrawer, { emptyEmployeesFilters, employeesFiltersCount, type EmployeesFiltersValue, type FilterScope } from '~/components/patterns/EmployeesFiltersDrawer.vue'
import {
  employees, deleteEmployee, markResigned,
  employmentStatuses, jobLevels, branches, departments, businessUnits,
} from '~/data'
import type { Employee } from '~/data'

const { t } = useLocale()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

function goDetail(id: string) { router.push(`/employee-directory/${id}`) }
function goTransfer(id: string) { router.push({ path: '/employee-transfer', query: { employee: id } }) }

const emptyIllustration = '/illustrations/empty-folder.png'

// ─── Row type + enrichment ─────────────────────────────────────────────────
type Row = Employee & { name: string; address?: string }
const rows = computed<Row[]>(() => employees.map((e) => ({
  ...e, name: e.fullName, address: e.currentAddress ?? e.ktpAddress,
})))

// ─── Columns (spec order). Core set visible; the long tail hidden by default
// (revealed via column settings) — same convention as Bills' "Last updated". ──
const columns: TableColumn[] = [
  { key: 'name',             label: 'Employee name',     kind: 'name', sortable: true, sortType: 'text' },
  { key: 'employeeId',       label: 'Employee ID',       kind: 'number', sortType: 'text' },
  { key: 'nik',              label: 'Citizen ID',        kind: 'number', sortType: 'text' },
  { key: 'branch',           label: 'Branch',            sortType: 'text' },
  { key: 'department',       label: 'Organization',      sortType: 'text' },
  { key: 'jobPosition',      label: 'Job position',      sortType: 'text' },
  { key: 'jobLevel',         label: 'Job level',         sortType: 'text' },
  { key: 'employmentStatus', label: 'Employment status', sortType: 'text' },
  { key: 'status',           label: 'Status',            kind: 'status', sortType: 'text' },
  { key: 'joinDate',         label: 'Date of joining',   kind: 'date', sortType: 'date' },
  { key: 'signDate',         label: 'Signing date',      kind: 'date', sortType: 'date' },
  { key: 'contractEndDate',  label: 'End date',          kind: 'date', sortType: 'date' },
  { key: 'resignDate',       label: 'Resignation date',  kind: 'date', sortType: 'date' },
  { key: 'barcode',          label: 'Barcode',           kind: 'number', sortType: 'text' },
  { key: 'email',            label: 'Email',             sortType: 'text' },
  { key: 'phone',            label: 'Phone no.' },
  { key: 'address',          label: 'Address',           kind: 'address' },
  { key: 'dateOfBirth',      label: 'Birth date',        kind: 'date', sortType: 'date' },
  { key: 'placeOfBirth',     label: 'Birth place',       sortType: 'text' },
  { key: 'religion',         label: 'Religion',          sortType: 'text' },
  { key: 'gender',           label: 'Gender',            sortType: 'text' },
  { key: 'maritalStatus',    label: 'Marital status',    sortType: 'text' },
]
// All spec columns visible by default; column settings can hide any of them.
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Toolbar Status filter + "All filters" drawer ──────────────────────────
const statusOptions = [
  { label: 'Active',    value: 'active'    },
  { label: 'Resigning', value: 'resigning' },
  { label: 'Resigned',  value: 'resigned'  },
]
function statusBadgeAttrs(s: string): { type?: 'announcement' | 'warning'; label: string } {
  if (s === 'resigned') return { type: 'announcement', label: 'Resigned' }
  if (s === 'resigning') return { type: 'warning', label: 'Resigning' }
  return { label: 'Active' }
}
const statusFilterLabel = computed(() => statusOptions.find((o) => o.value === statusFilter.value)?.label ?? '')

const filterScopes = computed<FilterScope[]>(() => [
  { key: 'employmentStatus', label: 'Employment status', items: employmentStatuses.map((v) => ({ id: v, name: v })) },
  { key: 'jobLevel',         label: 'Job level',         items: jobLevels.map((v) => ({ id: v, name: v })) },
  { key: 'branch',           label: 'Branch',            items: branches.map((v) => ({ id: v, name: v })) },
  { key: 'department',       label: 'Organization',      items: departments.map((v) => ({ id: v, name: v })) },
  { key: 'businessUnit',     label: 'Business unit',     items: businessUnits.map((v) => ({ id: v, name: v })) },
])

const filtersOpen = ref(false)
const applied = reactive<EmployeesFiltersValue>(emptyEmployeesFilters())
function applyDrawerFilters(v: EmployeesFiltersValue) { applied.filters = v.filters; applied.scopes = v.scopes }
const activeFilterCount = computed(() => employeesFiltersCount(applied))
const isDrawerFilterActive = computed(() => activeFilterCount.value > 0)

function matches(row: Row, s: string, status: string): boolean {
  const matchSearch = !s
    || row.fullName.toLowerCase().includes(s)
    || row.employeeId.toLowerCase().includes(s)
    || (row.email ?? '').toLowerCase().includes(s)
    || (row.jobPosition ?? '').toLowerCase().includes(s)
    || (row.department ?? '').toLowerCase().includes(s)
    || (row.nik ?? '').toLowerCase().includes(s)
  const f = applied.filters
  const sel = (k: string) => f[k] ?? []
  return matchSearch
    && (!status || row.status === status)
    && (sel('employmentStatus').length === 0 || sel('employmentStatus').includes(row.employmentStatus ?? ''))
    && (sel('jobLevel').length === 0 || sel('jobLevel').includes(row.jobLevel ?? ''))
    && (sel('branch').length === 0 || sel('branch').includes(row.branch ?? ''))
    && (sel('department').length === 0 || sel('department').includes(row.department ?? ''))
    && (sel('businessUnit').length === 0 || sel('businessUnit').includes(row.businessUnit ?? ''))
}

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Row>(rows, { filterFn: (row, s, status) => matches(row, s, status) })

// Default order: alphabetical by name (named-entity table convention).
sortKey.value = 'name'
sortDir.value = 'asc'
watch(() => applied.filters, () => setPage(1))

const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value || isDrawerFilterActive.value)
function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  applied.filters = {}
  applied.scopes = []
}
const filteredRows = computed(() => rows.value.filter((r) => matches(r, search.value.toLowerCase().trim(), statusFilter.value)))

// ─── Stats ──────────────────────────────────────────────────────────────────
const DAY = 86_400_000
function daysFromNow(iso?: string) { return iso ? (new Date(iso).getTime() - Date.now()) / DAY : NaN }
const totalActive = computed(() => employees.filter((e) => e.status === 'active').length)
const newHires = computed(() => employees.filter((e) => e.joinDate && -daysFromNow(e.joinDate) <= 90 && -daysFromNow(e.joinDate) >= 0).length)
const leaving = computed(() => employees.filter((e) => e.status === 'resigning').length)

// ─── Formatters + badges ───────────────────────────────────────────────────
function formatDate(iso?: string) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
function waLink(phone: string) { return `https://wa.me/${phone.replace(/[^0-9]/g, '')}` }

// ─── Export (CSV of filtered rows) ─────────────────────────────────────────
function exportCsv() {
  const cols = visibleColumns.value
  const header = cols.map((c) => c.label)
  const lines = filteredRows.value.map((r) => cols.map((c) => `"${String((r as Record<string, unknown>)[c.key] ?? '').replace(/"/g, '""')}"`).join(','))
  const csv = [header.join(','), ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  URL.revokeObjectURL(url)
  toast.notify({ variant: 'success', title: `${filteredRows.value.length} employees exported` })
}

// ─── Row actions: resign + delete ──────────────────────────────────────────
const resignModalOpen = ref(false)
const resignTarget = ref<Row | null>(null)
function askResign(row: Row) { resignTarget.value = row; resignModalOpen.value = true }
function confirmResign() {
  if (resignTarget.value) {
    markResigned(resignTarget.value.id, new Date().toISOString().slice(0, 10))
    toast.notify({ variant: 'success', title: `${resignTarget.value.fullName} marked as resigned` })
  }
  resignModalOpen.value = false
}
const deleteModalOpen = ref(false)
const deleteTarget = ref<Row | null>(null)
function askDelete(row: Row) { deleteTarget.value = row; deleteModalOpen.value = true }
function confirmDelete() {
  if (deleteTarget.value) {
    deleteEmployee(deleteTarget.value.id)
    toast.notify({ variant: 'success', title: 'Employee deleted' })
  }
  deleteModalOpen.value = false
}

// Deterministic avatar hue + initials.
function hueFor(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}
function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
}
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    has-checkbox
    actions-width="52px"
    filter-empty-label="employee"
    :search="search"
    :has-active-filter="hasActiveFilter"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Stats (same format as Expenses/Sales) ── -->
    <template #stats>
      <div class="stats-section">
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">Total employees</div>
          <div class="stat-period">As of today</div>
          <div class="stat-amount">{{ totalActive }}</div>
          <a class="stat-link">{{ total }} total</a>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">New hires</div>
          <div class="stat-period">Last 90 days</div>
          <div class="stat-amount">{{ newHires }}</div>
          <a class="stat-link">View</a>
        </div>
        <div class="stat-card">
          <div class="stat-title">Leaving</div>
          <div class="stat-period">Next 60 days</div>
          <div class="stat-amount">{{ leaving }}</div>
          <a class="stat-link">View</a>
        </div>
      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover id="emp-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="emp-status-select"
              placeholder="Status"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '150px' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ statusFilterLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '150px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="opt in statusOptions" :key="opt.value" :is-active="opt.value === statusFilter" @click="statusFilter = opt.value">
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpButton class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          All filters{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}
        </MpButton>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="emp-tt-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" type="button" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="emp-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip id="emp-tt-export" label="Export" placement="bottom" use-portal>
            <button class="filter-icon-btn" type="button" aria-label="Export" @click="exportCsv">
              <MpIcon name="download" size="md" />
            </button>
          </MpTooltip>
        </div>

        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- ── Cell: name (avatar lg + link; checkbox auto-merges into this cell) ── -->
    <template #cell-name="{ row }">
      <div class="emp-name-cell">
        <img v-if="(row as Row).photo" :src="(row as Row).photo" alt="" class="emp-avatar emp-avatar--img" />
        <span v-else class="emp-avatar" :style="{ background: `hsl(${hueFor((row as Row).fullName)} 62% 90%)`, color: `hsl(${hueFor((row as Row).fullName)} 55% 32%)` }">
          {{ initials((row as Row).fullName) }}
        </span>
        <a class="cell-link cell-text" @click.stop="goDetail((row as Row).id)">{{ (row as Row).fullName }}</a>
      </div>
    </template>

    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as Row).status" v-bind="statusBadgeAttrs((row as Row).status)" />
    </template>
    <template #cell-joinDate="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-signDate="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-contractEndDate="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-resignDate="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-dateOfBirth="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-email="{ value }">
      <a v-if="value" class="cell-link cell-text" :href="`mailto:${value}`">{{ value }}</a><span v-else>—</span>
    </template>
    <template #cell-phone="{ value }">
      <a v-if="value" class="cell-link cell-text" :href="waLink(value as string)" target="_blank" rel="noopener">{{ value }}</a><span v-else>—</span>
    </template>
    <template #cell-address="{ value }">
      <span v-if="value" class="emp-address">{{ value }}</span><span v-else>—</span>
    </template>

    <!-- ── Actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`emp-row-actions-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="goDetail((row as Row).id)">View employee profile</MpPopoverListItem>
            <MpPopoverListItem @click="goTransfer((row as Row).id)">Employee transfer</MpPopoverListItem>
            <MpPopoverListItem v-if="(row as Row).status === 'active'" @click="askResign(row as Row)">Resign</MpPopoverListItem>
            <MpPopoverListItem @click="askDelete(row as Row)">Delete</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No employees</p>
        <p class="empty-full-desc">Employees will appear here.</p>
      </div>
    </template>
  </ErpTablePage>

  <EmployeesFiltersDrawer
    :is-open="filtersOpen"
    :scopes="filterScopes"
    :applied-filters="applied.filters"
    :applied-scopes="applied.scopes"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />

  <MpModal id="emp-resign-modal" :is-open="resignModalOpen" size="md" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="resignModalOpen = false">
    <MpModalContent>
      <MpModalHeader>Resign {{ resignTarget?.fullName }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>{{ resignTarget?.fullName }} will be marked as resigned with today as the resignation date. You can undo this by editing the employee.</MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="resignModalOpen = false">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="confirmResign">Resign</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <MpModal id="emp-delete-modal" :is-open="deleteModalOpen" size="md" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="deleteModalOpen = false">
    <MpModalContent>
      <MpModalHeader>Delete {{ deleteTarget?.fullName }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>Deleted employees cannot be restored.</MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="deleteModalOpen = false">Cancel</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">Delete</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* ── Stats (identical to BillsIndexPage) ── */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); text-decoration: none; cursor: pointer; padding: 0 var(--mp-spacing-0\.5); }

/* Name cell */
.emp-name-cell { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.emp-avatar {
  flex-shrink: 0; width: 40px; height: 40px; border-radius: var(--mp-radii-full, 999px);
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: var(--mp-font-weights-semi-bold);
}
.emp-avatar--img { object-fit: cover; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Address wraps to at most 2 lines (no bleed into the next column). */
.emp-address {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; white-space: normal; line-height: var(--mp-line-heights-md);
}

/* Row action kebab */
.row-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* ── Filter bar (same classes as BillsIndexPage) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-all-btn {
  display: inline-flex !important; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important; border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
.filter-all-btn--active {
  background: var(--mp-background-neutral-subtle) !important;
  border-color: var(--mp-colors-border-bold, #8c9596) !important;
  color: var(--mp-text-selected, var(--mp-text-information)) !important;
}
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn {
  display: flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  padding: var(--mp-spacing-2) !important; border: none !important; background: transparent !important;
  border-radius: var(--mp-radii-md) !important; cursor: pointer; color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
.filter-icon-btn--airene { color: var(--mp-airene-default); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
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
  color: var(--mp-icon-default, var(--mp-text-secondary)); border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* Extra breathing room on the right of every column (16px → 32px) — data cells felt
   too tight. The sticky actions column keeps its own tight padding. */
:deep(.erp-th:not(.erp-th--actions)),
:deep(.erp-td:not(.erp-td--actions)) { padding-right: var(--mp-spacing-8, 32px); }

/* Keep cells vertically centered even on tall rows (the lg avatar / 2-line address
   otherwise trip ErpTablePage's auto top-align). */
:deep(.erp-td),
:deep(.erp-tr--align-top .erp-td) { vertical-align: middle; }

/* ── Responsive stats (audit): keep the row horizontal on small screens and let
   it scroll/swipe instead of stacking (home stacks; index pages scroll). ── */
@media (max-width: 640px) {
  .stats-section { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .stat-card { flex: 0 0 auto; }
}
</style>
