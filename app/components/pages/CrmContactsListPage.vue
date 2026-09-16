<script setup lang="ts">
/**
 * CRM ▸ Customers ▸ Contacts (/crm/customers/contacts).
 *
 * The people directory of the CRM — every contact person across all companies.
 * A full-bleed list surface under the "Customers" L2 nav: it owns its `.detail-bar`
 * title bar + scrollable `.detail-stage`, mirroring CrmModulesPage exactly.
 *
 * Filtering: a single "All filters" drawer (rule/filter-bar-all-filters-drawer)
 * — Keyword (scoped to a column) + Owner (Is any of / Is none of). Row actions:
 * View details, Edit, Create in ERP / Open ERP Customer, Archive/Restore (PRD
 * line 249). Bulk "Actions" dropdown: Change owner, Create in ERP,
 * Archive/Restore (PRD line 146-147, 375-376) — no permanent Delete (PRD line
 * 368: "Neither Customer nor Company has permanent Delete in V1"). Export is a
 * filter-bar icon button (next to Column settings), not a bulk action.
 */
import { computed, reactive, ref, watch } from 'vue'
import shortcutIconUrl from '~/assets/images/shortcut-icon.svg?url'
import { MpButton, MpButtonGroup, MpBadge, MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, toast, css } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import ImportSpreadsheetModal from '~/components/patterns/ImportSpreadsheetModal.vue'
import CrmDealOwnerModal from '~/components/patterns/CrmDealOwnerModal.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import CrmContactsFiltersDrawer, { emptyContactsFilters, type ContactsFiltersValue } from '~/components/patterns/CrmContactsFiltersDrawer.vue'
import {
  crmContactPeople, crmCompanies, companiesOfContact, archiveCrmContactPerson, restoreCrmContactPerson,
  contactBlockingCompany, can, CRM_CURRENT_USER, CRM_OWNERS, CRM_SOURCE_OPTIONS,
  createContactInErp, bulkCreateContactsInErp, bulkChangeContactOwner, type CrmContactPerson,
} from '~/data/crm'
import { infoToast, successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

// ── Permission gates (signed-in user) ──
const canCreate = computed(() => can('contacts.create'))
const canEdit = computed(() => can('contacts.edit'))
const canViewAll = computed(() => can('contacts.readAll'))

// Status filter (Active / Archived) — a left-column ErpFilterSelect, not a
// segmented control (rule/select-erpfilterselect). PRD §241/§633: soft archive,
// no permanent delete. The two views are mutually exclusive → non-clearable.
const statusFilter = ref('active')
const statusOptions = [{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]
const showArchived = computed(() => statusFilter.value === 'archived')
watch(showArchived, () => setPage(1))

function open(row: ContactRow) { router.push(`/crm/customers/contacts/${row.id}`) }
function soon(what: string) { infoToast(`${what} — coming soon`) }

// One row per contact↔company association: a contact linked to two companies
// shows as TWO rows (one per company). Contacts with no company show one row.
type ContactRow = CrmContactPerson & { rowKey: string; companyId: string; companyName: string }
const rows = computed<ContactRow[]>(() =>
  crmContactPeople.flatMap((c) => {
    const cos = companiesOfContact(c.id)
    if (!cos.length) return [{ ...c, rowKey: `${c.id}-`, companyId: '', companyName: '' }]
    return cos.map((co) => ({ ...c, rowKey: `${c.id}-${co.id}`, companyId: co.id, companyName: co.name }))
  }),
)

const columns: TableColumn[] = [
  { key: 'name',         label: 'Name',         kind: 'name', sortable: true, sortType: 'text' },
  { key: 'company',      label: 'Company',      kind: 'name', sortable: true, sortType: 'text' },
  { key: 'email',        label: 'Email',        sortable: true, sortType: 'text' },
  { key: 'phone',        label: 'Mobile' },
  { key: 'source',       label: 'Source',       kind: 'status', sortable: true, sortType: 'text' },
  { key: 'owner',        label: 'Owner',        sortable: true, sortType: 'text' },
  { key: 'lastActivity', label: 'Last updated', kind: 'date', sortable: true, sortType: 'date' },
]

// Stringify a column's value for keyword-by-column search.
function colText(r: ContactRow, key: string): string {
  switch (key) {
    case 'name': return r.name
    case 'company': return r.companyName
    case 'email': return (r.emails?.length ? r.emails : [r.email]).join(' ')
    case 'phone': return (r.phones?.length ? r.phones : [r.phone]).join(' ')
    case 'source': return r.source ?? ''
    case 'owner': return r.owner
    default: return ''
  }
}

// ── "All filters" drawer ──
const contactFilters = ref<ContactsFiltersValue>(emptyContactsFilters())
const filtersOpen = ref(false)
const ownerOptions = [...CRM_OWNERS]
const companyOptions = computed(() => [...new Set(crmCompanies.filter((c) => !c.archived).map((c) => c.name))].sort())
const sourceOptions = [...CRM_SOURCE_OPTIONS]
function openFilters() { filtersOpen.value = true }
function onApplyFilters(f: ContactsFiltersValue) { contactFilters.value = f; filtersOpen.value = false }

// Apply an "Is any of / Is none of" tag comparator against a row value.
function matchTag(comparator: 'isAnyOf' | 'isNoneOf', values: string[], value: string): boolean {
  if (!values.length) return true
  const has = values.includes(value)
  return comparator === 'isAnyOf' ? has : !has
}

const toolbarFiltered = computed<ContactRow[]>(() => rows.value.filter((r) => {
  const cf = contactFilters.value
  // Active vs Archived view.
  if (!!r.archived !== showArchived.value) return false
  // "Only my contacts" access → hide records not owned by the signed-in user.
  if (!canViewAll.value && r.owner !== CRM_CURRENT_USER) return false
  if (!matchTag(cf.ownerComparator, cf.owners, r.owner)) return false
  if (!matchTag(cf.companyComparator, cf.companies, r.companyName)) return false
  if (!matchTag(cf.sourceComparator, cf.sources, r.source ?? '')) return false
  if (cf.keyword.trim()) {
    const kw = cf.keyword.trim().toLowerCase()
    const hay = cf.keywordColumn === 'all'
      ? [r.name, r.companyName, colText(r, 'email'), colText(r, 'phone'), r.source ?? '', r.owner, r.city ?? '', r.province ?? '', r.country ?? ''].join(' ')
      : colText(r, cf.keywordColumn)
    if (!hay.toLowerCase().includes(kw)) return false
  }
  return true
}))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<ContactRow>(toolbarFiltered, {
  filterFn: (row, s) =>
    !s
    || row.name.toLowerCase().includes(s)
    || row.email.toLowerCase().includes(s)
    || row.companyName.toLowerCase().includes(s),
  defaultSort: { key: 'name', dir: 'asc' },
})

const activeFilterCount = computed(() => {
  const f = contactFilters.value
  return f.owners.length + f.companies.length + f.sources.length + (f.keyword.trim() ? 1 : 0)
})
const hasActiveFilter = computed(() => !!search.value || activeFilterCount.value > 0)
function clearFilters() { search.value = ''; contactFilters.value = emptyContactsFilters() }

const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
const drawerColumns = computed(() => visibleColumns.value.filter((c) => c.key !== 'lastActivity').map((c) => ({ key: c.key, label: c.label })))
function hideColumn(key: string) { columnVisibility[key] = false }

// ── Bulk / row Archive · Restore (confirmed; soft — no permanent delete) ──
const archiveOpen = ref(false)
const archiveTargets = ref<string[]>([])
let archiveDeselect: (() => void) | null = null
function selectedContactIds(sel: Set<number>): string[] {
  return [...new Set([...sel].map((i) => (paginated.value[i] as ContactRow | undefined)?.id).filter(Boolean) as string[])]
}
function openArchive(ids: string[], deselect?: () => void) {
  if (!ids.length) return
  archiveTargets.value = ids
  archiveDeselect = deselect ?? null
  archiveOpen.value = true
}
function confirmArchive() {
  const restoring = showArchived.value
  if (restoring) {
    const n = archiveTargets.value.length
    archiveTargets.value.forEach((id) => restoreCrmContactPerson(id))
    archiveDeselect?.(); archiveDeselect = null
    toast.notify({ variant: 'success', title: n === 1 ? t('Contact restored') : t('Contacts restored'), maxWidth: 'max-content' })
    return
  }
  // Block archiving a contact that is a company's PIC or sole active member (PRD §351).
  const blocked = archiveTargets.value.filter((id) => contactBlockingCompany(id))
  const allowed = archiveTargets.value.filter((id) => !contactBlockingCompany(id))
  allowed.forEach((id) => archiveCrmContactPerson(id))
  archiveDeselect?.(); archiveDeselect = null
  if (allowed.length) toast.notify({ variant: 'success', title: allowed.length === 1 ? t('Contact archived') : t('Contacts archived'), maxWidth: 'max-content' })
  if (blocked.length) toast.notify({ variant: 'warning', title: t('Some contacts are a company PIC and were kept.'), maxWidth: 'max-content' })
}
const archiveTitle = computed(() => showArchived.value ? t('Restore contact') : t('Archive contact'))
const archiveConfirmLabel = computed(() => showArchived.value ? t('Restore') : t('Archive'))
const archiveDescription = computed(() => {
  const n = archiveTargets.value.length
  if (showArchived.value) {
    return n === 1 ? t('This contact will be restored to the active list.') : t('The selected contacts will be restored to the active list.')
  }
  return n === 1 ? t('This contact will be archived. You can restore it later.') : t('The selected contacts will be archived. You can restore them later.')
})

// ── Create in ERP (row + bulk) — PRD line 31, 50-56, 249-254, 375-376 ──
async function onCreateInErp(row: ContactRow) {
  const r = await createContactInErp(row.id)
  if (r.ok) successToast(t('Contact created in ERP'))
  else infoToast(r.error ?? t('Could not create in ERP'))
}
function onOpenErpCustomer(row: ContactRow) {
  infoToast(row.erpCustomerId ?? '')
}
async function onBulkCreateInErp(ids: string[], deselect?: () => void) {
  if (!ids.length) return
  const res = await bulkCreateContactsInErp(ids)
  deselect?.()
  const ok = res.filter((r) => r.ok).length
  const failed = res.length - ok
  if (failed === 0) successToast(`${ok} ${ok === 1 ? t('contact') : t('contacts')} ${t('created in ERP')}`)
  else infoToast(`${ok} ${t('created in ERP')}, ${failed} ${t('skipped')}`)
}

// ── Bulk owner reassignment — PRD "Customer bulk actions" ──
const ownerModalOpen = ref(false)
const bulkIds = ref<string[]>([])
let ownerDeselect: (() => void) | null = null
function openBulkOwner(ids: string[], deselect?: () => void) {
  if (!ids.length) return
  bulkIds.value = ids; ownerDeselect = deselect ?? null; ownerModalOpen.value = true
}
function onBulkOwner(owner: string) {
  const res = bulkChangeContactOwner(bulkIds.value, owner)
  ownerDeselect?.(); ownerDeselect = null
  const ok = res.filter((r) => r.ok).length
  const failed = res.length - ok
  if (failed === 0) successToast(`${ok} ${ok === 1 ? t('contact') : t('contacts')} ${t('updated')} (${t('owner')} → ${owner})`)
  else infoToast(`${ok} ${t('updated')}, ${failed} ${t('skipped')} (${t('owner')} → ${owner})`)
  ownerModalOpen.value = false
}

// ── Export — filter-bar icon button (next to Column settings), same
//    ExportModal master component used across the ERP (e.g. CrmDealsPage). ──
// ── Import — shared spreadsheet-dropzone modal (same as Deals) ──
const importOpen = ref(false)
function onImportUpload(files: File[]) {
  successToast(`${files.length} ${files.length === 1 ? t('file') : t('files')} ${t('queued for import')}`)
}

const exportOpen = ref(false)
const selectedCount = ref(0)
const exportColumns = [
  { key: 'name', label: t('Name') }, { key: 'company', label: t('Company') },
  { key: 'email', label: t('Email') }, { key: 'phone', label: t('Mobile') },
  { key: 'source', label: t('Source') }, { key: 'owner', label: t('Owner') },
  { key: 'lastActivity', label: t('Last updated') },
]
function onExport() { exportOpen.value = false; successToast(t('Export ready — check your downloads')) }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Contacts') }}</h1>
        </div>
      </div>
      <div class="cd-bar-actions">
        <MpButtonGroup>
          <MpButton v-if="canCreate" variant="secondary" is-rounded @click="importOpen = true">{{ t('Import') }}</MpButton>
          <MpButton v-if="canCreate && !showArchived" variant="primary" is-rounded left-icon="add" @click="router.push('/crm/customers/contacts/new')">{{ t('New contact') }}</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <div class="detail-stage">
      <ErpTablePage
        :columns="visibleColumns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :has-checkbox="canEdit"
        bulk-label="contact"
        filter-empty-label="contact"
        :search="search"
        :has-active-filter="hasActiveFilter"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @hide-column="hideColumn"
        @clear-filters="clearFilters"
        @selection-change="(count: number) => (selectedCount = count)"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect
              id="cc-status" :model-value="statusFilter" :placeholder="t('Status')"
              :options="statusOptions" :is-clearable="false" width="160px"
              @update:model-value="(v: string) => (statusFilter = v)"
            />
            <button class="btn-enterprise btn-enterprise--secondary filter-all-btn" type="button" @click="openFilters">
              <MpIcon name="filter" size="sm" />
              {{ t('All filters') }}{{ activeFilterCount ? ` (${activeFilterCount})` : '' }}
            </button>
          </div>
          <div class="filter-right">
            <MpButtonGroup class="filter-btn-group">
              <ColumnSettingsMenu id="cc-columns" :items="columnItems" :visibility="columnVisibility" />
              <MpTooltip :label="t('Export')" placement="bottom">
                <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
              </MpTooltip>
            </MpButtonGroup>
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
              <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
            </div>
          </div>
        </template>

        <!-- Bulk actions: single "Actions" dropdown — Change owner, Create contact
             in ERP, Archive/Restore (PRD line 146-147). No permanent Delete; Export
             lives in the filter bar (next to Column settings), not here. -->
        <template #bulk-actions="{ selectedRows, deselectAll }">
          <MpPopover id="cc-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <MpPopoverList>
                <MpPopoverListItem v-if="!showArchived" @click="openBulkOwner(selectedContactIds(selectedRows as Set<number>), deselectAll)">{{ t('Change owner') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="!showArchived" @click="onBulkCreateInErp(selectedContactIds(selectedRows as Set<number>), deselectAll)">{{ t('Create contact in ERP') }}</MpPopoverListItem>
                <MpPopoverListItem @click="openArchive(selectedContactIds(selectedRows as Set<number>), deselectAll)">{{ showArchived ? t('Restore') : t('Archive') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <!-- Name -->
        <template #cell-name="{ row }">
          <span class="cc-name-cell">
            <span class="cell-link cell-text" @click.stop="open(row as unknown as ContactRow)">{{ (row as unknown as ContactRow).name }}</span>
            <MpTooltip
              v-if="(row as unknown as ContactRow).erpStatus === 'created'"
              :id="`cc-erp-badge-${(row as unknown as ContactRow).rowKey}`"
              :label="`${t('Created in ERP')} - ${(row as unknown as ContactRow).erpCustomerId}`"
              placement="top" use-portal
            >
              <MpBadge for="tableStatus" type="announcement" size="sm" class="cc-erp-badge">
                <MpIcon name="arrows-right" size="sm" />{{ t('ERP') }}
              </MpBadge>
            </MpTooltip>
          </span>
        </template>
        <template #cell-company="{ row }">
          <span v-if="(row as unknown as ContactRow).companyId" class="cell-link cell-text" @click.stop="router.push(`/crm/customers/companies/${(row as unknown as ContactRow).companyId}`)">{{ (row as unknown as ContactRow).companyName }}</span>
          <span v-else class="cell-text cru-email">—</span>
        </template>
        <template #cell-email="{ row }"><span class="cell-text">{{ (row as unknown as ContactRow).email }}</span></template>
        <template #cell-phone="{ row }"><span class="cell-text">{{ (row as unknown as ContactRow).phone }}</span></template>
        <template #cell-source="{ row }">
          <span v-if="(row as unknown as ContactRow).source" class="cell-text">{{ t((row as unknown as ContactRow).source!) }}</span>
          <span v-else class="cell-text cru-email">—</span>
        </template>
        <template #cell-owner="{ row }"><span class="cell-text">{{ (row as unknown as ContactRow).owner }}</span></template>
        <template #cell-lastActivity="{ row }">
          <LastUpdatedCell :at="(row as unknown as ContactRow).lastActivity" :by="(row as unknown as ContactRow).owner" />
        </template>

        <!-- Actions: View details / Edit / Archive · Restore -->
        <template #actions="{ row }">
          <MpPopover :id="`cc-actions-${(row as unknown as ContactRow).rowKey}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton class="row-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="open(row as unknown as ContactRow)">{{ t('View details') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="canEdit && !showArchived" @click="router.push(`/crm/customers/contacts/${(row as unknown as ContactRow).id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem
                  v-if="canEdit && !showArchived && (row as unknown as ContactRow).erpStatus !== 'created' && (row as unknown as ContactRow).erpStatus !== 'in-sync'"
                  @click="onCreateInErp(row as unknown as ContactRow)"
                >{{ t('Create contact in ERP') }}</MpPopoverListItem>
                <MpPopoverListItem
                  v-if="(row as unknown as ContactRow).erpStatus === 'created'"
                  @click="onOpenErpCustomer(row as unknown as ContactRow)"
                >
                  <span class="cc-menu-row">{{ t('Open contact in ERP') }}<img :src="shortcutIconUrl" class="cc-shortcut-icon" alt="" /></span>
                </MpPopoverListItem>
                <MpPopoverListItem v-if="canEdit" @click="openArchive([(row as unknown as ContactRow).id])">{{ showArchived ? t('Restore') : t('Archive') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <!-- Default empty state (no data ever) — illustration + title + caption +
             secondary CTA (rule/empty-state-structure). Filtered/search-empty reuses
             ErpTablePage's built-in illustrated inline state. -->
        <template #empty>
          <div class="cc-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="cc-empty-illustration" width="288" height="240" />
            <template v-if="showArchived">
              <p class="cc-empty-title">{{ t('No archived contacts') }}</p>
              <p class="cc-empty-desc">{{ t('Contacts you archive will appear here.') }}</p>
            </template>
            <template v-else>
              <p class="cc-empty-title">{{ t('No contacts') }}</p>
              <p class="cc-empty-desc">{{ t('Contacts will appear here.') }}</p>
              <MpButton v-if="canCreate" variant="secondary" is-rounded left-icon="add" @click="router.push('/crm/customers/contacts/new')">{{ t('New contact') }}</MpButton>
            </template>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <!-- All filters drawer -->
    <CrmContactsFiltersDrawer
      id="cc-filters"
      :is-open="filtersOpen"
      :model-value="contactFilters"
      :owner-options="ownerOptions"
      :company-options="companyOptions"
      :source-options="sourceOptions"
      :columns="drawerColumns"
      @update:is-open="filtersOpen = $event"
      @apply="onApplyFilters"
    />

    <!-- Archive / Restore confirmation (soft, non-destructive) -->
    <ConfirmModal
      v-model:is-open="archiveOpen"
      :title="archiveTitle"
      :description="archiveDescription"
      :confirm-label="archiveConfirmLabel"
      :is-danger="false"
      @confirm="confirmArchive"
    />

    <!-- Bulk: Change owner -->
    <CrmDealOwnerModal :open="ownerModalOpen" :count="bulkIds.length" noun="contacts" @close="ownerModalOpen = false" @confirm="onBulkOwner" />

    <!-- Import (title bar) -->
    <ImportSpreadsheetModal :open="importOpen" :title="t('Import contacts')" :entity-label="t('contacts')" @close="importOpen = false" @upload="onImportUpload" />

    <!-- Export (filter-bar icon button) -->
    <ExportModal
      :open="exportOpen"
      :title="t('Export contacts')"
      :entity-label="t('contacts')"
      :columns="exportColumns"
      :total="total"
      :selected-count="selectedCount"
      @close="exportOpen = false"
      @export="onExport"
    />
  </div>
</template>

<style scoped>
/* Shell — mirrors CrmModulesPage's surface exactly. */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; }

/* Name cell — link over a caption. */
.cru-name { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.cru-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-colors-text-link, #165082); text-decoration: none; cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Name cell — link + a gray "→ ERP" badge for contacts already created in ERP. */
.cc-name-cell { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.cc-erp-badge { display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0; }

.row-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }

/* "Open contact in ERP" row menu item — label left, newtab icon flush right. */
.cc-menu-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); width: 100%; }
/* Same "opens elsewhere" shortcut glyph + treatment as ErpSidebar's shortcut rows. */
.cc-shortcut-icon { width: var(--mp-sizes-4); height: var(--mp-sizes-4); flex-shrink: 0; filter: brightness(0) opacity(0.5); }

/* Default (no-data) empty state — illustration + title + caption + secondary CTA. */
.cc-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10) var(--mp-spacing-6); }
.cc-empty-illustration { width: 288px; max-width: 100%; height: auto; margin-bottom: var(--mp-spacing-2); }
.cc-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cc-empty-desc { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-subtle, #536062); }

/* Filter bar (the .filter-search pill box + input are global in erp.css). */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); font-weight: var(--mp-font-weights-semi-bold); }
.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important;
  border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
</style>
