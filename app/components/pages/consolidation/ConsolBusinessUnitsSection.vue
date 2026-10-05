<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/business_unit/index.vue (+ components/table, components/filter, components/drawer, components/data-source-modal, components/group-table, components/group-drawer, components/activity-log-modal) -->
<script setup lang="ts">
/**
 * Business unit list — prod's /v3/consolidations/business_unit/index.
 * Table tab (parent → subsidiary tree with collapse), Group tab (saved
 * unit groups). Add business unit = data-source modal → unit drawer.
 */
import {
  MpButton, MpIcon, MpInput, MpRadio, MpCheckbox, MpTooltip, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpTabs, MpTabList, MpTab,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { successToast, infoToast } from '~/utils/toasts'
import ConsolDrawer from './ConsolDrawer.vue'
import {
  consolUnits, consolidations, unitGroups, newId, formatPeriod,
  DATA_SOURCE_LABEL, UNIT_TYPE_LABEL, UNIT_STATUS_LABEL, CONSOL_CURRENCY_OPTIONS,
  type BusinessUnit, type DataSource, type UnitType,
} from '~/data/consolidation'

const { t } = useLocale()
const go = inject<(id: string, extra?: Record<string, string>) => void>('consolGo')!

type View = 'table' | 'group'
const view = ref<View>('table')
const VIEWS: View[] = ['table', 'group']
const viewIndex = computed({ get: () => VIEWS.indexOf(view.value), set: (i: number) => { view.value = VIEWS[i] ?? 'table' } })

// ─── Table (tree) ────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'name', label: t('Unit name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'dataSource', label: t('Data source') },
  { key: 'currency', label: t('Currency'), kind: 'unit' },
  { key: 'status', label: t('Status'), kind: 'status' },
  { key: 'lastConsolidation', label: t('Last consolidation'), kind: 'address' },
  { key: 'updatedAt', label: t('Last updated'), kind: 'date', sortable: true, sortType: 'date' },
]
interface Row { id: string; name: string; code: string; indent: number; hasChild: boolean; dataSource: DataSource; currency: string; status: BusinessUnit['status']; unitType: UnitType; lastConsolidation: string; lastPeriod: string; updatedAt: string; updatedBy: string }
const collapsed = ref<Set<string>>(new Set())
function toggleCollapse(id: string) { const s = new Set(collapsed.value); s.has(id) ? s.delete(id) : s.add(id); collapsed.value = s }
const typeFilter = ref('')
const currencyFilter = ref('')
const search = ref('')
function lastConsolidationOf(id: string) {
  return consolidations.filter((c) => c.status === 'completed' && c.unitIds.includes(id)).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0]
}
const tree = computed<Row[]>(() => {
  const out: Row[] = []
  const filtering = !!(search.value || typeFilter.value || currencyFilter.value)
  const match = (u: BusinessUnit) => (!search.value || u.name.toLowerCase().includes(search.value.toLowerCase()) || u.code.toLowerCase().includes(search.value.toLowerCase()))
    && (!typeFilter.value || u.unitType === typeFilter.value) && (!currencyFilter.value || u.currency === currencyFilter.value)
  const walk = (parentId: string | null, depth: number) => {
    for (const u of consolUnits.filter((x) => x.parentId === parentId)) {
      const kids = consolUnits.some((x) => x.parentId === u.id)
      const last = lastConsolidationOf(u.id)
      if (!filtering || match(u)) {
        out.push({
          id: u.id, name: u.name, code: u.code, indent: filtering ? 0 : depth, hasChild: !filtering && kids, dataSource: u.dataSource,
          currency: u.currency, status: u.status, unitType: u.unitType,
          lastConsolidation: last?.name ?? '', lastPeriod: last ? formatPeriod(last) : '', updatedAt: u.updatedAt, updatedBy: u.updatedBy,
        })
      }
      if (filtering || !collapsed.value.has(u.id)) walk(u.id, depth + 1)
    }
  }
  walk(null, 0)
  // Orphans (parent deleted) still show at the root.
  for (const u of consolUnits.filter((x) => x.parentId && !consolUnits.some((p) => p.id === x.parentId))) {
    if (!out.some((r) => r.id === u.id) && (!filtering || match(u))) {
      out.push({ id: u.id, name: u.name, code: u.code, indent: 0, hasChild: false, dataSource: u.dataSource, currency: u.currency, status: u.status, unitType: u.unitType, lastConsolidation: '', lastPeriod: '', updatedAt: u.updatedAt, updatedBy: u.updatedBy })
    }
  }
  return out
})
const { currentPage, paginated, total, perPage, setPage, setPerPage } = useTableState<Row>(tree, { perPage: 25 })
const typeOptions = computed(() => (Object.keys(UNIT_TYPE_LABEL) as UnitType[]).map((k) => ({ value: k, label: t(UNIT_TYPE_LABEL[k]) })))
const hasActiveFilter = computed(() => !!(search.value || typeFilter.value || currencyFilter.value))
function resetFilters() { search.value = ''; typeFilter.value = ''; currencyFilter.value = '' }
function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const STATUS_TYPE: Record<BusinessUnit['status'], 'completed' | 'information' | 'critical'> = { active: 'information', connected: 'completed', disconnected: 'critical' }

