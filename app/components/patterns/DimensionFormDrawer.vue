<!--
  DimensionFormDrawer — create/edit form for Settings > Dimensions, opened from
  the page title bar's "+ New dimension" (via useDimensionsFormDrawer's signal,
  since that button lives in [...slug].vue, outside DimensionsIndexPage.vue) and
  from each row's kebab "Edit" action.

  Source: Figma fileKey nZdSEnyXOmQVbSWYhcwyGT, node 5003:80800
  ("Drawer / Create Classification"). Adapted to this codebase's Teleport-free
  overlay convention (CrmCustomerViewDrawer.vue scaffold — MpDrawer has no
  structural CSS in this Pixel3 build) rather than the raw Figma markup.

  CONVENTION OVERRIDES applied (Figma path only):
    - Footer "Save" button uses this app's green brand-bold (matches every other
      primary CTA/modal footer built so far), not Figma's generic blue token.
    - "Values" free-text field is a plain input (not MpInputTag) so newly typed
      values land directly in the table below instead of also rendering as
      chips inside the field itself — MpInputTag has no way to suppress its own
      chip rendering while still emitting each entry.
    - Per-value "Select users" reuses SelectAccessDrawer.vue (the existing
      Cash Account "Select users/roles" picker) instead of a bespoke component,
      per the established "use existing pattern" convention for this feature.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  MpIcon, MpToggle, MpCheckbox, toast,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'
import MultiSelectDropdown from './MultiSelectDropdown.vue'
import SelectAccessDrawer, { type AccessOption } from './SelectAccessDrawer.vue'
import { accessUsers } from '~/data/accessControl'
import {
  DIMENSION_TRANSACTION_TYPE_OPTIONS, transactionTypeLabel,
  type Dimension, type DimensionInput, type DimensionTransactionType, type DimensionValue,
} from '~/data/dimensions'

const props = withDefaults(defineProps<{
  id: string
  isOpen: boolean
  mode: 'create' | 'edit'
  /** The dimension being edited — null/undefined in create mode. */
  modelValue?: Dimension | null
  /** 'transaction' when opened inline from a transaction form (e.g. ErpDimensionTagUpsell)
   *  instead of from Settings > Dimensions itself — swaps the header close control for a
   *  "view in Settings" shortcut, since closing here would just re-open the same upsell. */
  context?: 'settings' | 'transaction'
}>(), { context: 'settings' })
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'save', v: DimensionInput): void
}>()

const { t } = useLocale()

const NAME_MAX = 60
const TYPE_LABELS = DIMENSION_TRANSACTION_TYPE_OPTIONS.map((o) => o.label)
const userOptions: AccessOption[] = accessUsers.map((u) => ({ id: u.id, name: u.name, subtitle: u.roles.join(', ') }))

const draft = reactive({ name: '', values: [] as DimensionValue[], mandatory: false })
const selectedTypeLabels = ref<string[]>([])
const newValueDraft = ref('')
const valueSearch = ref('')
const nameError = ref(false)
const typesError = ref(false)

// ── Values bulk selection + pagination — reset alongside the rest of the draft. ──
const selectedValueNames = ref<Set<string>>(new Set())
const VALUES_PAGE_SIZE = 25
const visibleValueCount = ref(VALUES_PAGE_SIZE)

function resetDraft() {
  const d = props.modelValue
  draft.name = d?.name ?? ''
  draft.values = d ? d.values.map((v) => ({ name: v.name, userIds: [...v.userIds] })) : []
  draft.mandatory = d?.mandatory ?? false
  selectedTypeLabels.value = !d
    ? []
    : d.transactionTypes === 'all'
      ? [...TYPE_LABELS]
      : d.transactionTypes.map(transactionTypeLabel)
  newValueDraft.value = ''
  valueSearch.value = ''
  nameError.value = false
  typesError.value = false
  selectedValueNames.value = new Set()
  visibleValueCount.value = VALUES_PAGE_SIZE
}
watch(() => props.isOpen, (open) => { if (open) resetDraft() })
// A new search re-pages from the top so "Showing X of Y" always tracks the
// current filter rather than a stale scroll position from the last one.
watch(valueSearch, () => { visibleValueCount.value = VALUES_PAGE_SIZE })

