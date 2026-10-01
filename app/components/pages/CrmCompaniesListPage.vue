<script setup lang="ts">
/**
 * CRM ▸ Customers ▸ Companies (/crm/customers/companies).
 *
 * The account directory of the CRM — every company, with its primary contact, city,
 * owner and open-deal count. A full-bleed list surface under the "Customers" L2 nav:
 * it owns its `.detail-bar` title bar + scrollable `.detail-stage`, mirroring
 * CrmModulesPage exactly.
 *
 * Filtering: a single "All filters" drawer (rule/filter-bar-all-filters-drawer)
 * — Keyword (scoped to a column) + Owner + Industry (Is any of / Is none of).
 * Bulk select with a Delete action (confirmed via ConfirmModal).
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, toast, css } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import CrmCompaniesFiltersDrawer, { emptyCompaniesFilters, type CompaniesFiltersValue } from '~/components/patterns/CrmCompaniesFiltersDrawer.vue'
import { crmCompanies, contactsOfCompany, dealsForCompany, getContactPerson, archiveCrmCompany, restoreCrmCompany, can, type CrmCompany } from '~/data/crm'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { infoToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

// ── Permission gates (signed-in user) ──
const canCreate = computed(() => can('companies.create'))
const canEdit = computed(() => can('companies.edit'))

// Status filter (Active / Archived) — a left-column ErpFilterSelect, not a
// segmented control (rule/select-erpfilterselect). PRD §241/§633: soft archive,
// no permanent delete. The two views are mutually exclusive → non-clearable.
const statusFilter = ref('active')
const statusOptions = [{ value: 'active', label: t('Active') }, { value: 'archived', label: t('Archived') }]
const showArchived = computed(() => statusFilter.value === 'archived')
watch(showArchived, () => setPage(1))

function open(row: CompanyRow) { router.push(`/crm/customers/companies/${row.id}`) }
function soon(what: string) { infoToast(`${what} — coming soon`) }

// Company Domain — normalized host of the website (PRD §229).
function domainOf(website: string): string {
  return (website || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\.$/, '')
}
type CompanyRow = CrmCompany & { picName: string; picEmail: string; domain: string; location: string; customers: number; openDeals: number }
const rows = computed<CompanyRow[]>(() =>
  crmCompanies.map((co) => {
    const members = contactsOfCompany(co.id)
    const pic = co.primaryContactId ? getContactPerson(co.primaryContactId) : undefined
    return {
      ...co,
      picName: (pic && !pic.archived) ? pic.name : (members[0]?.name ?? '—'),
      picEmail: (pic && !pic.archived) ? pic.email : (members[0]?.email ?? ''),
      domain: domainOf(co.website),
      location: [co.city, co.province].filter(Boolean).join(', ') || '—',
      customers: members.length,
      openDeals: dealsForCompany(co.id).length,
    }
  }),
)

const columns: TableColumn[] = [
  { key: 'name',         label: 'Company',         kind: 'name', sortable: true, sortType: 'text' },
  { key: 'location',     label: 'Location',        kind: 'address', sortable: true, sortType: 'text' },
  { key: 'picName',      label: 'Primary contact', kind: 'name', sortable: true, sortType: 'text' },
  { key: 'domain',       label: 'Website',         kind: 'name', sortable: true, sortType: 'text' },
  { key: 'customers',    label: 'No. of contact',  kind: 'number', sortable: true, sortType: 'number' },
  { key: 'lastActivity', label: 'Last updated',    kind: 'date', sortable: true, sortType: 'date' },
]

// Stringify a column's value for keyword-by-column search.
function colText(r: CompanyRow, key: string): string {
  switch (key) {
    case 'name': return r.name
    case 'location': return r.location
    case 'picName': return r.picName
    case 'domain': return r.domain
    case 'customers': return String(r.customers)
    case 'openDeals': return String(r.openDeals)
    default: return ''
  }
}

// ── "All filters" drawer ──
// Companies have NO Owner and NO owner-scope (PRD §237, §306: Company Read = all).
const companyFilters = ref<CompaniesFiltersValue>(emptyCompaniesFilters())
const filtersOpen = ref(false)
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()
const countryOptions = computed(() => uniq(crmCompanies.map((c) => c.country ?? '')))
const provinceOptions = computed(() => uniq(crmCompanies.map((c) => c.province)))
const cityOptions = computed(() => uniq(crmCompanies.map((c) => c.city)))
function openFilters() { filtersOpen.value = true }
function onApplyFilters(f: CompaniesFiltersValue) { companyFilters.value = f; filtersOpen.value = false }

// Apply an "Is any of / Is none of" tag comparator against a row value.
function matchTag(comparator: 'isAnyOf' | 'isNoneOf', values: string[], value: string): boolean {
  if (!values.length) return true
  const has = values.includes(value)
  return comparator === 'isAnyOf' ? has : !has
}

const toolbarFiltered = computed<CompanyRow[]>(() => rows.value.filter((r) => {
  const cf = companyFilters.value
  // Active vs Archived view.
  if (!!r.archived !== showArchived.value) return false
  if (!matchTag(cf.countryComparator, cf.countries, r.country ?? '')) return false
  if (!matchTag(cf.provinceComparator, cf.provinces, r.province)) return false
  if (!matchTag(cf.cityComparator, cf.cities, r.city)) return false
  if (cf.keyword.trim()) {
    const kw = cf.keyword.trim().toLowerCase()
    const hay = cf.keywordColumn === 'all'
      ? [r.name, r.domain, r.picName, r.city, r.province, r.country ?? ''].join(' ')
      : colText(r, cf.keywordColumn)
    if (!hay.toLowerCase().includes(kw)) return false
  }
  return true
}))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<CompanyRow>(toolbarFiltered, {
  filterFn: (row, s) =>
    !s
    || row.name.toLowerCase().includes(s)
    || row.domain.toLowerCase().includes(s)
    || row.city.toLowerCase().includes(s)
    || row.province.toLowerCase().includes(s)
    || (row.country ?? '').toLowerCase().includes(s),
  defaultSort: { key: 'name', dir: 'asc' },
})

const activeFilterCount = computed(() => {
  const f = companyFilters.value
  return f.countries.length + f.provinces.length + f.cities.length + (f.keyword.trim() ? 1 : 0)
})
const hasActiveFilter = computed(() => !!search.value || activeFilterCount.value > 0)
function clearFilters() { search.value = ''; companyFilters.value = emptyCompaniesFilters() }

const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
const drawerColumns = computed(() => visibleColumns.value.filter((c) => c.key !== 'lastActivity').map((c) => ({ key: c.key, label: c.label })))
function hideColumn(key: string) { columnVisibility[key] = false }

// ── Bulk / row Archive · Restore (confirmed; soft — no permanent delete) ──
const archiveOpen = ref(false)
const archiveTargets = ref<string[]>([])
let archiveDeselect: (() => void) | null = null
function selectedCompanyIds(sel: Set<number>): string[] {
  return [...new Set([...sel].map((i) => (paginated.value[i] as CompanyRow | undefined)?.id).filter(Boolean) as string[])]
}
function openArchive(ids: string[], deselect?: () => void) {
  if (!ids.length) return
  archiveTargets.value = ids
  archiveDeselect = deselect ?? null
  archiveOpen.value = true
}
function confirmArchive() {
  const n = archiveTargets.value.length
  const restoring = showArchived.value
  archiveTargets.value.forEach((id) => (restoring ? restoreCrmCompany(id) : archiveCrmCompany(id)))
  archiveDeselect?.()
  archiveDeselect = null
  toast.notify({ variant: 'success', title: restoring
    ? (n === 1 ? t('Company restored') : t('Companies restored'))
    : (n === 1 ? t('Company archived') : t('Companies archived')), maxWidth: 'max-content' })
}
const archiveTitle = computed(() => showArchived.value ? t('Restore company') : t('Archive company'))
const archiveConfirmLabel = computed(() => showArchived.value ? t('Restore') : t('Archive'))
const archiveDescription = computed(() => {
  const n = archiveTargets.value.length
  if (showArchived.value) {
    return n === 1 ? t('This company will be restored to the active list.') : t('The selected companies will be restored to the active list.')
  }
  return n === 1 ? t('This company will be archived. You can restore it later.') : t('The selected companies will be archived. You can restore them later.')
})
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Companies') }}</h1>
        </div>
      </div>
      <div class="cd-bar-actions">
        <MpButton v-if="canCreate && !showArchived" variant="primary" is-rounded left-icon="add" @click="router.push('/crm/customers/companies/new')">{{ t('New company') }}</MpButton>
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
        bulk-label="company"
        bulk-label-plural="companies"
        filter-empty-label="company"
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
              id="co-status" :model-value="statusFilter" :placeholder="t('Status')"
              :options="statusOptions" :is-clearable="false" width="160px"
              @update:model-value="(v: string) => (statusFilter = v)"
            />
            <MpButton class="btn-enterprise btn-enterprise--secondary filter-all-btn" variant="secondary" type="button" left-icon="filter" @click="openFilters">
              {{ t('All filters') }}{{ activeFilterCount ? ` (${activeFilterCount})` : '' }}
            </MpButton>
          </div>
          <div class="filter-right">
            <div class="filter-btn-group">
              <ColumnSettingsMenu id="co-columns" :items="columnItems" :visibility="columnVisibility" />
            </div>
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
              <MpButton v-if="search" class="search-clear-btn" variant="ghost" type="button" :aria-label="t('Clear search')" left-icon="close" @click="search = ''" />
            </div>
          </div>
        </template>

        <!-- Bulk actions: Archive / Restore -->
        <template #bulk-actions="{ selectedRows, deselectAll }">
          <MpButton
            variant="secondary" size="sm" is-rounded
            @click="openArchive(selectedCompanyIds(selectedRows as Set<number>), deselectAll)"
          >{{ showArchived ? t('Restore') : t('Archive') }}</MpButton>
        </template>

        <!-- Company name -->
        <template #cell-name="{ row }">
          <span class="cell-link cell-text" @click.stop="open(row as unknown as CompanyRow)">{{ (row as unknown as CompanyRow).name }}</span>
        </template>
        <template #cell-location="{ row }"><span class="cell-text">{{ (row as unknown as CompanyRow).location }}</span></template>
        <template #cell-picName="{ row }">
          <div class="cru-name">
            <span class="cell-text">{{ (row as unknown as CompanyRow).picName }}</span>
            <span v-if="(row as unknown as CompanyRow).picEmail" class="cell-text cru-email">{{ (row as unknown as CompanyRow).picEmail }}</span>
          </div>
        </template>
        <template #cell-domain="{ row }"><span class="cell-text">{{ (row as unknown as CompanyRow).domain || '—' }}</span></template>
        <template #cell-customers="{ row }"><span class="cell-text">{{ (row as unknown as CompanyRow).customers }}</span></template>
        <template #cell-lastActivity="{ row }">
          <LastUpdatedCell :at="(row as unknown as CompanyRow).lastActivity" :by="lastUpdatedFor((row as unknown as CompanyRow).id).by" />
        </template>

        <!-- Actions: View details / Edit / Archive · Restore -->
        <template #actions="{ row }">
          <MpPopover :id="`co-actions-${(row as unknown as CompanyRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton class="row-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="open(row as unknown as CompanyRow)">{{ t('View details') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="canEdit && !showArchived" @click="router.push(`/crm/customers/companies/${(row as unknown as CompanyRow).id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="canEdit" @click="openArchive([(row as unknown as CompanyRow).id])">{{ showArchived ? t('Restore') : t('Archive') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <!-- Default empty state (no data ever) — illustration + title + caption +
             secondary CTA (rule/empty-state-structure). Filtered/search-empty reuses
             ErpTablePage's built-in illustrated inline state. -->
        <template #empty>
          <div class="co-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="co-empty-illustration" width="288" height="240" />
            <template v-if="showArchived">
              <p class="co-empty-title">{{ t('No archived companies') }}</p>
              <p class="co-empty-desc">{{ t('Companies you archive will appear here.') }}</p>
            </template>
            <template v-else>
              <p class="co-empty-title">{{ t('No companies') }}</p>
              <p class="co-empty-desc">{{ t('Companies will appear here.') }}</p>
              <MpButton v-if="canCreate" variant="secondary" is-rounded left-icon="add" @click="router.push('/crm/customers/companies/new')">{{ t('New company') }}</MpButton>
            </template>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <!-- All filters drawer -->
    <CrmCompaniesFiltersDrawer
      id="co-filters"
      :is-open="filtersOpen"
      :model-value="companyFilters"
      :country-options="countryOptions"
      :province-options="provinceOptions"
      :city-options="cityOptions"
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
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-colors-text-link, #165082); text-decoration: none; cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.row-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }

/* Default (no-data) empty state — illustration + title + caption + secondary CTA. */
.co-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10) var(--mp-spacing-6); }
.co-empty-illustration { width: 288px; max-width: 100%; height: auto; margin-bottom: var(--mp-spacing-2); }
.co-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.co-empty-desc { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-subtle, #536062); }

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
