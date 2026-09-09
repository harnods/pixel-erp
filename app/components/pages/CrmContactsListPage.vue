<script setup lang="ts">
/**
 * CRM ▸ Customers ▸ Contacts (/crm/customers/contacts).
 *
 * The people directory of the CRM — every contact person across all companies.
 * A full-bleed list surface under the "Customers" L2 nav: it owns its `.detail-bar`
 * title bar + scrollable `.detail-stage`, mirroring CrmModulesPage exactly.
 *
 * Filtering: a single "All filters" drawer (rule/filter-bar-all-filters-drawer)
 * — Keyword (scoped to a column) + Owner (Is any of / Is none of). Bulk select
 * with a Delete action (confirmed via ConfirmModal, rule/btn-danger-confirm).
 */
import { computed, reactive, ref } from 'vue'
import { MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, toast, css } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import CrmContactsFiltersDrawer, { emptyContactsFilters, type ContactsFiltersValue } from '~/components/patterns/CrmContactsFiltersDrawer.vue'
import { crmContactPeople, companiesOfContact, deleteCrmContactPerson, can, CRM_CURRENT_USER, CRM_OWNERS, type CrmContactPerson } from '~/data/crm'
import { infoToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

// ── Permission gates (signed-in user) ──
const canCreate = computed(() => can('contacts.create'))
const canEdit = computed(() => can('contacts.edit'))
const canViewAll = computed(() => can('contacts.readAll'))

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
  { key: 'owner',        label: 'Owner',        sortable: true, sortType: 'text' },
  { key: 'lastActivity', label: 'Last updated', kind: 'date', sortable: true, sortType: 'date' },
]

// Stringify a column's value for keyword-by-column search.
function colText(r: ContactRow, key: string): string {
  switch (key) {
    case 'name': return r.name
    case 'company': return r.companyName
    case 'email': return r.email
    case 'phone': return r.phone
    case 'owner': return r.owner
    default: return ''
  }
}

// ── "All filters" drawer ──
const contactFilters = ref<ContactsFiltersValue>(emptyContactsFilters())
const filtersOpen = ref(false)
const ownerOptions = [...CRM_OWNERS]
function openFilters() { filtersOpen.value = true }
function onApplyFilters(f: ContactsFiltersValue) { contactFilters.value = f; filtersOpen.value = false }

