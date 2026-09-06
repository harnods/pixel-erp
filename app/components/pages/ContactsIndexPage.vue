<script setup lang="ts">
/**
 * Contacts index — the list behind Contacts › Customers / Vendors / Other
 * contacts. One page, three routes: the first path segment picks which role the
 * list is filtered by, which is also what the detail page's breadcrumb reads.
 *
 * The Figma covers the New contact form and the contact detail page; this index
 * is the standard ErpTablePage shell that makes them reachable (it is the
 * "Customers" breadcrumb both of those pages link back to).
 */
import {
  MpButton, MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpTooltip, MpIcon, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { contacts, deleteContact, type Contact, type ContactType } from '~/data/contacts'
import { formatIDR } from '~/utils/currency'

const route = useRoute()
const router = useRouter()
const { t } = useLocale()

// ── Which role this route lists ──────────────────────────────────────────────
const LISTS: Record<string, { label: string; type: ContactType; noun: string }> = {
  'customers':      { label: 'Customers',      type: 'customer', noun: 'customer' },
  'vendors':        { label: 'Vendors',        type: 'vendor',   noun: 'vendor'   },
  'other-contacts': { label: 'Other contacts', type: 'other',    noun: 'contact'  },
}
const listSlug = computed(() => {
  const seg = route.path.split('/').filter(Boolean)[0] ?? 'customers'
  return LISTS[seg] ? seg : 'customers'
})
const list = computed(() => LISTS[listSlug.value]!)

const TYPE_LABEL: Record<ContactType, string> = { customer: 'Customer', vendor: 'Vendor', other: 'Others' }
// Type-specific create label — "New customer" / "New vendor" / "New contact".
const addLabel = computed(() => ({ customer: 'New customer', vendor: 'New vendor', other: 'New contact' }[list.value.type]))

// ── Columns (widths come from `kind` — never hardcode px on a semantic column) ─
const allCols: TableColumn[] = [
  { key: 'displayName', label: t('Display name'), kind: 'name',    sortable: true, sortType: 'text' },
  { key: 'companyName', label: t('Company name'), kind: 'name',    sortable: true, sortType: 'text' },
  { key: 'email',       label: t('Email'),                                                          },
  { key: 'phone',       label: t('Phone'),                                                          },
  { key: 'types',       label: t('Contact type'), kind: 'tags'                                      },
  { key: 'groups',      label: t('Contact group'), kind: 'tags'                                     },
  { key: 'creditLimit', label: t('Credit limit'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'lastUpdated', label: t('Last updated'), kind: 'date'                                      },
]
const HIDDEN_BY_DEFAULT = ['groups', 'creditLimit', 'lastUpdated']
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allCols.map((c) => [c.key, !HIDDEN_BY_DEFAULT.includes(c.key)])),
)
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ── Rows / table state ────────────────────────────────────────────────────────
const rows = computed(() => contacts.filter((c) => c.types.includes(list.value.type)))
const groupFilter = ref('')
const groupOptions = computed(() => {
  const set = new Set<string>()
  for (const c of rows.value) for (const g of c.groups) set.add(g)
  return [...set].sort()
})

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<Contact>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    if (groupFilter.value && !row.groups.includes(groupFilter.value)) return false
    if (!s) return true
    return [row.displayName, row.companyName, row.emails.join(' '), row.phone]
      .some((v) => v.toLowerCase().includes(s))
  },
})
sortKey.value = 'displayName'
sortDir.value = 'asc'

// Switching between Customers/Vendors/Other resets the view.
watch(listSlug, () => { search.value = ''; groupFilter.value = ''; setPage(1) })

watch(groupFilter, () => setPage(1))

const hasActiveFilter = computed(() => !!groupFilter.value)
function clearFilters() { search.value = ''; groupFilter.value = '' }

function openContact(c: Contact) { router.push(`/${listSlug.value}/${c.id}`) }
function editContact(c: Contact) { router.push(`/${listSlug.value}/${c.id}/edit`) }
function newContact() { router.push(`/${listSlug.value}/new`) }

// The primary create action lives in the page title bar ([...slug].vue); it
// bumps this signal rather than reaching into the page.
const contactAddSignal = inject<Ref<number>>('contactAddSignal')
const toggleAirene = inject<() => void>('toggleAirene')
if (contactAddSignal) watch(contactAddSignal, () => newContact())

