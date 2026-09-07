<script setup lang="ts">
/**
 * "Mark as completed" confirmation for a Sales Order that is Open or Partially
 * processed. Lists every line with its processed / unprocessed qty and warns
 * that completing closes the transaction permanently. Only reachable for
 * 'open' / 'partially processed' orders — the trigger is hidden for
 * 'closed' / 'voided' (see SalesOrdersPage row kebab + SalesOrderDetailsPage
 * Actions dropdown).
 *
 * Built on Pixel `MpModal` (same chrome as ConfirmModal); size `lg` matches the
 * Figma modal width (784px). Figma: Sales / Sales Orders / Modal / Mark As
 * Completed (node 4502-37806).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButton, MpButtonGroup,
} from '@mekari/pixel3'
import type { SalesOrderCompletionRow } from '~/data/salesOrders'

const props = defineProps<{
  isOpen: boolean
  orderNumber: number | string
  rows: SalesOrderCompletionRow[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm'): void
}>()

const { t } = useLocale()

const unprocessedCount = computed(() => props.rows.filter(r => r.unprocessedQty > 0).length)

function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm'); close() }
</script>

<template>
  <MpModal
    id="mark-so-completed-modal"
    :is-open="isOpen"
    size="lg"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="close"
  >
    <MpModalContent class="mark-so-completed-content">
      <MpModalHeader>
        {{ t('Mark as completed') }}
        <MpModalCloseButton />
      </MpModalHeader>

      <MpModalBody>
        <p class="msc-lead">
          <strong>{{ t('This order has') }} {{ unprocessedCount }}
            {{ unprocessedCount === 1 ? t('unprocessed product.') : t('unprocessed products.') }}</strong>
          {{ t('Completing it will close the transaction permanently. Any remaining quantities will not be invoiced or shipped.') }}
        </p>

        <div class="msc-table-section">
          <div class="msc-table-scroll">
            <table class="msc-table">
              <thead>
                <tr>
                  <th class="msc-th">{{ t('Product') }}</th>
                  <th class="msc-th msc-th--num">{{ t('Qty') }}</th>
                  <th class="msc-th msc-th--num">{{ t('Processed qty') }}</th>
                  <th class="msc-th msc-th--num">{{ t('Unprocessed qty') }}</th>
                  <th class="msc-th">{{ t('Unit') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, i) in rows" :key="`${r.sku}-${i}`" class="msc-tr">
                  <td class="msc-td">
                    <span class="msc-product">{{ r.product }}</span>
                    <span class="msc-sku">{{ t('SKU') }}: {{ r.sku }}</span>
                  </td>
                  <td class="msc-td msc-td--num">{{ r.qty }}</td>
                  <td class="msc-td msc-td--num">{{ r.processedQty }}</td>
                  <td class="msc-td msc-td--num">{{ r.unprocessedQty }}</td>
                  <td class="msc-td">{{ r.unit }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </MpModalBody>

      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">{{ t('Mark as completed') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.msc-lead {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
}
.msc-lead strong { font-weight: var(--mp-font-weights-semi-bold); }

/* Bordered, internally-scrolling panel — mirrors CompleteWorkOrderModal's table. */
.msc-table-section {
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg);
  overflow: hidden;
}
.msc-table-scroll { max-height: 320px; overflow-y: auto; overflow-x: auto; }
.msc-table { width: 100%; border-collapse: collapse; }
.msc-th {
  position: sticky; top: 0; z-index: 1;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  text-align: left; white-space: nowrap;
  font-size: var(--mp-font-sizes-xs, 11px); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.02em; color: var(--mp-text-secondary);
}
.msc-th--num { text-align: right; }
.msc-td {
  padding: var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top;
}
.msc-tr:last-child .msc-td { border-bottom: none; }
.msc-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.msc-product { display: block; color: var(--mp-text-default); }
.msc-sku { display: block; margin-top: 2px; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