// Fixed canonical order (Sales / Purchases / Expenses), not selection order.
const selectedTypesOrdered = computed(() =>
  DIMENSION_TRANSACTION_TYPE_OPTIONS.filter((o) => selectedTypeLabels.value.includes(o.label)),
)
// "All transactions" selected — the field itself already summarizes this, so
// the chip list below it (built for reviewing/removing individual types from
// a partial selection) would just repeat every option and add nothing.
const allTypesSelected = computed(() => selectedTypeLabels.value.length === TYPE_LABELS.length)
function removeType(label: string) {
  selectedTypeLabels.value = selectedTypeLabels.value.filter((l) => l !== label)
}

/** Adds one value if it's non-empty and not already present (values are
 *  deduped by name, case-sensitive — matches the pre-existing single-add check). */
function commitValue(raw: string) {
  const name = raw.trim()
  if (!name || draft.values.some((x) => x.name === name)) return
  draft.values.push({ name, userIds: [] })
}
/** Comma-separated typing support — "Jakarta, Bogor, Bandung" + Enter becomes
 *  three values at once. Commas alone don't commit anything (only Enter does)
 *  so a name that legitimately contains a comma can still be typed freely. */
function addValue() {
  newValueDraft.value.split(',').forEach(commitValue)
  newValueDraft.value = ''
}
function removeValue(name: string) {
  draft.values = draft.values.filter((x) => x.name !== name)
  selectedValueNames.value.delete(name)
}
const filteredValues = computed(() => {
  const s = valueSearch.value.trim().toLowerCase()
  return s ? draft.values.filter((v) => v.name.toLowerCase().includes(s)) : draft.values
})
// Search only earns its keep once scanning the list by eye stops being simple;
// the scroll box kicks in at the same threshold so five-or-fewer values never
// grow a scrollbar either.
const showValueSearch = computed(() => draft.values.length > 5)
const scrollValues = computed(() => filteredValues.value.length > 5)

// ── Pagination — 25 at a time, re-paged whenever the search narrows the list. ──
const pagedValues = computed(() => filteredValues.value.slice(0, visibleValueCount.value))
const hasMoreValues = computed(() => filteredValues.value.length > visibleValueCount.value)
function loadMoreValues() { visibleValueCount.value += VALUES_PAGE_SIZE }

function userAccessText(userIds: string[]) {
  if (userIds.length === 0) return t('Open to all')
  return userIds.length === 1 ? t('1 user') : `${userIds.length} ${t('users')}`
}

// ── Bulk selection — scoped to the currently PAGED rows, same convention as
//    ErpTablePage's bulk bar (selecting "all" never silently reaches into rows
//    hidden behind "Load more"). ──────────────────────────────────────────────
function isValueSelected(name: string) { return selectedValueNames.value.has(name) }
function toggleValueSelected(name: string) {
  const s = new Set(selectedValueNames.value)
  s.has(name) ? s.delete(name) : s.add(name)
  selectedValueNames.value = s
}
const allPagedSelected = computed(() =>
  pagedValues.value.length > 0 && pagedValues.value.every((v) => selectedValueNames.value.has(v.name)))
const somePagedSelected = computed(() => selectedValueNames.value.size > 0 && !allPagedSelected.value)
function toggleAllPaged() {
  const s = new Set(selectedValueNames.value)
  if (allPagedSelected.value) pagedValues.value.forEach((v) => s.delete(v.name))
  else pagedValues.value.forEach((v) => s.add(v.name))
  selectedValueNames.value = s
}
function deselectAllValues() { selectedValueNames.value = new Set() }
function onValuesEscKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && selectedValueNames.value.size > 0) deselectAllValues()
}
onMounted(() => document.addEventListener('keydown', onValuesEscKey))
onUnmounted(() => document.removeEventListener('keydown', onValuesEscKey))

