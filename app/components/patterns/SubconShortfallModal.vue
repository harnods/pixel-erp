<script setup lang="ts">
/**
 * "Complete work order" on a subcon order the vendor has under-delivered.
 *
 * The finished-good quantity comes from the vendor's purchase deliveries, so a
 * work order is only finished when those add up to what was ordered. When they
 * do not, there are exactly two honest ways forward and this asks which:
 *
 *   • the vendor still owes the balance — raise another delivery, or
 *   • the order is closing short — reduce the quantity the work order needs, so
 *     the shortfall is recorded rather than quietly ignored.
 *
 * Not MpModal: that component renders inline and invisible in this Pixel build
 * (see rule/modal-use-mpmodal, amended) — this uses the Teleport shell that works.
 */
import { MpButton, MpButtonGroup, MpIcon, MpInput, MpFormControl, MpFormLabel } from '@mekari/pixel3'

const props = defineProps<{
  isOpen: boolean
  produced: number
  planned: number
  unit: string
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  /** Reduce the work order to what was produced, then complete it. */
  (e: 'adjust', reason: string): void
  /** Raise another delivery for the balance instead. */
  (e: 'deliver'): void
}>()

const { t } = useLocale()

const shortfall = computed(() => Math.max(0, props.planned - props.produced))
const reason = ref('')

watch(() => props.isOpen, (open) => { if (open) reason.value = '' })

function close() { emit('update:isOpen', false) }
</script>

<template>
  <Teleport to="body">
    <Transition name="ssf">
      <!-- Overlay ignores clicks and there is no Esc listener: a modal closes only
           via its × (rule/modal-drawer-close-explicit-only). -->
      <div v-if="isOpen" class="ssf-overlay">
        <div class="ssf-panel" role="dialog" :aria-label="t('Work order is short')">
          <header class="ssf-header">
            <h2 class="ssf-title">{{ t('Work order is short') }}</h2>
            <button class="ssf-close btn-enterprise" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="ssf-body">
            <p class="ssf-lead">
              {{ t('Deliveries so far total') }}
              <strong>{{ produced.toLocaleString('id-ID') }} {{ t('of') }} {{ planned.toLocaleString('id-ID') }} {{ unit }}</strong>
              — {{ shortfall.toLocaleString('id-ID') }} {{ unit }} {{ t('still outstanding.') }}
            </p>

            <!-- The usual case: the vendor still owes the balance. -->
            <div class="ssf-option">
              <span class="ssf-option__title">{{ t('Is the vendor still delivering?') }}</span>
              <span class="ssf-option__desc">
                {{ t('Raise another purchase delivery for the balance. The work order completes on its own once the deliveries add up.') }}
              </span>
              <MpButton variant="secondary" is-rounded @click="emit('deliver')">
                {{ t('Create purchase delivery') }}
              </MpButton>
            </div>

            <!-- Closing short: record it rather than losing it. -->
            <div class="ssf-option ssf-option--last">
              <span class="ssf-option__title">{{ t('Or close the order short') }}</span>
              <span class="ssf-option__desc">
                {{ t('Adjusts the finished-good quantity to') }} {{ produced.toLocaleString('id-ID') }} {{ unit }}.
                {{ t('The original figure and your reason are kept on the work order.') }}
              </span>
              <MpFormControl id="ssf-reason">
                <MpFormLabel>{{ t('Reason for the adjustment') }}</MpFormLabel>
                <MpInput id="ssf-reason-input" v-model="reason" is-full-width />
              </MpFormControl>
            </div>
          </div>

          <footer class="ssf-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="emit('adjust', reason)">
                {{ t('Adjust qty & complete') }}
              </MpButton>
            </MpButtonGroup>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ssf-enter-active, .ssf-leave-active { transition: opacity 200ms ease; }
.ssf-enter-from, .ssf-leave-to { opacity: 0; }
.ssf-enter-active .ssf-panel, .ssf-leave-active .ssf-panel { transition: transform 200ms ease, opacity 200ms ease; }
.ssf-enter-from .ssf-panel, .ssf-leave-to .ssf-panel { transform: scale(0.97); opacity: 0; }

.ssf-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(20, 23, 28, 0.45));
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-spacing-20, 80px) var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.ssf-panel {
  width: min(560px, 100%);
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
  display: flex; flex-direction: column;
}
.ssf-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.ssf-title {
  margin: 0; font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ssf-close {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.ssf-close:hover { background: var(--mp-background-neutral-hovered); }

.ssf-body { padding: var(--mp-spacing-5); }
.ssf-lead { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ssf-lead strong { font-variant-numeric: tabular-nums; }

.ssf-option {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2);
  padding-bottom: var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.ssf-option--last { padding-bottom: 0; margin-bottom: 0; border-bottom: none; }
.ssf-option__title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ssf-option__desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.ssf-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
</style>
