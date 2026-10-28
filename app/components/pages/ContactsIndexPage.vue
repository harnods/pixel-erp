<!-- prod-parity-aligned: jurnal-non-core-feature-frontend/src/modules/contacts/views/ContactListView.vue -->
<script setup lang="ts">
/**
 * Contacts index — the list behind Contacts › Customers / Vendors / Other
 * contacts. One page, three routes: the first path segment picks which role the
 * list is filtered by, which is also what the detail page's breadcrumb reads.
 *
 * Columns, filters, row/bulk actions and empty states follow the non-core
 * ContactListView (constants/columns.ts + pageConfig.ts): Customer, Vendor and
 * Others share one column set; Outstanding carries the overdue subtext.
 */
import {
  MpButton, MpCheckbox, MpTag, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTooltip, MpIcon, MpButtonGroup, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { contacts, deleteContact, updateContact, type Contact, type ContactType } from '~/data/contacts'
import { contactOutstanding, contactTransactions } from '~/data/contactTransactions'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'

const route = useRoute()
const router = useRouter()
const { t } = useLocale()

// ── Which role this route lists (prod pageConfig.ts) ─────────────────────────
interface ListConfig {
  label: string; type: ContactType; entity: string; entityLower: string; noun: string
  showArchivedLabel: string; outstandingEnabled: boolean
}
const LISTS: Record<string, ListConfig> = {
  'customers':      { label: 'Customers',      type: 'customer', entity: 'Customers',      entityLower: 'customers',      noun: 'customer',      showArchivedLabel: 'Show archived customers',      outstandingEnabled: true },
  'vendors':        { label: 'Vendors',        type: 'vendor',   entity: 'Vendors',        entityLower: 'vendors',        noun: 'vendor',        showArchivedLabel: 'Show archived vendors',        outstandingEnabled: true },
  'other-contacts': { label: 'Other contacts', type: 'other',    entity: 'Other contacts', entityLower: 'other contacts', noun: 'other contact', showArchivedLabel: 'Show archived other contacts', outstandingEnabled: false },
}
const listSlug = computed(() => {
  const seg = route.path.split('/').filter(Boolean)[0] ?? 'customers'
  return LISTS[seg] ? seg : 'customers'
})
const list = computed(() => LISTS[listSlug.value]!)

const TYPE_LABEL: Record<ContactType, string> = { customer: 'Customer', vendor: 'Vendor', other: 'Others' }

// ── Columns (prod constants/columns.ts) ───────────────────────────────────────
// Base: Display name (locked), Company name, Email, Mobile, Outstanding.
// Optional (hidden by default): Address, NPWP, Other info, Telephone, Full name,
// Shipping address, Last updated. Contact type / Contact group / Credit limit are
// local-only extras, kept as hidden picker options.
const allCols: TableColumn[] = [
  { key: 'displayName',     label: t('Display name'),     kind: 'name',    sortable: true, sortType: 'text' },
  { key: 'companyName',     label: t('Company name'),     kind: 'name'                                      },
  { key: 'email',           label: t('Email'),                             sortable: true, sortType: 'text' },
  { key: 'mobile',          label: t('Mobile')                                                              },
  { key: 'outstanding',     label: t('Outstanding'),      kind: 'amount',  align: 'right'                   },
  { key: 'address',         label: t('Address'),          kind: 'address'                                   },
  { key: 'npwp',            label: t('NPWP')                                                                },
  { key: 'otherInfo',       label: t('Other info')                                                          },
  { key: 'phone',           label: t('Telephone')                                                           },
  { key: 'fullName',        label: t('Full name'),        kind: 'name'                                      },
  { key: 'shippingAddress', label: t('Shipping address'), kind: 'address'                                   },
  { key: 'lastUpdated',     label: t('Last updated'),     kind: 'date'                                      },
  { key: 'types',           label: t('Contact type'),     kind: 'tags'                                      },
  { key: 'groups',          label: t('Contact group'),    kind: 'tags'                                      },
  { key: 'creditLimit',     label: t('Credit limit'),     kind: 'amount',  align: 'right', sortable: true, sortType: 'number' },
]
const BASE_KEYS = ['displayName', 'companyName', 'email', 'mobile', 'outstanding']
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allCols.map((c) => [c.key, BASE_KEYS.includes(c.key)])),
)
// Picker order = prod CONTACT_COLUMN_SETTINGS_ORDER (interleaved), then local extras.
const PICKER: { key: string; label: string }[] = [
  { key: 'displayName', label: 'Display name' }, { key: 'fullName', label: 'Full name' },
  { key: 'companyName', label: 'Company name' }, { key: 'address', label: 'Billing address' },
  { key: 'shippingAddress', label: 'Shipping address' }, { key: 'email', label: 'Email' },
  { key: 'mobile', label: 'Mobile' }, { key: 'npwp', label: 'NPWP' },
  { key: 'outstanding', label: 'Outstanding' }, { key: 'lastUpdated', label: 'Last updated' },
  { key: 'otherInfo', label: 'Other info' }, { key: 'phone', label: 'Telephone' },
  { key: 'types', label: 'Contact type' }, { key: 'groups', label: 'Contact group' },
  { key: 'creditLimit', label: 'Credit limit' },
]
const columnItems = PICKER.map((c, i) => ({ key: c.key, label: t(c.label), disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { if (key !== 'displayName') columnVisibility[key] = false }

// ── Filters: contact group (toolbar) + All filters drawer ─────────────────────
const groupFilter = ref<string[]>([])
const filterOpen = ref(false)
const applied = reactive({ unpaid: false, overdue: false, showArchived: false })
const draft = reactive({ unpaid: false, overdue: false, showArchived: false })
function openFilters() { Object.assign(draft, applied); filterOpen.value = true }
function applyFilters() {
  Object.assign(applied, draft)
  filterOpen.value = false
  toast.notify({ variant: 'success', title: t('Filters applied'), maxWidth: 'max-content' })
}
function resetDraft() { draft.unpaid = false; draft.overdue = false; draft.showArchived = false }
const draftCount = computed(() => [draft.unpaid, draft.overdue, draft.showArchived].filter(Boolean).length)

type Term = 'unpaid' | 'overdue' | 'showArchived'
const appliedTerms = computed<Term[]>(() => (['unpaid', 'overdue', 'showArchived'] as Term[]).filter((k) => applied[k]))
function termLabel(term: Term) {
  if (term === 'unpaid') return t('Unpaid')
  if (term === 'overdue') return t('Overdue')
  return t(list.value.showArchivedLabel)
}
function removeTerm(term: Term) { applied[term] = false }
function clearAllTerms() { applied.unpaid = false; applied.overdue = false; applied.showArchived = false }

const groupOptions = computed(() => {
  const set = new Set<string>()
  for (const c of contacts) if (c.types.includes(list.value.type)) for (const g of c.groups) set.add(g)
  return [...set].sort()
})
function toggleGroup(g: string) {
  groupFilter.value = groupFilter.value.includes(g) ? groupFilter.value.filter((x) => x !== g) : [...groupFilter.value, g]
}

// ── Rows ──────────────────────────────────────────────────────────────────────
type Row = Contact & { outstandingAmount: number; overdueDays: number }
const rows = computed<Row[]>(() => contacts
  .filter((c) => c.types.includes(list.value.type))
  .filter((c) => applied.showArchived || !c.archived)
  .map((c) => {
    const o = contactOutstanding(c, list.value.type)
    return { ...c, outstandingAmount: o.amount, overdueDays: o.overdueDays }
  }))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    if (groupFilter.value.length && !groupFilter.value.some((g) => row.groups.includes(g))) return false
    // "Unpaid" is the superset of "Overdue": ticking both = unpaid (prod pageConfig).
    if (list.value.outstandingEnabled) {
      if (applied.unpaid && row.outstandingAmount <= 0) return false
      if (!applied.unpaid && applied.overdue && row.overdueDays <= 0) return false
    }
    if (!s) return true
    return [row.displayName, row.companyName, row.fullName, row.emails.join(' '), row.mobile, row.phone]
      .some((v) => v.toLowerCase().includes(s))
  },
})
sortKey.value = 'displayName'
sortDir.value = 'asc'

