<script setup lang="ts">
/**
 * Groups: staff who share the same Talenta values (Organization, Branch, ...) form a group, and
 * each group picks where its pay posts in Jurnal: an expense account (for pay items set to Use
 * group account) and dimension values for the cost lines.
 *
 * - "Group staff by" card: one row per chosen field with the dimension it fills. Only the five
 *   fields in GROUP_FIELDS; Job position and Job level are left out, since a group can be one
 *   person and the ledger would show that person's pay.
 * - Groups table: one row per combination Talenta sent, banded "From Talenta" | "Posts to in
 *   Jurnal". A New row (nobody set it up) does not hold the run: its pay posts to each pay item's
 *   default account until it is set up. A row covering 1 or 2 staff carries a warning, no block.
 * - Filters (All / New / 1 or 2 staff + search) and bulk edit over the selected rows, so nobody
 *   sets every combination one by one.
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpButton, MpCheckbox, MpIcon, MpTooltip } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollColumnFilter from '~/components/payroll/PayrollColumnFilter.vue'
import PayrollReadOnlyNote from '~/components/payroll/PayrollReadOnlyNote.vue'
import { successToast, errorToast } from '~/utils/toasts'
import {
  payroll, can, accountLabel, groupRows, setGroupBy, setGroupAccount, setGroupDimension, saveGroup,
  linkDimension, payrollDimensions, createPayrollTag, useChartAccount, payrollAccount, type GroupRow,
} from '~/data/payrollStore'
import type { TalentaField } from '~/data/payrollMaster'
import {
  accountChoices, fieldSent, GROUP_FIELDS, isGroupField, groupFieldLabel, fewStaff, fewStaffMessage, groupMatches,
} from '~/data/payrollUiSettings'
import { statusLabel, statusType } from '~/data/payrollUiRunCopy'

const { t } = useLocale()
const canEdit = computed(() => can('setup'))
const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '-')
const fieldLabel = (f: string) => t(groupFieldLabel(f))
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

// ── Group staff by ──
const groupBy = computed(() => payroll.settings.groupBy)
const fieldRows = computed(() => groupBy.value.map((f) => ({
  field: f,
  allowed: isGroupField(f),
  link: payroll.settings.dimensionLinks.find((l) => l.field === f) ?? null,
})))
/** Allowed fields not chosen yet; a field Talenta never sent is left out (it would make one empty group). */
const addOptions = computed(() => GROUP_FIELDS
  .filter((f) => !groupBy.value.includes(f) && fieldSent(f))
  .map((f) => ({ value: f, label: fieldLabel(f) })))
const addPick = ref('')
function applyGroupBy(next: TalentaField[], toast: string) {
  const r = setGroupBy(next)
  if (r.ok) successToast(t(toast))
  else errorToast(t(r.message ?? 'Not saved. Try again.'))
}
function addField(v: string) {
  addPick.value = ''
  if (!v || !isGroupField(v) || groupBy.value.includes(v as TalentaField)) return
  applyGroupBy([...groupBy.value, v as TalentaField], `Staff now grouped by ${listOf([...groupBy.value, v].map(groupFieldLabel))}`)
}
function removeField(f: TalentaField) {
  const next = groupBy.value.filter((x) => x !== f)
  applyGroupBy(next, next.length ? `Staff now grouped by ${listOf(next.map(groupFieldLabel))}` : 'Groups turned off')
}
function listOf(xs: string[]): string {
  return xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}
function dimOptions(label: string) {
  const dims = payrollDimensions()
  const opts = [{ value: '', label: t('No dimension') }, ...dims.map((d) => ({ value: d, label: d }))]
  if (!dims.includes(label)) opts.push({ value: `new:${label}`, label: t(`Create dimension ${label}`) })
  return opts
}
const dimError = ref('')
function onLink(field: TalentaField, v: string) {
  const dim = v.startsWith('new:') ? v.slice(4) : v
  const r = linkDimension(field, dim || null)
  dimError.value = r.ok ? '' : t(r.message ?? 'Not saved. Pick another dimension.')
  if (r.ok) successToast(dim ? t(`${fieldLabel(field)} fills ${dim}`) : t(`${fieldLabel(field)} fills no dimension`))
}

// ── Group rows ──
const rows = computed(() => groupRows())
/** The dimension columns of the "Posts to in Jurnal" band. */
const dimColumns = computed(() => rows.value[0]?.dimensions.map((d) => d.dimension)
  ?? fieldRows.value.filter((d) => d.link).map((d) => d.link!.dimension))
