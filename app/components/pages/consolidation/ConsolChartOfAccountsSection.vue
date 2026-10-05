<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/chart_of_accounts/index.vue (+ components/table, components/filter, components/drawer/drawer.vue, components/modal-delete, components/drawer-import) -->
<script setup lang="ts">
/**
 * Consolidation chart of accounts — prod's /v3/consolidations/chart_of_accounts.
 * Profit & Loss / Balance Sheet tabs, then Account list (category filter +
 * search, parent → child rows, add / edit / delete, Import XLSX / CSV) or
 * Account mapping (unit accounts → consolidation accounts).
 */
import {
  MpButton, MpIcon, MpInput, MpTooltip, MpToggle, MpFormControl, MpFormLabel, MpFormErrorMessage, MpSegmentedControl,
  MpTabs, MpTabList, MpTab,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { successToast, infoToast } from '~/utils/toasts'
import ConsolDrawer from './ConsolDrawer.vue'
import {
  consolAccounts, unitAccounts, consolUnits, eliminationRules, newId, sideOf, unitName, ACCOUNT_TYPES, PL_CATEGORIES,
  type ConsolAccount, type ReportSide,
} from '~/data/consolidation'

const { t } = useLocale()

const tab = ref<ReportSide>('pl')
const TABS: { value: ReportSide; label: string }[] = [
  { value: 'pl', label: 'Profit & Loss' },
  { value: 'bs', label: 'Balance Sheet' },
]
const tabIndex = computed({ get: () => TABS.findIndex((x) => x.value === tab.value), set: (i: number) => { tab.value = TABS[i]?.value ?? 'pl' } })
const segment = ref('account_list')
const segmentData = computed(() => [
  { id: 'coa-list', label: t('Account list'), value: 'account_list' },
  { id: 'coa-map', label: t('Account mapping'), value: 'account_mapping' },
])

// ─── Account list ────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'code', label: t('Account Code'), kind: 'number', sortable: true, sortType: 'text' },
  { key: 'name', label: t('Account Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'type', label: t('Account Type') },
]
interface Row { id: string; code: string; name: string; type: string; level: number; isParent: boolean; isSystem: boolean }
const categoryFilter = ref('')
const search = ref('')
const expanded = ref<Set<string>>(new Set(consolAccounts.filter((a) => consolAccounts.some((c) => c.parentId === a.id)).map((a) => a.id)))
function toggle(id: string) { const s = new Set(expanded.value); s.has(id) ? s.delete(id) : s.add(id); expanded.value = s }
const rows = computed<Row[]>(() => {
  const inTab = consolAccounts.filter((a) => sideOf(a.categoryId) === tab.value)
  const filtering = !!(search.value || categoryFilter.value)
  const s = search.value.toLowerCase()
  const match = (a: ConsolAccount) => (!s || a.name.toLowerCase().includes(s) || a.code.toLowerCase().includes(s)) && (!categoryFilter.value || String(a.categoryId) === categoryFilter.value)
  const toRow = (a: ConsolAccount, level: number): Row => ({ id: a.id, code: a.code, name: a.name, type: t(ACCOUNT_TYPES[a.categoryId]!), level, isParent: inTab.some((c) => c.parentId === a.id), isSystem: !!a.isSystem })
  if (filtering) return inTab.filter(match).sort((a, b) => a.code.localeCompare(b.code)).map((a) => ({ ...toRow(a, 0), isParent: false }))
  const out: Row[] = []
  const walk = (parentId: string | null, level: number) => {
    for (const a of inTab.filter((x) => x.parentId === parentId || (parentId === null && x.parentId && !inTab.some((p) => p.id === x.parentId))).sort((x, y) => x.code.localeCompare(y.code))) {
      if (out.some((r) => r.id === a.id)) continue
      out.push(toRow(a, level))
      if (expanded.value.has(a.id)) walk(a.id, level + 1)
    }
  }
  walk(null, 0)
  return out
})
const { currentPage, paginated, total, perPage, setPage, setPerPage } = useTableState<Row>(rows, { perPage: 25 })
const categoryOptions = computed(() => Object.entries(ACCOUNT_TYPES)
  .filter(([id]) => (tab.value === 'pl') === PL_CATEGORIES.includes(Number(id)))
  .map(([id, label]) => ({ value: id, label: t(label) })))
watch(tab, () => { categoryFilter.value = ''; search.value = '' })
const hasActiveFilter = computed(() => !!(search.value || categoryFilter.value))
function clearFilters() { search.value = ''; categoryFilter.value = '' }

// ─── Add / edit drawer ───────────────────────────────────────────────────────
const drawerOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ categoryId: '', code: '', name: '', parentId: '' })
const errors = reactive<Record<string, string>>({})
function openDrawer(id: string | null) {
  Object.keys(errors).forEach((k) => (errors[k] = ''))
  editingId.value = id
  const a = id ? consolAccounts.find((x) => x.id === id) : null
  Object.assign(form, a ? { categoryId: String(a.categoryId), code: a.code, name: a.name, parentId: a.parentId ?? '' } : { categoryId: '', code: '', name: '', parentId: '' })
  drawerOpen.value = true
}
const allCategoryOptions = computed(() => Object.entries(ACCOUNT_TYPES).map(([id, label]) => ({ value: id, label: t(label) })))
const parentOptions = computed(() => consolAccounts
  .filter((a) => a.id !== editingId.value && !a.parentId && (!form.categoryId || sideOf(a.categoryId) === sideOf(Number(form.categoryId))))
  .map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` })))
function save() {
  errors.categoryId = form.categoryId ? '' : `${t('You must fill in')} ${t('Account type')}`
  errors.code = !form.code.trim() ? `${t('You must fill in')} ${t('Account code')}`
    : consolAccounts.some((a) => a.id !== editingId.value && a.code === form.code.trim()) ? t('Account code already in use') : ''
  errors.name = !form.name.trim() ? `${t('You must fill in')} ${t('Account name')}` : form.name.trim().length < 3 ? `${t('Account name')} ${t('must be at least 3 characters')}` : ''
  if (Object.values(errors).some(Boolean)) return
  const payload = { categoryId: Number(form.categoryId), code: form.code.trim(), name: form.name.trim(), parentId: form.parentId || null }
  if (editingId.value) {
    Object.assign(consolAccounts.find((a) => a.id === editingId.value)!, payload)
    successToast(t('Consolidation account successfully updated'))
  } else {
    consolAccounts.push({ id: newId('ca'), ...payload })
    successToast(t('Consolidation account successfully added'))
    tab.value = sideOf(payload.categoryId)
  }
  drawerOpen.value = false
}

// ─── Delete ──────────────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const pending = ref<Row | null>(null)
const deleteError = ref('')
function askDelete(r: Row) {
  const inRule = eliminationRules.some((x) => [x.source, ...x.destinations].some((l) => l.accountId === r.id))
  if (inRule) { deleteError.value = `${r.code} ${r.name}: ${t('used in an elimination rule. Remove it from the rule first.')}`; return }
  deleteError.value = ''
  pending.value = r
  deleteOpen.value = true
}
function confirmDelete() {
  if (!pending.value) return
  const id = pending.value.id
  for (const a of consolAccounts.filter((x) => x.parentId === id)) a.parentId = null
  for (const u of unitAccounts.filter((x) => x.mappedTo === id)) u.mappedTo = null
  const i = consolAccounts.findIndex((a) => a.id === id)
  if (i >= 0) consolAccounts.splice(i, 1)
  successToast(t('Consolidation account successfully deleted'))
}

// ─── Import drawer ───────────────────────────────────────────────────────────
const importOpen = ref(false)
const importFormat = ref<'XLSX' | 'CSV'>('XLSX')
const importError = ref('')
function openImport(f: 'XLSX' | 'CSV') { importFormat.value = f; importError.value = ''; importOpen.value = true }
function submitImport() { importError.value = t('You must upload a file') }

// ─── Account mapping ─────────────────────────────────────────────────────────
const mapUnit = ref('')
const unmappedOnly = ref(false)
const mapRows = computed(() => unitAccounts
  .filter((a) => a.side === tab.value && (!mapUnit.value || a.unitId === mapUnit.value) && (!unmappedOnly.value || !a.mappedTo)))
const unitOptions = computed(() => consolUnits.filter((u) => unitAccounts.some((a) => a.unitId === u.id)).map((u) => ({ value: u.id, label: u.name })))
const targetOptions = computed(() => consolAccounts.filter((a) => sideOf(a.categoryId) === tab.value).map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` })))
const resetOpen = ref(false)
function confirmReset() { for (const a of unitAccounts.filter((x) => x.side === tab.value)) a.mappedTo = null; successToast(t('Mapping has been reset.')) }
function automaticMapping() {
  let n = 0
  for (const a of unitAccounts.filter((x) => x.side === tab.value && !x.mappedTo)) {
    const target = consolAccounts.find((x) => x.name.toLowerCase() === a.name.toLowerCase())
      ?? consolAccounts.find((x) => sideOf(x.categoryId) === tab.value && x.id === (tab.value === 'pl' ? 'ca-ga' : 'ca-other'))
    if (target) { a.mappedTo = target.id; n++ }
  }
  successToast(n ? `${n} ${t('accounts mapped')}` : t('All accounts are already mapped'))
}
const previewOpen = ref(false)
const previewAccount = ref('')
const previewSearch = ref('')
const previewList = computed(() => consolAccounts.filter((a) => sideOf(a.categoryId) === tab.value)
  .filter((a) => !previewSearch.value || `${a.code} ${a.name}`.toLowerCase().includes(previewSearch.value.toLowerCase())))
