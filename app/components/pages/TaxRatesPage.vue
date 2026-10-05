<!-- prod-parity: quickbook/app/views/company_taxes/ (index, _tax_table, new/edit/_tax_inputs, show/_tax_inputs_label) -->
<script setup lang="ts">
/**
 * Settings › Tax rates — the company tax list. Index (name, effective rate,
 * sell/buy tax account), the PPN 12% banner, and one drawer that serves
 * create / edit / view of a tax: Single (rate, 11/12 DPP multiplier,
 * withholding, accounts) or Group (composed of single taxes, each optionally
 * compounded, with a derived effective rate).
 */
import {
  MpButton, MpIcon, MpInput, MpCheckbox, MpRadio, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpTooltip, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import {
  companyTaxes, getCompanyTax, effectiveRate, formatRate, nextTaxId, isTaxNameUsed, taxUsedInGroup, hasPpn12,
  SELL_TAX_ACCOUNT_OPTIONS, BUY_TAX_ACCOUNT_OPTIONS, type CompanyTax, type TaxKind,
} from '~/data/companyTaxes'

const { t } = useLocale()
const actions = useParityActions()

// ─── Table ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'rate', label: t('Effective rate'), kind: 'number', align: 'right', sortable: true, sortType: 'number' },
  { key: 'sellAccount', label: t('Sell tax account'), kind: 'name' },
  { key: 'buyAccount', label: t('Buy tax account'), kind: 'name' },
]

interface Row { id: string; name: string; rate: number; sellAccount: string; buyAccount: string; kind: TaxKind }
const rows = computed<Row[]>(() => companyTaxes.map((x) => ({
  id: x.id, name: x.name, rate: effectiveRate(x), sellAccount: x.sellAccount, buyAccount: x.buyAccount, kind: x.kind,
})))

const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
})
function clearSearch() { search.value = '' }

// ─── PPN 12% banner ──────────────────────────────────────────────────────────
const bannerDismissed = ref(false)
const showBanner = computed(() => !bannerDismissed.value && !hasPpn12())

// ─── Drawer: create / edit / view ────────────────────────────────────────────
type Mode = 'create' | 'edit' | 'view'
const drawerOpen = ref(false)
const mode = ref<Mode>('create')
const editingId = ref<string | null>(null)
const showErrors = ref(false)

const form = reactive({
  kind: 'single' as TaxKind,
  name: '',
  rate: '0',
  otherDpp: false,
  isWithholding: false,
  sellAccount: '',
  buyAccount: '',
  childIds: [] as string[],
  compounded: {} as Record<string, boolean>,
})

const drawerTitle = computed(() => mode.value === 'create' ? t('Create new tax') : mode.value === 'edit' ? t('Edit tax') : t('Tax'))
const viewing = computed(() => (editingId.value ? getCompanyTax(editingId.value) : undefined))

function resetForm(src?: Partial<CompanyTax>) {
  form.kind = src?.kind ?? 'single'
  form.name = src?.name ?? ''
  form.rate = src?.rate != null ? String(src.rate) : '0'
  form.otherDpp = src?.otherDpp ?? false
  form.isWithholding = src?.isWithholding ?? false
  form.sellAccount = src?.sellAccount ?? SELL_TAX_ACCOUNT_OPTIONS[0]!
  form.buyAccount = src?.buyAccount ?? BUY_TAX_ACCOUNT_OPTIONS[0]!
  form.childIds = (src?.children ?? []).map((c) => c.taxId)
  form.compounded = Object.fromEntries((src?.children ?? []).map((c) => [c.taxId, c.compounded]))
  showErrors.value = false
}

function openCreate(prefill?: Partial<CompanyTax>) {
  mode.value = 'create'
  editingId.value = null
  resetForm(prefill)
  drawerOpen.value = true
}
function openView(id: string) {
  mode.value = 'view'
  editingId.value = id
  drawerOpen.value = true
}
function openEdit(id: string) {
  const x = getCompanyTax(id)
  if (!x) return
  mode.value = 'edit'
  editingId.value = id
  resetForm(x)
  drawerOpen.value = true
}
function closeDrawer() { drawerOpen.value = false }

watch(() => actions.newTax, () => openCreate())

