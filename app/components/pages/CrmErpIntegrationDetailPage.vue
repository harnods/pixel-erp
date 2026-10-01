<script setup lang="ts">
import { computed, ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ActivityLogModal, { type ActivityEntry, type ActivityDetail } from '~/components/patterns/ActivityLogModal.vue'
import { getCrmModule, moduleStores, type CrmModule } from '~/data/crm'
import {
  getConversionConfig, configState, CONFIG_STATE_LABEL, CONV_TARGET_LABEL,
  readinessCounts, erpTargetFields, evalEntry,
  SOURCE_STRATEGY_LABEL, SYSTEM_VALUE_LABEL,
  type ConfigState, type ConversionConfig, type MappingEntry, type ErpTargetField,
} from '~/data/crmConversion'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const mod = computed<CrmModule | undefined>(() => getCrmModule(props.orderId))
const cfg = computed<ConversionConfig | undefined>(() => getConversionConfig(props.orderId))
const state = computed<ConfigState>(() => cfg.value ? configState(cfg.value) : 'not-configured')
const modProperties = computed(() => moduleStores(props.orderId).properties)

const STATE_BADGE_TYPE: Record<ConfigState, 'completed' | 'critical' | 'warning' | 'information' | 'announcement'> = {
  ready: 'completed',
  'needs-attention': 'critical',
  'needs-revalidation': 'warning',
  'disabled-valid': 'information',
  'disabled-incomplete': 'announcement',
  'not-configured': 'announcement',
  'module-inactive': 'announcement',
}

const rc = computed(() => cfg.value ? readinessCounts(cfg.value) : null)
const isDeals = computed(() => props.orderId === 'deals')

const allFields = computed(() => cfg.value ? erpTargetFields(cfg.value.target) : [])
const mandatoryFields = computed(() => allFields.value.filter((f) => f.requirement !== 'optional'))
const optionalFields = computed(() => allFields.value.filter((f) => f.requirement === 'optional'))

function entryFor(key: string): MappingEntry {
  return cfg.value?.mappings.find((m) => m.targetKey === key) ?? { targetKey: key, strategy: 'unmapped' }
}

function resolvedValue(entry: MappingEntry): string {
  if (entry.strategy === 'unmapped') return '—'
  if (entry.strategy === 'system' && entry.systemValue) return t(SYSTEM_VALUE_LABEL[entry.systemValue])
  if (entry.strategy === 'crm-field' && entry.sourceFieldId) {
    const p = modProperties.value.find((x) => x.id === entry.sourceFieldId)
    if (p) return p.name
    const f = mod.value?.fields.find((x) => x.id === entry.sourceFieldId)
    return f?.label ?? entry.sourceFieldId
  }
  if (entry.strategy === 'fixed' && entry.fixedLabel) return entry.fixedLabel
  if (entry.strategy === 'erp-default') return t('ERP default')
  return '—'
}

function rowBadge(field: ErpTargetField, entry: MappingEntry): { type: 'completed' | 'critical' | 'announcement'; label: string } {
  if (!mod.value) return { type: 'announcement', label: t('Unmapped') }
  const r = evalEntry(entry, field, mod.value, modProperties.value)
  if (r.status === 'compatible') return { type: 'completed', label: t('Mapped') }
  if (r.status === 'unmapped-optional') return { type: 'announcement', label: t('Unmapped') }
  if (r.status === 'missing') return { type: 'critical', label: t('Missing') }
  return { type: 'critical', label: t('Incompatible') }
}

// ── Activity log ────────────────────────────────────────────────────────────
function formatActivityDate(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date}, ${time}`
}
const activityLogOpen = ref(false)
const updatedBy = computed(() => cfg.value?.lastSavedBy ?? mod.value?.updatedBy ?? 'System')
const updatedAt = computed(() => cfg.value?.lastSavedAt ?? mod.value?.updatedAt ?? '')

const activityEntries = computed<ActivityEntry[]>(() => {
  const entries: ActivityEntry[] = []
  const c = cfg.value
  if (c?.lastSavedAt) {
    entries.push({
      date: c.lastSavedAt,
      user: c.lastSavedBy ?? 'System',
      activity: 'Updated conversion settings',
      details: [
        { label: 'Conversion status', value: c.enabled ? 'Enabled' : 'Disabled' },
        { label: 'Target', value: CONV_TARGET_LABEL[c.target] },
        { label: 'Mapping readiness', value: CONFIG_STATE_LABEL[state.value] },
      ],
    })
  }
  if (c?.lastValidatedAt) {
    entries.push({
      date: c.lastValidatedAt,
      user: c.lastSavedBy ?? 'System',
      activity: 'Validated mapping',
      details: [
        { label: 'Result', value: state.value === 'ready' ? 'Ready' : 'Needs attention' },
      ],
    })
  }
  if (!entries.length) {
    entries.push({
      date: mod.value?.updatedAt ?? new Date().toISOString(),
      user: mod.value?.updatedBy ?? 'System',
      activity: 'Module created',
      details: [{ label: 'Module', value: mod.value?.name ?? props.orderId }],
    })
  }
  return entries
})

function goBack() { router.push('/crm/settings/erp-integrations') }
function goEdit() { router.push(`/crm/settings/erp-integrations/${props.orderId}/edit`) }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <NuxtLink class="detail-breadcrumb" to="/crm/settings/erp-integrations">{{ t('ERP integrations') }}</NuxtLink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title" data-devchange="crm-erp-integration-detail">{{ mod ? mod.name : t('Module not found') }}</h1>
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <div v-if="!mod" class="detail-empty">
        <img src="/illustrations/empty-folder.png" alt="" class="detail-empty-illustration" width="288" height="240" />
        <p class="detail-empty-title">{{ t('Module not found') }}</p>
        <p class="detail-empty-caption">{{ t('This module does not exist or was removed.') }}</p>
        <MpButton class="btn-enterprise--secondary" is-rounded @click="goBack">{{ t('Back to ERP integrations') }}</MpButton>
      </div>

      <template v-else>
        <!-- Integration info -->
        <section class="detail-info">
          <MpButton class="section-edit-btn btn-enterprise--ghost" is-rounded left-icon="edit" @click="goEdit">{{ t('Edit') }}</MpButton>
          <h2 class="detail-section-heading">{{ t('Integration info') }}</h2>
          <dl class="info-rows">
            <div class="info-row">
              <dt class="info-label">{{ t('Module') }}</dt>
              <dd class="info-value">{{ mod.name }}</dd>
            </div>
            <div class="info-row">
              <dt class="info-label">{{ t('Module type') }}</dt>
              <dd class="info-value">{{ mod.system ? t('System module') : t('Custom module') }}</dd>
            </div>
            <div class="info-row">
              <dt class="info-label">{{ t('Conversion status') }}</dt>
              <dd class="info-value">
                <ErpStatusBadge
                  :type="cfg?.enabled ? 'completed' : 'announcement'"
                  :label="cfg?.enabled ? t('Enabled') : t('Disabled')"
                />
              </dd>
            </div>
            <div class="info-row">
              <dt class="info-label">{{ t('ERP transaction type') }}</dt>
              <dd class="info-value">{{ cfg ? t(CONV_TARGET_LABEL[cfg.target]) : '—' }}</dd>
            </div>
            <div class="info-row">
              <dt class="info-label">{{ t('Mapping readiness') }}</dt>
              <dd class="info-value">
                <ErpStatusBadge
                  :type="STATE_BADGE_TYPE[state]"
                  :label="t(CONFIG_STATE_LABEL[state])"
                />
              </dd>
            </div>
            <div class="info-row">
              <dt class="info-label">{{ t('Mapped fields') }}</dt>
              <dd class="info-value">
                <template v-if="rc">{{ rc.mappedRequired }}/{{ rc.totalRequired }} {{ t('required') }}, {{ rc.mappedOptional }}/{{ rc.totalOptional }} {{ t('optional') }}</template>
                <template v-else>—</template>
              </dd>
            </div>
            <div class="info-row">
              <dt class="info-label">{{ t('Conversion limitation') }}</dt>
              <dd class="info-value">
                <template v-if="isDeals">{{ t('Deals in the Lost stage cannot be converted') }}</template>
                <template v-else-if="cfg?.criterion">{{ t('Blocked when condition is met') }}</template>
                <template v-else>{{ t('None') }}</template>
              </dd>
            </div>
          </dl>

          <div class="activity-log">
            <a class="activity-link" @click.prevent="activityLogOpen = true">
              {{ t('Last updated by') }} {{ updatedBy }} {{ t('on') }} {{ formatActivityDate(updatedAt) }}
            </a>
          </div>
        </section>

        <!-- Mapping table (read-only) -->
        <section v-if="cfg && cfg.mappings.length" class="detail-mappings">
          <h2 class="detail-section-heading">{{ t('Field mapping') }}</h2>

          <!-- Mandatory fields -->
          <div v-if="mandatoryFields.length" class="map-group">
            <h3 class="map-group-title">{{ t('Mandatory fields') }}</h3>
            <div class="map-table">
              <div class="map-head">
                <span>{{ t('ERP field') }}</span>
                <span>{{ t('Source') }}</span>
                <span>{{ t('Value') }}</span>
                <span>{{ t('Status') }}</span>
              </div>
              <div v-for="f in mandatoryFields" :key="f.key" class="map-row">
                <div class="map-cell map-cell--field">
                  <span class="map-field-label">{{ t(f.label) }}</span>
                  <span class="map-field-purpose">{{ t(f.purpose) }}</span>
                </div>
                <div class="map-cell">
                  <span class="map-text">{{ t(SOURCE_STRATEGY_LABEL[entryFor(f.key).strategy]) }}</span>
                </div>
                <div class="map-cell">
                  <span class="map-text" :class="{ 'map-text--muted': resolvedValue(entryFor(f.key)) === '—' }">{{ resolvedValue(entryFor(f.key)) }}</span>
                </div>
                <div class="map-cell">
                  <ErpStatusBadge :type="rowBadge(f, entryFor(f.key)).type" :label="rowBadge(f, entryFor(f.key)).label" />
                </div>
              </div>
            </div>
          </div>

          <!-- Optional fields -->
          <div v-if="optionalFields.length" class="map-group">
            <h3 class="map-group-title">{{ t('Optional fields') }}</h3>
            <div class="map-table">
              <div class="map-head">
                <span>{{ t('ERP field') }}</span>
                <span>{{ t('Source') }}</span>
                <span>{{ t('Value') }}</span>
                <span>{{ t('Status') }}</span>
              </div>
              <div v-for="f in optionalFields" :key="f.key" class="map-row">
                <div class="map-cell map-cell--field">
                  <span class="map-field-label">{{ t(f.label) }}</span>
                  <span class="map-field-purpose">{{ t(f.purpose) }}</span>
                </div>
                <div class="map-cell">
                  <span class="map-text">{{ t(SOURCE_STRATEGY_LABEL[entryFor(f.key).strategy]) }}</span>
                </div>
                <div class="map-cell">
                  <span class="map-text" :class="{ 'map-text--muted': resolvedValue(entryFor(f.key)) === '—' }">{{ resolvedValue(entryFor(f.key)) }}</span>
                </div>
                <div class="map-cell">
                  <ErpStatusBadge :type="rowBadge(f, entryFor(f.key)).type" :label="rowBadge(f, entryFor(f.key)).label" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>

    <ActivityLogModal
      :is-open="activityLogOpen"
      :subject="mod?.name ?? 'Integration'"
      :updated-by="updatedBy"
      :updated-at="updatedAt"
      :entries="activityEntries"
      @close="activityLogOpen = false"
    />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.detail-breadcrumb { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-link, #165082); text-align: left; text-decoration: none; }
.detail-breadcrumb:hover { text-decoration: underline; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }

.detail-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-10) 0; color: var(--mp-text-secondary); text-align: center; }
.detail-empty-illustration { max-width: 288px; height: auto; }
.detail-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-empty-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.detail-info { position: relative; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.section-edit-btn { position: absolute; top: 0; right: 0; z-index: 1; }
.detail-section-heading { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 28px); color: var(--mp-text-default); }

.info-rows { margin: 0; display: flex; flex-direction: column; }
.info-row { display: flex; align-items: baseline; gap: var(--mp-spacing-4); padding: var(--mp-spacing-2) 0; }
.info-label { width: 180px; flex-shrink: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.info-value { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }

.activity-log { margin-top: var(--mp-spacing-4); }
.activity-link { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; text-decoration: none; }
.activity-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Mapping table (read-only) */
.detail-mappings { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.map-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.map-group-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.map-table { display: flex; flex-direction: column; }
.map-head { display: grid; grid-template-columns: minmax(200px, 1.2fr) 160px minmax(180px, 1.4fr) 100px; gap: var(--mp-spacing-4); padding-bottom: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default, #c8cdd0); }
.map-head span { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-secondary); }
.map-row { display: grid; grid-template-columns: minmax(200px, 1.2fr) 160px minmax(180px, 1.4fr) 100px; gap: var(--mp-spacing-4); align-items: center; padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-subtle, #e6e8eb); }
.map-row:last-child { border-bottom: none; }

.map-cell { min-width: 0; }
.map-cell--field { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); }
.map-field-label { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.map-field-purpose { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.map-text { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.map-text--muted { color: var(--mp-text-secondary); }
</style>
