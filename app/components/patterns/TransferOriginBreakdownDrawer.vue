<script setup lang="ts">
/**
 * What a transfer is about to move, grouped by the warehouse it comes out of.
 *
 * Shown when a work order's components sit in more than one warehouse. A
 * warehouse transfer has exactly ONE source, so "send the components to the
 * vendor" is one document per origin — and choosing an origin here raises that
 * one directly into the warehouse transfer list.
 *
 * A drawer rather than a modal: the work order behind it is the context the
 * reader is checking these figures against. It closes only via ×
 * (rule/modal-drawer-close-explicit-only); there is no Cancel, because there is
 * nothing in it to cancel — each Create transfer acts on its own.
 *
 * Per line: Planned is what the order needs, Transferred is what has really
 * left the origin (transfers approved onward), Remaining is what still needs a
 * transfer raised — planned less everything already on one, approved or not.
 */
import { MpButton } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'

export interface TransferOriginLine {
  productId: string
  product: string
  sku: string
  unit: string
  /** What this work order plans to consume. */
  planned: number
  /** What has actually left the origin — transfers approved onward. */
  transferred: number
  /** What still needs a transfer raised — planned less what is already on one. */
  remaining: number
}

export interface TransferOriginGroup {
  warehouseId: string
  warehouseName: string
  lines: TransferOriginLine[]
}

const props = defineProps<{
  isOpen: boolean
  groups: TransferOriginGroup[]
  destinationName?: string
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'select', warehouseId: string): void
}>()

const { t } = useLocale()

function close() { emit('update:isOpen', false) }

/** What still needs a transfer raised from this warehouse. */
function outstanding(g: TransferOriginGroup) {
  return g.lines.reduce((sum, l) => sum + l.remaining, 0)
}
/** Everything raised, but some of it is still waiting for approval. */
function awaitingApproval(g: TransferOriginGroup) {
  return outstanding(g) === 0 && g.lines.some(l => l.transferred < l.planned)
}

const allTransferred = computed(() =>
  props.groups.every(g => g.lines.every(l => l.transferred >= l.planned)))
</script>

<template>
  <ErpDrawer
    :is-open="isOpen" :title="t('Components by origin warehouse')" width="760px"
    @close="close"
  >
    <template #body>
      <p class="tob-intro" data-devchange="subcon-origin-drawer">
        {{ t('These components are stored in more than one warehouse. A transfer moves stock out of a single warehouse, so raise one per origin.') }}
        <template v-if="destinationName">
          {{ t('All of them are headed to') }} <strong>{{ destinationName }}</strong>.
        </template>
      </p>

      <section v-for="group in groups" :key="group.warehouseId" class="tob-group">
        <div class="tob-group__head">
          <h3 class="tob-group__title">{{ group.warehouseName }}</h3>
          <!-- Always a statement in place of the action when there is nothing
               left to raise, rather than a greyed button
               (rule/btn-no-disabled-validation). -->
          <MpButton
            v-if="outstanding(group) > 0" variant="secondary" is-rounded
            @click="emit('select', group.warehouseId)"
          >{{ t('Create warehouse transfer') }}</MpButton>
          <span v-else-if="awaitingApproval(group)" class="tob-pending">{{ t('Awaiting approval') }}</span>
          <span v-else class="tob-done">{{ t('Fully transferred') }}</span>
        </div>

        <div class="tob-table-scroll">
          <table class="tob-table">
            <thead>
              <tr>
                <th class="tob-th">{{ t('Product') }}</th>
                <th class="tob-th">{{ t('SKU') }}</th>
                <th class="tob-th tob-th--num">{{ t('Planned qty') }}</th>
                <th class="tob-th tob-th--num" data-devchange="subcon-origin-transferred">{{ t('Transferred qty') }}</th>
                <th class="tob-th tob-th--num">{{ t('Remaining qty') }}</th>
                <th class="tob-th">{{ t('Unit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in group.lines" :key="line.productId" class="tob-tr">
                <td class="tob-td">{{ line.product }}</td>
                <td class="tob-td tob-td--muted">{{ line.sku }}</td>
                <td class="tob-td tob-td--num">{{ line.planned }}</td>
                <td class="tob-td tob-td--num" :class="{ 'tob-td--zero': line.transferred === 0 }">
                  {{ line.transferred }}
                </td>
                <td class="tob-td tob-td--num" :class="{ 'tob-td--zero': line.remaining === 0 }">
                  {{ line.remaining }}
                </td>
                <td class="tob-td tob-td--muted">{{ line.unit }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p v-if="allTransferred" class="tob-empty">
        {{ t('Every component has already been transferred.') }}
      </p>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.tob-intro {
  margin: 0 0 var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.tob-group + .tob-group { margin-top: var(--mp-spacing-6); }
.tob-group__head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-2);
}
.tob-group__title {
  margin: 0; font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.tob-done { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-success, #18794e); }
.tob-table-scroll {
  overflow-x: auto;
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.tob-table { width: 100%; border-collapse: collapse; }
.tob-th {
  text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.tob-th--num { text-align: right; padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4); }
.tob-td {
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.tob-tr:last-child .tob-td { border-bottom: none; }
.tob-td--num {
  text-align: right; font-variant-numeric: tabular-nums;
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4);
}
.tob-td--muted { color: var(--mp-text-secondary); }
.tob-td--zero { color: var(--mp-text-secondary); }
.tob-empty {
  margin: var(--mp-spacing-5) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.tob-pending { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
