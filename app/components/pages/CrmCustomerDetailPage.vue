<script setup lang="ts">
/**
 * CRM (Qontak) — Customer detail (/crm/customers/:id). Full-bleed page: own title
 * bar (breadcrumb + company + lifecycle) then in-page tabs (Overview · Deals).
 * The Deals tab is reachable directly via ?tab=deals (from the list's Deals link).
 */
import { ref, computed, watch } from 'vue'
import { MpIcon, MpInputTag, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, type DataInterface } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate, formatDateLong } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { getCrmCustomer, lifecycleOf, customerDeals, setCustomerSegments, type LifecycleStage } from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()

function soon(what: string) { infoToast(`${what} — coming soon`) }

const customer = computed(() => getCrmCustomer(props.orderId))
const deals = computed(() => (customer.value ? customerDeals(customer.value) : []))

// Editable Segments (tags) — writes straight through to the CRM store.
const segTags = computed<DataInterface[]>(() =>
  (customer.value?.segments ?? []).map((s) => ({ id: s, label: s, value: s } as unknown as DataInterface)))
function onSegChange(data: DataInterface[]) {
  if (!customer.value) return
  const tags = data.map((d) => String((d as { label?: string; value?: string }).label ?? (d as { value?: string }).value ?? '')).filter(Boolean)
  setCustomerSegments(customer.value.id, tags)
}

const tab = ref<'overview' | 'deals'>(route.query.tab === 'deals' ? 'deals' : 'overview')
watch(() => route.query.tab, (v) => { tab.value = v === 'deals' ? 'deals' : 'overview' })
function setTab(t: 'overview' | 'deals') { tab.value = t; router.replace({ query: t === 'deals' ? { tab: 'deals' } : {} }) }

function lifecycleBadge(lc: LifecycleStage) {
  if (lc === 'Customer') return { status: 'active', label: 'Customer' }
  if (lc === 'Opportunity') return { status: 'prospect', type: 'information' as const, label: 'Opportunity' }
  if (lc === 'Lead') return { status: 'prospect', type: 'announcement' as const, label: 'Lead' }
  return { status: 'churned', type: 'announcement' as const, label: 'Former customer' }
}
function stageBadge(stage: string) {
  if (stage === 'Negotiation' || stage === 'Proposal sent') return { status: 'prospect', type: 'information' as const, label: stage }
  return { status: 'prospect', type: 'announcement' as const, label: stage }
}
</script>

<template>
  <div class="crm" v-if="customer">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left cd-titleblock">
        <button class="cd-breadcrumb" type="button" @click="router.push('/crm/customers')">Customers</button>
        <div class="cd-titlerow">
          <h1 class="crm-title">{{ customer.company }}</h1>
          <ErpStatusBadge v-bind="lifecycleBadge(lifecycleOf(customer))" />
        </div>
      </div>
      <div class="crm-titlebar__right">
        <button class="crm-btn crm-btn--secondary" type="button" @click="soon('Edit customer')">Edit</button>
        <MpPopover id="cd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="crm-btn crm-btn--secondary" type="button">Actions</button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px' })">
            <MpPopoverList>
              <MpPopoverListItem @click="soon('New deal')">New deal</MpPopoverListItem>
              <MpPopoverListItem @click="soon('Log activity')">Log activity</MpPopoverListItem>
              <MpPopoverListItem @click="soon('Delete customer')">Delete</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <!-- Tabs -->
    <nav class="cd-tabs">
      <button class="cd-tab" :class="{ 'is-active': tab === 'overview' }" type="button" @click="setTab('overview')">Overview</button>
      <button class="cd-tab" :class="{ 'is-active': tab === 'deals' }" type="button" @click="setTab('deals')">
        Deals <span class="cd-tab-count">{{ customer.openDeals }}</span>
      </button>
    </nav>

    <div class="crm-stage cd-stage">
      <!-- ── Overview ── -->
      <template v-if="tab === 'overview'">
        <div class="cd-metrics">
          <div class="cd-metric"><span class="cd-metric-label">In flight</span><span class="cd-metric-value">{{ formatIDR(customer.inFlight) }}</span></div>
          <div class="cd-metric"><span class="cd-metric-label">Outstanding</span><span class="cd-metric-value" :class="{ 'cc-owed': customer.outstanding }">{{ customer.outstanding ? formatIDR(customer.outstanding) : '—' }}</span></div>
          <div class="cd-metric"><span class="cd-metric-label">Billed</span><span class="cd-metric-value">{{ formatIDR(customer.lifetimeValue) }}</span></div>
          <div class="cd-metric"><span class="cd-metric-label">Open deals</span><span class="cd-metric-value">{{ customer.openDeals }}</span></div>
        </div>

        <section class="cd-card">
          <h2 class="cd-card-title">Company details</h2>
          <dl class="cd-details">
            <div><dt>Primary contact</dt><dd>{{ customer.contact }}</dd></div>
            <div><dt>Email</dt><dd>{{ customer.email }}</dd></div>
            <div><dt>Phone</dt><dd>{{ customer.phone }}</dd></div>
            <div><dt>Contact owner</dt><dd>{{ customer.owner }}</dd></div>
            <div><dt>City</dt><dd>{{ customer.city }}</dd></div>
            <div><dt>Last activity</dt><dd>{{ formatDateLong(customer.lastActivity) }}</dd></div>
            <div class="cd-seg-field"><dt>Segments</dt><dd><MpInputTag id="cd-segments" :data="segTags" :is-enable-create-new-tag="true" :is-show-suggestions="false" placeholder="+ Add segment" @change="onSegChange" /></dd></div>
          </dl>
        </section>
      </template>

      <!-- ── Deals ── -->
      <template v-else>
        <div v-if="deals.length" class="cd-table-wrap">
          <table class="cd-table">
            <thead><tr><th>Deal</th><th>Stage</th><th class="num">Value</th><th>Close date</th><th>Owner</th></tr></thead>
            <tbody>
              <tr v-for="d in deals" :key="d.id">
                <td>{{ d.name }}</td>
                <td><ErpStatusBadge v-bind="stageBadge(d.stage)" /></td>
                <td class="num">{{ formatIDR(d.value) }}</td>
                <td>{{ formatDate(d.closeDate) }}</td>
                <td>{{ d.owner }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="cd-empty">
          <img :src="'/illustrations/empty-folder.png'" alt="" class="cd-empty-illustration" width="220" height="184" />
          <p class="cd-empty-title">No open deals</p>
          <p class="cd-empty-desc">Deals for this customer will appear here.</p>
        </div>
      </template>
    </div>
  </div>

  <div v-else class="cd-missing">
    <MpIcon name="profile" size="lg" />
    <p>Customer not found.</p>
    <button class="crm-btn crm-btn--secondary" type="button" @click="router.push('/crm/customers')">Back to Customers</button>
  </div>
</template>

<style scoped>
.cd-titleblock { flex-direction: column !important; align-items: flex-start !important; gap: 0 !important; }
.cd-seg-field { grid-column: 1 / -1; }
.cd-seg-field dd { margin-top: 2px; }
.cd-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md, 20px); }
.cd-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cd-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-2); }

