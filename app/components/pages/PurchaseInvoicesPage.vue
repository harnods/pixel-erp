<script setup lang="ts">
import { type Ref } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { purchaseInvoices } from '~/data'
import type { PurchaseInvoice } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')
const aireneOpen = inject<Ref<boolean>>('aireneOpen')

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'date',       label: 'Date',       width: '120px'                                  },
  { key: 'number',     label: 'Number',     width: '200px', sortable: true                  },
  { key: 'attachment', label: '',           width: '40px',  noHeader: true, align: 'center' },
  { key: 'vendorName', label: 'Vendor',     width: '240px', sortable: true                  },
  { key: 'dueDate',    label: 'Due date',   width: '108px'                                  },
  { key: 'status',     label: 'Status',     width: '160px'                                  },
  { key: 'amount',     label: 'Amount',     width: '160px', align: 'right', sortable: true  },
  { key: 'tags',       label: 'Tags',       width: '160px'                                  },
]

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = PurchaseInvoice & {
  vendorName: string
  attachment: boolean
  overdueLabel: string | null
}

// ─── Flatten + enrich ─────────────────────────────────────────────────────────

const rows = computed<Row[]>(() =>
  purchaseInvoices.map(inv => {
    const overdueLabel = inv.status === 'overdue'
      ? (() => {
          const days = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86_400_000)
          return days > 0 ? `${days} day${days !== 1 ? 's' : ''}` : null
        })()
      : null

    return {
      ...inv,
      vendorName: inv.vendor.name,
      attachment: inv.hasAttachment ?? false,
      overdueLabel,
    }
  })
)

// ─── Table state ──────────────────────────────────────────────────────────────

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  filterFn: (row: Row, s, status) =>
    (row.number.toLowerCase().includes(s) || row.vendorName.toLowerCase().includes(s)) &&
    (!status || row.status === status),
})

// ─── Filter options ───────────────────────────────────────────────────────────

