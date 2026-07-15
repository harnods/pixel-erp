<script setup lang="ts">
/**
 * Bill of materials index — "All filters" drawer. A custom Teleport overlay (MpDrawer
 * has no structural CSS in this Pixel3 build — see LocationPriorityDrawer.vue for the
 * same pattern). Edits a local draft; only commits to the parent's filter refs on Apply,
 * so Cancel/close-outside discards in-progress edits.
 */
import { MpIcon, MpInput, MpAutocomplete, MpToggle, MpFormControl, MpFormLabel } from '@mekari/pixel3'

export interface BomFiltersValue {
  keyword: string
  category: string
  costingReference: string
  finishedGoodId: string
  showArchived: boolean
}

const props = defineProps<{
  isOpen: boolean
  modelValue: BomFiltersValue
  categoryOptions: { id: string; name: string }[]
  costingOptions: { id: string; name: string }[]
  finishedGoodOptions: { id: string; name: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: BomFiltersValue): void
}>()

const draft = reactive<BomFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() {
  draft.keyword = ''
  draft.category = ''
  draft.costingReference = ''
  draft.finishedGoodId = ''
  draft.showArchived = false
}
</script>

<template>
  <Transition name="bf-filters">
    <div v-if="isOpen" class="bf-filters-overlay" @click.self="close">
      <div class="bf-filters-panel" role="dialog" aria-label="All filters">
        <header class="bf-filters-header">
          <span class="bf-filters-title">All filters</span>
          <button class="bf-filters-close" type="button" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="bf-filters-body">
          <MpFormControl id="bf-filters-keyword-fc">
            <MpFormLabel>Keyword</MpFormLabel>
            <MpInput id="bf-filters-keyword" v-model="draft.keyword" placeholder="Search number, name, description" is-full-width />
          </MpFormControl>

          <MpFormControl id="bf-filters-category-fc">
            <MpFormLabel>Category</MpFormLabel>
            <MpAutocomplete
              id="bf-filters-category" v-model="draft.category" :data="categoryOptions"
              label-prop="name" value-prop="id" placeholder="All categories"
              is-searchable is-clearable use-portal is-full-width
            />
          </MpFormControl>

          <MpFormControl id="bf-filters-costing-fc">
            <MpFormLabel>Costing reference</MpFormLabel>
            <MpAutocomplete
              id="bf-filters-costing" v-model="draft.costingReference" :data="costingOptions"
              label-prop="name" value-prop="id" placeholder="All costing references"
              is-searchable is-clearable use-portal is-full-width
            />
          </MpFormControl>

          <MpFormControl id="bf-filters-fg-fc">
            <MpFormLabel>Finished goods</MpFormLabel>
            <MpAutocomplete
              id="bf-filters-fg" v-model="draft.finishedGoodId" :data="finishedGoodOptions"
              label-prop="name" value-prop="id" placeholder="All finished goods"
              is-searchable is-clearable use-portal is-full-width
            />
          </MpFormControl>

          <div class="bf-filters-toggle-row">
            <span class="bf-filters-toggle-label">Show archived BOM</span>
            <MpToggle v-model:is-checked="draft.showArchived" aria-label="Show archived BOM" />
          </div>
        </div>

        <footer class="bf-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Clear all</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply filters</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bf-filters-enter-active { transition: background-color 250ms ease; }
.bf-filters-leave-active { transition: background-color 250ms ease; }
.bf-filters-enter-from, .bf-filters-leave-to { background-color: transparent; }
.bf-filters-enter-active .bf-filters-panel { transition: transform 350ms ease-out; }
.bf-filters-leave-active .bf-filters-panel { transition: transform 250ms ease-in; }
.bf-filters-enter-from .bf-filters-panel,
.bf-filters-leave-to .bf-filters-panel { transform: translateX(calc(100% + 12px)); }

.bf-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.bf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.bf-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.bf-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.bf-filters-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.bf-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.bf-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
.bf-filters-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
}
.bf-filters-toggle-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.bf-filters-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
