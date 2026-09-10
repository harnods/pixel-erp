<script setup lang="ts">
/**
 * CustomRoleDrawer — Settings › Users & roles › Custom role → "New / Edit custom
 * role".
 *
 * Benchmarked on Jurnal's "Add custom role" side panel, rebuilt on the ERP
 * drawer standard: a hand-rolled Teleport overlay (rule/drawer-custom-shell —
 * Pixel MpDrawer has no structural CSS in this build). It is a FORM drawer, so
 * an overlay click is ignored — closing is only via ×, Cancel, or Esc, and
 * in-progress input is never lost by a stray click.
 *
 * The Authority matrix is a master-detail grid, not an index table: the left
 * rail lists every feature (with a tri-state checkbox), the right pane shows the
 * permission grid for whichever feature is active. Built as a native form table
 * per docs/patterns/FormTable.md — ErpTablePage's pagination/sort/skeleton
 * behaviour is for index tables and does not apply here.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea } from '@mekari/pixel3'
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
const activeFeatureId = ref(features.value[0]!.id)

const nameError = ref('')
const authorityError = ref('')
const isSaving = ref(false)

/** Re-seed the draft on every open, so a discarded edit is forgotten next time. */
watch(() => props.isOpen, (open) => {
  if (!open) return
  nameError.value = ''
  authorityError.value = ''
  isSaving.value = false
  activeFeatureId.value = features.value[0]!.id
  for (const key of Object.keys(grants)) delete grants[key]

  const role = props.roleId ? getCustomRole(props.roleId) : undefined
  name.value = role?.name ?? ''
  description.value = role?.description ?? ''
  if (role) {
    for (const [key, actions] of Object.entries(role.grants)) grants[key] = [...actions]
    // Open on the first feature that already has something granted — the user
    // almost always wants to continue where the role's authority actually is.
    const first = features.value.find((f) => authorityRowKeys(f).some((k) => grants[k]?.length))
    if (first) activeFeatureId.value = first.id
  }
  // The rail scrolls independently, so an active feature further down the list
  // would otherwise open off-screen with the grid showing rows the user can't
  // see the source of.
  nextTick(() => {
    railEl.value
      ?.querySelector('.crd-rail-item--active')
      ?.scrollIntoView({ block: 'nearest' })
  })
}, { immediate: true })

const railEl = ref<HTMLElement | null>(null)

const activeFeature = computed<AuthorityFeature>(
  () => features.value.find((f) => f.id === activeFeatureId.value) ?? features.value[0]!,
)

/** Rows of the right-hand grid: one per sub-feature, or one for the feature itself. */
const activeRows = computed(() => {
  const f = activeFeature.value
  if (!f.subfeatures.length) return [{ key: f.id, label: f.label }]
  return f.subfeatures.map((s) => ({ key: `${f.id}.${s.id}`, label: s.label }))
})

const featureCount = computed(() => grantedFeatureCount(grants))

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

/** Column header checkbox — applies one action across every row of the active feature. */
function columnState(action: AuthorityAction): { checked: boolean; indeterminate: boolean } {
  const rows = activeRows.value.filter(() => authorityActionsFor(activeFeature.value).includes(action))
  if (!rows.length) return { checked: false, indeterminate: false }
  const on = rows.filter((r) => has(r.key, action)).length
  return { checked: on === rows.length, indeterminate: on > 0 && on < rows.length }
}

function toggleColumn(action: AuthorityAction, on: boolean) {
  if (!authorityActionsFor(activeFeature.value).includes(action)) return
  for (const row of activeRows.value) setGrant(row.key, action, on)
}

/** Row checkbox in the Sub-feature column — all actions for that one row. */
function rowState(rowKey: string): { checked: boolean; indeterminate: boolean } {
  const actions = authorityActionsFor(activeFeature.value)
  const on = actions.filter((a) => has(rowKey, a)).length
  return { checked: on === actions.length, indeterminate: on > 0 && on < actions.length }
}

function toggleRow(rowKey: string, on: boolean) {
  for (const action of authorityActionsFor(activeFeature.value)) setGrant(rowKey, action, on)
}

