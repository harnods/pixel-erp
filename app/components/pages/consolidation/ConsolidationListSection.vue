<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/index/index.vue (+ components/table, components/filter, components/drawer-setup, components/unlock-modal, onboarding/index.vue) -->
<script setup lang="ts">
/**
 * Consolidation list — prod's /v3/consolidations/index. Status quick filter +
 * search, row Action menu (Continue / View Report / Rerun / Lock / Unlock /
 * Delete), Run consolidation drawer → stepper wizard → In Progress → Completed.
 * With no consolidation at all the section shows prod's Onboarding page.
 */
import {
  MpButton, MpIcon, MpInput, MpTooltip, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import { successToast } from '~/utils/toasts'
import ConsolDrawer from './ConsolDrawer.vue'
import RunConsolidationWizard from './RunConsolidationWizard.vue'
import ConsolOnboarding from './ConsolOnboarding.vue'
import {
  consolidations, consolUnits, unitGroups, newId, formatPeriod, periodRange,
  STATUS_LABEL, STATUS_BADGE, CONSOL_CURRENCY_OPTIONS,
  type Consolidation, type ConsolidationStatus, type PeriodType,
} from '~/data/consolidation'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const go = inject<(id: string, extra?: Record<string, string>) => void>('consolGo')!

// Prototype preview toggle — data vs no consolidation yet (onboarding).
const previewMode = ref<'data' | 'empty'>('data')
const isEmpty = computed(() => previewMode.value === 'empty' || consolidations.length === 0)

// ─── Table ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'period', label: t('Period'), kind: 'address' },
  { key: 'currency', label: t('Reporting Currency') },
  { key: 'status', label: t('Status'), kind: 'status' },
  { key: 'updatedAt', label: t('Last Updated'), kind: 'date', sortable: true, sortType: 'date' },
]
interface Row { id: string; name: string; period: string; currency: string; status: ConsolidationStatus; isLocked: boolean; updatedAt: string; updatedBy: string }
const rows = computed<Row[]>(() => consolidations.map((c) => ({
  id: c.id, name: c.name, period: formatPeriod(c), currency: c.currency, status: c.status,
  isLocked: c.isLocked, updatedAt: c.updatedAt, updatedBy: c.updatedBy,
})))
const {
  search, statusFilter, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  defaultSort: { key: 'updatedAt', dir: 'desc' },
  filterFn: (r, s, st) => (!s || r.name.toLowerCase().includes(s)) && (!st || r.status === st),
})
const statusOptions = (Object.keys(STATUS_LABEL) as ConsolidationStatus[]).map((k) => ({ value: k, label: t(STATUS_LABEL[k]) }))
const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value)
function clearFilters() { search.value = ''; statusFilter.value = '' }

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const byId = (id: string) => consolidations.find((c) => c.id === id)!

// ─── Row actions ─────────────────────────────────────────────────────────────
function viewReport(r: Row) { go('reports', { consolidation: r.id }) }
function lock(r: Row) { byId(r.id).isLocked = true; touch(byId(r.id)); successToast(t('Consolidation locked')) }
const unlockOpen = ref(false)
const pending = ref<Row | null>(null)
function askUnlock(r: Row) { pending.value = r; unlockOpen.value = true }
function confirmUnlock() { if (!pending.value) return; byId(pending.value.id).isLocked = false; touch(byId(pending.value.id)); successToast(t('Consolidation unlocked')) }
const deleteOpen = ref(false)
function askDelete(r: Row) { pending.value = r; deleteOpen.value = true }
function confirmDelete() {
  if (!pending.value) return
  const i = consolidations.findIndex((c) => c.id === pending.value!.id)
  if (i >= 0) consolidations.splice(i, 1)
  successToast(t('Consolidation deleted'))
}
function touch(c: Consolidation) { c.updatedAt = new Date().toISOString(); c.updatedBy = 'Rizal Candra' }

