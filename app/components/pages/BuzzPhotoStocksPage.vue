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
import { MpIcon } from '@mekari/pixel3'
import { buzzAssets, buzzBrands, buzzBrand, type BuzzAsset } from '~/data/buzz'
import { infoToast } from '~/utils/toasts'

const search = ref('')
const brandFilter = ref('')
const orientationFilter = ref('')
const orientations = ['Landscape', 'Portrait', 'Square']

const filtered = computed<BuzzAsset[]>(() => {
  const s = search.value.trim().toLowerCase()
  return [...buzzAssets]
    .sort((a, b) => a.title.localeCompare(b.title))
    .filter((a) =>
      (!s || a.title.toLowerCase().includes(s) || a.tags.some((t) => t.toLowerCase().includes(s))) &&
      (!brandFilter.value || a.brand === brandFilter.value) &&
      (!orientationFilter.value || a.orientation === orientationFilter.value))
})
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
        <button class="filter-all-btn"><MpIcon name="filter" size="md" /> All filters</button>
      </div>
      <div class="filter-right">
        <div class="filter-btn-group">
          <button class="filter-icon-btn" aria-label="Export" @click="infoToast('Export · coming soon')"><MpIcon name="download" size="md" /></button>
        </div>
        <div class="filter-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search photos, e.g. HR manager at laptop…" />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>
    </div>

    <!-- ── Gallery grid ── -->
    <div v-if="filtered.length" class="gallery">
      <button v-for="a in filtered" :key="a.id" type="button" class="asset" @click="infoToast('Asset preview · coming soon')">
        <span class="asset__thumb" :class="`asset__thumb--${a.orientation.toLowerCase()}`" :style="{ background: a.gradient }">
          <img :src="buzzBrand(a.brand)?.logo" :alt="buzzBrand(a.brand)?.name" class="asset__badge" />
        </span>
        <span class="asset__meta">
          <span class="asset__title">{{ a.title }}</span>
          <span class="asset__sub">{{ buzzBrand(a.brand)?.name }} · {{ a.orientation }}</span>
        </span>
      </button>
    </div>
    <div v-else class="empty">
      <MpIcon name="file-image" size="lg" />
      <p>No photos match your filters.</p>
    </div>
  </div>
</template>

<style scoped>
.buzz-page { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }

/* ── Gallery ── */
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--mp-spacing-4, 16px); }
.asset { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); padding: 0; border: none; background: none; cursor: pointer; text-align: left; }
.asset__thumb { position: relative; display: block; width: 100%; height: 150px; border-radius: var(--mp-radii-lg, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); overflow: hidden; }
.asset__thumb--portrait { height: 200px; }
.asset__thumb--square { height: 180px; }
.asset__badge { position: absolute; left: 8px; bottom: 8px; width: 24px; height: 24px; border-radius: 5px; object-fit: contain; background: #fff; padding: 2px; box-shadow: 0 1px 2px rgba(0,0,0,0.15); }
.asset:hover .asset__thumb { border-color: var(--mp-border-bold, #8c9596); }
.asset__meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.asset__title { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.asset__sub { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

.empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-20, 80px); color: var(--mp-text-secondary); }

/* ── Filter bar (verbatim ERP block) ── */
.filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-select-wrap { position: relative; display: inline-flex; align-items: center; width: 160px; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.filter-select { appearance: none; background: transparent; border: none; outline: none; width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); cursor: pointer; }
.filter-select-chevron { position: absolute; right: var(--mp-spacing-2); pointer-events: none; color: var(--mp-text-default); width: 20px; height: 20px; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 300px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
