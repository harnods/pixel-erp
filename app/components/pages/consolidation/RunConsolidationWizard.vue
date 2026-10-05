<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/run_consolidation/index.vue (+ import_balance_sheet, set_rate, account_mapping, intercompany_elimination, components/run-consol-popover) -->
<script setup lang="ts">
/**
 * Run consolidation — prod's stepper flow for one consolidation:
 * Trial Balance Data (spreadsheet units) → Conversion rate (foreign-currency
 * units) → Account mapping → Intercompany eliminations. Save as draft keeps
 * the step; Run asks for confirmation, then the consolidation goes to
 * In Progress and completes a moment later.
 */
import {
  MpButton, MpIcon, MpInput, MpCheckbox, MpToggle, MpTooltip,
  MpBanner, MpBannerIcon, MpBannerDescription, MpTabs, MpTabList, MpTab,
} from '@mekari/pixel3'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { infoToast, successToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import {
  consolUnits, consolAccounts, unitAccounts, eliminationRules, entryFromRule, entryTotals, legBalance,
  unitName, sideOf, DEFAULT_RATES, formatPeriod,
  type Consolidation, type EliminationEntry, type ReportSide,
} from '~/data/consolidation'

const props = defineProps<{ consolidation: Consolidation }>()
const emit = defineEmits<{ leave: []; draft: []; run: [] }>()
const { t } = useLocale()

const c = props.consolidation
const units = computed(() => c.unitIds.map((id) => consolUnits.find((u) => u.id === id)).filter(Boolean) as typeof consolUnits)

// ─── Steps (same rules as prod's run_consolidation/index.vue) ────────────────
type StepKey = 'trial_balance' | 'rate' | 'mapping' | 'elimination'
const steps = computed(() => {
  const s: { key: StepKey; label: string }[] = []
  if (units.value.some((u) => u.dataSource === 'spreadsheet')) s.push({ key: 'trial_balance', label: t('Trial Balance Data') })
  if (units.value.some((u) => u.currency !== c.currency)) s.push({ key: 'rate', label: t('Conversion rate') })
  s.push({ key: 'mapping', label: t('Account mapping') })
  s.push({ key: 'elimination', label: t('Intercompany eliminations') })
  return s
})
const stepIndex = ref(Math.min(c.draftStep ?? 0, steps.value.length - 1))
const current = computed(() => steps.value[stepIndex.value]!.key)
const done = computed(() => steps.value.slice(0, stepIndex.value).map((s) => s.key))
const isFirst = computed(() => stepIndex.value === 0)
const isLast = computed(() => stepIndex.value === steps.value.length - 1)
function selectStep(key: string) { stepIndex.value = steps.value.findIndex((s) => s.key === key) }

// ─── Trial balance data ──────────────────────────────────────────────────────
const spreadsheetUnits = computed(() => units.value.filter((u) => u.dataSource === 'spreadsheet'))
const tbError = ref('')
function notInPrototype() { infoToast(t('Not in this prototype')) }

// ─── Conversion rate ─────────────────────────────────────────────────────────
const fxUnits = computed(() => units.value.filter((u) => u.currency !== c.currency))
const rateDraft = reactive<Record<string, { closing: string; average: string }>>({})
for (const u of fxUnits.value) {
  const saved = c.rates.find((r) => r.unitId === u.id)
  const def = DEFAULT_RATES[u.currency] ?? { closingRate: 1, averageRate: 1 }
  rateDraft[u.id] = { closing: String(saved?.closingRate ?? def.closingRate), average: String(saved?.averageRate ?? def.averageRate) }
}
const rateErrors = reactive<Record<string, string>>({})
function resetRates() {
  for (const u of fxUnits.value) {
    const def = DEFAULT_RATES[u.currency] ?? { closingRate: 1, averageRate: 1 }
    rateDraft[u.id] = { closing: String(def.closingRate), average: String(def.averageRate) }
  }
}
function validateRates(): boolean {
  let ok = true
  for (const u of fxUnits.value) {
    for (const k of ['closing', 'average'] as const) {
      const key = `${u.id}-${k}`
      const n = Number(rateDraft[u.id]![k])
      rateErrors[key] = !(n > 0) ? t('Value must be greater than zero') : ''
      if (rateErrors[key]) ok = false
    }
  }
  return ok
}
function commitRates() {
  c.rates = fxUnits.value.map((u) => ({ unitId: u.id, closingRate: Number(rateDraft[u.id]!.closing), averageRate: Number(rateDraft[u.id]!.average) }))
}

// ─── Account mapping ─────────────────────────────────────────────────────────
const mapTab = ref<ReportSide>('pl')
const mapTabData = computed(() => [
  { id: 'map-pl', label: t('Profit & Loss Accounts'), value: 'pl' },
  { id: 'map-bs', label: t('Balance Sheet Accounts'), value: 'bs' },
])
const mapTabIndex = computed({ get: () => (mapTab.value === 'pl' ? 0 : 1), set: (i: number) => { mapTab.value = i === 0 ? 'pl' : 'bs' } })
const unmappedOnly = ref(false)
const mappingRows = computed(() => unitAccounts
  .filter((a) => c.unitIds.includes(a.unitId) && a.side === mapTab.value)
  .filter((a) => !unmappedOnly.value || !a.mappedTo))
const mappingAll = computed(() => unitAccounts.filter((a) => c.unitIds.includes(a.unitId)))
const mappedCount = computed(() => mappingAll.value.filter((a) => a.mappedTo).length)
const unmappedUnits = computed(() => [...new Set(mappingAll.value.filter((a) => !a.mappedTo).map((a) => unitName(a.unitId)))])
const targetOptions = computed(() => consolAccounts
  .filter((a) => sideOf(a.categoryId) === mapTab.value)
  .map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` })))
const mappingError = ref('')
function automaticMapping() {
  // Match on account name first, then on the first consolidation account of the same report side.
  let n = 0
  for (const a of mappingAll.value.filter((x) => !x.mappedTo)) {
    const byName = consolAccounts.find((x) => x.name.toLowerCase() === a.name.toLowerCase())
    const fallback = a.side === 'pl'
      ? consolAccounts.find((x) => x.id === (a.code.startsWith('6') ? 'ca-ga' : 'ca-rev'))
      : consolAccounts.find((x) => x.id === 'ca-other')
    const target = byName ?? fallback
    if (target) { a.mappedTo = target.id; n++ }
  }
  successToast(n ? `${n} ${t('accounts mapped')}` : t('All accounts are already mapped'))
  mappingError.value = ''
}
const resetOpen = ref(false)
function confirmReset() {
  for (const a of mappingAll.value) a.mappedTo = null
  successToast(t('Mapping reset successfully'))
}

// ─── Intercompany eliminations ───────────────────────────────────────────────
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const entries = ref<EliminationEntry[]>(c.eliminations.length
  ? clone(c.eliminations)
  : eliminationRules
    .filter((r) => r.status === 'active' && [r.source, ...r.destinations].every((l) => c.unitIds.includes(l.unitId)))
    .map(entryFromRule))
const unitOptions = computed(() => units.value.map((u) => ({ value: u.id, label: u.name })))
const accountOptions = computed(() => consolAccounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` })))
const elimError = ref('')
function addElimination() {
  entries.value.push({ ruleId: null, name: `${t('Elimination')} ${entries.value.length + 1}`, recurring: false, lines: [
    { unitId: '', accountId: '', debit: 0, credit: 0 },
    { unitId: '', accountId: '', debit: 0, credit: 0 },
  ] })
}
function removeElimination(i: number) { entries.value.splice(i, 1) }
function addLine(e: EliminationEntry) { e.lines.push({ unitId: '', accountId: '', debit: 0, credit: 0 }) }
function loadBalance(e: EliminationEntry) {
  const legs = e.lines.filter((l) => l.unitId && l.accountId)
  if (!legs.length) { elimError.value = t('No rows with business unit and account selected to load balance for.'); return }
  for (const l of legs) {
    const bal = legBalance({ unitId: l.unitId, accountId: l.accountId })
    const acc = consolAccounts.find((a) => a.id === l.accountId)
    const debitNature = acc ? [1, 2, 3, 4, 5, 6, 7, 15, 16, 17].includes(acc.categoryId) : true
    if (debitNature) { l.credit = bal; l.debit = 0 } else { l.debit = bal; l.credit = 0 }
  }
  elimError.value = ''
}
function loadAllBalance() {
  entries.value.forEach(loadBalance)
  if (!elimError.value) successToast(t('Balances loaded for all elimination rules.'))
}
const unbalanced = computed(() => entries.value.map((e, i) => ({ i, ...entryTotals(e) })).filter((x) => Math.abs(x.debit - x.credit) > 0.5))
function numberInput(v: string | number): number { const n = Number(String(v).replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0 }

// ─── Footer actions ──────────────────────────────────────────────────────────
function validateStep(): boolean {
  if (current.value === 'trial_balance') {
    const missing = spreadsheetUnits.value.filter((u) => !u.trialBalanceFile)
    tbError.value = missing.length ? `${t('Upload template')}: ${missing.map((u) => u.name).join(', ')}` : ''
    return !missing.length
  }
  if (current.value === 'rate') { const ok = validateRates(); if (ok) commitRates(); return ok }
  if (current.value === 'mapping') {
    const left = mappingAll.value.filter((a) => !a.mappedTo).length
    mappingError.value = left ? `${left} ${t('accounts are not mapped yet. Map every account to continue.')}` : ''
    return !left
  }
  return true
}
function next() { if (validateStep()) stepIndex.value++ }
function back() { stepIndex.value-- }
const leaveOpen = ref(false)
function saveDraft() {
  if (current.value === 'rate') commitRates()
  c.eliminations = clone(entries.value)
  c.draftStep = stepIndex.value
  emit('draft')
}
const runOpen = ref(false)
function requestRun() {
  if (unbalanced.value.length) {
    elimError.value = `${t('Debit and credit must match for')} ${unbalanced.value.map((u) => entries.value[u.i]!.name).join(', ')}.`
    return
  }
  if (entries.value.some((e) => e.lines.some((l) => !l.unitId || !l.accountId))) {
    elimError.value = t('Select a business unit and account on every elimination row.')
    return
  }
  elimError.value = ''
  runOpen.value = true
}
function confirmRun() {
  c.eliminations = clone(entries.value).map((e) => ({ ...e, lines: e.lines.filter((l) => l.debit || l.credit) }))
  // "Set as Recurring" saves a new elimination into Elimination rules.
  for (const e of entries.value.filter((x) => x.recurring && !x.ruleId)) {
    const [src, ...dest] = e.lines
    if (!src) continue
    eliminationRules.push({
      id: `er-${Date.now()}-${Math.round(Math.random() * 999)}`, name: e.name,
      source: { unitId: src.unitId, accountId: src.accountId },
      destinations: dest.map((d) => ({ unitId: d.unitId, accountId: d.accountId })),
      status: 'active', updatedAt: new Date().toISOString(), updatedBy: 'Rizal Candra',
    })
  }
  delete c.draftStep
  emit('run')
}
</script>

<template>
  <div class="rc">
    <div class="rc-head">
      <span class="cell-link rc-back" @click="leaveOpen = true">{{ t('Consolidations') }}</span>
      <h2 class="rc-title">{{ t('Run consolidation') }}</h2>
      <p class="rc-sub">{{ c.name }} · {{ formatPeriod(c) }} · {{ c.currency }}</p>
    </div>

    <ErpStepper :steps="steps" :current="current" :done="done" @select="selectStep" />

    <!-- ── Trial balance data ── -->
    <section v-if="current === 'trial_balance'" class="rc-step">
      <div>
        <h3 class="rc-step-title">{{ t('Trial balance data') }}</h3>
        <p class="rc-step-desc">{{ t('Please upload data for the period') }} {{ formatPeriod(c) }} {{ t('using our template to ensure your file format is correct.') }}</p>
      </div>
      <div><MpButton variant="secondary" is-rounded @click="notInPrototype">{{ t('Download template') }}</MpButton></div>
      <div v-for="u in spreadsheetUnits" :key="u.id" class="rc-upload">
        <span class="rc-field-label">{{ t('Upload template') }}: {{ u.name }}</span>
        <div class="rc-file">
          <MpIcon name="doc" size="md" />
          <span class="rc-file-name">{{ u.trialBalanceFile || t('Select file') }}</span>
          <MpButton variant="ghost" is-rounded @click="notInPrototype">{{ u.trialBalanceFile ? t('Replace') : t('Select file') }}</MpButton>
        </div>
        <span class="rc-hint">{{ t('File must be in XLS, XLSX, or CSV format maximum 5 MB') }}</span>
      </div>
      <p v-if="tbError" class="rc-error">{{ tbError }}</p>
    </section>

    <!-- ── Conversion rate ── -->
    <section v-else-if="current === 'rate'" class="rc-step">
      <div>
        <h3 class="rc-step-title">{{ t('Conversion rate') }}</h3>
        <p class="rc-step-desc">{{ t('Enter average and closing rates to convert business unit currencies to the consolidation group currency.') }}</p>
      </div>
      <div class="rc-rate-ref">
        <span>{{ t('Reference rate:') }} <a class="cell-link" href="https://www.bi.go.id/id/statistik/informasi-kurs/transaksi-bi/default.aspx" target="_blank" rel="noopener noreferrer">{{ t('Kurs Tengah BI') }}</a></span>
        <MpButton variant="ghost" is-rounded @click="resetRates">{{ t('Reset rates') }}</MpButton>
      </div>
      <table class="rc-table">
        <thead>
          <tr>
            <th>{{ t('Unit code') }}</th>
            <th>{{ t('Unit name') }}</th>
            <th>{{ t('Currency') }}</th>
            <th class="rc-num">
              <MpTooltip :label="t('Exchange rate at the end of the consolidation period used for balance sheet accounts.')" placement="top">
                <span class="rc-th-help">{{ t('Closing rate') }}</span>
              </MpTooltip>
            </th>
            <th class="rc-num">
              <MpTooltip :label="t('Average daily exchange rate during the consolidation period used for profit and loss accounts.')" placement="top">
                <span class="rc-th-help">{{ t('Average rate') }}</span>
              </MpTooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in fxUnits" :key="u.id">
            <td>{{ u.code }}</td>
            <td>{{ u.name }}</td>
            <td>{{ u.currency }}</td>
            <td class="rc-num">
              <MpInput :id="`rc-close-${u.id}`" v-model="rateDraft[u.id]!.closing" :is-invalid="!!rateErrors[`${u.id}-closing`]" class="rc-rate-input" />
              <span class="rc-hint">1 {{ u.currency }} = {{ rateDraft[u.id]!.closing || 0 }} {{ c.currency }}</span>
              <span v-if="rateErrors[`${u.id}-closing`]" class="rc-error">{{ rateErrors[`${u.id}-closing`] }}</span>
            </td>
            <td class="rc-num">
              <MpInput :id="`rc-avg-${u.id}`" v-model="rateDraft[u.id]!.average" :is-invalid="!!rateErrors[`${u.id}-average`]" class="rc-rate-input" />
              <span class="rc-hint">1 {{ u.currency }} = {{ rateDraft[u.id]!.average || 0 }} {{ c.currency }}</span>
              <span v-if="rateErrors[`${u.id}-average`]" class="rc-error">{{ rateErrors[`${u.id}-average`] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ── Account mapping ── -->
    <section v-else-if="current === 'mapping'" class="rc-step">
      <MpBanner v-if="unmappedUnits.length" id="rc-map-banner" variant="warning" is-inline>
        <MpBannerIcon id="rc-map-banner-icon" />
        <MpBannerDescription>{{ t('There are new accounts in') }} {{ unmappedUnits.join(', ') }} {{ t('that need to be mapped.') }}</MpBannerDescription>
      </MpBanner>
      <div class="rc-map-bar">
        <MpTabs id="rc-map-tabs" v-model="mapTabIndex" is-manual variant-color="green">
          <MpTabList>
            <MpTab v-for="tab in mapTabData" :id="tab.id" :key="tab.id" :value="tab.value">{{ tab.label }}</MpTab>
          </MpTabList>
        </MpTabs>
        <div class="rc-map-actions">
          <span class="rc-badge">{{ mappedCount }}/{{ mappingAll.length }} {{ t('mapped') }}</span>
          <MpButton variant="ghost" is-rounded @click="resetOpen = true">{{ t('Reset mapping') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="automaticMapping">{{ t('Automatic Mapping') }}</MpButton>
        </div>
      </div>
      <div class="rc-toggle">
        <MpToggle id="rc-unmapped" v-model:is-checked="unmappedOnly" />
        <span>{{ t('Show only unmapped accounts') }}</span>
      </div>
      <table class="rc-table">
        <thead>
          <tr>
            <th>{{ t('Business Unit') }}</th>
            <th>{{ t('Account no.') }}</th>
            <th>{{ t('Account name') }}</th>
            <th>{{ t('Select consolidation account') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in mappingRows" :key="`${a.unitId}-${a.code}`" :class="{ 'rc-row--warn': !a.mappedTo }">
            <td>{{ unitName(a.unitId) }}</td>
            <td>{{ a.code }}</td>
            <td>{{ a.name }}</td>
            <td class="rc-select-cell">
              <ErpFilterSelect
                :id="`rc-map-${a.unitId}-${a.code}`"
                :model-value="a.mappedTo ?? ''"
                :placeholder="t('Select consolidation account')"
                :options="targetOptions"
                width="100%"
                @update:model-value="(v: string) => { a.mappedTo = v || null; mappingError = '' }"
              />
            </td>
          </tr>
          <tr v-if="!mappingRows.length">
            <td colspan="4" class="rc-empty">{{ unmappedOnly ? t('All accounts are already mapped') : t('There are no accounts available to map yet.') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="mappingError" class="rc-error">{{ mappingError }}</p>
    </section>

    <!-- ── Intercompany eliminations ── -->
    <section v-else class="rc-step">
      <div class="rc-elim-head">
        <div>
          <h3 class="rc-step-title">{{ t('Intercompany Eliminations') }}</h3>
          <p class="rc-step-desc">{{ t('Fill in intercompany eliminations for the consolidation report.') }}</p>
        </div>
        <MpButton variant="secondary" is-rounded @click="loadAllBalance">{{ t('Load all balance') }}</MpButton>
      </div>

      <div v-for="(e, ei) in entries" :key="ei" class="rc-elim">
        <div class="rc-elim-bar">
          <MpInput :id="`rc-elim-name-${ei}`" v-model="e.name" class="rc-elim-name" :aria-label="t('Elimination name')" />
          <div class="rc-elim-bar-right">
            <MpCheckbox :id="`rc-elim-rec-${ei}`" :is-checked="e.recurring" :is-disabled="!!e.ruleId" @change="e.recurring = !e.recurring">{{ t('Set as Recurring') }}</MpCheckbox>
            <MpButton variant="ghost" is-rounded @click="loadBalance(e)">{{ t('Load Balance') }}</MpButton>
            <MpButton variant="ghost" is-rounded @click="removeElimination(ei)">{{ t('Remove Elimination') }}</MpButton>
          </div>
        </div>
        <table class="rc-table">
          <thead>
            <tr>
              <th>{{ t('Business Unit') }}</th>
              <th>{{ t('Account') }}</th>
              <th class="rc-num">{{ t('Debit') }}</th>
              <th class="rc-num">{{ t('Credit') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, li) in e.lines" :key="li">
              <td class="rc-select-cell">
                <ErpFilterSelect :id="`rc-el-${ei}-${li}-bu`" :model-value="l.unitId" :placeholder="t('Select business unit')" :options="unitOptions" width="100%" @update:model-value="(v: string) => (l.unitId = v)" />
              </td>
              <td class="rc-select-cell">
                <ErpFilterSelect :id="`rc-el-${ei}-${li}-acc`" :model-value="l.accountId" :placeholder="t('Select account')" :options="accountOptions" width="100%" @update:model-value="(v: string) => (l.accountId = v)" />
              </td>
              <td class="rc-num"><MpInput :id="`rc-el-${ei}-${li}-dr`" :model-value="String(l.debit)" class="rc-amt-input" @update:model-value="(v: string) => (l.debit = numberInput(v))" /></td>
              <td class="rc-num"><MpInput :id="`rc-el-${ei}-${li}-cr`" :model-value="String(l.credit)" class="rc-amt-input" @update:model-value="(v: string) => (l.credit = numberInput(v))" /></td>
            </tr>
            <tr class="rc-total">
              <td colspan="2"><span class="cell-link" @click="addLine(e)">+ {{ t('Add Business Unit') }}</span></td>
              <td class="rc-num">{{ formatIDR(entryTotals(e).debit) }}</td>
              <td class="rc-num">{{ formatIDR(entryTotals(e).credit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div><MpButton variant="secondary" is-rounded left-icon="add" @click="addElimination">{{ t('Add Elimination') }}</MpButton></div>
      <p v-if="elimError" class="rc-error">{{ elimError }}</p>
    </section>

    <!-- ── Footer ── -->
    <div class="rc-footer">
      <MpButton v-if="!isFirst" variant="ghost" is-rounded @click="back">{{ t('Back') }}</MpButton>
      <span v-else />
      <div class="rc-footer-right">
        <MpButton variant="ghost" is-rounded @click="leaveOpen = true">{{ t('Cancel') }}</MpButton>
        <MpButton variant="secondary" is-rounded @click="saveDraft">{{ t('Save as draft') }}</MpButton>
        <MpButton v-if="!isLast" variant="primary" is-rounded @click="next">{{ t('Continue') }}</MpButton>
        <MpButton v-else variant="primary" is-rounded @click="requestRun">{{ t('Run consolidation') }}</MpButton>
      </div>
    </div>
  </div>

  <ConfirmModal
    v-model:is-open="leaveOpen"
    :title="t('Leave this page?')"
    :description="t('The data you have entered will not be saved.')"
    :confirm-label="t('Leave')"
    :cancel-label="t('Continue editing')"
    @confirm="emit('leave')"
  />
  <ConfirmModal
    v-model:is-open="resetOpen"
    :title="t('Reset mapping?')"
    :description="t('Your existing account mappings will be removed. This action cannot be undone.')"
    :confirm-label="t('Reset mapping')"
    @confirm="confirmReset"
  />
  <ConfirmModal
    v-model:is-open="runOpen"
    :title="t('Run consolidation?')"
    :description="t('Ensure debit and credit amounts are matched with your intercompany transactions.')"
    :confirm-label="t('Run')"
    :is-danger="false"
    @confirm="confirmRun"
  />
</template>

<style scoped>
.rc { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.rc-head { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.rc-back { align-self: flex-start; font-size: var(--mp-font-sizes-md); }
.rc-title { margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rc-sub { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.rc-step { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.rc-step-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rc-step-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.rc-field-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rc-hint { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rc-error { margin: 0; display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.rc-upload { display: flex; flex-direction: column; gap: var(--mp-spacing-1); max-width: var(--mp-sizes-xl, 576px); }
.rc-file {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.rc-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--mp-font-sizes-md); }
.rc-rate-ref { display: flex; align-items: center; justify-content: space-between; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.rc-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.rc-table th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3); text-align: left;
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
}
.rc-table td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3); vertical-align: top;
  border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.rc-table tbody tr:last-child td { border-bottom: none; }
.rc-num { text-align: right !important; }
.rc-th-help { border-bottom: 1px dashed var(--mp-border-bold, currentColor); cursor: help; }
.rc-rate-input, .rc-amt-input { width: var(--mp-sizes-40, 160px); margin-left: auto; text-align: right; }
.rc-select-cell { min-width: var(--mp-sizes-56, 224px); }
.rc-row--warn td { background: var(--mp-colors-background-warning); }
.rc-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6) !important; }
.rc-total td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); }

.rc-map-bar { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); }
  position: relative; padding: var(--mp-spacing-2) 0; border: none; background: none; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); font-family: inherit;
}
.rc-map-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-2); }
.rc-badge {
  padding: var(--mp-spacing-0\.5, 2px) var(--mp-spacing-2); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
}
.rc-toggle { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); }

.rc-elim-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); }
.rc-elim { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rc-elim-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.rc-elim-name { max-width: var(--mp-sizes-96, 384px); }
.rc-elim-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.rc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.rc-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
