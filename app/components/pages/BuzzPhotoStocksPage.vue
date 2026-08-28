<script setup lang="ts">
/**
 * BuzzPhotoStocksPage · Mekari Buzz — approved photo-stock library (PRD §10).
 *
 * Assets are approved generation context, not just files: reuse an approved
 * asset before generating a new one. Rendered as a gallery grid (a media
 * library reads as thumbnails, not a table) with the standard ERP filter bar
 * (brand + orientation dropdowns left, Export + Search right). Thumbnails use a
 * CSS gradient stand-in (no network in the mock).
 */
import { MpIcon, toast } from '@mekari/pixel3'
import { buzzAssets, buzzBrands, buzzBrand, addUploadedAsset, type BuzzAsset } from '~/data/buzz'
import { getImage, putImage } from '~/utils/buzzImageStore'
import { useBuzzActions } from '~/composables/useBuzzActions'
import GenerateAssetDrawer from '~/components/patterns/GenerateAssetDrawer.vue'

const route = useRoute()
const search = ref('')
const brandFilter = ref('')
const orientationFilter = ref('')
const orientations = ['Landscape', 'Portrait', 'Square']

// AI-generated assets sort to the front (newest work first); seed assets after.
const filtered = computed<BuzzAsset[]>(() => {
  const s = search.value.trim().toLowerCase()
  return [...buzzAssets]
    .sort((a, b) => {
      const ai = (b.source === 'ai' ? 1 : 0) - (a.source === 'ai' ? 1 : 0)
      return ai !== 0 ? ai : a.title.localeCompare(b.title)
    })
    .filter((a) =>
      (a.assetType ?? 'photo') !== 'logo' &&
      (!s || a.title.toLowerCase().includes(s) || a.tags.some((t) => t.toLowerCase().includes(s))) &&
      (!brandFilter.value || a.brand === brandFilter.value) &&
      (!orientationFilter.value || a.orientation === orientationFilter.value))
})

// Generated images loaded lazily from IndexedDB (seed assets keep the gradient).
const images = ref<Map<string, string>>(new Map())
async function loadImages() {
  for (const a of filtered.value) {
    if (!a.hasImage || images.value.has(a.id)) continue
    const rec = await getImage(a.id)
    if (rec?.dataUrl) { const next = new Map(images.value); next.set(a.id, rec.dataUrl); images.value = next }
  }
}
watch(filtered, loadImages, { deep: true, immediate: true })

// ── Generate asset drawer ──
const showGenerate = ref(false)
const presetSubject = ref<string[]>([])
const { pending } = useBuzzActions()
watch(() => pending.value, (p) => {
  if (p?.action === 'generateAsset') { presetSubject.value = []; showGenerate.value = true }
  if (p?.action === 'uploadAsset') triggerUpload()
})
// Opened from the Home "Generate image" chip via ?generate=1.
onMounted(() => { if (route.query.generate) showGenerate.value = true })
function onSaved() { loadImages() }

// Generate new poses/scenes FROM an existing asset (uses it as the subject).
function generateVariations(a: BuzzAsset) { preview.value = null; presetSubject.value = [a.id]; showGenerate.value = true }

// ── Preview modal ──
const preview = ref<BuzzAsset | null>(null)
const previewUrl = computed(() => preview.value ? (images.value.get(preview.value.id) ?? '') : '')
function openPreview(a: BuzzAsset) { preview.value = a }

// ── Upload your own assets ──
const uploadInput = ref<HTMLInputElement | null>(null)
function triggerUpload() { uploadInput.value?.click() }
function orientationOf(w: number, h: number): 'Landscape' | 'Portrait' | 'Square' {
  if (w > h * 1.15) return 'Landscape'
  if (h > w * 1.15) return 'Portrait'
  return 'Square'
}
async function onFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  for (const f of files) {
    const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('read')); r.readAsDataURL(f) })
    // Detect orientation from natural size.
    const dims = await new Promise<{ w: number; h: number }>((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 1, h: 1 }); im.src = dataUrl })
    const asset = addUploadedAsset({
      title: f.name.replace(/\.[^.]+$/, ''),
      brand: brandFilter.value || buzzBrands[0]?.id || '',
      assetType: 'photo',
      orientation: orientationOf(dims.w, dims.h),
      tags: ['upload'],
      usage: 'Uploaded asset',
    })
    await putImage({ id: asset.id, mime: f.type, dataUrl })
  }
  if (files.length) { loadImages(); toast.notify({ variant: 'success', title: files.length > 1 ? 'Assets uploaded.' : 'Asset uploaded.', maxWidth: 'max-content' }) }
}
</script>