// ─── Run consolidation drawer (prod drawer-setup) ────────────────────────────
const drawerOpen = ref(false)
const rerunId = ref<string | null>(null)
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthOptions = computed(() => {
  const out: { value: string; label: string }[] = []
  for (const y of [2026, 2025]) for (let m = 12; m >= 1; m--) out.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: `${t(MONTHS[m - 1]!)} ${y}` })
  return out
})
const periodTypeOptions = computed(() => [
  { value: 'per_bulan', label: t('Per month') },
  { value: 'per_3_bulan', label: t('Per 3 months') },
  { value: 'per_6_bulan', label: t('Per 6 months') },
  { value: 'per_tahun', label: t('Per year') },
])
const form = reactive({ name: '', periodType: 'per_bulan' as PeriodType, startMonth: '', currency: 'IDR', unitIds: [] as string[] })
const errors = reactive<Record<string, string>>({})
const NAME_MAX = 50
const nameCountColor = computed(() => form.name.length >= NAME_MAX ? 'var(--mp-text-danger)' : 'var(--mp-text-secondary)')
const unitPickOptions = computed(() => consolUnits.filter((u) => !form.unitIds.includes(u.id)).map((u) => ({ value: u.id, label: `${u.code} · ${u.name}` })))
const pickUnit = ref('')
watch(pickUnit, (v) => { if (v) { form.unitIds.push(v); pickUnit.value = ''; errors.units = '' } })
function removeUnit(id: string) { form.unitIds = form.unitIds.filter((x) => x !== id) }
function applyGroup(groupId: string) { const g = unitGroups.find((x) => x.id === groupId); if (g) { form.unitIds = [...g.unitIds]; errors.units = '' } }
const groupOptions = computed(() => unitGroups.map((g) => ({ value: g.id, label: `${g.name} (${g.unitIds.length} ${g.unitIds.length === 1 ? t('entity') : t('entities')})` })))
const pickGroup = ref('')
watch(pickGroup, (v) => { if (v) { applyGroup(v); pickGroup.value = '' } })

function openRun(rerun?: Row) {
  Object.keys(errors).forEach((k) => (errors[k] = ''))
  if (rerun) {
    const c = byId(rerun.id)
    rerunId.value = c.id
    Object.assign(form, { name: c.name, periodType: c.periodType, startMonth: c.periodStart.slice(0, 7), currency: c.currency, unitIds: [...c.unitIds] })
  } else {
    rerunId.value = null
    Object.assign(form, { name: '', periodType: 'per_bulan', startMonth: '', currency: 'IDR', unitIds: [] })
  }
  drawerOpen.value = true
}
watch(() => route.query.run, (v) => { if (v) { openRun(); router.replace({ query: { ...route.query, run: undefined } }) } }, { immediate: true })

const duplicateOpen = ref(false)
const duplicate = ref<Consolidation | null>(null)
function submitSetup() {
  errors.name = form.name.trim() ? '' : `${t('You must enter')} ${t('Consolidation Name')}`
  errors.period = form.startMonth ? '' : `${t('You must fill in')} ${t('Consolidation Period')}`
  errors.currency = form.currency ? '' : `${t('You must fill in')} ${t('Reporting Currency')}`
  errors.units = form.unitIds.length ? '' : `${t('You must fill in')} ${t('Unit Business')}`
  if (errors.name || errors.period || errors.currency || errors.units) return
  const { start, end } = periodRange(form.periodType, form.startMonth)
  if (!rerunId.value) {
    const same = consolidations.find((c) => c.periodStart === start && c.periodEnd === end && [...c.unitIds].sort().join() === [...form.unitIds].sort().join())
    if (same) { duplicate.value = same; duplicateOpen.value = true; return }
  }
  let c: Consolidation
  if (rerunId.value) {
    c = byId(rerunId.value)
    Object.assign(c, { name: form.name.trim(), currency: form.currency, unitIds: [...form.unitIds], status: 'draft', draftStep: 0 })
  } else {
    c = {
      id: newId('con'), name: form.name.trim(), periodType: form.periodType, periodStart: start, periodEnd: end,
      currency: form.currency, unitIds: [...form.unitIds], status: 'draft', isLocked: false,
      updatedAt: new Date().toISOString(), updatedBy: 'Rizal Candra', rates: [], eliminations: [], draftStep: 0,
    }
    consolidations.unshift(c)
  }
  for (const g of unitGroups) if ([...g.unitIds].sort().join() === [...c.unitIds].sort().join()) g.lastUsed = new Date().toISOString()
  drawerOpen.value = false
  wizardId.value = c.id
}
function rerunDuplicate() {
  if (!duplicate.value) return
  drawerOpen.value = false
  const d = duplicate.value
  openRun({ id: d.id } as Row)
}

// ─── Wizard ──────────────────────────────────────────────────────────────────
const wizardId = ref<string | null>(null)
const wizardConsolidation = computed(() => (wizardId.value ? consolidations.find((c) => c.id === wizardId.value) ?? null : null))
function continueDraft(r: Row) { wizardId.value = r.id }
function onWizardDraft() {
  const c = wizardConsolidation.value!
  c.status = 'draft'
  touch(c)
  successToast(t('Consolidation draft saved'))
  wizardId.value = null
}
function onWizardRun() {
  const c = wizardConsolidation.value!
  c.status = 'in_progress'
  touch(c)
  successToast(t('Consolidation in progress'))
  wizardId.value = null
  const id = c.id
  setTimeout(() => {
    const x = consolidations.find((y) => y.id === id)
    if (x && x.status === 'in_progress') { x.status = 'completed'; touch(x) }
  }, 2500)
}
// A run interrupted by a reload finishes on the next visit.
onMounted(() => {
  for (const c of consolidations.filter((x) => x.status === 'in_progress')) setTimeout(() => { c.status = 'completed' }, 1500)
})
</script>

