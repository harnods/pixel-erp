<script setup lang="ts">
/**
 * CrmPermissionMatrix — "Manage permissions" body (Figma CRM 4232-9396). CRM has
 * no roles: access is a set of collapsible groups (title + subtitle) each made of
 * typed CONTROLS:
 *   • access     — "Record access" radio (All vs Only mine).
 *   • permission — "Permission" radio (View only vs a capability).
 *   • checkbox   — a single checkbox, optionally under its own sub-label (Export).
 * `perms` is a reactive flat key→boolean map owned by the parent and mutated here.
 */
import { reactive } from 'vue'
import { MpCheckbox, MpRadio, MpIcon } from '@mekari/pixel3'
import { CRM_PERMISSION_GROUPS, type CrmPermControl, type CrmPermSet } from '~/data/crm'

const props = defineProps<{ perms: CrmPermSet }>()
const { t } = useLocale()

// Collapse state (all expanded by default).
const collapsed = reactive<Record<string, boolean>>({})
function toggleCollapse(group: string) { collapsed[group] = !collapsed[group] }

// ── access control ──
function accessOf(c: Extract<CrmPermControl, { type: 'access' }>): 'all' | 'mine' {
  return props.perms[c.mineKey] && !props.perms[c.allKey] ? 'mine' : 'all'
}
function setAccess(c: Extract<CrmPermControl, { type: 'access' }>, scope: 'all' | 'mine') {
  props.perms[c.allKey] = scope === 'all'
  props.perms[c.mineKey] = scope === 'mine'
}

// ── permission control ──
function capOf(c: Extract<CrmPermControl, { type: 'permission' }>): 'view' | 'cap' {
  return c.capabilityKeys.some((k) => props.perms[k]) ? 'cap' : 'view'
}
function setCap(c: Extract<CrmPermControl, { type: 'permission' }>, mode: 'view' | 'cap') {
  for (const k of c.capabilityKeys) props.perms[k] = mode === 'cap'
}

function toggle(key: string) { props.perms[key] = !props.perms[key] }
</script>

<template>
  <div class="pm">
    <section v-for="g in CRM_PERMISSION_GROUPS" :key="g.group" class="pm-group">
      <button type="button" class="pm-group-head" :aria-expanded="!collapsed[g.group]" @click="toggleCollapse(g.group)">
        <MpIcon name="chevrons-down" size="sm" class="pm-chevron" :class="{ 'pm-chevron--collapsed': collapsed[g.group] }" />
        <div class="pm-group-titles">
          <h3 class="pm-group-title">{{ t(g.group) }}</h3>
          <p v-if="g.subtitle" class="pm-group-subtitle">{{ t(g.subtitle) }}</p>
        </div>
      </button>

      <div v-if="!collapsed[g.group]" class="pm-controls">
        <template v-for="(c, i) in g.controls" :key="i">
          <!-- Record access radio -->
          <div v-if="c.type === 'access'" class="pm-control">
            <span class="pm-control-label">{{ t(c.label) }}</span>
            <div class="pm-choices">
              <label class="pm-choice">
                <MpRadio :id="`${g.group}-${i}-all`" :name="`${g.group}-${i}`" :is-checked="accessOf(c) === 'all'" @change="setAccess(c, 'all')" />
                <span>{{ t(c.allLabel) }}</span>
              </label>
              <label class="pm-choice">
                <MpRadio :id="`${g.group}-${i}-mine`" :name="`${g.group}-${i}`" :is-checked="accessOf(c) === 'mine'" @change="setAccess(c, 'mine')" />
                <span>{{ t(c.mineLabel) }}</span>
              </label>
            </div>
          </div>

          <!-- Permission radio (View only / capability) -->
          <div v-else-if="c.type === 'permission'" class="pm-control">
            <span class="pm-control-label">{{ t(c.label) }}</span>
            <div class="pm-choices">
              <label class="pm-choice">
                <MpRadio :id="`${g.group}-${i}-view`" :name="`${g.group}-${i}`" :is-checked="capOf(c) === 'view'" @change="setCap(c, 'view')" />
                <span>{{ t('View only') }}</span>
              </label>
              <label class="pm-choice">
                <MpRadio :id="`${g.group}-${i}-cap`" :name="`${g.group}-${i}`" :is-checked="capOf(c) === 'cap'" @change="setCap(c, 'cap')" />
                <span>{{ t(c.capabilityLabel) }}</span>
              </label>
            </div>
          </div>

          <!-- Checkbox (optionally under its own sub-label) -->
          <div v-else class="pm-control">
            <span v-if="c.sublabel" class="pm-control-label">{{ t(c.sublabel) }}</span>
            <label class="pm-check">
              <MpCheckbox :id="`pm-${c.key}`" :is-checked="perms[c.key] ?? false" @change="toggle(c.key)" />
              <span>{{ t(c.label) }}</span>
            </label>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pm { display: flex; flex-direction: column; }
.pm-group { padding: var(--mp-spacing-5) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.pm-group:first-child { padding-top: 0; }
.pm-group:last-child { border-bottom: none; padding-bottom: 0; }

.pm-group-head {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  width: 100%; padding: 0; border: none; background: none; cursor: pointer; text-align: left;
}
.pm-chevron { flex-shrink: 0; margin-top: 2px; color: var(--mp-icon-default, var(--mp-text-secondary)); transition: transform 150ms ease; }
.pm-chevron--collapsed { transform: rotate(-90deg); }
.pm-group-titles { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pm-group-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pm-group-subtitle { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* controls indent to align under the title (chevron 16px + 8px gap) */
.pm-controls { display: flex; flex-direction: column; gap: var(--mp-spacing-4); margin: var(--mp-spacing-3) 0 0; padding-left: calc(16px + var(--mp-spacing-2)); }
.pm-control { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pm-control-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.pm-choices { display: flex; align-items: center; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.pm-choice, .pm-check { display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
</style>
