<script lang="ts">
/**
 * CRM Customers — "All filters" / saved-view drawer. Creates a new saved view or
 * edits an existing one: a name, a view type (Table / Board), a board Group-by,
 * and the saved filters (Lifecycle · Contact owner · Segment). Same custom
 * Teleport-free overlay pattern as BillsFiltersDrawer (MpDrawer has no structural
 * CSS in this Pixel3 build). Edits a local draft, commits only on Save.
 */
import type { CrmViewType, CrmGroupBy, CrmViewFilters } from '~/data/crm'

export interface ViewDraft {
  name: string
  type: CrmViewType
  groupBy: CrmGroupBy
  filters: CrmViewFilters
}
</script>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox, MpInput, MpFormControl, MpFormLabel } from '@mekari/pixel3'
import { LIFECYCLE_STAGES, CRM_GROUP_BY } from '~/data/crm'

const props = defineProps<{
  id: string
  isOpen: boolean
  mode: 'create' | 'edit'
  modelValue: ViewDraft
  ownerOptions: string[]
  segmentOptions: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'save', v: ViewDraft): void
  (e: 'delete'): void
}>()

const draft = reactive<ViewDraft>(clone(props.modelValue))
const nameError = ref(false)
function clone(v: ViewDraft): ViewDraft {
  return { name: v.name, type: v.type, groupBy: v.groupBy, filters: { lifecycle: [...v.filters.lifecycle], owners: [...v.filters.owners], segments: [...v.filters.segments] } }
}
watch(() => props.isOpen, (open) => { if (open) { Object.assign(draft, clone(props.modelValue)); nameError.value = false } })

function close() { emit('update:isOpen', false) }
function resetFilters() { draft.filters.lifecycle = []; draft.filters.owners = []; draft.filters.segments = [] }
function save() {
  if (!draft.name.trim()) { nameError.value = true; return }
  emit('save', clone(draft))
  close()
}
function toggle(list: string[], v: string) {
  const i = list.indexOf(v)
  if (i === -1) list.push(v); else list.splice(i, 1)
}
</script>

