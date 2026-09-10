<script setup lang="ts">
/**
 * CRM — Contact record (/crm/customers/contacts/:id).
 *
 * Mirrors the Company record page exactly: a tabbed detail (band with breadcrumb +
 * title + Actions, then a tab strip) over a full-bleed stage. Tabs:
 *   • Contact details — read-only key/values matching the create form (Contact
 *     details / Address / Account details). Nothing here that the form doesn't have.
 *   • Deals (N) — same stats + filter bar + table as the company Deals tab, but
 *     scoped to the deals whose PRIMARY CONTACT is this contact (not all of the
 *     company's deals).
 *   • Notes — the contact's notes (CrmNotesPanel).
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
import {
  getContactPerson, getCompany, companiesOfContact, dealsForCompany, isDealOpen, dealNo, dealExpectedValue,
  archiveCrmContactPerson, restoreCrmContactPerson, contactBlockingCompany, can, CRM_OWNERS, DEAL_STAGES, type Deal,
} from '~/data/crm'

const toggleAirene = inject<() => void>('toggleAirene')

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()
function soon(_what: string) {}

const canEdit = computed(() => can('contacts.edit'))
const canCreateDeal = computed(() => can('deals.create'))

const contact = computed(() => getContactPerson(props.orderId))
const isArchived = computed(() => !!contact.value?.archived)
// A CRM contact belongs to one company; prefer the one it's primary of, else the first.
const company = computed(() => {
  if (!contact.value) return undefined
  const list = companiesOfContact(contact.value.id)
  return list.find((co) => co.primaryContactId === contact.value!.id) ?? list[0]
})

const activeTab = ref(0)
function goCompany(id: string) { router.push(`/crm/customers/companies/${id}`) }

// All emails / phones (fall back to the primary single field for legacy records).
const emailList = computed(() => (contact.value?.emails?.length ? contact.value.emails : [contact.value?.email].filter(Boolean)) as string[])
const phoneList = computed(() => (contact.value?.phones?.length ? contact.value.phones : [contact.value?.phone].filter(Boolean)) as string[])
const sourceText = computed(() => {
  const c = contact.value
  if (!c?.source) return undefined
  return c.source === 'Other' && c.sourceOther ? c.sourceOther : t(c.source)
})
// Billing address — one composed line (address, city, province+postal, country),
// same format as the company detail. e.g. "Jl. … No. 18, Jakarta, DKI Jakarta 10660, Indonesia".
const billingAddressText = computed(() => {
  const c = contact.value
  if (!c) return undefined
  const line = [
    (c.address ?? '').trim(),
    (c.city ?? '').trim(),
    [(c.province ?? '').trim(), (c.postalCode ?? '').trim()].filter(Boolean).join(' '),
    (c.country ?? '').trim(),
  ].filter(Boolean).join(', ')
  return line || undefined
})

// ── Deals — only deals whose PRIMARY CONTACT is this contact ──────────────────
// A deal's primary contact = its own picName snapshot, else the company's PIC.
function dealPrimaryName(d: Deal): string {
  if (d.picName) return d.picName
  const co = company.value
  const pic = co?.primaryContactId ? getContactPerson(co.primaryContactId) : undefined
  return pic?.name ?? ''
}
const contactDeals = computed<Deal[]>(() => {
  const c = contact.value; const co = company.value
  if (!c || !co) return []
  return dealsForCompany(co.id).filter((d) => dealPrimaryName(d) === c.name)
})
function dealContactName(d: Deal): string { return dealPrimaryName(d) || (contact.value?.name ?? '—') }
function dealContactEmail(d: Deal): string { return d.email || contact.value?.email || '' }

// Stats (derived from THIS contact's deals — same layout as the company Deals tab).
const openDeals = computed(() => contactDeals.value.filter(isDealOpen))
const wonDeals = computed(() => contactDeals.value.filter((d) => d.stage === 'Won'))
const pipelineValue = computed(() => openDeals.value.reduce((n, d) => n + d.value, 0))
const billed = computed(() => wonDeals.value.reduce((n, d) => n + d.value, 0))
const outstanding = computed(() => wonDeals.value.filter((d) => d.conversion !== 'converted').reduce((n, d) => n + d.value, 0))

// ── Deals table (ErpTablePage) — identical to the company Deals tab ──
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
const dealColVisibility = reactive<Record<string, boolean>>(Object.fromEntries(dealColumns.map((c) => [c.key, true])))
const dealColItems = dealColumns.map((c) => ({ key: c.key, label: c.label, disabled: c.key === 'name' }))
const visibleDealColumns = computed<TableColumn[]>(() => dealColumns.filter((c) => dealColVisibility[c.key]))
function hideDealColumn(key: string) { dealColVisibility[key] = false }

const dealFilters = reactive<CrmDealsFiltersValue>(emptyCrmDealsFilters())
const dealFiltersOpen = ref(false)
const dealOwnerOptions = [...CRM_OWNERS]
const dealContactOptions = computed(() => (contact.value ? [contact.value.name] : []))
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
} = useTableState<Deal>(contactDeals, {
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

// ── Activity log (shared audit-trail modal) ──
const activityOpen = ref(false)
const lastUpdatedDisplay = computed(() => {
  if (!contact.value) return ''
  const { at, by } = lastUpdatedFor(contact.value.id)
  const d = new Date(at)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${t('Last updated by')} ${by} ${t('on')} ${date}, ${time} (GMT+7)`
})
const activityEntries = computed<ActivityEntry[]>(() => {
  const c = contact.value
  if (!c) return []
  const upd = lastUpdatedFor(c.id)
  return [
    { date: upd.at, user: upd.by, activity: 'Updated', details: [{ label: t('Contact'), value: c.name }] },
    {
      date: new Date(c.createdAt).toISOString(), user: c.owner || upd.by, activity: 'Created',
      details: [
        { label: t('Display name'), value: c.name },
        { label: t('Full name'), value: c.fullName || '—' },
        { label: t('Email'), value: emailList.value[0] || '—' },
        { label: t('Company'), value: company.value?.name || '—' },
      ],
    },
  ]
})

// ── Archive / Restore (always confirmed; soft — no permanent delete) ──
const archiveOpen = ref(false)
function confirmArchive() {
  if (!contact.value) return
  const restoring = isArchived.value
  if (!restoring) {
    // Block archiving a contact that is a company's PIC or sole active member (PRD §351).
    const blocker = contactBlockingCompany(contact.value.id)
    if (blocker) {
      toast.notify({ variant: 'warning', title: `${t('Set another PIC on')} ${blocker.name} ${t('before archiving.')}`, maxWidth: 'max-content' })
      return
    }
    archiveCrmContactPerson(contact.value.id)
    toast.notify({ variant: 'success', title: t('Contact archived'), maxWidth: 'max-content' })
    router.push('/crm/customers/contacts')
    return
  }
  restoreCrmContactPerson(contact.value.id)
  toast.notify({ variant: 'success', title: t('Contact restored'), maxWidth: 'max-content' })
}
</script>

<template>
  <div class="cr-page" v-if="contact">
    <MpTabs id="ct-detail-tabs" v-model="activeTab" is-manual variant-color="green" class="cr-tabs">
      <!-- ── Title bar band: breadcrumb + title + actions, then the tab strip ── -->
      <header class="cr-header">
        <div class="cr-bar">
          <div class="cr-bar-left">
            <NuxtLink class="cr-breadcrumb" to="/crm/customers/contacts">{{ t('Contacts') }}</NuxtLink>
            <h1 class="cr-title">{{ contact.name }}</h1>
          </div>
          <div class="cr-bar-right">
            <MpButton v-if="canCreateDeal" variant="primary" is-rounded left-icon="add" @click="soon(t('New deal'))">{{ t('New deal') }}</MpButton>
            <MpPopover v-if="canEdit" id="ct-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton class="cr-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem v-if="!isArchived" @click="router.push(`/crm/customers/contacts/${contact.id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="archiveOpen = true">{{ isArchived ? t('Restore') : t('Archive') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </div>

        <MpTabList>
          <MpTab>{{ t('Contact details') }}</MpTab>
          <MpTab>{{ t('Deals') }} ({{ contactDeals.length }})</MpTab>
          <MpTab>{{ t('Notes') }}</MpTab>
        </MpTabList>
      </header>

      <!-- ── Stage ── -->
      <div class="cr-stage">
        <MpTabPanels>
          <!-- ─────────── Contact details ─────────── -->
          <MpTabPanel>
            <div class="cr-sections">
              <!-- Contact details (mirrors the create form) -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Contact details') }}</h2>
                <div class="cr-grid">
                  <ContentList :label="t('Display name')" :value="contact.name" />
                  <ContentList :label="t('Full name')" :value="contact.fullName || undefined" />
                  <ContentList :label="emailList.length > 1 ? t('Emails') : t('Email')">
                    <div v-if="emailList.length" class="cru-stack">
                      <a v-for="(e, i) in emailList" :key="`e-${i}`" class="cell-link" :href="`mailto:${e}`">{{ e }}<span v-if="i === 0 && emailList.length > 1" class="cru-primary">{{ t('Primary') }}</span></a>
                    </div>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="phoneList.length > 1 ? t('Mobiles') : t('Mobile')">
                    <div v-if="phoneList.length" class="cru-stack">
                      <span v-for="(p, i) in phoneList" :key="`p-${i}`">{{ p }}<span v-if="i === 0 && phoneList.length > 1" class="cru-primary">{{ t('Primary') }}</span></span>
                    </div>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="t('Company')">
                    <span v-if="company" class="cell-link" role="button" tabindex="0" @click="goCompany(company.id)" @keydown.enter="goCompany(company.id)">{{ company.name }}</span>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="t('Description')" :value="contact.description || undefined" />
                </div>
              </section>

              <!-- Address -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Address') }}</h2>
                <div class="cr-grid">
                  <ContentList :label="t('Billing address')" :value="billingAddressText" />
                </div>
              </section>

              <!-- Account details -->
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Account details') }}</h2>
                <div class="cr-grid">
                  <ContentList :label="t('Account owner')" :value="contact.owner || undefined" />
                  <ContentList :label="t('Source')" :value="sourceText" />
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
                    <ErpFilterSelect id="ct-deal-stage" :model-value="dealStage" :placeholder="t('Stage')" :options="dealStageOptions" @update:model-value="(v: string) => (dealStage = v)" />
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
                      <ColumnSettingsMenu id="ct-deal-columns" :items="dealColItems" :visibility="dealColVisibility" />
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
                <template #cell-stage="{ row }"><ErpStatusBadge :status="(row as unknown as Deal).stage" /></template>
                <template #cell-owner="{ row }"><span class="cell-text">{{ (row as unknown as Deal).owner }}</span></template>
                <template #cell-value="{ row }"><span class="cell-text">{{ formatIDR((row as unknown as Deal).value) }}</span></template>
                <template #cell-updated="{ row }">
                  <LastUpdatedCell :at="lastUpdatedFor((row as unknown as Deal).id).at" :by="lastUpdatedFor((row as unknown as Deal).id).by" />
                </template>

                <template #actions="{ row }">
                  <MpPopover :id="`ct-deal-actions-${(row as unknown as Deal).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
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

          <!-- ─────────── Notes ─────────── -->
          <MpTabPanel>
            <div class="cr-sections">
              <section class="cr-section">
                <h2 class="cr-section-title">{{ t('Notes') }}</h2>
                <CrmNotesPanel entity-type="contact" :entity-id="contact.id" :read-only="!canEdit" />
              </section>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </div>
    </MpTabs>

    <!-- Activity log -->
    <ActivityLogModal :is-open="activityOpen" :subject="contact.name" :entries="activityEntries" @close="activityOpen = false" />

    <!-- Archive / Restore confirmation (soft, non-destructive) -->
    <ConfirmModal
      v-model:is-open="archiveOpen"
      :title="isArchived ? t('Restore contact') : t('Archive contact')"
      :description="isArchived ? t('This contact will be restored to the active list.') : t('This contact will be archived. You can restore it later.')"
      :confirm-label="isArchived ? t('Restore') : t('Archive')"
      :is-danger="false"
      @confirm="confirmArchive"
    />

    <!-- Deals "All filters" drawer -->
    <CrmDealsFiltersDrawer
      id="ct-deal-filters"
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
    <p>{{ t('Contact not found.') }}</p>
    <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push('/crm/customers/contacts')">{{ t('Back to Contacts') }}</button>
  </div>
</template>

<style scoped>
.cr-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.cr-tabs { display: flex; flex-direction: column; min-height: 0; flex: 1; }

/* ── Title bar band ── */
.cr-header { flex-shrink: 0; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); }
.cr-bar { height: var(--mp-sizes-18, 72px); box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.cr-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.cr-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cr-breadcrumb { align-self: flex-start; cursor: pointer; font-size: 12px; line-height: var(--mp-line-heights-md); color: var(--mp-text-link); text-decoration: none; }
.cr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }

/* Tab strip: only the active tab's green underline. */
.cr-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: 0 !important; border-bottom: none !important; box-shadow: none !important; }
.cr-tabs :deep(.mp-tab--isSelected_true), .cr-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.cr-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }

/* ── Stage ── */
.cr-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8); }

/* ── Sections ── */
.cr-sections { display: flex; flex-direction: column; }
.cr-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cr-section:first-child { padding-top: 0; }
.cr-section:last-of-type { border-bottom: none; }
.cr-section-title { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }

/* Key/value — 3-col grid */
.cr-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-3); }
.cr-grid > * { min-width: 0; }
.cru-name { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.cru-email { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cru-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); }
.cru-primary { margin-left: var(--mp-spacing-2); padding: 0 var(--mp-spacing-1); border-radius: var(--mp-radii-sm, 4px); background: var(--mp-background-info-subtle, #e8f1fb); color: var(--mp-text-link, #165082); font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); }

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