const statusOptions = [
  { label: 'All status', value: ''        },
  { label: 'Paid',       value: 'paid'    },
  { label: 'Open',       value: 'open'    },
  { label: 'Overdue',    value: 'overdue' },
]

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    has-checkbox
    has-ai-chat
    :context-label="(row) => `Purchase Invoice · ${row.number}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >

    <!-- ── Stats section ── -->
    <template #stats>
      <div class="stats-section">

        <!-- Card 1: Overdue -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">Overdue</div>
          <div class="stat-period">As of today</div>
          <div class="stat-amount stat-amount--danger">Rp73.200.000,00</div>
          <a class="stat-link">4 invoices</a>
          <div class="stat-ai-banner">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="stat-ai-icon">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
            <span>PT Teknindo Nusantara is 13 days overdue. Schedule a payment now?</span>
          </div>
        </div>

        <!-- Card 2: Unpaid -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">Unpaid</div>
          <div class="stat-period">As of today</div>
          <div class="stat-amount">Rp602.150.000,00</div>
          <a class="stat-link">12 invoices</a>
          <div class="stat-ai-banner">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="stat-ai-icon">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
            <span>12 vendors are awaiting payment. The oldest is 18 days past due. Review now?</span>
          </div>
        </div>

        <!-- Card 3: Payment made -->
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">Payment made</div>
          <div class="stat-period">Last 30 days</div>
          <div class="stat-amount">Rp72.050.000,00</div>
          <a class="stat-link">7 invoices</a>
          <div class="stat-ai-banner">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="stat-ai-icon">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
            <span>Payment to <strong>PT Dinamika Usaha Bersama</strong> processed. Reconcile now?</span>
          </div>
        </div>

        <!-- Card 4: Upcoming due — hidden when Airene panel is open -->
        <div v-if="!aireneOpen" class="stat-card">
          <div class="stat-title">Due this week</div>
          <div class="stat-period">Next 7 days</div>
          <div class="stat-amount">Rp245.000.000,00</div>
          <a class="stat-link">5 invoices</a>
          <div class="stat-ai-banner">
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="stat-ai-icon">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
            <span>Rp145M due to <strong>PT Karya Cipta Mandiri</strong> on 18/05. Approve payment?</span>
          </div>
        </div>

      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Status select + All filters -->
      <div class="filter-left">
        <div class="filter-select-wrap">
          <select class="filter-select" v-model="statusFilter">
            <option value="">Status</option>
            <option v-for="opt in statusOptions.slice(1)" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <svg class="filter-select-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>

        <button class="filter-all-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          All filters
        </button>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
          </button>
          <!-- Column settings -->
          <button class="filter-icon-btn" aria-label="Column settings">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M6.97345 1.26335C7.1777 1.25434 7.38659 1.25 7.6 1.25H12.4C12.6134 1.25 12.8223 1.25434 13.0265 1.26335C13.0315 1.26352 13.0365 1.26374 13.0415 1.26401C14.8152 1.34425 16.2378 1.77715 17.2303 2.76967C18.3398 3.87914 18.75 5.52603 18.75 7.6V12.4C18.75 14.474 18.3398 16.1209 17.2303 17.2303C16.2378 18.2229 14.8152 18.6558 13.0415 18.736C13.0365 18.7363 13.0316 18.7365 13.0266 18.7367C12.8223 18.7457 12.6134 18.75 12.4 18.75H7.6C7.38658 18.75 7.17769 18.7457 6.97344 18.7367C6.96845 18.7365 6.96347 18.7363 6.95851 18.736C5.1848 18.6557 3.76219 18.2228 2.76967 17.2303C1.6602 16.1209 1.25 14.474 1.25 12.4V7.6C1.25 5.52603 1.6602 3.87914 2.76967 2.76967C3.76219 1.77715 5.18479 1.34425 6.9585 1.26401C6.96347 1.26374 6.96845 1.26352 6.97345 1.26335ZM6.25 2.82736C5.10607 2.97282 4.34147 3.31919 3.83033 3.83033C3.1398 4.52086 2.75 5.67397 2.75 7.6V12.4C2.75 14.326 3.1398 15.4791 3.83033 16.1697C4.34147 16.6808 5.10607 17.0272 6.25 17.1726V2.82736ZM7.75 17.25V2.75H12.25V17.25H7.75ZM13.75 17.1726C14.8939 17.0272 15.6585 16.6808 16.1697 16.1697C16.8602 15.4791 17.25 14.326 17.25 12.4V7.6C17.25 5.67397 16.8602 4.52086 16.1697 3.83033C15.6585 3.31919 14.8939 2.97282 13.75 2.82736V17.1726Z" fill="currentColor"/>
            </svg>
          </button>
          <!-- Export -->
          <button class="filter-icon-btn" aria-label="Export">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M9.46959 1.46967C9.76249 1.17678 10.2374 1.17678 10.5303 1.46967L13.2103 4.14967C13.5031 4.44256 13.5031 4.91744 13.2103 5.21033C12.9174 5.50322 12.4425 5.50322 12.1496 5.21033L10.7499 3.81066L10.7499 14C10.7499 14.4142 10.4141 14.75 9.99992 14.75C9.58571 14.75 9.24992 14.4142 9.24992 14L9.24992 3.81066L7.85025 5.21033C7.55736 5.50322 7.08249 5.50322 6.78959 5.21033C6.4967 4.91744 6.4967 4.44256 6.78959 4.14967L9.46959 1.46967ZM6.74991 7.59397C6.75618 8.00814 6.42551 8.34896 6.01134 8.35523C4.89312 8.37214 4.40103 8.44902 4.04508 8.63928C3.61773 8.8677 3.26772 9.21772 3.03929 9.64507C2.91834 9.87135 2.83764 10.1672 2.79453 10.674C2.75063 11.1901 2.75 11.8532 2.75 12.8C2.75 13.338 2.75031 14.0116 2.79529 14.6356C2.81773 14.947 2.85042 15.232 2.89613 15.4717C2.94371 15.7212 2.99719 15.8761 3.03929 15.9549C3.26772 16.3823 3.61773 16.7323 4.04508 16.9607C4.27137 17.0816 4.56722 17.1623 5.07403 17.2055C5.59016 17.2494 6.25324 17.25 7.2 17.25H12.8C13.7468 17.25 14.4098 17.2494 14.926 17.2055C15.4328 17.1623 15.7286 17.0816 15.9549 16.9607C16.3823 16.7323 16.7323 16.3823 16.9607 15.9549C17.0028 15.8761 17.0563 15.7212 17.1039 15.4717C17.1496 15.232 17.1823 14.947 17.2047 14.6356C17.2497 14.0116 17.25 13.338 17.25 12.8C17.25 11.8532 17.2494 11.1901 17.2055 10.674C17.1624 10.1672 17.0817 9.87135 16.9607 9.64507C16.7323 9.21772 16.3823 8.8677 15.9549 8.63928C15.599 8.44902 15.1069 8.37214 13.9887 8.35523C13.5745 8.34896 13.2438 8.00814 13.2501 7.59397C13.2564 7.17981 13.5972 6.84914 14.0113 6.8554C15.1044 6.87193 15.9457 6.93351 16.662 7.3164C17.351 7.68467 17.9153 8.24898 18.2836 8.93797C18.5405 9.41859 18.6487 9.94312 18.7001 10.5469C18.75 11.1341 18.75 11.861 18.75 12.7662V12.81C18.75 13.3388 18.75 14.0612 18.7008 14.7434C18.676 15.0874 18.6379 15.4351 18.5773 15.7527C18.5186 16.0605 18.4304 16.3873 18.2836 16.662C17.9153 17.351 17.351 17.9153 16.662 18.2836C16.1814 18.5405 15.6569 18.6487 15.0531 18.7001C14.4659 18.75 13.7389 18.75 12.8337 18.75H7.16634C6.26106 18.75 5.53409 18.75 4.9469 18.7001C4.34314 18.6487 3.81861 18.5405 3.33798 18.2836C2.64899 17.9153 2.08468 17.351 1.71641 16.662C1.56958 16.3873 1.48138 16.0605 1.42268 15.7527C1.36213 15.4351 1.32396 15.0874 1.29917 14.7434C1.25 14.0612 1.25 13.3388 1.25 12.81L1.25 12.7663C1.24999 11.861 1.24999 11.1341 1.29993 10.5469C1.35129 9.94312 1.45951 9.41859 1.71641 8.93797C2.08468 8.24898 2.64899 7.68467 3.33798 7.3164C4.05432 6.93351 4.89561 6.87193 5.98866 6.8554C6.40282 6.84914 6.74365 7.17981 6.74991 7.59397Z" fill="currentColor"/>
            </svg>
          </button>
        </div>

        <!-- Pill search -->
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            placeholder="Search..."
          />
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number ── -->
    <template #cell-number="{ value }">
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <button class="row-hover-btn" @click.stop>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Cell: Attachment icon ── -->
    <template #cell-attachment="{ value }">
      <MpIcon v-if="value" name="attachment" size="sm" class="attachment-icon" />
      <span v-else />
    </template>

    <!-- ── Cell: Vendor ── -->
    <template #cell-vendorName="{ value }">
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <button class="row-hover-btn" @click.stop>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.2"/>
            <path d="M4.5 1.5v9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <span class="row-hover-btn__label">OPEN PREVIEW</span>
        </button>
      </div>
    </template>

    <!-- ── Cell: Due Date ── -->
    <template #cell-dueDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ row, value }">
      <div class="status-cell">
        <ErpStatusBadge :status="value as string" />
        <span v-if="(row as Row).overdueLabel" class="status-sub-label">
          {{ (row as Row).overdueLabel }}
        </span>
      </div>
    </template>

    <!-- ── Cell: Amount ── -->
    <template #cell-amount="{ value }">
      {{ formatIDR(value as number) }}
    </template>

    <!-- ── Cell: Tags ── -->
    <template #cell-tags="{ value }">
      <div v-if="(value as string[])?.length" class="tags-cell">
        <span v-for="tag in (value as string[])" :key="tag" class="erp-tag">{{ tag }}</span>
      </div>
    </template>

    <!-- ── Actions ── -->
    <template #actions>
      <button class="row-kebab" aria-label="More actions">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>
    </template>

  </ErpTablePage>