// ── "Select users" — reuses SelectAccessDrawer (Cash Account picker). Opened
//    either for one value (its row link) or for every selected value at once
//    (bulk bar). Bulk-editing several values with different existing access
//    starts from "Open to all" rather than guessing a merge. ─────────────────
const userAccessOpen = ref(false)
const userAccessTargetNames = ref<string[]>([])
const userAccessSelected = computed(() => {
  if (userAccessTargetNames.value.length !== 1) return []
  return draft.values.find((v) => v.name === userAccessTargetNames.value[0])?.userIds ?? []
})
function openUserAccess(name: string) { userAccessTargetNames.value = [name]; userAccessOpen.value = true }
function openBulkUserAccess() { userAccessTargetNames.value = [...selectedValueNames.value]; userAccessOpen.value = true }
function onUserAccessSaved(ids: string[]) {
  const targets = new Set(userAccessTargetNames.value)
  for (const v of draft.values) if (targets.has(v.name)) v.userIds = ids
}

// ── "Transfer" — merges the selected values into one target value (the usual
//    fix for duplicate/near-duplicate tags): the target is kept, the selected
//    values are removed. Nothing else in this drawer tracks which posted
//    transactions used a given value, so there's nothing further to migrate. ──
const transferOpen = ref(false)
const transferTarget = ref('')
const transferError = ref(false)
const transferOptions = computed(() => draft.values.filter((v) => !selectedValueNames.value.has(v.name)))
function openTransfer() { transferTarget.value = ''; transferError.value = false; transferOpen.value = true }
function confirmTransfer() {
  if (!transferTarget.value) { transferError.value = true; return }
  const movedCount = selectedValueNames.value.size
  const target = transferTarget.value
  draft.values = draft.values.filter((v) => !selectedValueNames.value.has(v.name))
  selectedValueNames.value = new Set()
  transferOpen.value = false
  toast.notify({
    variant: 'success',
    title: t('Values transferred'),
    description: `${movedCount} ${movedCount === 1 ? t('value') : t('values')} ${t('transferred to')} ${target}`,
    rootProps: { class: 'toast-enterprise' },
  })
}

function close() { emit('update:isOpen', false) }
function viewInSettings() { window.open('/dimensions', '_blank', 'noopener') }
function save() {
  nameError.value = !draft.name.trim()
  typesError.value = selectedTypeLabels.value.length === 0
  if (nameError.value || typesError.value) return
  const transactionTypes = selectedTypesOrdered.value.map((o) => o.value) as DimensionTransactionType[]
  emit('save', { name: draft.name.trim(), transactionTypes, values: draft.values, mandatory: draft.mandatory })
  close()
}
</script>