function createPpn12() {
  openCreate({ kind: 'single', name: 'PPN 12%', rate: 12, otherDpp: true, sellAccount: '2-20500 VAT Out', buyAccount: '1-10500 VAT In' })
}

/** Single taxes a group can be composed of (never another group, never itself). */
const childOptions = computed(() => companyTaxes.filter((x) => x.kind === 'single' && x.id !== editingId.value))
const childLabels = computed(() => childOptions.value.map((x) => x.name))
const selectedChildNames = computed({
  get: () => form.childIds.map((id) => getCompanyTax(id)?.name ?? '').filter(Boolean),
  set: (names: string[]) => {
    form.childIds = names.map((n) => childOptions.value.find((x) => x.name === n)?.id).filter((x): x is string => !!x)
  },
})
/** Compounding is unavailable on a child that uses the 11/12 DPP multiplier. */
function compoundBlocked(id: string): boolean { return !!getCompanyTax(id)?.otherDpp }

const draftEffectiveRate = computed(() => {
  if (form.kind === 'single') return Number(form.rate) || 0
  return effectiveRate({
    id: '_draft', kind: 'group', name: '', rate: 0, otherDpp: false, isWithholding: false, sellAccount: '', buyAccount: '',
    children: form.childIds.map((taxId) => ({ taxId, compounded: !!form.compounded[taxId] })),
  })
})

const nameError = computed(() => {
  if (!form.name.trim()) return t('You must fill in tax name')
  if (isTaxNameUsed(form.name, editingId.value ?? undefined)) return t('This tax name is already used')
  return ''
})
const rateError = computed(() => {
  if (form.kind !== 'single') return ''
  const n = Number(form.rate)
  if (form.rate === '' || Number.isNaN(n)) return t('You must fill in rate')
  if (n < 0 || n > 100) return t('Rate must be between 0 and 100')
  return ''
})
const childError = computed(() => (form.kind === 'group' && form.childIds.length < 2 ? t('Select at least two taxes') : ''))
const hasError = computed(() => !!nameError.value || !!rateError.value || !!childError.value)

function save() {
  showErrors.value = true
  if (hasError.value) return
  const record: CompanyTax = {
    id: editingId.value ?? nextTaxId(),
    kind: form.kind,
    name: form.name.trim(),
    rate: form.kind === 'single' ? Number(form.rate) : 0,
    otherDpp: form.kind === 'single' && form.otherDpp,
    isWithholding: form.kind === 'single' && form.isWithholding,
    sellAccount: form.kind === 'single' ? form.sellAccount : '',
    buyAccount: form.kind === 'single' ? form.buyAccount : '',
    children: form.kind === 'group' ? form.childIds.map((taxId) => ({ taxId, compounded: !!form.compounded[taxId] && !compoundBlocked(taxId) })) : [],
  }
  if (mode.value === 'edit' && editingId.value) {
    const i = companyTaxes.findIndex((x) => x.id === editingId.value)
    if (i >= 0) companyTaxes.splice(i, 1, record)
    toast.notify({ variant: 'success', title: t('Tax changes saved') })
  } else {
    companyTaxes.push(record)
    toast.notify({ variant: 'success', title: t('Tax created') })
  }
  closeDrawer()
}

// ─── Delete ──────────────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const toDelete = ref<CompanyTax | null>(null)
function askDelete(id: string) {
  const x = getCompanyTax(id)
  if (!x) return
  const group = taxUsedInGroup(id)
  if (group) {
    toast.notify({ variant: 'error', title: `${t('This tax is part of')} ${group.name} ${t('and cannot be deleted')}`, maxWidth: 'max-content' })
    return
  }
  toDelete.value = x
  deleteOpen.value = true
}
function confirmDelete() {
  if (!toDelete.value) return
  const i = companyTaxes.findIndex((x) => x.id === toDelete.value!.id)
  if (i >= 0) companyTaxes.splice(i, 1)
  if (editingId.value === toDelete.value.id) closeDrawer()
  toast.notify({ variant: 'success', title: t('Tax deleted') })
  toDelete.value = null
}

