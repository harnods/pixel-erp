<script setup lang="ts">
/**
 * XpmTripsPage · XPM (Mekari Expense) business travel index.
 *
 * Built on the shared ErpTablePage + useTableState pattern. No section tabs —
 * `xpmTrips` is shown whole, narrowed by two filter-bar selects (trip type +
 * booking status). The title-bar "Travel policy" secondary button reaches the
 * page through the useXpmActions bus, which opens the read-only policy drawer.
 */
import {
  MpIcon, MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFlex, MpText, MpButton, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { xpmTrips, xpmBadgeType, type XpmTrip } from '~/data/xpm'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { useXpmActions } from '~/composables/useXpmActions'

const router = useRouter()

const rows = computed<XpmTrip[]>(() => xpmTrips)

// ── Filter bar ──
const typeOptions = ['Domestic', 'International']
const statusOptions = ['Booking pending', 'Booked', 'Trip done', 'Completed']
const searchPlaceholder = 'Search employee name…'
const typeFilter = ref('')

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  perPage: 25,
  filterFn: (row, s, st) =>
    row.requestBy.toLowerCase().includes(s) &&
    (!st || row.bookingStatus.startsWith(st)) &&
    (!typeFilter.value || row.tripType === typeFilter.value),
})

// typeFilter isn't watched by useTableState · reset to page 1 when it changes.
watch(typeFilter, () => setPage(1))

const columns: TableColumn[] = [
  { key: 'name',          label: 'Trip name',      kind: 'name' },
  { key: 'requestBy',     label: 'Request by',     kind: 'name' },
  { key: 'destination',   label: 'Destination'      },
  { key: 'requestDate',   label: 'Request date',   kind: 'date', sortable: true, sortType: 'date' },
  { key: 'tripDate',      label: 'Trip date',      kind: 'date', sortable: true, sortType: 'date' },
  { key: 'bookingStatus', label: 'Booking status', kind: 'status' },
]

/** Split "Trip done · awaiting report" → badge label + secondary suffix. */
function statusParts(status: string) {
  const idx = status.indexOf(' · ')
  if (idx === -1) return { label: status, suffix: '' }
  return { label: status.slice(0, idx), suffix: status.slice(idx + 3) }
}

// ── Travel policy drawer ──
const showPolicyDrawer = ref(false)
const { pending } = useXpmActions()
watch(() => pending.value, (p) => { if (p?.action === 'travelPolicy') showPolicyDrawer.value = true })

const policyRows = [
  { label: 'Booking window',   value: 'Trips must be booked at least 3 days before departure.' },
  { label: 'Cabin class cap',  value: 'Economy for flights under 6 hours; Premium economy beyond.' },
  { label: 'Hotel nightly cap', value: 'Rp1.500.000 per night domestic; USD 180 international.' },
]
const perDiemRows = [
  { zone: 'Zone 1 · Jabodetabek',   rate: 'Rp350.000/day' },
  { zone: 'Zone 2 · Java',          rate: 'Rp300.000/day' },
  { zone: 'Zone 3 · Outer islands', rate: 'Rp400.000/day' },
  { zone: 'Zone 4 · International',  rate: 'USD 75/day' },
]

