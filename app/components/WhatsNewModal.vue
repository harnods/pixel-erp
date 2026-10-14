<script setup lang="ts">
/**
 * "What's new" announcement modal (iCloud-style) — a slider of feature cards with
 * dot indicators. Opened from the get-started strip on Home v2. Announces the new
 * warehouse fulfillment and AI bank reconciliation features.
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{ 'update:isOpen': [boolean] }>()

function close() { emit('update:isOpen', false) }

interface Slide {
  hero: { img?: string; icon?: string; circleBg?: string; circleFg?: string }
  accent: { bg: string; fg: string }
  title: string
  lead: string
  features: { icon: string; title: string; desc: string }[]
}

const slides: Slide[] = [
  {
    hero: { img: '/erp-home/fulfillment.svg' },
    accent: { bg: '#EBF7F2', fg: '#349180' },
    title: 'Inbound & outbound fulfillment',
    lead: 'Your warehouse now runs end to end inside Mekari ERP. Receive against purchase orders and ship against sales orders — stock and accounting stay in sync automatically as goods move.',
    features: [
      { icon: 'warehouse', title: 'Inbound receiving', desc: 'Turn purchase orders into guided receiving — scan or count against expected quantities, flag over- and short-receipts, then put stock away by location.' },
      { icon: 'truck', title: 'Outbound fulfillment', desc: 'Take sales orders through picking, packing, and shipping, so every order leaves accurate and on time.' },
    ],
  },
  {
    hero: { icon: 'bank', circleBg: '#EDE7FB', circleFg: '#7C3AED' },
    accent: { bg: '#F1EEFB', fg: '#7C3AED' },
    title: 'AI-powered bank reconciliation',
    lead: 'Close your books faster. Mekari ERP now matches imported bank statements to your records automatically — AI suggests the right match for each line, so you only review the exceptions.',
    features: [
      { icon: 'checkbox-checklist', title: 'Smart match suggestions', desc: 'AI pairs every statement line with the most likely invoice, bill, or journal entry, with a confidence score you can accept in one click.' },
      { icon: 'wallet', title: 'Auto-categorized transactions', desc: 'Recurring fees, transfers, and payments are recognized and categorized for you — learning from how you reconcile over time.' },
    ],
  },
]

const idx = ref(0)
function go(i: number) { idx.value = Math.max(0, Math.min(i, slides.length - 1)) }

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowRight') go(idx.value + 1)
  else if (e.key === 'ArrowLeft') go(idx.value - 1)
}
watch(() => props.isOpen, (open) => {
  if (typeof document === 'undefined') return
  if (open) { idx.value = 0; document.addEventListener('keydown', onKey) }
  else document.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => { if (typeof document !== 'undefined') document.removeEventListener('keydown', onKey) })
</script>

<template>
  <Teleport to="body">
    <Transition name="wn">
      <div v-if="isOpen" class="wn-overlay">
        <div class="wn-card" role="dialog" aria-modal="true" aria-labelledby="wn-title">
          <MpButton class="wn-close" variant="ghost" size="sm" left-icon="close" aria-label="Close" @click="close" />

          <Transition name="wn-slide" mode="out-in">
            <div :key="idx" class="wn-content">
              <img v-if="slides[idx].hero.img" class="wn-hero-icon" :src="slides[idx].hero.img" alt="" width="72" height="72">
              <div v-else class="wn-hero-icon wn-hero-icon--circle" :style="{ background: slides[idx].hero.circleBg, color: slides[idx].hero.circleFg }">
                <MpIcon :name="slides[idx].hero.icon!" size="lg" />
              </div>

              <h2 id="wn-title" class="wn-title">{{ slides[idx].title }}</h2>
              <p class="wn-lead">
                {{ slides[idx].lead }} <a class="wn-link" href="#" @click.prevent="close">Learn more</a>
              </p>

              <div class="wn-features">
                <div v-for="f in slides[idx].features" :key="f.title" class="wn-feature">
                  <span class="wn-feature__icon" :style="{ background: slides[idx].accent.bg, color: slides[idx].accent.fg }"><MpIcon :name="f.icon" size="md" /></span>
                  <div class="wn-feature__text">
                    <p class="wn-feature__title">{{ f.title }}</p>
                    <p class="wn-feature__desc">{{ f.desc }}</p>
                  </div>
                </div>
              </div>
            </div>
          </Transition>

          <div v-if="slides.length > 1" class="wn-dots" role="tablist" aria-label="Feature slides">
            <MpButton
              v-for="(s, i) in slides" :key="i"
              class="wn-dot" :class="{ 'wn-dot--active': i === idx }"
              variant="ghost" role="tab" :aria-selected="i === idx" :aria-label="`Slide ${i + 1}`"
              @click="go(i)"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.wn-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; padding: var(--mp-spacing-6); background: rgba(8, 13, 14, 0.38); }
.wn-card { position: relative; width: 100%; max-width: 460px; max-height: calc(100vh - 48px); overflow-y: auto; background: var(--mp-background-neutral, #fff); border-radius: 20px; padding: var(--mp-spacing-8) var(--mp-spacing-7, 28px) var(--mp-spacing-6); box-shadow: 0 24px 60px rgba(8, 13, 14, 0.24); text-align: center; }
.wn-close { position: absolute; top: var(--mp-spacing-4); right: var(--mp-spacing-4); z-index: 1; color: var(--mp-text-secondary, #3a4749); }

/* Fixed min-height so the card doesn't jump when slides differ in length. */
.wn-content { min-height: 328px; }
.wn-hero-icon { display: block; width: 72px; height: 72px; margin: var(--mp-spacing-2) auto 0; }
.wn-hero-icon--circle { border-radius: var(--mp-radii-full, 999px); display: flex; align-items: center; justify-content: center; }
/* Match the glyph size of slide 1's illustrated icon (which sits inset in its 72px circle). */
.wn-hero-icon--circle :deep(svg) { width: 32px; height: 32px; }
.wn-title { margin: var(--mp-spacing-4) 0 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-bold, 700); line-height: var(--mp-line-heights-xl, 28px); color: var(--mp-text-default); }
.wn-lead { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary, #3a4749); text-align: left; }
.wn-link { font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-link, #165082); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; white-space: nowrap; }

.wn-features { margin-top: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-4); text-align: left; }
.wn-feature { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.wn-feature__icon { flex-shrink: 0; width: 40px; height: 40px; border-radius: var(--mp-radii-md, 8px); display: flex; align-items: center; justify-content: center; }
.wn-feature__text { min-width: 0; }
.wn-feature__title { margin: 0; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.wn-feature__desc { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }

/* Dot indicators */
.wn-dots { display: flex; justify-content: center; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-6); }
.wn-dot { width: 7px; height: 7px; padding: 0; border: none; border-radius: var(--mp-radii-full, 999px); background: var(--mp-border-bold, #c5cccd); cursor: pointer; transition: width 160ms ease, background 160ms ease; }
.wn-dot:hover { background: var(--mp-text-secondary, #8c9596); }
.wn-dot--active { width: 20px; background: var(--mp-text-default, #080d0e); }

/* Modal enter / leave */
.wn-enter-active, .wn-leave-active { transition: opacity 180ms ease; }
.wn-enter-active .wn-card, .wn-leave-active .wn-card { transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1); }
.wn-enter-from, .wn-leave-to { opacity: 0; }
.wn-enter-from .wn-card, .wn-leave-to .wn-card { transform: scale(0.96) translateY(6px); }

/* Slide cross-fade */
.wn-slide-enter-active, .wn-slide-leave-active { transition: opacity 200ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1); }
.wn-slide-enter-from { opacity: 0; transform: translateX(12px); }
.wn-slide-leave-to { opacity: 0; transform: translateX(-12px); }

@media (prefers-reduced-motion: reduce) {
  .wn-enter-active, .wn-leave-active, .wn-enter-active .wn-card, .wn-leave-active .wn-card,
  .wn-slide-enter-active, .wn-slide-leave-active { transition: none; }
}
</style>
