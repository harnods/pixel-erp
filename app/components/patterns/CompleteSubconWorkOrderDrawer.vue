<script setup lang="ts">
/**
 * "Complete work order" on a subcon order (R6).
 *
 * Completing is not just a status flip. Components were sent to the vendor and
 * are still on the company's books until they are accounted for, so closing the
 * order answers one question per component: how much did the vendor actually
 * use? Completion then empties the vendor's warehouse of this run: the used part
 * is issued into the run, and the unused part comes back as a stock IN at the
 * output warehouse. Unused can never exceed what is still at the vendor —
 * material already issued into a partial record is spent.
 *
 * A drawer, not a modal (2026-10-20): completion is read against the work order
 * behind it — produced qty, components, warehouses — so the page stays in view.
 * Built on the shared ErpDrawer shell (rule/drawer-custom-shell: Teleport panel,
 * filled header, no shadow); closes only via × or Cancel
 * (rule/modal-drawer-close-explicit-only).
 */
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'

export interface SubconComponentUsage {
  sku: string
  product: string
  unit: string
  /** Quantity transferred to the vendor across every transfer raised. */
  sent: number
  /** Already issued out of the vendor's warehouse by earlier partial records. */
  issued?: number
  /** Warehouse it came from — where anything unused goes back to. */
  originWarehouseId?: string
  originWarehouseName?: string
}

const props = defineProps<{
  isOpen: boolean
  /** Finished good produced against the order. */
  producedQty: number
  /** What the order set out to produce. */
  plannedQty: number
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
/** What the run still owes, and so what completing will produce for it. */
const shortfall = computed(() => Math.max(0, props.plannedQty - props.producedQty))

const unused = ref<Record<string, string>>({})

watch(() => props.isOpen, (open) => {
  if (open) unused.value = Object.fromEntries(props.components.map(c => [c.sku, '0']))
}, { immediate: true })

function num(v: string | undefined) { return Math.max(0, Number(v) || 0) }
function usedFor(c: SubconComponentUsage) { return Math.max(0, c.sent - num(unused.value[c.sku])) }
/** What the vendor still holds — material already issued into a record is spent. */
function atVendor(c: SubconComponentUsage) { return Math.max(0, c.sent - (c.issued ?? 0)) }
function isOver(c: SubconComponentUsage) { return num(unused.value[c.sku]) > atVendor(c) }

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
  <ErpDrawer
    :is-open="isOpen"
    :title="t('Complete work order')"
    width="760px"
    @close="close"
  >
    <template #body>
      <div class="csw-body" data-devchange="subcon-complete-drawer">
        <!-- What the order produced — the reason it can close at all. -->
        <div class="csw-produced">
          <span class="csw-produced__label">{{ t('Finished good produced') }}</span>
          <span class="csw-produced__value">
            {{ producedQty.toLocaleString('id-ID') }}/{{ plannedQty.toLocaleString('id-ID') }}
            {{ producedUnit }} · {{ productName }}
          </span>
          <!-- Said before it happens, not after: completing closes the gap,
               and the figure above is what it closes. -->
          <span v-if="shortfall > 0" class="csw-produced__note">
            {{ t('Completing produces the remaining') }}
            {{ shortfall.toLocaleString('id-ID') }} {{ producedUnit }}
            {{ t('and records the remaining subcon cost.') }}
          </span>
        </div>

        <template v-if="components.length">
          <p class="csw-lead">
            {{ t('How much of each component did the vendor use? Anything left over is still your stock at') }}
            {{ subconWarehouseName || t('the vendor') }}, {{ t('so it comes back to the output warehouse when you complete.') }}
          </p>

          <table class="csw-table">
            <thead>
              <tr>
                <th class="csw-th">{{ t('Component') }}</th>
                <th class="csw-th csw-th--num">{{ t('Sent qty') }}</th>
                <!-- The real ceiling on unused: material a partial record already
                     issued is spent, so only this much can come back. -->
                <th class="csw-th csw-th--num" data-devchange="subcon-complete-at-vendor">{{ t('Qty at vendor') }}</th>
                <th class="csw-th csw-th--num">{{ t('Unused qty') }}</th>
                <th class="csw-th csw-th--num">{{ t('Used qty') }}</th>
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
                <td class="csw-td csw-td--num">{{ atVendor(c).toLocaleString('id-ID') }} {{ c.unit }}</td>
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
                  {{ num(unused[c.sku]) > 0 ? t('Output warehouse') : '—' }}
                </td>
              </tr>
            </tbody>
          </table>

          <p v-if="hasError" class="csw-error">
            {{ t('Unused qty cannot be more than qty at vendor') }}
          </p>
          <p v-else-if="returnLines.length" class="csw-note">
            <MpIcon name="info" size="sm" />
            {{ t('Completing returns') }} {{ returnLines.length }}
            {{ t(returnLines.length === 1 ? 'component' : 'components') }}
            {{ t('to the output warehouse as stock in.') }}
          </p>
        </template>

        <!-- Basic / Dropship never put company stock at the vendor. -->
        <p v-else class="csw-note">
          <MpIcon name="info" size="sm" />
          {{ t('No company components were sent to this vendor, so there is nothing to return.') }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="csw-footer erp-action-footer">
        <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="confirm">{{ t('Complete work order') }}</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>



.csw-produced {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-success-subtle, #e8f4ef);
}
.csw-produced__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.csw-produced__note {
  display: block; margin-top: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
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

.csw-body { display: flex; flex-direction: column; }
/* ErpDrawer's footer spreads its children; this row takes the width so the
   buttons sit right (erp-action-footer). */
.csw-footer { width: 100%; }
</style>