/** Left-rail checkbox — every action of every row in that feature. */
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

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') close() }
watch(() => props.isOpen, (open) => {
  if (!import.meta.client) return
  if (open) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="crd">
      <!-- Form drawer: overlay clicks are intentionally ignored. -->
      <div v-if="isOpen" class="crd-overlay">
        <div class="crd-panel" role="dialog" :aria-label="isEdit ? t('Edit custom role') : t('New custom role')">
          <header class="crd-header">
            <span class="crd-title">{{ isEdit ? t('Edit custom role') : t('New custom role') }}</span>
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

            <!-- ── Authority matrix ── -->
            <section class="crd-section">
              <div class="crd-label-row">
                <h2 class="crd-section-title">
                  {{ t('Authority') }}<span class="crd-required">*</span>
                </h2>
                <span class="crd-counter">{{ featureCount }} {{ featureCount === 1 ? t('feature selected') : t('features selected') }}</span>
              </div>
              <p class="crd-section-desc">
                {{ t('Pick a feature on the left, then grant what this role can do with it.') }}
              </p>

              <div class="crd-matrix" :class="{ 'crd-matrix--invalid': !!authorityError }">
                <!-- Left rail: every feature, with a tri-state select-all checkbox. -->
                <div class="crd-rail">
                  <div class="crd-grid-head crd-rail-head">
                    {{ t('Feature') }} ({{ featureCount }})
                  </div>
                  <ul ref="railEl" class="crd-rail-list">
                    <li
                      v-for="feature in features"
                      :key="feature.id"
                      class="crd-rail-item"
                      :class="{ 'crd-rail-item--active': feature.id === activeFeatureId }"
                      @click="activeFeatureId = feature.id"
                    >
                      <span @click.stop>
                        <MpCheckbox
                          :id="`${id}-feature-${feature.id}`"
                          :is-checked="featureState(feature).checked"
                          :is-indeterminate="featureState(feature).indeterminate"
                          @change="(on: boolean) => toggleFeature(feature, on)"
                        />
                      </span>
                      <span class="crd-rail-label">{{ t(feature.label) }}</span>
                    </li>
                  </ul>
                </div>

                <!-- Right pane: permission grid for the active feature. -->
                <div class="crd-grid">
                  <table class="crd-table">
                    <thead>
                      <tr>
                        <th class="crd-th crd-th--subfeature">{{ t('Subfeature/additional function') }}</th>
                        <th v-for="action in AUTHORITY_ACTIONS" :key="action.value" class="crd-th crd-th--action">
                          <span class="crd-th-inner">
                            <MpCheckbox
                              :id="`${id}-col-${action.value}`"
                              :aria-label="`${t(action.label)} — ${t('all')} ${t(activeFeature.label)}`"
                              :is-checked="columnState(action.value).checked"
                              :is-indeterminate="columnState(action.value).indeterminate"
                              :is-disabled="!authorityActionsFor(activeFeature).includes(action.value)"
                              @change="(on: boolean) => toggleColumn(action.value, on)"
                            />
                            {{ t(action.label) }}
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in activeRows" :key="row.key">
                        <td class="crd-td crd-td--subfeature">
                          <div class="crd-td-inner">
                            <MpCheckbox
                              :id="`${id}-row-${row.key}`"
                              :aria-label="`${t('All authority')} — ${t(row.label)}`"
                              :is-checked="rowState(row.key).checked"
                              :is-indeterminate="rowState(row.key).indeterminate"
                              @change="(on: boolean) => toggleRow(row.key, on)"
                            />
                            <span class="crd-td-label">{{ t(row.label) }}</span>
                          </div>
                        </td>
                        <td
                          v-for="action in AUTHORITY_ACTIONS"
                          :key="action.value"
                          class="crd-td crd-td--action"
                        >
                          <MpCheckbox
                            v-if="authorityActionsFor(activeFeature).includes(action.value)"
                            :id="`${id}-cell-${row.key}-${action.value}`"
                            :aria-label="`${t(action.label)} — ${t(row.label)}`"
                            :is-checked="has(row.key, action.value)"
                            @change="(on: boolean) => setGrant(row.key, action.value, on)"
                          />
                          <span v-else class="crd-na" :aria-label="t('Not available for this feature')">—</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
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
  /* Wide: the authority matrix is a 5-column grid beside a feature rail. */
  width: min(960px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  overflow: hidden;
}
.crd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
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
.crd-close:hover { background: var(--mp-background-neutral-hovered); }

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

/* ── Authority matrix — feature rail + permission grid ── */
.crd-matrix {
  display: flex; align-items: stretch;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md, 6px);
  overflow: hidden;
}
.crd-matrix--invalid { border-color: var(--mp-border-critical, var(--mp-border-danger)); }

/* Header cells on both sides share the ErpTablePage header spec (12px semibold
   uppercase, neutral-subtle) so the two panes read as one table. The 28px header
   height is a minimum here — the long "Subfeature/additional function" label
   wraps rather than colliding with the first action column. */
.crd-grid-head, .crd-th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-sm);
  text-transform: uppercase; text-align: left; color: var(--mp-text-default);
  white-space: nowrap; vertical-align: middle;
}
/* Extra right padding keeps the wrapped label off the View column's select-all
   box when the panel is wide enough for the header to sit on two lines. */
.crd-th--subfeature { white-space: normal; padding-right: var(--mp-spacing-4); }

.crd-rail {
  flex: 0 0 208px; display: flex; flex-direction: column;
  border-right: 1px solid var(--mp-border-default);
}
.crd-rail-list {
  flex: 1; margin: 0; padding: 0; list-style: none;
  max-height: 380px; overflow-y: auto;
}
.crd-rail-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  min-height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  border-left: 2px solid transparent;
  cursor: pointer; user-select: none;
}
.crd-rail-item:last-child { border-bottom: none; }
.crd-rail-item:hover { background: var(--mp-background-neutral-hovered); }
.crd-rail-item--active {
  background: var(--mp-background-neutral-subtle);
  border-left-color: var(--mp-background-brand);
}
.crd-rail-label {
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}

.crd-grid { flex: 1; min-width: 0; overflow-x: auto; }
/* min-width floors the sub-feature column: below it the grid scrolls horizontally
   instead of squeezing, which would let the wrapped header text overflow its cell
   and collide with the View column. */
.crd-table { width: 100%; min-width: 760px; border-collapse: collapse; table-layout: fixed; }
.crd-th--subfeature { width: auto; }
/* Action columns stay left-aligned: header and body checkboxes then share the
   cell's left padding, so every body box sits exactly under its column's
   select-all box — the alignment cue that makes a permission matrix scannable. */
.crd-th--action { width: 140px; }
.crd-th-inner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }

.crd-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: middle;
}
.crd-td-inner { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.crd-td-label { white-space: normal; }
.crd-na { color: var(--mp-text-secondary); }
.crd-table tbody tr:last-child .crd-td { border-bottom: none; }
.crd-table tbody tr:hover { background: var(--mp-background-neutral-hovered); }

/* ── Footer — ghost Cancel + one primary. Alignment and the ≤640px stacked,
   full-width, primary-on-top behaviour come from the global .erp-action-footer
   (rule/btn-responsive-footer); this only adds the drawer's own chrome. ── */
.crd-footer {
  flex-shrink: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}

@media (max-width: 640px) {
  .crd-rail { flex-basis: 160px; }
}
</style>