const toolbarFiltered = computed<ContactRow[]>(() => rows.value.filter((r) => {
  const cf = contactFilters.value
  // "Only my contacts" access → hide records not owned by the signed-in user.
  if (!canViewAll.value && r.owner !== CRM_CURRENT_USER) return false
  if (cf.owners.length) {
    const has = cf.owners.includes(r.owner)
    if (cf.ownerComparator === 'isAnyOf' && !has) return false
    if (cf.ownerComparator === 'isNoneOf' && has) return false
  }
  if (cf.keyword.trim()) {
    const kw = cf.keyword.trim().toLowerCase()
    const hay = cf.keywordColumn === 'all'
      ? [r.name, r.companyName, r.email, r.phone, r.owner].join(' ')
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
  return f.owners.length + (f.keyword.trim() ? 1 : 0)
})
const hasActiveFilter = computed(() => !!search.value || activeFilterCount.value > 0)
function clearFilters() { search.value = ''; contactFilters.value = emptyContactsFilters() }

const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
const drawerColumns = computed(() => visibleColumns.value.filter((c) => c.key !== 'lastActivity').map((c) => ({ key: c.key, label: c.label })))
function hideColumn(key: string) { columnVisibility[key] = false }

// ── Bulk / row delete (confirmed) ──
const deleteOpen = ref(false)
const deleteTargets = ref<string[]>([])
let deleteDeselect: (() => void) | null = null
function selectedContactIds(sel: Set<number>): string[] {
  return [...new Set([...sel].map((i) => (paginated.value[i] as ContactRow | undefined)?.id).filter(Boolean) as string[])]
}
function openDelete(ids: string[], deselect?: () => void) {
  if (!ids.length) return
  deleteTargets.value = ids
  deleteDeselect = deselect ?? null
  deleteOpen.value = true
}
function confirmDelete() {
  const n = deleteTargets.value.length
  deleteTargets.value.forEach((id) => deleteCrmContactPerson(id))
  deleteDeselect?.()
  deleteDeselect = null
  toast.notify({ variant: 'success', title: n === 1 ? t('Contact deleted') : t('Contacts deleted'), maxWidth: 'max-content' })
}
const deleteDescription = computed(() =>
  deleteTargets.value.length === 1
    ? t('This contact will be permanently deleted.')
    : t('The selected contacts will be permanently deleted.'),
)
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
        <MpButton v-if="canCreate" variant="primary" is-rounded left-icon="add" @click="router.push('/crm/customers/contacts/new')">{{ t('New contact') }}</MpButton>
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
      >
        <template #filters>
          <div class="filter-left">
            <button class="btn-enterprise btn-enterprise--secondary filter-all-btn" type="button" @click="openFilters">
              <MpIcon name="filter" size="sm" />
              {{ t('All filters') }}{{ activeFilterCount ? ` (${activeFilterCount})` : '' }}
            </button>
          </div>
          <div class="filter-right">
            <div class="filter-btn-group">
              <ColumnSettingsMenu id="cc-columns" :items="columnItems" :visibility="columnVisibility" />
            </div>
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
              <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
            </div>
          </div>
        </template>

        <!-- Bulk actions: Delete -->
        <template #bulk-actions="{ selectedRows, deselectAll }">
          <MpButton
            variant="secondary" size="sm" is-rounded
            @click="openDelete(selectedContactIds(selectedRows as Set<number>), deselectAll)"
          >{{ t('Delete') }}</MpButton>
        </template>

        <!-- Name -->
        <template #cell-name="{ row }">
          <span class="cell-link cell-text" @click.stop="open(row as unknown as ContactRow)">{{ (row as unknown as ContactRow).name }}</span>
        </template>
        <template #cell-company="{ row }">
          <span v-if="(row as unknown as ContactRow).companyId" class="cell-link cell-text" @click.stop="router.push(`/crm/customers/companies/${(row as unknown as ContactRow).companyId}`)">{{ (row as unknown as ContactRow).companyName }}</span>
          <span v-else class="cell-text cru-email">—</span>
        </template>
        <template #cell-email="{ row }"><span class="cell-text">{{ (row as unknown as ContactRow).email }}</span></template>
        <template #cell-phone="{ row }"><span class="cell-text">{{ (row as unknown as ContactRow).phone }}</span></template>
        <template #cell-owner="{ row }"><span class="cell-text">{{ (row as unknown as ContactRow).owner }}</span></template>
        <template #cell-lastActivity="{ row }">
          <LastUpdatedCell :at="(row as unknown as ContactRow).lastActivity" :by="(row as unknown as ContactRow).owner" />
        </template>

        <!-- Actions: View details / Delete -->
        <template #actions="{ row }">
          <MpPopover :id="`cc-actions-${(row as unknown as ContactRow).rowKey}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton class="row-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="open(row as unknown as ContactRow)">{{ t('View details') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="canEdit" @click="soon(t('Edit contact'))">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="canEdit" @click="openDelete([(row as unknown as ContactRow).id])">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
      </ErpTablePage>
    </div>

    <!-- All filters drawer -->
    <CrmContactsFiltersDrawer
      id="cc-filters"
      :is-open="filtersOpen"
      :model-value="contactFilters"
      :owner-options="ownerOptions"
      :columns="drawerColumns"
      @update:is-open="filtersOpen = $event"
      @apply="onApplyFilters"
    />

    <!-- Delete confirmation -->
    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete contact')"
      :description="deleteDescription"
      :confirm-label="t('Delete')"
      @confirm="confirmDelete"
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

.row-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }

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