const newCount = computed(() => rows.value.filter((r) => r.isNew).length)
const fewCount = computed(() => rows.value.filter((r) => fewStaff(r)).length)

type Filter = 'all' | 'new' | 'few'
const filter = ref<Filter>('all')
const search = ref('')
const filters = computed(() => [
  { key: 'all' as const, label: t('All'), n: rows.value.length },
  { key: 'new' as const, label: t('New'), n: newCount.value },
  { key: 'few' as const, label: t('1 or 2 staff'), n: fewCount.value },
])
// Column filters under each From Talenta header: pick one or more values; none picked = all.
const colFilters = reactive<Record<string, string[]>>({})
const colOptions = (i: number) => [...new Set(rows.value.map((r) => valueText(r.values[i] ?? '')))].sort((a, b) => a.localeCompare(b))
const colActive = computed(() => groupBy.value.some((f) => (colFilters[f]?.length ?? 0) > 0))
const matchesCols = (r: GroupRow) => groupBy.value.every((f, i) => !(colFilters[f]?.length) || colFilters[f]!.includes(valueText(r.values[i] ?? '')))
const visibleRows = computed(() => rows.value.filter((r) =>
  (filter.value === 'all' || (filter.value === 'new' ? r.isNew : !!fewStaff(r))) && groupMatches(r.values, search.value) && matchesCols(r)))
const filtered = computed(() => filter.value !== 'all' || !!search.value.trim() || colActive.value)
function clearFilters() { filter.value = 'all'; search.value = ''; for (const k of Object.keys(colFilters)) colFilters[k] = [] }
const valueText = (v: string) => v || t('Not set')

// ── Row edits ──
const DEFAULT = '__default'
const costOptions = computed(() => [{ value: DEFAULT, label: t('Use default account'), name: '', type: 'expense' as const }, ...accountChoices(['expense', 'cogs'])])
const rowErrors = reactive<Record<string, string>>({})
function pickAccount(code: string): string | null {
  if (code === DEFAULT || !code) return null
  const o = costOptions.value.find((x) => x.value === code)
  if (o && !payrollAccount(code)) useChartAccount({ code: o.value, name: o.name, type: o.type })
  return code
}
function onAccount(key: string, code: string) {
  const acc = pickAccount(code)
  const r = setGroupAccount(key, acc)
  rowErrors[key] = r.ok ? '' : t(r.message ?? 'Not saved. Pick an expense or COGS account.')
  if (r.ok) successToast(acc ? t(`Group now posts to ${accountLabel(acc)}`) : t('Group uses the default account'))
}
function valueOptions(dimension: string, wanted: string | null) {
  const opts = payroll.tags.filter((x) => x.dimension === dimension).map((x) => ({ value: x.name, label: x.name }))
  if (wanted && !opts.some((o) => o.value.toLowerCase() === wanted.toLowerCase())) opts.push({ value: `new:${wanted}`, label: t(`Create value ${wanted}`) })
  return opts
}
/** The Talenta value a dimension column is matched from, offered as "Create value" when Jurnal has none. */
function rawValue(r: GroupRow, field: string) { return r.values[groupBy.value.indexOf(field as TalentaField)] ?? null }
function resolveValue(dimension: string, v: string): { ok: true; value: string } | { ok: false; message: string } {
  if (!v.startsWith('new:')) return { ok: true, value: v }
  const value = v.slice(4)
  const c = createPayrollTag(dimension, value)
  return c.ok ? { ok: true, value } : { ok: false, message: c.message ?? 'Not created. Try another name.' }
}
function onValue(key: string, dimension: string, v: string) {
  const res = resolveValue(dimension, v)
  if (!res.ok) { rowErrors[key] = t(res.message); return }
  const r = setGroupDimension(key, dimension, res.value || null)
  rowErrors[key] = r.ok ? '' : t(r.message ?? 'Not saved. Pick another value.')
}
function onSave(key: string, label: string) {
  const r = saveGroup(key)
  rowErrors[key] = r.ok ? '' : t(r.message ?? 'Not set up. Try again.')
  if (r.ok) successToast(t(`${label} set up`))
}

