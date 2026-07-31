<script setup lang="ts">
/**
 * "Add actions" modal — manage the Home quick-action pills. Two columns:
 *   • left  — the full catalog ("Action list"), searchable; click a row to add it
 *   • right — the current selection ("Selected actions"), drag to reorder, hover to remove
 * Enforces min 1 / max 6. Edits a local draft so Cancel discards; Save commits.
 *
 * Custom overlay (not MpModal) — MpModal renders with no structural CSS in this
 * Pixel3 build; same approach as ConfirmModal.vue / LocationPriorityDrawer.vue.
 */
import { ref, computed, watch } from 'vue'
import { MpIcon, toast } from '@mekari/pixel3'
import {
  HOME_ACTION_CATALOG, MAX_ACTIONS, MIN_ACTIONS,
  selectedActionKeys, homeActionByKey, setSelectedActions,
} from '~/data/homeActions'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()

// Local working copy — Cancel throws it away, Save commits it.
const draft = ref<string[]>([])
const search = ref('')

watch(() => props.isOpen, (open) => {
  if (open) { draft.value = [...selectedActionKeys]; search.value = '' }
}, { immediate: true })

const available = computed(() => {
  const q = search.value.trim().toLowerCase()
  return HOME_ACTION_CATALOG.filter(
    (a) => !draft.value.includes(a.key) && (!q || a.label.toLowerCase().includes(q)),
  )
})
const selected = computed(() =>
  draft.value.map((k) => homeActionByKey(k)).filter((a): a is NonNullable<typeof a> => !!a),
)

function add(key: string) {
  if (draft.value.includes(key)) return
  if (draft.value.length >= MAX_ACTIONS) {
    toast.notify({ variant: 'info', title: `You can show up to ${MAX_ACTIONS} actions`, maxWidth: 'max-content' })
    return
  }
  draft.value.push(key)
}
function remove(key: string) {
  if (draft.value.length <= MIN_ACTIONS) {
    toast.notify({ variant: 'info', title: 'Keep at least one action', maxWidth: 'max-content' })
    return
  }
  draft.value = draft.value.filter((k) => k !== key)
}

// ── Drag and drop (reorder the selected column) ───────────────────────────────
const dragSrc = ref<number | null>(null)
const dragOver = ref<number | null>(null)
function onDragStart(i: number, e: DragEvent) { dragSrc.value = i; e.dataTransfer!.effectAllowed = 'move' }
function onDragOver(i: number, e: DragEvent) { e.preventDefault(); e.dataTransfer!.dropEffect = 'move'; dragOver.value = i }
function onDrop(i: number) {
  if (dragSrc.value === null || dragSrc.value === i) { dragOver.value = null; return }
  const r = [...draft.value]
  const [moved] = r.splice(dragSrc.value, 1)
  r.splice(i, 0, moved!)
  draft.value = r
  dragSrc.value = null
  dragOver.value = null
}
function onDragEnd() { dragSrc.value = null; dragOver.value = null }

function close() { emit('update:isOpen', false) }
function save() { setSelectedActions(draft.value); close() }
</script>

<template>
  <Transition name="aa">
    <div v-if="isOpen" class="aa-overlay" @click.self="close">
      <div class="aa-panel" role="dialog" aria-modal="true" aria-label="Add actions">
        <!-- Header -->
        <div class="aa-header">
          <p class="aa-title">Add actions</p>
          <button class="aa-close" type="button" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </div>

        <!-- Body: two columns -->
        <div class="aa-body">
          <!-- Left: catalog -->
          <section class="aa-col">
            <h3 class="aa-col__title">Action list</h3>
            <div class="aa-search">
              <MpIcon name="search" size="sm" class="aa-search__icon" />
              <input v-model="search" class="aa-search__input" type="text" placeholder="Search action" />
            </div>
            <ul class="aa-list">
              <li v-for="a in available" :key="a.key">
                <button class="aa-row aa-row--add" type="button" @click="add(a.key)">
                  <span class="aa-row__label">{{ a.label }}</span>
                  <MpIcon name="add" size="sm" class="aa-row__affordance" />
                </button>
              </li>
              <li v-if="!available.length" class="aa-empty">No actions found.</li>
            </ul>
          </section>

          <div class="aa-divider" aria-hidden="true" />

          <!-- Right: selection -->
          <section class="aa-col">
            <h3 class="aa-col__title">Selected actions</h3>
            <p class="aa-col__hint">Select up to {{ MAX_ACTIONS }} actions to show on your homepage and drag to reorder.</p>
            <ul class="aa-list">
              <li
                v-for="(a, i) in selected"
                :key="a.key"
                class="aa-row aa-row--selected"
                :class="{ 'aa-row--dragover': dragOver === i }"
                draggable="true"
                @dragstart="onDragStart(i, $event)"
                @dragover="onDragOver(i, $event)"
                @drop="onDrop(i)"
                @dragend="onDragEnd"
              >
                <MpIcon name="drag" size="sm" class="aa-row__grip" />
                <span class="aa-row__label">{{ a.label }}</span>
                <button class="aa-row__remove" type="button" aria-label="Remove" @click="remove(a.key)">
                  <MpIcon name="close" size="sm" />
                </button>
              </li>
            </ul>
          </section>
        </div>

        <!-- Footer -->
        <div class="aa-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">Save</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.aa-enter-active, .aa-leave-active { transition: opacity 200ms ease; }