// ─── Add / edit ──────────────────────────────────────────────────────────────
const sourceOpen = ref(false)
const sourcePick = ref<DataSource | ''>('')
const sourceError = ref('')
function openAdd(parentId: string | null = null) { sourcePick.value = ''; sourceError.value = ''; pendingParent.value = parentId; sourceOpen.value = true }
const pendingParent = ref<string | null>(null)
function continueSource() {
  if (!sourcePick.value) { sourceError.value = t('Please select a data source'); return }
  sourceOpen.value = false
  openDrawer(null, sourcePick.value, pendingParent.value)
}
const SOURCES: { id: DataSource; label: string; desc: string }[] = [
  { id: 'erp', label: 'Mekari ERP', desc: 'Automatically synchronizes trial balance data. No more manual uploads needed for future consolidations.' },
  { id: 'jurnal', label: 'Mekari Jurnal', desc: 'Automatically synchronizes trial balance data. No more manual uploads needed for future consolidations.' },
  { id: 'spreadsheet', label: 'Spreadsheet', desc: 'Requires manual upload of trial balance data through provided template. You must upload a new file every time you perform consolidation.' },
]

const drawerOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', code: '', currency: '', unitType: 'subsidiary' as UnitType, parentId: '', dataSource: 'erp' as DataSource, file: '' })
const errors = reactive<Record<string, string>>({})
function openDrawer(id: string | null, source?: DataSource, parentId: string | null = null) {
  Object.keys(errors).forEach((k) => (errors[k] = ''))
  editingId.value = id
  const u = id ? consolUnits.find((x) => x.id === id) : null
  Object.assign(form, u
    ? { name: u.name, code: u.code, currency: u.currency, unitType: u.unitType, parentId: u.parentId ?? '', dataSource: u.dataSource, file: u.trialBalanceFile ?? '' }
    : { name: '', code: '', currency: 'IDR', unitType: 'subsidiary', parentId: parentId ?? 'bu-cpi', dataSource: source ?? 'erp', file: '' })
  drawerOpen.value = true
}
const parentOptions = computed(() => consolUnits.filter((u) => u.id !== editingId.value).map((u) => ({ value: u.id, label: `${u.code} · ${u.name}` })))
const unitTypeFormOptions = computed(() => [{ value: 'affiliate', label: t('Affiliate') }, { value: 'subsidiary', label: t('Subsidiary') }])
const isPrimary = computed(() => !!editingId.value && consolUnits.find((u) => u.id === editingId.value)?.unitType === 'primary')
function save() {
  errors.name = form.name.trim() ? '' : `${t('You must fill in')} ${t('Unit name')}`
  errors.code = form.code.trim() ? '' : `${t('You must fill in')} ${t('Unit code')}`
  if (!errors.code && consolUnits.some((u) => u.id !== editingId.value && u.code.toLowerCase() === form.code.trim().toLowerCase())) errors.code = t('Unit code already in use')
  errors.currency = form.currency ? '' : `${t('You must fill in')} ${t('Base currency')}`
  errors.parent = !isPrimary.value && form.unitType === 'subsidiary' && !form.parentId ? t('Please select a parent business unit for the subsidiary.') : ''
  if (Object.values(errors).some(Boolean)) return
  const now = new Date().toISOString()
  if (editingId.value) {
    const u = consolUnits.find((x) => x.id === editingId.value)!
    Object.assign(u, { name: form.name.trim(), code: form.code.trim().toUpperCase(), currency: form.currency, updatedAt: now, updatedBy: 'Rizal Candra' })
    if (!isPrimary.value) Object.assign(u, { unitType: form.unitType, parentId: form.parentId || null })
    successToast(t('Business unit changes successfully saved'))
  } else {
    consolUnits.push({
      id: newId('bu'), code: form.code.trim().toUpperCase(), name: form.name.trim(), dataSource: form.dataSource, currency: form.currency,
      unitType: form.unitType, parentId: form.parentId || null, status: form.dataSource === 'spreadsheet' ? 'active' : 'connected',
      updatedAt: now, updatedBy: 'Rizal Candra', ...(form.dataSource === 'spreadsheet' && form.file ? { trialBalanceFile: form.file } : {}),
    })
    successToast(t('Business unit successfully added'))
  }
  drawerOpen.value = false
}

