<script setup lang="ts">
/**
 * The fork offered when a work order is being closed: does what happened in the
 * field match what the order says?
 *
 * Two panels rather than a Yes/No, because they are not the same weight of
 * decision — one opens an edit form, the other finishes the order — and phrasing
 * both as questions lets the reader pick by recognising their situation rather
 * than by parsing a prompt.
 *
 * The subcon wording differs from the standard flow's: there is no routing to
 * save, so the right-hand side completes the order.
 *
 * Not MpModal (no working CSS in this Pixel build); same Teleport shell as the
 * other subcon dialogs. Icon names verified against the Pixel library
 * (rule/icon-pixel-library) — `document` and `checkmark-outline` are NOT in it
 * and render as the unknown-icon placeholder.
 */
import { MpIcon } from '@mekari/pixel3'

defineProps<{ isOpen: boolean }>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'adjust'): void
  (e: 'proceed'): void
}>()

const { t } = useLocale()

function close() { emit('update:isOpen', false) }
</script>

<template>
  <Teleport to="body">
    <Transition name="cwa">
      <!-- Closes only via × (rule/modal-drawer-close-explicit-only). -->
      <div v-if="isOpen" class="cwa-overlay">
        <div class="cwa-panel" role="dialog" :aria-label="t('Confirmation of work order completion')">
          <header class="cwa-bar">
            <h2 class="cwa-bar__title">{{ t('Confirmation of work order completion') }}</h2>
            <button class="cwa-close btn-enterprise" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="cwa-body">
            <section class="cwa-choice">
              <span class="cwa-icon cwa-icon--adjust"><MpIcon name="file-change" size="lg" /></span>
              <h3 class="cwa-choice__title">{{ t('Found differences?') }}</h3>
              <p class="cwa-choice__desc">
                {{ t('Make adjustments if there are differences between what the vendor returned and the work order created.') }}
              </p>
              <button class="cwa-action btn-enterprise" type="button" @click="emit('adjust')">
                {{ t('Adjust work order') }}
              </button>
            </section>

            <span class="cwa-divider" aria-hidden="true" />

            <section class="cwa-choice">
              <span class="cwa-icon cwa-icon--ok"><MpIcon name="done" size="lg" /></span>
              <h3 class="cwa-choice__title">{{ t('All correct?') }}</h3>
              <p class="cwa-choice__desc">
                {{ t('Complete the work order if what came back from the vendor matches the work order created.') }}
              </p>
              <button class="cwa-action btn-enterprise" type="button" @click="emit('proceed')">
                {{ t('Complete work order') }}
              </button>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cwa-enter-active, .cwa-leave-active { transition: opacity 200ms ease; }
.cwa-enter-from, .cwa-leave-to { opacity: 0; }
.cwa-enter-active .cwa-panel, .cwa-leave-active .cwa-panel { transition: transform 200ms ease, opacity 200ms ease; }
.cwa-enter-from .cwa-panel, .cwa-leave-to .cwa-panel { transform: scale(0.97); opacity: 0; }

.cwa-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(20, 23, 28, 0.45));
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-spacing-20, 80px) var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.cwa-panel {
  width: min(680px, 100%);
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
}
.cwa-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle, #f5f6f7);
  border-bottom: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px) 0 0;
}
.cwa-bar__title {
  margin: 0; font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.cwa-close {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.cwa-close:hover { background: var(--mp-background-neutral-hovered); }

.cwa-body {
  display: flex; align-items: stretch;
  padding: var(--mp-spacing-8, 32px) var(--mp-spacing-5);
  gap: var(--mp-spacing-5);
}
.cwa-choice {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; align-items: center;
  gap: var(--mp-spacing-3);
  text-align: center;
}
.cwa-divider { flex: none; width: 1px; background: var(--mp-border-default); }

.cwa-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-12, 48px); height: var(--mp-sizes-12, 48px);
  border-radius: var(--mp-radii-md);
  border: var(--mp-border-width-lg, 2px) solid currentColor;
}
.cwa-icon--adjust { color: var(--mp-text-link); }
.cwa-icon--ok { color: var(--mp-text-success, #18794e); }

.cwa-choice__title {
  margin: 0; font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.cwa-choice__desc {
  margin: 0; font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary); max-width: 34ch;
}
.cwa-action {
  margin-top: auto;
  padding: var(--mp-spacing-2) var(--mp-spacing-5);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-default, #fff);
  color: var(--mp-text-link);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
}
.cwa-action:hover { background: var(--mp-background-neutral-hovered); }
</style>
