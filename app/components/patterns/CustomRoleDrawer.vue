<script setup lang="ts">
/**
 * CustomRoleDrawer — Settings › Users & roles › Custom role → "Add / Edit custom
 * role". Follows Figma "Drawer / Custom Role / Add"
 * (kbjbVaG7fw9Jzv2jX1zBDf, node 4426:29058) exactly.
 *
 * Rebuilt on the ERP drawer standard: a hand-rolled Teleport overlay
 * (rule/drawer-custom-shell — Pixel MpDrawer has no structural CSS in this
 * build). It is a FORM drawer, so an overlay click is ignored — closing is only
 * via ×, Cancel, or Esc, and in-progress input is never lost by a stray click.
 *
 * The permission matrix is ONE flat expandable table, up to 3 levels deep
 * (Feature ▸ Level 1 ▸ Level 2, e.g. Settings ▸ Sales ▸ General settings ▸
 * Sales quote): every level-1 row can expand to reveal level-2 rows, and a
 * level-2 row can itself expand to reveal level-3 rows when it has children.
 * A "Feature" quick filter (the 9 categories) and a name search scope which
 * rows show; while searching, matching groups auto-expand at every level so a
 * match is never hidden behind a collapsed chevron.
 *
 * The right-hand column mirrors Figma's "N permissions selected" summary: one
 * block per category with any grant, either "View all {category} features"
 * when the whole category is fully granted, or one bullet per distinct action
 * granted anywhere in it ("View {category}", "Create {category}", …).
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { successToast } from '~/utils/toasts'
import {
  AUTHORITY_ACTIONS, AUTHORITY_CATEGORIES, AUTHORITY_FEATURES, DESCRIPTION_MAX, ROLE_NAME_MAX,
  addCustomRole, authorityActionsFor, authorityRowKeys, authoritySubRowKeys,
  getCustomRole, grantedFeatureCount, updateCustomRole,
  type AuthorityAction, type AuthorityCategory, type AuthorityFeature, type AuthorityGrants, type AuthoritySubfeature,
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
const features = AUTHORITY_FEATURES

// ─── Draft state ────────────────────────────────────────────────────────────
const name = ref('')
const description = ref('')
const grants = reactive<AuthorityGrants>({})

const nameError = ref('')
const authorityError = ref('')
const isSaving = ref(false)

// ─── Permission table — filter + search + expand state ─────────────────────
const search = ref('')
const quickFilter = ref<AuthorityCategory | ''>('')
/** Category expand state (the top-level grouping row), keyed by category value. */
const expandedCategories = reactive<Record<string, boolean>>({})
/** Level-1 expand state, keyed by feature.id. */
const expandedFeatures = reactive<Record<string, boolean>>({})
/** Level-2 expand state (only for subfeatures that have level-3 children), keyed `${featureId}.${subId}`. */
const expandedSubs = reactive<Record<string, boolean>>({})

/** Re-seed the draft on every open, so a discarded edit is forgotten next time. */
watch(() => props.isOpen, (open) => {
  if (!open) return
  nameError.value = ''
  authorityError.value = ''
  isSaving.value = false
  search.value = ''
  quickFilter.value = ''
  for (const key of Object.keys(grants)) delete grants[key]
  for (const key of Object.keys(expandedCategories)) delete expandedCategories[key]
  for (const key of Object.keys(expandedFeatures)) delete expandedFeatures[key]
  for (const key of Object.keys(expandedSubs)) delete expandedSubs[key]

  const role = props.roleId ? getCustomRole(props.roleId) : undefined
  name.value = role?.name ?? ''
  description.value = role?.description ?? ''
  if (role) {
    for (const [key, actions] of Object.entries(role.grants)) grants[key] = [...actions]
    // Expand every group that already has something granted — the user
    // almost always wants to see where the role's authority actually is.
    for (const f of features) {
      if (!authorityRowKeys(f).some((k) => grants[k]?.length)) continue
      expandedCategories[f.category] = true
      if (!f.subfeatures.length) continue
      expandedFeatures[f.id] = true
      for (const s of f.subfeatures) {
        if (s.children?.length && authoritySubRowKeys(f.id, s).some((k) => grants[k]?.length)) expandedSubs[`${f.id}.${s.id}`] = true
      }
    }
  }
}, { immediate: true })

