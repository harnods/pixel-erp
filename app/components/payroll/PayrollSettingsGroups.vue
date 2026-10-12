<script setup lang="ts">
/**
 * Groups: group staff by any Talenta fields. Each group (a combination Talenta has sent) picks an
 * expense account, applied to pay items marked "Groups can change", and dimension values for the
 * cost lines. A group Talenta sends that is not set up yet holds the run.
 */
import { computed, reactive, ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { successToast } from '~/utils/toasts'
import {
  payroll, can, accountLabel, groupRows, setGroupBy, setGroupAccount, setGroupDimension, saveGroup,
  linkDimension, payrollDimensions, createPayrollTag, useChartAccount, payrollAccount,
} from '~/data/payrollStore'
import { TALENTA_FIELDS, type TalentaField } from '~/data/payrollMaster'
import { accountChoices, fieldSent } from '~/data/payrollUiSettings'

const { t } = useLocale()
const canEdit = computed(() => can('setup'))

// ── Group by ──
const fields = computed(() => TALENTA_FIELDS.filter((f) => fieldSent(f.field) || payroll.settings.groupBy.includes(f.field)))
const isOn = (f: TalentaField) => payroll.settings.groupBy.includes(f)
function toggleField(f: TalentaField) {
  if (!canEdit.value) return
  const cur = payroll.settings.groupBy
  const next = isOn(f) ? cur.filter((x) => x !== f) : [...cur, f]
  const r = setGroupBy(next)
  if (r.ok) successToast(next.length ? t('Groups updated') : t('Groups turned off'))
}
const fieldLabel = (f: string) => t(TALENTA_FIELDS.find((x) => x.field === f)?.label ?? f)

// ── Dimensions fed by the Group by fields ──
const dimLinks = computed(() => payroll.settings.groupBy.map((f) => ({ field: f, link: payroll.settings.dimensionLinks.find((l) => l.field === f) ?? null })))
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
  dimError.value = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(dim ? t(`${fieldLabel(field)} fills ${dim}`) : t(`${fieldLabel(field)} fills no dimension`))
}

// ── Group rows ──
const rows = computed(() => groupRows())
const newCount = computed(() => rows.value.filter((r) => r.isNew).length)
const columns = computed(() => rows.value[0]?.dimensions.map((d) => d.dimension) ?? dimLinks.value.filter((d) => d.link).map((d) => d.link!.dimension))
const costOptions = computed(() => [{ value: '', label: t('Use pay item account'), name: '', type: 'expense' as const }, ...accountChoices(['expense', 'cogs'])])
const rowErrors = reactive<Record<string, string>>({})
function onAccount(key: string, code: string) {
  const o = costOptions.value.find((x) => x.value === code)
  if (code && o && !payrollAccount(code)) useChartAccount({ code: o.value, name: o.name, type: o.type })
  const r = setGroupAccount(key, code || null)
  rowErrors[key] = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(code ? t(`Group now posts to ${accountLabel(code)}`) : t('Group uses the pay item account'))
}
function valueOptions(dimension: string, wanted: string | null) {
  const opts = payroll.tags.filter((x) => x.dimension === dimension).map((x) => ({ value: x.name, label: x.name }))
  if (wanted && !opts.some((o) => o.value.toLowerCase() === wanted.toLowerCase())) opts.push({ value: `new:${wanted}`, label: t(`Create value ${wanted}`) })
  return opts
}
function onValue(key: string, dimension: string, v: string) {
  let value = v
  if (v.startsWith('new:')) { value = v.slice(4); const c = createPayrollTag(dimension, value); if (!c.ok) { rowErrors[key] = t(c.message ?? ''); return } }
  const r = setGroupDimension(key, dimension, value || null)
  rowErrors[key] = r.ok ? '' : t(r.message ?? '')
}
function onSave(key: string, label: string) {
  const r = saveGroup(key)
  rowErrors[key] = r.ok ? '' : t(r.message ?? '')
  if (r.ok) successToast(t(`${label} set up`))
}
</script>