<template>
  <Transition name="dfd">
    <div v-if="isOpen" class="dfd-overlay" @click.self="close">
      <div class="dfd-panel" role="dialog" :aria-label="mode === 'create' ? t('New dimension') : t('Edit dimension')">
        <header class="dfd-header">
          <span class="dfd-title">{{ mode === 'create' ? t('New dimension') : t('Edit dimension') }}</span>
          <button
            v-if="context === 'transaction'"
            class="dfd-close" type="button" :aria-label="t('View in Settings')" @click="viewInSettings"
          ><MpIcon name="newtab" size="md" /></button>
          <button v-else class="dfd-close" type="button" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></button>
        </header>

        <div class="dfd-body">
          <!-- Dimension name -->
          <div class="dfd-field">
            <div class="dfd-label-row">
              <span class="dfd-label">{{ t('Dimension name') }}<span class="dfd-required">*</span></span>
              <span class="dfd-counter">{{ draft.name.length }} / {{ NAME_MAX }}</span>
            </div>
            <input
              :id="`${id}-name`" v-model="draft.name" class="dfd-input" :class="{ 'is-invalid': nameError }"
              type="text" :maxlength="NAME_MAX" @input="nameError = false" @keydown.enter.prevent="save"
            >
            <span v-if="nameError" class="dfd-error">{{ t('You must fill in dimension name') }}</span>
          </div>

          <!-- Transaction type -->
          <div class="dfd-field">
            <span class="dfd-label">{{ t('Transaction type') }}<span class="dfd-required">*</span></span>
            <MultiSelectDropdown
              :id="`${id}-types`"
              :model-value="selectedTypeLabels"
              :options="TYPE_LABELS"
              :placeholder="t('Select transaction type')"
              :select-all-label="t('All transactions')"
              :all-selected-label="t('All transactions')"
              is-full-width
              hide-clear
              :is-invalid="typesError"
              @update:model-value="(v: string[]) => { selectedTypeLabels = v; typesError = false }"
            />
            <span v-if="typesError" class="dfd-error">{{ t('You must select at least one transaction type') }}</span>
            <ul v-if="selectedTypesOrdered.length && !allTypesSelected" class="dfd-type-list">
              <li v-for="opt in selectedTypesOrdered" :key="opt.value" class="dfd-type-item">
                <span>{{ t(opt.label) }}</span>
                <button class="dfd-icon-btn" type="button" :aria-label="`${t('Remove')} ${t(opt.label)}`" @click="removeType(opt.label)">
                  <MpIcon name="minus-circular" size="sm" />
                </button>
              </li>
            </ul>
          </div>

          <!-- Values -->
          <div class="dfd-field">
            <span class="dfd-label">{{ t('Values') }}</span>
            <input
              :id="`${id}-value-input`" v-model="newValueDraft" class="dfd-input"
              type="text"
              @keydown.enter.prevent="addValue"
            >
            <span class="dfd-hint">{{ t('Press Enter to add a value') }}</span>
          </div>

          <div v-if="showValueSearch" class="dfd-search">
            <MpIcon name="search" size="sm" />
            <input v-model="valueSearch" class="dfd-search-input" type="text" :placeholder="t('Search value')" />
          </div>

          <div class="dfd-values-table">
            <!-- Bulk selection bar — replaces the column headers while values are
                 selected (same convention as ErpTablePage's bulk bar). -->
            <div v-if="selectedValueNames.size > 0" class="dfd-values-bulkbar">
              <div class="dfd-values-bulkbar-left">
                <MpCheckbox
                  :id="`${id}-select-all`"
                  :is-checked="allPagedSelected"
                  :is-indeterminate="somePagedSelected"
                  @change="toggleAllPaged"
                />
                <span class="dfd-values-bulkbar-count">{{ selectedValueNames.size }} {{ t('selected') }}</span>
                <div class="dfd-values-bulkbar-actions">
                  <!-- Same "Actions ▾" primary-button + popover convention as
                       BillsIndexPage's bulk bar (#bulk-actions). -->
                  <MpPopover id="dfd-values-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                    <MpPopoverTrigger>
                      <button class="btn-enterprise btn-enterprise--primary btn-enterprise--xs btn-enterprise--icon-after" type="button">
                        {{ t('Actions') }}
                        <MpIcon name="chevrons-down" size="sm" color="icon.inverse" />
                      </button>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                      <MpPopoverList>
                        <MpPopoverListItem @click="openTransfer">{{ t('Transfer') }}</MpPopoverListItem>
                        <MpPopoverListItem @click="openBulkUserAccess">{{ t('Select users') }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </div>
              </div>
              <div class="dfd-values-bulkbar-right">
                <span>{{ t('Press') }}</span>
                <kbd class="dfd-values-bulkbar-kbd">Esc</kbd>
                <span>{{ t('to deselect') }}</span>
              </div>
            </div>
            <div v-else class="dfd-values-header">
              <span class="dfd-values-th dfd-values-th--check">
                <MpCheckbox
                  v-if="pagedValues.length"
                  :id="`${id}-select-all-header`"
                  :is-checked="allPagedSelected"
                  :is-indeterminate="somePagedSelected"
                  @change="toggleAllPaged"
                />
              </span>
              <span class="dfd-values-th">{{ t('Values') }}</span>
              <span class="dfd-values-th">{{ t('User access') }}</span>
              <span class="dfd-values-th dfd-values-th--spacer" />
            </div>

            <div v-if="pagedValues.length" class="dfd-values-body" :class="{ 'dfd-values-body--scroll': scrollValues }">
              <div v-for="v in pagedValues" :key="v.name" class="dfd-values-row" :class="{ 'is-selected': isValueSelected(v.name) }">
                <span class="dfd-values-cell dfd-values-cell--check">
                  <MpCheckbox :id="`${id}-value-${v.name}`" :is-checked="isValueSelected(v.name)" @change="toggleValueSelected(v.name)" />
                </span>
                <span class="dfd-values-cell">{{ v.name }}</span>
                <span class="dfd-values-cell dfd-values-cell--muted">
                  <span class="dfd-values-access-text">{{ userAccessText(v.userIds) }}</span>
                  <a class="dfd-values-access-link" @click="openUserAccess(v.name)">{{ t('Select users') }}</a>
                </span>
                <button
                  v-tooltip="{ label: t('Remove'), placement: 'top' }"
                  class="dfd-icon-btn dfd-icon-btn--delete" type="button" :aria-label="`${t('Remove')} ${v.name}`"
                  @click="removeValue(v.name)"
                >
                  <MpIcon name="minus-circular" size="sm" />
                </button>
              </div>
            </div>
            <p v-else-if="draft.values.length" class="dfd-values-none">{{ t('No values match your search.') }}</p>
            <div v-else class="dfd-values-empty">
              <img src="/illustrations/empty-folder.png" alt="" class="dfd-values-empty-img" width="96" height="80" />
              <p class="dfd-values-empty-title">{{ t('No values') }}</p>
              <p class="dfd-values-empty-desc">{{ t('Values will appear here.') }}</p>
            </div>
            <div v-if="draft.values.length" class="dfd-values-footer">
              <span>{{ t('Showing') }} {{ pagedValues.length }} {{ t('of') }} {{ filteredValues.length }} {{ t('values') }}</span>
              <a v-if="hasMoreValues" class="dfd-values-loadmore" @click="loadMoreValues">{{ t('Load') }} {{ Math.min(VALUES_PAGE_SIZE, filteredValues.length - pagedValues.length) }} {{ t('more') }}</a>
            </div>
          </div>

          <div class="dfd-divider" />

          <!-- Additional settings -->
          <div class="dfd-field">
            <h3 class="dfd-section-title">{{ t('Additional settings') }}</h3>
            <div class="dfd-toggle-row">
              <MpToggle :id="`${id}-mandatory`" v-model:is-checked="draft.mandatory" :aria-label="t('Mandatory to fill')" />
              <div class="dfd-toggle-col">
                <span class="dfd-toggle-label">{{ t('Mandatory to fill') }}</span>
                <span class="dfd-toggle-caption">{{ t('All new transactions will require this dimension.') }}</span>
              </div>
            </div>
          </div>
        </div>

        <footer class="dfd-footer">
          <button class="dfd-btn dfd-btn--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="dfd-btn dfd-btn--primary" type="button" @click="save">{{ mode === 'create' ? t('Save') : t('Save changes') }}</button>
        </footer>
      </div>
    </div>
  </Transition>

  <!-- ── Select users (per value) — existing Cash Account picker pattern. ── -->
  <SelectAccessDrawer
    v-model:open="userAccessOpen"
    :title="t('Select users')"
    :list-title="t('Users')"
    :options="userOptions"
    :model-value="userAccessSelected"
    :empty-title="t('No selected users')"
    :empty-caption="t('Selected users will appear here.')"
    :apply-to="userAccessTargetNames"
    @save="onUserAccessSaved"
  />

  <!-- ── Transfer (bulk) — merge the selected values into one kept value. ── -->
  <MpModal
    id="dfd-transfer-modal"
    :is-open="transferOpen"
    size="sm"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="transferOpen = false"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Transfer to') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="dfd-transfer-hint">{{ t('Selected values will be merged into the target value.') }}</p>
        <MpPopoverList :class="css({ maxHeight: '200px', overflowY: 'auto' })">
          <MpPopoverListItem
            v-for="opt in transferOptions"
            :key="opt.name"
            :is-active="opt.name === transferTarget"
            @click="transferTarget = opt.name; transferError = false"
          >
            {{ opt.name }}
          </MpPopoverListItem>
          <li v-if="!transferOptions.length" class="dfd-transfer-empty">{{ t('No other values to transfer to.') }}</li>
        </MpPopoverList>
        <span v-if="transferError" class="dfd-error">{{ t('You must select a target value') }}</span>
      </MpModalBody>
      <MpModalFooter>
        <div class="dfd-transfer-footer-btns">
          <button class="dfd-btn dfd-btn--ghost" type="button" @click="transferOpen = false">{{ t('Cancel') }}</button>
          <button class="dfd-btn dfd-btn--primary" type="button" @click="confirmTransfer">{{ t('Transfer') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.dfd-enter-active, .dfd-leave-active { transition: background-color 250ms ease; }
.dfd-enter-from, .dfd-leave-to { background-color: transparent; }
.dfd-enter-active .dfd-panel { transition: transform 350ms ease-out; }
.dfd-leave-active .dfd-panel { transition: transform 250ms ease-in; }
.dfd-enter-from .dfd-panel, .dfd-leave-to .dfd-panel { transform: translateX(calc(100% + 12px)); }

.dfd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.dfd-panel { margin: var(--mp-spacing-3); width: min(480px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }

.dfd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.dfd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dfd-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); padding: 0; }
.dfd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* macOS overlay scrollbars auto-hide, which makes a drawer with a handful of
   values (short enough that the inner values box doesn't scroll on its own,
   see `.dfd-values-body--scroll` below) look like it has nothing more to show
   even when it does — force a classic, always-visible bar (see ErpTablePage's
   .erp-table-wrapper for the same convention). */
.dfd-body {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4);
  scrollbar-width: thin;
  scrollbar-color: var(--mp-border-bold) var(--mp-background-neutral-subtle);
}
.dfd-body::-webkit-scrollbar { width: 10px; }
.dfd-body::-webkit-scrollbar-track { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.dfd-body::-webkit-scrollbar-thumb { background: var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-full, 999px); border: 2px solid var(--mp-background-neutral-subtle, #f8f9f9); }
.dfd-body::-webkit-scrollbar-thumb:hover { background: var(--mp-text-subtle, #656f80); }

.dfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 100%; }
.dfd-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); }
.dfd-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dfd-required { color: var(--mp-text-danger, #a8352d); margin-left: 2px; }
.dfd-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); flex-shrink: 0; }
.dfd-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.dfd-input { width: 100%; height: 36px; padding: 0 var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.dfd-input:focus { border-color: var(--mp-colors-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-colors-border-bold, #8c9596); }
.dfd-input::placeholder { color: var(--mp-text-placeholder); }
.dfd-input.is-invalid { border-color: var(--mp-border-danger, #dc2626); }
.dfd-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }

.dfd-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; background: none; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0; padding: 0; }
.dfd-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-text-default); }

.dfd-type-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.dfd-type-item { display: flex; align-items: center; justify-content: space-between; height: 36px; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.dfd-type-item:last-child { border-bottom: none; }

.dfd-search { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); color: var(--mp-icon-default); }
.dfd-search:focus-within { border-color: var(--mp-colors-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-colors-border-bold, #8c9596); }
.dfd-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dfd-search-input::placeholder { color: var(--mp-text-placeholder); }

.dfd-values-table { display: flex; flex-direction: column; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px); overflow: hidden; }
.dfd-values-header { display: flex; background: var(--mp-background-surface, #f1f5f9); }
.dfd-values-th { flex: 1; height: 28px; display: flex; align-items: center; padding: 0 var(--mp-spacing-4) 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-default); }
.dfd-values-th--check { flex: 0 0 40px; padding: 0; justify-content: center; }
.dfd-values-th--spacer { flex: 0 0 44px; padding: 0; }

/* Bulk selection bar — replaces .dfd-values-header while ≥1 value is checked,
   same convention as ErpTablePage's bulk bar (erp-bulk-bar). */
.dfd-values-bulkbar { display: flex; align-items: center; justify-content: space-between; min-height: 28px; padding: var(--mp-spacing-1) var(--mp-spacing-2); gap: var(--mp-spacing-3); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.dfd-values-bulkbar-left { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-shrink: 0; }
.dfd-values-bulkbar-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); white-space: nowrap; }
.dfd-values-bulkbar-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.dfd-values-bulkbar-right { display: flex; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.dfd-values-bulkbar-kbd { display: inline-flex; align-items: center; justify-content: center; padding: 0 var(--mp-spacing-1); background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-sm); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); font-family: inherit; }

.dfd-values-body { display: flex; flex-direction: column; }
/* Only earns a fixed height + scrollbar once there's enough rows to need one
   (>5) — see `scrollValues`; short lists just grow with the drawer. */
.dfd-values-body--scroll {
  max-height: 220px; overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--mp-border-bold) var(--mp-background-neutral-subtle);
}
.dfd-values-body--scroll::-webkit-scrollbar { width: 10px; }
.dfd-values-body--scroll::-webkit-scrollbar-track { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.dfd-values-body--scroll::-webkit-scrollbar-thumb { background: var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-full, 999px); border: 2px solid var(--mp-background-neutral-subtle, #f8f9f9); }
.dfd-values-body--scroll::-webkit-scrollbar-thumb:hover { background: var(--mp-text-subtle, #656f80); }
.dfd-values-row { display: flex; align-items: center; min-height: 40px; padding: var(--mp-spacing-1\.5, 6px) 0; border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.dfd-values-row:first-child { border-top: none; }
.dfd-values-row.is-selected { background: var(--mp-background-brand-subtle, #e8f5f0); }
.dfd-values-cell { flex: 1; padding: 0 var(--mp-spacing-4) 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dfd-values-cell--check { flex: 0 0 40px; padding: 0; display: flex; justify-content: center; }
.dfd-values-cell--muted { display: flex; flex-direction: column; gap: 2px; color: var(--mp-text-secondary); }
.dfd-values-access-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dfd-values-access-link { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.dfd-values-row .dfd-icon-btn { margin-right: var(--mp-spacing-2); }
/* Delete only appears while its row is hovered; the tooltip on the icon itself
   still fires normally once it's visible and the pointer reaches it. */
.dfd-icon-btn--delete { visibility: hidden; }
.dfd-values-row:hover .dfd-icon-btn--delete { visibility: visible; }
.dfd-values-none { margin: 0; padding: var(--mp-spacing-4) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
/* progressive pagination (load-more) row — see ErpPagination.md: link sits
   right beside the count, not pushed to the far right. */
.dfd-values-footer { display: flex; align-items: center; justify-content: flex-start; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); background: var(--mp-background-neutral, #fff); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.dfd-values-loadmore { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-link); cursor: pointer; }

/* Transfer modal (bulk) — "merge selected values into…" */
.dfd-transfer-hint { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.dfd-transfer-empty { padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); list-style: none; }
.dfd-transfer-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

.dfd-values-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-6) 0; }
.dfd-values-empty-img { width: 96px; height: 80px; object-fit: contain; }
.dfd-values-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dfd-values-empty-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.dfd-divider { height: 1px; background: var(--mp-border-default, #e3e7e9); }

.dfd-section-title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dfd-toggle-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.dfd-toggle-col { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); padding-top: 2px; }
.dfd-toggle-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.dfd-toggle-caption { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.dfd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.dfd-btn { height: 36px; padding: 0 var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); cursor: pointer; border: 1px solid transparent; }
.dfd-btn--ghost { background: transparent; color: var(--mp-text-secondary); }
.dfd-btn--ghost:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.dfd-btn--primary { background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-weight: var(--mp-font-weights-semi-bold); }
.dfd-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #095c41); }
</style>