const previewMapped = computed(() => unitAccounts.filter((u) => u.mappedTo === previewAccount.value))
</script>

<template>
  <div class="coa">
    <div class="coa-head">
      <h2 class="coa-title">{{ t('Consolidation Chart of Accounts') }}</h2>
      <div class="coa-head-actions">
        <MpPopover id="coa-import" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Import') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openImport('XLSX')">{{ t('Import XLSX') }}</MpPopoverListItem>
              <MpPopoverListItem @click="openImport('CSV')">{{ t('Import CSV') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpButton variant="primary" is-rounded left-icon="add" @click="openDrawer(null)">{{ t('Add Account') }}</MpButton>
      </div>
    </div>

    <MpTabs id="coa-tabs" v-model="tabIndex" is-manual variant-color="green">
      <MpTabList>
        <MpTab v-for="tb in TABS" :id="`coa-tab-${tb.value}`" :key="tb.value" :value="tb.value">{{ t(tb.label) }}</MpTab>
      </MpTabList>
    </MpTabs>

    <p v-if="deleteError" class="coa-error">{{ deleteError }}</p>

    <!-- Account list -->
    <ErpTablePage
      v-if="segment === 'account_list'"
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :search="search"
      :has-active-filter="hasActiveFilter"
      filter-empty-label="accounts"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <div class="filter-left">
          <MpSegmentedControl id="coa-seg" v-model="segment" name="coa-seg" :data="segmentData" />
          <ErpFilterSelect id="coa-cat" v-model="categoryFilter" :placeholder="t('Account Type')" :options="categoryOptions" />
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search account')" />
          </div>
        </div>
      </template>
      <template #cell-code="{ row }">
        <span class="coa-code" :style="{ paddingLeft: `calc(${(row as unknown as Row).level} * var(--mp-spacing-6))` }">
          <MpButton v-if="(row as unknown as Row).isParent" variant="ghost" is-rounded class="coa-caret" :aria-label="t('Expand')" @click="toggle((row as unknown as Row).id)">
            <MpIcon :name="expanded.has((row as unknown as Row).id) ? 'caret-down' : 'caret-right'" size="sm" />
          </MpButton>
          {{ (row as unknown as Row).code }}
        </span>
      </template>
      <template #cell-name="{ row }">
        <span class="coa-ellipsis" :title="(row as unknown as Row).name">{{ (row as unknown as Row).name }}</span>
      </template>
      <template #actions="{ row }">
        <MpPopover :id="`coa-row-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Action')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openDrawer((row as unknown as Row).id)">{{ t('Edit') }}</MpPopoverListItem>
              <MpTooltip v-if="(row as unknown as Row).isSystem" :label="t('System account can\'t be deleted')" placement="left">
                <MpPopoverListItem is-disabled>{{ t('Delete') }}</MpPopoverListItem>
              </MpTooltip>
              <MpPopoverListItem v-else @click="askDelete(row as unknown as Row)">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>
      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('Consolidation account list will appear here') }}</p>
          <p class="empty-full-desc">{{ t('Add consolidation accounts via the Add Account button.') }}</p>
        </div>
      </template>
    </ErpTablePage>

    <!-- Account mapping -->
    <div v-else class="coa-map">
      <div class="coa-map-bar">
        <div class="filter-left">
          <MpSegmentedControl id="coa-seg-2" v-model="segment" name="coa-seg-2" :data="segmentData" />
          <ErpFilterSelect id="coa-map-unit" v-model="mapUnit" :placeholder="t('Business unit')" :options="unitOptions" />
        </div>
        <div class="coa-head-actions">
          <MpButton variant="ghost" is-rounded @click="resetOpen = true">{{ t('Reset mapping') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="automaticMapping">{{ t('Automatic mapping') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="previewOpen = true; previewAccount = ''">{{ t('Preview result') }}</MpButton>
        </div>
      </div>
      <div class="coa-toggle">
        <MpToggle id="coa-unmapped" v-model:is-checked="unmappedOnly" />
        <span>{{ t('Show only unmapped accounts') }}</span>
      </div>
      <table class="coa-table">
        <thead>
          <tr><th>{{ t('Business Unit') }}</th><th>{{ t('Account no.') }}</th><th>{{ t('Account name') }}</th><th>{{ t('Select consolidation account') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="a in mapRows" :key="`${a.unitId}-${a.code}`" :class="{ 'coa-row--warn': !a.mappedTo }">
            <td>{{ unitName(a.unitId) }}</td>
            <td>{{ a.code }}</td>
            <td>{{ a.name }}</td>
            <td class="coa-select-cell">
              <ErpFilterSelect :id="`coa-m-${a.unitId}-${a.code}`" :model-value="a.mappedTo ?? ''" :placeholder="t('Select consolidation account')" :options="targetOptions" width="100%" @update:model-value="(v: string) => (a.mappedTo = v || null)" />
            </td>
          </tr>
          <tr v-if="!mapRows.length"><td colspan="4" class="coa-empty">{{ t('There are no accounts available to map yet.') }}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Add / edit account -->
  <ConsolDrawer :open="drawerOpen" :title="editingId ? t('Edit consolidation account') : t('Add consolidation account')" @close="drawerOpen = false">
    <div class="coa-field">
      <span class="coa-field-label coa-req">{{ t('Account type') }}</span>
      <ErpFilterSelect id="coa-f-type" :model-value="form.categoryId" :placeholder="t('Select account type')" :options="allCategoryOptions" width="100%" @update:model-value="(v: string) => { form.categoryId = v; errors.categoryId = '' }" />
      <span v-if="errors.categoryId" class="coa-error">{{ errors.categoryId }}</span>
    </div>
    <MpFormControl id="coa-f-code-fc" is-required :is-invalid="!!errors.code">
      <MpFormLabel>{{ t('Account code') }}</MpFormLabel>
      <MpInput id="coa-f-code" v-model="form.code" :is-invalid="!!errors.code" @input="errors.code = ''" />
      <MpFormErrorMessage v-if="errors.code">{{ errors.code }}</MpFormErrorMessage>
    </MpFormControl>
    <MpFormControl id="coa-f-name-fc" is-required :is-invalid="!!errors.name">
      <MpFormLabel>{{ t('Account name') }}</MpFormLabel>
      <MpInput id="coa-f-name" v-model="form.name" :is-invalid="!!errors.name" @input="errors.name = ''" />
      <MpFormErrorMessage v-if="errors.name">{{ errors.name }}</MpFormErrorMessage>
    </MpFormControl>
    <div class="coa-field">
      <span class="coa-field-label">{{ t('Parent account') }}</span>
      <ErpFilterSelect id="coa-f-parent" :model-value="form.parentId" :placeholder="t('Select parent account')" :options="parentOptions" width="100%" @update:model-value="(v: string) => (form.parentId = v)" />
      <span class="coa-hint">{{ t('If not selected, the account will be its own parent') }}</span>
    </div>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
    </template>
  </ConsolDrawer>

  <!-- Import -->
  <ConsolDrawer :open="importOpen" :title="t('Import consolidation account')" @close="importOpen = false">
    <div class="coa-field">
      <span class="coa-field-label">{{ t('Account list data') }}</span>
      <span class="coa-hint">{{ t('Download and use our template to ensure your file format is correct.') }}</span>
      <div><MpButton variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Download template') }}</MpButton></div>
    </div>
    <div class="coa-field">
      <span class="coa-field-label coa-req">{{ t('Upload account list template') }}</span>
      <div><MpButton variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Choose file') }}</MpButton></div>
      <span class="coa-hint">{{ t('File must be in') }} {{ importFormat }} {{ t('format, maximum 5 MB') }}</span>
      <span v-if="importError" class="coa-error">{{ importError }}</span>
    </div>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="importOpen = false">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="submitImport">{{ t('Save') }}</MpButton>
    </template>
  </ConsolDrawer>

  <!-- Preview mapping result -->
  <ConsolDrawer :open="previewOpen" :title="t('Preview Result')" size="lg" @close="previewOpen = false">
    <div class="coa-preview">
      <div class="coa-preview-list">
        <span class="coa-field-label">{{ t('Consolidation Accounts List') }} {{ tab === 'pl' ? t('Profit & Loss') : t('Balance Sheet') }}</span>
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="previewSearch" class="filter-search-input" type="text" :placeholder="t('Search account name or account code')" />
        </div>
        <a v-for="a in previewList" :key="a.id" href="#" class="coa-preview-item" :class="{ 'coa-preview-item--on': previewAccount === a.id }" @click.prevent="previewAccount = a.id">
          <span>{{ a.code }} - {{ a.name }}</span>
          <span class="coa-sub">{{ unitAccounts.filter((u) => u.mappedTo === a.id).length }}</span>
        </a>
        <span v-if="!previewList.length" class="coa-hint">{{ t('No accounts found') }}</span>
      </div>
      <div class="coa-preview-result">
        <span class="coa-field-label">{{ t('Mapping Result') }}</span>
        <template v-if="previewAccount">
          <div v-for="m in previewMapped" :key="`${m.unitId}-${m.code}`" class="coa-preview-row">
            <span>{{ m.code }} - {{ m.name }}</span>
            <span class="coa-sub">{{ unitName(m.unitId) }}</span>
          </div>
          <span v-if="!previewMapped.length" class="coa-hint">{{ t('No mapping found for this account') }}</span>
        </template>
        <div v-else class="coa-preview-empty">
          <p class="coa-field-label">{{ t('Mapping results will appear here') }}</p>
          <p class="coa-hint">{{ t('Select consolidation account on the left column') }}</p>
        </div>
      </div>
    </div>
    <template #footer>
      <MpButton variant="ghost" is-rounded @click="previewOpen = false">{{ t('Close') }}</MpButton>
    </template>
  </ConsolDrawer>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete consolidation account?')"
    :description="t('The consolidation account mapping will be reset and will not be saved.')"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
  <ConfirmModal
    v-model:is-open="resetOpen"
    :title="t('Reset mapping?')"
    :description="t('All account mappings will be removed and cannot be restored.')"
    :confirm-label="t('Reset mapping')"
    @confirm="confirmReset"
  />
</template>

<style scoped>
.coa { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; }
.coa-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.coa-title { margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.coa-head-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-left { flex: 1 1 auto; display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.coa-code { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); line-height: var(--mp-line-heights-md); }
.coa-caret { min-width: 0 !important; width: var(--mp-sizes-5, 20px) !important; height: var(--mp-sizes-5, 20px) !important; min-height: 0 !important; padding: 0 !important; margin: calc(var(--mp-spacing-1) * -1) 0; }
.coa-ellipsis { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.coa-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.coa-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; }
.coa-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.coa-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.coa-field-label { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.coa-req::after { content: ' *'; color: var(--mp-text-danger); }

.coa-map { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.coa-map-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.coa-toggle { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); }
.coa-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.coa-table th { padding: var(--mp-spacing-2) var(--mp-spacing-3); text-align: left; background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.coa-table td { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle; }
.coa-table tbody tr:last-child td { border-bottom: none; }
.coa-select-cell { min-width: var(--mp-sizes-64, 256px); }
.coa-row--warn td { background: var(--mp-colors-background-warning); }
.coa-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6) !important; }

.coa-preview { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--mp-spacing-4); }
.coa-preview-list, .coa-preview-result { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.coa-preview-item { display: flex; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2); border-radius: var(--mp-radii-md); text-decoration: none; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.coa-preview-item:hover { background: var(--mp-background-neutral-hovered); }
.coa-preview-item--on { background: var(--mp-background-neutral-pressed); color: var(--mp-text-link); font-weight: var(--mp-font-weights-semi-bold); }
.coa-preview-row { display: flex; flex-direction: column; padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); }
.coa-preview-empty { display: flex; flex-direction: column; gap: var(--mp-spacing-1); align-items: center; padding: var(--mp-spacing-8) 0; text-align: center; }

.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
