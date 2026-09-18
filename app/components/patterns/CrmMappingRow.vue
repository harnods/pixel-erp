<script setup lang="ts">
/**
 * One mapping row in the CRM → ERP conversion editor. Three columns:
 *   ERP field  ·  Source (strategy)  ·  CRM field (the field/value the source resolves to)
 * No status column (per the section spec). Protected rows (Deals system defaults)
 * render read-only. All dropdowns are ErpFilterSelect (never a native select —
 * rule/select-erpfilterselect).
 *
 * Row chrome (8px top/bottom padding + border-bottom, last row borderless) is owned
 * by the parent list so the last-child rule can strip the trailing border.
 */
import { computed } from 'vue'
import { MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  SOURCE_STRATEGY_LABEL, SYSTEM_VALUE_LABEL, allowedStrategies, compatibleCrmTypes, evalEntry,
  type ErpTargetField, type MappingEntry, type SourceStrategy, type SystemValueKey,
} from '~/data/crmConversion'
import type { CrmModule } from '~/data/crm'

const props = defineProps<{ field: ErpTargetField; entry: MappingEntry; mod: CrmModule }>()
const emit = defineEmits<{ 'update:entry': [MappingEntry] }>()
const { t } = useLocale()

const strategyOptions = computed(() =>
  allowedStrategies(props.field).map((s) => ({ value: s, label: t(SOURCE_STRATEGY_LABEL[s]) })),
)

// The CRM field dropdown lists the module's own properties. Compatible types are
// offered first (an incompatible pick is still allowed but flagged by evalEntry).
const fieldOptions = computed(() => {
  const types = compatibleCrmTypes(props.field.category)
  const rank = (t: string) => (types.includes(t as never) ? 0 : 1)
  return [...props.mod.fields]
    .sort((a, b) => rank(a.type) - rank(b.type))
    .map((f) => ({ value: f.id, label: f.label }))
})

const SYSTEM_VALUES: SystemValueKey[] = [
  'conversion-date', 'base-currency', 'erp-customer-id', 'record-id',
  'primary-name', 'current-company', 'acting-user', 'rate-one',
]
const systemOptions = computed(() => SYSTEM_VALUES.map((v) => ({ value: v, label: t(SYSTEM_VALUE_LABEL[v]) })))

const evalResult = computed(() => evalEntry(props.entry, props.field, props.mod))

// Read-only summary of the resolved value (protected rows).
const protectedValue = computed(() => {
  const e = props.entry
  if (e.systemValue) return t(SYSTEM_VALUE_LABEL[e.systemValue])
  if (e.sourceFieldId) return props.mod.fields.find((f) => f.id === e.sourceFieldId)?.label ?? e.sourceFieldId
  if (e.fixedLabel) return t(e.fixedLabel)
  return t('Not mapped')
})

function patch(p: Partial<MappingEntry>) { emit('update:entry', { ...props.entry, ...p }) }
function onStrategy(v: string) {
  const strategy = v as SourceStrategy
  patch({ strategy, sourceFieldId: undefined, systemValue: undefined })
}
</script>

<template>
  <div class="map-row">
    <div class="map-grid">
      <!-- ERP field (the group header — Mandatory/Optional — already conveys the
           requirement, so no per-row Required/Optional badge). -->
      <div class="map-target">
        <span class="map-target-label">{{ t(field.label) }}</span>
        <span class="map-purpose">{{ t(field.purpose) }}</span>
        <span v-if="field.conditionNote" class="map-cond">{{ t(field.conditionNote) }}</span>
      </div>

      <!-- Source (strategy) -->
      <div class="map-cell">
        <span v-if="entry.protected" class="map-readonly">{{ t(SOURCE_STRATEGY_LABEL[entry.strategy]) }}</span>
        <ErpFilterSelect
          v-else
          :id="`map-strategy-${field.key}`"
          :model-value="entry.strategy"
          placeholder="Source"
          :options="strategyOptions"
          @update:model-value="onStrategy"
        />
      </div>

      <!-- CRM field / resolved value -->
      <div class="map-cell">
        <span v-if="entry.protected" class="map-readonly">{{ protectedValue }}</span>
        <template v-else>
          <ErpFilterSelect
            v-if="entry.strategy === 'crm-field'"
            :id="`map-field-${field.key}`"
            :model-value="entry.sourceFieldId ?? ''"
            placeholder="Select CRM field"
            :options="fieldOptions"
            @update:model-value="(v: string) => patch({ sourceFieldId: v })"
          />
          <ErpFilterSelect
            v-else-if="entry.strategy === 'system'"
            :id="`map-sys-${field.key}`"
            :model-value="entry.systemValue ?? ''"
            placeholder="Select value"
            :options="systemOptions"
            @update:model-value="(v: string) => patch({ systemValue: v as SystemValueKey })"
          />
          <MpInput
            v-else-if="entry.strategy === 'fixed'"
            :id="`map-fixed-${field.key}`"
            :model-value="entry.fixedLabel ?? ''"
            :placeholder="t('Enter a fixed value')"
            @update:model-value="(v: string) => patch({ fixedLabel: v })"
          />
          <span v-else-if="entry.strategy === 'erp-default'" class="map-readonly">{{ t('Default') }} {{ t(field.label) }}</span>
          <span v-else class="map-readonly map-readonly--muted">—</span>
        </template>
      </div>
    </div>
    <p v-if="evalResult.message && !entry.protected" class="map-inline-error">{{ evalResult.message }}</p>
  </div>
</template>

<style scoped>
/* 8px top/bottom padding + a divider; the parent list strips the last row's border. */
.map-row { padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-subtle, #e6e8eb); }
.map-grid { display: grid; grid-template-columns: minmax(220px, 1.2fr) 200px minmax(220px, 1.4fr); gap: var(--mp-spacing-4); align-items: center; }
.map-target { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.map-target-label { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.map-purpose { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.map-cond { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-warning, #8a5a00); }
.map-cell { min-width: 0; }
.map-readonly { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.map-readonly--muted { color: var(--mp-text-secondary); }
.map-inline-error { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #a8352d); }
</style>