<template>
  <div class="buzz-page">
    <!-- ── Filter bar (verbatim ERP block) ── -->
    <div class="filter-bar">
      <div class="filter-left">
        <div class="filter-select-wrap">
          <select v-model="brandFilter" class="filter-select">
            <option value="">Brand</option>
            <option v-for="b in buzzBrands" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <svg class="filter-select-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="filter-select-wrap">
          <select v-model="orientationFilter" class="filter-select">
            <option value="">Orientation</option>
            <option v-for="o in orientations" :key="o" :value="o">{{ o }}</option>
          </select>
          <svg class="filter-select-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search" />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>
    </div>
    <input ref="uploadInput" class="upload-input" type="file" accept="image/*" multiple @change="onFiles" />

    <!-- ── Gallery grid — photos only, click to preview ── -->
    <div v-if="filtered.length" class="gallery">
      <button v-for="a in filtered" :key="a.id" type="button" class="asset" @click="openPreview(a)">
        <span class="asset__thumb" :class="`asset__thumb--${a.orientation.toLowerCase()}`" :style="{ background: a.gradient }">
          <img v-if="a.hasImage && images.get(a.id)" :src="images.get(a.id)" :alt="a.title" class="asset__photo" />
        </span>
      </button>
    </div>
    <div v-else class="empty-full">
      <img src="/illustrations/empty-box.png" alt="" class="empty-illustration" width="288" height="240" />
      <p class="empty-full-title">No photos yet</p>
      <p class="empty-full-desc">Generate an on-brand image or adjust your filters. Saved photos appear here to reuse across creatives.</p>
      <button type="button" class="btn-enterprise btn-enterprise--secondary empty-cta" @click="showGenerate = true">Generate asset</button>
    </div>

    <GenerateAssetDrawer v-model:is-open="showGenerate" :preset-subject-ids="presetSubject" @saved="onSaved" />

    <!-- ── Photo preview modal ── -->
    <Teleport to="body">
      <Transition name="pv">
        <div v-if="preview" class="pv-overlay" @click.self="preview = null">
          <div class="pv-panel" role="dialog" aria-modal="true">
            <button class="pv-close" type="button" aria-label="Close" @click="preview = null"><MpIcon name="close" size="md" /></button>
            <div class="pv-imgwrap">
              <img v-if="previewUrl" :src="previewUrl" :alt="preview.title" class="pv-img" />
            </div>
            <div class="pv-foot">
              <span class="pv-brand">{{ buzzBrand(preview.brand)?.name }}</span>
              <button v-if="preview.hasImage" type="button" class="btn-enterprise btn-enterprise--secondary" @click="generateVariations(preview)">Generate variations</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.buzz-page { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }

/* ── Gallery ── */
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--mp-spacing-4, 16px); }
.asset { display: block; padding: 0; border: none; background: none; cursor: pointer; }
.asset__thumb { position: relative; display: block; width: 100%; height: 150px; border-radius: var(--mp-radii-lg, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); overflow: hidden; }
.asset__thumb--portrait { height: 200px; }
.asset__thumb--square { height: 180px; }
.asset__photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.upload-input { display: none; }
.asset:hover .asset__thumb { border-color: var(--mp-border-bold, #8c9596); }

/* Photo preview modal */
.pv-enter-active, .pv-leave-active { transition: opacity 200ms ease; }
.pv-enter-from, .pv-leave-to { opacity: 0; }
.pv-overlay { position: fixed; inset: 0; z-index: 1500; background: rgba(8, 13, 14, 0.72); display: flex; align-items: center; justify-content: center; padding: var(--mp-spacing-8, 32px); }
.pv-panel { position: relative; display: flex; flex-direction: column; max-width: min(720px, 92vw); max-height: 90vh; background: var(--mp-background-stage, #fff); border-radius: var(--mp-radii-lg, 12px); overflow: hidden; }
.pv-close { position: absolute; top: 8px; right: 8px; z-index: 2; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: rgba(255,255,255,0.9); border-radius: 999px; cursor: pointer; color: var(--mp-icon-default); }
.pv-close:hover { background: #fff; }
.pv-imgwrap { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: var(--mp-background-neutral-subtle, #f4f5f7); }
.pv-img { max-width: 100%; max-height: 78vh; object-fit: contain; display: block; }
.pv-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.pv-brand { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* Empty state — 3D illustration + copy + secondary CTA (ERP pattern) */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-12, 48px) var(--mp-spacing-6); text-align: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); max-width: 420px; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
.empty-cta { margin-top: var(--mp-spacing-3); }

/* ── Filter bar (verbatim ERP block) ── */
.filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-select-wrap { position: relative; display: inline-flex; align-items: center; width: 160px; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.filter-select { appearance: none; background: transparent; border: none; outline: none; width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); cursor: pointer; }
.filter-select-chevron { position: absolute; right: var(--mp-spacing-2); pointer-events: none; color: var(--mp-text-default); width: 20px; height: 20px; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.generate-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-2) var(--mp-spacing-4); border: none; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #029861); color: #fff; font-family: inherit; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; white-space: nowrap; }
.generate-btn:hover { background: #027a4e; }
.generate-btn :deep(svg) { color: #fff; }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 300px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
