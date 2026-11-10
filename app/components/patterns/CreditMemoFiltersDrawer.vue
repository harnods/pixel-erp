<script setup lang="ts">
/**
 * Credit Memo report — "All filters" drawer (v3, aligned to the engineering POC
 * v2 filter drawer + PRD 51218514425 / RFC 51336217071). Field order follows the
 * POC: As of date · Period · Transaction type · Customer · Customer group
 * (Include all / Either) · Customer remaining balance · Credit memo balance ·
 * Credit memo number · show-Rp 0 toggles.
 *
 * Repo rules win over the POC visuals: ErpDrawer shell (rule/drawer-custom-shell,
 * header "All filters", close only via × / Cancel / Apply), ErpFilterSelect for
 * single selects, MultiSelectDropdown for multi selects, AmountComparatorField for
 * the two balance filters (rule/filter-drawer-fields), MpRadio / MpCheckbox,
 * btn-enterprise footer (rule/filter-drawer-footer) and no input placeholders
 * (rule/input-no-placeholder).
 *
 * Edits a local draft (re-synced from modelValue on every open) and commits on
 * Apply only. An inverted "Is between" range (Min > Max) shows an inline caption under the field
 * on Apply and keeps the drawer open (validateFilters). Reset filter clears
 * everything EXCEPT the As of date (PRD AC-019-03).
 */
import { MpIcon, MpButton, MpCheckbox, MpRadio, MpDatePicker, MpInput, MpTooltip, MpTag } from '@mekari/pixel3'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'
import {
  CONTACT_GROUPS, PERIOD_PRESETS, contactOptions, emptyCmReportFilters, resolvePreset, validateFilters,
} from '~/data/creditMemoReport'
import type { CmAmountComparator, CmReportFilters, DocTypeFilter, PeriodPreset } from '~/data/creditMemoReport'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: CmReportFilters
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: CmReportFilters): void
}>()

const { t } = useLocale()

function clone(f: CmReportFilters): CmReportFilters {
  return { ...f, contactIds: [...f.contactIds], groupIds: [...f.groupIds] }
}

const draft = reactive<CmReportFilters>(clone(props.modelValue))
const period = ref<PeriodPreset>('custom')
// Balance filters — AmountComparatorField speaks digit strings (value for
// gt / lt, min + max for between); the filters hold numbers. gt keeps its value
// in Min, lt in Max (see CmAmountComparator).
interface AmountDraft { cmp: CmAmountComparator; value: string; min: string; max: string }
const emptyAmount = (): AmountDraft => ({ cmp: 'gt', value: '', min: '', max: '' })
const amounts = reactive<{ contact: AmountDraft; memo: AmountDraft }>({ contact: emptyAmount(), memo: emptyAmount() })
const errors = reactive<{ contact?: string; memo?: string }>({})

function numToText(n: number | null): string { return n === null || n === undefined ? '' : String(n) }
function textToNum(s: string): number | null {
  const digits = s.replace(/\D/g, '')
  if (digits === '') return null
  const n = Number(digits)
  return Number.isFinite(n) ? n : null
}
function toDraft(cmp: CmAmountComparator, min: number | null, max: number | null): AmountDraft {
  if (cmp === 'gt') return { cmp, value: numToText(min), min: '', max: '' }
  if (cmp === 'lt') return { cmp, value: numToText(max), min: '', max: '' }
  return { cmp, value: '', min: numToText(min), max: numToText(max) }
}
function fromDraft(a: AmountDraft): { cmp: CmAmountComparator; min: number | null; max: number | null } {
  if (a.cmp === 'gt') return { cmp: a.cmp, min: textToNum(a.value), max: null }
  if (a.cmp === 'lt') return { cmp: a.cmp, min: null, max: textToNum(a.value) }
  return { cmp: a.cmp, min: textToNum(a.min), max: textToNum(a.max) }
}
function syncFromModel() {
  Object.assign(draft, clone(props.modelValue))
  amounts.contact = toDraft(draft.contactCmp, draft.contactMin, draft.contactMax)
  amounts.memo = toDraft(draft.memoCmp, draft.memoMin, draft.memoMax)
  period.value = 'custom'
  errors.contact = undefined; errors.memo = undefined
}
watch(() => props.isOpen, (open) => { if (open) syncFromModel() }, { immediate: true })

// ─── As of date (ISO in the draft, DD/MM/YYYY in MpDatePicker) ──────────────
function isoToDmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
function dmyToIso(dmy: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}
const asOfDmy = computed({
  get: () => isoToDmy(draft.asOf),
  set: (v: string) => {
    const iso = dmyToIso(v)
    if (!iso) return
    draft.asOf = iso
    period.value = 'custom' // editing the date by hand puts Period back to Custom
  },
})

