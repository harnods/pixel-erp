<script setup lang="ts">
/**
 * CRM (Qontak) — Customers list (/crm/customers). Full-bleed page (own title bar
 * + filter bar + table), reads from the CRM mini-DB (crm.ts).
 */
import { ref, computed, onMounted } from 'vue'
import { infoToast } from '~/utils/toasts'
import {
  MpIcon, MpSkeleton, MpTooltip, MpSelect,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatIDR } from '~/utils/currency'
import { crmCustomers, deleteCrmCustomer, type CustomerStatus } from '~/data/crm'

function soon(what: string) { infoToast(`${what} — coming soon`) }

// Row actions
function deleteCustomer(id: string, name: string) {
  deleteCrmCustomer(id)
  toast.notify({ variant: 'success', title: `${name} deleted` })
}

// First-load skeleton (ERP guideline: 3 solid rows, ~1.2s).
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// Quick filter: Status (mirrors the ERP index filter-bar pattern, e.g. Bills).
const statusOptions = [
  { label: 'Active',   value: 'active' },
  { label: 'Prospect', value: 'prospect' },
  { label: 'Churned',  value: 'churned' },
]
const statusFilter = ref('')
const statusFilterLabel = computed(() => statusOptions.find((o) => o.value === statusFilter.value)?.label ?? '')

const search = ref('')
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return crmCustomers.filter((c) =>
    (!q || c.company.toLowerCase().includes(q) || c.contact.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    && (!statusFilter.value || c.status === statusFilter.value))
})

// Same ErpStatusBadge (and size) as the other modules — active reads as green,
// prospect as blue, churned as gray.
function statusBadge(s: CustomerStatus): { type?: 'information' | 'announcement'; label: string } {
  if (s === 'prospect') return { type: 'information', label: 'Prospect' }
  if (s === 'churned') return { type: 'announcement', label: 'Churned' }
  return { label: 'Active' }
}
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Customers</h1>
      </div>
      <div class="crm-titlebar__right">
        <button class="crm-btn crm-btn--secondary" type="button" @click="soon('Import customers')">Import</button>
        <button class="crm-btn crm-btn--primary crm-btn--primary-icon" type="button" @click="soon('New customer')">
          <MpIcon name="add" size="sm" /> New customer
        </button>
      </div>
    </header>

    <div class="crm-filter">
      <!-- Left: quick Status filter + All filters (secondary) -->
      <div class="crm-filter__left">
        <MpPopover id="crm-cust-status" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="crm-cust-status-sel"
              placeholder="Status"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '150px' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ statusFilterLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '150px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem v-for="o in statusOptions" :key="o.value" :is-active="o.value === statusFilter" @click="statusFilter = o.value">{{ o.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="crm-btn crm-btn--secondary" type="button" @click="soon('All filters')">
          <MpIcon name="filter" size="sm" /> All filters
        </button>
      </div>

      <!-- Right: Export icon button (left of search) + search -->
      <div class="crm-filter__right">
        <MpTooltip id="crm-cust-export" label="Export" placement="bottom" use-portal>
          <button class="crm-icon-btn" type="button" aria-label="Export" @click="soon('Export')">
            <MpIcon name="download" size="md" />
          </button>
        </MpTooltip>
        <div class="crm-search">
          <MpIcon name="search" size="sm" class="crm-search__ic" />
          <input v-model="search" class="crm-search__input" type="text" placeholder="Search customers…">
        </div>
      </div>
    </div>

    <div class="crm-stage">
      <div class="crm-table-scroll">
        <table class="crm-table">
          <thead>
            <tr>
              <th>Company</th><th>Contact</th><th>Segment</th><th>City</th><th>Owner</th>
              <th class="num">Open deals</th><th class="num">Lifetime value</th><th>Status</th>
              <th class="actions" />
            </tr>
          </thead>
          <tbody v-if="loading">
            <tr v-for="n in 3" :key="`sk-${n}`" class="sk-row">
              <td><MpSkeleton class="crm-skeleton" width="160px" height="14px" rounded="sm" duration="0s" /></td>
              <td><MpSkeleton class="crm-skeleton" width="96px" height="14px" rounded="sm" duration="0s" /></td>
              <td><MpSkeleton class="crm-skeleton" width="80px" height="14px" rounded="sm" duration="0s" /></td>
              <td><MpSkeleton class="crm-skeleton" width="72px" height="14px" rounded="sm" duration="0s" /></td>
              <td><MpSkeleton class="crm-skeleton" width="96px" height="14px" rounded="sm" duration="0s" /></td>
              <td class="num"><MpSkeleton class="crm-skeleton" width="32px" height="14px" rounded="sm" duration="0s" /></td>
              <td class="num"><MpSkeleton class="crm-skeleton" width="96px" height="14px" rounded="sm" duration="0s" /></td>
              <td><MpSkeleton class="crm-skeleton" width="64px" height="18px" rounded="sm" duration="0s" /></td>
              <td class="actions" />
            </tr>
          </tbody>
          <tbody v-else>
            <tr v-for="c in rows" :key="c.id" @click="soon('Customer detail')">
              <td>
                <div class="cell-company">
                  <p class="cell-title">{{ c.company }}</p><p class="cell-sub">{{ c.email }}</p>
                </div>
              </td>
              <td>{{ c.contact }}</td>
              <td>{{ c.segment }}</td>
              <td>{{ c.city }}</td>
              <td>{{ c.owner }}</td>
              <td class="num">{{ c.openDeals }}</td>
              <td class="num">{{ formatIDR(c.lifetimeValue) }}</td>
              <td><ErpStatusBadge :status="c.status" v-bind="statusBadge(c.status)" /></td>
              <td class="actions" @click.stop>
                <MpPopover :id="`crm-cust-actions-${c.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <button class="crm-kebab" type="button" aria-label="More actions"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></button>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <MpPopoverListItem @click="soon('Customer detail')">View details</MpPopoverListItem>
                      <MpPopoverListItem @click="soon('Edit customer')">Edit</MpPopoverListItem>
                      <MpPopoverListItem @click="soon('Archive customer')">Archive</MpPopoverListItem>
                      <MpPopoverListItem @click="deleteCustomer(c.id, c.company)">Delete</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cell-company { display: flex; flex-direction: column; }
.crm-skeleton { background-image: none !important; background-color: var(--mp-border-default) !important; animation: none !important; }
.sk-row { cursor: default; }
.cell-title { margin: 0; color: var(--mp-text-default); }
.cell-sub { margin: 1px 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Export icon button — sits left of the search pill (ERP filter-bar convention) */
.crm-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default);
}
.crm-icon-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
/* Row actions kebab */
.crm-table th.actions, .crm-table td.actions { width: 52px; text-align: right; }
.crm-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-subtle, #6e7a7c);
}
.crm-kebab:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-default); }
/* Primary button ("New customer") — force the + icon white. */
.crm-btn--primary-icon :deep(svg) { color: var(--mp-text-inverse, #fff); }
</style>