// ── Bulk edit ──
const selected = ref<string[]>([])
const isSelected = (key: string) => selected.value.includes(key)
function toggleRow(key: string, on: boolean) {
  selected.value = on ? [...new Set([...selected.value, key])] : selected.value.filter((k) => k !== key)
}
const visibleKeys = computed(() => visibleRows.value.map((r) => r.key))
const allVisibleOn = computed(() => visibleKeys.value.length > 0 && visibleKeys.value.every(isSelected))
const someVisibleOn = computed(() => !allVisibleOn.value && visibleKeys.value.some(isSelected))
function toggleAll(on: boolean) { selected.value = on ? [...visibleKeys.value] : [] }
// Act only on rows the reader can see: a filter or search change drops hidden rows from the selection.
watch(visibleKeys, (keys) => { selected.value = selected.value.filter((k) => keys.includes(k)) })
const selectedNew = computed(() => rows.value.filter((r) => r.isNew && isSelected(r.key)).length)
const bulkAccount = ref('')
const bulkDims = reactive<Record<string, string>>({})
const groupsWord = (n: number) => `${n} ${plural(n, 'group', 'groups')}`
function bulkValueOptions(dimension: string) {
  return [{ value: DEFAULT, label: t('Same name as the Talenta value') }, ...payroll.tags.filter((x) => x.dimension === dimension).map((x) => ({ value: x.name, label: x.name }))]
}
function runBulk(apply: (key: string) => { ok: boolean; message?: string }, done: (n: number) => string) {
  const keys = [...selected.value]
  let ok = 0
  let firstError = ''
  for (const k of keys) {
    const r = apply(k)
    if (r.ok) { ok++; rowErrors[k] = '' } else { rowErrors[k] = t(r.message ?? 'Not saved. Try again.'); firstError ||= rowErrors[k]! }
  }
  if (ok) successToast(t(done(ok)))
  if (ok < keys.length) errorToast(t(`${groupsWord(keys.length - ok)} not saved. ${firstError}`))
  else selected.value = []
}
function onBulkAccount(code: string) {
  bulkAccount.value = ''
  if (!code) return
  const acc = pickAccount(code)
  runBulk((k) => setGroupAccount(k, acc), (n) => acc ? `${groupsWord(n)} now post to ${accountLabel(acc)}` : `${groupsWord(n)} now use the default account`)
}
function onBulkDim(dimension: string, v: string) {
  bulkDims[dimension] = ''
  if (!v) return
  const value = v === DEFAULT ? null : v
  runBulk((k) => setGroupDimension(k, dimension, value), (n) => value ? `${dimension} set to ${value} on ${groupsWord(n)}` : `${dimension} matched by name on ${groupsWord(n)}`)
}
function onBulkSetUp() {
  const keys = new Set(rows.value.filter((r) => r.isNew).map((r) => r.key))
  selected.value = selected.value.filter((k) => keys.has(k))
  runBulk((k) => saveGroup(k), (n) => `${groupsWord(n)} set up`)
}

const NEW_TIP = 'Posts to default accounts until set up.'
const fewTip = (r: GroupRow) => { const n = fewStaff(r); return n ? t(fewStaffMessage(n)) : '' }
</script>

