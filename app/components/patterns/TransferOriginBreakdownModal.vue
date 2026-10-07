<script setup lang="ts">
/**
 * What a transfer is about to move, grouped by the warehouse it comes out of.
 *
 * Shown before the transfer form opens when a work order's components sit in more
 * than one warehouse. A warehouse transfer has exactly ONE source, so "send the
 * components to the vendor" is not one document in that case — it is one per
 * origin. Opening the form straight away would silently draw every line from
 * whichever warehouse happened to come first, and the discrepancy would only
 * surface at picking.
 *
 * So the split is stated before the form opens, and each origin is raised on its
 * own. Remaining is what still has to go: the planned quantity less whatever
 * earlier transfers already sent, which is also exactly what the form is
 * prefilled with.
 *
 * Not MpModal (no working CSS in this Pixel build); same Teleport shell as the
 * other subcon dialogs, and it closes only via × (rule/modal-drawer-close-explicit-only).
 */
import { MpIcon } from '@mekari/pixel3'

export interface TransferOriginLine {
  productId: string
  product: string
  sku: string
  unit: string
  /** What this work order plans to consume. */
  planned: number
  /** What still has to be transferred — planned less already sent. */
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

/** A group with nothing outstanding has already been transferred in full. */
function outstanding(g: TransferOriginGroup) {
  return g.lines.reduce((sum, l) => sum + l.remaining, 0)
}

const totalOutstanding = computed(() =>
  props.groups.reduce((sum, g) => sum + outstanding(g), 0))
</script>

<template>
  <Teleport to="body">
    <Transition name="tob">
      <div v-if="isOpen" class="tob-overlay">
        <div class="tob-panel" role="dialog" :aria-label="t('Components by origin warehouse')">
          <header class="tob-bar">
            <h2 class="tob-bar__title">{{ t('Components by origin warehouse') }}</h2>
            <button class="tob-close btn-enterprise" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="tob-body">
            <p class="tob-intro">
              {{ t('These components are stored in more than one warehouse. A transfer moves stock out of a single warehouse, so raise one per origin.') }}
              <template v-if="destinationName">
                {{ t('All of them are headed to') }} <strong>{{ destinationName }}</strong>.
              </template>
            </p>

            <section v-for="group in groups" :key="group.warehouseId" class="tob-group">
              <div class="tob-group__head">
                <h3 class="tob-group__title">{{ group.warehouseName }}</h3>
                <!-- Always rendered, never disabled: a group with nothing left to
                     send says so in place of the action, rather than greying it
                     out (rule/btn-no-disabled-validation). -->
                <button
                  v-if="outstanding(group) > 0"
                  class="tob-action btn-enterprise btn-enterprise--secondary"
                  type="button"
                  @click="emit('select', group.warehouseId)"
                >
                  {{ t('Create transfer') }}
                </button>
                <span v-else class="tob-done">{{ t('Fully transferred') }}</span>
              </div>

              <div class="tob-table-scroll">
                <table class="tob-table">
                  <thead>
                    <tr>
                      <th class="tob-th">{{ t('Product') }}</th>
                      <th class="tob-th">{{ t('SKU') }}</th>
                      <th class="tob-th tob-th--num">{{ t('Planned qty') }}</th>
                      <th class="tob-th tob-th--num">{{ t('Remaining qty') }}</th>
                      <th class="tob-th">{{ t('Unit') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="line in group.lines" :key="line.productId" class="tob-tr">
                      <td class="tob-td">{{ line.product }}</td>
                      <td class="tob-td tob-td--muted">{{ line.sku }}</td>
                      <td class="tob-td tob-td--num">{{ line.planned }}</td>
                      <td class="tob-td tob-td--num" :class="{ 'tob-td--zero': line.remaining === 0 }">
                        {{ line.remaining }}
                      </td>
                      <td class="tob-td tob-td--muted">{{ line.unit }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <p v-if="totalOutstanding === 0" class="tob-empty">
              {{ t('Every component has already been transferred.') }}
            </p>
          </div>

          <footer class="tob-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">
              {{ t('Cancel') }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tob-enter-active, .tob-leave-active { transition: opacity 200ms ease; }
.tob-enter-from, .tob-leave-to { opacity: 0; }
.tob-enter-active .tob-panel, .tob-leave-active .tob-panel { transition: transform 200ms ease, opacity 200ms ease; }
.tob-enter-from .tob-panel, .tob-leave-to .tob-panel { transform: scale(0.97); opacity: 0; }

.tob-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(20, 23, 28, 0.45));
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-spacing-20, 80px) var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.tob-panel {
  width: min(760px, 100%);
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
}
.tob-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-5);
  background: var(--mp-background-neutral-subtle, #f5f6f7);
  border-bottom: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px) 0 0;
}
.tob-bar__title {
  margin: 0; font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.tob-close {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.tob-close:hover { background: var(--mp-background-neutral-hovered); }

.tob-body { padding: var(--mp-spacing-5); }
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
.tob-action { padding: var(--mp-spacing-1\.5) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); cursor: pointer; }
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

.tob-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
</style>
