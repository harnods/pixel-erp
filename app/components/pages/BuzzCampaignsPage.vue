<script setup lang="ts">
/**
 * BuzzCampaignsPage · Mekari Buzz (Marketing tool) campaigns index.
 *
 * A campaign is a project that groups many creatives (PRD §15). Built on the
 * shared ErpTablePage + useTableState pattern — gray header, pagination, the
 * standard filter bar (status dropdown + All filters left, Export + Search
 * right). Alphabetical default sort by name (project convention).
 */
import {
  MpIcon, MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpSelect, MpText, MpButton, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { buzzCampaigns, buzzBrands, buzzBrand, buzzBadgeType, persistCampaigns, type BuzzCampaign } from '~/data/buzz'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { useBuzzActions } from '~/composables/useBuzzActions'
import CreatePostDrawer from '~/components/patterns/CreatePostDrawer.vue'

const route = useRoute()
const router = useRouter()

const rows = computed<BuzzCampaign[]>(() =>
  [...buzzCampaigns].sort((a, b) => a.name.localeCompare(b.name)))

const statusOptions = ['Draft', 'In review', 'Approved']

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  perPage: 25,
  filterFn: (row, s, st) =>
    (row.name.toLowerCase().includes(s) || row.owner.toLowerCase().includes(s) || (buzzBrand(row.brand)?.name ?? '').toLowerCase().includes(s)) &&
    (!st || row.status === st),
})

// ── New campaign drawer (title-bar action via the bus) ──
const showCreate = ref(false)
// Create campaign → generate an IG post (the main flow).
const showCreatePost = ref(false)
const { pending } = useBuzzActions()
watch(() => pending.value, (p) => {
  if (p?.action === 'newCampaign') showCreate.value = true
  if (p?.action === 'createCampaign') showCreatePost.value = true
})
onMounted(() => { if (route.query.create) showCreatePost.value = true })

const PURPOSES = ['Product launch', 'Feature announcement', 'Educational', 'Event', 'Promotion', 'Employer branding', 'Thought leadership']
const form = reactive({ name: '', brand: buzzBrands[0]?.id ?? '', purpose: PURPOSES[0]!, audience: '' })
const createError = ref('')
watch(showCreate, (open) => { if (open) { form.name = ''; form.brand = buzzBrands[0]?.id ?? ''; form.purpose = PURPOSES[0]!; form.audience = ''; createError.value = '' } })

function createCampaign() {
  if (!form.name.trim()) { createError.value = 'You must fill in a campaign name'; return }
  const maxId = buzzCampaigns.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, '')) || 0), 2041)
  buzzCampaigns.unshift({
    id: `CMP-${maxId + 1}`,
    name: form.name.trim(),
    brand: form.brand,
    purpose: form.purpose,
    audience: form.audience.trim() || 'General',
    status: 'Draft',
    creatives: 0,
    owner: 'You',
    updatedAt: new Date().toISOString().slice(0, 10),
  })
  persistCampaigns()
  showCreate.value = false
  toast.notify({ variant: 'success', title: 'Campaign created.', maxWidth: 'max-content' })
}

const columns: TableColumn[] = [
  { key: 'name', label: 'Campaign', kind: 'name', sortable: true, sortType: 'string' },
  { key: 'brand', label: 'Brand', kind: 'name', sortable: true, sortType: 'string' },
  { key: 'purpose', label: 'Purpose' },
  { key: 'creatives', label: 'Creatives', align: 'right', sortable: true, sortType: 'number' },
  { key: 'owner', label: 'Owner', kind: 'name' },
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'updatedAt', label: 'Last updated', kind: 'date', sortable: true, sortType: 'date' },
]
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
    :has-active-filter="!!statusFilter"
    :search="search"
    filter-empty-label="campaign"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >
    <template #filters>
      <div class="filter-left">
        <div class="filter-select-wrap">
          <select v-model="statusFilter" class="filter-select">
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
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search campaign or owner…" />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>
    </template>

    <template #cell-name="{ row }">
      <span class="cell-link" @click="router.push(`/buzz-campaign/${(row as BuzzCampaign).id}`)">{{ (row as BuzzCampaign).name }}</span>
    </template>
    <template #cell-brand="{ row }">
      <span class="brand-cell">
        <img :src="buzzBrand((row as BuzzCampaign).brand)?.logo" :alt="buzzBrand((row as BuzzCampaign).brand)?.name" class="brand-cell__logo" />
        {{ buzzBrand((row as BuzzCampaign).brand)?.name }}
      </span>
    </template>
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as BuzzCampaign).status" :label="(row as BuzzCampaign).status" :type="buzzBadgeType((row as BuzzCampaign).status)" />
    </template>
    <template #cell-updatedAt="{ value }">{{ formatDate(value as string) }}</template>
  </ErpTablePage>

  <!-- ── Create campaign → generate IG post ── -->
  <CreatePostDrawer v-model:is-open="showCreatePost" />

  <!-- ── New campaign drawer (metadata only) ── -->
  <MpDrawer id="buzz-new-campaign-drawer" :is-open="showCreate" placement="right" size="md" variant="floating" :is-keep-alive="false" @close="showCreate = false">
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="bd-card">
          <div class="bd-header">
            <MpText weight="semiBold">New campaign</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="showCreate = false" />
          </div>
          <div class="bd-form">
            <MpFormControl id="bc-name" is-required :is-invalid="!!createError">
              <MpFormLabel>Campaign name</MpFormLabel>
              <MpInput id="bc-name-input" v-model="form.name" is-full-width placeholder="e.g. Payroll automation launch" @input="createError = ''" />
              <MpFormErrorMessage>{{ createError }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="bc-brand" is-required>
              <MpFormLabel>Brand</MpFormLabel>
              <MpSelect id="bc-brand-select" v-model="form.brand">
                <option v-for="b in buzzBrands" :key="b.id" :value="b.id">{{ b.name }}</option>
              </MpSelect>
            </MpFormControl>
            <MpFormControl id="bc-purpose" is-required>
              <MpFormLabel>Purpose</MpFormLabel>
              <MpSelect id="bc-purpose-select" v-model="form.purpose">
                <option v-for="p in PURPOSES" :key="p" :value="p">{{ p }}</option>
              </MpSelect>
            </MpFormControl>
            <MpFormControl id="bc-audience">
              <MpFormLabel>Audience</MpFormLabel>
              <MpInput id="bc-audience-input" v-model="form.audience" is-full-width placeholder="e.g. HR managers" />
            </MpFormControl>
          </div>
          <div class="bd-footer">
            <MpButton variant="ghost" is-rounded @click="showCreate = false">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="createCampaign">Save</MpButton>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
.brand-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); }
.brand-cell__logo { width: 20px; height: 20px; flex-shrink: 0; border-radius: 4px; object-fit: contain; }

/* ── Drawer (floating card) ── */
.bd-card { display: flex; flex-direction: column; height: 100%; }
.bd-header { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }
.bd-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }
.bd-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }

/* ── Filter bar (verbatim ERP block) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-select-wrap { position: relative; display: inline-flex; align-items: center; width: 160px; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.filter-select { appearance: none; background: transparent; border: none; outline: none; width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); cursor: pointer; }
.filter-select-chevron { position: absolute; right: var(--mp-spacing-2); pointer-events: none; color: var(--mp-text-default); width: 20px; height: 20px; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }
</style>
