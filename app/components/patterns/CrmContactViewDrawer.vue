<script lang="ts">
/**
 * CRM Contacts — "All filters" / saved-view drawer. Creates a new saved view or
 * edits an existing one: a name plus the saved filters (Contact owner). Same
 * custom Teleport-free overlay pattern as CrmCustomerViewDrawer (MpDrawer has no
 * structural CSS in this Pixel3 build). Edits a local draft, commits only on Save.
 */
export interface ContactViewDraft {
  name: string
  filters: { owners: string[] }
}
</script>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox, MpInput, MpFormControl, MpFormLabel } from '@mekari/pixel3'

const props = defineProps<{
  id: string
  isOpen: boolean
  mode: 'create' | 'edit'
  modelValue: ContactViewDraft
  ownerOptions: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'save', v: ContactViewDraft): void
  (e: 'delete'): void
}>()

const draft = reactive<ContactViewDraft>(clone(props.modelValue))
const nameError = ref(false)
function clone(v: ContactViewDraft): ContactViewDraft {
  return { name: v.name, filters: { owners: [...v.filters.owners] } }
}
watch(() => props.isOpen, (open) => { if (open) { Object.assign(draft, clone(props.modelValue)); nameError.value = false } })

function close() { emit('update:isOpen', false) }
function resetFilters() { draft.filters.owners = [] }
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
  <Transition name="ctvd">
    <div v-if="isOpen" class="ctvd-overlay">
      <div class="ctvd-panel" role="dialog" aria-label="View settings">
        <header class="ctvd-header">
          <span class="ctvd-title">{{ mode === 'create' ? 'New view' : 'Edit view' }}</span>
          <MpButton class="ctvd-close" aria-label="Close" @click="close"><MpIcon name="close" size="md" /></MpButton>
        </header>

        <div class="ctvd-body">
          <!-- View name -->
          <MpFormControl :id="`${id}-name-fc`" :is-error="nameError">
            <MpFormLabel>View name</MpFormLabel>
            <MpInput
              v-model="draft.name" type="text" placeholder="e.g. My contacts" is-full-width
              @input="nameError = false" @keydown.enter.prevent="save"
            />
            <span v-if="nameError" class="ctvd-error">Give this view a name.</span>
          </MpFormControl>

          <div class="ctvd-divider" />

          <!-- Contact owner -->
          <div class="ctvd-field">
            <span class="ctvd-field-label">Contact owner</span>
            <ul class="ctvd-checklist">
              <li v-for="o in ownerOptions" :key="o" class="ctvd-check-item" @click="toggle(draft.filters.owners, o)">
                <span @click.stop><MpCheckbox :id="`${id}-ow-${o}`" :is-checked="draft.filters.owners.includes(o)" @change="() => toggle(draft.filters.owners, o)" /></span>
                <span class="ctvd-check-label">{{ o }}</span>
              </li>
            </ul>
          </div>
        </div>

        <footer class="ctvd-footer">
          <MpButton v-if="mode === 'edit'" class="btn-enterprise btn-enterprise--danger" variant="danger" type="button" @click="emit('delete')">Delete view</MpButton>
          <MpButton v-else class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="resetFilters">Reset filter</MpButton>
          <div class="ctvd-footer-right">
            <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">Cancel</MpButton>
            <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="save">{{ mode === 'create' ? 'Save view' : 'Save changes' }}</MpButton>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ctvd-enter-active, .ctvd-leave-active { transition: background-color 250ms ease; }
.ctvd-enter-from, .ctvd-leave-to { background-color: transparent; }
.ctvd-enter-active .ctvd-panel { transition: transform 350ms ease-out; }
.ctvd-leave-active .ctvd-panel { transition: transform 250ms ease-in; }
.ctvd-enter-from .ctvd-panel, .ctvd-leave-to .ctvd-panel { transform: translateX(calc(100% + 12px)); }

.ctvd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.ctvd-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.ctvd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.ctvd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ctvd-close { display: inline-flex !important; align-items: center; justify-content: center; width: 36px !important; height: 36px !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.ctvd-close:hover { background: var(--mp-background-neutral-hovered); }

.ctvd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4); }
.ctvd-error { display: block; margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }

.ctvd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ctvd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.ctvd-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ctvd-check-item { display: flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; user-select: none; }
.ctvd-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.ctvd-divider { height: 1px; background: var(--mp-border-default); }

.ctvd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.ctvd-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
