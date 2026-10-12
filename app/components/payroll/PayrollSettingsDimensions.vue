<script setup lang="ts">
/**
 * Dimensions: each Talenta field Jurnal can read feeds one Jurnal dimension (pick one or
 * create it). Values match by name; unmatched values hold the run until they are mapped or
 * created. Dimensions land on cost lines only.
 */
import { computed, reactive, ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollSettingsDrawer from '~/components/payroll/PayrollSettingsDrawer.vue'
import { successToast } from '~/utils/toasts'
import {
  payroll, can, payrollDimensions, linkDimension, mapGroup, createPayrollTag, createMissingValues, setFieldPolicy,
} from '~/data/payrollStore'
import { TALENTA_FIELDS, type TalentaField } from '~/data/payrollMaster'
import { valueMatches, fieldSent } from '~/data/payrollUiSettings'

const { t } = useLocale()

const rows = computed(() => TALENTA_FIELDS
  .filter((f) => fieldSent(f.field) || payroll.settings.dimensionLinks.some((l) => l.field === f.field))
  .map((f) => {
    const link = payroll.settings.dimensionLinks.find((l) => l.field === f.field) ?? null
    const values = link ? valueMatches(f.field) : []
    return { ...f, link, total: values.length, unmatched: values.filter((v) => !v.tag).length }
  }))
function dimOptions(label: string) {
  const dims = payrollDimensions()
  const opts = [{ value: '', label: t('Not used') }, ...dims.map((d) => ({ value: d, label: d }))]
  if (!dims.includes(label)) opts.push({ value: `new:${label}`, label: t(`Create dimension ${label}`) })
  return opts
}
const errors = reactive<Record<string, string>>({})
function onLink(field: TalentaField, v: string) {
  const dim = v.startsWith('new:') ? v.slice(4) : v
  const r = linkDimension(field, dim || null)
  errors[field] = r.ok ? '' : t(r.message ?? '')
  const label = t(TALENTA_FIELDS.find((f) => f.field === field)?.label ?? field)
  if (r.ok) successToast(dim ? t(`${label} now fills ${dim}`) : t(`${label} no longer fills a dimension`))
}
const policyOptions = computed(() => [{ value: 'hold', label: t('Hold the run') }, { value: 'skip', label: t('Leave blank') }])
function onPolicy(field: string, v: string) {
  const r = setFieldPolicy(field, v as 'hold' | 'skip')
  if (r.ok) successToast(t('Rule for empty values saved'))
}

// ── Map values drawer ──
const mapField = ref<TalentaField | null>(null)
const mapRow = computed(() => rows.value.find((r) => r.field === mapField.value) ?? null)
const mapValues = computed(() => (mapField.value ? valueMatches(mapField.value) : []))
const pick = reactive<Record<string, string>>({})
const mapError = ref('')
function openMap(field: TalentaField) { mapField.value = field; mapError.value = ''; for (const k of Object.keys(pick)) delete pick[k] }
function valueOptions(value: string) {
  const dim = mapRow.value?.link?.dimension
  const opts = payroll.tags.filter((x) => x.dimension === dim).map((x) => ({ value: x.name, label: x.name }))
  if (!opts.some((o) => o.value.toLowerCase() === value.toLowerCase())) opts.push({ value: `new:${value}`, label: t(`Create value ${value}`) })
  return opts
}
function onValue(value: string, v: string) {
  const dim = mapRow.value?.link?.dimension
  if (!dim || !v) return
  let tag = v
  if (v.startsWith('new:')) { tag = v.slice(4); const c = createPayrollTag(dim, tag); if (!c.ok) { mapError.value = t(c.message ?? ''); return } }
  const r = mapGroup(dim, value, tag)
  mapError.value = r.ok ? '' : t(r.message ?? '')
}
function createAll() {
  if (!mapField.value) return
  const r = createMissingValues(mapField.value, mapValues.value.filter((v) => !v.tag).map((v) => v.value))
  if (!r.ok) { mapError.value = t(r.message ?? ''); return }
  successToast(t(`${r.created} value${r.created === 1 ? '' : 's'} created`))
}
</script>

<template>
  <div class="pset-stack">
    <div class="pset-card">
      <div class="pset-card__head">
        <div>
          <div class="pset-card__title">{{ t('Dimensions') }}</div>
          <div class="pset-card__sub">{{ t('Each Talenta field can fill one Jurnal dimension on the cost lines of the journal.') }}</div>
        </div>
      </div>
      <table class="pset-table pset-dim">
        <colgroup><col class="pset-dim__field"><col class="pset-dim__dim"><col class="pset-dim__vals"><col class="pset-dim__empty"></colgroup>
        <thead>
          <tr>
            <th class="pset-th">{{ t('Talenta field') }}</th>
            <th class="pset-th">{{ t('Dimension') }}</th>
            <th class="pset-th">{{ t('Values') }}</th>
            <th class="pset-th">{{ t('When empty') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.field" :data-field="r.field">
            <td class="pset-td">{{ t(r.label) }}</td>
            <td class="pset-td">
              <ErpFilterSelect v-if="can('setup')" :id="`pset-dim-${r.field.replace(/[^a-z_]/gi, '-')}`" :model-value="r.link?.dimension ?? ''" :placeholder="t('Not used')" :options="dimOptions(r.label)" width="100%" :is-clearable="false" @update:model-value="(v: string) => onLink(r.field, v)" />
              <span v-else>{{ r.link?.dimension ?? t('Not used') }}</span>
              <span v-if="errors[r.field]" class="pset-line pset-danger">{{ errors[r.field] }}</span>
            </td>
            <td class="pset-td">
              <template v-if="r.link">
                <div class="pset-vals">
                  <span>{{ t(`${r.total - r.unmatched} of ${r.total} matched`) }}</span>
                  <ErpStatusBadge v-if="r.unmatched" status="unmatched" :label="t(`${r.unmatched} unmatched`)" type="critical" />
                  <span class="pset-link" @click="openMap(r.field)">{{ t(r.unmatched && can('setup') ? 'Map values' : 'View values') }}</span>
                </div>
              </template>
              <span v-else class="pset-muted">{{ t('Not used') }}</span>
            </td>
            <td class="pset-td">
              <template v-if="r.link">
                <ErpFilterSelect v-if="can('setup')" :id="`pset-empty-${r.field.replace(/[^a-z_]/gi, '-')}`" :model-value="r.link.empty" :placeholder="t('When empty')" :options="policyOptions" width="100%" :is-clearable="false" @update:model-value="(v: string) => onPolicy(r.field, v)" />
                <span v-else>{{ t(r.link.empty === 'hold' ? 'Hold the run' : 'Leave blank') }}</span>
              </template>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td class="pset-td pset-muted" colspan="4">{{ t('No Talenta fields yet. They show here after Talenta sends its first payroll.') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <PayrollSettingsDrawer :is-open="!!mapRow" :title="t(`${mapRow?.label ?? ''} values`)" :sub="mapRow?.link ? t(`Fills the ${mapRow.link.dimension} dimension`) : ''" @close="mapField = null">
      <template v-if="mapRow">
        <div v-if="can('setup') && mapRow.unmatched" class="pset-bar">
          <span class="pset-hint">{{ t(`${mapRow.unmatched} value${mapRow.unmatched > 1 ? 's have' : ' has'} no dimension value. Pick one or create ${mapRow.unmatched > 1 ? 'them' : 'it'}.`) }}</span>
          <MpButton size="sm" variant="secondary" is-rounded @click="createAll">{{ t('Create missing values') }}</MpButton>
        </div>
        <table class="pset-table pset-dim-map">
          <thead><tr><th class="pset-th">{{ t('Talenta value') }}</th><th class="pset-th">{{ t('Dimension value') }}</th></tr></thead>
          <tbody>
            <tr v-for="v in mapValues" :key="v.value">
              <td class="pset-td">{{ v.value }}</td>
              <td class="pset-td">
                <ErpFilterSelect v-if="can('setup')" :id="`pset-map-${v.value.replace(/[^a-zA-Z0-9]/g, '-')}`" :model-value="pick[v.value] ?? v.tag ?? ''" :placeholder="t('Select or create')" :options="valueOptions(v.value)" width="100%" :is-clearable="false" @update:model-value="(x: string) => { pick[v.value] = x.startsWith('new:') ? x.slice(4) : x; onValue(v.value, x) }" />
                <span v-else>{{ v.tag ?? t('Unmatched') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="mapError" class="pset-error">{{ mapError }}</p>
      </template>
    </PayrollSettingsDrawer>
  </div>
</template>

<style scoped>
.pset-dim { table-layout: fixed; }
.pset-dim__field { width: 22%; }
.pset-dim__dim { width: 28%; }
.pset-dim__vals { width: 28%; }
.pset-dim__empty { width: 22%; }
.pset-dim .pset-td { vertical-align: middle; }
.pset-dim-map .pset-td { vertical-align: middle; }
.pset-dim-map :deep(.efs), .pset-dim-map :deep(.efs-trigger) { width: 100%; }
.pset-vals { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pset-dim :deep(.efs) { display: block; width: 100%; }
.pset-dim :deep(.efs-trigger) { width: 100%; }
</style>
