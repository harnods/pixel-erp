<script setup lang="ts">
/**
 * Storage-location reservation priority (Configure warehouse > Storage location
 * priority). Per-warehouse, Storage-type leaves only — Organizational nodes (e.g.
 * Floor/Zone) never hold stock so they're never candidates. WMS auto-reserves from
 * the highest-priority location with available qty when an outbound doesn't already
 * specify one; unranked/new locations fall to the end, ascending by code.
 */
import { MpIcon } from '@mekari/pixel3'
import { getStorageLeaves, type StorageLeaf } from '~/data/storageLocations'
import { rankStorageLeaves } from '~/data/warehouseConfig'

const props = defineProps<{
  isOpen: boolean
  warehouseId: string
  modelValue: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved', order: string[]): void
}>()

const leaves = computed(() => getStorageLeaves(props.warehouseId).filter((l) => l.type === 'Storage'))
function byAscendingCode(a: StorageLeaf, b: StorageLeaf) {
  return a.code.localeCompare(b.code, undefined, { numeric: true })
}

const rows = ref<StorageLeaf[]>([])
function buildRows() { rows.value = rankStorageLeaves(leaves.value, props.modelValue) }
watch(() => props.isOpen, (open) => { if (open) buildRows() })

// ── Drag and drop ─────────────────────────────────────────────────────────────
const dragSrc = ref<number | null>(null)
const dragOver = ref<number | null>(null)

function onDragStart(i: number, e: DragEvent) {
  dragSrc.value = i
  e.dataTransfer!.effectAllowed = 'move'
}
function onDragOver(i: number, e: DragEvent) {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
  dragOver.value = i
}
function onDrop(i: number, e: DragEvent) {
  e.preventDefault()
  if (dragSrc.value === null || dragSrc.value === i) { dragOver.value = null; return }
  const r = [...rows.value]
  const [moved] = r.splice(dragSrc.value, 1)
  r.splice(i, 0, moved!)
  rows.value = r
  dragSrc.value = null
  dragOver.value = null
}
function onDragEnd() { dragSrc.value = null; dragOver.value = null }

function resetToDefault() { rows.value = [...leaves.value].sort(byAscendingCode) }
function close() { emit('update:isOpen', false) }
function save() { emit('saved', rows.value.map((r) => r.id)); close() }
</script>

<template>
  <Transition name="lp">
    <div v-if="isOpen" class="lp-overlay" @click.self="close">
      <div class="lp-panel" role="dialog" aria-label="Storage location priority">

        <!-- Header -->
        <header class="lp-header">
          <span class="lp-title">Storage location priority</span>
          <button class="lp-close" type="button" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <!-- Body -->
        <div class="lp-body">
          <p class="lp-desc">
            WMS reserves from the highest-priority location with available stock when an
            outbound doesn't already specify one. Drag to reorder — highest priority first.
            Locations added later fall to the end, ascending by code.
          </p>

          <div v-if="!rows.length" class="lp-empty">
            No Storage-type locations in this warehouse yet — add one under Storage locations first.
          </div>

          <ol v-else class="lp-list">
            <li
              v-for="(r, i) in rows"
              :key="r.id"
              class="lp-row"
              :class="{
                'lp-row--dragging': dragSrc === i,
                'lp-row--over-above': dragOver === i && dragSrc !== null && dragSrc > i,
                'lp-row--over-below': dragOver === i && dragSrc !== null && dragSrc < i,
              }"
              draggable="true"
              @dragstart="onDragStart(i, $event)"
              @dragover="onDragOver(i, $event)"
              @drop="onDrop(i, $event)"
              @dragend="onDragEnd"
            >
              <!-- Drag handle -->
              <span class="lp-handle" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/>
                  <circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/>
                  <circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
                </svg>
              </span>
              <span class="lp-rank">{{ i + 1 }}</span>
              <span class="lp-info">
                <span class="lp-path">{{ r.path }}</span>
                <span class="lp-code">{{ r.code }}</span>
              </span>
            </li>
          </ol>

          <button v-if="rows.length" type="button" class="lp-reset" @click="resetToDefault">
            Reset to default order (ascending code)
          </button>
        </div>

        <!-- Footer -->
        <footer class="lp-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">Save changes</button>
        </footer>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* ── Transition ── */
.lp-enter-active .lp-panel { transition: transform 350ms ease-out; }
.lp-leave-active .lp-panel { transition: transform 250ms ease-in; }
.lp-enter-from .lp-panel,
.lp-leave-to .lp-panel { transform: translateX(calc(100% + 12px)); }

/* ── Overlay ── */
.lp-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}

/* ── Panel — 50% lebar layar ── */
.lp-panel {
  margin: var(--mp-spacing-3);
  width: min(50vw, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}

/* ── Header ── */
.lp-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.lp-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.lp-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.lp-close:hover { background: var(--mp-background-neutral-hovered); }

/* ── Body ── */
.lp-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
.lp-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.lp-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); }

/* ── Priority list ── */
.lp-list { display: flex; flex-direction: column; gap: var(--mp-spacing-1); margin: 0; padding: 0; list-style: none; }

.lp-row {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-2) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
  cursor: grab; user-select: none;
  transition: opacity 150ms, box-shadow 150ms, border-color 150ms;
}
.lp-row:active { cursor: grabbing; }
.lp-row--dragging { opacity: 0.4; }
.lp-row--over-above { border-top: 2px solid var(--mp-border-selected, #0f6d4d); }
.lp-row--over-below { border-bottom: 2px solid var(--mp-border-selected, #0f6d4d); }

/* ── Drag handle ── */
.lp-handle {
  flex-shrink: 0; color: var(--mp-text-disabled, #b0b6b8);
  display: flex; align-items: center;
}
.lp-row:hover .lp-handle { color: var(--mp-text-subtle); }

/* ── Rank badge ── */
.lp-rank {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: var(--mp-radii-full);
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-subtle);
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Info ── */
.lp-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.lp-path { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-code { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

/* ── Reset link ── */
.lp-reset {
  align-self: flex-start; background: none; border: 0; padding: 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer;
}
.lp-reset:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Footer ── */
.lp-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
}
</style>
