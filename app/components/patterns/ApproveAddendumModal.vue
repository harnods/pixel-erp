<script setup lang="ts">
/**
 * ApproveAddendumModal — the Finance/Controller gate on a contract addendum.
 *
 * Approving is a separate act from raising: it moves the contract value and, in
 * some cases, trues up revenue already recognized. The dialog therefore states the
 * before/after, the stated reason, and the accounting effect BEFORE the click —
 * it cannot be undone from here, only reversed by a further addendum.
 *
 * A custom Teleport overlay, matching ConfirmModal (MpModal renders with no
 * structural CSS in this Pixel3 build).
 */
import { formatIdr } from '~/data/projectAccounting'

const props = defineProps<{
  isOpen: boolean
  oldValue: number
  newValue: number
  reason: string
  /** Plain-language description of what approving does to recognized revenue. */
  effect: string
  raisedBy: string
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm'): void
}>()

const { t } = useLocale()

const delta = computed(() => props.newValue - props.oldValue)
const deltaLabel = computed(() => `${delta.value >= 0 ? '+' : '−'}${formatIdr(Math.abs(delta.value))}`)

function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm'); close() }
</script>

<template>
  <Transition name="aam">
    <div v-if="isOpen" class="aam-overlay" @click.self="close">
      <div class="aam-panel" role="alertdialog" aria-modal="true" :aria-label="t('Approve this addendum?')">
        <p class="aam-title">{{ t('Approve this addendum?') }}</p>
        <p class="aam-desc">
          {{ t('Approving changes the contract value on this engagement. It cannot be undone from here — a further addendum would be needed to reverse it.') }}
        </p>

        <div class="aam-box">
          <div class="aam-row">
            <span class="aam-key">{{ t('Current contract value') }}</span>
            <b class="aam-num">{{ formatIdr(oldValue) }}</b>
          </div>
          <div class="aam-row">
            <span class="aam-key">{{ t('New contract value') }}</span>
            <b class="aam-num">{{ formatIdr(newValue) }}</b>
          </div>
          <div class="aam-row aam-row--total">
            <span class="aam-key">{{ t('Change') }}</span>
            <b class="aam-num aam-num--delta">{{ deltaLabel }}</b>
          </div>
        </div>

        <p class="aam-reason"><b>{{ t('Reason') }}:</b> {{ reason }}</p>
        <p class="aam-effect">{{ effect }}</p>
        <p class="aam-approver">
          {{ t('You are approving as Anggun Prakoso · Finance Controller. This is a separate act from raising the addendum —') }}
          {{ raisedBy }} {{ t('raised it.') }}
        </p>

        <div class="aam-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="confirm">{{ t('Approve addendum') }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.aam-enter-active, .aam-leave-active { transition: opacity 200ms ease; }
.aam-enter-from, .aam-leave-to { opacity: 0; }
.aam-enter-active .aam-panel, .aam-leave-active .aam-panel { transition: transform 200ms ease, opacity 200ms ease; }
.aam-enter-from .aam-panel, .aam-leave-to .aam-panel { transform: scale(0.96); opacity: 0; }

.aam-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay);
  display: flex; align-items: center; justify-content: center; padding: var(--mp-spacing-6);
}
/* A modal is a genuinely floating overlay, so it keeps its elevation shadow. */
.aam-panel {
  width: min(520px, 100%); max-height: 100%; overflow-y: auto;
  background: var(--mp-background-stage, #fff); border-radius: var(--mp-radii-lg, 12px);
  padding: var(--mp-spacing-5);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -2px rgba(0,0,0,0.1); /* pixel-police-allow-shadow */
}
.aam-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.aam-desc { margin: var(--mp-spacing-2) 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-lg, 20px); }

.aam-box { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.aam-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-1) 0; }
.aam-row--total { border-top: 1px solid var(--mp-border-subtle); margin-top: var(--mp-spacing-1); padding-top: var(--mp-spacing-2); }
.aam-key { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.aam-num { font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.aam-num--delta { color: var(--mp-text-link); }

.aam-reason { margin: var(--mp-spacing-4) 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.aam-effect {
  margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
  background: var(--mp-background-warning-subtle, #fdf9c4); border-radius: var(--mp-radii-md, 6px);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); line-height: var(--mp-line-heights-lg, 20px);
}
.aam-approver { margin: 0; font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-secondary); }
.aam-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-5); }
</style>
