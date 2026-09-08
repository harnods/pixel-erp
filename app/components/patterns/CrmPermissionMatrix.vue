<script setup lang="ts">
/**
 * CrmPermissionMatrix — CRM has NO roles: a user's access is a matrix of
 * module × action checkboxes (Read / Edit / Add / Delete / Export / Reports).
 * Used on both the Invite user page and the Edit user modal. The `matrix` prop is
 * a reactive object owned by the parent and mutated in place (tick a box → flip
 * that module's action). A per-row "All" toggles the whole module at once.
 */
import { MpCheckbox } from '@mekari/pixel3'
import { CRM_PERM_MODULES, CRM_PERM_ACTIONS, type CrmPermMatrix, type CrmPermAction } from '~/data/crm'

const props = defineProps<{ matrix: CrmPermMatrix }>()
const { t } = useLocale()

function toggle(mod: string, action: CrmPermAction) {
  const row = props.matrix[mod]
  if (row) row[action] = !row[action]
}
function rowAll(mod: string): boolean {
  const row = props.matrix[mod]
  return !!row && CRM_PERM_ACTIONS.every((a) => row[a.key])
}
function toggleRow(mod: string) {
  const row = props.matrix[mod]
  if (!row) return
  const next = !rowAll(mod)
  for (const a of CRM_PERM_ACTIONS) row[a.key] = next
}
</script>

<template>
  <div class="pm-wrap">
    <table class="pm-table">
      <thead>
        <tr>
          <th class="pm-mod-col">{{ t('Module') }}</th>
          <th v-for="a in CRM_PERM_ACTIONS" :key="a.key" class="pm-act-col">{{ t(a.label) }}</th>
          <th class="pm-all-col">{{ t('All') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="mod in CRM_PERM_MODULES" :key="mod">
          <td class="pm-mod">{{ t(mod) }}</td>
          <td v-for="a in CRM_PERM_ACTIONS" :key="a.key" class="pm-cell">
            <MpCheckbox :id="`pm-${mod}-${a.key}`" :is-checked="matrix[mod]?.[a.key] ?? false" :aria-label="`${t(mod)} ${t(a.label)}`" @change="toggle(mod, a.key)" @click.stop />
          </td>
          <td class="pm-cell">
            <MpCheckbox :id="`pm-${mod}-all`" :is-checked="rowAll(mod)" :aria-label="`${t(mod)} ${t('All')}`" @change="toggleRow(mod)" @click.stop />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.pm-wrap { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px); }
.pm-table { width: 100%; border-collapse: collapse; }
.pm-table thead th {
  text-align: center; text-transform: uppercase; font-size: var(--mp-font-sizes-sm, 12px);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle, #f1f5f9);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); height: var(--mp-sizes-8, 32px); box-sizing: border-box; white-space: nowrap;
  border-bottom: 1px solid var(--mp-border-default);
}
.pm-table thead th.pm-mod-col { text-align: left; }
.pm-table tbody td { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.pm-table tbody tr:last-child td { border-bottom: none; }
.pm-mod { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); white-space: nowrap; }
.pm-cell { text-align: center; }
.pm-all-col { border-left: 1px solid var(--mp-border-default); }
.pm-table tbody td.pm-cell:last-child { border-left: 1px solid var(--mp-border-default); }
</style>
