<script setup lang="ts">
/**
 * CrmPermissionMatrix — CRM has NO roles: a user's access is a grouped checklist
 * of individually-tickable permissions (each CRM section has its own specific
 * list). Used on the Invite user page and the Edit user modal. The `perms` prop is
 * a reactive flat map (permission-key → boolean) owned by the parent and mutated
 * in place; a per-group "Select all" toggles that section at once.
 */
import { MpCheckbox } from '@mekari/pixel3'
import { CRM_PERMISSION_GROUPS, type CrmPermSet } from '~/data/crm'

const props = defineProps<{ perms: CrmPermSet }>()
const { t } = useLocale()

function toggle(key: string) { props.perms[key] = !props.perms[key] }
function groupKeys(group: string): string[] {
  return CRM_PERMISSION_GROUPS.find((g) => g.group === group)?.items.map((i) => i.key) ?? []
}
function groupAll(group: string): boolean {
  const keys = groupKeys(group)
  return keys.length > 0 && keys.every((k) => props.perms[k])
}
function toggleGroup(group: string) {
  const next = !groupAll(group)
  for (const k of groupKeys(group)) props.perms[k] = next
}
</script>

<template>
  <div class="pm">
    <section v-for="g in CRM_PERMISSION_GROUPS" :key="g.group" class="pm-group">
      <header class="pm-group-head">
        <h3 class="pm-group-title">{{ t(g.group) }}</h3>
        <button v-if="g.items.length > 1" type="button" class="pm-all" @click="toggleGroup(g.group)">
          {{ groupAll(g.group) ? t('Clear all') : t('Select all') }}
        </button>
      </header>
      <ul class="pm-items">
        <li v-for="item in g.items" :key="item.key" class="pm-item" @click="toggle(item.key)">
          <span @click.stop>
            <MpCheckbox :id="`pm-${item.key}`" :is-checked="perms[item.key] ?? false" @change="toggle(item.key)" />
          </span>
          <span class="pm-item-label">{{ t(item.label) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.pm { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pm-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pm-group-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-1); border-bottom: 1px solid var(--mp-border-default); }
.pm-group-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pm-all { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); white-space: nowrap; }
.pm-all:hover { text-decoration: underline; text-underline-offset: 2px; }
.pm-items { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-2) var(--mp-spacing-6); }
.pm-item { display: flex; align-items: center; gap: var(--mp-spacing-3); cursor: pointer; user-select: none; padding: var(--mp-spacing-1) 0; min-width: 0; }
.pm-item-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

@media (max-width: 720px) {
  .pm-items { grid-template-columns: 1fr; }
}
</style>
