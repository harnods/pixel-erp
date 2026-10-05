<!-- prod-parity: quickbook/app/views/multi_currency/ (index, modal_form/_add_currency, modal_form/_edit_master_currency) -->
<script setup lang="ts">
/**
 * Settings › Currencies — the multi-currency list. One row per foreign
 * currency with the rate in effect on the selected date (Base to Rate /
 * Rate to Base), the provider description, and Delete. Clicking a rate opens
 * Edit currency (switch provider or set a custom rate for that date); the
 * title-bar button opens Add new currency.
 */
import {
  MpButton, MpIcon, MpInput, MpRadio, MpFormControl, MpFormLabel, MpFormErrorMessage, MpDatePicker, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpButtonGroup, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { SIM_TODAY_ISO } from '~/data/simClock'
import {
  BASE_CURRENCY, CURRENCY_PROVIDERS, AVAILABLE_CURRENCIES, currencyLists, rateOn, setRate, addCurrencyList, rateDescription,
  type CurrencyListItem, type CurrencyProviderName,
} from '~/data/currencyList'

const { t } = useLocale()
const actions = useParityActions()

// ─── Date filter (DD/MM/YYYY ↔ ISO) ──────────────────────────────────────────
const toDisplay = (iso: string) => iso.split('-').reverse().join('/')
const toIso = (d: string) => d.split('/').reverse().join('-')
const dateDraft = ref(toDisplay(SIM_TODAY_ISO))
const appliedIso = ref(SIM_TODAY_ISO)
const dateError = ref('')
function applyDate() {
  const iso = toIso(dateDraft.value || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) { dateError.value = t('invalid date'); return }
  if (iso > SIM_TODAY_ISO) { dateError.value = t('Date should be less than today or today'); return }
  dateError.value = ''
  appliedIso.value = iso
}

// ─── Table ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'code', label: t('Currency'), kind: 'unit' },
  { key: 'symbol', label: t('Symbol'), kind: 'unit', align: 'right' },
  { key: 'baseToRate', label: t('Base to rate'), kind: 'amount', align: 'right' },
  { key: 'rateToBase', label: t('Rate to base'), kind: 'amount', align: 'right' },
  { key: 'description', label: t('Description'), kind: 'address' },
]

interface Row { id: string; code: string; symbol: string; baseToRate: number | null; rateToBase: number | null; description: string }
const rows = computed<Row[]>(() => currencyLists.map((c) => {
  const r = rateOn(c, appliedIso.value)
  return {
    id: c.id, code: c.code, symbol: c.symbol,
    rateToBase: r ? r.rateToBase : null,
    baseToRate: r ? 1 / r.rateToBase : null,
    description: rateDescription(r, c),
  }
}))
const { currentPage, paginated, total, perPage, setPage, setPerPage } = useTableState<Row>(rows, { perPage: 25 })

const fmt = (n: number, max: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: max }).format(n)

// ─── Add currency ────────────────────────────────────────────────────────────
const addOpen = ref(false)
const addCode = ref('')
const addProvider = ref<CurrencyProviderName>('Bank Indonesia')
const addError = ref('')
const addOptions = computed(() => AVAILABLE_CURRENCIES
  .filter((c) => !currencyLists.some((l) => l.code === c.code))
  .map((c) => ({ value: c.code, label: `${c.code}-${c.country}` })))
function openAdd() { addCode.value = ''; addProvider.value = 'Bank Indonesia'; addError.value = ''; addOpen.value = true }
watch(() => actions.newCurrency, openAdd)
function saveAdd() {
  if (!addCode.value) { addError.value = t('You must select currency'); return }
  const item = addCurrencyList(addCode.value, addProvider.value, SIM_TODAY_ISO)
  if (!item) { addError.value = t('for this rate already exist'); return }
  addOpen.value = false
  toast.notify({ variant: 'success', title: `${item.code} ${t('added to the currency list')}` })
}

