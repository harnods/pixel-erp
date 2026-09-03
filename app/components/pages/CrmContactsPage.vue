<script setup lang="ts">
/**
 * CRM → Customers → Contacts (level-2, sibling of Companies). People inside the
 * companies database (derived from each company's primary contact), so Companies
 * ↔ Contacts stay in sync. Contacts have NO lifecycle of their own (that's a
 * company attribute) — they filter/segment by Contact owner.
 *
 * Full ERP table: sortable columns, column settings, Last-updated column, Tags,
 * bulk-select (Associate to / Delete), per-row [...] actions, and saved views.
 */
import { ref, computed, reactive, inject, onMounted } from 'vue'
import {
  MpIcon, MpTooltip, toast, MpButton, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import CrmContactViewDrawer, { type ContactViewDraft } from '~/components/patterns/CrmContactViewDrawer.vue'
import { useTableState } from '~/composables/useTableState'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { infoToast } from '~/utils/toasts'
import {
  crmContactsList, deleteCrmContact, crmCustomers, CRM_OWNERS,
  crmContactViews, addContactView, updateContactView, deleteContactView, emptyContactViewFilters,
  type CrmContact, type CrmContactView,
} from '~/data/crm'

const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')
function soon(what: string) { infoToast(`${what} — coming soon`) }

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const allRows = computed<CrmContact[]>(() => crmContactsList())
const ownerOptions = [...CRM_OWNERS]
const companyOptions = computed(() => [...new Set(crmCustomers.map((c) => c.company))].sort())

// ── Saved views (tabs) — filter by Contact owner ──
const ALL_VIEW: CrmContactView = { id: 'all', name: 'All contacts', filters: emptyContactViewFilters() }
const activeViewId = ref('all')
const activeView = computed<CrmContactView>(() => crmContactViews.find((v) => v.id === activeViewId.value) ?? ALL_VIEW)
function selectView(id: string) { activeViewId.value = id }

const viewFiltered = computed<CrmContact[]>(() => {
  const owners = activeView.value.filters.owners
  return allRows.value.filter((r) => !owners.length || owners.includes(r.owner))
})

// Toolbar Contact-owner quick filter.
const ownerFilter = ref('')
const toolbarFiltered = computed<CrmContact[]>(() =>
  viewFiltered.value.filter((r) => !ownerFilter.value || r.owner === ownerFilter.value),
)
function contactMatch(row: CrmContact, s: string) {
  return !s || [row.name, row.company, row.email, row.phone, row.owner, row.tags.join(' ')].join(' ').toLowerCase().includes(s)
}

// ── Columns (all sortable via ErpTablePage; Last updated appended) ──
const columns: TableColumn[] = [
  { key: 'name',        label: 'Name',          kind: 'name', sortable: true, sortType: 'text' },
  { key: 'company',     label: 'Company',       kind: 'name', sortable: true, sortType: 'text' },
  { key: 'email',       label: 'Email',                       sortable: true, sortType: 'text' },
  { key: 'phone',       label: 'Mobile',                      sortable: true, sortType: 'text' },
  { key: 'owner',       label: 'Contact owner', kind: 'name', sortable: true, sortType: 'text' },
  { key: 'tags',        label: 'Tags',          kind: 'tags'                                    },
  { key: 'lastUpdated', label: 'Last updated',  kind: 'date'                                    },
]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

const {
  search, currentPage, perPage, sortKey, sortDir, total, paginated,
  setPage, setPerPage, toggleSort, setSort,
} = useTableState<CrmContact>(toolbarFiltered, { perPage: 25, filterFn: (row, s) => contactMatch(row, s) })

const hasActiveFilter = computed(() => !!search.value || !!ownerFilter.value)
function clearFilters() { search.value = ''; ownerFilter.value = '' }

function goCompany(companyId: string) { router.push(`/crm/customers/${companyId}`) }
function goContact(id: string) { router.push(`/crm/contacts/${id}`) }

// ── Bulk selection → company ids of the selected contact rows ──
function selectedCompanyIds(sel: Set<number>): string[] {
  return [...sel].map((i) => (paginated.value[i] as CrmContact | undefined)?.companyId).filter(Boolean) as string[]
}

// ── Associate to (a company) — bulk or single ──
const associateOpen = ref(false)
const associateTargets = ref<string[]>([])
const associateCompany = ref('')
const associateError = ref('')
let associateDeselect: (() => void) | null = null
function openAssociate(companyIds: string[], deselect?: () => void) {
  associateTargets.value = companyIds
  associateCompany.value = ''
  associateError.value = ''
  associateDeselect = deselect ?? null
  associateOpen.value = true
}
function confirmAssociate() {
  if (!associateCompany.value) { associateError.value = 'You must select a company'; return }
  const n = associateTargets.value.length
  associateOpen.value = false
  associateDeselect?.()
  toast.notify({ variant: 'success', title: `${n} contact${n === 1 ? '' : 's'} associated to ${associateCompany.value}` })
}

// ── Delete — bulk or single (clears the company's primary contact) ──
const deleteOpen = ref(false)
const deleteTargets = ref<string[]>([])
let deleteDeselect: (() => void) | null = null
function openDelete(companyIds: string[], deselect?: () => void) {
  deleteTargets.value = companyIds
  deleteDeselect = deselect ?? null
  deleteOpen.value = true
}
function confirmDelete() {
  const n = deleteTargets.value.length
  deleteTargets.value.forEach((id) => deleteCrmContact(id))
  deleteDeselect?.()
  toast.notify({ variant: 'success', title: `${n} contact${n === 1 ? '' : 's'} deleted` })
}

// ── View drawer (create / edit) ──
const drawerOpen = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const drawerDraft = ref<ContactViewDraft>({ name: '', filters: emptyContactViewFilters() })
function openCreate() {
  drawerMode.value = 'create'
  drawerDraft.value = { name: '', filters: emptyContactViewFilters() }
  drawerOpen.value = true
}
function openEdit() {
  const v = activeView.value
  drawerMode.value = 'edit'
  drawerDraft.value = { name: v.name, filters: { owners: [...v.filters.owners] } }
  drawerOpen.value = true
}
function onSaveView(draft: ContactViewDraft) {
  if (drawerMode.value === 'create') {
    const v = addContactView(draft)
    activeViewId.value = v.id
    toast.notify({ variant: 'success', title: `View “${v.name}” saved` })
  } else {
    updateContactView(activeView.value.id, draft)
    toast.notify({ variant: 'success', title: 'View updated' })
  }
}
function onDeleteView() {
  const v = activeView.value
  if (v.id === 'all') return
  deleteContactView(v.id)
  activeViewId.value = 'all'
  drawerOpen.value = false
  toast.notify({ variant: 'success', title: `View “${v.name}” deleted` })
}

const deleteDescription = computed(() =>
  deleteTargets.value.length === 1
    ? 'This contact will be permanently deleted.'
    : `${deleteTargets.value.length} contacts will be permanently deleted.`,
)
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Contacts</h1>
      </div>
      <div class="crm-titlebar__right">
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded @click="soon('Import contacts')">Import</MpButton>
          <MpButton variant="primary" is-rounded left-icon="add" @click="soon('New contact')">New contact</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <!-- ── Saved views (custom views) ── -->
    <nav class="cc-viewtabs">
      <button class="page-tab" :class="{ 'page-tab--active': activeViewId === 'all' }" type="button" @click="selectView('all')">All contacts</button>
      <button
        v-for="v in crmContactViews" :key="v.id"
        class="page-tab" :class="{ 'page-tab--active': activeViewId === v.id }" type="button" @click="selectView(v.id)"
      >{{ v.name }}</button>
      <button class="filter-icon-btn" type="button" aria-label="Add view" @click="openCreate"><MpIcon name="add" size="sm" /></button>
    </nav>

    <div class="crm-stage">
      <!-- ── Filter bar ── -->
      <div class="cc-filterbar">
        <div class="filter-left">
          <ErpFilterSelect
            id="con-owner-filter"
            :model-value="ownerFilter"
            placeholder="Contact owner"
            :options="ownerOptions"
            width="200px"
            @update:model-value="(v: string) => (ownerFilter = v)"
          />
          <MpButton v-if="activeViewId !== 'all'" variant="secondary" is-rounded left-icon="filter" @click="openEdit">Edit view</MpButton>
        </div>

        <div class="filter-right">
          <div class="filter-btn-group">
            <MpTooltip id="con-airene" label="Ask Airene" placement="bottom" use-portal>
              <button class="filter-icon-btn filter-icon-btn--airene" type="button" aria-label="Ask Airene" @click="toggleAirene?.()"><MpIcon name="airene-brand" size="md" /></button>
            </MpTooltip>
            <ColumnSettingsMenu id="con-columns" :items="columnItems" :visibility="columnVisibility" />
            <MpTooltip id="con-export" label="Export" placement="bottom" use-portal>
              <button class="filter-icon-btn" type="button" aria-label="Export"><MpIcon name="download" size="md" /></button>
            </MpTooltip>
          </div>
          <div class="filter-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <input v-model="search" class="filter-search-input" type="text" placeholder="Search contacts…" />
            <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
          </div>
        </div>
      </div>

      <ErpTablePage
        :columns="visibleColumns"
        :rows="(paginated as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :search="search"
        :has-active-filter="hasActiveFilter"
        has-checkbox
        bulk-label="contact"
        filter-empty-label="contact"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @hide-column="hideColumn"
        @clear-filters="clearFilters"
      >
        <!-- Bulk actions -->
        <template #bulk-actions="{ selectedRows, deselectAll }">
          <MpPopover id="con-bulk" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton variant="secondary" size="sm" is-rounded right-icon="chevrons-down">Actions</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem @click="openAssociate(selectedCompanyIds(selectedRows as Set<number>), deselectAll)">Associate to</MpPopoverListItem>
                <MpPopoverListItem :class="css({ color: 'var(--mp-text-danger)' })" @click="openDelete(selectedCompanyIds(selectedRows as Set<number>), deselectAll)">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <template #cell-name="{ row }">
          <a class="cell-link cell-text cc-name-main" @click.stop="goContact((row as CrmContact).id)">{{ (row as CrmContact).name }}</a>
        </template>
        <template #cell-company="{ row }">
          <a class="cell-link cell-text" @click.stop="goCompany((row as CrmContact).companyId)">{{ (row as CrmContact).company }}</a>
        </template>
        <template #cell-email="{ value }"><span v-if="value" class="cell-text">{{ value }}</span><span v-else class="cc-muted">—</span></template>
        <template #cell-phone="{ value }"><span v-if="value" class="cell-text">{{ value }}</span><span v-else class="cc-muted">—</span></template>
        <template #cell-tags="{ row }">
          <ErpTagList v-if="(row as CrmContact).tags.length" :tags="(row as CrmContact).tags" />
          <span v-else class="cc-muted">—</span>
        </template>
        <template #cell-owner="{ value }">{{ value || '—' }}</template>
        <template #cell-lastUpdated="{ row }">
          <LastUpdatedCell v-bind="lastUpdatedFor((row as CrmContact).id)" />
        </template>

        <!-- Row [...] actions (ERP order) -->
        <template #actions="{ row }">
          <MpPopover :id="`con-act-${(row as CrmContact).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="row-kebab" type="button" aria-label="More actions">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="goContact((row as CrmContact).id)">View details</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Edit contact')">Edit</MpPopoverListItem>
                <MpPopoverListItem @click="openAssociate([(row as CrmContact).companyId])">Associate to</MpPopoverListItem>
                <div class="con-menu-divider" role="separator" />
                <MpPopoverListItem @click="soon('Archive contact')">Archive</MpPopoverListItem>
                <MpPopoverListItem :class="css({ color: 'var(--mp-text-danger)' })" @click="openDelete([(row as CrmContact).companyId])">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
      </ErpTablePage>
    </div>

    <CrmContactViewDrawer
      id="ct-view-drawer"
      v-model:is-open="drawerOpen"
      :mode="drawerMode"
      :model-value="drawerDraft"
      :owner-options="ownerOptions"
      @save="onSaveView"
      @delete="onDeleteView"
    />

    <!-- Associate to (select company) -->
    <MpModal id="con-associate-modal" :is-open="associateOpen" size="md" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="associateOpen = false">
      <MpModalContent>
        <MpModalHeader>Associate to company<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <div class="con-assoc-field">
            <span class="con-assoc-label">Company</span>
            <ErpFilterSelect
              id="con-associate-company"
              :model-value="associateCompany"
              placeholder="Select company"
              :options="companyOptions"
              :is-clearable="false"
              width="100%"
              @update:model-value="(v: string) => { associateCompany = v; associateError = '' }"
            />
            <span v-if="associateError" class="con-assoc-error">{{ associateError }}</span>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup class="erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="associateOpen = false">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="confirmAssociate">Associate</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- Delete confirmation -->
    <ConfirmModal v-model:is-open="deleteOpen" title="Delete contact" :description="deleteDescription" confirm-label="Delete" @confirm="confirmDelete" />
  </div>
</template>

<style scoped>
/* Saved-view tabs (mirrors the Companies page). */
.cc-viewtabs { flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-5); padding: 0 var(--mp-spacing-6); background: var(--mp-background-neutral-subtle); }
.page-tab { position: relative; display: inline-flex; align-items: center; gap: var(--mp-spacing-2); background: none; border: none; cursor: pointer; padding: var(--mp-spacing-3) 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); white-space: nowrap; transition: color 100ms; }
.page-tab:not(.page-tab--active):hover { color: var(--mp-text-default); }
.page-tab--active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.page-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--mp-text-selected); border-radius: var(--mp-radii-sm, 2px) var(--mp-radii-sm, 2px) 0 0; }

/* Filter bar (mirrors the Companies page). */
.cc-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-icon-btn--airene { color: var(--mp-airene-default, #7c3aed); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn { display: inline-flex; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.search-clear-btn:hover { color: var(--mp-icon-default, #536062); }

.cc-name-main { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.cc-muted { color: var(--mp-text-subtle, #97a0af); }

.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-subtle, #6e7a7c); }
.row-kebab:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-default); }
.con-menu-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }

.con-assoc-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.con-assoc-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.con-assoc-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }
</style>