function childRows(x: CompanyTax) {
  return x.children.map((c, i) => {
    const child = getCompanyTax(c.taxId)
    return { n: i + 1, name: child?.name ?? '', rate: child ? formatRate(child.rate) : '', compounded: c.compounded, sell: child?.sellAccount || '-', buy: child?.buyAccount || '-' }
  })
}
</script>

<template>
  <div class="tr-page">
    <div v-if="showBanner" class="tr-banner">
      <MpBanner id="tr-ppn12-banner" variant="info">
        <MpBannerIcon id="tr-ppn12-icon" />
        <MpBannerTitle id="tr-ppn12-title">{{ t('PPN 12% is effective now') }}</MpBannerTitle>
        <MpBannerDescription id="tr-ppn12-desc">{{ t('Create and apply the new PPN rate to your sales and products soon.') }}</MpBannerDescription>
        <MpBannerLink id="tr-ppn12-link">
          <span class="cell-link" role="button" @click="createPpn12">{{ t('Create PPN 12%') }}</span>
        </MpBannerLink>
      </MpBanner>
      <MpButton class="tr-banner-close" variant="ghost" left-icon="close" is-rounded :aria-label="t('Close')" @click="bannerDismissed = true" />
    </div>

    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :has-active-search="!!search"
      :search="search"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort-change="setSort"
      @clear-search="clearSearch"
      @clear-all="clearSearch"
    >
      <template #filters>
        <div class="filter-left" />
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
          </div>
        </div>
      </template>

      <template #cell-name="{ row, value }">
        <span class="cell-link cell-text" @click.stop="openView((row as unknown as Row).id)">{{ value }}</span>
      </template>
      <template #cell-rate="{ value }">{{ formatRate(value as number) }}</template>
      <template #cell-sellAccount="{ value }">{{ value || '-' }}</template>
      <template #cell-buyAccount="{ value }">{{ value || '-' }}</template>

      <template #actions="{ row }">
        <MpPopover :id="`tr-row-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openView((row as unknown as Row).id)">{{ t('View details') }}</MpPopoverListItem>
              <MpPopoverListItem @click="openEdit((row as unknown as Row).id)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="askDelete((row as unknown as Row).id)">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('No taxes') }}</p>
          <p class="empty-full-desc">{{ t('Taxes will appear here.') }}</p>
        </div>
      </template>
    </ErpTablePage>
  </div>

  <!-- ── Tax drawer (create / edit / view) ── -->
  <Teleport to="body">
    <Transition name="trd">
      <div v-if="drawerOpen" class="trd-overlay">
        <div class="trd-panel" role="dialog" :aria-label="drawerTitle">
          <header class="trd-header">
            <span class="trd-title">{{ drawerTitle }}</span>
            <MpButton class="trd-close" is-rounded :aria-label="t('Close')" @click="closeDrawer">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <!-- View -->
          <div v-if="mode === 'view' && viewing" class="trd-body">
            <ContentList :label="t('Tax')" :value="viewing.kind === 'single' ? t('Single') : t('Group')" />
            <ContentList :label="t('Name')" :value="viewing.name" />
            <template v-if="viewing.kind === 'single'">
              <ContentList :label="t('Effective rate')" :value="`${formatRate(viewing.rate)}%`" />
              <ContentList :label="t('11/12 multiplier for DPP')" :value="viewing.otherDpp ? t('Yes') : t('No')" />
              <ContentList :label="t('Withholding')" :value="viewing.isWithholding ? t('Yes') : t('No')" />
              <ContentList :label="t('Sell tax account')" :value="viewing.sellAccount || '-'" />
              <ContentList :label="t('Buy tax account')" :value="viewing.buyAccount || '-'" />
            </template>
            <template v-else>
              <ContentList :label="t('Effective rate')" :value="formatRate(effectiveRate(viewing))" />
              <div class="trd-field">
                <span class="trd-field-label">{{ t('Composed of') }}</span>
                <div class="trd-children">
                  <div class="trd-children-row trd-children-row--head">
                    <span>#</span><span>{{ t('Tax name') }}</span><span>{{ t('Rate') }}</span><span>{{ t('Compounded') }}</span>
                  </div>
                  <div v-for="c in childRows(viewing)" :key="c.n" class="trd-children-row">
                    <span>{{ c.n }}</span>
                    <span>{{ c.name }}<span class="trd-sub">{{ c.sell }} · {{ c.buy }}</span></span>
                    <span>{{ c.rate }}</span>
                    <span><MpIcon v-if="c.compounded" name="done" size="sm" /></span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Create / edit -->
          <div v-else class="trd-body">
            <div class="trd-field">
              <span class="trd-field-label">{{ t('Tax') }}</span>
              <div class="trd-radios">
                <MpRadio id="trd-kind-single" name="trd-kind" value="single" :is-checked="form.kind === 'single'" :is-disabled="mode === 'edit' && form.kind !== 'single'" @change="form.kind = 'single'">{{ t('Single') }}</MpRadio>
                <MpRadio id="trd-kind-group" name="trd-kind" value="group" :is-checked="form.kind === 'group'" :is-disabled="mode === 'edit' && form.kind !== 'group'" @change="form.kind = 'group'">{{ t('Group') }}</MpRadio>
              </div>
            </div>

            <MpFormControl id="trd-name" is-required :is-invalid="showErrors && !!nameError">
              <MpFormLabel>{{ t('Name') }}</MpFormLabel>
              <MpInput id="trd-name-input" v-model="form.name" autocomplete="off" />
              <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
            </MpFormControl>

            <template v-if="form.kind === 'single'">
              <MpFormControl id="trd-rate" is-required :is-invalid="showErrors && !!rateError">
                <MpFormLabel>{{ t('Effective rate') }}</MpFormLabel>
                <div class="trd-rate">
                  <MpInput id="trd-rate-input" v-model="form.rate" type="number" autocomplete="off" />
                  <span class="trd-rate-suffix">%</span>
                </div>
                <MpFormErrorMessage>{{ rateError }}</MpFormErrorMessage>
              </MpFormControl>

              <div class="trd-check">
                <MpCheckbox id="trd-dpp" :is-checked="form.otherDpp" :is-disabled="form.isWithholding" @change="form.otherDpp = !form.otherDpp">{{ t('11/12 multiplier for DPP') }}</MpCheckbox>
                <MpTooltip :label="t('Based on PMK-131/2024, the 11/12 multiplier is required for Other Value Tax Base (DPP Nilai Lain) calculation starting from January 2025.')" placement="right">
                  <MpIcon name="info" size="sm" class="trd-info" />
                </MpTooltip>
              </div>
              <p v-if="form.isWithholding" class="trd-hint">{{ t('You cannot enable the 11/12 multiplier for DPP Nilai Lain if withholding has been enabled.') }}</p>

              <div class="trd-check">
                <MpCheckbox id="trd-wht" :is-checked="form.isWithholding" :is-disabled="form.otherDpp" @change="form.isWithholding = !form.isWithholding">{{ t('Withholding') }}</MpCheckbox>
              </div>
              <p v-if="form.otherDpp" class="trd-hint">{{ t('You cannot enable withholding if the 11/12 multiplier for DPP has been enabled.') }}</p>

              <div class="trd-field">
                <span class="trd-field-label">{{ t('Sell tax account') }}</span>
                <ErpFilterSelect id="trd-sell" :model-value="form.sellAccount" :placeholder="t('Select account')" :options="SELL_TAX_ACCOUNT_OPTIONS" width="100%" @update:model-value="(v: string) => (form.sellAccount = v)" />
              </div>
              <div class="trd-field">
                <span class="trd-field-label">{{ t('Buy tax account') }}</span>
                <ErpFilterSelect id="trd-buy" :model-value="form.buyAccount" :placeholder="t('Select account')" :options="BUY_TAX_ACCOUNT_OPTIONS" width="100%" @update:model-value="(v: string) => (form.buyAccount = v)" />
              </div>
            </template>

            <template v-else>
              <MpFormControl id="trd-children" is-required :is-invalid="showErrors && !!childError">
                <MpFormLabel>{{ t('Composed of') }}</MpFormLabel>
                <MultiSelectDropdown id="trd-children-select" v-model="selectedChildNames" :options="childLabels" :placeholder="t('Select tax')" is-full-width :is-invalid="showErrors && !!childError" />
                <MpFormErrorMessage>{{ childError }}</MpFormErrorMessage>
              </MpFormControl>

              <div v-if="form.childIds.length" class="trd-field">
                <div class="trd-check">
                  <span class="trd-field-label">{{ t('Compounded') }}</span>
                  <MpTooltip :label="t('Compounded tax will be applied to total after previous tax is applied. Order of tax will matter.')" placement="right">
                    <MpIcon name="info" size="sm" class="trd-info" />
                  </MpTooltip>
                </div>
                <ul class="trd-compound-list">
                  <li v-for="(cid, i) in form.childIds" :key="cid" class="trd-compound-item">
                    <MpCheckbox
                      :id="`trd-compound-${cid}`"
                      :is-checked="!!form.compounded[cid]"
                      :is-disabled="i === 0 || compoundBlocked(cid)"
                      @change="form.compounded[cid] = !form.compounded[cid]"
                    >{{ getCompanyTax(cid)?.name }} ({{ formatRate(getCompanyTax(cid)?.rate ?? 0) }}%)</MpCheckbox>
                    <span v-if="compoundBlocked(cid)" class="trd-hint">{{ t('You cannot enable compounded tax if the 11/12 multiplier for DPP Nilai Lain has been enabled.') }}</span>
                  </li>
                </ul>
              </div>
              <ContentList :label="t('Effective rate')" :value="`${formatRate(draftEffectiveRate)}%`" />
            </template>
          </div>

          <footer class="trd-footer">
            <template v-if="mode === 'view' && viewing">
              <button class="btn-enterprise btn-enterprise--danger" type="button" @click="askDelete(viewing.id)">{{ t('Delete') }}</button>
              <div class="trd-footer-right">
                <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="closeDrawer">{{ t('Back') }}</button>
                <button class="btn-enterprise btn-enterprise--primary" type="button" @click="openEdit(viewing.id)">{{ t('Edit') }}</button>
              </div>
            </template>
            <template v-else>
              <span />
              <div class="trd-footer-right">
                <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="closeDrawer">{{ t('Cancel') }}</button>
                <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ mode === 'edit' ? t('Edit tax') : t('Create tax') }}</button>
              </div>
            </template>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete tax?')"
    :description="`${t('Are you sure you want to delete')} ${toDelete?.name ?? ''}?`"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.tr-page { display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-height: 0; flex: 1; }