// ─── Period presets → set the As of date ────────────────────────────────────
const periodOptions = computed(() => PERIOD_PRESETS.map((p) => ({ value: p.key, label: t(p.label) })))
function onPeriod(v: string) {
  const key = (v || 'custom') as PeriodPreset
  period.value = key
  const iso = resolvePreset(key)
  if (iso) draft.asOf = iso
}

// ─── Transaction type ───────────────────────────────────────────────────────
const docTypeOptions = computed(() => [
  { value: 'all', label: t('Credit memo & debit memo') },
  { value: 'CM', label: t('Credit memo') },
  { value: 'DM', label: t('Debit memo') },
])
function onDocType(v: string) {
  draft.docType = (v || 'all') as DocTypeFilter
  // Drop selected contacts that the new type no longer offers (e.g. vendors under "Credit memo").
  const allowed = new Set(contactOptions({ docType: draft.docType }).map((o) => o.value))
  draft.contactIds = draft.contactIds.filter((id) => allowed.has(id))
}

// ─── Customer (MultiSelectDropdown speaks labels; the draft keeps ids) ──────
const customerOpts = computed(() => contactOptions({ docType: draft.docType }))
const customerLabels = computed(() => customerOpts.value.map((o) => o.label))
const selectedCustomerLabels = computed(() =>
  draft.contactIds.map((id) => customerOpts.value.find((o) => o.value === id)?.label).filter((l): l is string => !!l))
function onCustomers(labels: string[]) {
  draft.contactIds = labels
    .map((l) => customerOpts.value.find((o) => o.label === l)?.value)
    .filter((v): v is string => !!v)
}
function removeCustomer(id: string) { draft.contactIds = draft.contactIds.filter((c) => c !== id) }
const customerName = (id: string) => customerOpts.value.find((o) => o.value === id)?.label ?? id

// ─── Customer group ─────────────────────────────────────────────────────────
const groupLabels = computed(() => CONTACT_GROUPS.map((g) => g.name))
const selectedGroupLabels = computed(() =>
  draft.groupIds.map((id) => CONTACT_GROUPS.find((g) => g.id === id)?.name).filter((n): n is string => !!n))
function onGroups(names: string[]) {
  draft.groupIds = names.map((n) => CONTACT_GROUPS.find((g) => g.name === n)?.id).filter((v): v is string => !!v)
}

