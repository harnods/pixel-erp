<script setup lang="ts">
/**
 * "Complete work order" on a subcon order the vendor has delivered in full.
 *
 * Completing is not just a status flip. Components were sent to the vendor and
 * are still on the company's books until they are accounted for, so closing the
 * order has to answer one question per component: how much did the vendor
 * actually use? Whatever is left is still company stock sitting at a vendor —
 * so the modal returns it, by raising a warehouse transfer back to the warehouse
 * each component came from.
 *
 * Not MpModal: that component renders inline and invisible in this Pixel build
 * (see rule/modal-use-mpmodal, amended) — this uses the Teleport shell that works.
 */
import { MpButton, MpButtonGroup, MpIcon, MpInput } from '@mekari/pixel3'

export interface SubconComponentUsage {
  sku: string
  product: string
  unit: string
  /** Quantity transferred to the vendor across every transfer raised. */
  sent: number
  /** Warehouse it came from — where anything unused goes back to. */
  originWarehouseId?: string
  originWarehouseName?: string
}

const props = defineProps<{
  isOpen: boolean
  /** Finished good produced against the order. */
  producedQty: number
  producedUnit: string
  productName: string
  components: SubconComponentUsage[]
  /** The vendor location the unused stock is returned FROM. */
  subconWarehouseName?: string
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  /** Complete, returning these unused quantities (may be empty). */
  (e: 'complete', unused: { sku: string; qty: number }[]): void
}>()

const { t } = useLocale()

/** Unused quantity per SKU, keyed by sku. Defaults to zero — the common case is
 *  that the vendor consumed everything sent. */
const unused = ref<Record<string, string>>({})

watch(() => props.isOpen, (open) => {
  if (open) unused.value = Object.fromEntries(props.components.map(c => [c.sku, '0']))
}, { immediate: true })

function num(v: string | undefined) { return Math.max(0, Number(v) || 0) }
function usedFor(c: SubconComponentUsage) { return Math.max(0, c.sent - num(unused.value[c.sku])) }
function isOver(c: SubconComponentUsage) { return num(unused.value[c.sku]) > c.sent }

const hasError = computed(() => props.components.some(isOver))
const returnLines = computed(() =>
  props.components
    .map(c => ({ sku: c.sku, qty: num(unused.value[c.sku]) }))
    .filter(l => l.qty > 0),
)

function close() { emit('update:isOpen', false) }
function confirm() {
  if (hasError.value) return
  emit('complete', returnLines.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="csw">
      <!-- Overlay ignores clicks and there is no Esc listener: a modal closes only
           via its × (rule/modal-drawer-close-explicit-only). -->
      <div v-if="isOpen" class="csw-overlay">
        <div class="csw-panel" role="dialog" :aria-label="t('Complete work order')">
          <header class="csw-header">
            <h2 class="csw-title">{{ t('Complete work order') }}</h2>
            <button class="csw-close btn-enterprise" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="csw-body">
            <!-- What the order produced — the reason it can close at all. -->
            <div class="csw-produced">
              <span class="csw-produced__label">{{ t('Finished good produced') }}</span>
              <span class="csw-produced__value">
                {{ producedQty.toLocaleString('id-ID') }} {{ producedUnit }} · {{ productName }}
              </span>
            </div>

            <template v-if="components.length">
              <p class="csw-lead">
                {{ t('How much of each component did the vendor use? Anything left over is still your stock at') }}
                {{ subconWarehouseName || t('the vendor') }}, {{ t('so it is transferred back when you complete.') }}
              </p>

              <table class="csw-table">
                <thead>
                  <tr>
                    <th class="csw-th">{{ t('Component') }}</th>
                    <th class="csw-th csw-th--num">{{ t('Sent') }}</th>
                    <th class="csw-th csw-th--num">{{ t('Unused') }}</th>
                    <th class="csw-th csw-th--num">{{ t('Used') }}</th>
                    <th class="csw-th">{{ t('Returned to') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in components" :key="c.sku" class="csw-tr">
                    <td class="csw-td">
                      <span class="csw-td__name">{{ c.product }}</span>
                      <span class="csw-td__sku">{{ c.sku }}</span>
                    </td>
                    <td class="csw-td csw-td--num">{{ c.sent.toLocaleString('id-ID') }} {{ c.unit }}</td>
                    <td class="csw-td csw-td--input">
                      <MpInput
                        :id="`csw-unused-${c.sku}`"
                        v-model="unused[c.sku]"
                        type="number"
                        is-full-width
                        :is-invalid="isOver(c)"
                      />
                    </td>
                    <td class="csw-td csw-td--num">{{ usedFor(c).toLocaleString('id-ID') }} {{ c.unit }}</td>
                    <td class="csw-td csw-td--muted">
                      {{ num(unused[c.sku]) > 0 ? (c.originWarehouseName || t('Origin warehouse')) : '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>

              <p v-if="hasError" class="csw-error">
                {{ t('Unused cannot be more than what was sent.') }}
              </p>
              <p v-else-if="returnLines.length" class="csw-note">
                <MpIcon name="info" size="sm" />
                {{ t('Completing raises a warehouse transfer returning') }} {{ returnLines.length }}
                {{ t(returnLines.length === 1 ? 'component' : 'components') }}
                {{ t('to their origin warehouse.') }}
              </p>
            </template>

            <!-- Basic / Dropship never put company stock at the vendor. -->
            <p v-else class="csw-note">
              <MpIcon name="info" size="sm" />
              {{ t('No company components were sent to this vendor, so there is nothing to return.') }}
            </p>
          </div>

          <footer class="csw-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="confirm">{{ t('Complete work order') }}</MpButton>
            </MpButtonGroup>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.csw-enter-active, .csw-leave-active { transition: opacity 200ms ease; }
.csw-enter-from, .csw-leave-to { opacity: 0; }
.csw-enter-active .csw-panel, .csw-leave-active .csw-panel { transition: transform 200ms ease, opacity 200ms ease; }
.csw-enter-from .csw-panel, .csw-leave-to .csw-panel { transform: scale(0.97); opacity: 0; }

.csw-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(20, 23, 28, 0.45));
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-spacing-20, 80px) var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.csw-panel {
  width: min(760px, 100%);
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
  display: flex; flex-direction: column;
}
.csw-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.csw-title {
  margin: 0; font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.csw-close {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.csw-close:hover { background: var(--mp-background-neutral-hovered); }

.csw-body { padding: var(--mp-spacing-5); }

.csw-produced {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-success-subtle, #e8f4ef);
}
.csw-produced__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.csw-produced__value {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.csw-lead { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.csw-table { width: 100%; border-collapse: collapse; }
.csw-th {
  background: var(--mp-background-neutral-subtle);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  text-align: left; white-space: nowrap;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.csw-th--num { text-align: right; }
.csw-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: middle; white-space: nowrap;
}
.csw-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.csw-td--input { width: var(--mp-sizes-30, 120px); }
.csw-td--muted { color: var(--mp-text-secondary); }
.csw-td__name { display: block; }
.csw-td__sku { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.csw-tr:last-child .csw-td { border-bottom: none; }

.csw-error {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-critical, var(--mp-text-danger, #a8352d));
}
.csw-note {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2);
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

.csw-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
</style>
