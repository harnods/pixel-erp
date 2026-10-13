<script setup lang="ts">
/**
 * Groups: staff who share the same Talenta values (Organization, Branch, ...) form a group, and
 * each group picks where its pay posts in Jurnal: an expense account (every cost pay item not
 * pinned on Pay items) and a value for each dimension added to the table, on the cost lines.
 * An 'Everyone else' row pinned on top holds the account for staff in no group and for groups
 * with no account of their own (their select's first choice reads 'Everyone else (<account>)').
 *
 * - "Group staff by" card: one chip per chosen field, removable, plus Add field. Only the five
 *   fields in GROUP_FIELDS; Job position and Job level are left out, since a group can be one
 *   person and the ledger would show that person's pay. A field no longer fills a dimension.
 * - Groups table: one row per combination Talenta sent, banded "From Talenta" | "Posts to in
 *   Jurnal". The Jurnal band holds Expense account plus one column per added dimension; "+ Dimension"
 *   adds any Jurnal dimension, the x on a column header removes it. A value defaults to the dimension
 *   value named like one of the group's Talenta values; an empty value posts the dimension blank and
 *   the run warns ('no-dimension-value'), it never holds.
 *   A New row (nobody set it up) does not hold the run: its cost posts to the Everyone else
 *   account, with no group dimension, until it is set up. A row covering 1 or 2 staff carries a warning, no block.
 * - Filters (All / New / 1 or 2 staff + search) and bulk edit over the selected rows, so nobody
 *   sets every combination one by one.
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpButton, MpCheckbox, MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollColumnFilter from '~/components/payroll/PayrollColumnFilter.vue'
import { successToast, errorToast } from '~/utils/toasts'
import {
  payroll, can, accountLabel, groupRows, setGroupBy, setGroupAccount, setGroupDimension, saveGroup,
  createPayrollTag, useChartAccount, payrollAccount, type GroupRow,
} from '~/data/payrollStore'
import type { TalentaField } from '~/data/payrollMaster'
import {
  accountChoices, fieldSent, GROUP_FIELDS, isGroupField, groupFieldLabel, fewStaff, fewStaffMessage, groupMatches,
  EVERYONE_ELSE, everyoneElseAccount, everyoneElseLabel, setEveryoneElseAccount,
} from '~/data/payrollUiSettings'
import { statusLabel, statusType } from '~/data/payrollUiRunCopy'
import {
  groupDimensions, dimensionsToAdd, addGroupDimension, removeGroupDimension, rowDimensions, creatableValues,
} from '~/data/payrollUiGroupDims'

const { t } = useLocale()
const canEdit = computed(() => can('setup'))
const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '-')
const fieldLabel = (f: string) => t(groupFieldLabel(f))
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

// ── Group staff by ──
const groupBy = computed(() => payroll.settings.groupBy)
const fieldRows = computed(() => groupBy.value.map((f) => ({ field: f, allowed: isGroupField(f) })))
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

// ── Dimension columns ("Posts to in Jurnal" band) ──
/** The dimensions added to groups, one column each, in the order added. */
const dimColumns = computed(() => groupDimensions())
const addDimOptions = computed(() => dimensionsToAdd())
const addDimOpen = ref(false)
function onAddDimension(dim: string) {
  addDimOpen.value = false
  const r = addGroupDimension(dim)
  if (r.ok) successToast(t(`${dim} added. Pick a value for each group.`))
  else errorToast(t(r.message ?? 'Not added. Pick another dimension.'))
}
function onRemoveDimension(dim: string) {
  const r = removeGroupDimension(dim)
  if (r.ok) successToast(t(`${dim} removed. Cost lines post without it.`))
  else errorToast(t(r.message ?? 'Not removed. Try again.'))
}