// ─── Edit currency (rate for the selected date) ──────────────────────────────
const editOpen = ref(false)
const editing = ref<CurrencyListItem | null>(null)
const editProvider = ref<CurrencyProviderName>('Bank Indonesia')
const customRate = ref('')
const editError = ref('')
function openEdit(id: string) {
  const c = currencyLists.find((x) => x.id === id)
  if (!c) return
  editing.value = c
  const r = rateOn(c, appliedIso.value)
  editProvider.value = r?.provider ?? c.provider
  customRate.value = r ? String(r.rateToBase) : ''
  editError.value = ''
  editOpen.value = true
}
function saveEdit() {
  const c = editing.value
  if (!c) return
  let rateToBase: number
  if (editProvider.value === 'Custom Rates') {
    const n = Number(customRate.value)
    if (customRate.value === '' || Number.isNaN(n)) { editError.value = t('Exchange rate must be number'); return }
    if (n <= 0) { editError.value = t('Exchange rate must exceed 0'); return }
    rateToBase = n
  } else {
    // Provider rate: the provider's published figure for the date (falls back to the catalogue rate).
    const published = c.rates.find((r) => r.provider === editProvider.value && r.date <= appliedIso.value)
    rateToBase = published?.rateToBase ?? AVAILABLE_CURRENCIES.find((a) => a.code === c.code)?.rateToBase ?? 0
  }
  c.provider = editProvider.value
  setRate(c, { date: appliedIso.value, rateToBase, provider: editProvider.value, editedBy: editProvider.value === 'Custom Rates' ? 'Rizal Candra' : undefined })
  editOpen.value = false
  toast.notify({ variant: 'success', title: t('Exchange rate changes saved') })
}

// ─── Delete ──────────────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const toDelete = ref<Row | null>(null)
function askDelete(row: Row) { toDelete.value = row; deleteOpen.value = true }
function confirmDelete() {
  if (!toDelete.value) return
  const i = currencyLists.findIndex((x) => x.id === toDelete.value!.id)
  if (i >= 0) currencyLists.splice(i, 1)
  toast.notify({ variant: 'success', title: `${toDelete.value.code} ${t('deleted')}` })
  toDelete.value = null
}

function openHelp() { toast.notify({ variant: 'info', title: t('Not in this prototype') }) }
</script>