// ─── Row actions ─────────────────────────────────────────────────────────────
const isUsed = (id: string) => consolidations.some((c) => c.unitIds.includes(id))
const hasChild = (id: string) => consolUnits.some((u) => u.parentId === id)
function deleteBlockedReason(id: string): string {
  if (hasChild(id)) return t("Can't delete a parent business unit that has subsidiaries. Move or delete all subsidiaries first.")
  if (isUsed(id)) return t("Can't delete a business unit that's already used in a consolidation.")
  return ''
}
const deleteOpen = ref(false)
const pending = ref<Row | null>(null)
function askDelete(r: Row) { if (deleteBlockedReason(r.id)) return; pending.value = r; deleteOpen.value = true }
function confirmDelete() {
  if (!pending.value) return
  const id = pending.value.id
  const i = consolUnits.findIndex((u) => u.id === id)
  if (i >= 0) consolUnits.splice(i, 1)
  for (let g = unitGroups.length - 1; g >= 0; g--) {
    unitGroups[g]!.unitIds = unitGroups[g]!.unitIds.filter((x) => x !== id)
    if (!unitGroups[g]!.unitIds.length) unitGroups.splice(g, 1)
  }
  successToast(t('Business unit successfully deleted'))
}
function refresh(r: Row) {
  const u = consolUnits.find((x) => x.id === r.id)!
  u.updatedAt = new Date().toISOString(); u.updatedBy = 'Rizal Candra'
  if (u.status === 'disconnected') { infoToast(t('Jurnal connection lost.')); return }
  successToast(t('Business unit data successfully refreshed'))
}
const logOpen = ref(false)
const logEntries = ref<ActivityEntry[]>([])
const logSubject = ref('')
function viewLog(r: Row) {
  logSubject.value = r.name
  logEntries.value = [
    { date: r.updatedAt, user: r.updatedBy, activity: t('Update'), details: [{ label: t('Unit name'), value: r.name }, { label: t('Currency'), value: r.currency }] },
    { date: '2026-06-02T10:00:00', user: 'Rizal Candra', activity: t('Create'), details: [{ label: t('Unit code'), value: r.code }, { label: t('Data source'), value: t(DATA_SOURCE_LABEL[r.dataSource]) }] },
  ]
  logOpen.value = true
}

