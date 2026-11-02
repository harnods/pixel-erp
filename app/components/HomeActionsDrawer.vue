<script setup lang="ts">
/**
 * "Add actions" drawer — manage the Home quick-action pills. Two columns:
 *   • left  — the full catalog ("Action list"), searchable; click a row to add it
 *   • right — the current selection ("Selected actions"), drag to reorder, remove
 * Enforces min 1 / max 6. Edits a local draft so Cancel discards; Save commits.
 *
 * Mirrors the canonical ERP add/remove drawer (SelectProductDrawer.vue): right-slide
 * floating panel, filled header, .ha-search pill, hover action icons, footer.
 */
import { ref, computed, watch } from 'vue'
import { MpIcon, MpButton, MpTooltip, toast } from '@mekari/pixel3'
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
    toast.notify({ variant: 'error', title: `You can show up to ${MAX_ACTIONS} actions`, maxWidth: 'max-content' })
    return
  }
  draft.value.push(key)
}
function remove(key: string) {
  if (draft.value.length <= MIN_ACTIONS) {
    toast.notify({ variant: 'error', title: 'Keep at least one action', maxWidth: 'max-content' })
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

const isSaving = ref(false)
function close() { isSaving.value = false; emit('update:isOpen', false) }
async function save() {
  isSaving.value = true
  await new Promise((r) => setTimeout(r, 400))
  setSelectedActions(draft.value)
  isSaving.value = false
  emit('update:isOpen', false)
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="Add actions" width="920px" @close="close">
    <template #body>
      <div class="ha-body">
          <!-- Left: catalog -->
          <section class="ha-col">
            <div class="ha-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="ha-search-input" type="text" placeholder="Search action" />
              <MpButton v-if="search" class="search-clear-btn" variant="ghost" type="button" aria-label="Clear search" @click="search = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </MpButton>
            </div>
            <div class="ha-col-head"><span class="ha-col-title">Action list</span></div>
            <div class="ha-list">
              <MpButton v-for="a in available" :key="a.key" class="ha-item ha-item--add" variant="ghost" type="button" @click="add(a.key)">
                <span class="ha-name">{{ a.label }}</span>
                <span class="ha-act ha-act--add"><MpIcon name="add" size="sm" /></span>
              </MpButton>
              <p v-if="!available.length" class="ha-empty">No actions found.</p>
            </div>
          </section>

          <div class="ha-divider" aria-hidden="true" />

          <!-- Right: selection -->
          <section class="ha-col">
            <div class="ha-col-head ha-col-head--selected">
              <span class="ha-col-title">Selected actions</span>
            </div>
            <p class="ha-hint">Select up to {{ MAX_ACTIONS }} actions to show on your homepage and drag to reorder.</p>
            <ul class="ha-list">
              <li
                v-for="(a, i) in selected"
                :key="a.key"
                class="ha-item ha-item--selected"
                :class="{ 'ha-item--dragover': dragOver === i }"
                draggable="true"
                @dragstart="onDragStart(i, $event)"
                @dragover="onDragOver(i, $event)"
                @drop="onDrop(i)"
                @dragend="onDragEnd"
              >
                <MpIcon name="drag" size="sm" class="ha-grip" />
                <span class="ha-name">{{ a.label }}</span>
                <MpTooltip :id="`ha-remove-${a.key}`" label="Remove" placement="top" use-portal>
                  <MpButton class="ha-remove" variant="ghost" type="button" aria-label="Remove" @click.stop="remove(a.key)">
                    <MpIcon name="minus-circular" size="sm" />
                  </MpButton>
                </MpTooltip>
              </li>
            </ul>
          </section>
        </div>
    </template>

    <template #footer>
      <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="save">{{ isSaving ? 'Saving…' : 'Save changes' }}</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.ha-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1px 1fr; margin: calc(-1 * var(--mp-spacing-4)); }
.ha-col { display: flex; flex-direction: column; min-height: 0; padding: var(--mp-spacing-4); gap: var(--mp-spacing-3); }
.ha-divider { background: var(--mp-border-default); }

.ha-search { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); flex-shrink: 0; }
.ha-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ha-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

.ha-col-head { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.ha-col-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ha-hint { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-md, 18px); color: var(--mp-text-secondary); flex-shrink: 0; }

.ha-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.ha-item {
  display: flex; align-items: center; gap: var(--mp-spacing-3); width: 100%; text-align: left;
  min-height: 44px; padding: var(--mp-spacing-2) var(--mp-spacing-1); background: none; border: none;
  border-bottom: 1px solid var(--mp-border-default); position: relative;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.ha-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Left rows — click to add */
.ha-item--add { cursor: pointer; }
.ha-item--add:hover { background: var(--mp-background-neutral-subtle); }
.ha-act { display: none; align-items: center; justify-content: center; flex-shrink: 0; width: 24px; height: 24px; }
.ha-item--add:hover .ha-act { display: inline-flex; }
.ha-act--add { color: var(--mp-text-link); }

/* Right rows — draggable, remove on the right */
.ha-item--selected { cursor: grab; user-select: none; }
.ha-item--selected:active { cursor: grabbing; }
.ha-item--selected:hover { background: var(--mp-background-neutral-subtle); }
.ha-item--dragover { box-shadow: inset 0 2px 0 0 var(--mp-border-selected, #0f6d4d); }
.ha-grip { flex-shrink: 0; color: var(--mp-text-disabled, #b0b6b8); }
.ha-item--selected:hover .ha-grip { color: var(--mp-text-subtle); }
.ha-remove {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 24px; height: 24px; padding: 0; border: none; background: none; border-radius: var(--mp-radii-sm);
  color: var(--mp-text-secondary); cursor: pointer; opacity: 0;
}
.ha-item--selected:hover .ha-remove { opacity: 1; }
.ha-remove:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

.ha-empty { margin: 0; padding: var(--mp-spacing-4) var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

</style>
