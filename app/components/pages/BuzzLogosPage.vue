<script setup lang="ts">
/**
 * BuzzLogosPage · Mekari Buzz — brand logo library (PRD §10, sibling of Photo
 * stocks). Users upload their approved brand logos here and browse them so they
 * can be reused across creatives instead of re-sourcing each time. Mirrors
 * BuzzPhotoStocksPage: the standard ERP filter bar (brand dropdown + All filters
 * left; Upload logo + Export + Search right) and a gallery grid. Unlike photos,
 * logos render on a NEUTRAL tile with object-fit: contain so they are never
 * cropped or shown on a coloured gradient.
 */
import { MpIcon, toast } from '@mekari/pixel3'
import { buzzAssets, buzzBrands, buzzBrand, addUploadedAsset, type BuzzAsset } from '~/data/buzz'
import { infoToast } from '~/utils/toasts'
import { putImage, getImage } from '~/utils/buzzImageStore'

const search = ref('')
const brandFilter = ref('')

// Only logo assets; alphabetical by title (a logo library reads as thumbnails).
const filtered = computed<BuzzAsset[]>(() => {
  const s = search.value.trim().toLowerCase()
  return buzzAssets
    .filter((a) => a.assetType === 'logo')
    .filter((a) =>
      (!s || a.title.toLowerCase().includes(s) || a.tags.some((t) => t.toLowerCase().includes(s))) &&
      (!brandFilter.value || a.brand === brandFilter.value))
    .sort((a, b) => a.title.localeCompare(b.title))
})

// Uploaded logo images loaded lazily from IndexedDB (buzzImageStore), keyed by id.
const images = ref<Map<string, string>>(new Map())
async function loadImages() {
  for (const a of filtered.value) {
    if (!a.hasImage || images.value.has(a.id)) continue
    const rec = await getImage(a.id)
    if (rec?.dataUrl) { const next = new Map(images.value); next.set(a.id, rec.dataUrl); images.value = next }
  }
}
watch(filtered, loadImages, { deep: true, immediate: true })

// ── Upload logo ──
const fileInput = ref<HTMLInputElement | null>(null)
function triggerUpload() { fileInput.value?.click() }

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  // Tag with the selected brand filter, else the first brand.
  const brand = brandFilter.value || buzzBrands[0]?.id || ''
  for (const file of files) {
    const dataUrl = await readDataUrl(file)
    const title = file.name.replace(/\.[^./\\]+$/, '')
    const asset = addUploadedAsset({ title, brand, assetType: 'logo', orientation: 'Square', tags: ['logo'], usage: 'Brand logo' })
    await putImage({ id: asset.id, mime: file.type, dataUrl })
  }
  input.value = ''
  await loadImages()
  toast.notify({ variant: 'success', title: 'Logo uploaded.' })
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
        <button class="filter-all-btn"><MpIcon name="filter" size="md" /> All filters</button>
      </div>
      <div class="filter-right">
        <button class="generate-btn" type="button" @click="triggerUpload"><MpIcon name="add" size="md" /> Upload logo</button>
        <input ref="fileInput" class="upload-input" type="file" accept="image/*" multiple @change="onFiles" />
        <div class="filter-btn-group">
          <button class="filter-icon-btn" aria-label="Export" @click="infoToast('Export · coming soon')"><MpIcon name="download" size="md" /></button>
        </div>
        <div class="filter-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search logos, e.g. Mekari Talenta…" />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>
    </div>

    <!-- ── Gallery grid ── -->
    <div v-if="filtered.length" class="gallery">
      <button v-for="a in filtered" :key="a.id" type="button" class="asset" @click="infoToast('Asset preview · coming soon')">
        <span class="asset__thumb">
          <img v-if="a.hasImage && images.get(a.id)" :src="images.get(a.id)" :alt="a.title" class="asset__photo" />
          <MpIcon v-else name="file-image" size="lg" />
        </span>
        <span class="asset__meta">
          <span class="asset__title">{{ a.title }}</span>
          <span class="asset__sub">{{ buzzBrand(a.brand)?.name }}</span>
        </span>
      </button>
    </div>
    <div v-else class="empty">
      <MpIcon name="file-image" size="lg" />
      <p>No logos yet. Upload your brand logos to reuse them across creatives.</p>
    </div>
  </div>
</template>

<style scoped>
.buzz-page { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }

/* ── Gallery ── */
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--mp-spacing-4, 16px); }
.asset { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); padding: 0; border: none; background: none; cursor: pointer; text-align: left; }
.asset__thumb { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 180px; border-radius: var(--mp-radii-lg, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral-subtle, #f4f6f7); overflow: hidden; color: var(--mp-text-subtle); }
.asset__photo { position: absolute; inset: 12px; width: calc(100% - 24px); height: calc(100% - 24px); object-fit: contain; }
.asset:hover .asset__thumb { border-color: var(--mp-border-bold, #8c9596); }
.asset__meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.asset__title { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset__sub { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

.empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-20, 80px); color: var(--mp-text-secondary); text-align: center; }

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
.upload-input { display: none; }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 300px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
