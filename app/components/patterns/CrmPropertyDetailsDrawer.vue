<script setup lang="ts">
/**
 * CrmPropertyDetailsDrawer — read-only "View details" for a DEFAULT property
 * (CRM ▸ Settings ▸ Properties). Custom Teleport overlay panel (Drawer.md shell,
 * NOT MpDrawer). Shows the property's field type, variable name and description;
 * for association types (Contact / Company) it lists the linked record's own
 * fields (read-only) — since a module carries the association, not those fields.
 */
import { MpButton, MpIcon } from '@mekari/pixel3'
import { defaultPropertyIcon, type DefaultProperty } from '~/data/crm'

defineProps<{ open: boolean; property: DefaultProperty | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()
function close() { emit('close') }
</script>

<template>
  <Teleport to="body">
    <Transition name="cpd">
      <div v-if="open && property" class="cpd-overlay" @click.self="close">
        <div class="cpd-panel" role="dialog" :aria-label="t('Property details')">
          <header class="cpd-header">
            <span class="cpd-title">{{ property.name }}</span>
            <MpButton class="cpd-close" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></MpButton>
          </header>

          <div class="cpd-body">
            <!-- Field type -->
            <div class="cpd-field">
              <span class="cpd-label">{{ t('Field type') }}</span>
              <span class="cpd-type">
                <MpIcon :name="defaultPropertyIcon(property.fieldType)" size="sm" />
                {{ property.fieldType }}
              </span>
            </div>
            <!-- Variable name -->
            <div class="cpd-field">
              <span class="cpd-label">{{ t('Variable name') }}</span>
              <code class="cpd-var">{{ property.variableName }}</code>
            </div>
            <!-- Description -->
            <div class="cpd-field">
              <span class="cpd-label">{{ t('Description') }}</span>
              <p class="cpd-desc">{{ property.description }}</p>
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
                  <span class="cpd-linked-name">{{ f.name }}</span>
                  <span class="cpd-linked-type">{{ f.type }}</span>
                </li>
              </ul>
            </div>
          </div>

          <footer class="cpd-footer">
            <MpButton class="btn-enterprise btn-enterprise--ghost" is-rounded @click="close">{{ t('Close') }}</MpButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cpd-enter-active, .cpd-leave-active { transition: background-color 250ms ease; }
.cpd-enter-from, .cpd-leave-to { background-color: transparent; }
.cpd-enter-active .cpd-panel, .cpd-leave-active .cpd-panel { transition: transform 300ms ease-out; }
.cpd-enter-from .cpd-panel, .cpd-leave-to .cpd-panel { transform: translateX(calc(100% + 12px)); }

.cpd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cpd-panel { margin: var(--mp-spacing-3); width: min(440px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }

.cpd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cpd-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cpd-close { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.cpd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.cpd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-5) var(--mp-spacing-4); }
.cpd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cpd-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cpd-type { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.cpd-var { font-family: var(--mp-fonts-mono, ui-monospace, monospace); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); background: var(--mp-background-neutral-subtle, #f4f5f7); border-radius: var(--mp-radii-sm, 4px); padding: 2px 6px; width: fit-content; }
.cpd-desc { margin: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }

.cpd-linked { display: flex; flex-direction: column; gap: var(--mp-spacing-2); border-top: 1px solid var(--mp-border-default, #e3e7e9); padding-top: var(--mp-spacing-5); }
.cpd-linked-hint { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cpd-linked-list { list-style: none; margin: var(--mp-spacing-1) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cpd-linked-row { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 8px; }
.cpd-linked-icon { color: var(--mp-icon-default, #536062); flex-shrink: 0; }
.cpd-linked-name { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cpd-linked-type { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); flex-shrink: 0; }

.cpd-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-stage, #fff); }
</style>
