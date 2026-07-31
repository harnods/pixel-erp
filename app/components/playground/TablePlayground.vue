<script setup lang="ts">
/**
 * TablePlayground — live ErpTablePage with toggleable props.
 */
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'

// ── Controls ──────────────────────────────────────────────────────────────
const hasCheckbox = ref(true)
const showActions = ref(true)
const hasAiChat   = ref(false)
const stickyTotal = ref(false)
const wide        = ref(false)
const empty       = ref(false)
const rowCount    = ref(23)

// ── Demo data ───────────────────────────────────────────────────────────────
const STATUSES  = ['paid', 'open', 'overdue', 'pending', 'draft', 'voided']
const CUSTOMERS = ['PT Sumber Makmur', 'CV Maju Jaya', 'Toko Berkah', 'PT Karya Cipta', 'UD Sentosa', 'PT Dinamika Usaha']

interface DemoRow {
  id: string
  date: string
  number: string
  customer: string
  region: string
  channel: string
  owner: string
  status: string
  total: number
  tags: string[]
}

function makeRows(n: number): DemoRow[] {
  const out: DemoRow[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(2026, 0, 1 + i)
    out.push({
      id: 'R' + i,
      date: d.toISOString().slice(0, 10),
      number: 'SO-2026-' + String(i + 1).padStart(3, '0'),
      customer: CUSTOMERS[i % CUSTOMERS.length],
      region: ['Jakarta', 'Surabaya', 'Bandung'][i % 3],
      channel: ['Direct', 'Reseller', 'Online'][i % 3],
      owner: ['Andi', 'Budi', 'Citra'][i % 3],
      status: STATUSES[i % STATUSES.length],
      total: (i + 1) * 1_250_000,
      tags: i % 3 === 0 ? ['Retail'] : i % 3 === 1 ? ['B2B', 'VIP'] : [],
    })
  }
  return out
}

const allRows = computed<DemoRow[]>(() => (empty.value ? [] : makeRows(rowCount.value)))

const columns = computed<TableColumn[]>(() => {
  const cols: TableColumn[] = [
    { key: 'date',     label: 'Date',     width: '120px' },
    { key: 'number',   label: 'Number',   width: '180px', sortable: true },
    { key: 'customer', label: 'Customer', width: '220px', sortable: true },
  ]
  if (wide.value) {
    cols.push(
      { key: 'region',  label: 'Region',  width: '160px' },
      { key: 'channel', label: 'Channel', width: '160px' },
      { key: 'owner',   label: 'Owner',   width: '160px' },
    )
  }
  cols.push(
    { key: 'status', label: 'Status', width: '160px' },
    { key: 'total',  label: 'Total',  width: '160px', align: 'right', sortable: true, isFixed: stickyTotal.value },
    { key: 'tags',   label: 'Tags',   width: '160px' },
  )
  return cols
})

// ── Table state (search / status filter / sort / pagination) ─────────────────
const {
  search, statusFilter, paginated, total, currentPage, perPage,
  sortKey, sortDir, setPage, setPerPage, toggleSort,
} = useTableState<DemoRow>(allRows, {
  perPage: 10,
  filterFn: (row, s, status) =>
    (row.number.toLowerCase().includes(s) || row.customer.toLowerCase().includes(s)) &&
    (!status || row.status === status),
})

const statusOptions = ['paid', 'open', 'overdue', 'pending', 'draft', 'voided']

// ── Formatters ───────────────────────────────────────────────────────────────
function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}
function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
</script>

<template>
  <div class="pg-grid">

    <!-- ── Control panel ── -->
    <aside class="panel">
      <p class="panel-title">Props</p>

      <label class="ctrl"><input type="checkbox" v-model="hasCheckbox" /> <code>has-checkbox</code></label>
      <label class="ctrl"><input type="checkbox" v-model="showActions" /> <code>#actions</code> (sticky)</label>
      <label class="ctrl"><input type="checkbox" v-model="hasAiChat" /> <code>has-ai-chat</code></label>
      <label class="ctrl"><input type="checkbox" v-model="stickyTotal" /> <code>isFixed</code> on Total</label>
      <label class="ctrl"><input type="checkbox" v-model="wide" /> Wide (extra cols → h-scroll)</label>
      <label class="ctrl"><input type="checkbox" v-model="empty" /> Empty state</label>

      <p class="panel-title">Data</p>
      <label class="ctrl ctrl--col">
        <span>Rows: <strong>{{ rowCount }}</strong></span>
        <input type="range" min="0" max="60" v-model.number="rowCount" :disabled="empty" />
      </label>
      <label class="ctrl ctrl--col">
        <span>Rows per page</span>
        <select :value="perPage" @change="setPerPage(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="n in [10, 25, 50, 100]" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>

      <p class="panel-note">
        Tip: enable <strong>Wide</strong> + <strong>isFixed</strong>/<strong>#actions</strong>,
        then scroll the table horizontally to see sticky columns.
      </p>
    </aside>

    <!-- ── Live preview ── -->
    <section class="preview">
      <ErpTablePage
        :columns="columns"
        :rows="(paginated as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :has-checkbox="hasCheckbox"
        :has-ai-chat="hasAiChat"
        :context-label="(row) => `Order · ${row.number}`"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
      >
        <template #filters>
          <div class="f-left">
            <select class="f-select" v-model="statusFilter">
              <option value="">All status</option>
              <option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
          <div class="f-right">
            <input v-model="search" class="f-search" type="text" placeholder="Search..." />
          </div>
        </template>

        <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>

        <template #cell-status="{ value }">
          <ErpStatusBadge :status="value as string" />
        </template>

        <template #cell-total="{ value }">{{ formatIDR(value as number) }}</template>

        <template #cell-tags="{ value }">
          <div v-if="(value as string[])?.length" class="tags">
            <span v-for="t in (value as string[])" :key="t" class="tag">{{ t }}</span>
          </div>
        </template>

        <template v-if="showActions" #actions>
          <button class="kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </template>
      </ErpTablePage>
    </section>
  </div>
</template>

<style scoped>
.pg-grid {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: var(--mp-spacing-5);
  align-items: start;
}

/* Control panel */
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  position: sticky;
  top: var(--mp-spacing-2);
}
.panel-title {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  color: var(--mp-text-subtle);
}
.panel-title:first-child { margin-top: 0; }
.ctrl {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
}
.ctrl--col { flex-direction: column; align-items: stretch; gap: var(--mp-spacing-1); cursor: default; }
.ctrl code {
  font-family: monospace;
  font-size: var(--mp-font-sizes-sm);
  background: var(--mp-background-neutral);
  padding: 0 var(--mp-spacing-1);
  border-radius: var(--mp-radii-sm);
}
.ctrl select {
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-md);
}
.panel-note {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
}

/* Preview */
.preview {
  min-width: 0;
  padding: var(--mp-spacing-4);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}

/* Filter controls inside the table's #filters slot */
.f-left, .f-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.f-select {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
}
.f-search {
  width: 280px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  outline: none;
}

/* Cell helpers */
.tags { display: flex; gap: var(--mp-spacing-1); flex-wrap: wrap; }
.tag {
  display: inline-flex;
  align-items: center;
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-md);
  padding: 0 var(--mp-spacing-1\.5);
  max-height: var(--mp-sizes-5, 20px);
  border-radius: var(--mp-radii-sm);
}
.kebab {
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
.kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
</style>
