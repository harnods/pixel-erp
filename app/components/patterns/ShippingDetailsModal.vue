<script setup lang="ts">
/**
 * Shipping-details modal — asks for the courier + tracking number of the shipment
 * being labelled when a non-marketplace order has no courier yet. One shipment =
 * one parcel = one tracking number; an order shipped partially over several cycles
 * fills this in once per cycle (each partial has its own delivery, label and AWB).
 * Opened from the packing print flow (usePrintShippingLabel); on "Save & print" it
 * hands the details back so the caller persists them and prints.
 *
 * Mirrors existing patterns — the searchable courier picker of HandoverToCourierPage
 * and the modal shell of the inbound Edit-tracking modal (ReceiptIndexPage) — no new
 * component or behaviour invented.
 */
import { reactive, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpInput, MpPopover, MpPopoverTrigger,
  MpPopoverContent, MpPopoverList, MpPopoverListItem, MpIcon, css,
} from '@mekari/pixel3'
import type { OutgoingOrder } from '~/data/outgoing'
import { wmsShippingForOrder } from '~/data/deliveryTasks'
import { couriers } from '~/data/couriers'

const props = defineProps<{ isOpen: boolean; orders: OutgoingOrder[] }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', details: Record<string, { courier: string; trackingNo: string }>): void
}>()

const { t } = useLocale()

interface Form { courier: string; search: string; active: boolean; trackingNo: string; error: boolean }
const forms = reactive<Record<string, Form>>({})

// (Re)seed a form per order whenever the modal opens — prefill any courier/tracking
// already on file (edit case); otherwise start blank.
watch(
  () => [props.isOpen, props.orders] as const,
  () => {
    if (!props.isOpen) return
    for (const o of props.orders) {
      const ship = wmsShippingForOrder(o.id)
      forms[o.id] = {
        courier: ship?.courier ?? '',
        search: '',
        active: false,
        trackingNo: ship?.trackingNo ?? '',
        error: false,
      }
    }
  },
  { immediate: true, deep: true },
)

function couriersFiltered(orderId: string) {
  const q = (forms[orderId]?.search ?? '').trim().toLowerCase()
  return couriers.filter((c) => !q || c.name.toLowerCase().includes(q))
}
function openPicker(orderId: string) {
  const f = forms[orderId]; if (f) { f.active = true; f.search = '' }
}
function selectCourier(orderId: string, name: string) {
  const f = forms[orderId]; if (!f) return
  f.courier = name; f.active = false; f.error = false
}

function save() {
  let valid = true
  for (const o of props.orders) {
    const f = forms[o.id]
    if (!f?.courier.trim()) { if (f) f.error = true; valid = false }
  }
  if (!valid) return
  const out: Record<string, { courier: string; trackingNo: string }> = {}
  for (const o of props.orders) {
    const f = forms[o.id]!
    out[o.id] = { courier: f.courier.trim(), trackingNo: f.trackingNo.trim() }
  }
  emit('submit', out)
}
</script>

<template>
  <MpModal
    id="shipping-details-modal" :is-open="isOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Shipping details') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="sd-lead">{{ t('This order has no courier yet. Add it to print the shipping label.') }}</p>

        <div v-for="o in orders" :key="o.id" class="sd-group">
          <p v-if="orders.length > 1" class="sd-order">{{ o.number }}<span v-if="o.customer"> · {{ o.customer }}</span></p>

          <!-- Courier (required) -->
          <label class="sd-label">{{ t('Courier') }}</label>
          <MpPopover
            :id="`sd-courier-${o.id}`"
            placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select
          >
            <MpPopoverTrigger>
              <div class="sd-courier-trigger" :class="{ 'sd-courier-trigger--error': forms[o.id]?.error }">
                <input
                  type="text" class="sd-courier-input" autocomplete="off"
                  :value="forms[o.id]?.active ? forms[o.id]?.search : (forms[o.id]?.courier ?? '')"
                  :placeholder="t('Select courier')"
                  @focus="openPicker(o.id)"
                  @input="forms[o.id] && (forms[o.id].active = true, forms[o.id].search = ($event.target as HTMLInputElement).value)"
                />
                <MpIcon name="chevron-down" size="sm" />
              </div>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '320px', maxHeight: '300px', overflowY: 'auto', padding: '0' })">
              <MpPopoverList>
                <MpPopoverListItem
                  v-for="c in couriersFiltered(o.id)" :key="c.id"
                  :is-active="c.name === forms[o.id]?.courier"
                  @click="selectCourier(o.id, c.name)"
                >{{ c.name }}</MpPopoverListItem>
                <p v-if="!couriersFiltered(o.id).length" class="sd-none">{{ t('No couriers found') }}</p>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
          <p v-if="forms[o.id]?.error" class="sd-error">{{ t('You must select a courier') }}</p>

          <!-- Tracking no. (optional — one per shipment) -->
          <label class="sd-label sd-label--mt">{{ t('Tracking no.') }}</label>
          <MpInput
            :id="`sd-track-${o.id}`"
            v-model="forms[o.id]!.trackingNo"
            :placeholder="t('Example: SD0009583')"
            is-full-width
          />
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="sd-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="emit('close')">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" @click="save">{{ t('Save & print') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.sd-lead { color: var(--mp-text-subtle); margin-bottom: var(--mp-spacing-4); }
.sd-group + .sd-group { margin-top: var(--mp-spacing-5); padding-top: var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default); }
.sd-order { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-3); }
.sd-label { display: block; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-1); }
.sd-label--mt { margin-top: var(--mp-spacing-4); }
.sd-courier-trigger { display: flex; align-items: center; gap: var(--mp-spacing-1); width: 100%; padding: 0 var(--mp-spacing-2); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-default); color: var(--mp-text-subtle); }
.sd-courier-trigger--error { border-color: var(--mp-border-critical, #d92d20); }
.sd-courier-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; height: 36px; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.sd-none { padding: var(--mp-spacing-3); color: var(--mp-text-subtle); }
.sd-error { color: var(--mp-text-critical, #d92d20); font-size: var(--mp-font-sizes-sm); margin-top: var(--mp-spacing-1); }
.sd-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
