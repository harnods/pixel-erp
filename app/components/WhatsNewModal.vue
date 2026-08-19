<script setup lang="ts">
/**
 * "What's new" announcement modal (iCloud-style) — centered feature icon, title,
 * and body. Opened from the get-started strip on Home v2. Content announces the
 * new inbound & outbound warehouse fulfillment features.
 */
import { watch, onBeforeUnmount } from 'vue'
import { MpIcon } from '@mekari/pixel3'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ 'update:isOpen': [boolean] }>()

function close() { emit('update:isOpen', false) }

function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close() }
watch(() => props.isOpen, (open) => {
  if (typeof document === 'undefined') return
  if (open) document.addEventListener('keydown', onKey)
  else document.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => { if (typeof document !== 'undefined') document.removeEventListener('keydown', onKey) })

const features = [
  { icon: 'warehouse', title: 'Inbound receiving', desc: 'Turn purchase orders into guided receiving — scan or count against expected quantities, flag over- and short-receipts, then put stock away by location.' },
  { icon: 'truck', title: 'Outbound fulfillment', desc: 'Take sales orders through picking, packing, and shipping, so every order leaves accurate and on time.' },
]
</script>

<template>
  <Teleport to="body">
    <Transition name="wn">
      <div v-if="isOpen" class="wn-overlay" @click.self="close">
        <div class="wn-card" role="dialog" aria-modal="true" aria-labelledby="wn-title">
          <button class="wn-close" type="button" aria-label="Close" @click="close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>

          <img class="wn-hero-icon" src="/erp-home/fulfillment.svg" alt="" width="72" height="72">
          <h2 id="wn-title" class="wn-title">Inbound &amp; outbound fulfillment</h2>
          <p class="wn-lead">
            Your warehouse now runs end to end inside Mekari ERP. Receive against
            purchase orders and ship against sales orders — stock and accounting
            stay in sync automatically as goods move.
          </p>

          <div class="wn-features">
            <div v-for="f in features" :key="f.title" class="wn-feature">
              <span class="wn-feature__icon"><MpIcon :name="f.icon" size="md" /></span>
              <div class="wn-feature__text">
                <p class="wn-feature__title">{{ f.title }}</p>
                <p class="wn-feature__desc">{{ f.desc }}</p>
              </div>
            </div>
          </div>

          <a class="wn-link" href="#" @click.prevent="close">Learn more</a>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.wn-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: var(--mp-spacing-6); background: rgba(8, 13, 14, 0.38); }
.wn-card { position: relative; width: 100%; max-width: 460px; max-height: calc(100vh - 48px); overflow-y: auto; background: var(--mp-background-neutral, #fff); border-radius: 20px; padding: var(--mp-spacing-8) var(--mp-spacing-7, 28px) var(--mp-spacing-7, 28px); box-shadow: 0 24px 60px rgba(8, 13, 14, 0.24); text-align: center; }
.wn-close { position: absolute; top: var(--mp-spacing-4); right: var(--mp-spacing-4); display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; border-radius: var(--mp-radii-full, 999px); background: none; cursor: pointer; color: var(--mp-text-secondary, #3a4749); }
.wn-close:hover { background: var(--mp-background-neutral-subtle, #f1f3f3); color: var(--mp-text-default); }

.wn-hero-icon { display: block; width: 72px; height: 72px; margin: var(--mp-spacing-2) auto 0; }
.wn-title { margin: var(--mp-spacing-4) 0 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-bold, 700); line-height: var(--mp-line-heights-xl, 28px); color: var(--mp-text-default); }
.wn-lead { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary, #3a4749); text-align: left; }

.wn-features { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-4); text-align: left; }
.wn-feature { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.wn-feature__icon { flex-shrink: 0; width: 40px; height: 40px; border-radius: var(--mp-radii-md, 8px); display: flex; align-items: center; justify-content: center; background: #EBF7F2; color: #349180; }
.wn-feature__text { min-width: 0; }
.wn-feature__title { margin: 0; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.wn-feature__desc { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }

.wn-link { display: inline-block; margin-top: var(--mp-spacing-6); font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-link, #165082); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }

/* Enter / leave */
.wn-enter-active, .wn-leave-active { transition: opacity 180ms ease; }
.wn-enter-active .wn-card, .wn-leave-active .wn-card { transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1); }
.wn-enter-from, .wn-leave-to { opacity: 0; }
.wn-enter-from .wn-card, .wn-leave-to .wn-card { transform: scale(0.96) translateY(6px); }
@media (prefers-reduced-motion: reduce) {
  .wn-enter-active, .wn-leave-active, .wn-enter-active .wn-card, .wn-leave-active .wn-card { transition: none; }
}
</style>