// ── Group rows ──
const rows = computed(() => groupRows())
/** One cell per dimension column for each row: explicit pick, else name match, else empty. */
const cells = computed(() => new Map(rows.value.map((r) => [r.key, rowDimensions(r, dimColumns.value)])))
const cellsOf = (r: GroupRow) => cells.value.get(r.key) ?? []
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
const accountOptions = computed(() => accountChoices(['expense', 'cogs']))
/** A group's choices: 'Everyone else (<account>)' first (no account of its own), then any expense or COGS account. */
const costOptions = computed(() => [{ value: EVERYONE_ELSE, label: t(everyoneElseLabel()), name: '', type: 'expense' as const }, ...accountOptions.value])
const rowErrors = reactive<Record<string, string>>({})
function pickAccount(code: string): string | null {
  if (code === EVERYONE_ELSE || !code) return null
  const o = accountOptions.value.find((x) => x.value === code)
  if (o && !payrollAccount(code)) useChartAccount({ code: o.value, name: o.name, type: o.type })
  return code
}
function onAccount(key: string, code: string) {
  const acc = pickAccount(code)
  const r = setGroupAccount(key, acc)
  rowErrors[key] = r.ok ? '' : t(r.message ?? 'Not saved. Pick an expense or COGS account.')
  if (r.ok) successToast(acc ? t(`Group now posts to ${accountLabel(acc)}`) : t('Group now uses the Everyone else account'))
}
// ── Everyone else: staff in no group and groups with no account of their own ──
const everyoneElse = computed(() => everyoneElseAccount())
const everyoneError = ref('')
function onEveryoneElse(code: string) {
  if (!code || code === everyoneElse.value) return
  pickAccount(code)
  const r = setEveryoneElseAccount(code)
  everyoneError.value = r.ok ? '' : t(r.message ?? 'Not saved. Pick an expense or COGS account.')
  if (r.ok) successToast(t(`Everyone else now posts to ${accountLabel(code)}`))
}
/**
 * A value cell's choices: the dimension's values, "Create value" for each of the group's Talenta
 * values the dimension lacks, and "Match by name" to drop an explicit pick.
 */
