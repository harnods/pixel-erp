<script setup lang="ts">
/**
 * SelectAccessDrawer — two-pane "pick many from a list" drawer used by the New
 * account form to choose which users or roles can access an account
 * (Figma 5159-46456 / 5159-47521). Left pane = searchable source list with an
 * "Add all"; right pane = the running selection (illustration empty state until
 * something is picked). Cancel discards, Save commits — mirrors
 * SelectProductDrawer's working-copy pattern.
 */
import { ref, computed, watch } from 'vue'
import { MpIcon, MpButton, MpTooltip } from '@mekari/pixel3'

export interface AccessOption { id: string; name: string; subtitle?: string }

const props = defineProps<{
  open: boolean
  /** Drawer header, e.g. "Select users". */
  title: string
  /** Left-list heading, e.g. "Users" / "Roles". */
  listTitle: string
  options: AccessOption[]
  /** Currently-committed selection (ids). */
  modelValue: string[]
  emptyTitle: string
  emptyCaption: string
}>()
const emit = defineEmits<{
  'update:open': [boolean]
  save: [ids: string[]]
}>()

// Working selection — reseeded from the committed value each time the drawer
// opens, so Cancel discards and Save commits.
const sel = ref<Set<string>>(new Set())
const leftSearch = ref('')
const rightSearch = ref('')
watch(() => props.open, (o) => {
  if (o) { sel.value = new Set(props.modelValue); leftSearch.value = ''; rightSearch.value = '' }
})

function match(o: AccessOption, q: string) {
  if (!q) return true
  const s = q.toLowerCase()
  return o.name.toLowerCase().includes(s) || (o.subtitle?.toLowerCase().includes(s) ?? false)
}
const available = computed(() => props.options.filter(o => !sel.value.has(o.id) && match(o, leftSearch.value)))
const selectedCount = computed(() => props.options.filter(o => sel.value.has(o.id)).length)
const selected = computed(() => props.options.filter(o => sel.value.has(o.id) && match(o, rightSearch.value)))

function add(id: string) { const s = new Set(sel.value); s.add(id); sel.value = s }
function remove(id: string) { const s = new Set(sel.value); s.delete(id); sel.value = s }
function addAll() { const s = new Set(sel.value); for (const o of available.value) s.add(o.id); sel.value = s }
function removeAll() { sel.value = new Set() }

const isSaving = ref(false)
function close() { isSaving.value = false; emit('update:open', false) }
async function save() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 400))
  emit('save', [...sel.value])
  isSaving.value = false
  emit('update:open', false)
}
</script>

<template>
  <Transition name="sad">
    <div v-if="open" class="sad-overlay" @click.self="close">
      <div class="sad-panel" role="dialog" :aria-label="title">
        <!-- Header -->
        <header class="sad-header">
          <h2 class="sad-title">{{ title }}</h2>
          <button class="sad-close" aria-label="Close" @click="close"><MpIcon name="close" size="md" /></button>
        </header>

        <!-- Body — two panels -->
        <div class="sad-body">
          <!-- Available -->
          <section class="sad-col">
            <div class="sad-search">
              <MpIcon name="search" size="sm" />
              <input v-model="leftSearch" class="sad-search-input" type="text" placeholder="Search..." />
              <button v-if="leftSearch" class="search-clear-btn" type="button" aria-label="Clear search" @click="leftSearch = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <div class="sad-col-head">
              <h2 class="sad-col-title">{{ listTitle }}</h2>
              <button class="sad-link" type="button" @click="addAll">Add all</button>
            </div>
            <div class="sad-list">
              <button v-for="o in available" :key="o.id" class="sad-item" type="button" @click="add(o.id)">
                <span class="sad-info">
                  <span class="sad-name">{{ o.name }}</span>
                  <span v-if="o.subtitle" class="sad-sub">{{ o.subtitle }}</span>
                </span>
                <span class="sad-act sad-act--add"><MpIcon name="add" size="sm" /></span>
              </button>
              <p v-if="!available.length" class="sad-empty-text">No {{ listTitle.toLowerCase() }} found.</p>
            </div>
          </section>

          <div class="sad-divider" aria-hidden="true" />

          <!-- Selected -->
          <section class="sad-col">
            <template v-if="selectedCount">
              <div class="sad-search">
                <MpIcon name="search" size="sm" />
                <input v-model="rightSearch" class="sad-search-input" type="text" placeholder="Search..." />
                <button v-if="rightSearch" class="search-clear-btn" type="button" aria-label="Clear search" @click="rightSearch = ''">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <div class="sad-col-head">
                <h2 class="sad-col-title">Selected {{ listTitle.toLowerCase() }} ({{ selectedCount }})</h2>
                <button class="sad-link" type="button" @click="removeAll">Remove all</button>
              </div>
              <div class="sad-list">
                <button v-for="o in selected" :key="o.id" class="sad-item" type="button" @click="remove(o.id)">
                  <span class="sad-info">
                    <span class="sad-name">{{ o.name }}</span>
                    <span v-if="o.subtitle" class="sad-sub">{{ o.subtitle }}</span>
                  </span>
                  <MpTooltip :id="`sad-rm-${o.id}`" label="Remove" placement="top" use-portal class="sad-remove-tip">
                    <span class="sad-act sad-act--remove"><MpIcon name="minus-circular" size="sm" /></span>
                  </MpTooltip>
                </button>
                <p v-if="!selected.length" class="sad-empty-text">No {{ listTitle.toLowerCase() }} found.</p>
              </div>
            </template>
            <div v-else class="sad-empty">
              <img src="/illustrations/empty-folder.png" alt="" class="sad-empty-img" width="140" height="120" />
              <p class="sad-empty-title">{{ emptyTitle }}</p>
              <p class="sad-empty-caption">{{ emptyCaption }}</p>
            </div>
          </section>
        </div>

        <!-- Footer -->
        <footer class="sad-footer">
          <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
          <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="save">{{ isSaving ? 'Saving…' : 'Save' }}</MpButton>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sad-enter-active,
