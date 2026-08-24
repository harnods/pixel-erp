<script setup lang="ts">
/**
 * "Complete work order" confirmation — shown when the operator tries to
 * complete a work order that still has unconsumed raw material qty (Figma:
 * Work Order Details / Partial Consumption / Auto-consume Remaining). Lists
 * only the materials that still have qty remaining; "Auto-consume & complete"
 * consumes exactly that remaining qty for each before closing the order out.
 *
 * A custom Teleport overlay, not MpModal — MpModal renders with no structural
 * CSS in this Pixel3 build (see ConfirmModal.vue for the same root cause/fix).
 */
import { ref } from 'vue'
import { MpIcon } from '@mekari/pixel3'

export interface CompleteWorkOrderRow {
  productId: string
  product: string
  sku: string
  needed: number
  consumed: number
  remaining: number
  unit: string
  /** "View batch" / "View serial number" — only set for tracked materials. */
  trackingLabel?: string
  /** The work order's reservation for this product, minus whatever's already
   *  been consumed — i.e. what's still reserved but sitting unconsumed. */
  reservedBatch?: { batchNo: string; qty: number }[]
  reservedSerial?: string[]
}

defineProps<{
  isOpen: boolean
  rows: CompleteWorkOrderRow[]
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'adjust'): void
  (e: 'complete'): void
}>()

function close() { emit('update:isOpen', false) }
function adjust() { emit('adjust'); close() }
function complete() { emit('complete'); close() }

// "View batch" / "View serial number" expands an inline row showing exactly
// which reserved units are still sitting unconsumed for that material.
const expanded = ref<Set<string>>(new Set())
function toggleExpand(productId: string) {
  const next = new Set(expanded.value)
  if (next.has(productId)) next.delete(productId)
  else next.add(productId)
  expanded.value = next
}
</script>

<template>
  <Transition name="cwo">
    <div v-if="isOpen" class="cwo-overlay" @click.self="close">
      <div class="cwo-panel" role="alertdialog" aria-modal="true" aria-label="Complete work order">
        <header class="cwo-header">
          <h2 class="cwo-title">Complete work order</h2>
          <button class="cwo-close" type="button" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <p class="cwo-desc">Review remaining components and choose how to close this work order</p>

        <div class="cwo-table-scroll">
          <table class="cwo-table">
            <thead>
              <tr>
                <th class="cwo-th">Product</th>
                <th class="cwo-th">SKU</th>
                <th class="cwo-th cwo-th--num">Needed qty</th>
                <th class="cwo-th cwo-th--num">Consumed qty</th>
                <th class="cwo-th cwo-th--num">Remaining qty</th>
                <th class="cwo-th">Unit</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="r in rows" :key="r.productId">
                <tr class="cwo-tr">
                  <td class="cwo-td">{{ r.product }}</td>
                  <td class="cwo-td">{{ r.sku }}</td>
                  <td class="cwo-td cwo-td--num">{{ r.needed }}</td>
                  <td class="cwo-td cwo-td--num">
                    <span>{{ r.consumed }}</span>
                    <a v-if="r.trackingLabel" class="cwo-tracking" @click.prevent="toggleExpand(r.productId)">
                      {{ expanded.has(r.productId) ? 'Hide' : r.trackingLabel }}
                    </a>
                  </td>
                  <td class="cwo-td cwo-td--num">{{ r.remaining }}</td>
                  <td class="cwo-td">{{ r.unit }}</td>
                </tr>
                <tr v-if="expanded.has(r.productId)" class="cwo-tr cwo-tr--detail">
                  <td class="cwo-td cwo-td--detail" colspan="6">
                    <p class="cwo-reserved-heading">Reserved, not yet consumed</p>
                    <div v-if="r.reservedSerial?.length" class="cwo-reserved-list">
                      <span v-for="s in r.reservedSerial" :key="s" class="cwo-reserved-chip">{{ s }}</span>
                    </div>
                    <div v-else-if="r.reservedBatch?.length" class="cwo-reserved-list">
                      <span v-for="b in r.reservedBatch" :key="b.batchNo" class="cwo-reserved-chip">{{ b.batchNo }} · {{ b.qty }} {{ r.unit }}</span>
                    </div>
                    <p v-else class="cwo-reserved-empty">No reservation on file for this material.</p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <div class="cwo-footer">
          <button class="cwo-cancel" type="button" @click="close">Cancel</button>
          <button class="cwo-btn cwo-btn--secondary" type="button" @click="adjust">Adjust work order</button>
          <button class="cwo-btn cwo-btn--primary" type="button" @click="complete">Auto-consume &amp; complete</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cwo-enter-active, .cwo-leave-active { transition: opacity 200ms ease; }
.cwo-enter-from, .cwo-leave-to { opacity: 0; }
.cwo-enter-active .cwo-panel, .cwo-leave-active .cwo-panel { transition: transform 200ms ease, opacity 200ms ease; }
.cwo-enter-from .cwo-panel, .cwo-leave-to .cwo-panel { transform: scale(0.97); opacity: 0; }

.cwo-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: rgba(8, 13, 14, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 80px var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.cwo-panel {
  width: min(880px, 100%);
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -2px rgba(0,0,0,0.1);
  display: flex; flex-direction: column;
}

.cwo-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.cwo-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cwo-close {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.cwo-close:hover { background: var(--mp-background-neutral-hovered); }

.cwo-desc { margin: 0; padding: var(--mp-spacing-4) var(--mp-spacing-5) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.cwo-table-scroll { overflow-x: auto; padding: var(--mp-spacing-3) var(--mp-spacing-5) var(--mp-spacing-4); }
.cwo-table { width: 100%; border-collapse: collapse; }
.cwo-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-top: 1px solid var(--mp-border-default); border-bottom: 1px solid var(--mp-border-default);
  text-align: left; white-space: nowrap;
  font-size: var(--mp-font-sizes-xs, 11px); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.02em; color: var(--mp-text-secondary);
}
.cwo-th--num { text-align: right; }
.cwo-td {
  padding: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top;
}
.cwo-tr:nth-child(even) .cwo-td { background: var(--mp-background-neutral-subtle); }
.cwo-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.cwo-tracking { display: block; margin-top: 2px; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.cwo-tracking:hover { text-decoration: underline; text-underline-offset: 2px; }
.cwo-tr--detail .cwo-td { background: var(--mp-background-neutral-subtle); }
.cwo-td--detail { padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); }
.cwo-reserved-heading { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cwo-reserved-list { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.cwo-reserved-chip {
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-sm); font-variant-numeric: tabular-nums; color: var(--mp-text-default);
}
.cwo-reserved-empty { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cwo-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
.cwo-cancel {
  border: none; background: none; padding: 0; margin-right: auto;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); cursor: pointer;
}
.cwo-cancel:hover { text-decoration: underline; text-underline-offset: 2px; }
.cwo-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-5);
  border-radius: var(--mp-radii-full, 999px); border: 1px solid transparent;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium); cursor: pointer;
}
.cwo-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.cwo-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.cwo-btn--primary { background: var(--mp-colors-emerald-700, #029861); border-color: var(--mp-colors-emerald-700, #029861); color: var(--mp-text-inverse); }
.cwo-btn--primary:hover { background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a); }
</style>
