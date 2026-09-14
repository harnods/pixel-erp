<script setup lang="ts">
/**
 * CustomRoleDrawer — Settings › Users & roles › Custom role → "Add / Edit custom
 * role". Follows Figma "Drawer / Custom Role / Add"
 * (kbjbVaG7fw9Jzv2jX1zBDf, node 4426:29058).
 *
 * Rebuilt on the ERP drawer standard: a hand-rolled Teleport overlay
 * (rule/drawer-custom-shell — Pixel MpDrawer has no structural CSS in this
 * build). It is a FORM drawer, so an overlay click is ignored — closing is only
 * via ×, Cancel, or Esc, and in-progress input is never lost by a stray click.
 *
 * The permission matrix is ONE flat expandable table (not a master-detail rail
 * + grid): every feature is a row with a tri-state checkbox per action column;
 * a feature with sub-features gets an expand chevron revealing its sub-rows
 * indented underneath. A quick filter (Granted / Not granted) and a name search
 * scope which feature rows show; while searching, matching groups auto-expand.
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { successToast } from '~/utils/toasts'
import {
  AUTHORITY_ACTIONS, DESCRIPTION_MAX, ROLE_NAME_MAX,
  addCustomRole, authorityActionsFor, authorityFeaturesFor, authorityRowKeys,
  getCustomRole, grantedFeatureCount, updateCustomRole,
  type AuthorityAction, type AuthorityFeature, type AuthorityGrants,
} from '~/data/usersRoles'

const props = defineProps<{
  id: string
  isOpen: boolean
  /** null = create; a customRoles id = edit. */
  roleId: string | null
}>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useLocale()

const isEdit = computed(() => !!props.roleId)

// Project Accounting is a billing component, not a standard module — a tenant
// without it never sees its authority rows (same gate as the Approval workflows
// "Applies to: Project Action" condition).
const { projectAccountingEnabled } = useApprovalWorkflowScenario()
const features = computed(() => authorityFeaturesFor(projectAccountingEnabled.value))

// ─── Draft state ────────────────────────────────────────────────────────────
const name = ref('')
const description = ref('')
const grants = reactive<AuthorityGrants>({})

const nameError = ref('')
const authorityError = ref('')
const isSaving = ref(false)

// ─── Permission table — filter + search + expand state ─────────────────────
const search = ref('')
const quickFilter = ref('')
const QUICK_FILTER_OPTIONS = [
  { value: 'granted', label: 'Granted' },
  { value: 'not-granted', label: 'Not granted' },
]
const expandedFeatures = reactive<Record<string, boolean>>({})

/** Re-seed the draft on every open, so a discarded edit is forgotten next time. */
watch(() => props.isOpen, (open) => {
  if (!open) return
  nameError.value = ''
  authorityError.value = ''
  isSaving.value = false
  search.value = ''
  quickFilter.value = ''
  for (const key of Object.keys(grants)) delete grants[key]
  for (const key of Object.keys(expandedFeatures)) delete expandedFeatures[key]

  const role = props.roleId ? getCustomRole(props.roleId) : undefined
  name.value = role?.name ?? ''
  description.value = role?.description ?? ''
  if (role) {
    for (const [key, actions] of Object.entries(role.grants)) grants[key] = [...actions]
    // Expand every feature that already has something granted — the user
    // almost always wants to see where the role's authority actually is.
    for (const f of features.value) {
      if (f.subfeatures.length && authorityRowKeys(f).some((k) => grants[k]?.length)) expandedFeatures[f.id] = true
    }
  }
}, { immediate: true })

const featureCount = computed(() => grantedFeatureCount(grants))

/** Feature rows the table shows — scoped by the quick filter and name search. */
const visibleFeatures = computed(() => {
  const s = search.value.trim().toLowerCase()
  return features.value.filter((f) => {
    const matchesSearch = !s || f.label.toLowerCase().includes(s) || f.subfeatures.some((sf) => sf.label.toLowerCase().includes(s))
    if (!matchesSearch) return false
    if (!quickFilter.value) return true
    const granted = featureState(f).checked || featureState(f).indeterminate
    return quickFilter.value === 'granted' ? granted : !granted
  })
})

/** While searching, force-expand every visible group so a matched sub-feature
 *  is never hidden behind a collapsed chevron. */
function isExpanded(f: AuthorityFeature): boolean {
  if (search.value.trim()) return true
  return !!expandedFeatures[f.id]
}
function toggleExpand(f: AuthorityFeature) {
  if (!f.subfeatures.length) return
  expandedFeatures[f.id] = !expandedFeatures[f.id]
}