/* Tabs */
.cd-tabs { flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-5); padding: 0 var(--mp-spacing-6); background: var(--mp-background-neutral-subtle); }
.cd-tab { position: relative; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-3) 0; display: inline-flex; align-items: center; gap: 6px; }
.cd-tab:not(.is-active):hover { color: var(--mp-text-default); }
.cd-tab.is-active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.cd-tab.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--mp-text-selected); border-radius: var(--mp-radii-sm, 2px) var(--mp-radii-sm, 2px) 0 0; }
.cd-tab-count { font-size: 11px; font-weight: 600; color: var(--mp-text-secondary); background: var(--mp-background-neutral, #eceef0); border-radius: 999px; padding: 1px 7px; }

.cd-stage { padding: var(--mp-spacing-6); }

/* Overview */
.cd-metrics { display: flex; gap: var(--mp-spacing-6); margin-bottom: var(--mp-spacing-6); }
.cd-metric { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding: 16px; border: 1px solid var(--mp-border-default, #e6e8ec); border-radius: 10px; }
.cd-metric-label { font-size: 13px; color: var(--mp-text-secondary); }
.cd-metric-value { font-size: 20px; font-weight: 600; color: var(--mp-text-default); }
.cc-owed { color: var(--mp-text-warning, #b54708); }
.cd-card { max-width: 720px; border: 1px solid var(--mp-border-default, #e6e8ec); border-radius: 10px; padding: 20px; }
.cd-card-title { margin: 0 0 12px; font-size: 16px; font-weight: 600; color: var(--mp-text-default); }
.cd-details { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 32px; }
.cd-details > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cd-details dt { font-size: 12px; color: var(--mp-text-secondary); }
.cd-details dd { margin: 0; font-size: 14px; color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; }

/* Deals table */
.cd-table-wrap { border: 1px solid var(--mp-border-default, #e6e8ec); border-radius: 10px; overflow: hidden; }
.cd-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.cd-table th { text-align: left; padding: 10px 16px; background: var(--mp-background-neutral-subtle, #f4f5f7); border-bottom: 1px solid var(--mp-border-default, #e6e8ec); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--mp-text-secondary); }
.cd-table td { padding: 12px 16px; border-bottom: 1px solid var(--mp-border-subtle, #f0f1f3); color: var(--mp-text-default); }
.cd-table tr:last-child td { border-bottom: none; }
.cd-table .num { text-align: right; }

.cd-empty { display: flex; flex-direction: column; align-items: center; padding: 48px; }
.cd-empty-illustration { width: 220px; height: 184px; object-fit: contain; }
.cd-empty-title { margin: 8px 0 0; font-size: 16px; font-weight: 600; color: var(--mp-text-default); }
.cd-empty-desc { margin: 2px 0 0; font-size: 14px; color: var(--mp-text-secondary); }

.cd-missing { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 80px; color: var(--mp-text-secondary); }
</style>