<template>
  <!-- ── Run consolidation stepper ── -->
  <RunConsolidationWizard
    v-if="wizardConsolidation"
    :key="wizardConsolidation.id"
    :consolidation="wizardConsolidation"
    @leave="wizardId = null"
    @draft="onWizardDraft"
    @run="onWizardRun"
  />

  <!-- ── Onboarding (no consolidation yet) ── -->
  <ConsolOnboarding v-else-if="isEmpty" @start="openRun()" />

  <!-- ── List ── -->
  <div v-else class="cl">
    <div class="cl-head">
      <h2 class="cl-title">{{ t('Consolidations') }}</h2>
      <MpButton variant="primary" is-rounded @click="openRun()">{{ t('Run consolidation') }}</MpButton>
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
      filter-empty-label="consolidation"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="cl-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search consolidations')" />
          </div>
        </div>
      </template>

      <template #cell-name="{ row }">
        <span class="cl-name">
          <span class="cell-link cl-name-text" :title="(row as unknown as Row).name" @click="(row as unknown as Row).status === 'completed' ? viewReport(row as unknown as Row) : (row as unknown as Row).status === 'draft' && continueDraft(row as unknown as Row)">{{ (row as unknown as Row).name }}</span>
          <MpTooltip v-if="(row as unknown as Row).isLocked" :label="t('Locked')" placement="top">
            <MpIcon name="security" size="sm" class="cl-lock" />
          </MpTooltip>
        </span>
      </template>
      <template #cell-status="{ row }">
        <ErpStatusBadge :status="(row as unknown as Row).status" :label="t(STATUS_LABEL[(row as unknown as Row).status])" :type="STATUS_BADGE[(row as unknown as Row).status]" />
      </template>
      <template #cell-updatedAt="{ row }">
        <span class="cl-updated">
          <span>{{ formatDateTime((row as unknown as Row).updatedAt) }}</span>
          <span class="cl-sub">{{ (row as unknown as Row).updatedBy }}</span>
        </span>
      </template>

      <template #actions="{ row }">
        <MpPopover v-if="(row as unknown as Row).status !== 'in_progress'" :id="`cl-row-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Action')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem v-if="!(row as unknown as Row).isLocked && (row as unknown as Row).status === 'draft'" @click="continueDraft(row as unknown as Row)">{{ t('Continue') }}</MpPopoverListItem>
              <MpPopoverListItem :is-disabled="(row as unknown as Row).status !== 'completed'" @click="(row as unknown as Row).status === 'completed' && viewReport(row as unknown as Row)">{{ t('View Report') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="!(row as unknown as Row).isLocked" :is-disabled="(row as unknown as Row).status === 'draft'" @click="(row as unknown as Row).status !== 'draft' && openRun(row as unknown as Row)">{{ t('Rerun') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="!(row as unknown as Row).isLocked && (row as unknown as Row).status === 'completed'" @click="lock(row as unknown as Row)">{{ t('Lock') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="(row as unknown as Row).isLocked" @click="askUnlock(row as unknown as Row)">{{ t('Unlock') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="!(row as unknown as Row).isLocked" @click="askDelete(row as unknown as Row)">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('Consolidation list will appear here') }}</p>
          <p class="empty-full-desc">{{ t('Run consolidation from Run consolidation button.') }}</p>
        </div>
      </template>
    </ErpTablePage>
  </div>

  <ScenarioFab v-if="!wizardConsolidation" v-model="previewMode" :scenarios="[{ label: t('Default'), value: 'data' }, { label: t('No consolidation yet'), value: 'empty' }]" />

  <!-- ── Run consolidation drawer ── -->
  <ConsolDrawer :open="drawerOpen" :title="t('Run Consolidation')" @close="drawerOpen = false">
    <MpFormControl id="cl-name-fc" is-required :is-invalid="!!errors.name">
      <MpFormLabel>{{ t('Consolidation Name') }}</MpFormLabel>
      <div class="cl-name-field">
        <MpInput id="cl-name" v-model="form.name" :maxlength="NAME_MAX" :is-invalid="!!errors.name" @input="errors.name = ''" />
        <span class="cl-count" :style="{ color: nameCountColor }">{{ form.name.length }}/{{ NAME_MAX }}</span>
      </div>
      <MpFormErrorMessage v-if="errors.name">{{ errors.name }}</MpFormErrorMessage>
    </MpFormControl>

    <div class="cl-field">
      <span class="cl-field-label cl-req">{{ t('Consolidation Period') }}</span>
      <div class="cl-period">
        <ErpFilterSelect id="cl-period-type" :model-value="form.periodType" :placeholder="t('Per month')" :options="periodTypeOptions" :is-clearable="false" width="100%" @update:model-value="(v: string) => { if (!rerunId) form.periodType = v as PeriodType }" />
        <ErpFilterSelect id="cl-period-month" :model-value="form.startMonth" :placeholder="t('Select period')" :options="monthOptions" :is-disabled="!!rerunId" width="100%" @update:model-value="(v: string) => { form.startMonth = v; errors.period = '' }" />
      </div>
      <span v-if="form.startMonth" class="cl-hint">{{ formatPeriod({ periodStart: periodRange(form.periodType, form.startMonth).start, periodEnd: periodRange(form.periodType, form.startMonth).end }) }}</span>
      <span v-if="errors.period" class="cl-error">{{ errors.period }}</span>
    </div>

    <div class="cl-field">
      <span class="cl-field-label cl-req">{{ t('Reporting Currency') }}</span>
      <ErpFilterSelect id="cl-currency" :model-value="form.currency" :placeholder="t('Select currency')" :options="CONSOL_CURRENCY_OPTIONS" width="100%" @update:model-value="(v: string) => { form.currency = v; errors.currency = '' }" />
      <span v-if="errors.currency" class="cl-error">{{ errors.currency }}</span>
    </div>

    <div class="cl-field">
      <span class="cl-field-label cl-req">{{ t('Unit Business') }}</span>
      <ErpFilterSelect id="cl-group" v-model="pickGroup" :placeholder="t('Saved groups')" :options="groupOptions" width="100%" />
      <ul v-if="form.unitIds.length" class="cl-units">
        <li v-for="id in form.unitIds" :key="id" class="cl-unit">
          <span class="cl-unit-name">{{ consolUnits.find((u) => u.id === id)?.name }}</span>
          <span class="cl-sub">{{ consolUnits.find((u) => u.id === id)?.currency }}</span>
          <MpButton variant="ghost" is-rounded :aria-label="t('Remove')" @click="removeUnit(id)"><MpIcon name="close" size="sm" /></MpButton>
        </li>
      </ul>
      <ErpFilterSelect id="cl-add-unit" v-model="pickUnit" :placeholder="t('Add Unit Business')" :options="unitPickOptions" width="100%" :empty-text="t('No business unit available')" />
      <span v-if="errors.units" class="cl-error">{{ errors.units }}</span>
    </div>

    <template #footer>
      <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="submitSetup">{{ t('Continue') }}</MpButton>
    </template>
  </ConsolDrawer>

  <ConfirmModal
    v-model:is-open="duplicateOpen"
    :title="t('Similar consolidation found')"
    :description="`${t('A consolidation for')} ${duplicate ? formatPeriod(duplicate) : ''} ${t('with these units already exists. Rerun to update the data.')}`"
    :confirm-label="t('Rerun')"
    :is-danger="false"
    @confirm="rerunDuplicate"
  />
  <ConfirmModal
    v-model:is-open="unlockOpen"
    :title="t('Unlock consolidation?')"
    :description="t('Unlocking this consolidation will allow it to be edited, re-run, and deleted again. You can lock it again afterward.')"
    :confirm-label="t('Unlock')"
    :is-danger="false"
    @confirm="confirmUnlock"
  />
  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete consolidation?')"
    :description="t('This action cannot be undone. The consolidation will be automatically deleted from reports.')"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.cl { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; }
.cl-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.cl-title { margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.filter-left { flex: 1 1 auto; display: flex; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cl-name { display: flex; align-items: center; gap: var(--mp-spacing-1); min-width: 0; max-width: 100%; }
.cl-name-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cl-lock { color: var(--mp-colors-icon-default); flex-shrink: 0; }
.cl-updated { display: flex; flex-direction: column; }
.cl-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cl-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.cl-field-label { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cl-req::after { content: ' *'; color: var(--mp-text-danger); }
.cl-name-field { position: relative; }
.cl-count { position: absolute; right: var(--mp-spacing-3); top: 50%; transform: translateY(-50%); font-size: var(--mp-font-sizes-sm); }
.cl-period { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: var(--mp-spacing-2); }
.cl-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cl-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.cl-units { display: flex; flex-direction: column; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.cl-unit { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-1) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.cl-unit:last-child { border-bottom: none; }
.cl-unit-name { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