// ─── Groups ──────────────────────────────────────────────────────────────────
const groupColumns: TableColumn[] = [
  { key: 'name', label: t('Group name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'entities', label: t('Entities'), kind: 'address' },
  { key: 'lastUsed', label: t('Last used'), kind: 'date' },
]
const groupSearch = ref('')
interface GroupRow { id: string; name: string; entities: string; count: number; lastUsed: string }
const groupRows = computed<GroupRow[]>(() => unitGroups
  .filter((g) => !groupSearch.value || g.name.toLowerCase().includes(groupSearch.value.toLowerCase()))
  .map((g) => ({ id: g.id, name: g.name, count: g.unitIds.length, entities: g.unitIds.map((id) => consolUnits.find((u) => u.id === id)?.code ?? '').filter(Boolean).join(', '), lastUsed: g.lastUsed ? formatDateTime(g.lastUsed) : '-' })))
const groupTable = useTableState<GroupRow>(groupRows, { perPage: 25 })
const groupDrawerOpen = ref(false)
const groupEditing = ref<string | null>(null)
const groupForm = reactive({ name: '', unitIds: [] as string[] })
const groupErrors = reactive({ name: '', units: '' })
function openGroup(id: string | null) {
  groupEditing.value = id
  const g = id ? unitGroups.find((x) => x.id === id) : null
  groupForm.name = g?.name ?? ''
  groupForm.unitIds = g ? [...g.unitIds] : []
  groupErrors.name = ''; groupErrors.units = ''
  groupDrawerOpen.value = true
}
function toggleGroupUnit(id: string) {
  groupForm.unitIds = groupForm.unitIds.includes(id) ? groupForm.unitIds.filter((x) => x !== id) : [...groupForm.unitIds, id]
  groupErrors.units = ''
}
function saveGroup() {
  const n = groupForm.name.trim()
  groupErrors.name = !n ? t('Group name is required') : n.length < 3 ? t('Group name must be at least 3 characters')
    : unitGroups.some((g) => g.id !== groupEditing.value && g.name.toLowerCase() === n.toLowerCase()) ? t('Group name already exists') : ''
  groupErrors.units = groupForm.unitIds.length ? '' : t('Select at least one business unit')
  if (groupErrors.name || groupErrors.units) return
  if (groupEditing.value) {
    Object.assign(unitGroups.find((g) => g.id === groupEditing.value)!, { name: n, unitIds: [...groupForm.unitIds] })
    successToast(t('Group updated successfully'))
  } else {
    unitGroups.push({ id: newId('grp'), name: n, unitIds: [...groupForm.unitIds], lastUsed: null })
    successToast(t('Group created successfully'))
  }
  groupDrawerOpen.value = false
}
const groupDeleteOpen = ref(false)
const groupPending = ref<GroupRow | null>(null)
function confirmGroupDelete() {
  const i = unitGroups.findIndex((g) => g.id === groupPending.value?.id)
  if (i >= 0) unitGroups.splice(i, 1)
  successToast(t('Group deleted successfully'))
}
</script>

<template>
  <div class="bu">
    <div class="bu-head">
      <h2 class="bu-title">{{ t('Business Unit') }}</h2>
      <MpButton v-if="view === 'table'" variant="primary" is-rounded @click="openAdd()">{{ t('Add business unit') }}</MpButton>
      <MpButton v-else variant="primary" is-rounded @click="openGroup(null)">{{ t('Create new group') }}</MpButton>
    </div>

    <MpTabs id="bu-view-tabs" v-model="viewIndex" is-manual variant-color="green">
      <MpTabList>
        <MpTab id="bu-tab-table" value="table">{{ t('Table') }}</MpTab>
        <MpTab id="bu-tab-group" value="group">{{ t('Group') }}</MpTab>
      </MpTabList>
    </MpTabs>

    <ErpTablePage
      v-if="view === 'table'"
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :search="search"
      :has-active-filter="hasActiveFilter"
      filter-empty-label="business units"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @clear-filters="resetFilters"
    >
      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="bu-type" v-model="typeFilter" :placeholder="t('Unit type')" :options="typeOptions" />
          <ErpFilterSelect id="bu-currency" v-model="currencyFilter" :placeholder="t('Currency')" :options="CONSOL_CURRENCY_OPTIONS" />
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search unit name')" />
          </div>
        </div>
      </template>

      <template #cell-name="{ row }">
        <span class="bu-name" :style="{ paddingLeft: `calc(${(row as unknown as Row).indent} * var(--mp-spacing-5))` }">
          <MpButton v-if="(row as unknown as Row).hasChild" variant="ghost" is-rounded class="bu-caret" :aria-label="t('Expand')" @click="toggleCollapse((row as unknown as Row).id)">
            <MpIcon :name="collapsed.has((row as unknown as Row).id) ? 'caret-right' : 'caret-down'" size="sm" />
          </MpButton>
          <span class="bu-name-text">
            <span class="bu-name-main" :title="(row as unknown as Row).name">{{ (row as unknown as Row).name }}</span>
            <span class="bu-sub">{{ (row as unknown as Row).code }} · {{ t(UNIT_TYPE_LABEL[(row as unknown as Row).unitType]) }}</span>
          </span>
        </span>
      </template>
      <template #cell-dataSource="{ row }">{{ t(DATA_SOURCE_LABEL[(row as unknown as Row).dataSource]) }}</template>
      <template #cell-status="{ row }">
        <ErpStatusBadge :status="(row as unknown as Row).status" :label="t(UNIT_STATUS_LABEL[(row as unknown as Row).status])" :type="STATUS_TYPE[(row as unknown as Row).status]" />
      </template>
      <template #cell-lastConsolidation="{ row }">
        <span v-if="(row as unknown as Row).lastConsolidation" class="bu-stack">
          <span>{{ (row as unknown as Row).lastConsolidation }}</span>
          <span class="bu-sub">{{ (row as unknown as Row).lastPeriod }}</span>
        </span>
        <span v-else>-</span>
      </template>
      <template #cell-updatedAt="{ row }">
        <span class="bu-stack">
          <span>{{ formatDateTime((row as unknown as Row).updatedAt) }}</span>
          <span class="bu-sub">{{ (row as unknown as Row).updatedBy }}</span>
        </span>
      </template>

      <template #actions="{ row }">
        <MpPopover :id="`bu-row-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Action')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openAdd((row as unknown as Row).id)">{{ t('Add subsidiary') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="(row as unknown as Row).dataSource !== 'spreadsheet'" @click="refresh(row as unknown as Row)">{{ t('Refresh') }}</MpPopoverListItem>
              <MpPopoverListItem @click="viewLog(row as unknown as Row)">{{ t('View activity log') }}</MpPopoverListItem>
              <MpPopoverListItem @click="openDrawer((row as unknown as Row).id)">{{ t('Edit') }}</MpPopoverListItem>
              <MpTooltip v-if="deleteBlockedReason((row as unknown as Row).id)" :label="deleteBlockedReason((row as unknown as Row).id)" placement="left">
                <MpPopoverListItem is-disabled>{{ t('Delete') }}</MpPopoverListItem>
              </MpTooltip>
              <MpPopoverListItem v-else @click="askDelete(row as unknown as Row)">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('Business unit list will appear here') }}</p>
          <p class="empty-full-desc">{{ t('Add business units from Add business unit button.') }}</p>
        </div>
      </template>
    </ErpTablePage>

    <ErpTablePage
      v-else
      :columns="groupColumns"
      :rows="(groupTable.paginated.value as unknown as Record<string, unknown>[])"
      :total="groupTable.total.value"
      :current-page="groupTable.currentPage.value"
      :per-page="groupTable.perPage.value"
      :search="groupSearch"
      :has-active-filter="!!groupSearch"
      filter-empty-label="groups"
      @page-change="groupTable.setPage"
      @per-page-change="groupTable.setPerPage"
      @clear-filters="groupSearch = ''"
    >
      <template #filters>
        <div class="filter-left" />
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="groupSearch" class="filter-search-input" type="text" :placeholder="t('Search group')" />
          </div>
        </div>
      </template>
      <template #cell-name="{ row }"><span class="cell-link" @click="openGroup((row as unknown as GroupRow).id)">{{ (row as unknown as GroupRow).name }}</span></template>
      <template #cell-entities="{ row }">
        <span class="bu-stack">
          <span>{{ (row as unknown as GroupRow).count }} {{ (row as unknown as GroupRow).count === 1 ? t('entity') : t('entities') }}</span>
          <span class="bu-sub">{{ (row as unknown as GroupRow).entities }}</span>
        </span>
      </template>
      <template #actions="{ row }">
        <MpPopover :id="`bu-grp-${(row as unknown as GroupRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Action')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openGroup((row as unknown as GroupRow).id)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="groupPending = row as unknown as GroupRow; groupDeleteOpen = true">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>
      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('Group list will appear here') }}</p>
          <p class="empty-full-desc">{{ t('Create groups from the Create group button.') }}</p>
        </div>
      </template>
    </ErpTablePage>
  </div>

  <!-- Data source modal -->
  <MpModal id="bu-source-modal" :is-open="sourceOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="sourceOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Add business unit') }}</MpModalHeader>
      <MpModalBody>
        <p class="bu-modal-desc">{{ t('Select data source for business unit:') }}</p>
        <div class="bu-sources">
          <label v-for="s in SOURCES" :key="s.id" class="bu-source" :class="{ 'bu-source--on': sourcePick === s.id }">
            <MpRadio :id="`bu-src-${s.id}`" name="bu-src" :value="s.id" :is-checked="sourcePick === s.id" @change="sourcePick = s.id; sourceError = ''">{{ t(s.label) }}</MpRadio>
            <span class="bu-source-desc">{{ t(s.desc) }}</span>
          </label>
        </div>
        <p v-if="sourceError" class="bu-error">{{ sourceError }}</p>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="sourceOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="continueSource">{{ t('Continue') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>

  <!-- Add / edit drawer -->
  <ConsolDrawer :open="drawerOpen" :title="editingId ? t('Edit business unit') : t('Add business unit')" @close="drawerOpen = false">
    <span class="bu-section">{{ t('Unit information') }}</span>
    <MpFormControl id="bu-name-fc" is-required :is-invalid="!!errors.name">
      <MpFormLabel>{{ t('Unit name') }}</MpFormLabel>
      <MpInput id="bu-name" v-model="form.name" :is-invalid="!!errors.name" @input="errors.name = ''" />
      <MpFormErrorMessage v-if="errors.name">{{ errors.name }}</MpFormErrorMessage>
    </MpFormControl>
    <div class="bu-field">
      <span class="bu-field-label bu-req">{{ t('Base currency') }}</span>
      <ErpFilterSelect id="bu-cur" :model-value="form.currency" :placeholder="t('Select currency')" :options="CONSOL_CURRENCY_OPTIONS" width="100%" @update:model-value="(v: string) => { form.currency = v; errors.currency = '' }" />
      <span v-if="errors.currency" class="bu-error">{{ errors.currency }}</span>
    </div>
    <MpFormControl id="bu-code-fc" is-required :is-invalid="!!errors.code">
      <MpFormLabel>{{ t('Unit code') }}</MpFormLabel>
      <MpInput id="bu-code" v-model="form.code" :is-invalid="!!errors.code" @input="errors.code = ''" />
      <MpFormErrorMessage v-if="errors.code">{{ errors.code }}</MpFormErrorMessage>
    </MpFormControl>
    <template v-if="!isPrimary">
      <div class="bu-field">
        <span class="bu-field-label">{{ t('Unit type') }}</span>
        <ErpFilterSelect id="bu-type-f" :model-value="form.unitType" :placeholder="t('Select unit type')" :options="unitTypeFormOptions" :is-clearable="false" width="100%" @update:model-value="(v: string) => (form.unitType = v as UnitType)" />
      </div>
      <div class="bu-field">
        <span class="bu-field-label">{{ t('Parent business unit') }}</span>
        <ErpFilterSelect id="bu-parent" :model-value="form.parentId" :placeholder="t('Select parent business unit')" :options="parentOptions" width="100%" @update:model-value="(v: string) => { form.parentId = v; errors.parent = '' }" />
        <span v-if="errors.parent" class="bu-error">{{ errors.parent }}</span>
      </div>
    </template>
    <div v-if="form.dataSource === 'spreadsheet'" class="bu-field">
      <span class="bu-field-label">{{ t('Trial balance data') }}</span>
      <span class="bu-hint">{{ t('Download and use our template to ensure your file format is correct.') }}</span>
      <div class="bu-file-row">
        <MpButton variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Download template') }}</MpButton>
        <MpButton variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Select file') }}</MpButton>
      </div>
      <span class="bu-hint">{{ form.file || t('File must be in XLSX format maximum 10 MB') }}</span>
    </div>
    <div v-else class="bu-field">
      <span class="bu-field-label">{{ t('Data source') }}</span>
      <span>{{ t(DATA_SOURCE_LABEL[form.dataSource]) }}</span>
    </div>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="save">{{ editingId ? t('Save changes') : t('Save') }}</MpButton>
    </template>
  </ConsolDrawer>

  <!-- Group drawer -->
  <ConsolDrawer :open="groupDrawerOpen" :title="groupEditing ? t('Edit group') : t('Create new group')" @close="groupDrawerOpen = false">
    <MpFormControl id="grp-name-fc" is-required :is-invalid="!!groupErrors.name">
      <MpFormLabel>{{ t('Group name') }}</MpFormLabel>
      <MpInput id="grp-name" v-model="groupForm.name" :is-invalid="!!groupErrors.name" @input="groupErrors.name = ''" />
      <MpFormErrorMessage v-if="groupErrors.name">{{ groupErrors.name }}</MpFormErrorMessage>
    </MpFormControl>
    <div class="bu-field">
      <span class="bu-section">{{ t('SELECT ENTITIES') }}</span>
      <div class="bu-checks">
        <MpCheckbox v-for="u in consolUnits" :id="`grp-u-${u.id}`" :key="u.id" :is-checked="groupForm.unitIds.includes(u.id)" @change="toggleGroupUnit(u.id)">{{ u.code }} · {{ u.name }}</MpCheckbox>
      </div>
      <span v-if="groupErrors.units" class="bu-error">{{ groupErrors.units }}</span>
    </div>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="groupDrawerOpen = false">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="saveGroup">{{ t('Save group') }}</MpButton>
    </template>
  </ConsolDrawer>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete business unit?')"
    :description="t('Consolidations with completed status in the deleted business unit cannot be re-run. Groups with only this business unit will also be deleted.')"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
  <ConfirmModal
    v-model:is-open="groupDeleteOpen"
    :title="t('Delete group?')"
    :description="`${t('Delete group')} &quot;${groupPending?.name ?? ''}&quot;? ${t('This group will be removed. The business units in it are not deleted.')}`"
    :confirm-label="t('Delete')"
    @confirm="confirmGroupDelete"
  />
  <ActivityLogModal :is-open="logOpen" :subject="logSubject" :entries="logEntries" @close="logOpen = false" />
</template>

<style scoped>
.bu { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; }
.bu-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.bu-title { margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.filter-left { flex: 1 1 auto; display: flex; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.bu-name { display: flex; align-items: flex-start; gap: var(--mp-spacing-1); min-width: 0; }
.bu-caret { flex-shrink: 0; min-width: 0 !important; width: var(--mp-sizes-6, 24px) !important; height: var(--mp-sizes-6, 24px) !important; padding: 0 !important; }
.bu-name-text { display: flex; flex-direction: column; min-width: 0; }
.bu-name-main { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bu-stack { display: flex; flex-direction: column; }
.bu-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bu-modal-desc { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); }
.bu-sources { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bu-source { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); cursor: pointer; }
.bu-source--on { border-color: var(--mp-border-selected, var(--mp-border-brand)); }
.bu-source-desc { padding-left: var(--mp-spacing-7, 28px); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bu-section { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 1px; text-transform: uppercase; color: var(--mp-text-secondary); }
.bu-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; font-size: var(--mp-font-sizes-md); }
.bu-field-label { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bu-req::after { content: ' *'; color: var(--mp-text-danger); }
.bu-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bu-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.bu-file-row { display: flex; gap: var(--mp-spacing-2); }
.bu-checks { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-2); }
.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
