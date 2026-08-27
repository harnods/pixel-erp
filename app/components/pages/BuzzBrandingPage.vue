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
import { infoToast } from '~/utils/toasts'
</script>

<template>
  <div class="brand-grid">
    <section v-for="b in buzzBrands" :key="b.id" class="brand-card">
      <header class="brand-card__head">
        <img :src="b.logo" :alt="b.name" class="brand-card__logo" />
        <div class="brand-card__id">
          <h2 class="brand-card__name">{{ b.name }}</h2>
          <p class="brand-card__count">{{ b.assetCount }} approved assets</p>
        </div>
        <button type="button" class="brand-card__manage" @click="infoToast('Brand kit editor · coming soon')">Manage</button>
      </header>

      <!-- Colours -->
      <div class="brand-row">
        <p class="brand-row__label">Colours</p>
        <div class="swatches">
          <span class="swatch" :style="{ background: b.accent }" :title="b.accent" />
          <span class="swatch" :style="{ background: b.secondary }" :title="b.secondary" />
          <span class="swatch" :style="{ background: b.neutral }" :title="b.neutral" />
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

      <!-- Guardrails -->
      <div class="brand-row">
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
