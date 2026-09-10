<script setup lang="ts">
/**
 * CRM — Company record (/crm/customers/companies/:id).
 *
 * ERP detail format with the tab strip in the header band (MpTabs wraps the
 * header + the stage, like ContactDetailsPage). Two tabs — "Company details"
 * (Company info · Contact person · Bank info · Note) and "Deals" (stats +
 * ErpTablePage). Title bar: primary "New deal" + kebab Actions (Edit · Delete).
 * Notes via CrmNotesPanel; audit trail via the shared ActivityLogModal opened
 * from the "Last updated by…" link. Delete confirms (rule/btn-danger-confirm).
 */
import { ref, reactive, computed, watch, inject } from 'vue'
import {
  MpIcon, MpButton, MpButtonGroup, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, toast, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import CrmNotesPanel from '~/components/patterns/CrmNotesPanel.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import CrmDealsFiltersDrawer, { emptyCrmDealsFilters, type CrmDealsFiltersValue } from '~/components/patterns/CrmDealsFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { infoToast } from '~/utils/toasts'
import {
  getCompany, getContactPerson, contactsOfCompany, dealsForCompany, isDealOpen, dealNo, dealExpectedValue,
  archiveCrmCompany, archiveCrmContactPerson, contactBlockingCompany, activeMemberCount, can, CRM_OWNERS, DEAL_STAGES, dealStageBadgeType, type Deal,
} from '~/data/crm'

const toggleAirene = inject<() => void>('toggleAirene')

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()
function soon(what: string) { infoToast(`${what} — coming soon`) }

// ── Permission gates (signed-in user) ──
const canEditCompany = computed(() => can('companies.edit'))
const canCreateContact = computed(() => can('contacts.create'))
const canEditContact = computed(() => can('contacts.edit'))
const canCreateDeal = computed(() => can('deals.create'))

const company = computed(() => getCompany(props.orderId))
// Primary PIC (active) + normalized Company Domain (PRD §229/§231).
const picContact = computed(() => {
  const co = company.value
  if (!co?.primaryContactId) return undefined
  const c = getContactPerson(co.primaryContactId)
  return c && !c.archived ? c : undefined
})
const companyDomain = computed(() =>
  (company.value?.website || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\.$/, ''),
)
const activeTab = ref(0)

const refreshTick = ref(0)
const contacts = computed(() => { void refreshTick.value; return company.value ? contactsOfCompany(company.value.id) : [] })
const companyDeals = computed(() => (company.value ? dealsForCompany(company.value.id) : []))
const banks = computed(() => company.value?.banks ?? [])

// ── Deals-tab stats — derived from THIS company's deals so they always match the
// table below (rule: coherent per stage). Open (ongoing) → In flight; Won → Billed;
// a Won deal not yet settled into a Sales Order (conversion ≠ 'converted') →
// Outstanding. A prospect with only early-stage deals shows Rp0 billed/outstanding.
const openDeals = computed(() => companyDeals.value.filter(isDealOpen))
const wonDeals = computed(() => companyDeals.value.filter((d) => d.stage === 'Won'))
const pipelineValue = computed(() => openDeals.value.reduce((n, d) => n + d.value, 0))
const billed = computed(() => wonDeals.value.reduce((n, d) => n + d.value, 0))
const outstanding = computed(() => wonDeals.value.filter((d) => d.conversion !== 'converted').reduce((n, d) => n + d.value, 0))

// ── Contact person table (search) ──
const contactSearch = ref('')
const filteredContacts = computed(() => {
  const s = contactSearch.value.trim().toLowerCase()
  const list = contacts.value
  if (!s) return list
  return list.filter((c) => c.name.toLowerCase().includes(s) || (c.email || '').toLowerCase().includes(s))
})
function goContact(id: string) { router.push(`/crm/customers/contacts/${id}`) }
function newContact() { router.push('/crm/customers/contacts/new') }

// ── Deals table (ErpTablePage) ──
// A deal's Primary contact — its own PIC snapshot, falling back to the company PIC.
function dealContactName(d: Deal): string { return d.picName || picContact.value?.name || '—' }
function dealContactEmail(d: Deal): string { return d.email || picContact.value?.email || '' }

const dealColumns: TableColumn[] = [
  { key: 'number',  label: 'Number',          kind: 'number', sortable: true, sortType: 'text' },
  { key: 'name',    label: 'Deal name',       kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'contact', label: 'Primary contact', kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'stage',   label: 'Stage',           kind: 'status', sortable: true, sortType: 'text' },
  { key: 'owner',   label: 'Deal owner',      kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'value',   label: 'Value',           kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'updated', label: 'Last updated',    kind: 'date' },
]
const dealStageOptions = [...DEAL_STAGES]

// Column settings (show/hide) — Deal name stays locked.
const dealColVisibility = reactive<Record<string, boolean>>(Object.fromEntries(dealColumns.map((c) => [c.key, true])))
const dealColItems = dealColumns.map((c) => ({ key: c.key, label: c.label, disabled: c.key === 'name' }))
const visibleDealColumns = computed<TableColumn[]>(() => dealColumns.filter((c) => dealColVisibility[c.key]))
function hideDealColumn(key: string) { dealColVisibility[key] = false }

// All-filters drawer (keyword · value · owner · customer).
const dealFilters = reactive<CrmDealsFiltersValue>(emptyCrmDealsFilters())
const dealFiltersOpen = ref(false)
const dealOwnerOptions = [...CRM_OWNERS]
// On a company's Deals tab, the "customer" facet is filtered by Contact person.
const dealContactOptions = computed(() => [...new Set(contacts.value.map((c) => c.name))])
const dealDrawerColumns = [{ key: 'name', label: 'Deal name' }, { key: 'id', label: 'Number' }, { key: 'owner', label: 'Deal owner' }]
function applyDealFilters(v: CrmDealsFiltersValue) { Object.assign(dealFilters, v); dealFiltersOpen.value = false }
const dealFilterCount = computed(() => {
  const f = dealFilters
  return (f.keyword.trim() ? 1 : 0) + ((f.value !== '' || f.valueMin !== '' || f.valueMax !== '') ? 1 : 0) + (f.owners.length ? 1 : 0) + (f.customers.length ? 1 : 0)
})
function matchAmount(amount: number, comparator: string, value: string, min: string, max: string): boolean {
  if (comparator === 'gt') return value === '' || amount > Number(value)
  if (comparator === 'lt') return value === '' || amount < Number(value)
  return amount >= (min === '' ? -Infinity : Number(min)) && amount <= (max === '' ? Infinity : Number(max))
}
function matchTags(rowValue: string, comparator: string, picked: string[]): boolean {
  if (!picked.length) return true
  return comparator === 'isNoneOf' ? !picked.includes(rowValue) : picked.includes(rowValue)
}

const {
  search: dealSearch, statusFilter: dealStage, currentPage: dealPage, paginated: dealPaginated,
  total: dealTotal, perPage: dealPerPage, setPage: dealSetPage, setPerPage: dealSetPerPage,
  sortKey: dealSortKey, sortDir: dealSortDir, toggleSort: dealToggleSort, setSort: dealSetSort,
} = useTableState<Deal>(companyDeals, {
  filterFn: (row, s, stage) => {
    if (stage && row.stage !== stage) return false
    if (s && !(row.name.toLowerCase().includes(s) || dealNo(row.id).toLowerCase().includes(s) || row.owner.toLowerCase().includes(s) || dealContactName(row).toLowerCase().includes(s))) return false
    const f = dealFilters
    const kw = f.keyword.trim().toLowerCase()
    if (kw) {
      const colText: Record<string, string> = { name: row.name, id: dealNo(row.id), owner: row.owner }
      const hay = f.keywordColumn === 'all' ? Object.values(colText).join(' ') : (colText[f.keywordColumn] ?? '')
      if (!hay.toLowerCase().includes(kw)) return false
    }
    if (!matchAmount(dealExpectedValue(row), f.valueComparator, f.value, f.valueMin, f.valueMax)) return false
    if (!matchTags(row.owner, f.ownerComparator, f.owners)) return false
    if (!matchTags(dealContactName(row), f.customerComparator, f.customers)) return false
    return true
  },
  defaultSort: { key: 'value', dir: 'desc' },
})
watch(dealFilters, () => dealSetPage(1))
const dealsHasFilter = computed(() => !!dealSearch.value || !!dealStage.value || dealFilterCount.value > 0)
function clearDealFilters() { dealSearch.value = ''; dealStage.value = ''; Object.assign(dealFilters, emptyCrmDealsFilters()) }

// ── Activity log ──
const activityOpen = ref(false)
const lastUpdatedDisplay = computed(() => {
  if (!company.value) return ''
  const { at, by } = lastUpdatedFor(company.value.id)
  const d = new Date(at)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${t('Last updated by')} ${by} ${t('on')} ${date}, ${time} (GMT+7)`
})
const activityEntries = computed<ActivityEntry[]>(() => {
  const co = company.value
  if (!co) return []
  const upd = lastUpdatedFor(co.id)
  return [
    { date: upd.at, user: upd.by, activity: 'Updated', details: [{ label: t('Company'), value: co.name }] },
    {
      date: new Date(co.createdAt).toISOString(), user: co.owner || upd.by, activity: 'Created',
      details: [
        { label: t('Company name'), value: co.name },
        { label: t('Phone'), value: co.phone || '—' },
        { label: t('Email'), value: co.email || '—' },
      ],
    },
  ]
})

// ── Archive (company or a contact row) — always confirmed; soft, no permanent delete ──
const archiveOpen = ref(false)
const archiveKind = ref<'company' | 'contact'>('company')
const archiveContactId = ref('')
function openArchiveCompany() { archiveKind.value = 'company'; archiveOpen.value = true }
function openArchiveContact(id: string) { archiveKind.value = 'contact'; archiveContactId.value = id; archiveOpen.value = true }
const archiveTitle = computed(() => archiveKind.value === 'company' ? t('Archive company') : t('Archive contact'))
const archiveDescription = computed(() => {
  if (archiveKind.value !== 'company') return t('This contact will be archived. You can restore it later.')
  // Company archive confirmation states the number of affected members (PRD §361).
  const n = company.value ? activeMemberCount(company.value.id) : 0
  const base = t('This company will be archived. You can restore it later.')
  return n > 0 ? `${base} ${n} ${n === 1 ? t('contact will be released.') : t('contacts will be released.')}` : base
})
function confirmArchive() {
  if (archiveKind.value === 'company') {
    if (!company.value) return
    archiveCrmCompany(company.value.id)
    toast.notify({ variant: 'success', title: t('Company archived'), maxWidth: 'max-content' })
    router.push('/crm/customers/companies')
  } else {
    // Block archiving a contact that is this company's PIC or sole active member (PRD §351).
    const blocker = contactBlockingCompany(archiveContactId.value)
    if (blocker) {
      toast.notify({ variant: 'warning', title: t('Set another PIC before archiving this contact.'), maxWidth: 'max-content' })
      return
    }
    archiveCrmContactPerson(archiveContactId.value)
    refreshTick.value++
    toast.notify({ variant: 'success', title: t('Contact archived'), maxWidth: 'max-content' })
  }
}
</script>

<template>
  <div class="cr-page" v-if="company">
    <MpTabs id="cr-detail-tabs" v-model="activeTab" is-manual variant-color="green" class="cr-tabs">
      <!-- ── Title bar band: breadcrumb + title + actions, then the tab strip ── -->
      <header class="cr-header">
        <div class="cr-bar">
          <div class="cr-bar-left">
            <NuxtLink class="cr-breadcrumb" to="/crm/customers/companies">{{ t('Companies') }}</NuxtLink>
            <h1 class="cr-title">{{ company.name }}</h1>
          </div>
          <div class="cr-bar-right">
            <MpButton v-if="canCreateDeal" variant="primary" is-rounded left-icon="add" @click="soon(t('New deal'))">{{ t('New deal') }}</MpButton>
            <MpPopover v-if="canEditCompany" id="cr-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton class="cr-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="router.push(`/crm/customers/companies/${company.id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="openArchiveCompany">{{ t('Archive') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </div>

        <MpTabList>
          <MpTab>{{ t('Company details') }}</MpTab>
          <MpTab>{{ t('Deals') }} ({{ companyDeals.length }})</MpTab>
        </MpTabList>
      </header>

      <!-- ── Stage ── -->
      <div class="cr-stage">
        <MpTabPanels>
          <!-- ─────────── Company details ─────────── -->
          <MpTabPanel>
            <div class="cr-sections">
              <!-- Company info -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Company info') }}</h2>
                <div class="cr-grid">
                  <ContentList :label="t('Company name')" :value="company.name" />
                  <ContentList :label="t('Primary contact')">
                    <div v-if="picContact" class="cru-name">
                      <span class="cell-link" role="button" tabindex="0" @click="goContact(picContact.id)" @keydown.enter="goContact(picContact.id)">{{ picContact.name }}</span>
                      <span v-if="picContact.email" class="cru-email">{{ picContact.email }}</span>
                    </div>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="t('Website')">
                    <a v-if="companyDomain" class="cell-link" :href="`https://${companyDomain}`" target="_blank" rel="noopener">{{ companyDomain }}</a>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="t('Billing address')" :value="company.billingAddress || undefined" />
                  <ContentList :label="t('Shipping address')" :value="company.shippingAddress || undefined" />
                  <ContentList :label="t('Country')" :value="company.country || undefined" />
                  <ContentList :label="t('Email')">
                    <a v-if="company.email" class="cell-link" :href="`mailto:${company.email}`">{{ company.email }}</a>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="t('Phone')" :value="company.phone || undefined" />
                </div>
              </section>

              <!-- Bank info -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Bank info') }}</h2>
                <div v-if="banks.length" class="cr-banks">
                  <div v-for="(b, i) in banks" :key="b.id" class="cr-bank-col">
                    <div class="cr-bank-head">
                      <span class="cr-bank-title">{{ i === 0 ? t('Primary bank account') : `${t('Bank account')} ${i + 1}` }}</span>
                    </div>
                    <ContentList :label="t('Bank name')" :value="b.bankName || undefined" />
                    <ContentList :label="t('Bank branch')" :value="b.branch || undefined" />
                    <ContentList :label="t('Account no.')" :value="b.accountNo || undefined" />
                    <ContentList :label="t('Account name')" :value="b.accountName || undefined" />
                  </div>
                </div>
                <p v-else class="cp-empty">{{ t('No bank account yet.') }}</p>
              </section>

              <!-- Contact person -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Contact person') }}</h2>
                <div class="cp-bar">
                  <div class="filter-search">
                    <MpIcon name="search" size="sm" />
                    <input v-model="contactSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                    <button v-if="contactSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="contactSearch = ''"><MpIcon name="close" size="sm" /></button>
                  </div>
                  <MpButton v-if="canCreateContact" variant="tertiary" is-rounded left-icon="add" @click="newContact">{{ t('New contact') }}</MpButton>
                </div>

                <div class="cp-table">
                  <div class="cp-head">
                    <span>{{ t('Name') }}</span>
                    <span>{{ t('Email') }}</span>
                    <span>{{ t('Mobile') }}</span>
                    <span class="cp-actions-col" />
                  </div>
                  <div v-for="c in filteredContacts" :key="c.id" class="cp-row">
                    <div class="cp-name">
                      <span class="cell-link" role="button" tabindex="0" @click="goContact(c.id)" @keydown.enter="goContact(c.id)">{{ c.name }}</span>
                      <span v-if="company.primaryContactId === c.id" class="cp-pic-tag">{{ t('Primary') }}</span>
                    </div>
                    <span class="cp-cell">{{ c.email || '—' }}</span>
                    <span class="cp-cell">{{ c.phone || '—' }}</span>
                    <div class="cp-actions-col">
                      <MpPopover :id="`cp-actions-${c.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                        <MpPopoverTrigger>
                          <MpButton class="cr-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                          <MpPopoverList>
                            <MpPopoverListItem @click="goContact(c.id)">{{ t('View details') }}</MpPopoverListItem>
                            <MpPopoverListItem v-if="canEditContact" @click="router.push(`/crm/customers/contacts/${c.id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
                            <MpPopoverListItem v-if="canEditContact" @click="openArchiveContact(c.id)">{{ t('Archive') }}</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </div>
                  </div>
                  <p v-if="!filteredContacts.length" class="cp-empty">{{ contactSearch ? t('No contacts match your search.') : t('No contacts yet.') }}</p>
                </div>
              </section>

              <a class="cr-updated" role="button" tabindex="0" @click.prevent="activityOpen = true" @keydown.enter="activityOpen = true">{{ lastUpdatedDisplay }}</a>
            </div>
          </MpTabPanel>

          <!-- ─────────── Deals ─────────── -->
          <MpTabPanel>
            <div class="cr-deals-tab">
              <!-- Stats -->
              <div class="cr-stats">
                <div class="stat-card stat-card--bordered">
                  <div class="stat-title">{{ t('Outstanding') }}</div>
                  <div class="stat-amount" :class="{ 'stat-amount--danger': outstanding > 0 }">{{ formatIDR(outstanding) }}</div>
                  <span class="stat-period">{{ t('Invoiced, not yet paid') }}</span>
                </div>
                <div class="stat-card stat-card--bordered">
                  <div class="stat-title">{{ t('Billed to date') }}</div>
                  <div class="stat-amount">{{ formatIDR(billed) }}</div>
                  <a class="stat-link" role="button" tabindex="0" @click="soon(t('Invoices'))">{{ wonDeals.length }} {{ wonDeals.length !== 1 ? t('invoices') : t('invoice') }}</a>
                </div>
                <div class="stat-card">
                  <div class="stat-title">{{ t('In flight') }}</div>
                  <div class="stat-amount">{{ formatIDR(pipelineValue) }}</div>
                  <span class="stat-period">{{ openDeals.length }} {{ openDeals.length !== 1 ? t('deals') : t('deal') }}</span>
                </div>
              </div>

              <ErpTablePage
                :columns="visibleDealColumns"
                :rows="(dealPaginated as unknown as Record<string, unknown>[])"
                :total="dealTotal"
                :current-page="dealPage"
                :per-page="dealPerPage"
                :sort-key="dealSortKey"
                :sort-dir="dealSortDir"
                filter-empty-label="deal"
                :search="dealSearch"
                :has-active-filter="dealsHasFilter"
                @page-change="dealSetPage"
                @per-page-change="dealSetPerPage"
                @sort="dealToggleSort"
                @sort-change="dealSetSort"
                @hide-column="hideDealColumn"
                @clear-filters="clearDealFilters"
              >
                <template #filters>
                  <div class="filter-left">
                    <ErpFilterSelect id="cr-deal-stage" :model-value="dealStage" :placeholder="t('Stage')" :options="dealStageOptions" @update:model-value="(v: string) => (dealStage = v)" />
                    <MpButton
                      variant="secondary" left-icon="filter" is-rounded
                      class="filter-all-btn" :class="{ 'filter-all-btn--active': dealFilterCount > 0 }"
                      @click="dealFiltersOpen = true"
                    >{{ t('All filters') }}{{ dealFilterCount > 0 ? ` (${dealFilterCount})` : '' }}</MpButton>
                  </div>
                  <div class="filter-right">
                    <MpButtonGroup class="filter-btn-group">
                      <MpTooltip :label="t('Ask Airene')" placement="bottom">
                        <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
                      </MpTooltip>
                      <ColumnSettingsMenu id="cr-deal-columns" :items="dealColItems" :visibility="dealColVisibility" />
                      <MpTooltip :label="t('Export')" placement="bottom">
                        <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="soon(t('Export'))" />
                      </MpTooltip>
                    </MpButtonGroup>
                    <div class="filter-search">
                      <MpIcon name="search" size="sm" />
                      <input v-model="dealSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                      <button v-if="dealSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="dealSearch = ''"><MpIcon name="close" size="sm" /></button>
                    </div>
                  </div>
                </template>

                <template #cell-number="{ row }">
                  <span class="cell-link cell-text" @click.stop="router.push(`/crm/deals/${(row as unknown as Deal).id}`)">{{ dealNo((row as unknown as Deal).id) }}</span>
                </template>
                <template #cell-name="{ row }">
                  <span class="cell-link cell-text" @click.stop="router.push(`/crm/deals/${(row as unknown as Deal).id}`)">{{ (row as unknown as Deal).name }}</span>
                </template>
                <template #cell-contact="{ row }">
                  <div class="cru-name">
                    <span class="cell-text">{{ dealContactName(row as unknown as Deal) }}</span>
                    <span v-if="dealContactEmail(row as unknown as Deal)" class="cru-email">{{ dealContactEmail(row as unknown as Deal) }}</span>
                  </div>
                </template>
                <template #cell-stage="{ row }"><ErpStatusBadge :status="(row as unknown as Deal).stage" :type="dealStageBadgeType((row as unknown as Deal).stage)" :label="t((row as unknown as Deal).stage)" /></template>
                <template #cell-owner="{ row }"><span class="cell-text">{{ (row as unknown as Deal).owner }}</span></template>
                <template #cell-value="{ row }"><span class="cell-text">{{ formatIDR((row as unknown as Deal).value) }}</span></template>
                <template #cell-updated="{ row }">
                  <LastUpdatedCell :at="lastUpdatedFor((row as unknown as Deal).id).at" :by="lastUpdatedFor((row as unknown as Deal).id).by" />
                </template>

                <template #actions="{ row }">
                  <MpPopover :id="`cr-deal-actions-${(row as unknown as Deal).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                    <MpPopoverTrigger>
                      <MpButton class="cr-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                      <MpPopoverList>
                        <MpPopoverListItem @click="router.push(`/crm/deals/${(row as unknown as Deal).id}`)">{{ t('View details') }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </template>
              </ErpTablePage>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </div>
    </MpTabs>

    <!-- Activity log -->
    <ActivityLogModal :is-open="activityOpen" :subject="company.name" :entries="activityEntries" @close="activityOpen = false" />

    <!-- Archive confirmation (company or contact) — soft, non-destructive -->
    <ConfirmModal v-model:is-open="archiveOpen" :title="archiveTitle" :description="archiveDescription" :confirm-label="t('Archive')" :is-danger="false" @confirm="confirmArchive" />

    <!-- Deals "All filters" drawer -->
    <CrmDealsFiltersDrawer
      id="cr-deal-filters"
      v-model:is-open="dealFiltersOpen"
      :model-value="dealFilters"
      :columns="dealDrawerColumns"
      :owner-options="dealOwnerOptions"
      :customer-options="dealContactOptions"
      :customer-label="t('Contact person')"
      :customer-placeholder="t('Type a contact…')"
      @apply="applyDealFilters"
    />
  </div>

  <div v-else class="cr-missing">
    <MpIcon name="profile" size="lg" />
    <p>{{ t('Company not found') }}</p>
    <MpButton variant="secondary" is-rounded @click="router.push('/crm/customers/companies')">{{ t('Back to Companies') }}</MpButton>
  </div>
</template>

<style scoped>
.cr-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.cr-tabs { display: flex; flex-direction: column; min-height: 0; flex: 1; }

/* ── Title bar band (bar + tab strip share the neutral-subtle background) ── */
.cr-header { flex-shrink: 0; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); }
.cr-bar { height: var(--mp-sizes-18, 72px); box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.cr-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.cr-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cr-breadcrumb { align-self: flex-start; cursor: pointer; font-size: 12px; line-height: var(--mp-line-heights-md); color: var(--mp-text-link); text-decoration: none; }
.cr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }

/* Tab strip: no gray baseline border — only the active tab's green underline. */
.cr-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: 0 !important; border-bottom: none !important; box-shadow: none !important; }
.cr-tabs :deep(.mp-tab--isSelected_true), .cr-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.cr-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }

/* ── Stage ── */
.cr-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8); }

/* ── Sections ── */
.cr-sections { display: flex; flex-direction: column; }
.cr-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cr-section:first-child { padding-top: 0; }
/* Last real section (Contact person; the "Last updated" link is an <a>, not a section)
   has no divider below it. */
.cr-section:last-of-type { border-bottom: none; }
.cr-section-title { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }

/* Company info key/value — 3-col grid */
.cr-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-3); }
.cr-grid > * { min-width: 0; }
.cru-name { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.cru-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Contact person table */
.cp-bar { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.cp-table { display: flex; flex-direction: column; }
.cp-head, .cp-row { display: grid; grid-template-columns: 2.4fr 2fr 1.6fr 40px; align-items: center; gap: var(--mp-spacing-3); }
.cp-head { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle, #f8f9f9); border-radius: var(--mp-radii-sm, 4px); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; letter-spacing: 0.02em; }
/* Every row keeps a bottom border — this table has no pagination footer to close it off. */
.cp-row { min-height: 40px; padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cp-name { display: flex; flex-direction: row; align-items: center; min-width: 0; gap: var(--mp-spacing-2); }
.cp-pic-tag { padding: 0 var(--mp-spacing-1); border-radius: var(--mp-radii-sm, 4px); background: var(--mp-background-info-subtle, #e8f1fb); color: var(--mp-text-link, #165082); font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); white-space: nowrap; }
.cp-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-cell { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cp-actions-col { display: flex; align-items: center; justify-content: flex-end; }
.cp-empty { margin: var(--mp-spacing-4) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Bank info — 12-col grid; each bank account spans 4 columns → 3 per row. */
.cr-banks { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-6); }
.cr-bank-col { grid-column: span 4; display: flex; flex-direction: column; }
.cr-bank-head { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }
.cr-bank-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.cr-updated { display: inline-block; margin-top: var(--mp-spacing-6); align-self: flex-start; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-link); cursor: pointer; text-decoration: none; }
.cr-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Deals tab ── */
.cr-deals-tab { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.cr-stats { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-link { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; cursor: pointer; }
.stat-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-text-link); cursor: pointer; text-decoration: none; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Filter bar (deals) */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral, #ffffff); border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
/* "All filters" button + right-side icon group (mirrors the Deals list). */
.filter-all-btn { font-weight: var(--mp-font-weights-semi-bold); }
.filter-all-btn--active { border-color: var(--mp-border-brand, #1877f2); color: var(--mp-text-link, #165082); }
.filter-btn-group { display: flex; align-items: center; }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
.search-clear-btn { display: inline-flex !important; align-items: center; justify-content: center; flex-shrink: 0; width: 18px !important; height: 18px !important; min-width: 0 !important; padding: 0 !important; border: none !important; background: none !important; cursor: pointer; color: var(--mp-colors-icon-default, #536062); border-radius: var(--mp-radii-full, 999px) !important; }
.search-clear-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }

.cr-kebab {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.cr-kebab:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); color: var(--mp-colors-text-default, #080d0e); }

.cr-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: 80px; color: var(--mp-text-secondary); }
</style>