<template>
  <Transition name="cvd">
    <div v-if="isOpen" class="cvd-overlay">
      <div class="cvd-panel" role="dialog" aria-label="View settings">
        <header class="cvd-header">
          <span class="cvd-title">{{ mode === 'create' ? 'New view' : 'Edit view' }}</span>
          <MpButton class="cvd-close" aria-label="Close" @click="close"><MpIcon name="close" size="md" /></MpButton>
        </header>

        <div class="cvd-body">
          <!-- View name -->
          <MpFormControl :id="`${id}-name-fc`" :is-error="nameError">
            <MpFormLabel>View name</MpFormLabel>
            <MpInput
              v-model="draft.name" type="text" placeholder="e.g. My accounts" is-full-width
              @input="nameError = false" @keydown.enter.prevent="save"
            />
            <span v-if="nameError" class="cvd-error">Give this view a name.</span>
          </MpFormControl>

          <!-- View type -->
          <div class="cvd-field">
            <span class="cvd-field-label">View type</span>
            <div class="cvd-typetabs">
              <button type="button" class="page-tab" :class="{ 'page-tab--active': draft.type === 'table' }" @click="draft.type = 'table'"><MpIcon name="table-view-list" size="sm" /> Table</button>
              <button type="button" class="page-tab" :class="{ 'page-tab--active': draft.type === 'board' }" @click="draft.type = 'board'"><MpIcon name="table-view-column" size="sm" /> Board</button>
            </div>
          </div>

          <!-- Group by (board only) -->
          <div v-if="draft.type === 'board'" class="cvd-field">
            <span class="cvd-field-label">Group by</span>
            <ul class="cvd-radiolist">
              <li v-for="g in CRM_GROUP_BY" :key="g.value" class="cvd-radio-item" @click="draft.groupBy = g.value">
                <span class="cvd-radio" :class="{ 'is-on': draft.groupBy === g.value }" />
                <span class="cvd-check-label">{{ g.label }}</span>
              </li>
            </ul>
          </div>

          <div class="cvd-divider" />

          <!-- Lifecycle -->
          <div class="cvd-field">
            <span class="cvd-field-label">Lifecycle</span>
            <ul class="cvd-checklist">
              <li v-for="s in LIFECYCLE_STAGES" :key="s" class="cvd-check-item" @click="toggle(draft.filters.lifecycle, s)">
                <span @click.stop><MpCheckbox :id="`${id}-lc-${s}`" :is-checked="draft.filters.lifecycle.includes(s)" @change="() => toggle(draft.filters.lifecycle, s)" /></span>
                <span class="cvd-check-label">{{ s }}</span>
              </li>
            </ul>
          </div>

          <!-- Contact owner -->
          <div class="cvd-field">
            <span class="cvd-field-label">Contact owner</span>
            <ul class="cvd-checklist">
              <li v-for="o in ownerOptions" :key="o" class="cvd-check-item" @click="toggle(draft.filters.owners, o)">
                <span @click.stop><MpCheckbox :id="`${id}-ow-${o}`" :is-checked="draft.filters.owners.includes(o)" @change="() => toggle(draft.filters.owners, o)" /></span>
                <span class="cvd-check-label">{{ o }}</span>
              </li>
            </ul>
          </div>

          <!-- Segment -->
          <div v-if="segmentOptions.length" class="cvd-field">
            <span class="cvd-field-label">Segment</span>
            <ul class="cvd-checklist">
              <li v-for="s in segmentOptions" :key="s" class="cvd-check-item" @click="toggle(draft.filters.segments, s)">
                <span @click.stop><MpCheckbox :id="`${id}-sg-${s}`" :is-checked="draft.filters.segments.includes(s)" @change="() => toggle(draft.filters.segments, s)" /></span>
                <span class="cvd-check-label">{{ s }}</span>
              </li>
            </ul>
          </div>
        </div>

        <footer class="cvd-footer">
          <button v-if="mode === 'edit'" class="btn-enterprise btn-enterprise--danger" type="button" @click="emit('delete')">Delete view</button>
          <button v-else class="btn-enterprise btn-enterprise--ghost" type="button" @click="resetFilters">Reset filter</button>
          <div class="cvd-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ mode === 'create' ? 'Save view' : 'Save changes' }}</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cvd-enter-active, .cvd-leave-active { transition: background-color 250ms ease; }
.cvd-enter-from, .cvd-leave-to { background-color: transparent; }
.cvd-enter-active .cvd-panel { transition: transform 350ms ease-out; }
.cvd-leave-active .cvd-panel { transition: transform 250ms ease-in; }
.cvd-enter-from .cvd-panel, .cvd-leave-to .cvd-panel { transform: translateX(calc(100% + 12px)); }

.cvd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cvd-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.cvd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.cvd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cvd-close { display: inline-flex !important; align-items: center; justify-content: center; width: 36px !important; height: 36px !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.cvd-close:hover { background: var(--mp-background-neutral-hovered); }

.cvd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4); }
.cvd-input { width: 100%; height: 36px; padding: 0 var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.cvd-input:focus { border-color: var(--mp-border-brand, #0a6e4e); }
.cvd-input::placeholder { color: var(--mp-text-placeholder); }
.cvd-error { display: block; margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }

.cvd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cvd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* layout-only container for the Table/Board tabs; controls use the sanctioned .page-tab pattern */
.cvd-typetabs { display: flex; align-items: flex-end; gap: var(--mp-spacing-5); }
.page-tab {
  position: relative; display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); white-space: nowrap; transition: color 100ms;
}
.page-tab:not(.page-tab--active):hover { color: var(--mp-text-default); }
.page-tab--active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.page-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--mp-text-selected); border-radius: var(--mp-radii-sm, 2px) var(--mp-radii-sm, 2px) 0 0; }

.cvd-radiolist, .cvd-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cvd-radio-item, .cvd-check-item { display: flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; user-select: none; }
.cvd-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cvd-radio { width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--mp-border-bold, #c4c9d0); flex-shrink: 0; position: relative; }
.cvd-radio.is-on { border-color: var(--mp-border-brand, #0a6e4e); }
.cvd-radio.is-on::after { content: ''; position: absolute; inset: 3px; border-radius: 50%; background: var(--mp-border-brand, #0a6e4e); }

.cvd-divider { height: 1px; background: var(--mp-border-default); }

.cvd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.cvd-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