watch(listSlug, () => { search.value = ''; groupFilter.value = []; clearAllTerms(); setPage(1) })
watch([groupFilter, () => ({ ...applied })], () => setPage(1))

const hasActiveFilter = computed(() => groupFilter.value.length > 0 || appliedTerms.value.length > 0)
function clearFilters() { search.value = ''; groupFilter.value = []; clearAllTerms() }

function openContact(c: Contact) { router.push(`/${listSlug.value}/${c.id}`) }
function editContact(c: Contact) { router.push(`/${listSlug.value}/${c.id}/edit`) }
function newContact() { router.push(`/${listSlug.value}/new`) }

// The primary create action lives in the page title bar ([...slug].vue); it
// bumps this signal rather than reaching into the page.
const contactAddSignal = inject<Ref<number>>('contactAddSignal')
const toggleAirene = inject<() => void>('toggleAirene')
if (contactAddSignal) watch(contactAddSignal, () => newContact())

// ── Import & Export activity (toolbar clock) ─────────────────────────────────
const activityOpen = ref(false)

// ── Delete (prod: per-type title/message; blocked when transactions exist) ────
const isDeleteModalOpen = ref(false)
const toDelete = ref<Contact | null>(null)
function openDeleteModal(c: Contact) {
  if (contactTransactions(c).length) {
    toast.notify({ variant: 'error', title: t("This contact can't be deleted because it has existing transactions."), maxWidth: 'max-content' })
    return
  }
  toDelete.value = c; isDeleteModalOpen.value = true
}
const deleteTitle = computed(() => ({ customer: 'Delete customer?', vendor: 'Delete vendor?', other: 'Delete other contact?' }[list.value.type]))
const deleteMessage = computed(() => ({ customer: 'Deleted customer cannot be restored.', vendor: 'Deleted vendor cannot be restored.', other: 'Deleted other contact cannot be restored.' }[list.value.type]))
function confirmDelete() {
  if (!toDelete.value) return
  deleteContact(toDelete.value.id)
  toast.notify({ variant: 'success', title: t('Contact deleted'), maxWidth: 'max-content' })
  toDelete.value = null
}