// ─── Grant helpers ──────────────────────────────────────────────────────────
function has(rowKey: string, action: AuthorityAction): boolean {
  return grants[rowKey]?.includes(action) ?? false
}

function setGrant(rowKey: string, action: AuthorityAction, on: boolean) {
  const current = grants[rowKey] ?? []
  // Granting create/edit/delete implies view — you cannot edit what you can't see.
  let next = on ? [...new Set([...current, action])] : current.filter((a) => a !== action)
  if (on && action !== 'view') next = [...new Set([...next, 'view' as AuthorityAction])]
  if (!on && action === 'view') next = []
  if (next.length) grants[rowKey] = next
  else delete grants[rowKey]
  authorityError.value = ''
}

/** Row checkbox — all actions for that one sub-feature row. */
function rowState(feature: AuthorityFeature, rowKey: string): { checked: boolean; indeterminate: boolean } {
  const actions = authorityActionsFor(feature)
  const on = actions.filter((a) => has(rowKey, a)).length
  return { checked: on === actions.length, indeterminate: on > 0 && on < actions.length }
}

function toggleRow(feature: AuthorityFeature, rowKey: string, on: boolean) {
  for (const action of authorityActionsFor(feature)) setGrant(rowKey, action, on)
}

/** Feature row's own checkbox — every action of every row in that feature. */
function featureState(feature: AuthorityFeature): { checked: boolean; indeterminate: boolean } {
  const keys = authorityRowKeys(feature)
  const actions = authorityActionsFor(feature)
  const total = keys.length * actions.length
  const on = keys.reduce((sum, k) => sum + actions.filter((a) => grants[k]?.includes(a)).length, 0)
  return { checked: on === total, indeterminate: on > 0 && on < total }
}

function toggleFeature(feature: AuthorityFeature, on: boolean) {
  const actions = authorityActionsFor(feature)
  for (const key of authorityRowKeys(feature)) {
    if (on) grants[key] = [...actions]
    else delete grants[key]
  }
  authorityError.value = ''
}

// ─── Save ───────────────────────────────────────────────────────────────────
function validate(): boolean {
  nameError.value = name.value.trim() ? '' : t('You must fill in role name')
  authorityError.value = featureCount.value > 0 ? '' : t('You must give this role at least one authority')
  return !nameError.value && !authorityError.value
}

async function save() {
  // The footer buttons are always clickable — an unmet precondition surfaces as
  // an inline error, never as a disabled button (rule/btn-no-disabled-validation).
  if (!validate()) return
  isSaving.value = true
  await new Promise((r) => setTimeout(r, 400))

  const payload = { name: name.value.trim(), description: description.value, grants: { ...grants } }
  if (isEdit.value) {
    updateCustomRole(props.roleId!, payload)
    successToast(t('Custom role changes saved'))
  } else {
    addCustomRole(payload)
    successToast(t('Custom role saved'))
  }
  isSaving.value = false
  emit('close')
}

function close() { emit('close') }
</script>