function closeDrawer() { showPolicyDrawer.value = false }
function savePolicy() {
  closeDrawer()
  toast.notify({ variant: 'success', title: 'Policy saved.', maxWidth: 'max-content' })
}
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="paginated"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :has-active-search="!!search"
    :has-active-filter="!!statusFilter || !!typeFilter"
    :search="search"
    filter-empty-label="trip"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <div class="filter-select-wrap">
          <select class="filter-select" v-model="typeFilter">
            <option value="">Trip type</option>
            <option v-for="o in typeOptions" :key="o" :value="o">{{ o }}</option>
          </select>
          <svg class="filter-select-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="filter-select-wrap">
          <select class="filter-select" v-model="statusFilter">
            <option value="">Status</option>
            <option v-for="o in statusOptions" :key="o" :value="o">{{ o }}</option>
          </select>
          <svg class="filter-select-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <button class="filter-all-btn"><MpIcon name="filter" size="md" /> All filters</button>
      </div>
      <div class="filter-right">
        <div class="filter-btn-group">
          <button class="filter-icon-btn" aria-label="Export" @click="infoToast('Export · coming soon')"><MpIcon name="download" size="md" /></button>
        </div>
        <div class="filter-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="searchPlaceholder" />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>
    </template>

    <!-- ── Cells ── -->
    <template #cell-name="{ row }">
      <div class="stack-cell">
        <span class="cell-link" @click="router.push(`/xpm-trips/${(row as XpmTrip).code}`)">{{ (row as XpmTrip).name }}</span>
        <span class="stack-cell__sub">{{ (row as XpmTrip).code }}</span>
      </div>
    </template>
    <template #cell-requestDate="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-tripDate="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-bookingStatus="{ row }">
      <div class="stack-cell">
        <ErpStatusBadge :status="statusParts((row as XpmTrip).bookingStatus).label" :label="statusParts((row as XpmTrip).bookingStatus).label" :type="xpmBadgeType(statusParts((row as XpmTrip).bookingStatus).label)" />
        <span v-if="statusParts((row as XpmTrip).bookingStatus).suffix" class="stack-cell__sub">{{ statusParts((row as XpmTrip).bookingStatus).suffix }}</span>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Travel policy drawer ── -->
  <MpDrawer :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="xpm-travel-policy-drawer"
    :is-open="showPolicyDrawer"
    placement="right"
    size="md"
    variant="floating"
    :is-keep-alive="false"
    @close="closeDrawer"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="xd-card">
          <div class="xd-header">
            <MpText weight="semiBold">Travel policy</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeDrawer" />
          </div>
          <div class="xd-form">
            <div v-for="r in policyRows" :key="r.label" class="policy-row">
              <span class="policy-row__label">{{ r.label }}</span>
              <span class="policy-row__value">{{ r.value }}</span>
            </div>

            <div class="policy-row">
              <span class="policy-row__label">Per-diem rates by zone</span>
              <MpFlex direction="column" gap="2">
                <div v-for="p in perDiemRows" :key="p.zone" class="perdiem-item">
                  <span class="perdiem-item__zone">{{ p.zone }}</span>
                  <span class="perdiem-item__rate">{{ p.rate }}</span>
                </div>
              </MpFlex>
            </div>
          </div>
          <div class="xd-footer">
            <MpButton variant="ghost" is-rounded @click="closeDrawer">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="savePolicy">Save policy</MpButton>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* ── Stacked cell (name + code / status + suffix) ── */
.stack-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); align-items: flex-start; }
.stack-cell__sub { font-size: 12px; color: var(--mp-text-secondary); }

/* ── Drawer (floating card) ── */
.xd-card { display: flex; flex-direction: column; height: 100%; }
.xd-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
}
.xd-form {
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
  flex: 1; overflow-y: auto;
  padding: var(--mp-spacing-4);
}
.xd-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.policy-row { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.policy-row__label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.policy-row__value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.perdiem-item { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); }
.perdiem-item__zone { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.perdiem-item__rate { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }

/* ── Filter bar (verbatim ERP block) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-select-wrap { position: relative; display: inline-flex; align-items: center; width: 160px; height: var(--mp-sizes-9\.5, 38px); background: var(--mp-colors-background-neutral, #fff); border: 1px solid var(--mp-colors-border-form, #1d1f2429); border-radius: var(--mp-radii-md); }
.filter-select { appearance: none; background: transparent; border: none; outline: none; width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); cursor: pointer; }
.filter-select-chevron { position: absolute; right: var(--mp-spacing-2); pointer-events: none; color: var(--mp-text-default); width: 20px; height: 20px; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }
</style>