<template>
  <div class="pset-stack">
    <p v-if="!canEdit" class="pset-muted pset-ro">{{ t('Editing needs Set up access.') }}</p>

    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Group by') }}</div>
          <div class="pset-card__sub">{{ t('Pick the Talenta fields that sort staff into groups. Each combination becomes a row below.') }}</div>
        </div>
      </div>
      <div class="pset-card__body">
        <div class="pgr-fields">
          <button
            v-for="f in fields" :key="f.field" type="button" class="pgr-chip" :class="{ 'is-on': isOn(f.field) }"
            :disabled="!canEdit" :data-field="f.field" @click="toggleField(f.field)"
          >{{ t(f.label) }}</button>
        </div>
        <table v-if="dimLinks.length" class="pset-table pgr-dims">
          <thead><tr><th class="pset-th">{{ t('Talenta field') }}</th><th class="pset-th">{{ t('Fills dimension') }}</th></tr></thead>
          <tbody>
            <tr v-for="d in dimLinks" :key="d.field">
              <td class="pset-td">{{ fieldLabel(d.field) }}</td>
              <td class="pset-td">
                <ErpFilterSelect v-if="canEdit" :id="`pgr-dim-${d.field.replace(/[^a-z_]/gi, '-')}`" :model-value="d.link?.dimension ?? ''" :placeholder="t('No dimension')" :options="dimOptions(fieldLabel(d.field))" width="100%" :is-clearable="false" @update:model-value="(v: string) => onLink(d.field, v)" />
                <span v-else>{{ d.link?.dimension ?? t('No dimension') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="dimError" class="pset-error">{{ dimError }}</p>
      </div>
    </div>

    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Groups') }}</div>
          <div class="pset-card__sub">{{ t('The group account applies to pay items marked Groups can change. Dimensions go on cost lines only.') }}</div>
        </div>
        <ErpStatusBadge v-if="newCount" status="new" :label="t(`${newCount} new`)" type="critical" />
      </div>
      <table v-if="rows.length" class="pset-table pgr-rows">
        <thead>
          <tr>
            <th class="pset-th">{{ t('Group') }}</th>
            <th class="pset-th pgr-num">{{ t('Staff') }}</th>
            <th class="pset-th">{{ t('Expense account') }}</th>
            <th v-for="c in columns" :key="c" class="pset-th">{{ c }}</th>
            <th class="pset-th" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.key" :data-group="r.key">
            <td class="pset-td">
              <span class="pgr-label">{{ r.label }}</span>
              <ErpStatusBadge v-if="r.isNew" status="new" :label="t('New')" type="critical" />
              <span v-if="rowErrors[r.key]" class="pset-line pset-danger">{{ rowErrors[r.key] }}</span>
            </td>
            <td class="pset-td pgr-num">{{ r.staff }}</td>
            <td class="pset-td">
              <ErpFilterSelect v-if="canEdit" :id="`pgr-acc-${r.key.replace(/[^a-zA-Z0-9]/g, '-')}`" :model-value="r.account ?? ''" :placeholder="t('Use pay item account')" :options="costOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => onAccount(r.key, v)" />
              <span v-else>{{ r.account ? accountLabel(r.account) : t('Use pay item account') }}</span>
            </td>
            <td v-for="d in r.dimensions" :key="d.dimension" class="pset-td">
              <ErpFilterSelect v-if="canEdit" :id="`pgr-val-${r.key.replace(/[^a-zA-Z0-9]/g, '-')}-${d.dimension.replace(/[^a-zA-Z0-9]/g, '-')}`" :model-value="d.value ?? ''" :placeholder="t('Pick value')" :options="valueOptions(d.dimension, d.value ?? r.values[payroll.settings.groupBy.indexOf(d.field)] ?? null)" width="100%" :is-clearable="false" @update:model-value="(v: string) => onValue(r.key, d.dimension, v)" />
              <span v-else>{{ d.value ?? t('Not set') }}</span>
            </td>
            <td class="pset-td pgr-act">
              <MpButton v-if="canEdit && r.isNew" size="sm" variant="secondary" is-rounded @click="onSave(r.key, r.label)">{{ t('Set up group') }}</MpButton>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="pset-td pset-muted">{{ t(payroll.settings.groupBy.length ? 'No groups yet. They show here after Talenta sends payroll.' : 'Pick at least one Talenta field above to group staff.') }}</p>
    </div>
  </div>
</template>

<style scoped>
.pgr-fields { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); }
.pgr-chip { border: 1px solid var(--mp-border-default); border-radius: 999px; padding: 4px 12px; background: var(--mp-background-stage); color: var(--mp-text-default); font: inherit; font-size: 13px; cursor: pointer; }
.pgr-chip.is-on { border-color: var(--mp-border-selected, var(--mp-text-selected)); color: var(--mp-text-selected); background: var(--mp-background-selected, var(--mp-background-stage)); font-weight: 600; }
.pgr-chip:disabled { cursor: default; }
.pgr-dims { max-width: 560px; }
.pgr-rows .pset-td, .pgr-dims .pset-td { vertical-align: middle; }
.pgr-rows :deep(.efs), .pgr-rows :deep(.efs-trigger), .pgr-dims :deep(.efs), .pgr-dims :deep(.efs-trigger) { display: block; width: 100%; min-width: 160px; }
.pgr-num { text-align: right; width: 64px; }
.pgr-act { width: 120px; text-align: right; }
.pgr-label { margin-right: var(--mp-spacing-2); }
.pset-ro { margin: 0 0 var(--mp-spacing-3); }
</style>