<template>
  <Teleport to="body">
    <Transition name="crd">
      <!-- Form drawer: overlay clicks are intentionally ignored. -->
      <div v-if="isOpen" class="crd-overlay">
        <div class="crd-panel" role="dialog" :aria-label="isEdit ? t('Edit custom role') : t('Add custom role')">
          <header class="crd-header">
            <span class="crd-title">{{ isEdit ? t('Edit custom role') : t('Add custom role') }}</span>
            <MpButton class="crd-close" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="crd-body">
            <!-- ── Role info ── -->
            <section class="crd-section">
              <h2 class="crd-section-title">{{ t('Role info') }}</h2>

              <MpFormControl :id="`${id}-name`" is-required :is-invalid="!!nameError">
                <div class="crd-label-row">
                  <MpFormLabel>{{ t('Role name') }}</MpFormLabel>
                  <span class="crd-counter">{{ name.length }} / {{ ROLE_NAME_MAX }}</span>
                </div>
                <MpInput
                  :id="`${id}-name-input`"
                  v-model="name"
                  :maxlength="ROLE_NAME_MAX"
                  :placeholder="t('Example: Warehouse supervisor')"
                  is-full-width
                  @update:model-value="nameError = ''"
                />
                <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
              </MpFormControl>

              <MpFormControl :id="`${id}-description`">
                <div class="crd-label-row">
                  <MpFormLabel>{{ t('Description') }}</MpFormLabel>
                  <span class="crd-counter">{{ description.length }} / {{ DESCRIPTION_MAX }}</span>
                </div>
                <MpTextarea
                  :id="`${id}-description-input`"
                  v-model="description"
                  :maxlength="DESCRIPTION_MAX"
                  :placeholder="t('Optional')"
                  is-full-width
                />
              </MpFormControl>
            </section>

            <!-- ── Role permissions — one flat expandable table (Figma "Drawer /
                 Custom Role / Add"), not a rail + single-feature grid. ── -->
            <section class="crd-section">
              <div class="crd-label-row">
                <h2 class="crd-section-title">
                  {{ t('Role permissions') }}<span class="crd-required">*</span>
                </h2>
              </div>
              <p class="crd-section-desc">
                {{ t('Roles with Edit or Delete permissions are automatically granted') }}
                <strong>{{ t('List Manager') }}</strong>
                {{ t('authority.') }}
              </p>

              <!-- Filter bar: quick filter + name search — scope which rows show. -->
              <div class="crd-filter-bar">
                <ErpFilterSelect
                  id="crd-quick-filter"
                  v-model="quickFilter"
                  :placeholder="t('Feature')"
                  :options="QUICK_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))"
                  width="160px"
                />
                <div class="crd-search">
                  <MpIcon name="search" size="sm" />
                  <input v-model="search" class="crd-search-input" type="text" :placeholder="t('Search feature name')">
                  <button v-if="search" class="crd-search-clear" type="button" :aria-label="t('Clear search')" @click="search = ''">
                    <MpIcon name="close" size="sm" />
                  </button>
                </div>
              </div>

              <div class="crd-matrix" :class="{ 'crd-matrix--invalid': !!authorityError }">
                <table class="crd-table">
                  <thead>
                    <tr>
                      <th class="crd-th crd-th--feature">{{ t('Feature') }}</th>
                      <th v-for="action in AUTHORITY_ACTIONS" :key="action.value" class="crd-th crd-th--action">
                        {{ t(action.label) }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="feature in visibleFeatures" :key="feature.id">
                      <!-- Feature row — chevron (only if it has sub-features) + tri-state
                           checkbox for the whole group, or the feature's own grant when leaf. -->
                      <tr class="crd-row crd-row--feature">
                        <td class="crd-td crd-td--feature">
                          <div class="crd-td-inner">
                            <button
                              v-if="feature.subfeatures.length"
                              type="button"
                              class="crd-chevron"
                              :class="{ 'crd-chevron--open': isExpanded(feature) }"
                              :aria-label="isExpanded(feature) ? t('Collapse') : t('Expand')"
                              @click="toggleExpand(feature)"
                            >
                              <MpIcon name="chevron-down" size="sm" />
                            </button>
                            <MpCheckbox
                              v-if="feature.subfeatures.length"
                              :id="`${id}-feature-${feature.id}`"
                              :aria-label="`${t('All authority')} — ${t(feature.label)}`"
                              :is-checked="featureState(feature).checked"
                              :is-indeterminate="featureState(feature).indeterminate"
                              @change="(on: boolean) => toggleFeature(feature, on)"
                            />
                            <span class="crd-td-label">{{ t(feature.label) }}</span>
                          </div>
                        </td>
                        <td
                          v-for="action in AUTHORITY_ACTIONS"
                          :key="action.value"
                          class="crd-td crd-td--action"
                        >
                          <!-- Leaf feature (no sub-features): the feature row IS the only
                               row, so its own cells carry the real per-action grant. A
                               feature with sub-features shows nothing here — its checkboxes
                               live on the sub-rows below. -->
                          <MpCheckbox
                            v-if="!feature.subfeatures.length && authorityActionsFor(feature).includes(action.value)"
                            :id="`${id}-cell-${feature.id}-${action.value}`"
                            :aria-label="`${t(action.label)} — ${t(feature.label)}`"
                            :is-checked="has(feature.id, action.value)"
                            @change="(on: boolean) => setGrant(feature.id, action.value, on)"
                          />
                          <span v-else-if="!feature.subfeatures.length" class="crd-na" :aria-label="t('Not available for this feature')">—</span>
                        </td>
                      </tr>

                      <!-- Sub-feature rows — indented, own grant per row. -->
                      <tr
                        v-for="sub in feature.subfeatures"
                        v-show="isExpanded(feature)"
                        :key="`${feature.id}.${sub.id}`"
                        class="crd-row crd-row--sub"
                      >
                        <td class="crd-td crd-td--feature crd-td--sub">
                          <div class="crd-td-inner">
                            <MpCheckbox
                              :id="`${id}-row-${feature.id}.${sub.id}`"
                              :aria-label="`${t('All authority')} — ${t(sub.label)}`"
                              :is-checked="rowState(feature, `${feature.id}.${sub.id}`).checked"
                              :is-indeterminate="rowState(feature, `${feature.id}.${sub.id}`).indeterminate"
                              @change="(on: boolean) => toggleRow(feature, `${feature.id}.${sub.id}`, on)"
                            />
                            <span class="crd-td-label">{{ t(sub.label) }}</span>
                          </div>
                        </td>
                        <td
                          v-for="action in AUTHORITY_ACTIONS"
                          :key="action.value"
                          class="crd-td crd-td--action"
                        >
                          <MpCheckbox
                            v-if="authorityActionsFor(feature).includes(action.value)"
                            :id="`${id}-cell-${feature.id}.${sub.id}-${action.value}`"
                            :aria-label="`${t(action.label)} — ${t(sub.label)}`"
                            :is-checked="has(`${feature.id}.${sub.id}`, action.value)"
                            @change="(on: boolean) => setGrant(`${feature.id}.${sub.id}`, action.value, on)"
                          />
                          <span v-else class="crd-na" :aria-label="t('Not available for this feature')">—</span>
                        </td>
                      </tr>
                    </template>
                    <tr v-if="!visibleFeatures.length">
                      <td class="crd-td crd-empty" :colspan="1 + AUTHORITY_ACTIONS.length">
                        {{ t('No features match your search.') }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="authorityError" class="crd-error">{{ authorityError }}</p>
            </section>
          </div>

          <footer class="crd-footer erp-action-footer">
            <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="save">
              {{ isSaving ? t('Saving…') : (isEdit ? t('Save changes') : t('Save')) }}
            </MpButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Shell (copy of the BillsFiltersDrawer transition/overlay/panel) ── */
.crd-enter-active, .crd-leave-active { transition: background-color 250ms ease; }
.crd-enter-from, .crd-leave-to { background-color: transparent; }
.crd-enter-active .crd-panel { transition: transform 350ms ease-out; }
.crd-leave-active .crd-panel { transition: transform 250ms ease-in; }
.crd-enter-from .crd-panel, .crd-leave-to .crd-panel { transform: translateX(calc(100% + 12px)); }

.crd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.crd-panel {
  margin: var(--mp-spacing-3);
  /* The permission table is a flat 5-column grid, no side rail. */
  width: min(720px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  overflow: hidden;
}
.crd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.crd-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.crd-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.crd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.crd-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-4);
}

/* ── Sections ── */
.crd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }
.crd-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.crd-section-desc {
  margin: calc(-1 * var(--mp-spacing-4)) 0 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.crd-required { color: var(--mp-text-critical, var(--mp-text-danger)); }
.crd-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); }
.crd-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.crd-error {
  margin: calc(-1 * var(--mp-spacing-3)) 0 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical, var(--mp-text-danger));
}