.sad-leave-active { transition: background-color 250ms ease; }
.sad-enter-from, .sad-leave-to { background-color: transparent; }
.sad-enter-active :deep(.sad-panel) { transition: transform 350ms ease-out; }
.sad-leave-active :deep(.sad-panel)  { transition: transform 250ms ease-in; }
.sad-enter-from :deep(.sad-panel),
.sad-leave-to :deep(.sad-panel) { transform: translateX(calc(100% + 12px)); }

.sad-overlay { position: fixed; inset: 0; z-index: 1400; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
/* Floating ERP drawer — 12px margin, rounded corners, no shadow (matches feedback). */
.sad-panel {
  margin: var(--mp-spacing-3); width: min(920px, calc(100% - 24px)); height: calc(100% - 24px);
  display: flex; flex-direction: column; background: var(--mp-background-stage, #fff);
  border-radius: 24px; overflow: hidden;
}
.sad-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle);
}
.sad-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sad-close { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.sad-close:hover { background: var(--mp-background-neutral-hovered); }

.sad-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1px 1fr; }
.sad-col { display: flex; flex-direction: column; min-height: 0; padding: var(--mp-spacing-4); }
.sad-divider { background: var(--mp-border-default); }
.sad-search { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); flex-shrink: 0; }
.sad-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.sad-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
/* 20px between the search box and the list header (design-doc rule). */
.sad-col-head { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; margin-top: 20px; }
/* H2 heading — Users / Roles / Selected … */
.sad-col-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.sad-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.sad-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.sad-list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; margin-top: var(--mp-spacing-3); }
/* 8px vertical padding matches the SelectProductDrawer pattern: single-line rows
   (roles) land at 36px, two-line rows (user + role subtitle) at ~52px like Figma.
   min-height keeps single-line rows steady when the add/remove control appears. */
.sad-item {
  display: flex; align-items: center; gap: var(--mp-spacing-3); width: 100%; min-height: 36px; text-align: left;
  padding: var(--mp-spacing-2) var(--mp-spacing-1); background: none; border: none; cursor: pointer;
  border-bottom: 1px solid var(--mp-border-default); position: relative;
}
.sad-item:hover { background: var(--mp-background-neutral-subtle); }
.sad-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.sad-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sad-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sad-act { display: none; align-items: center; justify-content: center; flex-shrink: 0; width: 24px; height: 24px; }
.sad-item:hover .sad-act { display: inline-flex; }
.sad-act--add { color: var(--mp-text-link); }
.sad-act--remove { color: var(--mp-text-secondary); }
.sad-remove-tip { display: inline-flex; }
.sad-empty-text { margin: 0; padding: var(--mp-spacing-4) var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Right-pane illustration empty state */
.sad-empty { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-1); text-align: center; padding: var(--mp-spacing-6); }
.sad-empty-img { width: 140px; height: 120px; object-fit: contain; margin-bottom: var(--mp-spacing-2); }
.sad-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sad-empty-caption { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.sad-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
</style>
