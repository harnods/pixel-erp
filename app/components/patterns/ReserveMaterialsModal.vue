<script setup lang="ts">
/**
 * Reserve materials — PRD UC-02 / D-5. One row per component showing Needed,
 * Available, To reserve and a readiness pill (Ready / Partial stock / Out of
 * stock); tickboxes plus select-all, and Reserve applies to the SELECTED
 * components only.
 *
 * Reservation is per-line all-or-nothing (C-3): a line whose destination stock
 * can't cover its whole outstanding need is not reservable here — it stays a
 * request for the stockist, which is why those rows can't be ticked.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpCheckbox, MpBadge,
} from '@mekari/pixel3'
import type { StockRequestLine, LineReadiness } from '~/data/stockRequests'
import { lineCovered, lineReadiness } from '~/data/stockRequests'

const props = defineProps<{
  id: string
  isOpen: boolean
  workOrderNumber: string
  lines: StockRequestLine[]
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'reserve', productIds: string[]): void
}>()

const { t } = useLocale()

const READINESS: Record<LineReadiness, { label: string; type: 'completed' | 'warning' | 'critical' | 'announcement' }> = {
  ready:          { label: 'Ready',         type: 'completed'    },
  partial:        { label: 'Partial stock', type: 'warning'      },
  'out-of-stock': { label: 'Out of stock',  type: 'critical'     },
  reserved:       { label: 'Reserved',      type: 'announcement' },
}

interface Row {
  productId: string
  product: string
  sku: string
  unit: string
  needed: number
  available: number
  /** outstanding need — what a reserve would take */
  toReserve: number
  readiness: LineReadiness
  /** only a fully-coverable outstanding line can be reserved (C-3) */
  selectable: boolean
}

const rows = computed<Row[]>(() => props.lines.map((l) => {
  const readiness = lineReadiness(l)
  return {
    productId: l.productId,
    product: l.product,
    sku: l.sku,
    unit: l.unit,
    needed: l.qty,
    available: l.destAvailable,
    toReserve: Math.max(0, l.qty - lineCovered(l)),
    readiness,
    selectable: readiness === 'ready',
  }
}))

const selected = ref<Set<string>>(new Set())
const selectableIds = computed(() => rows.value.filter(r => r.selectable).map(r => r.productId))
const allSelected = computed(() =>
  selectableIds.value.length > 0 && selectableIds.value.every(id => selected.value.has(id)))

// Every reservable line starts ticked — the common case is "reserve what you can".
watch(() => props.isOpen, (open) => {
  if (open) selected.value = new Set(selectableIds.value)
})

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  selected.value = next
}
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(selectableIds.value)
}

const selectedQty = computed(() =>
  rows.value.filter(r => selected.value.has(r.productId)).reduce((s, r) => s + r.toReserve, 0))

// The footer buttons are always enabled (form-actions rule) — clicking with
// nothing ticked explains inline rather than greying the button out.
const error = ref('')
watch(selected, () => { error.value = '' })

function submit() {
  if (selected.value.size === 0) {
    error.value = t('Select at least one component to reserve.')
    return
  }
  emit('reserve', [...selected.value])
}
</script>

<template>
  <MpModal
    :id="id" :is-open="isOpen" size="lg" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false"
    @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Reserve materials') }} — {{ workOrderNumber }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="rm-lead">
          {{ t('Stock is reserved per component in full — a component the warehouse can only cover partly stays a request for the stockist.') }}
        </p>

        <div class="rm-table-wrap">
          <table class="rm-table">
            <thead>
              <tr>
                <th class="rm-th rm-th--check">
                  <MpCheckbox :id="`${id}-all`" :is-checked="allSelected" @change="toggleAll" />
                </th>
                <th class="rm-th">{{ t('Product') }}</th>
                <th class="rm-th rm-th--num">{{ t('Needed') }}</th>
                <th class="rm-th rm-th--num">{{ t('Available') }}</th>
                <th class="rm-th rm-th--num">{{ t('To reserve') }}</th>
                <th class="rm-th">{{ t('Readiness') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.productId" class="rm-tr" :class="{ 'rm-tr--disabled': !r.selectable }">
                <td class="rm-td rm-td--check">
                  <MpCheckbox
                    :id="`${id}-${r.productId}`"
                    :is-checked="selected.has(r.productId)"
                    :is-disabled="!r.selectable"
                    @change="() => toggle(r.productId)"
                  />
                </td>
                <td class="rm-td">
                  <span class="rm-product">{{ r.product }}</span>
                  <span class="rm-sku">{{ r.sku }}</span>
                </td>
                <td class="rm-td rm-td--num">{{ r.needed }} {{ r.unit }}</td>
                <td class="rm-td rm-td--num">{{ r.available }} {{ r.unit }}</td>
                <td class="rm-td rm-td--num">{{ r.toReserve > 0 ? `${r.toReserve} ${r.unit}` : '—' }}</td>
                <td class="rm-td">
                  <MpBadge for="tableStatus" :type="READINESS[r.readiness].type" size="sm">
                    {{ t(READINESS[r.readiness].label) }}
                  </MpBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="error" class="rm-error">{{ error }}</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="rm-footer">
          <span class="rm-summary">
            {{ selected.size }} {{ selected.size === 1 ? t('component') : t('components') }} · {{ selectedQty }} {{ t('unit to reserve') }}
          </span>
          <div class="rm-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submit">{{ t('Reserve') }}</button>
          </div>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.rm-lead { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }

.rm-table-wrap { overflow-x: auto; }
.rm-table { width: 100%; border-collapse: collapse; }
.rm-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary, #3a4749); text-align: left; white-space: nowrap;
}
.rm-th--num { text-align: right; }
.rm-th--check, .rm-td--check { width: 40px; padding-right: 0; }
.rm-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-subtle, #e5e7e7);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #080d0e);
  vertical-align: middle; white-space: nowrap;
}
.rm-td--num { text-align: right; font-variant-numeric: tabular-nums; }
/* A line the warehouse can't cover in full isn't reservable — dim it, but keep it
   listed so the shortfall is visible. */
.rm-tr--disabled .rm-td { color: var(--mp-text-secondary, #3a4749); }
.rm-product { display: block; }
.rm-sku { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }

.rm-error {
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-critical, #a8352d);
}

.rm-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); width: 100%; }
.rm-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }
.rm-footer-btns { display: flex; gap: var(--mp-spacing-3); }
</style>