</template>

<style scoped>
/* ── Stats section ──────────────────────────────────────────────────────── */

.stats-section {
  display: flex;
  gap: var(--mp-spacing-6);
  align-items: flex-start;
}

.stat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
  align-self: stretch;
}

.stat-card--bordered {
  border-right: 1px solid var(--mp-border-default);
}

.stat-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}

.stat-period {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap;
}

.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-2xl, 32px);
  white-space: nowrap;
}

.stat-amount--danger {
  color: var(--mp-text-danger);
}

.stat-link {
  display: inline-flex;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-md);
  text-decoration: none;
  cursor: pointer;
  padding: 0 var(--mp-spacing-0\.5);
}

.stat-ai-banner {
  display: flex;
  gap: var(--mp-spacing-3);
  align-items: flex-start;
  background: var(--mp-airene-banner-bg);
  border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
}

.stat-ai-icon {
  flex-shrink: 0;
  margin-top: var(--mp-spacing-0\.5);
  color: var(--mp-airene-default);
}

.stat-ai-banner span {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-airene-banner-text);
  flex: 1;
  min-width: 0;
}

.stat-ai-banner strong {
  font-weight: var(--mp-font-weights-regular);
}

/* Cell with hover action button */
.cell-with-action {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.row-hover-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  white-space: nowrap;
  line-height: 1;
}