/* ── Filter bar — quick filter + search, above the permission table ── */
.crd-filter-bar { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.crd-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: var(--mp-sizes-62, 248px); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.crd-search-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}
.crd-search-input::placeholder { color: var(--mp-text-placeholder); }
.crd-search-clear {
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-text-subtle);
}

/* ── Permission table — one flat expandable table, feature rows + indented
   sub-feature rows, matching Figma "Drawer / Custom Role / Add". ── */
.crd-matrix {
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  overflow: hidden;
}
.crd-matrix--invalid { border-color: var(--mp-border-critical, var(--mp-border-danger)); }

.crd-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.crd-th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-sm);
  text-transform: uppercase; text-align: left; color: var(--mp-text-default);
  white-space: nowrap; vertical-align: middle;
}
.crd-th--feature { width: auto; }
/* Action columns stay left-aligned: header and body checkboxes then share the
   cell's left padding, so every body box sits exactly under its column header —
   the alignment cue that makes a permission matrix scannable. */
.crd-th--action { width: 120px; text-align: center; }

.crd-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: middle;
}
.crd-td--action { text-align: center; }
.crd-td-inner { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.crd-td-label { white-space: normal; }
.crd-na { color: var(--mp-text-secondary); }
.crd-table tbody tr:last-child .crd-td { border-bottom: none; }
.crd-table tbody tr:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.crd-row--sub .crd-td--feature { padding-left: var(--mp-spacing-9, 44px); }

.crd-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px);
  border: none; background: none; padding: 0; cursor: pointer;
  color: var(--mp-icon-default); flex-shrink: 0;
  transition: transform 150ms;
}
.crd-chevron--open { transform: rotate(180deg); }

.crd-empty {
  text-align: center; color: var(--mp-text-secondary);
  padding: var(--mp-spacing-6) var(--mp-spacing-3);
}

/* ── Footer — ghost Cancel + one primary. Alignment and the ≤640px stacked,
   full-width, primary-on-top behaviour come from the global .erp-action-footer
   (rule/btn-responsive-footer); this only adds the drawer's own chrome. ── */
.crd-footer {
  flex-shrink: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
</style>
