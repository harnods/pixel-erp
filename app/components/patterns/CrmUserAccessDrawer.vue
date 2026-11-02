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
import CrmPermissionMatrix from '~/components/patterns/CrmPermissionMatrix.vue'
import { MpButton } from '@mekari/pixel3'
import { type CrmPermSet } from '~/data/crm'

defineProps<{
  open: boolean
  /** Passed by the parent (subject of the access edit); no longer rendered here. */
  user?: { id: string; name: string; email: string; role: string; status: string } | null
  /** Reactive working copy owned by the parent (mutated by the matrix). */
  perms: CrmPermSet
  readOnly?: boolean
}>()
const emit = defineEmits<{ cancel: []; save: [] }>()

const { t } = useLocale()

</script>

<template>
  <ErpDrawer :is-open="open" :title="t('Manage CRM access')" width="520px" @close="emit('cancel')">
    <template #body>
      <CrmPermissionMatrix :perms="perms" />
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="emit('cancel')">{{ t('Cancel') }}</MpButton>
      <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="emit('save')">{{ t('Save changes') }}</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
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

@media (max-width: 560px) {
  .cua-context { grid-template-columns: 1fr; }
}
</style>