<template>
  <div class="cur-page">
    <div class="cur-head">
      <div class="cur-base">
        <p class="cur-base-title">{{ t('Base currency') }}: {{ BASE_CURRENCY }}</p>
        <p class="cur-base-note">{{ t('Unavailable exchange rates will be updated automatically at 08:15 WIB.') }}</p>
      </div>
      <div class="cur-date">
        <MpFormControl id="cur-date-fc" :is-invalid="!!dateError" class="cur-date-fc">
          <MpFormLabel>{{ t('Date') }}</MpFormLabel>
          <MpDatePicker id="cur-date" v-model="dateDraft" format="DD/MM/YYYY" value-type="format" use-portal />
          <MpFormErrorMessage>{{ dateError }}</MpFormErrorMessage>
        </MpFormControl>
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="applyDate">{{ t('Apply') }}</button>
      </div>
    </div>

    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      @page-change="setPage"
      @per-page-change="setPerPage"
    >
      <template #cell-baseToRate="{ row, value }">
        <span class="cell-link cell-text" @click.stop="openEdit((row as unknown as Row).id)">
          {{ value == null ? t('Exchange rate unavailable') : fmt(value as number, 8) }}
        </span>
      </template>
      <template #cell-rateToBase="{ row, value }">
        <span class="cell-link cell-text" @click.stop="openEdit((row as unknown as Row).id)">
          {{ value == null ? t('Exchange rate unavailable') : fmt(value as number, 2) }}
        </span>
      </template>

      <template #actions="{ row }">
        <MpButton variant="ghost" is-rounded class="cur-delete" @click="askDelete(row as unknown as Row)">{{ t('Delete') }}</MpButton>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('No currencies') }}</p>
          <p class="empty-full-desc">{{ t('Currencies will appear here.') }}</p>
        </div>
      </template>
    </ErpTablePage>

    <div class="cur-guide">
      <div class="cur-guide-text">
        <span>{{ t('Found wrong or unmatched rate? Let’s learn how to fix it.') }}</span>
        <span class="cell-link" @click="openHelp">{{ t('Visit Help Center') }}</span>
      </div>
      <MpIcon name="help" size="md" />
    </div>
  </div>

  <!-- ── Add new currency ── -->
  <MpModal id="cur-add-modal" :is-open="addOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="addOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Add currency') }}</MpModalHeader>
      <MpModalBody>
        <div class="cur-form">
          <p class="cur-form-base">{{ t('Base currency') }}: {{ BASE_CURRENCY }}</p>
          <MpFormControl id="cur-add-code-fc" is-required :is-invalid="!!addError">
            <MpFormLabel>{{ t('Currency') }}</MpFormLabel>
            <ErpFilterSelect id="cur-add-code" :model-value="addCode" :placeholder="t('Select currency')" :options="addOptions" width="100%" @update:model-value="(v: string) => { addCode = v; addError = '' }" />
            <MpFormErrorMessage>{{ addError }}</MpFormErrorMessage>
          </MpFormControl>
          <div class="cur-field">
            <div class="cur-label-row">
              <span class="cur-field-label">{{ t('Default rate') }}</span>
              <MpTooltip :label="t('Reference that used for exchange rate conversion.')" placement="right">
                <MpIcon name="info" size="sm" class="cur-info" />
              </MpTooltip>
            </div>
            <div class="cur-radios">
              <div v-for="p in CURRENCY_PROVIDERS" :key="p.name" class="cur-radio">
                <MpRadio :id="`cur-add-${p.name}`" name="cur-add-provider" :value="p.name" :is-checked="addProvider === p.name" @change="addProvider = p.name">{{ t(p.name) }}</MpRadio>
                <span class="cur-radio-hint">{{ t(p.tooltip) }}</span>
              </div>
            </div>
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="addOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="saveAdd">{{ t('Add new currency') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>

  <!-- ── Edit currency ── -->
  <MpModal id="cur-edit-modal" :is-open="editOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="editOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Edit currency') }}</MpModalHeader>
      <MpModalBody>
        <div v-if="editing" class="cur-form">
          <p class="cur-form-base">{{ t('Base currency') }}: {{ BASE_CURRENCY }}</p>
          <div class="cur-kv"><span class="cur-field-label">{{ t('Date') }}</span><span>{{ toDisplay(appliedIso) }}</span></div>
          <div class="cur-kv"><span class="cur-field-label">{{ t('Currency') }}</span><span>{{ editing.code }}</span></div>
          <div class="cur-field">
            <div class="cur-label-row">
              <span class="cur-field-label">{{ t('Rate') }}</span>
              <MpTooltip :label="t('Reference that used for exchange rate conversion.')" placement="right">
                <MpIcon name="info" size="sm" class="cur-info" />
              </MpTooltip>
            </div>
            <div class="cur-radios">
              <div v-for="p in CURRENCY_PROVIDERS" :key="p.name" class="cur-radio">
                <MpRadio :id="`cur-edit-${p.name}`" name="cur-edit-provider" :value="p.name" :is-checked="editProvider === p.name" @change="editProvider = p.name; editError = ''">{{ t(p.name) }}</MpRadio>
                <span class="cur-radio-hint">{{ t(p.tooltip) }}</span>
              </div>
            </div>
            <MpFormControl v-if="editProvider === 'Custom Rates'" id="cur-custom-fc" :is-invalid="!!editError" class="cur-custom">
              <div class="cur-custom-row">
                <span>1 {{ editing.code }} =</span>
                <MpInput id="cur-custom-input" v-model="customRate" type="number" autocomplete="off" />
                <span>{{ BASE_CURRENCY }}</span>
              </div>
              <MpFormErrorMessage>{{ editError }}</MpFormErrorMessage>
            </MpFormControl>
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="editOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="saveEdit">{{ t('Edit') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete currency?')"
    :description="`${toDelete?.code ?? ''} ${t('will be removed from the currency list.')}`"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.cur-page { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; }
.cur-head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-6); }
.cur-base { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cur-base-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cur-base-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cur-date { display: flex; align-items: flex-end; gap: var(--mp-spacing-2); }
.cur-date-fc { width: 200px; }
.cur-delete { color: var(--mp-text-danger) !important; }

.cur-guide {
  display: inline-flex; align-self: flex-start; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) var(--mp-spacing-5);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  color: var(--mp-colors-icon-default);
}
.cur-guide-text { display: flex; flex-direction: column; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.cur-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.cur-form-base { margin: 0; align-self: flex-end; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cur-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cur-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cur-field-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cur-info { color: var(--mp-colors-icon-default); cursor: help; }
.cur-radios { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cur-radio { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.cur-radio-hint { padding-left: var(--mp-spacing-7); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cur-kv { display: flex; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cur-kv .cur-field-label { min-width: 96px; }
.cur-custom { padding-left: var(--mp-spacing-7); }
.cur-custom-row { display: flex; align-items: center; gap: var(--mp-spacing-2); white-space: nowrap; font-size: var(--mp-font-sizes-md); }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