.tr-banner { position: relative; }
.tr-banner-close { position: absolute !important; top: var(--mp-spacing-2); right: var(--mp-spacing-2); }
.filter-left { flex: 1 1 auto; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Drawer — same shell as BillsFiltersDrawer (rule/drawer-custom-shell). */
.trd-enter-active, .trd-leave-active { transition: background-color 250ms ease; }
.trd-enter-from, .trd-leave-to { background-color: transparent; }
.trd-enter-active .trd-panel { transition: transform 350ms ease-out; }
.trd-leave-active .trd-panel { transition: transform 250ms ease-in; }
.trd-enter-from .trd-panel, .trd-leave-to .trd-panel { transform: translateX(calc(100% + 12px)); }
.trd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.trd-panel {
  margin: var(--mp-spacing-3);
  width: min(520px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  overflow: hidden;
}
.trd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.trd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.trd-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.trd-close:hover { background: var(--mp-background-neutral-hovered); }
.trd-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}
.trd-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.trd-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.trd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.trd-field-label {
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.trd-radios { display: flex; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-1); }
.trd-rate { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.trd-rate-suffix { flex-shrink: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.trd-check { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.trd-info { color: var(--mp-colors-icon-default); cursor: help; }
.trd-hint { margin: calc(var(--mp-spacing-4) * -1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.trd-compound-list { display: flex; flex-direction: column; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-2); }
.trd-compound-item { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.trd-compound-item .trd-hint { margin: 0; padding-left: calc(var(--mp-spacing-6) + var(--mp-spacing-1)); }

.trd-children { display: flex; flex-direction: column; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.trd-children-row {
  display: grid; grid-template-columns: 32px 1fr 64px 96px; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-top: 1px solid var(--mp-border-default);
}
.trd-children-row--head {
  border-top: none; background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
}
.trd-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
