<script setup lang="ts">
/**
 * CancelWorkOrderModal — Cancel work order, from the detail Actions menu or the
 * Work orders list kebab.
 *
 * Nothing at the vendor: a plain cancel confirmation (uxw Cancel confirmation
 * pattern). Raw material already at the vendor: the same confirmation, plus the
 * lines and a Return to warehouse per line — one draft warehouse transfer is
 * raised per chosen warehouse (`cancelWorkOrder`).
 *
 * The primary action is never disabled; a line with no warehouse is flagged
 * inline (rule/btn-no-disabled-validation). Closes only via × or Keep work order
 * (rule/modal-drawer-close-explicit-only).
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpModalCloseButton, MpButton, MpAutocomplete,
} from '@mekari/pixel3'
import { successToast } from '~/utils/toasts'
import type { WorkOrder } from '~/data/workOrders'
import { subconReturnLines, returnWarehouseOptions, cancelWorkOrder } from '~/data/subconCancel'

const props = defineProps<{ isOpen: boolean; workOrder?: WorkOrder }>()
const emit = defineEmits<{ close: []; canceled: [] }>()

const { t } = useLocale()

const lines = computed(() => (props.workOrder ? subconReturnLines(props.workOrder) : []))
const hasReturns = computed(() => lines.value.length > 0)
const warehouseOptions = returnWarehouseOptions()

/** Chosen return warehouse per SKU. */
const returnTo = ref<Record<string, string>>({})
const showErrors = ref(false)

watch(() => props.isOpen, (open) => {
  if (!open) return
  returnTo.value = Object.fromEntries(lines.value.map(l => [l.sku, l.defaultWarehouseId]))
  showErrors.value = false
})

const qtyFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

function onConfirm() {
  const w = props.workOrder
  if (!w) return
  if (lines.value.some(l => !returnTo.value[l.sku])) { showErrors.value = true; return }
  const raised = cancelWorkOrder(w.id, lines.value.map(l => ({ sku: l.sku, qty: l.qty, warehouseId: returnTo.value[l.sku]! })))
  if (raised.length === 1) successToast(`${t('Work order canceled')}. ${t('1 warehouse transfer created')}`)
  else if (raised.length > 1) successToast(`${t('Work order canceled')}. ${raised.length} ${t('warehouse transfers created')}`)
  else successToast(t('Work order canceled'))
  emit('canceled')
  emit('close')
}
</script>

<template>
  <MpModal
    id="cancel-work-order-modal"
    :is-open="isOpen"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    :is-keep-alive="false"
    :size="hasReturns ? 'lg' : 'md'"
    @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Cancel work order?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="cwo-desc">{{ t('This work order will be canceled and can no longer be started. You cannot undo this.') }}</p>

        <template v-if="hasReturns">
          <p class="cwo-desc cwo-desc--returns" data-devchange="subcon-cancel-return">
            {{ t('These raw materials are already at the vendor. Select the warehouse each one returns to. A warehouse transfer is created for each warehouse, awaiting approval.') }}
          </p>
          <div class="cwo-table-wrap">
            <table class="cwo-table">
              <colgroup><col /><col class="cwo-col-qty" /><col class="cwo-col-unit" /><col class="cwo-col-wh" /></colgroup>
              <thead>
                <tr>
                  <th class="cwo-th">{{ t('Product') }}</th>
                  <th class="cwo-th cwo-th--num">{{ t('Qty at vendor') }}</th>
                  <th class="cwo-th">{{ t('Unit') }}</th>
                  <th class="cwo-th">{{ t('Return to') }}<span class="cwo-req">*</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in lines" :key="l.sku">
                  <td class="cwo-td">
                    <span class="cwo-name">{{ l.name }}</span>
                    <span class="cwo-sku">{{ l.sku }}</span>
                  </td>
                  <td class="cwo-td cwo-td--num">{{ qtyFormat.format(l.qty) }}</td>
                  <td class="cwo-td">{{ l.unit }}</td>
                  <td class="cwo-td cwo-td--input">
                    <MpAutocomplete
                      :id="`cwo-wh-${l.sku}`"
                      v-model="returnTo[l.sku]"
                      :data="warehouseOptions"
                      label-prop="name" value-prop="id"
                      :placeholder="t('Select warehouse')"
                      :is-invalid="showErrors && !returnTo[l.sku]"
                      is-searchable use-portal is-full-width
                    />
                    <span v-if="showErrors && !returnTo[l.sku]" class="cwo-error">{{ t('You must select warehouse') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="emit('close')">{{ t('Keep work order') }}</MpButton>
        <MpButton variant="danger" class="btn-enterprise btn-enterprise--danger" data-devchange="subcon-cancel-wo" @click="onConfirm">
          {{ t('Cancel work order') }}
        </MpButton>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.cwo-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cwo-desc--returns { margin-top: var(--mp-spacing-3); }
.cwo-table-wrap {
  margin-top: var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.cwo-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.cwo-col-qty { width: var(--mp-sizes-32, 128px); }
.cwo-col-unit { width: var(--mp-sizes-20, 80px); }
.cwo-col-wh { width: var(--mp-sizes-64, 256px); }
.cwo-th {
  text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.cwo-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.cwo-req { color: var(--mp-text-danger, #c9372c); }
.cwo-td {
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
tbody tr:last-child .cwo-td { border-bottom: none; }
.cwo-td--num { text-align: right; padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4); font-variant-numeric: tabular-nums; }
.cwo-td--input { padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); }
.cwo-name { display: block; }
.cwo-sku { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cwo-error { display: block; margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c9372c); }
</style>
