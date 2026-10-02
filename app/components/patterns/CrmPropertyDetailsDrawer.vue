<script setup lang="ts">
/**
 * CrmPropertyDetailsDrawer — read-only "View details" for a DEFAULT property
 * (CRM ▸ Settings ▸ Properties). Custom Teleport overlay panel (Drawer.md shell,
 * NOT MpDrawer). Shows the property's field type, variable name and description;
 * for association types (Contact / Company) it lists the linked record's own
 * fields (read-only) — since a module carries the association, not those fields.
 */
import { MpButton, MpIcon } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import { defaultPropertyIcon, type DefaultProperty, type DataSourceOrigin } from '~/data/crm'

defineProps<{ open: boolean; property: DefaultProperty | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()
function close() { emit('close') }

/** "ERP — Payment terms" / "CRM — Companies (crmCustomers)" / "Catalog — …" /
 *  "CRM-only" (no real ERP source — the `note` explains the gap). */
const ORIGIN_LABEL: Record<DataSourceOrigin, string> = { erp: 'ERP', crm: 'CRM', catalog: 'Catalog', none: 'CRM-only' }
function dataSourceLine(p: DefaultProperty): string {
  const ds = p.dataSource
  if (!ds) return ''
  return ds.origin === 'none' ? t(ORIGIN_LABEL[ds.origin]) : `${t(ORIGIN_LABEL[ds.origin])} — ${ds.label}`
}
</script>

<template>
  <ErpDrawer :is-open="open && !!property" :title="property?.name ?? ''" width="440px" :aria-label="t('Property details')" @close="close">
    <template #body>
            <!-- Field type -->
            <div class="cpd-field">
              <span class="cpd-label">{{ t('Field type') }}</span>
              <span class="cpd-type">
                <MpIcon :name="defaultPropertyIcon(property.fieldType)" size="sm" />
                {{ property.fieldType }}
              </span>
            </div>
            <!-- Description -->
            <div class="cpd-field">
              <span class="cpd-label">{{ t('Description') }}</span>
              <p class="cpd-desc">{{ property.description }}</p>
            </div>
            <!-- Data source — where the property's values actually come from -->
            <div v-if="property.dataSource" class="cpd-field">
              <span class="cpd-label">{{ t('Data source') }}</span>
              <p class="cpd-desc">{{ dataSourceLine(property) }}</p>
              <p v-if="property.dataSource.note" class="cpd-source-note">{{ property.dataSource.note }}</p>
            </div>
            <!-- Default badge -->
            <div class="cpd-field">
              <span class="cpd-label">{{ t('Availability') }}</span>
              <p class="cpd-desc">{{ t('Default property — available in every module and cannot be edited.') }}</p>
            </div>

            <!-- Association: the linked record's own fields (read-only) -->
            <div v-if="property.linkedFields?.length" class="cpd-linked">
              <span class="cpd-label">{{ t('Linked record fields') }}</span>
              <p class="cpd-linked-hint">{{ t('These fields live on the linked record, not on this module.') }}</p>
              <ul class="cpd-linked-list">
                <li v-for="f in property.linkedFields" :key="f.name" class="cpd-linked-row">
                  <MpIcon :name="defaultPropertyIcon(f.type)" size="sm" class="cpd-linked-icon" />
                  <span class="cpd-linked-text">
                    <span class="cpd-linked-name">{{ f.name }}</span>
                  </span>
                  <span class="cpd-linked-type">{{ f.type }}</span>
                </li>
              </ul>
            </div>
    </template>
    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" is-rounded @click="close">{{ t('Close') }}</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.cpd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cpd-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cpd-type { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.cpd-var { font-family: var(--mp-fonts-mono, ui-monospace, monospace); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); background: var(--mp-background-neutral-subtle, #f4f5f7); border-radius: var(--mp-radii-sm, 4px); padding: 2px 6px; width: fit-content; }
.cpd-desc { margin: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.cpd-source-note { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

.cpd-linked { display: flex; flex-direction: column; gap: var(--mp-spacing-2); border-top: 1px solid var(--mp-border-default, #e3e7e9); padding-top: var(--mp-spacing-5); }
.cpd-linked-hint { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cpd-linked-list { list-style: none; margin: var(--mp-spacing-1) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cpd-linked-row { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 8px; }
.cpd-linked-icon { color: var(--mp-icon-default, #536062); flex-shrink: 0; }
.cpd-linked-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cpd-linked-name { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpd-linked-var { font-family: var(--mp-fonts-mono, ui-monospace, monospace); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpd-linked-type { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); flex-shrink: 0; }

</style>