.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-normal);
}

:global(.erp-tr:hover .row-hover-btn) {
  display: flex;
}

/* Attachment icon */
.attachment-icon {
  color: var(--mp-text-subtle);
}

/* Status cell */
.status-cell {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mp-spacing-0\.5);
  white-space: normal;
  width: fit-content;
}

.status-sub-label {
  font-size: var(--mp-font-sizes-xs, 11px);
  line-height: var(--mp-line-heights-xs);
  color: var(--mp-text-danger);
  padding-left: var(--mp-spacing-1\.5);
}

/* Tags */
.tags-cell {
  display: flex;
  gap: var(--mp-spacing-1);
  flex-wrap: wrap;
}

.erp-tag {
  display: inline-flex;
  align-items: center;
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-md);
  padding: 0 var(--mp-spacing-1\.5);
  max-height: var(--mp-sizes-5, 20px);
  border-radius: var(--mp-radii-sm);
  white-space: nowrap;
}

/* Row action kebab button */
.row-kebab {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-subtle);
}
.row-kebab:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* ── Filter bar ─────────────────────────────────────────────────────────── */

.filter-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
}

.filter-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

.filter-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 160px;
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}

.filter-select {
  appearance: none;
  background: transparent;
  border: none;
  outline: none;
  width: 100%;
  padding: var(--mp-spacing-2) var(--mp-spacing-9) var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-placeholder);
  cursor: pointer;
}

.filter-select:focus { outline: none; }

.filter-select-chevron {
  position: absolute;
  right: var(--mp-spacing-2);
  pointer-events: none;
  color: var(--mp-text-default);
  width: var(--mp-sizes-5, 20px);
  height: var(--mp-sizes-5, 20px);
}

.filter-all-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }

.filter-btn-group {
  display: flex;
  align-items: center;
}

.filter-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2);
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}

.filter-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
</style>