<template>
  <div class="pset-stack">
    <PayrollReadOnlyNote v-if="!canEdit" :text="t('Editing needs Set up access.')" />

    <!-- Group staff by -->
    <div class="pset-card" data-tour="payroll-groupby">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Group staff by') }}</div>
          <div class="pset-card__sub">{{ t('Staff who share these Talenta values form a group. Each group picks where its pay posts.') }}</div>
        </div>
      </div>
      <div class="pset-card__body">
        <table v-if="fieldRows.length" class="pset-table pgr-fields" data-tour="payroll-group-dims">
          <colgroup><col class="pgr-fields__field"><col><col v-if="canEdit" class="pgr-fields__act"></colgroup>
          <thead>
            <tr>
              <th class="pset-th">{{ t('Talenta field') }}</th>
              <th class="pset-th">{{ t('Fills dimension') }}</th>
              <th v-if="canEdit" class="pset-th"><span class="pgr-sr">{{ t('Remove') }}</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in fieldRows" :key="d.field" :data-field="d.field">
              <td class="pset-td pset-td--strong">
                {{ fieldLabel(d.field) }}
                <span v-if="!d.allowed" class="pset-line pset-warn">{{ t('Can\'t group staff. Remove it.') }}</span>
              </td>
              <td class="pset-td">
                <ErpFilterSelect v-if="canEdit" :id="`pgr-dim-${safe(d.field)}`" :model-value="d.link?.dimension ?? ''" :placeholder="t('No dimension')" :options="dimOptions(fieldLabel(d.field))" width="100%" :is-clearable="false" @update:model-value="(v: string) => onLink(d.field, v)" />
                <span v-else>{{ d.link?.dimension ?? t('No dimension') }}</span>
              </td>
              <td v-if="canEdit" class="pset-td pset-td--act">
                <MpButton variant="ghost" size="sm" is-rounded :aria-label="t(`Remove ${groupFieldLabel(d.field)}`)" :data-testid="`pgr-remove-${safe(d.field)}`" @click="removeField(d.field)">
                  <MpIcon name="minus-circular" size="sm" />
                </MpButton>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="pset-hint">{{ t(canEdit ? 'Add a field to start grouping staff.' : 'Staff are not grouped yet.') }}</p>
        <p v-if="dimError" class="pset-error">{{ dimError }}</p>
        <div v-if="canEdit && addOptions.length" class="pgr-add">
          <ErpFilterSelect id="pgr-add-field" :model-value="addPick" :placeholder="t('Add field')" :options="addOptions" width="220px" :is-clearable="false" @update:model-value="addField" />
        </div>
      </div>
    </div>

    <!-- Groups -->
    <div class="pset-card" data-tour="payroll-groups-table">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Groups') }}</div>
          <div class="pset-card__sub">{{ t('Pay items set to Use group account post to the group\'s expense account. A New group posts to default accounts until you set it up.') }}</div>
        </div>
        <ErpStatusBadge v-if="newCount" status="new-group" :label="t(newCount === 1 ? '1 new group' : `${newCount} new groups`)" :type="statusType('new-group')" />
      </div>

      <template v-if="rows.length">
        <!-- Filters -->
        <div class="pgr-bar">
          <div class="pgr-chips" role="group" :aria-label="t('Show groups')">
            <button
              v-for="f in filters" :key="f.key" type="button" class="pgr-chip" :class="{ 'is-on': filter === f.key }"
              :aria-pressed="filter === f.key" :data-filter="f.key" @click="filter = f.key"
            >{{ f.label }} ({{ f.n }})</button>
          </div>
          <div class="pgr-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="pgr-search__input" type="search" :placeholder="t('Search Talenta values')" :aria-label="t('Search Talenta values')">
          </div>
        </div>

        <!-- Bulk edit -->
        <div v-if="canEdit && selected.length" class="pgr-bulk" data-testid="pgr-bulk">
          <span class="pgr-bulk__count">{{ t(`${selected.length} selected`) }}</span>
          <ErpFilterSelect id="pgr-bulk-account" :model-value="bulkAccount" :placeholder="t('Set expense account')" :options="costOptions" width="220px" :is-clearable="false" @update:model-value="onBulkAccount" />
          <ErpFilterSelect
            v-for="c in dimColumns" :id="`pgr-bulk-dim-${safe(c)}`" :key="c" :model-value="bulkDims[c] ?? ''"
            :placeholder="t(`Set ${c}`)" :options="bulkValueOptions(c)" width="176px" :is-clearable="false"
            @update:model-value="(v: string) => onBulkDim(c, v)"
          />
          <MpButton v-if="selectedNew" variant="secondary" size="sm" is-rounded @click="onBulkSetUp">{{ t(selectedNew === 1 ? 'Set up 1 group' : `Set up ${selectedNew} groups`) }}</MpButton>
          <MpButton variant="ghost" size="sm" is-rounded class="pgr-bulk__clear" @click="selected = []">{{ t('Clear selection') }}</MpButton>
        </div>

        <div class="pgr-scroll">
          <table class="pset-table pgr-rows">
            <colgroup>
              <col v-if="canEdit" class="pgr-c-check">
              <col v-for="f in groupBy" :key="f" class="pgr-c-val">
              <col class="pgr-c-num">
              <col class="pgr-c-acct">
              <col v-for="c in dimColumns" :key="c" class="pgr-c-dim">
            </colgroup>
            <thead>
              <tr class="pgr-bands">
                <th v-if="canEdit" rowspan="2" class="pset-th pgr-check">
                  <MpCheckbox id="pgr-check-all" :aria-label="t('Select all groups shown')" :is-checked="allVisibleOn" :is-indeterminate="someVisibleOn" @change="(on: boolean) => toggleAll(on)" />
                </th>
                <th :colspan="groupBy.length + 1" class="pset-th pgr-band pgr-band--talenta" scope="colgroup">{{ t('From Talenta') }}</th>
                <th :colspan="dimColumns.length + 1" class="pset-th pgr-band pgr-band--jurnal" scope="colgroup">{{ t('Posts to in Jurnal') }}</th>
              </tr>
              <tr>
                <th v-for="(f, i) in groupBy" :key="f" class="pset-th pgr-val">
                  <span class="pgr-thf">{{ fieldLabel(f) }}<PayrollColumnFilter
                    :id="`pgr-col-${safe(f)}`" :label="fieldLabel(f)" :model-value="colFilters[f] ?? []" :options="colOptions(i)"
                    @update:model-value="(v: string[]) => (colFilters[f] = v)"
                  /></span>
                </th>
                <th class="pset-th pgr-num">{{ t('Staff') }}</th>
                <th class="pset-th pgr-split pgr-acct">{{ t('Expense account') }}</th>
                <th v-for="c in dimColumns" :key="c" class="pset-th pgr-dim">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in visibleRows" :key="r.key" :data-group="r.key" :aria-label="r.label"
                :data-status="r.isNew ? 'new' : 'set-up'" :class="{ 'is-selected': isSelected(r.key) }"
              >
                <td v-if="canEdit" class="pset-td pgr-check">
                  <MpCheckbox :id="`pgr-check-${safe(r.key)}`" :aria-label="t(`Select ${r.label}`)" :is-checked="isSelected(r.key)" @change="(on: boolean) => toggleRow(r.key, on)" />
                </td>
                <td v-for="(f, i) in groupBy" :key="f" class="pset-td pgr-val">
                  <span :class="{ 'pset-muted': !r.values[i] }">{{ valueText(r.values[i] ?? '') }}</span>
                  <template v-if="i === 0">
                    <!-- The joined values, for screen readers and the guided tour's row lookup. -->
                    <span class="pgr-sr">{{ r.label }}</span>
                    <div v-if="r.isNew" class="pgr-status">
                      <MpTooltip :id="`pgr-new-${safe(r.key)}`" :label="t(NEW_TIP)" placement="top" use-portal>
                        <span tabindex="0" :aria-label="t(NEW_TIP)"><ErpStatusBadge status="new-group" :label="t(statusLabel('new-group'))" :type="statusType('new-group')" /></span>
                      </MpTooltip>
                      <MpButton v-if="canEdit" size="sm" variant="secondary" is-rounded @click="onSave(r.key, r.label)">{{ t('Set up group') }}</MpButton>
                    </div>
                    <span v-if="rowErrors[r.key]" class="pset-line pset-danger">{{ rowErrors[r.key] }}</span>
                  </template>
                </td>
                <td class="pset-td pgr-num">
                  <span class="pgr-staff">
                    <MpTooltip v-if="fewStaff(r)" :id="`pgr-few-${safe(r.key)}`" :label="fewTip(r)" placement="top" use-portal>
                      <span class="pgr-few" tabindex="0" :aria-label="fewTip(r)" :data-few-staff="fewStaff(r)"><MpIcon name="warning-triangle" size="sm" /></span>
                    </MpTooltip>
                    {{ r.staff }}
                  </span>
                </td>
                <td class="pset-td pgr-split pgr-acct">
                  <ErpFilterSelect v-if="canEdit" :id="`pgr-acc-${safe(r.key)}`" :model-value="r.account ?? DEFAULT" :placeholder="t('Use default account')" :options="costOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => onAccount(r.key, v)" />
                  <span v-else>{{ r.account ? accountLabel(r.account) : t('Use default account') }}</span>
                </td>
                <td v-for="d in r.dimensions" :key="d.dimension" class="pset-td pgr-dim">
                  <ErpFilterSelect v-if="canEdit" :id="`pgr-val-${safe(r.key)}-${safe(d.dimension)}`" :model-value="d.value ?? ''" :placeholder="t('Select value')" :options="valueOptions(d.dimension, d.value ?? rawValue(r, d.field))" width="100%" :is-clearable="false" @update:model-value="(v: string) => onValue(r.key, d.dimension, v)" />
                  <span v-else>{{ d.value ?? t('Not set') }}</span>
                </td>
              </tr>
              <tr v-if="!visibleRows.length">
                <td :colspan="(canEdit ? 1 : 0) + groupBy.length + 2 + dimColumns.length" class="pset-td pgr-none">
                  <span>{{ search.trim() ? t(`No groups match "${search.trim()}".`) : t('No groups in this view.') }}</span>
                  <MpButton variant="ghost" size="sm" is-rounded @click="clearFilters">{{ t('Clear filters') }}</MpButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <p v-else class="pgr-empty">{{ t(groupBy.length ? 'No groups yet. They show here after Talenta sends payroll.' : 'Add a field to Group staff by to see groups here.') }}</p>
      <p v-if="filtered && rows.length" class="pgr-foot pset-hint">{{ t(`Showing ${visibleRows.length} of ${rows.length} groups`) }}</p>
    </div>
  </div>
