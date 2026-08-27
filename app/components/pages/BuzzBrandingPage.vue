<script setup lang="ts">
/**
 * BuzzBrandingPage · Mekari Buzz — brand kits (PRD §8).
 *
 * Every Mekari product has a Brand Kit: logo, colour palette, typography, tone
 * of voice, photography style, and guardrails. Brand context is applied to
 * generation automatically, so this page is the governed source of truth.
 * Card grid (1px border, no drop-shadow — enterprise surface rule).
 */
import { MpIcon } from '@mekari/pixel3'
import { buzzBrands } from '~/data/buzz'
import { getImage } from '~/utils/buzzImageStore'

const router = useRouter()

// Seed brands carry a /connectors logo path; custom brands store a logo asset id
// (image in IndexedDB) — resolve those lazily.
function isAssetLogo(logo: string) { return !!logo && !logo.startsWith('/') && !logo.startsWith('data:') && !logo.startsWith('http') }
const logoUrls = ref<Map<string, string>>(new Map())
async function loadLogos() {
  for (const b of buzzBrands) {
    if (!isAssetLogo(b.logo) || logoUrls.value.has(b.logo)) continue
    const rec = await getImage(b.logo)
    if (rec?.dataUrl) { const next = new Map(logoUrls.value); next.set(b.logo, rec.dataUrl); logoUrls.value = next }
  }
}
watch(buzzBrands, loadLogos, { deep: true, immediate: true })
function logoSrc(logo: string): string { return isAssetLogo(logo) ? (logoUrls.value.get(logo) ?? '') : logo }
</script>

<template>
  <div class="brand-grid">
    <section v-for="b in buzzBrands" :key="b.id" class="brand-card">
      <header class="brand-card__head">
        <img v-if="logoSrc(b.logo)" :src="logoSrc(b.logo)" :alt="b.name" class="brand-card__logo" />
        <span v-else class="brand-card__logo brand-card__logo--mono" :style="{ background: b.accent }">{{ b.name.slice(0, 1) }}</span>
        <div class="brand-card__id">
          <h2 class="brand-card__name">{{ b.name }}<span v-if="b.source === 'custom'" class="brand-card__tag">Custom</span></h2>
          <p class="brand-card__count">{{ b.assetCount }} approved assets</p>
        </div>
        <button type="button" class="brand-card__manage" @click="router.push(`/buzz-brand/${b.id}/edit`)">Manage</button>
      </header>

      <!-- Colours -->
      <div class="brand-row">
        <p class="brand-row__label">Colours{{ b.theme ? ` · ${b.theme}` : '' }}</p>
        <div class="swatches">
          <span class="swatch" :style="{ background: b.accent }" :title="b.accent" />
          <span class="swatch" :style="{ background: b.secondary }" :title="b.secondary" />
          <span class="swatch" :style="{ background: b.neutral }" :title="b.neutral" />
          <span v-for="c in (b.palette || [])" :key="c" class="swatch" :style="{ background: c }" :title="c" />
        </div>
      </div>

      <!-- Typography -->
      <div class="brand-row">
        <p class="brand-row__label">Typography</p>
        <p class="brand-row__value">{{ b.typography }}</p>
      </div>

      <!-- Tone -->
      <div class="brand-row">
        <p class="brand-row__label">Tone of voice</p>
        <p class="brand-row__value">{{ b.tone }}</p>
      </div>

      <!-- Photography -->
      <div class="brand-row">
        <p class="brand-row__label">Photography</p>
        <p class="brand-row__value">{{ b.photography }}</p>
      </div>

      <!-- Logo usage (custom brands) -->
      <div v-if="b.logoUsage && b.logoUsage.length" class="brand-row">
        <p class="brand-row__label">Logo usage</p>
        <ul class="guardrails">
          <li v-for="g in b.logoUsage" :key="g"><MpIcon name="check" size="sm" /> {{ g }}</li>
        </ul>
      </div>

      <!-- Guardrails -->
      <div v-if="b.guardrails && b.guardrails.length" class="brand-row">
        <p class="brand-row__label">Guardrails</p>
        <ul class="guardrails">
          <li v-for="g in b.guardrails" :key="g"><MpIcon name="check" size="sm" /> {{ g }}</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped>
.brand-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--mp-spacing-4, 16px); }

.brand-card { display: flex; flex-direction: column; gap: var(--mp-spacing-4, 16px); padding: var(--mp-spacing-5, 20px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-default, #fff); }
.brand-card__head { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); }
.brand-card__logo { width: 40px; height: 40px; flex-shrink: 0; border-radius: 8px; object-fit: contain; border: 1px solid var(--mp-border-default, #e3e7e9); background: #fff; padding: 4px; }
.brand-card__logo--mono { display: inline-flex; align-items: center; justify-content: center; padding: 0; color: #fff; font-size: 18px; font-weight: var(--mp-font-weights-bold, 700); border: none; }
.brand-card__tag { margin-left: var(--mp-spacing-2, 8px); font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f0f1f3); border-radius: var(--mp-radii-full, 999px); padding: 1px 8px; vertical-align: middle; }
.brand-card__id { flex: 1; min-width: 0; }
.brand-card__name { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.brand-card__count { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.brand-card__manage { flex-shrink: 0; padding: 0; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-link); }
.brand-card__manage:hover { text-decoration: underline; text-underline-offset: 2px; }

.brand-row { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.brand-row__label { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.brand-row__value { margin: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }

.swatches { display: flex; gap: var(--mp-spacing-2, 8px); }
.swatch { width: 32px; height: 32px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.08); }

.guardrails { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.guardrails li { display: flex; align-items: flex-start; gap: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.guardrails :deep(svg) { flex: 0 0 auto; margin-top: 2px; color: var(--mp-icon-success, #0a6e4e); }
</style>
