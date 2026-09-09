<script setup lang="ts">
/**
 * CrmUserAccessDrawer — CRM ▸ Settings ▸ Users ▸ "CRM access".
 *
 * Hand-rolled Teleport overlay (MpDrawer has no structural CSS in this Pixel3
 * build — see CLAUDE.md), copied from CrmTeamFormDrawer. It is a FORM, so an
 * outside (overlay) click is intentionally ignored; closing is only via ×,
 * Cancel, or Save so in-progress edits are never lost.
 *
 * CRM has NO roles — a user's access is a grouped permission checklist. The
 * `perms` working copy is owned by the PARENT (passed by reference) and mutated
 * in place by CrmPermissionMatrix; the parent commits it on @save.
 */
import { MpIcon, MpButton, MpTooltip } from '@mekari/pixel3'
import CrmPermissionMatrix from '~/components/patterns/CrmPermissionMatrix.vue'
import { type CrmPermSet } from '~/data/crm'

const props = defineProps<{
  open: boolean
  user: { id: string; name: string; email: string; role: string; status: string } | null
  /** Reactive working copy owned by the parent (mutated by the matrix). */
  perms: CrmPermSet
  readOnly?: boolean
}>()
const emit = defineEmits<{ cancel: []; save: [] }>()

const { t } = useLocale()

</script>

<template>
  <Teleport to="body">
    <Transition name="cua">
      <div v-if="open" class="cua-overlay">
        <div class="cua-panel" role="dialog" :aria-label="t('CRM access')">
          <header class="cua-header">
            <span class="cua-title">{{ t('CRM access') }}</span>
            <MpTooltip id="cua-close-tip" :label="t('Close')" placement="bottom" use-portal>
              <MpButton class="cua-close" :aria-label="t('Close')" @click="emit('cancel')">
                <MpIcon name="close" size="md" />
              </MpButton>
            </MpTooltip>
          </header>

          <div class="cua-body">
            <CrmPermissionMatrix :perms="perms" />
          </div>

          <footer class="cua-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('cancel')">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="emit('save')">{{ t('Save changes') }}</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cua-enter-active, .cua-leave-active { transition: background-color 250ms ease; }
.cua-enter-from, .cua-leave-to { background-color: transparent; }
.cua-enter-active .cua-panel { transition: transform 350ms ease-out; }
.cua-leave-active .cua-panel { transition: transform 250ms ease-in; }
.cua-enter-from .cua-panel, .cua-leave-to .cua-panel { transform: translateX(calc(100% + 12px)); }

.cua-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.cua-panel {
  margin: var(--mp-spacing-3);
  width: min(520px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  overflow: hidden;
}
.cua-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.cua-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cua-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.cua-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.cua-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}

/* Read-only context block */
.cua-context {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-radius: var(--mp-radii-lg, 10px);
}
.cua-field { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.cua-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cua-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cua-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}

@media (max-width: 560px) {
  .cua-context { grid-template-columns: 1fr; }
}
</style>