</template>

<style scoped>
.pgr-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* Group staff by */
.pgr-fields { max-width: 640px; table-layout: fixed; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); border-collapse: separate; border-spacing: 0; overflow: hidden; }
.pgr-fields__field { width: 200px; }
.pgr-fields__act { width: 56px; }
.pgr-fields .pset-td { vertical-align: middle; padding-top: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-2); }
.pgr-fields :deep(.efs), .pgr-rows :deep(.efs) { display: block; width: 100%; min-width: 0; }
.pgr-fields :deep(.efs-trigger), .pgr-rows :deep(.efs-trigger) { width: 100%; }
.pgr-add { display: flex; }

/* Filters and bulk bar */
.pgr-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pgr-chips { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pgr-chip { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full); padding: var(--mp-spacing-1) var(--mp-spacing-3); background: var(--mp-background-neutral); color: var(--mp-text-default); font: inherit; font-size: var(--mp-font-sizes-sm); cursor: pointer; white-space: nowrap; }
.pgr-chip.is-on { border-color: var(--mp-border-selected, var(--mp-text-selected)); color: var(--mp-text-selected); background: var(--mp-background-selected, var(--mp-background-neutral)); font-weight: var(--mp-font-weights-semi-bold); }
.pgr-search { display: flex; align-items: center; gap: var(--mp-spacing-2); flex: 0 0 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); color: var(--mp-text-secondary); }
.pgr-search__input { flex: 1; border: none; outline: none; background: transparent; font: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; }
.pgr-search__input::placeholder { color: var(--mp-text-placeholder); }
.pgr-bulk { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; padding: var(--mp-spacing-2) var(--mp-spacing-4); background: var(--mp-background-brand-subtle, #EEF2FF); border-bottom: 1px solid var(--mp-border-default); }
.pgr-bulk__count { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-right: var(--mp-spacing-2); }
.pgr-bulk__clear { margin-left: auto; }

/* Groups table */
.pgr-scroll { overflow-x: auto; }
.pgr-rows { table-layout: fixed; width: max-content; min-width: 100%; }
.pgr-c-check { width: 44px; }
.pgr-c-num { width: 72px; }
.pgr-c-acct { width: 248px; }
.pgr-c-val { width: 156px; }
.pgr-c-dim { width: 200px; }
.pgr-thf { display: inline-flex; align-items: center; gap: 2px; }
.pgr-rows thead .pgr-val { overflow-wrap: normal; word-break: normal; }
.pgr-c-val { width: 172px; }
.pgr-rows .pset-th { white-space: normal; }
.pgr-rows .pset-td { vertical-align: middle; }
.pgr-rows .pset-td, .pgr-rows .pset-th { padding-left: var(--mp-spacing-3); padding-right: var(--mp-spacing-3); }
.pgr-rows tr > :first-child { padding-left: var(--mp-spacing-4); }
.pgr-rows tbody tr.is-selected .pset-td { background: var(--mp-background-brand-subtle, #EEF2FF); }
.pgr-bands .pset-th { border-bottom: 1px solid var(--mp-border-default); }
.pgr-band { text-transform: none; letter-spacing: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); background: var(--mp-background-neutral-subtle); }
.pgr-band--jurnal, .pgr-split { border-left: 1px solid var(--mp-border-default); }
.pgr-check { padding-right: 0 !important; vertical-align: middle; }
.pgr-val { overflow-wrap: anywhere; }
.pset-th.pgr-num, .pgr-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pgr-staff { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.pgr-few { display: inline-flex; color: var(--mp-colors-text-warning, var(--mp-text-warning)); cursor: help; }
.pgr-status { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-1); flex-wrap: wrap; }
.pgr-none { text-align: left; color: var(--mp-text-secondary); }
.pgr-none > * { vertical-align: middle; margin-right: var(--mp-spacing-2); }
.pgr-empty { margin: 0; padding: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pgr-foot { padding: var(--mp-spacing-2) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
</style>
