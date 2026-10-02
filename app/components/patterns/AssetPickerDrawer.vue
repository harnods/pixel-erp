<script setup lang="ts">
/**
 * AssetPickerDrawer · Mekari Buzz — pick images from the user's own asset library
 * to feed into generation as SUBJECTS (e.g. a product photo Buzz should re-pose
 * into a new scene). Right-side floating drawer; multi-select thumbnails loaded
 * from IndexedDB. Returns the selected asset ids.
 */
import { MpIcon, MpButton } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import { buzzAssets, buzzBrand, type BuzzAsset, type BuzzAssetType } from '~/data/buzz'
import { getImage } from '~/utils/buzzImageStore'

const props = defineProps<{ isOpen: boolean; modelValue: string[]; types?: BuzzAssetType[] }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'update:modelValue', v: string[]): void }>()

const search = ref('')
const sel = ref<Set<string>>(new Set())
watch(() => props.isOpen, (open) => { if (open) { sel.value = new Set(props.modelValue ?? []); search.value = '' } })

// Only real uploaded/generated images (hasImage) of the allowed types.
const allowed = computed<BuzzAssetType[]>(() => props.types ?? ['photo', 'mockup', 'screenshot', 'illustration'])
const rows = computed<BuzzAsset[]>(() => {
  const q = search.value.trim().toLowerCase()
  return buzzAssets.filter((a) =>
    a.hasImage && allowed.value.includes(a.assetType ?? 'photo') &&
    (!q || a.title.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q))))
})

const images = ref<Map<string, string>>(new Map())
async function loadImages() {
  for (const a of rows.value) {
    if (images.value.has(a.id)) continue
    const rec = await getImage(a.id)
    if (rec?.dataUrl) { const next = new Map(images.value); next.set(a.id, rec.dataUrl); images.value = next }
  }
}
watch([rows, () => props.isOpen], loadImages, { deep: true, immediate: true })

function toggle(id: string) { const s = new Set(sel.value); s.has(id) ? s.delete(id) : s.add(id); sel.value = s }
function cancel() { emit('update:isOpen', false) }
function done() { emit('update:modelValue', [...sel.value]); emit('update:isOpen', false) }
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="Your assets" width="520px" @close="cancel">
    <template #body>
      <div class="apd-searchbar">
        <div class="apd-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="apd-search-input" type="text" placeholder="Search assets…" />
        </div>
      </div>
      <p v-if="!rows.length" class="apd-empty">No assets yet. Upload photos in Assets · Photo stocks first.</p>
      <div v-else class="apd-grid">
        <MpButton v-for="a in rows" :key="a.id" type="button" class="apd-item" variant="ghost" :class="{ 'apd-item--on': sel.has(a.id) }" @click="toggle(a.id)">
          <span class="apd-thumb">
            <img v-if="images.get(a.id)" :src="images.get(a.id)" :alt="a.title" class="apd-thumb__img" />
            <span v-if="sel.has(a.id)" class="apd-check"><MpIcon name="check" size="sm" /></span>
          </span>
          <span class="apd-name">{{ a.title }}</span>
          <span class="apd-sub">{{ buzzBrand(a.brand)?.name || a.usage }}</span>
        </MpButton>
      </div>
    </template>
    <template #footer>
      <span class="apd-count">{{ sel.size }} selected</span>
      <div class="apd-actions">
        <MpButton variant="ghost" is-rounded @click="cancel">Cancel</MpButton>
        <MpButton variant="primary" is-rounded @click="done">Use selected</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.apd-searchbar { flex-shrink: 0; padding: var(--mp-spacing-4) var(--mp-spacing-4) 0; }
.apd-search { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default); }
.apd-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.apd-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-4); }
.apd-empty { padding: var(--mp-spacing-8); text-align: center; font-size: 13px; color: var(--mp-text-secondary); }
.apd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: var(--mp-spacing-3, 12px); }
.apd-item { display: flex; flex-direction: column; gap: 4px; padding: 0; border: none; background: none; cursor: pointer; text-align: left; }
.apd-thumb { position: relative; display: block; width: 100%; aspect-ratio: 1; border-radius: var(--mp-radii-md, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); overflow: hidden; background: var(--mp-background-neutral-subtle); }
.apd-thumb__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.apd-item--on .apd-thumb { border-color: var(--mp-border-selected, #029861); box-shadow: 0 0 0 2px var(--mp-border-selected, #029861); }
.apd-check { position: absolute; top: 6px; right: 6px; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 999px; background: var(--mp-background-brand-bold, #029861); color: var(--mp-colors-white); }
.apd-check :deep(svg) { color: var(--mp-colors-white); }
.apd-name { font-size: 12px; color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.apd-sub { font-size: 11px; color: var(--mp-text-secondary); }
.apd-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.apd-count { font-size: 12px; color: var(--mp-text-secondary); }
.apd-actions { display: flex; gap: var(--mp-spacing-2); }
</style>