// ─── Footer ─────────────────────────────────────────────────────────────────
function close() { emit('update:isOpen', false) }
function resetAll() {
  const keepAsOf = draft.asOf
  const keepPeriod = period.value
  Object.assign(draft, emptyCmReportFilters(), { asOf: keepAsOf })
  period.value = keepPeriod
  amounts.contact = emptyAmount(); amounts.memo = emptyAmount()
  errors.contact = undefined; errors.memo = undefined
}
function apply() {
  const c = fromDraft(amounts.contact)
  const m = fromDraft(amounts.memo)
  const next: CmReportFilters = {
    ...clone(draft),
    contactCmp: c.cmp, contactMin: c.min, contactMax: c.max,
    memoCmp: m.cmp, memoMin: m.min, memoMax: m.max,
    memoNumber: draft.memoNumber.trim(),
  }
  const v = validateFilters(next)
  errors.contact = v.contact; errors.memo = v.memo
  if (v.contact || v.memo) return // stay open; captions explain the fix
  emit('apply', next)
  close()
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" :title="t('All filters')" @close="close">
    <template #body>
      <!-- 1. As of date — single date, no lower bound. -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">{{ t('As of date') }}</span>
        <MpDatePicker
          :id="`${id}-asof`" v-model="asOfDmy"
          format="DD/MM/YYYY" value-type="format"
          use-portal is-full-width
        />
        <span class="cmfd-hint">{{ t('Balances are shown as they stood at the end of this date. Every memo issued on or before it is included.') }}</span>
      </div>

      <!-- 2. Period — preset sets the As of date; editing the date returns to Custom. -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">{{ t('Period') }}</span>
        <ErpFilterSelect
          :id="`${id}-period`" :model-value="period" :options="periodOptions"
          :placeholder="t('Custom')" width="100%" :is-clearable="false"
          @update:model-value="onPeriod"
        />
      </div>

      <!-- 3. Transaction type -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">{{ t('Transaction type') }}</span>
        <ErpFilterSelect
          :id="`${id}-doctype`" :model-value="draft.docType" :options="docTypeOptions"
          :placeholder="t('Credit memo & debit memo')" width="100%" :is-clearable="false"
          @update:model-value="onDocType"
        />
      </div>

      <!-- 4. Customer — multi-select + removable chips -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">{{ t('Customer') }}</span>
        <MultiSelectDropdown
          :id="`${id}-customer`" :model-value="selectedCustomerLabels" :options="customerLabels"
          :placeholder="t('Choose customer')" is-full-width
          @update:model-value="onCustomers"
        />
        <!-- Selected customers — closable gray MpTag (rule/tag-gray-only), not hand-rolled chips. -->
        <div v-if="draft.contactIds.length > 1" class="cmfd-chips" data-devchange="cm-report-patterns">
          <MpTag v-for="cid in draft.contactIds" :key="cid" as="span" is-closable @close="removeCustomer(cid)">{{ customerName(cid) }}</MpTag>
        </div>
      </div>

      <!-- 5. Customer group — multi-select + Include all / Either -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">{{ t('Customer group') }}</span>
        <MultiSelectDropdown
          :id="`${id}-group`" :model-value="selectedGroupLabels" :options="groupLabels"
          :placeholder="t('Choose customer group')" is-full-width
          @update:model-value="onGroups"
        />
        <div class="cmfd-radios" role="radiogroup" :aria-label="t('Customer group')">
          <MpRadio :id="`${id}-gm-all`" :name="`${id}-groupmode`" value="all" :is-checked="draft.groupMode === 'all'" @change="draft.groupMode = 'all'">
            {{ t('Include all') }}
          </MpRadio>
          <MpRadio :id="`${id}-gm-either`" :name="`${id}-groupmode`" value="either" :is-checked="draft.groupMode === 'either'" @change="draft.groupMode = 'either'">
            {{ t('Either') }}
          </MpRadio>
          <MpTooltip :id="`${id}-gm-tip`" :label="t('Include all: the customer must belong to every selected group. Either: any one group is enough.')" placement="top" use-portal>
            <span class="cmfd-info" tabindex="0"><MpIcon name="info" size="sm" /></span>
          </MpTooltip>
        </div>
      </div>

      <!-- 6. Customer remaining balance -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">{{ t('Customer remaining balance') }}</span>
        <AmountComparatorField
          :id="`${id}-cbal`" data-devchange="cm-report-patterns"
          :comparator="amounts.contact.cmp" :value="amounts.contact.value" :min="amounts.contact.min" :max="amounts.contact.max"
          @update:comparator="amounts.contact.cmp = $event" @update:value="amounts.contact.value = $event"
          @update:min="amounts.contact.min = $event" @update:max="amounts.contact.max = $event"
        />
        <p v-if="errors.contact" class="cmfd-error" role="alert">{{ t(errors.contact) }}</p>
      </div>

      <!-- 7. Credit memo balance -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">{{ t('Credit memo balance') }}</span>
        <AmountComparatorField
          :id="`${id}-mbal`" data-devchange="cm-report-patterns"
          :comparator="amounts.memo.cmp" :value="amounts.memo.value" :min="amounts.memo.min" :max="amounts.memo.max"
          @update:comparator="amounts.memo.cmp = $event" @update:value="amounts.memo.value = $event"
          @update:min="amounts.memo.min = $event" @update:max="amounts.memo.max = $event"
        />
        <p v-if="errors.memo" class="cmfd-error" role="alert">{{ t(errors.memo) }}</p>
      </div>

      <!-- 8. Credit memo number — Enter applies -->
      <div class="cmfd-field">
        <span class="cmfd-field-label">{{ t('Credit memo number') }}</span>
        <MpInput
          :id="`${id}-number`" v-model="draft.memoNumber" :aria-label="t('Search credit memo number')"
          is-full-width @keydown.enter.prevent="apply"
        />
      </div>

      <!-- 9. Show Rp 0 balances -->
      <div class="cmfd-checks">
        <MpCheckbox :id="`${id}-zero-contacts`" :is-checked="draft.showZeroContacts" @change="draft.showZeroContacts = !draft.showZeroContacts">
          {{ t('Show customers with Rp 0 balance') }}
        </MpCheckbox>
        <MpCheckbox :id="`${id}-zero-memos`" :is-checked="draft.showZeroMemos" @change="draft.showZeroMemos = !draft.showZeroMemos">
          {{ t('Show credit memos with Rp 0 balance') }}
        </MpCheckbox>
      </div>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="resetAll">{{ t('Reset filter') }}</MpButton>
      <div class="cmfd-foot-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">{{ t('Cancel') }}</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">{{ t('Apply') }}</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
/* Tokens only (rule/token-no-hardcoded-*). */
.cmfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cmfd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.cmfd-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }

.cmfd-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); margin-top: var(--mp-spacing-1); }

.cmfd-radios { display: flex; align-items: center; gap: var(--mp-spacing-6); margin-top: var(--mp-spacing-2); }
.cmfd-info { display: inline-flex; align-items: center; color: var(--mp-text-subtle); cursor: help; }

.cmfd-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-danger); }

.cmfd-checks { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cmfd-foot-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
