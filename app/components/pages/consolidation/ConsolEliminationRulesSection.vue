<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/consolidation_rules/index.vue (+ components/table, components/filter, components/drawer) -->
<script setup lang="ts">
/**
 * Elimination rules — prod's /v3/consolidations/consolidation_rules.
 * Source / destination unit filters + search; create, view, edit and delete
 * a rule (one source leg, up to 10 destination legs). Rules saved here are
 * pre-filled in Run consolidation › Intercompany eliminations.
 */
import {
  MpButton, MpIcon, MpInput, MpTooltip, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerDescription,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { successToast } from '~/utils/toasts'
import ConsolDrawer from './ConsolDrawer.vue'
import {
  eliminationRules, consolUnits, consolAccounts, newId, unitName, consolAccountLabel,
  type EliminationRule, type RuleLeg,
} from '~/data/consolidation'

const { t } = useLocale()

const columns: TableColumn[] = [
  { key: 'name', label: t('Elimination name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'source', label: t('Source unit'), kind: 'address' },
  { key: 'dest', label: t('Destination unit'), kind: 'address' },
  { key: 'status', label: t('Status'), kind: 'status' },
  { key: 'updatedAt', label: t('Last modified'), kind: 'date', sortable: true, sortType: 'date' },
]
interface Row { id: string; name: string; sourceUnit: string; sourceAccount: string; dests: { unit: string; account: string }[]; status: EliminationRule['status']; updatedAt: string; updatedBy: string; sourceUnitId: string; destUnitIds: string[] }
const legValid = (l: RuleLeg) => consolUnits.some((u) => u.id === l.unitId && u.status !== 'disconnected') && consolAccounts.some((a) => a.id === l.accountId)
const ruleStatus = (r: EliminationRule): EliminationRule['status'] => [r.source, ...r.destinations].every(legValid) ? 'active' : 'needs_fix'
const rows = computed<Row[]>(() => eliminationRules.map((r) => ({
  id: r.id, name: r.name,
  sourceUnit: unitName(r.source.unitId), sourceAccount: consolAccountLabel(r.source.accountId), sourceUnitId: r.source.unitId,
  dests: r.destinations.map((d) => ({ unit: unitName(d.unitId), account: consolAccountLabel(d.accountId) })), destUnitIds: r.destinations.map((d) => d.unitId),
  status: ruleStatus(r), updatedAt: r.updatedAt, updatedBy: r.updatedBy,
})))
const srcFilter = ref('')
const destFilter = ref('')
const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  defaultSort: { key: 'updatedAt', dir: 'desc' },
  filterFn: (r, s) => (!s || r.name.toLowerCase().includes(s) || r.sourceUnit.toLowerCase().includes(s) || r.dests.some((d) => d.unit.toLowerCase().includes(s)))
    && (!srcFilter.value || r.sourceUnitId === srcFilter.value) && (!destFilter.value || r.destUnitIds.includes(destFilter.value)),
})
watch([srcFilter, destFilter], () => setPage(1))
const unitOptions = computed(() => consolUnits.map((u) => ({ value: u.id, label: u.name })))
const hasActiveFilter = computed(() => !!(search.value || srcFilter.value || destFilter.value))
function clearFilters() { search.value = ''; srcFilter.value = ''; destFilter.value = '' }
function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Drawer (create / view / edit) ───────────────────────────────────────────
const drawerOpen = ref(false)
const mode = ref<'create' | 'view' | 'edit'>('create')
const editingId = ref<string | null>(null)
const form = reactive({ name: '', source: { unitId: '', accountId: '' } as RuleLeg, destinations: [{ unitId: '', accountId: '' }] as RuleLeg[] })
const errors = reactive<Record<string, string>>({})
const MAX_DEST = 10
const accountOptions = computed(() => consolAccounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` })))
const viewing = computed(() => (editingId.value ? eliminationRules.find((r) => r.id === editingId.value) ?? null : null))
const unavailableCount = computed(() => viewing.value ? [viewing.value.source, ...viewing.value.destinations].filter((l) => !legValid(l)).length : 0)
function open(m: 'create' | 'view' | 'edit', id: string | null = null) {
  Object.keys(errors).forEach((k) => (errors[k] = ''))
  mode.value = m
  editingId.value = id
  const r = id ? eliminationRules.find((x) => x.id === id) : null
  form.name = r?.name ?? ''
  form.source = r ? { ...r.source } : { unitId: '', accountId: '' }
  form.destinations = r ? r.destinations.map((d) => ({ ...d })) : [{ unitId: '', accountId: '' }]
  drawerOpen.value = true
}
function addDest() { if (form.destinations.length < MAX_DEST) form.destinations.push({ unitId: '', accountId: '' }) }
function removeDest(i: number) { form.destinations.splice(i, 1) }
function save() {
  errors.name = form.name.trim() ? '' : t('Elimination name is required')
  errors.srcUnit = form.source.unitId ? '' : t('Source business unit is required')
  errors.srcAcc = form.source.accountId ? '' : t('Source account is required')
  form.destinations.forEach((d, i) => {
    errors[`du${i}`] = d.unitId ? '' : t('Destination business unit is required')
    errors[`da${i}`] = d.accountId ? '' : t('Destination account is required')
  })
  if (Object.values(errors).some(Boolean)) return
  const now = new Date().toISOString()
  const payload = { name: form.name.trim(), source: { ...form.source }, destinations: form.destinations.map((d) => ({ ...d })), updatedAt: now, updatedBy: 'Rizal Candra' }
  if (editingId.value) {
    const r = eliminationRules.find((x) => x.id === editingId.value)!
    Object.assign(r, payload)
    r.status = ruleStatus(r)
    successToast(t('Elimination rule successfully updated'))
  } else {
    const r: EliminationRule = { id: newId('er'), status: 'active', ...payload }
    r.status = ruleStatus(r)
    eliminationRules.push(r)
    successToast(t('Elimination rule successfully created'))
  }
  drawerOpen.value = false
}
const deleteOpen = ref(false)
const pendingId = ref<string | null>(null)
function askDelete(id: string) { pendingId.value = id; deleteOpen.value = true }
function confirmDelete() {
  const i = eliminationRules.findIndex((r) => r.id === pendingId.value)
  if (i >= 0) eliminationRules.splice(i, 1)
  drawerOpen.value = false
  successToast(t('Elimination rule successfully deleted'))
}
const drawerTitle = computed(() => mode.value === 'create' ? t('Create elimination rule') : mode.value === 'edit' ? t('Edit elimination rule') : (viewing.value?.name ?? ''))
</script>

<template>
  <div class="er">
    <div class="er-head">
      <h2 class="er-title">{{ t('Elimination rules') }}</h2>
      <MpButton variant="primary" is-rounded left-icon="add" @click="open('create')">{{ t('Create elimination rule') }}</MpButton>
    </div>

    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :search="search"
      :has-active-filter="hasActiveFilter"
      filter-empty-label="elimination rules"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="er-src" v-model="srcFilter" :placeholder="t('Source unit')" :options="unitOptions" />
          <ErpFilterSelect id="er-dest" v-model="destFilter" :placeholder="t('Destination unit')" :options="unitOptions" />
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search elimination or unit')" />
          </div>
        </div>
      </template>
      <template #cell-name="{ row }"><span class="cell-link er-ellipsis" :title="(row as unknown as Row).name" @click="open('view', (row as unknown as Row).id)">{{ (row as unknown as Row).name }}</span></template>
      <template #cell-source="{ row }">
        <span class="er-stack"><span class="er-ellipsis" :title="(row as unknown as Row).sourceUnit">{{ (row as unknown as Row).sourceUnit }}</span><span class="er-sub er-ellipsis">{{ (row as unknown as Row).sourceAccount }}</span></span>
      </template>
      <template #cell-dest="{ row }">
        <span class="er-dests">
          <span v-for="(d, i) in (row as unknown as Row).dests" :key="i" class="er-stack"><span class="er-ellipsis" :title="d.unit">{{ d.unit }}</span><span class="er-sub er-ellipsis">{{ d.account }}</span></span>
        </span>
      </template>
      <template #cell-status="{ row }">
        <ErpStatusBadge :status="(row as unknown as Row).status" :label="(row as unknown as Row).status === 'active' ? t('Active') : t('Needs fix')" :type="(row as unknown as Row).status === 'active' ? 'completed' : 'warning'" />
      </template>
      <template #cell-updatedAt="{ row }">
        <span class="er-stack"><span>{{ formatDateTime((row as unknown as Row).updatedAt) }}</span><span class="er-sub">{{ (row as unknown as Row).updatedBy }}</span></span>
      </template>
      <template #actions="{ row }">
        <MpPopover :id="`er-row-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Action')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="open('edit', (row as unknown as Row).id)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="askDelete((row as unknown as Row).id)">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>
      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('Elimination rules will appear here') }}</p>
          <p class="empty-full-desc">{{ t('Create elimination rules via the Create elimination rule button.') }}</p>
        </div>
      </template>
    </ErpTablePage>
  </div>

  <ConsolDrawer :open="drawerOpen" :title="drawerTitle" size="lg" @close="drawerOpen = false">
    <!-- View -->
    <template v-if="mode === 'view' && viewing">
      <MpBanner v-if="unavailableCount" id="er-unavail" variant="warning" is-inline>
        <MpBannerIcon id="er-unavail-icon" />
        <MpBannerDescription>{{ unavailableCount }} {{ t('account(s) unavailable. Please fix before running consolidation.') }}</MpBannerDescription>
      </MpBanner>
      <div class="er-leg-group">
        <span class="er-section">{{ t('Source') }}</span>
        <div class="er-leg-view" :class="{ 'er-leg-view--bad': !legValid(viewing.source) }">
          <span>{{ unitName(viewing.source.unitId) }}</span>
          <span class="er-sub">{{ consolAccountLabel(viewing.source.accountId) }}</span>
          <span v-if="!legValid(viewing.source)" class="er-error">{{ t('Account unavailable') }}</span>
        </div>
      </div>
      <div class="er-leg-group">
        <span class="er-section">{{ t('Destination') }}</span>
        <div v-for="(d, i) in viewing.destinations" :key="i" class="er-leg-view" :class="{ 'er-leg-view--bad': !legValid(d) }">
          <span>{{ unitName(d.unitId) }}</span>
          <span class="er-sub">{{ consolAccountLabel(d.accountId) }}</span>
          <span v-if="!legValid(d)" class="er-error">{{ t('Account unavailable') }}</span>
        </div>
      </div>
    </template>

    <!-- Create / edit -->
    <template v-else>
      <MpFormControl id="er-name-fc" is-required :is-invalid="!!errors.name">
        <MpFormLabel>{{ t('Elimination name') }}</MpFormLabel>
        <MpInput id="er-name" v-model="form.name" :is-invalid="!!errors.name" @input="errors.name = ''" />
        <MpFormErrorMessage v-if="errors.name">{{ errors.name }}</MpFormErrorMessage>
      </MpFormControl>
      <div class="er-leg-group">
        <span class="er-section">{{ t('Source') }}</span>
        <div class="er-leg">
          <div class="er-field">
            <span class="er-field-label er-req">{{ t('Business unit') }}</span>
            <ErpFilterSelect id="er-su" :model-value="form.source.unitId" :placeholder="t('Select business unit')" :options="unitOptions" width="100%" @update:model-value="(v: string) => { form.source.unitId = v; errors.srcUnit = '' }" />
            <span v-if="errors.srcUnit" class="er-error">{{ errors.srcUnit }}</span>
          </div>
          <div class="er-field">
            <span class="er-field-label er-req">{{ t('Account') }}</span>
            <ErpFilterSelect id="er-sa" :model-value="form.source.accountId" :placeholder="t('Select account')" :options="accountOptions" width="100%" @update:model-value="(v: string) => { form.source.accountId = v; errors.srcAcc = '' }" />
            <span v-if="errors.srcAcc" class="er-error">{{ errors.srcAcc }}</span>
          </div>
        </div>
      </div>
      <div class="er-leg-group">
        <span class="er-section">{{ t('Destination') }}</span>
        <div v-for="(d, i) in form.destinations" :key="i" class="er-leg">
          <div class="er-field">
            <span class="er-field-label er-req">{{ t('Business unit') }}</span>
            <ErpFilterSelect :id="`er-du-${i}`" :model-value="d.unitId" :placeholder="t('Select business unit')" :options="unitOptions" width="100%" @update:model-value="(v: string) => { d.unitId = v; errors[`du${i}`] = '' }" />
            <span v-if="errors[`du${i}`]" class="er-error">{{ errors[`du${i}`] }}</span>
          </div>
          <div class="er-field">
            <span class="er-field-label er-req">{{ t('Account') }}</span>
            <ErpFilterSelect :id="`er-da-${i}`" :model-value="d.accountId" :placeholder="t('Select account')" :options="accountOptions" width="100%" @update:model-value="(v: string) => { d.accountId = v; errors[`da${i}`] = '' }" />
            <span v-if="errors[`da${i}`]" class="er-error">{{ errors[`da${i}`] }}</span>
          </div>
          <MpButton v-if="form.destinations.length > 1" variant="ghost" is-rounded left-icon="delete" class="er-remove" :aria-label="t('Delete')" @click="removeDest(i)" />
        </div>
        <MpTooltip v-if="form.destinations.length >= MAX_DEST" :label="t('Maximum 10 destination business units allowed')" placement="right">
          <span class="er-add er-add--off">+ {{ t('Add business unit') }}</span>
        </MpTooltip>
        <span v-else class="cell-link er-add" @click="addDest">+ {{ t('Add business unit') }}</span>
      </div>
    </template>

    <template #footer-left>
      <button v-if="mode === 'view' && viewing" class="btn-enterprise btn-enterprise--danger" type="button" @click="askDelete(viewing.id)">{{ t('Delete') }}</button>
    </template>
    <template #footer>
      <template v-if="mode === 'view'">
        <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Close') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="mode = 'edit'; open('edit', editingId)">{{ t('Edit') }}</MpButton>
      </template>
      <template v-else>
        <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="save">{{ mode === 'edit' ? t('Save changes') : t('Save') }}</MpButton>
      </template>
    </template>
  </ConsolDrawer>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete elimination rule?')"
    :description="t('This elimination rule will be permanently deleted and cannot be recovered.')"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.er { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; }
.er-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.er-title { margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.filter-left { flex: 1 1 auto; display: flex; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.er-ellipsis { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.er-stack { display: flex; flex-direction: column; min-width: 0; }
.er-dests { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.er-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.er-section { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 1px; text-transform: uppercase; color: var(--mp-text-secondary); }
.er-leg-group { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.er-leg { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: var(--mp-spacing-3); align-items: start; }
.er-remove { margin-top: var(--mp-spacing-5); }
.er-leg-view { display: flex; flex-direction: column; padding: var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); }
.er-leg-view--bad { border-color: var(--mp-border-danger, var(--mp-text-danger)); }
.er-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.er-field-label { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.er-req::after { content: ' *'; color: var(--mp-text-danger); }
.er-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.er-add { align-self: flex-start; font-size: var(--mp-font-sizes-md); }
.er-add--off { color: var(--mp-text-disabled, var(--mp-text-secondary)); cursor: not-allowed; }
.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
