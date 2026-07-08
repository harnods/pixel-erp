<script setup lang="ts">
/**
 * Storage-location reservation priority (Configure warehouse > Storage location
 * priority). Per-warehouse, Storage-type leaves only — Organizational nodes (e.g.
 * Floor/Zone) never hold stock so they're never candidates. WMS auto-reserves from
 * the highest-priority location with available qty when an outbound doesn't already
 * specify one; unranked/new locations fall to the end, ascending by code.
 */
import {
  MpDrawer, MpDrawerContent, MpDrawerBody, MpButton, MpText, MpTooltip,
} from '@mekari/pixel3'
import { getStorageLeaves, type StorageLeaf } from '~/data/storageLocations'
import { rankStorageLeaves } from '~/data/warehouseConfig'

const props = defineProps<{
  isOpen: boolean
  warehouseId: string
  /** Currently-committed explicit rank (Storage-leaf ids, highest priority first). */
  modelValue: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'saved', order: string[]): void
}>()

const leaves = computed(() => getStorageLeaves(props.warehouseId).filter((l) => l.type === 'Storage'))
function byAscendingCode(a: StorageLeaf, b: StorageLeaf): number {
  return a.code.localeCompare(b.code, undefined, { numeric: true })
}

const rows = ref<StorageLeaf[]>([])
function buildRows() { rows.value = rankStorageLeaves(leaves.value, props.modelValue) }
watch(() => props.isOpen, (open) => { if (open) buildRows() })

function moveUp(i: number) {
  if (i <= 0) return
  const r = [...rows.value]
  ;[r[i - 1], r[i]] = [r[i]!, r[i - 1]!]
  rows.value = r
}
function moveDown(i: number) {
  if (i >= rows.value.length - 1) return
  const r = [...rows.value]
  ;[r[i + 1], r[i]] = [r[i]!, r[i + 1]!]
  rows.value = r
}
function resetToDefault() { rows.value = [...leaves.value].sort(byAscendingCode) }

function close() { emit('update:isOpen', false) }
function save() {
  emit('saved', rows.value.map((r) => r.id))
  close()
}
</script>

<template>
  <MpDrawer
    id="loc-priority-drawer"
    :is-open="isOpen"
    placement="right"
    size="md"
    variant="floating"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="close"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="lp-card">
          <div class="lp-header">
            <MpText weight="semiBold">Storage location priority</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="close" />
          </div>

          <div class="lp-body">
            <p class="lp-desc">
              WMS reserves from the highest-priority location with available stock when an
              outbound doesn't already specify one. Reorder the list below, highest priority
              first. Locations left unranked (or added later) fall to the end, ascending by code.
            </p>

            <div v-if="!rows.length" class="lp-empty">
              No Storage-type locations in this warehouse yet — add one under Storage locations first.
            </div>

            <ol v-else class="lp-list">
              <li v-for="(r, i) in rows" :key="r.id" class="lp-row">
                <span class="lp-rank">{{ i + 1 }}</span>
                <span class="lp-info">
                  <span class="lp-path">{{ r.path }}</span>
                  <span class="lp-code">{{ r.code }}</span>
                </span>
                <span class="lp-move">
                  <MpTooltip :id="`lp-up-${r.id}`" label="Move up" placement="top" use-portal>
                    <button class="lp-move-btn" :disabled="i === 0" aria-label="Move up" @click="moveUp(i)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6 15L12 9L18 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </MpTooltip>
                  <MpTooltip :id="`lp-down-${r.id}`" label="Move down" placement="top" use-portal>
                    <button class="lp-move-btn" :disabled="i === rows.length - 1" aria-label="Move down" @click="moveDown(i)">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </MpTooltip>
                </span>
              </li>
            </ol>

            <button v-if="rows.length" type="button" class="lp-reset" @click="resetToDefault">
              Reset to default order (ascending code)
            </button>
          </div>

          <div class="lp-footer">
            <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="save">Save changes</MpButton>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
.lp-card { display: flex; flex-direction: column; height: 100%; }
.lp-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.lp-body { display: flex; flex-direction: column; gap: var(--mp-spacing-3); flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }
.lp-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.lp-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle); padding: var(--mp-spacing-4) 0; }
.lp-list { display: flex; flex-direction: column; gap: var(--mp-spacing-1); margin: 0; padding: 0; list-style: none; }
.lp-row {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
}
.lp-rank {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: var(--mp-radii-full);
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-subtle);
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}
.lp-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.lp-path { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lp-code { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.lp-move { display: flex; gap: 2px; flex-shrink: 0; }
.lp-move-btn {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border: 0; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-default); cursor: pointer;
}
.lp-move-btn:hover:not(:disabled) { background: var(--mp-background-neutral-hovered); }
.lp-move-btn:disabled { color: var(--mp-text-disabled, #b0b6b8); cursor: not-allowed; }
.lp-reset {
  align-self: flex-start; background: none; border: 0; padding: 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer;
}
.lp-reset:hover { text-decoration: underline; text-underline-offset: 2px; }
.lp-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) 0;
  border-top: 1px solid var(--mp-border-default);
}
</style>