// ── Delete ────────────────────────────────────────────────────────────────────
const isDeleteModalOpen = ref(false)
const toDelete = ref<Contact | null>(null)
function openDeleteModal(c: Contact) { toDelete.value = c; isDeleteModalOpen.value = true }
function confirmDelete() {
  if (!toDelete.value) return
  deleteContact(toDelete.value.id)
  toast.notify({ variant: 'success', title: t('Contact deleted'), maxWidth: 'max-content' })
  toDelete.value = null
}
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :search="search"
    :has-active-search="!!search"
    :has-active-filter="hasActiveFilter"
    bulk-label="contact"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar: contact-group quick filter (left) + toolbar/search (right) ── -->
    <template #filters>
      <div class="filter-left">
        <!-- quick filter: placeholder IS the filter name, options are real
             values only, and the clear (x) resets it to show-all -->
        <MpPopover id="contact-group-filter" is-close-on-select use-portal :is-keep-alive="false">
          <MpPopoverTrigger>
            <MpSelect
              id="contact-group-select"
              :placeholder="t('Contact group')"
              :model-value="groupFilter"
              is-clearable
              :class="css({ width: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="groupFilter = ''"
            >
              <option v-if="groupFilter" :value="groupFilter">{{ groupFilter }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="g in groupOptions" :key="g"
                :is-active="g === groupFilter" @click="groupFilter = g"
              >{{ g }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="contacts-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" type="button" :aria-label="t('Ask Airene')" @click="toggleAirene?.()"><MpIcon name="airene-brand" size="md" /></button>
          </MpTooltip>
          <ColumnSettingsMenu id="contacts-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip id="contacts-export" :label="t('Export')" placement="bottom" use-portal>
            <button class="filter-icon-btn" type="button" :aria-label="t('Export')"><MpIcon name="download" size="md" /></button>
          </MpTooltip>
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
        </div>
      </div>
    </template>

    <!-- ── Cells ── -->
    <template #cell-displayName="{ row }">
      <a class="cell-link" @click="openContact(row as unknown as Contact)">{{ (row as unknown as Contact).displayName }}</a>
    </template>

    <!-- long addresses truncate rather than spill into the next column -->
    <template #cell-email="{ row }">
      <span class="cell-truncate" :title="(row as unknown as Contact).emails.join(', ')">
        {{ (row as unknown as Contact).emails[0] ?? '—' }}
      </span>
    </template>

    <template #cell-types="{ row }">
      <ErpTagList :tags="(row as unknown as Contact).types.map((tp) => t(TYPE_LABEL[tp]))" />
    </template>

    <template #cell-groups="{ row }">
      <ErpTagList :tags="(row as unknown as Contact).groups" />
    </template>

    <template #cell-creditLimit="{ row }">
      {{ (row as unknown as Contact).creditLimit == null ? '—' : formatIDR((row as unknown as Contact).creditLimit!) }}
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell :at="(row as unknown as Contact).updatedAt" :by="(row as unknown as Contact).updatedBy" />
    </template>

    <!-- ── Row actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`contact-actions-${(row as unknown as Contact).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '150px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openContact(row as unknown as Contact)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="editContact(row as unknown as Contact)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openDeleteModal(row as unknown as Contact)">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No contacts') }}</p>
        <p class="empty-full-desc">{{ t('Contacts you add will appear here.') }}</p>
        <MpButton class="empty-full-btn" variant="secondary" is-rounded left-icon="add" @click="newContact">{{ t(addLabel) }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <ConfirmModal
    v-model:is-open="isDeleteModalOpen"
    :title="t('Delete contact?')"
    :description="`${toDelete?.displayName ?? ''} ${t('will be removed from your contact list.')}`"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
/* no flex-grow here — the MpPopover root would stretch and detach the select's
   chevron from its 180px trigger */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { margin-left: auto; display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-icon-btn--airene { color: var(--mp-airene-default, #7c3aed); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: var(--mp-sizes-62, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent; min-width: 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

.cell-truncate { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Row-action kebab — self-contained table-action pattern (NOT a page button). */
.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  padding: 0; border: none; background: transparent; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary));
}
.row-kebab:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-default); }

.empty-full {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-10, 40px) 0;
}
.empty-illustration { width: 288px; height: 240px; object-fit: contain; margin-bottom: var(--mp-spacing-1); }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.empty-full-btn { margin-top: var(--mp-spacing-2); }
</style>