.aa-enter-from, .aa-leave-to { opacity: 0; }
.aa-enter-active .aa-panel, .aa-leave-active .aa-panel { transition: transform 200ms ease, opacity 200ms ease; }
.aa-enter-from .aa-panel, .aa-leave-to .aa-panel { transform: scale(0.96); opacity: 0; }

.aa-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: rgba(8, 13, 14, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: var(--mp-spacing-4);
}
.aa-panel {
  width: min(880px, 100%);
  max-height: min(680px, calc(100vh - 32px));
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -2px rgba(0,0,0,0.1);
}

/* Header */
.aa-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-subtle, #eef0f1);
}
.aa-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.aa-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: 0; border-radius: var(--mp-radii-sm);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.aa-close:hover { background: var(--mp-background-neutral-hovered, #eef0f1); }

/* Body */
.aa-body {
  display: grid; grid-template-columns: 1fr 1px 1fr;
  gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-5);
  overflow: hidden; flex: 1 1 auto; min-height: 0;
}
.aa-col { display: flex; flex-direction: column; min-height: 0; }
.aa-col__title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.aa-col__hint { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-md, 18px); color: var(--mp-text-secondary); }
.aa-divider { background: var(--mp-border-subtle, #eef0f1); }

/* Search */
.aa-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  height: 40px; padding: 0 var(--mp-spacing-3);
  margin-bottom: var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 8px);
  background: var(--mp-background-neutral, #fff);
}
.aa-search:focus-within { border-color: var(--mp-border-focus, var(--mp-text-link)); }
.aa-search__icon { color: var(--mp-icon-subtle, #6b7280); flex-shrink: 0; }
.aa-search__input {
  flex: 1; border: 0; outline: 0; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.aa-search__input::placeholder { color: var(--mp-text-placeholder, #9aa2a8); }

/* Lists */
.aa-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1 1 auto; min-height: 0; }
.aa-empty { padding: var(--mp-spacing-4) var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.aa-row {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: 100%; min-height: 44px; padding: var(--mp-spacing-2) var(--mp-spacing-1);
  border: 0; border-bottom: 1px solid var(--mp-border-subtle, #eef0f1);
  background: transparent; text-align: left;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.aa-row__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Left rows — click to add */
.aa-row--add { cursor: pointer; }
.aa-row--add:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.aa-row__affordance { color: var(--mp-text-link); opacity: 0; flex-shrink: 0; }
.aa-row--add:hover .aa-row__affordance { opacity: 1; }

/* Right rows — draggable, hover to remove */
.aa-row--selected { cursor: grab; }
.aa-row--selected:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.aa-row--dragover { box-shadow: inset 0 2px 0 0 var(--mp-text-link); }
.aa-row__grip { color: var(--mp-icon-subtle, #9aa2a8); flex-shrink: 0; cursor: grab; }
.aa-row__remove {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border: 0; border-radius: var(--mp-radii-sm);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
  opacity: 0; flex-shrink: 0;
}
.aa-row--selected:hover .aa-row__remove { opacity: 1; }
.aa-row__remove:hover { background: var(--mp-background-neutral-hovered, #eef0f1); color: var(--mp-text-default); }

/* Footer */
.aa-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-subtle, #eef0f1);
}
</style>
