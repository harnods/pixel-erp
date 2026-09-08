<script setup lang="ts">
/**
 * CRM (Qontak) — Company detail (/crm/customers/:id), venom Customer-detail format:
 * detail-bar + summary metrics + green MpTabs (Overview · Contacts · Deals · Orders).
 * Overview = company profile + key fields + notes. Each list tab has its own
 * filter bar (search + a tertiary "+ New …") and a standard ErpTablePage.
 */
import { ref, computed, reactive, watch, inject } from 'vue'
import {
  MpIcon, MpAvatar, MpTextarea, MpButton, MpButtonGroup, MpInputTag, MpTooltip,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, type DataInterface,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import { useTableState } from '~/composables/useTableState'
import { formatIDR } from '~/utils/currency'
import { formatDate, formatDateTime } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import {
  getCrmCustomer, lifecycleOf, customerDeals, setCustomerSegments, crmOrders, crmProducts,
  jobTitleFor, skuFor, crmCompanyComments, companyCommentsFor, addCompanyComment, deleteCompanyComment,
  type LifecycleStage,
} from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const toggleAirene = inject<() => void>('toggleAirene')
function soon(what: string) { infoToast(`${what} — coming soon`) }

const customer = computed(() => getCrmCustomer(props.orderId))
const aboutText = computed(() => {
  const c = customer.value
  return c ? `${c.company} is a ${c.segment.toLowerCase()} in ${c.city}, managed by ${c.owner}.` : ''
})

// ── Related data ──
type ContactRow = { id: string; name: string; jobTitle: string; email: string; phone: string; owner: string }
const contactRows = computed<ContactRow[]>(() =>
  customer.value?.contact
    ? [{ id: `${customer.value.id}-c`, name: customer.value.contact, jobTitle: jobTitleFor(customer.value.contact), email: customer.value.email, phone: customer.value.phone, owner: customer.value.owner }]
    : [],
)
const dealRows = computed(() => (customer.value ? customerDeals(customer.value) : []))

// ── Orders (sales orders) — one row per order; expand to its product line items ──
type OrderLine = { name: string; sku: string; unit: string; qty: number; price: number; total: number }
type SalesOrder = { id: string; date: string; amount: number; balanceDue: number; status: string; items: OrderLine[] }
function orderLineItems(id: string, amount: number): OrderLine[] {
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const pool = crmProducts
  if (!pool.length) return []
  const n = 1 + (h % 3) // 1–3 products per order
  const items: OrderLine[] = []
  let remaining = amount
  for (let i = 0; i < n; i++) {
    const p = pool[(h + i * 7) % pool.length]!
    const lineTotal = i === n - 1 ? remaining : Math.round(amount / n)
    remaining -= lineTotal
    const qty = Math.max(1, Math.round(lineTotal / p.price))
    items.push({ name: p.name, sku: skuFor(p.name), unit: p.unit, qty, price: p.price, total: lineTotal })
  }
  return items
}
const companyOrders = computed<SalesOrder[]>(() =>
  (customer.value ? crmOrders.filter((o) => o.customer === customer.value!.company) : []).map((o) => ({
    id: o.id, date: o.date, amount: o.amount,
    balanceDue: o.status === 'paid' || o.status === 'fulfilled' ? 0 : o.amount,
    status: o.status, items: orderLineItems(o.id, o.amount),
  })),
)
const orderSearch = ref('')
const filteredOrders = computed<SalesOrder[]>(() => {
  const s = orderSearch.value.trim().toLowerCase()
  return companyOrders.value.filter((o) => !s || o.id.toLowerCase().includes(s) || o.status.toLowerCase().includes(s) || o.items.some((li) => li.name.toLowerCase().includes(s)))
})
const expandedOrders = ref(new Set<string>())
function toggleOrder(id: string) {
  const set = new Set(expandedOrders.value)
  set.has(id) ? set.delete(id) : set.add(id)
  expandedOrders.value = set
}

// ── Tabs (index-based; Deals=2 reachable via ?tab=deals from the list) ──
const activeTab = ref<number>(route.query.tab === 'deals' ? 2 : 0)
watch(() => route.query.tab, (v) => { if (v === 'deals') activeTab.value = 2 })

// ── Editable Segments (tags) ──
const segTags = computed<DataInterface[]>(() =>
  (customer.value?.segments ?? []).map((s) => ({ id: s, label: s, value: s } as unknown as DataInterface)))
function onSegChange(data: DataInterface[]) {
  if (!customer.value) return
  const tags = data.map((d) => String((d as { label?: string; value?: string }).label ?? (d as { value?: string }).value ?? '')).filter(Boolean)
  setCustomerSegments(customer.value.id, tags)
}

// ── Notes / comments ──
const newComment = ref('')
const myComments = computed(() => { void crmCompanyComments.length; return customer.value ? companyCommentsFor(customer.value.id) : [] })
function postComment() {
  const t = newComment.value.trim()
  if (!t || !customer.value) return
  addCompanyComment(customer.value.id, t)
  newComment.value = ''
}
function removeComment(id: string) { deleteCompanyComment(id) }

// ── Tab tables (each with its own search) ──
const contactColumns: TableColumn[] = [
  { key: 'name',        label: 'Name',          kind: 'name', sortable: true, sortType: 'text' },
  { key: 'jobTitle',    label: 'Job title',     kind: 'name', sortable: true, sortType: 'text' },
  { key: 'email',       label: 'Email',                       sortable: true, sortType: 'text' },
  { key: 'phone',       label: 'Mobile',                      sortable: true, sortType: 'text' },
  { key: 'owner',       label: 'Contact owner', kind: 'name', sortable: true, sortType: 'text' },
  { key: 'lastUpdated', label: 'Last updated',  kind: 'date'                                    },
]
const contactVisibility = reactive<Record<string, boolean>>(Object.fromEntries(contactColumns.map((c) => [c.key, true])))
const contactColumnItems = contactColumns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const contactVisibleColumns = computed<TableColumn[]>(() => contactColumns.filter((c) => contactVisibility[c.key]))
function hideContactColumn(key: string) { contactVisibility[key] = false }
const { search: contactSearch, paginated: contactPage, total: contactTotal, currentPage: contactCur, perPage: contactPer, sortKey: contactSk, sortDir: contactSd, setPage: contactSetPage, setPerPage: contactSetPer, toggleSort: contactToggle, setSort: contactSetSort } =
  useTableState<ContactRow>(contactRows, { perPage: 10, filterFn: (r, s) => [r.name, r.jobTitle, r.email, r.phone, r.owner].join(' ').toLowerCase().includes(s) })

const dealColumns: TableColumn[] = [
  { key: 'name',      label: 'Deal',        kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'stage',     label: 'Stage',       kind: 'status', sortable: true, sortType: 'text'   },
  { key: 'value',     label: 'In flight',   kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'outstanding', label: 'Outstanding', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'billed',    label: 'Billed',      kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'closeDate', label: 'Close date',  kind: 'date',   sortable: true, sortType: 'date'   },
  { key: 'owner',     label: 'Owner',       kind: 'name',   sortable: true, sortType: 'text'   },
]
// Deal rows carry per-deal money split by stage: open deals are "in flight",
// won deals are "billed" (with any unpaid part "outstanding").
const dealTableRows = computed(() => dealRows.value.map((d) => {
  const won = d.stage === 'Won' || d.stage === 'Closed won'
  return { ...d, value: won ? 0 : d.value, billed: won ? d.value : 0, outstanding: 0 }
}))
const { search: dealSearch, paginated: dealPage, total: dealTotal, currentPage: dealCur, perPage: dealPer, sortKey: dealSk, sortDir: dealSd, setPage: dealSetPage, setPerPage: dealSetPer, toggleSort: dealToggle, setSort: dealSetSort } =
  useTableState(dealTableRows, { perPage: 10, filterFn: (r, s) => [(r as { name: string }).name, (r as { stage: string }).stage, (r as { owner: string }).owner].join(' ').toLowerCase().includes(s) })

function goContact(id: string) { router.push(`/crm/contacts/${id}`) }

function lifecycleBadge(lc: LifecycleStage) {
  if (lc === 'Customer') return { status: 'active', label: 'Customer' }
  if (lc === 'Opportunity') return { status: 'prospect', type: 'information' as const, label: 'Opportunity' }
  if (lc === 'Lead') return { status: 'prospect', type: 'announcement' as const, label: 'Lead' }
  return { status: 'churned', type: 'announcement' as const, label: 'Former customer' }
}
function stageBadge(stage: string) {
  if (stage === 'Won' || stage === 'Closed won') return { status: 'active', label: stage }
  if (stage === 'Negotiation' || stage === 'Proposal sent') return { status: 'prospect', type: 'information' as const, label: stage }
  return { status: 'prospect', type: 'announcement' as const, label: stage }
}
function orderBadge(status: string) {
  if (status === 'paid' || status === 'fulfilled') return { status: 'active', label: status }
  if (status === 'cancelled') return { status: 'churned', type: 'announcement' as const, label: status }
  return { status: 'prospect', type: 'information' as const, label: status }
}
</script>

<template>
  <div class="detail-page" v-if="customer">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" type="button" @click="router.push('/crm/customers')">Companies</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ customer.company }}</h1>
          <ErpStatusBadge v-bind="lifecycleBadge(lifecycleOf(customer))" />
        </div>
      </div>
      <div class="cd-bar-actions">
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded @click="soon('Edit company')">Edit</MpButton>
          <MpPopover id="cd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="primary" is-rounded right-icon="chevrons-down">Actions</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="soon('New deal')">New deal</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Log activity')">Log activity</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Add contact')">Add contact</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Delete company')">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </MpButtonGroup>
      </div>
    </header>

    <div class="detail-stage">
      <!-- ── Summary metrics ── -->
      <section class="cd-summary">
        <div class="cd-metric">
          <span class="cd-metric-label">Outstanding</span>
          <span class="cd-metric-value" :class="{ 'cd-metric-value--bad': customer.outstanding > 0 }">{{ formatIDR(customer.outstanding) }}</span>
          <span class="cd-metric-sub">Invoiced, not yet paid</span>
        </div>
        <div class="cd-metric">
          <span class="cd-metric-label">Billed to date</span>
          <span class="cd-metric-value">{{ formatIDR(customer.lifetimeValue) }}</span>
          <span class="cd-metric-sub">Lifetime value</span>
        </div>
        <div class="cd-metric">
          <span class="cd-metric-label">In flight</span>
          <span class="cd-metric-value">{{ formatIDR(customer.inFlight) }}</span>
          <span class="cd-metric-sub">{{ dealRows.length }} {{ dealRows.length !== 1 ? 'open deals' : 'open deal' }}</span>
        </div>
        <div class="cd-metric">
          <span class="cd-metric-label">Orders</span>
          <span class="cd-metric-value">{{ companyOrders.length }}</span>
          <span class="cd-metric-sub">All time</span>
        </div>
      </section>

      <MpTabs id="cus-detail-tabs" v-model="activeTab" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab>Overview</MpTab>
          <MpTab>Contacts ({{ contactRows.length }})</MpTab>
          <MpTab>Deals ({{ dealRows.length }})</MpTab>
          <MpTab>Orders ({{ companyOrders.length }})</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- ── Overview ── -->
          <MpTabPanel>
            <div class="cd-panel">
              <!-- Company profile -->
              <section class="cd-profile">
                <MpAvatar :id="`cd-av-${customer.id}`" :name="customer.company" size="lg" variant-color="green" />
                <div class="cd-profile-body">
                  <div class="cd-profile-titlerow">
                    <h2 class="cd-profile-name">{{ customer.company }}</h2>
                    <ErpStatusBadge v-bind="lifecycleBadge(lifecycleOf(customer))" />
                  </div>
                  <div class="cd-profile-meta">{{ customer.segment }} · {{ customer.city }}</div>
                  <p class="cd-profile-about">{{ aboutText }}</p>
                </div>
              </section>

              <section class="cd-section">
                <h2 class="cd-section-title">Company</h2>
                <div class="cd-grid">
                  <ContentList label="Primary contact" :value="customer.contact || '—'" />
                  <ContentList label="Email">
                    <a v-if="customer.email" class="cell-link" :href="`mailto:${customer.email}`">{{ customer.email }}</a>
                    <span v-else>—</span>
                  </ContentList>
                  <ContentList label="Mobile" :value="customer.phone || '—'" />
                  <ContentList label="Contact owner" :value="customer.owner || '—'" />
                  <ContentList label="City" :value="customer.city || '—'" />
                  <ContentList label="Lifecycle">
                    <ErpStatusBadge v-bind="lifecycleBadge(lifecycleOf(customer))" />
                  </ContentList>
                </div>
              </section>

              <section class="cd-section">
                <h2 class="cd-section-title">Segments</h2>
                <MpInputTag id="cd-segments" :data="segTags" :is-enable-create-new-tag="true" :is-show-suggestions="false" placeholder="+ Add segment" @change="onSegChange" />
              </section>

              <!-- Notes / comments -->
              <section class="cd-section">
                <h2 class="cd-section-title">Notes</h2>
                <div class="cmt-add">
                  <MpTextarea id="cd-comment-input" v-model="newComment" is-full-width :rows="3" placeholder="Add a note about this company…" />
                  <div class="cmt-add-actions">
                    <MpButton variant="primary" is-rounded :is-disabled="!newComment.trim()" @click="postComment">Add note</MpButton>
                  </div>
                </div>
                <div v-if="myComments.length" class="cmt-list">
                  <div v-for="c in myComments" :key="c.id" class="cmt-item">
                    <MpAvatar :id="`cmt-av-${c.id}`" :name="c.author" size="md" variant-color="green" />
                    <div class="cmt-body">
                      <div class="cmt-head">
                        <span class="cmt-author">{{ c.author }}</span>
                        <span class="cmt-time">{{ formatDateTime(c.at) }}</span>
                        <span class="cmt-del" role="button" tabindex="0" aria-label="Delete note" @click="removeComment(c.id)" @keydown.enter="removeComment(c.id)"><MpIcon name="delete" size="sm" /></span>
                      </div>
                      <p class="cmt-text">{{ c.text }}</p>
                    </div>
                  </div>
                </div>
                <p v-else class="cd-muted">No notes yet.</p>
              </section>
            </div>
          </MpTabPanel>

          <!-- ── Contacts ── -->
          <MpTabPanel>
            <div class="cd-panel">
              <ErpTablePage
                :columns="contactVisibleColumns" :rows="(contactPage as Record<string, unknown>[])" :total="contactTotal"
                :current-page="contactCur" :per-page="contactPer" :sort-key="contactSk" :sort-dir="contactSd"
                :search="contactSearch" :has-active-filter="!!contactSearch" filter-empty-label="contact"
                @page-change="contactSetPage" @per-page-change="contactSetPer" @sort="contactToggle" @sort-change="contactSetSort" @hide-column="hideContactColumn" @clear-filters="contactSearch = ''"
              >
                <template #filters>
                  <div class="filter-left">
                    <MpButton variant="tertiary" is-rounded @click="soon('New contact')">New contact</MpButton>
                  </div>
                  <div class="filter-right">
                    <div class="filter-btn-group">
                      <MpTooltip id="cd-ct-airene" label="Ask Airene" placement="bottom" use-portal>
                        <button class="filter-icon-btn filter-icon-btn--airene" type="button" aria-label="Ask Airene" @click="toggleAirene?.()"><MpIcon name="airene-brand" size="md" /></button>
                      </MpTooltip>
                      <ColumnSettingsMenu id="cd-ct-columns" :items="contactColumnItems" :visibility="contactVisibility" />
                      <MpTooltip id="cd-ct-export" label="Export" placement="bottom" use-portal>
                        <button class="filter-icon-btn" type="button" aria-label="Export"><MpIcon name="download" size="md" /></button>
                      </MpTooltip>
                    </div>
                    <div class="filter-search">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                      <input v-model="contactSearch" class="filter-search-input" type="text" placeholder="Search..." />
                      <button v-if="contactSearch" class="search-clear-btn" type="button" aria-label="Clear search" @click="contactSearch = ''"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button>
                    </div>
                  </div>
                </template>
                <template #cell-name="{ row }">
                  <a class="cell-link cell-text" @click.stop="goContact((row as ContactRow).id)">{{ (row as ContactRow).name }}</a>
                </template>
                <template #cell-phone="{ value }"><span v-if="value">{{ value }}</span><span v-else class="cd-muted">—</span></template>
                <template #cell-email="{ value }"><span v-if="value">{{ value }}</span><span v-else class="cd-muted">—</span></template>
                <template #cell-lastUpdated="{ row }"><LastUpdatedCell v-bind="lastUpdatedFor((row as ContactRow).id)" /></template>
              </ErpTablePage>
            </div>
          </MpTabPanel>

          <!-- ── Deals ── -->
          <MpTabPanel>
            <div class="cd-panel">
              <ErpTablePage
                :columns="dealColumns" :rows="(dealPage as Record<string, unknown>[])" :total="dealTotal"
                :current-page="dealCur" :per-page="dealPer" :sort-key="dealSk" :sort-dir="dealSd"
                :search="dealSearch" :has-active-filter="!!dealSearch" filter-empty-label="deal"
                @page-change="dealSetPage" @per-page-change="dealSetPer" @sort="dealToggle" @sort-change="dealSetSort" @clear-filters="dealSearch = ''"
              >
                <template #filters>
                  <div class="filter-left" />
                  <div class="filter-right">
                    <div class="filter-search">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                      <input v-model="dealSearch" class="filter-search-input" type="text" placeholder="Search..." />
                      <button v-if="dealSearch" class="search-clear-btn" type="button" aria-label="Clear search" @click="dealSearch = ''"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button>
                    </div>
                    <MpButton variant="tertiary" is-rounded @click="soon('New deal')">New deal</MpButton>
                  </div>
                </template>
                <template #cell-name="{ value }"><a class="cell-link cell-text" @click.stop="soon('Deal detail')">{{ value }}</a></template>
                <template #cell-stage="{ value }"><ErpStatusBadge v-bind="stageBadge(value as string)" /></template>
                <template #cell-value="{ value }"><span v-if="value">{{ formatIDR(value as number) }}</span><span v-else class="cd-muted">—</span></template>
                <template #cell-outstanding="{ value }"><span v-if="value">{{ formatIDR(value as number) }}</span><span v-else class="cd-muted">—</span></template>
                <template #cell-billed="{ value }"><span v-if="value">{{ formatIDR(value as number) }}</span><span v-else class="cd-muted">—</span></template>
                <template #cell-closeDate="{ value }">{{ formatDate(value as string) }}</template>
              </ErpTablePage>
            </div>
          </MpTabPanel>

          <!-- ── Orders (sales orders; expand a row to its products) ── -->
          <MpTabPanel>
            <div class="cd-panel">
              <div class="cd-filterbar">
                <div class="filter-left" />
                <div class="filter-right">
                  <div class="filter-search">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    <input v-model="orderSearch" class="filter-search-input" type="text" placeholder="Search..." />
                    <button v-if="orderSearch" class="search-clear-btn" type="button" aria-label="Clear search" @click="orderSearch = ''"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></button>
                  </div>
                  <MpButton variant="tertiary" is-rounded @click="soon('New order')">New order</MpButton>
                </div>
              </div>

              <div class="cd-orders">
                <div class="cd-orders-head">
                  <span class="cd-oh-caret" />
                  <span>Order number</span>
                  <span>Date</span>
                  <span>Products</span>
                  <span>Status</span>
                  <span class="cd-oh-num">Amount</span>
                  <span class="cd-oh-num">Balance due</span>
                </div>

                <div v-for="o in filteredOrders" :key="o.id" class="cd-order">
                  <div class="cd-order-head" role="button" tabindex="0" :aria-expanded="expandedOrders.has(o.id)" @click="toggleOrder(o.id)" @keydown.enter="toggleOrder(o.id)" @keydown.space.prevent="toggleOrder(o.id)">
                    <MpIcon name="chevrons-down" size="sm" class="cd-order-caret" :class="{ 'cd-order-caret--open': expandedOrders.has(o.id) }" />
                    <span class="cd-order-num cell-text">{{ o.id }}</span>
                    <span>{{ formatDate(o.date) }}</span>
                    <span class="cd-muted">{{ o.items.length }} {{ o.items.length !== 1 ? 'products' : 'product' }}</span>
                    <span><ErpStatusBadge v-bind="orderBadge(o.status)" /></span>
                    <span class="cd-oh-num">{{ formatIDR(o.amount) }}</span>
                    <span class="cd-oh-num"><span v-if="o.balanceDue" class="cd-owed">{{ formatIDR(o.balanceDue) }}</span><span v-else class="cd-muted">—</span></span>
                  </div>

                  <div v-if="expandedOrders.has(o.id)" class="cd-order-items">
                    <div v-for="(li, i) in o.items" :key="i" class="cd-li">
                      <MpAvatar :id="`cd-li-${o.id}-${i}`" :name="li.name" size="md" variant-color="green" />
                      <div class="cd-li-body">
                        <span class="cd-li-name cell-text">{{ li.name }}</span>
                        <span class="cd-li-sku">{{ li.sku }}</span>
                      </div>
                      <span class="cd-li-qty">{{ li.qty }} {{ li.unit }}</span>
                      <span class="cd-oh-num">{{ formatIDR(li.price) }}</span>
                      <span class="cd-oh-num">{{ formatIDR(li.total) }}</span>
                    </div>
                  </div>
                </div>

                <p v-if="!filteredOrders.length" class="cd-muted cd-orders-empty">No orders yet.</p>
              </div>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>
  </div>

  <div v-else class="cd-missing">
    <MpIcon name="profile" size="lg" />
    <p>Company not found.</p>
    <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push('/crm/customers')">Back to Companies</button>
  </div>
