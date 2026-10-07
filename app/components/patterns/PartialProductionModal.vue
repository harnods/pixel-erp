<script setup lang="ts">
/**
 * Close a work order for part of its quantity.
 *
 * Asked rather than assumed: the order knows what is still outstanding, but only
 * the person closing it knows how much of that is actually finished. The balance
 * stays open — the order becomes "partially produced", not "completed" — so the
 * rest can be recorded later against the same order.
 *
 * Offered only while the Production module allows partial production; see
 * `productionSettings.partialProduction`.
 *
 * Not MpModal (no working CSS in this Pixel build); same Teleport shell as the
 * other work order dialogs, closing only via × (rule/modal-drawer-close-explicit-only).
 */
import { MpIcon, MpInput, MpInputGroup, MpInputRightAddon } from '@mekari/pixel3'

const props = defineProps<{
  isOpen: boolean
  /** What the order set out to make. */
  plannedQty: number
  /** What it has already recorded. */
  producedQty: number
  unit: string
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm', qty: number): void
}>()

const { t } = useLocale()

const qty = ref('')
const error = ref('')

const remaining = computed(() => Math.max(0, props.plannedQty - props.producedQty))

// Reset each time it opens, so a previous attempt never pre-fills the next.
watch(() => props.isOpen, (open) => {
  if (open) { qty.value = ''; error.value = '' }
})

function close() { emit('update:isOpen', false) }

/**
 * Validated inline rather than by greying out the button
 * (rule/btn-no-disabled-validation, rule/form-errors-inline).
 */
function confirm() {
  const n = Number(qty.value)
  if (!qty.value.trim() || Number.isNaN(n) || n <= 0) {
    error.value = t('Enter how many were produced.')
    return
  }
  if (n > remaining.value) {
    error.value = `${t('That is more than the remaining quantity')} (${remaining.value} ${props.unit}).`
    return
  }
  error.value = ''
  emit('confirm', n)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ppm">
      <div v-if="isOpen" class="ppm-overlay">
        <div class="ppm-panel" role="dialog" :aria-label="t('Record partial production')">
          <header class="ppm-bar">
            <h2 class="ppm-bar__title">{{ t('Record partial production') }}</h2>
            <button class="ppm-close btn-enterprise" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="ppm-body">
            <dl class="ppm-facts">
              <div class="ppm-fact">
                <dt>{{ t('Planned qty') }}</dt>
                <dd>{{ plannedQty }} {{ unit }}</dd>
              </div>
              <div class="ppm-fact">
                <dt>{{ t('Already produced') }}</dt>
                <dd>{{ producedQty }} {{ unit }}</dd>
              </div>
              <div class="ppm-fact">
                <dt>{{ t('Remaining qty') }}</dt>
                <dd>{{ remaining }} {{ unit }}</dd>
              </div>
            </dl>

            <label class="ppm-label" for="ppm-qty">{{ t('Produced now') }}</label>
            <MpInputGroup id="ppm-qty-group" is-full-width>
              <MpInput id="ppm-qty" v-model="qty" type="number" placeholder="0" is-full-width />
              <MpInputRightAddon has-background>{{ unit }}</MpInputRightAddon>
            </MpInputGroup>
            <p v-if="error" class="ppm-error">{{ error }}</p>

            <p class="ppm-note">
              {{ t('The balance stays open — this work order becomes partially produced, and the rest can be recorded against it later.') }}
            </p>
          </div>

          <footer class="ppm-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">
              {{ t('Cancel') }}
            </button>
            <button class="btn-enterprise btn-enterprise--primary ppm-confirm" type="button" @click="confirm">
              {{ t('Record production') }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ppm-enter-active, .ppm-leave-active { transition: opacity 200ms ease; }
.ppm-enter-from, .ppm-leave-to { opacity: 0; }
.ppm-enter-active .ppm-panel, .ppm-leave-active .ppm-panel { transition: transform 200ms ease, opacity 200ms ease; }
.ppm-enter-from .ppm-panel, .ppm-leave-to .ppm-panel { transform: scale(0.97); opacity: 0; }

.ppm-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(20, 23, 28, 0.45));
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-spacing-20, 80px) var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.ppm-panel {
  width: min(480px, 100%);
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
}
.ppm-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle, #f5f6f7);
  border-bottom: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px) 0 0;
}
.ppm-bar__title {
  margin: 0; font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ppm-close {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.ppm-close:hover { background: var(--mp-background-neutral-hovered); }

.ppm-body { padding: var(--mp-spacing-5); }
.ppm-facts {
  display: flex; gap: var(--mp-spacing-6);
  margin: 0 0 var(--mp-spacing-5);
}
.ppm-fact { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ppm-fact dt { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ppm-fact dd {
  margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  font-variant-numeric: tabular-nums;
}
.ppm-label {
  display: block; margin-bottom: var(--mp-spacing-1\.5);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ppm-error {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d);
}
.ppm-note {
  margin: var(--mp-spacing-4) 0 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

.ppm-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
.ppm-confirm { padding: var(--mp-spacing-2) var(--mp-spacing-5); border-radius: var(--mp-radii-full, 999px); cursor: pointer; }
</style>
