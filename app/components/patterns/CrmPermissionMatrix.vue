<script setup lang="ts">
/**
 * CrmPermissionMatrix — a user's CRM access (no roles). Two kinds of group:
 *
 *  • "record" groups (Records, Customers) are a coherent access TIER, not free
 *    checkboxes: a **Record access** radio (All records / Only my records) sets the
 *    view scope, and a **Permission** radio (View only / Can create & edit) sets the
 *    capability. Derived: with "Can create & edit" + "All records" you may assign a
 *    new record to any owner; with "Only my records" new records are owned by you.
 *    Behind the scenes it writes the flat `<prefix>.readAll|readMine|create|edit|
 *    comment|archive|export` flags so `permSummary()` etc. keep working.
 *
 *  • other groups (Reports, Activity log, Settings…) stay a simple checklist.
 *
 * `perms` is a reactive flat map owned by the parent and mutated in place.
 */
import { MpCheckbox, MpRadio, MpTooltip, MpIcon } from '@mekari/pixel3'
import { CRM_PERMISSION_GROUPS, type CrmPermGroup, type CrmPermSet } from '~/data/crm'

const props = defineProps<{ perms: CrmPermSet }>()
const { t } = useLocale()

// ── Checklist groups ──
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

// ── Record groups (view-scope + capability tier) ──
const ACTION_SUFFIXES = ['create', 'edit', 'comment', 'archive', 'export'] as const
function pk(prefix: string, suffix: string): string { return `${prefix}.${suffix}` }
function accessOf(prefix: string): 'all' | 'mine' {
  return props.perms[pk(prefix, 'readMine')] && !props.perms[pk(prefix, 'readAll')] ? 'mine' : 'all'
}
function setAccess(prefix: string, scope: 'all' | 'mine') {
  props.perms[pk(prefix, 'readAll')] = scope === 'all'
  props.perms[pk(prefix, 'readMine')] = scope === 'mine'
}
function capabilityOf(prefix: string): 'view' | 'edit' {
  return props.perms[pk(prefix, 'create')] || props.perms[pk(prefix, 'edit')] ? 'edit' : 'view'
}
function setCapability(prefix: string, cap: 'view' | 'edit') {
  const on = cap === 'edit'
  for (const s of ACTION_SUFFIXES) props.perms[pk(prefix, s)] = on
}

// Group-specific copy (Records vs Customers).
function isCustomers(g: CrmPermGroup): boolean { return g.group === 'Customers' }
function accessAllLabel(g: CrmPermGroup): string { return isCustomers(g) ? t('All customers') : t('All records') }
function accessMineLabel(g: CrmPermGroup): string { return isCustomers(g) ? t('Only my customers') : t('Only my records') }
function ownerCaption(g: CrmPermGroup): string {
  if (accessOf(g.prefix!) === 'all') {
    return isCustomers(g) ? t('You can assign new customers to any owner.') : t('You can assign new records to any owner.')
  }
  return isCustomers(g) ? t('New customers you create are owned by you.') : t('New records you create are owned by you.')
}
</script>

<template>
  <div class="pm">
    <section v-for="g in CRM_PERMISSION_GROUPS" :key="g.group" class="pm-group">
      <header class="pm-group-head">
        <div class="pm-group-title-row">
          <h3 class="pm-group-title">{{ t(g.group) }}</h3>
          <MpTooltip v-if="g.tooltip" :id="`pm-tip-${g.group}`" use-portal placement="top" :label="t(g.tooltip)">
            <span class="pm-info" aria-hidden="true"><MpIcon name="info" size="sm" /></span>
          </MpTooltip>
        </div>
        <button
          v-if="g.kind !== 'record' && g.items.length > 1"
          type="button" class="pm-all" @click="toggleGroup(g.group)"
        >{{ groupAll(g.group) ? t('Clear all') : t('Select all') }}</button>
      </header>

      <!-- Record group: view-scope + capability tier -->
      <div v-if="g.kind === 'record' && g.prefix" class="pm-record">
        <div class="pm-sub">
          <span class="pm-sub-label">{{ t('Record access') }}</span>
          <div class="pm-choices">
            <label class="pm-choice">
              <MpRadio :id="`${g.prefix}-acc-all`" :name="`${g.prefix}-access`" :is-checked="accessOf(g.prefix) === 'all'" @change="setAccess(g.prefix, 'all')" />
              <span>{{ accessAllLabel(g) }}</span>
            </label>
            <label class="pm-choice">
              <MpRadio :id="`${g.prefix}-acc-mine`" :name="`${g.prefix}-access`" :is-checked="accessOf(g.prefix) === 'mine'" @change="setAccess(g.prefix, 'mine')" />
              <span>{{ accessMineLabel(g) }}</span>
            </label>
          </div>
        </div>

        <div class="pm-sub">
          <span class="pm-sub-label">{{ t('Permission') }}</span>
          <div class="pm-choices pm-choices--stacked">
            <label class="pm-choice">
              <MpRadio :id="`${g.prefix}-cap-view`" :name="`${g.prefix}-cap`" :is-checked="capabilityOf(g.prefix) === 'view'" @change="setCapability(g.prefix, 'view')" />
              <span>{{ t('View only') }}</span>
            </label>
            <div class="pm-choice-block">
              <label class="pm-choice">
                <MpRadio :id="`${g.prefix}-cap-edit`" :name="`${g.prefix}-cap`" :is-checked="capabilityOf(g.prefix) === 'edit'" @change="setCapability(g.prefix, 'edit')" />
                <span>{{ t('Can create & edit') }}</span>
              </label>
              <!-- caption sits directly under "Can create & edit" — only for the
                   "Only my records" scope (new records are owned by you) -->
              <p v-if="capabilityOf(g.prefix) === 'edit' && accessOf(g.prefix) === 'mine'" class="pm-caption">{{ ownerCaption(g) }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Checklist group -->
      <ul v-else class="pm-items">
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
.pm-group { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.pm-group-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-1); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.pm-group-title-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.pm-group-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pm-info { display: inline-flex; color: var(--mp-icon-subtle, var(--mp-text-secondary)); cursor: default; }
.pm-all { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); white-space: nowrap; }
.pm-all:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Record tier */
.pm-record { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pm-sub { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pm-sub-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.pm-choices { display: flex; align-items: center; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.pm-choices--stacked { flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2); }
.pm-choice-block { display: flex; flex-direction: column; }
.pm-choice { display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
/* caption aligns under the radio's label text (control 20px + built-in 12px gap) */
.pm-caption { margin: 2px 0 0; padding-left: calc(var(--mp-sizes-5, 20px) + var(--mp-spacing-3)); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Checklist */
.pm-items { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-2) var(--mp-spacing-6); }
.pm-item { display: flex; align-items: center; gap: var(--mp-spacing-3); cursor: pointer; user-select: none; padding: var(--mp-spacing-1) 0; min-width: 0; }
.pm-item-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

@media (max-width: 720px) {
  .pm-items { grid-template-columns: 1fr; }
}
</style>
