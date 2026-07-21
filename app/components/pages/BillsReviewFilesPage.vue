<script setup lang="ts">
import {
  MpIcon, MpAvatar, MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { reviewFiles } from '~/data'
import type { ReviewFile, FileClassification } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Column definitions ───────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'file',            label: 'File',           width: '220px', sortable: true,                 sortType: 'text'   },
  { key: 'number',          label: 'Number',         width: '160px', sortable: true,                 sortType: 'number' },
  { key: 'beneficiaryName', label: 'Beneficiary',    width: '220px', sortable: true,                 sortType: 'text'   },
  { key: 'confidence',      label: 'Confidence',     width: '120px', sortable: true,                 sortType: 'number' },
  { key: 'classification',  label: 'Classification', width: '160px',                                 sortType: 'text'   },
  { key: 'date',            label: 'Date',           width: '120px',                                 sortType: 'date'   },
  { key: 'amount',          label: 'Amount',         width: '160px', align: 'right', sortable: true,  sortType: 'number' },
]

// ─── Row type ─────────────────────────────────────────────────────────────────

type Row = ReviewFile & {
  beneficiaryName: string
  fileIcon: string
}

// File icon by extension — mirrors Pixel's per-filetype document icons.
function iconForFile(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (ext === 'xlsx' || ext === 'csv') return 'excel-document'
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'image-document'
  return 'attachment'
}

// ─── Flatten + enrich ─────────────────────────────────────────────────────────

const rows = computed<Row[]>(() =>
  reviewFiles.map(rf => ({
    ...rf,
    beneficiaryName: rf.beneficiary.name,
    fileIcon: iconForFile(rf.file),
  }))
)

// ─── Table state ──────────────────────────────────────────────────────────────
// Classification drives the status-filter dropdown per spec.

const {
  search, statusFilter, hasActiveSearch, hasActiveFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s, status) =>
    (row.file.toLowerCase().includes(s) || row.beneficiaryName.toLowerCase().includes(s)) &&
    (!status || row.classification === status),
})

// ─── Filter options ───────────────────────────────────────────────────────────

const classificationOptions: { label: string; value: FileClassification | '' }[] = [
  { label: 'Bill',         value: 'bill'         },
  { label: 'Receipt',      value: 'receipt'      },
  { label: 'Unclassified', value: 'unclassified' },
]

const classificationLabel = computed(
  () => classificationOptions.find(o => o.value === statusFilter.value)?.label ?? '',
)

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
  }).format(amount).replace(/^(Rp)\s/, '$1')
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

function formatNumber(n: number) {
  return `Expense #${String(n).padStart(5, '0')}`
}

function confidenceLabel(score: number): 'High' | 'Medium' | 'Low' {
  if (score >= 85) return 'High'
  if (score >= 60) return 'Medium'
  return 'Low'
}

// Column show/hide (first column always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: 'Last updated', width: '200px' }]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'lastUpdated'])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Upload dropzone (Card 1) ──────────────────────────────────────────────────

