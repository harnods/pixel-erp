<script setup lang="ts">
/**
 * CRM ▸ Customers ▸ Contacts (/crm/customers/contacts).
 *
 * The people directory of the CRM — every contact person across all companies.
 * A full-bleed list surface under the "Customers" L2 nav: it owns its `.detail-bar`
 * title bar + scrollable `.detail-stage`, mirroring CrmModulesPage exactly.
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { crmContactPeople, companiesOfContact, CRM_OWNERS, type CrmContactPerson } from '~/data/crm'
import { infoToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

function soon(what: string) { infoToast(`${what} — coming soon`) }
function open(row: ContactRow) { router.push(`/crm/customers/contacts/${row.id}`) }

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
  { key: 'phone',        label: 'Phone' },
  { key: 'owner',        label: 'Owner',        sortable: true, sortType: 'text' },
  { key: 'lastActivity', label: 'Last updated', kind: 'date', sortable: true, sortType: 'date' },
]

const {
  search, statusFilter: ownerFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<ContactRow>(rows, {
  filterFn: (row, s, owner) =>
    (!owner || row.owner === owner)
    && (!s
      || row.name.toLowerCase().includes(s)
      || row.email.toLowerCase().includes(s)
      || row.companyName.toLowerCase().includes(s)),
  defaultSort: { key: 'name', dir: 'asc' },
})
const hasActiveFilter = computed(() => !!search.value || !!ownerFilter.value)
function clearFilters() { search.value = ''; ownerFilter.value = '' }

const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }
watch(ownerFilter, () => setPage(1))
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
        <MpButton variant="primary" is-rounded left-icon="add" @click="router.push('/crm/customers/contacts/new')">{{ t('New contact') }}</MpButton>
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
            <ErpFilterSelect
              id="cc-owner-filter"
              :model-value="ownerFilter"
              placeholder="Owner"
              :options="[...CRM_OWNERS]"
              @update:model-value="(v: string) => (ownerFilter = v)"
            />
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

        <!-- Name + job-title caption -->
        <template #cell-name="{ row }">
          <div class="cru-name">
            <span class="cell-link cell-text" @click.stop="open(row as unknown as ContactRow)">{{ (row as unknown as ContactRow).name }}</span>
            <span class="cru-email">{{ (row as unknown as ContactRow).jobTitle }}</span>
          </div>
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
                <MpPopoverListItem @click="soon(t('Delete contact'))">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>
      </ErpTablePage>
    </div>
  </div>
</template>

<style scoped>
/* Shell — mirrors CrmModulesPage's surface exactly. */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; }

/* Name cell — link over a caption. */
.cru-name { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.cru-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-colors-text-link, #165082); text-decoration: none; cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cru-action--danger :deep(*), .cru-action--danger { color: var(--mp-colors-text-danger, #a8352d); }

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
.search-clear-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important;
  border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important;
}
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }
</style>