function valueOptions(r: GroupRow, dimension: string, explicit: boolean) {
  const opts = payroll.tags.filter((x) => x.dimension === dimension).map((x) => ({ value: x.name, label: x.name }))
  for (const v of creatableValues(dimension, r.values)) opts.push({ value: `new:${v}`, label: t(`Create value ${v}`) })
  if (explicit) opts.unshift({ value: DEFAULT, label: t('Match by name') })
  return opts
}
function resolveValue(dimension: string, v: string): { ok: true; value: string } | { ok: false; message: string } {
  if (!v.startsWith('new:')) return { ok: true, value: v }
  const value = v.slice(4)
  const c = createPayrollTag(dimension, value)
  return c.ok ? { ok: true, value } : { ok: false, message: c.message ?? 'Not created. Try another name.' }
}
function onValue(key: string, dimension: string, v: string) {
  if (v === DEFAULT) { const r = setGroupDimension(key, dimension, null); rowErrors[key] = r.ok ? '' : t(r.message ?? 'Not saved. Try again.'); return }
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
// Both access types edit groups; canEdit stays as the one switch should that change.
watch(canEdit, (on) => { if (!on) selected.value = [] })
const selectedNew = computed(() => rows.value.filter((r) => r.isNew && isSelected(r.key)).length)
const bulkAccount = ref('')
const bulkDims = reactive<Record<string, string>>({})
const groupsWord = (n: number) => `${n} ${plural(n, 'group', 'groups')}`
function bulkValueOptions(dimension: string) {
  return [{ value: DEFAULT, label: t('Match by name') }, ...payroll.tags.filter((x) => x.dimension === dimension).map((x) => ({ value: x.name, label: x.name }))]
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
  runBulk((k) => setGroupAccount(k, acc), (n) => acc ? `${groupsWord(n)} now post to ${accountLabel(acc)}` : `${groupsWord(n)} now use the Everyone else account`)
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

const NEW_TIP = 'Posts to the Everyone else account until set up.'
const EVERYONE_TIP = 'Staff in no group and groups with no account post here.'
const fewTip = (r: GroupRow) => { const n = fewStaff(r); return n ? t(fewStaffMessage(n)) : '' }
</script>

<template>
  <div class="pset-stack">

    <!-- Group staff by: one chip per field; a field only groups staff, it fills no dimension. -->
    <div class="pset-card" data-tour="payroll-groupby">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Group staff by') }}</div>
          <div class="pset-card__sub">{{ t('Staff who share these Talenta values form a group. Each group picks where its pay posts.') }}</div>
        </div>
      </div>
      <div class="pset-card__body pgr-by">
        <ul v-if="fieldRows.length" class="pgr-fieldchips" :aria-label="t('Group staff by')">
          <li v-for="d in fieldRows" :key="d.field" class="pgr-fieldchip" :class="{ 'is-bad': !d.allowed }" :data-field="d.field">
            <span>{{ fieldLabel(d.field) }}</span>
            <button
              v-if="canEdit" type="button" class="pgr-x" :aria-label="t(`Remove ${groupFieldLabel(d.field)}`)"
              :data-testid="`pgr-remove-${safe(d.field)}`" @click="removeField(d.field)"
            ><MpIcon name="close" size="sm" /></button>
          </li>
        </ul>
        <span v-else class="pset-hint">{{ t(canEdit ? 'Add a field to start grouping staff.' : 'Staff are not grouped yet.') }}</span>
        <div v-if="canEdit && addOptions.length" class="pgr-add">
          <ErpFilterSelect id="pgr-add-field" :model-value="addPick" :placeholder="t('Add field')" :options="addOptions" width="200px" :is-clearable="false" @update:model-value="addField" />
        </div>
        <p v-if="fieldRows.some((d) => !d.allowed)" class="pset-line pset-warn pgr-by__warn">{{ t('Job position and Job level can\'t group staff. Remove them.') }}</p>
      </div>
    </div>

    <!-- Groups -->
    <div class="pset-card" data-tour="payroll-groups-table">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Groups') }}</div>
          <div class="pset-card__sub">{{ t('Cost pay items post to the group\'s expense account unless pinned on Pay items. Add the dimensions you report on, then pick a value for each group.') }}</div>
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
          <ErpFilterSelect id="pgr-bulk-account" :model-value="bulkAccount" :placeholder="t('Set expense account')" :options="costOptions" width="288px" :is-clearable="false" @update:model-value="onBulkAccount" />
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
                <th :colspan="dimColumns.length + 1" class="pset-th pgr-band pgr-band--jurnal" scope="colgroup">
                  <span class="pgr-bandhead">{{ t('Posts to in Jurnal') }}
                  <MpPopover
                    v-if="canEdit" id="pgr-add-dim" is-manual :is-open="addDimOpen" use-portal :is-keep-alive="false" placement="bottom-start"
                    @open="addDimOpen = true" @close="addDimOpen = false"
                  >
                    <MpPopoverTrigger>
                      <button type="button" class="pgr-adddim__btn" :aria-label="t('Add dimension')" data-tour="payroll-group-dims" data-testid="pgr-add-dim" :aria-expanded="addDimOpen" @click.stop="addDimOpen = !addDimOpen">
                        <MpIcon name="add" size="sm" />{{ t('Dimension') }}
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent
                      :class="css({ padding: '4px', minWidth: '220px', maxHeight: '300px', overflowY: 'auto', borderRadius: '12px' })"
                      @blur="addDimOpen = false" @escape="addDimOpen = false"
                    >
                      <div class="pgr-menu__head">{{ t('Add a Jurnal dimension') }}</div>
                      <ul v-if="addDimOptions.length" class="pgr-menu">
                        <li v-for="o in addDimOptions" :key="o">
                          <button type="button" class="pgr-menu__item" :data-dimension="o" @click="onAddDimension(o)">{{ o }}</button>
                        </li>
                      </ul>
                      <p v-else class="pgr-menu__empty">{{ t('Every Jurnal dimension is added. Create one in Settings > Dimensions.') }}</p>
                    </MpPopoverContent>
                  </MpPopover></span>
                </th>
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
                <th v-for="c in dimColumns" :key="c" class="pset-th pgr-dim" :data-dimension="c">
                  <span class="pgr-thf">{{ c }}<button
                    v-if="canEdit" type="button" class="pgr-x pgr-dimx" :aria-label="t(`Remove ${c} column`)"
                    :data-testid="`pgr-dim-remove-${safe(c)}`" @click="onRemoveDimension(c)"
                  ><MpIcon name="close" size="sm" /></button></span>
                </th>
              </tr>
            </thead>
            <tbody>
              <!-- Everyone else: always on top, not selectable, no dimensions. -->
              <tr class="pgr-everyone" data-group="everyone-else" data-tour="payroll-everyone-else" :aria-label="t('Everyone else')">
                <td v-if="canEdit" class="pset-td pgr-check" />
                <td :colspan="groupBy.length + 1" class="pset-td pgr-everyone__name">
                  <span class="pgr-everyone__title">{{ t('Everyone else') }}</span>
                  <span class="pgr-everyone__sub">{{ t(EVERYONE_TIP) }}</span>
                  <span v-if="everyoneError" class="pset-line pset-danger">{{ everyoneError }}</span>
                </td>
                <td class="pset-td pgr-split pgr-acct">
                  <ErpFilterSelect v-if="canEdit" id="pgr-acc-everyone-else" :model-value="everyoneElse" :placeholder="t('Select account')" :options="accountOptions" width="100%" :is-clearable="false" @update:model-value="onEveryoneElse" />
                  <span v-else>{{ accountLabel(everyoneElse) }}</span>
                </td>
                <td v-for="c in dimColumns" :key="c" class="pset-td pgr-dim" :data-dimension="c" />
              </tr>
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
                  <ErpFilterSelect v-if="canEdit" :id="`pgr-acc-${safe(r.key)}`" :model-value="r.account ?? EVERYONE_ELSE" :placeholder="t(everyoneElseLabel())" :options="costOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => onAccount(r.key, v)" />
                  <span v-else>{{ r.account ? accountLabel(r.account) : t(everyoneElseLabel()) }}</span>
                </td>
                <td v-for="d in cellsOf(r)" :key="d.dimension" class="pset-td pgr-dim" :data-dimension="d.dimension" :data-explicit="d.explicit ? 'true' : 'false'">
                  <ErpFilterSelect v-if="canEdit" :id="`pgr-val-${safe(r.key)}-${safe(d.dimension)}`" :model-value="d.value ?? ''" :placeholder="t('Select value')" :options="valueOptions(r, d.dimension, d.explicit)" width="100%" :is-clearable="false" @update:model-value="(v: string) => onValue(r.key, d.dimension, v)" />
                  <span v-else :class="{ 'pgr-novalue': !d.value }">{{ d.value ?? t('No value') }}</span>
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
      <template v-else>
        <p class="pgr-empty">{{ t(groupBy.length ? 'No groups yet. They show here after Talenta sends payroll.' : 'Add a field to Group staff by to see groups here.') }}</p>
        <div class="pgr-everyone-line" data-group="everyone-else">
          <label class="pgr-everyone__title" for="pgr-acc-everyone-else-only">{{ t('Everyone else') }}</label>
          <span class="pgr-everyone__sub">{{ t('Staff in no group post to') }}</span>
          <ErpFilterSelect v-if="canEdit" id="pgr-acc-everyone-else-only" :model-value="everyoneElse" :placeholder="t('Select account')" :options="accountOptions" width="248px" :is-clearable="false" @update:model-value="onEveryoneElse" />
          <span v-else>{{ accountLabel(everyoneElse) }}</span>
        </div>
      </template>
      <p v-if="filtered && rows.length" class="pgr-foot pset-hint">{{ t(`Showing ${visibleRows.length} of ${rows.length} groups`) }}</p>
    </div>
  </div>
</template>

<style scoped>
.pgr-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* Group staff by: chips */
.pset-card__body.pgr-by { display: flex; flex-direction: row; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pgr-by__warn { flex-basis: 100%; margin: 0; }
.pgr-fieldchips { display: contents; list-style: none; margin: 0; padding: 0; }
.pgr-fieldchip {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1); height: 32px; padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap;
}
.pgr-fieldchip.is-bad { border-color: var(--mp-border-warning, var(--mp-text-warning)); }
.pgr-x {
  display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 0;
  border-radius: var(--mp-radii-full); background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.pgr-x:hover { background: var(--mp-background-neutral-hovered, rgba(0, 0, 0, 0.06)); color: var(--mp-text-default); }
.pgr-x:focus-visible { outline: 2px solid var(--mp-border-focus, var(--mp-text-selected)); outline-offset: 1px; }
.pgr-rows :deep(.efs) { display: block; width: 100%; min-width: 0; }
.pgr-rows :deep(.efs-trigger) { width: 100%; }
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
/* Fits 'Everyone else (6-60101 Salaries)' without cutting it. */
.pgr-c-acct { width: 320px; }
.pgr-c-dim { width: 184px; }
/* A dimension column's remove x shows on header hover or keyboard focus. */
.pgr-dimx { margin-left: var(--mp-spacing-1); opacity: 0; transition: opacity 0.12s; }
.pgr-dim:hover .pgr-dimx, .pgr-dimx:focus-visible { opacity: 1; }
.pgr-novalue { color: var(--mp-text-secondary); }
.pgr-bandhead { display: inline-flex; align-items: center; gap: var(--mp-spacing-3); }
.pgr-adddim__btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-1) var(--mp-spacing-2); border: 1px dashed var(--mp-border-default);
  border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); color: var(--mp-text-link); font: inherit; font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold); text-transform: none; letter-spacing: 0; cursor: pointer; white-space: nowrap;
}
.pgr-adddim__btn:hover { border-style: solid; border-color: var(--mp-text-link); }
.pgr-menu__head { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pgr-menu { list-style: none; margin: 0; padding: 0; }
.pgr-menu__item {
  display: block; width: 100%; text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 0; border-radius: var(--mp-radii-md);
  background: transparent; font: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer;
}
.pgr-menu__item:hover, .pgr-menu__item:focus-visible { background: var(--mp-background-neutral-hovered, rgba(0, 0, 0, 0.04)); outline: none; }
.pgr-menu__empty { margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); max-width: 260px; }
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
.pgr-everyone .pset-td { background: var(--mp-background-neutral-subtle); }
.pgr-everyone__name { white-space: normal; }
.pgr-everyone__title { display: block; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pgr-everyone__sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pgr-everyone-line { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: 0 var(--mp-spacing-4) var(--mp-spacing-4); }
.pgr-everyone-line .pgr-everyone__title, .pgr-everyone-line .pgr-everyone__sub { display: inline; }
.pgr-none { text-align: left; color: var(--mp-text-secondary); }
.pgr-none > * { vertical-align: middle; margin-right: var(--mp-spacing-2); }
.pgr-empty { margin: 0; padding: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pgr-foot { padding: var(--mp-spacing-2) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
</style>