const fileInputEl = ref<HTMLInputElement | null>(null)
function openFilePicker() { fileInputEl.value?.click() }
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    has-checkbox
    actions-width="52px"
    :has-active-search="hasActiveSearch"
    :has-active-filter="hasActiveFilter"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-search="search = ''"
    @clear-filters="statusFilter = ''"
    @clear-all="search = ''; statusFilter = ''"
  >

    <!-- ── Upload dropzone — same position as the stats bar on other tabs ── -->
    <template #stats>
      <div class="upload-row">

        <!-- Card 1: Drop file / choose (dashed border) -->
        <button type="button" class="upload-card upload-card--dropzone" @click="openFilePicker">
          <input ref="fileInputEl" type="file" class="upload-card__input" accept=".csv,.png,.xlsx,.pdf,.jpg" multiple />
          <MpAvatar variant="circle" size="xl" variant-color="gray" icon="upload" icon-variant="outline" />
          <span class="upload-card__copy">
            <span class="upload-card__title">
              Drop your file here or <span class="upload-card__choose">choose</span>
            </span>
            <span class="upload-card__desc">Supported formats: CSV, PNG, XLSX, PDF, JPG.</span>
            <span class="upload-card__desc">Maximum file size: 10 MB.</span>
          </span>
        </button>

        <!-- Card 2: Upload from Google Drive -->
        <button type="button" class="upload-card upload-card--option">
          <MpAvatar variant="circle" size="xl" variant-color="gray" icon="Google" icon-variant="outline" />
          <span class="upload-card__copy">
            <span class="upload-card__title upload-card__title--center">Upload from Google Drive</span>
            <span class="upload-card__desc">Access your Google account</span>
          </span>
        </button>

        <!-- Card 3: Forward from email -->
        <button type="button" class="upload-card upload-card--option">
          <MpAvatar variant="circle" size="xl" variant-color="gray" icon="envelope" icon-variant="outline" />
          <span class="upload-card__copy">
            <span class="upload-card__title upload-card__title--center">Forward from email</span>
            <span class="upload-card__desc">Forward bills to dropbox.680128@jurnal.id</span>
          </span>
        </button>

      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: classification select (MpSelect + MpPopover) + All filters -->
      <div class="filter-left">
        <MpPopover id="rf-classification-filter" is-close-on-select>
          <!-- placeholder = filter name ("Classification"); is-clearable shows (x) when a
               value is picked → @clear resets to show-all. -->
          <MpPopoverTrigger>
            <MpSelect
              id="rf-classification-select"
              placeholder="Classification"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ classificationLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <!-- min-width = MpSelect width (160px) so the dropdown matches the select;
               width:max-content lets it hug/grow when an option is longer. -->
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in classificationOptions"
                :key="opt.value"
                :is-active="opt.value === statusFilter"
                @click="statusFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn">
          <MpIcon name="filter" size="sm" />
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
          <ColumnSettingsMenu id="tt-columns-review" :items="columnItems" :visibility="columnVisibility" />
          <!-- Export -->
          <button class="filter-icon-btn" aria-label="Export">
            <MpIcon name="download" size="md" />
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

    <!-- ── Cell: File ── -->
    <template #cell-file="{ row, value }">
      <div class="file-cell">
        <MpIcon :name="(row as Row).fileIcon" size="sm" class="file-cell__icon" />
        <span class="cell-text">{{ value }}</span>
      </div>
    </template>

    <!-- ── Cell: Number ── -->
    <template #cell-number="{ value }">
      {{ formatNumber(value as number) }}
    </template>

    <!-- ── Cell: Beneficiary ── -->
    <template #cell-beneficiaryName="{ value }">
      <span class="cell-text">{{ value }}</span>
    </template>

    <!-- ── Cell: Confidence ── -->
    <template #cell-confidence="{ value }">
      {{ confidenceLabel(value as number) }}
    </template>

    <!-- ── Cell: Classification ── -->
    <template #cell-classification="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Amount ── -->
    <template #cell-amount="{ value }">
      {{ formatIDR(value as number) }}
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

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>
  </ErpTablePage>
</template>

<style scoped>
/* ── Upload dropzone row ────────────────────────────────────────────────── */

.upload-row {
  display: flex;
  gap: var(--mp-spacing-6);
  align-items: stretch;
}

.upload-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-3);
  flex: 1;
  min-width: 0;
  padding: var(--mp-spacing-5);
  background: var(--mp-background-neutral);
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  text-align: center;
  font-family: inherit;
}

.upload-card--dropzone {
  border: 1px dashed var(--mp-border-bold);
  position: relative;
}

.upload-card--option {
  border: 1px solid var(--mp-border-default);
  cursor: default;
}

.upload-card__input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.upload-card__copy {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  width: 100%;
}

.upload-card__title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

.upload-card__title--center {
  display: block;
}

.upload-card__choose {
  color: var(--mp-text-link);
}

.upload-card__desc {
  display: block;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

/* File cell */
.file-cell {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1\.5);
  min-width: 0;
}

.file-cell__icon {
  flex-shrink: 0;
  color: var(--mp-text-subtle);
}

.cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
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