const featureCount = computed(() => grantedFeatureCount(grants))

/** Feature rows the table shows — scoped by the category quick filter and name search. */
const visibleFeatures = computed(() => {
  const s = search.value.trim().toLowerCase()
  return features.filter((f) => {
    if (quickFilter.value && f.category !== quickFilter.value) return false
    if (!s) return true
    if (f.label.toLowerCase().includes(s)) return true
    return f.subfeatures.some((sub) =>
      sub.label.toLowerCase().includes(s) || (sub.children ?? []).some((c) => c.label.toLowerCase().includes(s)),
    )
  })
})

/** Top-level category rows the table shows — only categories with a visible feature. */
const visibleCategories = computed(() =>
  AUTHORITY_CATEGORIES.filter((cat) => visibleFeatures.value.some((f) => f.category === cat.value)),
)
function featuresInCategory(cat: AuthorityCategory) {
  return visibleFeatures.value.filter((f) => f.category === cat)
}

/** While searching, force-expand every visible group at every level so a
 *  matched row is never hidden behind a collapsed chevron. */
function isCategoryExpanded(cat: AuthorityCategory): boolean {
  if (search.value.trim()) return true
  return !!expandedCategories[cat]
}
function toggleCategoryExpand(cat: AuthorityCategory) {
  expandedCategories[cat] = !expandedCategories[cat]
}
function isExpanded(f: AuthorityFeature): boolean {
  if (search.value.trim()) return true
  return !!expandedFeatures[f.id]
}
function toggleExpand(f: AuthorityFeature) {
  if (!f.subfeatures.length) return
  expandedFeatures[f.id] = !expandedFeatures[f.id]
}
function isSubExpanded(f: AuthorityFeature, sub: AuthoritySubfeature): boolean {
  if (search.value.trim()) return true
  return !!expandedSubs[`${f.id}.${sub.id}`]
}
function toggleSubExpand(f: AuthorityFeature, sub: AuthoritySubfeature) {
  if (!sub.children?.length) return
  const key = `${f.id}.${sub.id}`
  expandedSubs[key] = !expandedSubs[key]
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

/**
 * One action column, aggregated over a set of leaf row keys — used to render a
 * single action checkbox on a parent row (category/feature/subfeature) that
 * reflects and cascades to every leaf underneath it. A parent row's checkbox is
 * checked when every descendant leaf has that action, indeterminate when only
 * some do, and toggling it sets/clears that action on every descendant leaf —
 * this is how selecting a parent auto-selects (or clears) its children.
 */
function actionState(rowKeys: string[], action: AuthorityAction): { checked: boolean; indeterminate: boolean } {
  if (!rowKeys.length) return { checked: false, indeterminate: false }
  const on = rowKeys.filter((k) => has(k, action)).length
  return { checked: on === rowKeys.length, indeterminate: on > 0 && on < rowKeys.length }
}
function toggleAction(rowKeys: string[], action: AuthorityAction, on: boolean) {
  for (const key of rowKeys) setGrant(key, action, on)
}

/** Level 1 (feature) — works for leaf features (single row key) and features with
 *  subfeatures alike, since authorityRowKeys() already flattens to the leaves. */
function featureActionState(feature: AuthorityFeature, action: AuthorityAction) {
  return actionState(authorityRowKeys(feature), action)
}
function toggleFeatureAction(feature: AuthorityFeature, action: AuthorityAction, on: boolean) {
  toggleAction(authorityRowKeys(feature), action, on)
}

/** Level 2 (subfeature) — same idea, over its own leaf key or its level-3 children. */
function subActionState(feature: AuthorityFeature, sub: AuthoritySubfeature, action: AuthorityAction) {
  return actionState(authoritySubRowKeys(feature.id, sub), action)
}
function toggleSubAction(feature: AuthorityFeature, sub: AuthoritySubfeature, action: AuthorityAction, on: boolean) {
  toggleAction(authoritySubRowKeys(feature.id, sub), action, on)
}

/** Category — every leaf row across every feature in the category that supports this action. */
function categoryActionKeys(cat: AuthorityCategory, action: AuthorityAction): string[] {
  return featuresInCategory(cat)
    .filter((f) => authorityActionsFor(f).includes(action))
    .flatMap((f) => authorityRowKeys(f))
}
function categoryActionAvailable(cat: AuthorityCategory, action: AuthorityAction): boolean {
  return featuresInCategory(cat).some((f) => authorityActionsFor(f).includes(action))
}
function categoryActionState(cat: AuthorityCategory, action: AuthorityAction) {
  return actionState(categoryActionKeys(cat, action), action)
}
function toggleCategoryAction(cat: AuthorityCategory, action: AuthorityAction, on: boolean) {
  toggleAction(categoryActionKeys(cat, action), action, on)
}

// ─── Right column — "N permissions selected" summary, grouped by category ──
const ACTION_VERB: Record<AuthorityAction, string> = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' }

const selectedSummary = computed(() => {
  return AUTHORITY_CATEGORIES
    .map((cat) => {
      const catFeatures = features.filter((f) => f.category === cat.value)
      const allKeys = catFeatures.flatMap((f) => authorityRowKeys(f))
      const grantedActions = new Set<AuthorityAction>()
      let totalCells = 0
      let onCells = 0
      for (const f of catFeatures) {
        const actions = authorityActionsFor(f)
        for (const key of authorityRowKeys(f)) {
          totalCells += actions.length
          for (const a of actions) if (has(key, a)) { onCells++; grantedActions.add(a) }
        }
      }
      if (!onCells) return null
      const fullyGranted = onCells === totalCells
      const bullets = fullyGranted
        ? [`${t('View all')} ${t(cat.label).toLowerCase()} ${t('features')}`]
        : AUTHORITY_ACTIONS.filter((a) => grantedActions.has(a.value)).map((a) => `${t(ACTION_VERB[a.value])} ${t(cat.label).toLowerCase()}`)
      return { category: cat, bullets }
    })
    .filter((x): x is { category: typeof AUTHORITY_CATEGORIES[number]; bullets: string[] } => !!x)
})

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
            <div class="crd-col crd-col--main">
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
                    is-full-width
                  />
                </MpFormControl>
              </section>

              <!-- ── Role permissions — one flat expandable table, up to 3 levels
                   deep (Figma "Drawer / Custom Role / Add"), not a rail + grid. ── -->
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

                <!-- Filter bar: Feature category quick filter + name search. -->
                <div class="crd-filter-bar">
                  <ErpFilterSelect
                    id="crd-quick-filter"
                    v-model="quickFilter"
                    :placeholder="t('Feature')"
                    :options="AUTHORITY_CATEGORIES.map((c) => ({ value: c.value, label: t(c.label) }))"
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
                      <template v-for="cat in visibleCategories" :key="cat.value">
                        <!-- Category — the top-level grouping row: chevron + tri-state
                             checkbox over every feature in the category, uppercase label. -->
                        <tr class="crd-row crd-row--category">
                          <td class="crd-td crd-td--feature">
                            <div class="crd-td-inner">
                              <button
                                type="button"
                                class="crd-chevron"
                                :class="{ 'crd-chevron--open': isCategoryExpanded(cat.value) }"
                                :aria-label="isCategoryExpanded(cat.value) ? t('Collapse') : t('Expand')"
                                @click="toggleCategoryExpand(cat.value)"
                              >
                                <MpIcon name="caret-down" size="sm" />
                              </button>
                              <span class="crd-td-label crd-td-label--category">{{ t(cat.label) }}</span>
                            </div>
                          </td>
                          <td v-for="action in AUTHORITY_ACTIONS" :key="action.value" class="crd-td crd-td--action">
                            <MpCheckbox
                              v-if="categoryActionAvailable(cat.value, action.value)"
                              :id="`${id}-cell-cat-${cat.value}-${action.value}`"
                              :aria-label="`${t(action.label)} — ${t(cat.label)}`"
                              :is-checked="categoryActionState(cat.value, action.value).checked"
                              :is-indeterminate="categoryActionState(cat.value, action.value).indeterminate"
                              @change="(on: boolean) => toggleCategoryAction(cat.value, action.value, on)"
                            />
                            <span v-else class="crd-na" :aria-label="t('Not available for this feature')">—</span>
                          </td>
                        </tr>

                        <template v-for="feature in featuresInCategory(cat.value)" :key="feature.id">
                          <!-- Level 1 (feature) — indented under its category; chevron only
                               if it has children, else its own cells carry the real grant. -->
                          <tr v-show="isCategoryExpanded(cat.value)" class="crd-row crd-row--l1">
                            <td class="crd-td crd-td--feature crd-td--l1">
                              <div class="crd-td-inner">
                                <button
                                  v-if="feature.subfeatures.length"
                                  type="button"
                                  class="crd-chevron"
                                  :class="{ 'crd-chevron--open': isExpanded(feature) }"
                                  :aria-label="isExpanded(feature) ? t('Collapse') : t('Expand')"
                                  @click="toggleExpand(feature)"
                                >
                                  <MpIcon name="caret-down" size="sm" />
                                </button>
                                <span v-else class="crd-chevron-spacer" aria-hidden="true" />
                                <span class="crd-td-label">{{ t(feature.label) }}</span>
                              </div>
                            </td>
                            <td v-for="action in AUTHORITY_ACTIONS" :key="action.value" class="crd-td crd-td--action">
                              <!-- Works for a leaf feature (its own single row) and a feature
                                   with subfeatures alike — checking it here grants/clears that
                                   action across every descendant leaf row. -->
                              <MpCheckbox
                                v-if="authorityActionsFor(feature).includes(action.value)"
                                :id="`${id}-cell-${feature.id}-${action.value}`"
                                :aria-label="`${t(action.label)} — ${t(feature.label)}`"
                                :is-checked="featureActionState(feature, action.value).checked"
                                :is-indeterminate="featureActionState(feature, action.value).indeterminate"
                                @change="(on: boolean) => toggleFeatureAction(feature, action.value, on)"
                              />
                              <span v-else class="crd-na" :aria-label="t('Not available for this feature')">—</span>
                            </td>
                          </tr>

                          <template v-for="sub in feature.subfeatures" :key="`${feature.id}.${sub.id}`">
                            <!-- Level 2 — indented further; chevron only if it has level-3 children. -->
                            <tr v-show="isCategoryExpanded(cat.value) && isExpanded(feature)" class="crd-row crd-row--l2">
                              <td class="crd-td crd-td--feature crd-td--l2">
                                <div class="crd-td-inner">
                                  <button
                                    v-if="sub.children?.length"
                                    type="button"
                                    class="crd-chevron"
                                    :class="{ 'crd-chevron--open': isSubExpanded(feature, sub) }"
                                    :aria-label="isSubExpanded(feature, sub) ? t('Collapse') : t('Expand')"
                                    @click="toggleSubExpand(feature, sub)"
                                  >
                                    <MpIcon name="caret-down" size="sm" />
                                  </button>
                                  <span v-else class="crd-chevron-spacer" aria-hidden="true" />
                                  <span class="crd-td-label">{{ t(sub.label) }}</span>
                                </div>
                              </td>
                              <td v-for="action in AUTHORITY_ACTIONS" :key="action.value" class="crd-td crd-td--action">
                                <MpCheckbox
                                  v-if="authorityActionsFor(feature).includes(action.value)"
                                  :id="`${id}-cell-${feature.id}.${sub.id}-${action.value}`"
                                  :aria-label="`${t(action.label)} — ${t(sub.label)}`"
                                  :is-checked="subActionState(feature, sub, action.value).checked"
                                  :is-indeterminate="subActionState(feature, sub, action.value).indeterminate"
                                  @change="(on: boolean) => toggleSubAction(feature, sub, action.value, on)"
                                />
                                <span v-else class="crd-na" :aria-label="t('Not available for this feature')">—</span>
                              </td>
                            </tr>

                            <!-- Level 3 — indented further still, one leaf row per child. -->
                            <tr
                              v-for="child in sub.children ?? []"
                              v-show="isCategoryExpanded(cat.value) && isExpanded(feature) && isSubExpanded(feature, sub)"
                              :key="`${feature.id}.${sub.id}.${child.id}`"
                              class="crd-row crd-row--l3"
                            >
                              <td class="crd-td crd-td--feature crd-td--l3">
                                <div class="crd-td-inner">
                                  <span class="crd-chevron-spacer" aria-hidden="true" />
                                  <span class="crd-td-label">{{ t(child.label) }}</span>
                                </div>
                              </td>
                              <td v-for="action in AUTHORITY_ACTIONS" :key="action.value" class="crd-td crd-td--action">
                                <MpCheckbox
                                  v-if="authorityActionsFor(feature).includes(action.value)"
                                  :id="`${id}-cell-${feature.id}.${sub.id}.${child.id}-${action.value}`"
                                  :aria-label="`${t(action.label)} — ${t(child.label)}`"
                                  :is-checked="has(`${feature.id}.${sub.id}.${child.id}`, action.value)"
                                  @change="(on: boolean) => setGrant(`${feature.id}.${sub.id}.${child.id}`, action.value, on)"
                                />
                                <span v-else class="crd-na" :aria-label="t('Not available for this feature')">—</span>
                              </td>
                            </tr>
                          </template>
                        </template>
                      </template>
                      <tr v-if="!visibleCategories.length">
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

            <!-- ── Right column — "N permissions selected" summary, Figma's List Group. ── -->
            <div class="crd-col crd-col--summary">
              <h2 class="crd-summary-title">
                {{ selectedSummary.length }} {{ selectedSummary.length === 1 ? t('permission selected') : t('permissions selected') }}
              </h2>
              <div v-for="group in selectedSummary" :key="group.category.value" class="crd-summary-group">
                <p class="crd-summary-label">{{ t(group.category.label) }}</p>
                <ul class="crd-summary-list">
                  <li v-for="bullet in group.bullets" :key="bullet">{{ bullet }}</li>
                </ul>
              </div>
            </div>
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
  /* Two columns: the permission table (flexible) + a fixed 260px summary rail —
     matches Figma's 1200px-wide drawer (884px main col + 260px summary col). */
  width: min(1200px, calc(100% - 24px));
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
  display: flex; align-items: flex-start; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
.crd-col--main {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.crd-col--summary {
  flex: 0 0 260px;
  display: flex; flex-direction: column;
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  border-radius: var(--mp-radii-xl, 12px);
  padding: var(--mp-spacing-6, 24px);
  position: sticky; top: 0;
}
.crd-summary-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.crd-summary-group + .crd-summary-group { margin-top: var(--mp-spacing-2); }
.crd-summary-label {
  margin: 0; padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.crd-summary-list {
  margin: 0; padding-left: var(--mp-spacing-5, 20px);
  list-style: disc outside;
  display: flex; flex-direction: column; gap: var(--mp-spacing-1);
}
.crd-summary-list li {
  display: list-item;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
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
.crd-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.crd-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: var(--mp-sizes-62, 248px); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.crd-search:focus-within {
  border-color: var(--mp-border-bold, #8c9596);
  box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596);
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

/* Category (top level) sits at the base cell padding; each level below steps
   in further: feature 40px, sub-feature 64px, child 88px. */
.crd-row--category { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.crd-td-label--category {
  text-transform: uppercase; font-weight: var(--mp-font-weights-semi-bold);
  font-size: 12px; line-height: var(--mp-line-heights-xs, 16px);
}
.crd-td--l1 { padding-left: 40px; }
.crd-td--l2 { padding-left: 64px; }
.crd-td--l3 { padding-left: 88px; }

.crd-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px);
  border: none; background: none; padding: 0; cursor: pointer;
  color: var(--mp-icon-default); flex-shrink: 0;
  transition: transform 150ms;
}
.crd-chevron--open { transform: rotate(180deg); }
.crd-chevron-spacer { display: inline-block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); flex-shrink: 0; }

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

@media (max-width: 960px) {
  .crd-body { flex-direction: column; }
  .crd-col--summary { flex-basis: auto; width: 100%; position: static; }
}
</style>