// ── Archive (row + bulk) ──────────────────────────────────────────────────────
const isArchiveModalOpen = ref(false)
const pendingArchive = ref<string[]>([])
function openArchive(ids: string[]) { pendingArchive.value = ids; isArchiveModalOpen.value = true }
function confirmArchive() {
  for (const id of pendingArchive.value) updateContact(id, { archived: true })
  toast.notify({ variant: 'success', title: t('Contact archived'), maxWidth: 'max-content' })
  pendingArchive.value = []
}
function selectedIds(sel: Set<number>): string[] {
  return [...sel].map((i) => (paginated.value[i] as Row | undefined)?.id).filter((v): v is string => !!v)
}

function overdueLabel(days: number) {
  return days === 1 ? t('Overdue by 1 day') : `${t('Overdue by')} ${days} ${t('days')}`
}
function lastUpdated(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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
    has-checkbox
    bulk-label="contact"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar: contact group + All filters (left), tools + search (right) ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover id="contact-group-filter" use-portal :is-keep-alive="false" placement="bottom-start">
          <MpPopoverTrigger>
            <button class="btn-enterprise group-trigger" type="button" :aria-label="t('Contact group')">
              <span :class="groupFilter.length ? 'group-trigger__value' : 'group-trigger__placeholder'">
                {{ groupFilter.length ? groupFilter.join(', ') : t('Select contact group') }}
              </span>
              <MpIcon name="chevrons-down" size="sm" />
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content', maxWidth: '360px' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="g in groupOptions" :key="g" :is-active="groupFilter.includes(g)" @click="toggleGroup(g)">
                {{ g }}
              </MpPopoverListItem>
              <div v-if="!groupOptions.length" class="group-empty">{{ t('No data available') }}</div>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpButton class="filter-all-btn" is-rounded :class="{ 'filter-all-btn--active': appliedTerms.length > 0 }" @click="openFilters">
          <MpIcon name="filter" size="sm" />
          {{ appliedTerms.length ? `${t('All filters')} (${appliedTerms.length})` : t('All filters') }}
        </MpButton>

        <div v-if="appliedTerms.length" class="filter-chips">
          <MpTag v-for="term in appliedTerms" :key="term" as="span" is-closable @close="removeTerm(term)">{{ termLabel(term) }}</MpTag>
          <MpButton variant="ghost" is-rounded @click="clearAllTerms">{{ t('Clear all') }}</MpButton>
        </div>
      </div>

      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <MpPopover id="contacts-activity" :is-open="activityOpen" is-manual use-portal :is-keep-alive="false" placement="bottom-end" @close="activityOpen = false">
            <MpPopoverTrigger>
              <span>
                <MpTooltip :label="t('Import & Export')" placement="bottom">
                  <MpButton variant="ghost" left-icon="time" :aria-label="t('Import & Export')" is-rounded @click="activityOpen = !activityOpen" />
                </MpTooltip>
              </span>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '320px' })">
              <div class="activity-head">
                <span class="activity-title">{{ t('Import & Export') }}</span>
                <MpButton variant="ghost" is-rounded @click="activityOpen = false">{{ t('Close') }}</MpButton>
              </div>
              <p class="activity-empty">{{ t('No import or export activity yet') }}</p>
            </MpPopoverContent>
          </MpPopover>
          <ColumnSettingsMenu id="contacts-columns" :items="columnItems" :visibility="columnVisibility" :tooltip="t('Columns')" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="infoToast(t('Not in this prototype'))" />
          </MpTooltip>
        </MpButtonGroup>
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" :aria-label="t('Search contacts')" />
          <button v-if="search" class="btn-enterprise btn-enterprise--plain search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <MpPopover id="contacts-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpTooltip :label="t('Coming soon')" placement="right">
              <MpPopoverListItem is-disabled>{{ t('Add to contact group') }}</MpPopoverListItem>
            </MpTooltip>
            <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">{{ t('Export') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openArchive(selectedIds(selectedRows as Set<number>)); (deselectAll as () => void)()">{{ t('Archive') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Cells ── -->
    <template #cell-displayName="{ row }">
      <a class="cell-link" @click="openContact(row as unknown as Contact)">{{ (row as unknown as Contact).displayName }}</a>
      <span v-if="(row as unknown as Contact).archived" class="cell-archived">{{ t('Archived') }}</span>
    </template>
    <template #cell-companyName="{ row }">
      <span class="cell-truncate">{{ (row as unknown as Contact).companyName || '—' }}</span>
    </template>
    <template #cell-email="{ row }">
      <span class="cell-truncate" :title="(row as unknown as Contact).emails.join(', ')">{{ (row as unknown as Contact).emails[0] ?? '—' }}</span>
    </template>
    <template #cell-mobile="{ row }">{{ (row as unknown as Contact).mobile || '—' }}</template>
    <template #cell-outstanding="{ row }">
      <div class="cell-outstanding">
        <span>{{ (row as unknown as Row).outstandingAmount ? formatIDR((row as unknown as Row).outstandingAmount) : '' }}</span>
        <span v-if="(row as unknown as Row).outstandingAmount && (row as unknown as Row).overdueDays > 0" class="cell-overdue">
          {{ overdueLabel((row as unknown as Row).overdueDays) }}
        </span>
      </div>
    </template>
    <template #cell-address="{ row }"><span class="cell-truncate">{{ (row as unknown as Contact).billingAddress || '—' }}</span></template>
    <template #cell-npwp="{ row }">{{ (row as unknown as Contact).npwp || '—' }}</template>
    <template #cell-otherInfo="{ row }"><span class="cell-truncate">{{ (row as unknown as Contact).memo || '—' }}</span></template>
    <template #cell-phone="{ row }">{{ (row as unknown as Contact).phone || '—' }}</template>
    <template #cell-fullName="{ row }">{{ (row as unknown as Contact).fullName || '—' }}</template>
    <template #cell-shippingAddress="{ row }"><span class="cell-truncate">{{ (row as unknown as Contact).shippingAddress || '—' }}</span></template>
    <template #cell-lastUpdated="{ row }">{{ lastUpdated((row as unknown as Contact).updatedAt) }}</template>
    <template #cell-types="{ row }">
      <ErpTagList :tags="(row as unknown as Contact).types.map((tp) => t(TYPE_LABEL[tp]))" />
    </template>
    <template #cell-groups="{ row }">
      <ErpTagList :tags="(row as unknown as Contact).groups" />
    </template>
    <template #cell-creditLimit="{ row }">
      {{ (row as unknown as Contact).creditLimit == null ? '—' : formatIDR((row as unknown as Contact).creditLimit!) }}
    </template>

    <!-- ── Row actions (prod ContactRowActions order) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`contact-actions-${(row as unknown as Contact).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton class="row-kebab" :aria-label="t('Row actions')">
            <MpIcon name="menu-kebab" size="md" />
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openContact(row as unknown as Contact)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="editContact(row as unknown as Contact)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openDeleteModal(row as unknown as Contact)">{{ t('Delete') }}</MpPopoverListItem>
            <MpPopoverListItem :is-disabled="(row as unknown as Contact).archived" @click="openArchive([(row as unknown as Contact).id])">{{ t('Archive') }}</MpPopoverListItem>
            <MpTooltip :label="t('Coming soon')" placement="left">
              <MpPopoverListItem is-disabled>{{ t('Merge contact') }}</MpPopoverListItem>
            </MpTooltip>
            <MpTooltip :label="t('Coming soon')" placement="left">
              <MpPopoverListItem is-disabled>{{ t('Add to contact group') }}</MpPopoverListItem>
            </MpTooltip>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Empty state (no contacts at all) ── -->
    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No data available') }}</p>
        <MpButton class="empty-full-btn" variant="secondary" is-rounded left-icon="add" @click="newContact">{{ t('New contact') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── All filters drawer (prod ContactFilterDrawer) ── -->
  <Teleport to="body">
  <Transition name="cfd">
    <div v-if="filterOpen" class="cfd-overlay" @click.self="filterOpen = false">
      <div class="cfd-panel" role="dialog" :aria-label="t('All filters')">
        <header class="cfd-head">
          <span class="cfd-title">{{ t('All filters') }}</span>
          <button class="cfd-close" type="button" :aria-label="t('Close')" @click="filterOpen = false"><MpIcon name="close" size="md" /></button>
        </header>
        <div class="cfd-body">
          <div v-if="list.outstandingEnabled" class="cfd-group">
            <span class="cfd-group-label">{{ t('Outstanding status') }}</span>
            <MpCheckbox id="cfd-unpaid" :is-checked="draft.unpaid" @change="draft.unpaid = !draft.unpaid">{{ t('Unpaid') }}</MpCheckbox>
            <MpCheckbox id="cfd-overdue" :is-checked="draft.overdue" @change="draft.overdue = !draft.overdue">{{ t('Overdue') }}</MpCheckbox>
          </div>
          <hr class="cfd-divider" />
          <MpCheckbox id="cfd-archived" :is-checked="draft.showArchived" @change="draft.showArchived = !draft.showArchived">{{ t(list.showArchivedLabel) }}</MpCheckbox>
        </div>
        <footer class="cfd-foot">
          <button class="cfd-reset" type="button" @click="resetDraft">{{ t('Reset') }}</button>
          <div class="cfd-foot-actions">
            <MpButton variant="ghost" is-rounded @click="filterOpen = false">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="applyFilters">{{ draftCount ? `${t('Apply')} (${draftCount})` : t('Apply') }}</MpButton>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
  </Teleport>

  <ConfirmModal
    v-model:is-open="isDeleteModalOpen"
    :title="t(deleteTitle)"
    :description="t(deleteMessage)"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
  <ConfirmModal
    v-model:is-open="isArchiveModalOpen"
    :title="t('Archive contact?')"
    :description="t('Archived contacts can be restored later.')"
    :confirm-label="t('Archive')"
    @confirm="confirmArchive"
  />
</template>

<style scoped>
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); flex-wrap: wrap; min-width: 0; }
.filter-right { margin-left: auto; display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }

/* Contact group multi-select trigger (same chrome as a form select) */
.group-trigger {
  display: inline-flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  width: var(--mp-sizes-60, 240px); height: var(--mp-sizes-9, 36px); padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-form, var(--mp-border-default));
  border-radius: var(--mp-radii-md); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.group-trigger__placeholder { color: var(--mp-text-placeholder); }
.group-trigger__placeholder, .group-trigger__value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.group-empty { padding: var(--mp-spacing-2) var(--mp-spacing-3); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md); }

.filter-all-btn {
  display: inline-flex !important; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important;
  border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
.filter-all-btn--active {
  background: var(--mp-background-neutral-subtle) !important;
  color: var(--mp-text-selected, var(--mp-text-information)) !important;
}
.filter-chips { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }

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
.search-clear-btn { display: inline-flex; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-icon-default); }

.activity-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.activity-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.activity-empty { margin: 0; padding: var(--mp-spacing-4) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.cell-truncate { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cell-archived { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cell-outstanding { display: flex; flex-direction: column; align-items: flex-end; }
.cell-overdue { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  padding: 0; border: none; background: transparent; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary));
}
.row-kebab:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-default); }

.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; margin-bottom: var(--mp-spacing-1); }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-btn { margin-top: var(--mp-spacing-2); }

/* All filters drawer — same overlay shell as the other ERP filter drawers */
.cfd-enter-active, .cfd-leave-active { transition: background-color 250ms ease; }
.cfd-enter-from, .cfd-leave-to { background-color: transparent; }
.cfd-enter-active .cfd-panel { transition: transform 350ms ease-out; }
.cfd-leave-active .cfd-panel { transition: transform 250ms ease-in; }
.cfd-enter-from .cfd-panel, .cfd-leave-to .cfd-panel { transform: translateX(calc(100% + 12px)); }
.cfd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cfd-panel { margin: var(--mp-spacing-3); width: min(448px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.cfd-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.cfd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cfd-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.cfd-close:hover { background: var(--mp-background-neutral-hovered); }
.cfd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.cfd-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cfd-group-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cfd-divider { margin: 0; border: none; border-top: 1px solid var(--mp-border-default); }
.cfd-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.cfd-foot-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cfd-reset { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cfd-reset:hover { text-decoration: underline; }
</style>