</template>

<style scoped>
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true), .detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

.cd-summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--mp-spacing-6); align-items: stretch; }
.cd-metric { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); padding-right: var(--mp-spacing-6); border-right: 1px solid var(--mp-border-default); min-width: 0; }
.cd-metric:nth-child(4) { border-right: none; }
.cd-metric-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); white-space: nowrap; }
.cd-metric-value { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cd-metric-value--bad { color: var(--mp-text-warning, #b54708); }
.cd-metric-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

.cd-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-5); }
.cd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 860px; }
.cd-section-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-2); }
.cd-muted { color: var(--mp-text-subtle); }
.cd-owed { color: var(--mp-text-warning, #b54708); }

/* Company profile */
.cd-profile { display: flex; align-items: flex-start; gap: var(--mp-spacing-4); max-width: 860px; }
.cd-profile-body { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.cd-profile-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cd-profile-name { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cd-profile-meta { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cd-profile-about { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); max-width: 640px; }

/* Notes */
.cmt-add { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 640px; }
.cmt-add-actions { display: flex; justify-content: flex-end; }
.cmt-list { display: flex; flex-direction: column; gap: var(--mp-spacing-4); margin-top: var(--mp-spacing-4); max-width: 640px; }
.cmt-item { display: flex; gap: var(--mp-spacing-3); }
.cmt-body { flex: 1; min-width: 0; }
.cmt-head { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cmt-author { font-weight: var(--mp-font-weights-semi-bold); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cmt-time { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cmt-del { margin-left: auto; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; border: none; background: transparent; color: var(--mp-text-subtle); cursor: pointer; border-radius: var(--mp-radii-sm); opacity: 0; transition: opacity 0.1s; }
.cmt-item:hover .cmt-del { opacity: 1; }
.cmt-del:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-danger); }
.cmt-text { margin: 2px 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: pre-wrap; overflow-wrap: anywhere; }

/* Filter bar (mirrors ErpTablePage #filters: filter-left / filter-right) */
.cd-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
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

/* Orders accordion */
.cd-orders { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.cd-orders-head, .cd-order-head { display: grid; grid-template-columns: 24px 1.4fr 1fr 1fr 1fr 1fr 1fr; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.cd-orders-head { background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cd-oh-num { text-align: right; font-variant-numeric: tabular-nums; }
.cd-order { border-bottom: 1px solid var(--mp-border-default); }
.cd-order:last-child { border-bottom: none; }
.cd-order-head { cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); user-select: none; }
.cd-order-head:hover { background: var(--mp-background-neutral-subtle); }
.cd-order-caret { color: var(--mp-text-secondary); transition: transform 150ms; }
.cd-order-caret--open { transform: rotate(180deg); }
.cd-order-num { font-weight: var(--mp-font-weights-medium, 500); }
.cd-order-items { background: var(--mp-background-neutral-subtle); border-top: 1px solid var(--mp-border-default); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-3); }
.cd-li { display: grid; grid-template-columns: 40px 1fr 1fr 1fr 1fr; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; }
.cd-li + .cd-li { border-top: 1px solid var(--mp-border-default); }
.cd-li-body { display: flex; flex-direction: column; min-width: 0; }
.cd-li-name { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.cd-li-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cd-li-qty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cd-orders-empty { padding: var(--mp-spacing-6); text-align: center; }

.cd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: 80px; color: var(--mp-text-secondary); }
</style>
