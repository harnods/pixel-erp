<script setup lang="ts">
/**
 * Shipping-details modal — asks for the courier + tracking number of the shipment
 * being labelled when a non-marketplace order has no courier yet. One shipment =
 * one parcel = one tracking number, so the fields are asked PER PACKAGE: an
 * outbound leaving as two parcels gets two pairs, each free to name a different
 * courier and AWB.
 *
 * Rows arrive pre-filled by the caller: a package with details of its own shows
 * them, otherwise it inherits the parent outbound's (fill the order in once and
 * every parcel under it starts from the same courier). On "Save & print" the
 * values go back per row, and the caller stores a package row against the package.
 *
 * Mirrors existing patterns — the searchable courier picker of HandoverToCourierPage
 * and the modal shell of the inbound Edit-tracking modal (ReceiptIndexPage) — no new
 * component or behaviour invented.
 */
import { reactive, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpInput, MpPopover, MpPopoverTrigger,
  MpPopoverContent, MpPopoverList, MpPopoverListItem, MpIcon, MpButton, css,
} from '@mekari/pixel3'
import type { ShippingDetailRow } from '~/composables/usePrintShippingLabel'
import { couriers } from '~/data/couriers'

const props = defineProps<{ isOpen: boolean; rows: ShippingDetailRow[] }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', details: Record<string, { courier: string; trackingNo: string }>): void
}>()

const { t } = useLocale()

interface Form { courier: string; search: string; active: boolean; trackingNo: string; error: boolean }
const forms = reactive<Record<string, Form>>({})

// (Re)seed a form per row whenever the modal opens — the caller has already worked
// out what each one inherits, so this just mirrors it.
watch(
  () => [props.isOpen, props.rows] as const,
  () => {
    if (!props.isOpen) return
    for (const r of props.rows) {
      forms[r.key] = {
        courier: r.courier,
        search: '',
        active: false,
        trackingNo: r.trackingNo,
        error: false,
      }
    }
  },
  { immediate: true, deep: true },
)

function couriersFiltered(key: string) {
  const q = (forms[key]?.search ?? '').trim().toLowerCase()
  return couriers.filter((c) => !q || c.name.toLowerCase().includes(q))
}
function openPicker(key: string) {
  const f = forms[key]; if (f) { f.active = true; f.search = '' }
}
function selectCourier(key: string, name: string) {
  const f = forms[key]; if (!f) return
  f.courier = name; f.active = false; f.error = false
}

/** Heading for a row: the outbound, plus the parcel when the order has packages. */
function rowTitle(r: ShippingDetailRow): string {
  return r.packageNo ? `${r.orderNumber} · ${r.packageNo}` : r.orderNumber
}

function save() {
  let valid = true
  for (const r of props.rows) {
    const f = forms[r.key]
    if (!f?.courier.trim()) { if (f) f.error = true; valid = false }
  }
  if (!valid) return
  const out: Record<string, { courier: string; trackingNo: string }> = {}
  for (const r of props.rows) {
    const f = forms[r.key]!
    out[r.key] = { courier: f.courier.trim(), trackingNo: f.trackingNo.trim() }
  }
  emit('submit', out)
}
</script>

<template>
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="shipping-details-modal" :is-open="isOpen" size="md" :is-keep-alive="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('Shipping details') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <p class="sd-lead">{{ t('Add a courier for each package to print the shipping label. Each package ships on its own tracking no.') }}</p>

        <div v-for="r in rows" :key="r.key" class="sd-group">
          <p v-if="rows.length > 1 || r.packageNo" class="sd-order">{{ rowTitle(r) }}<span v-if="r.customer"> · {{ r.customer }}</span></p>

          <!-- Courier (required) -->
          <label class="sd-label">{{ t('Courier') }}</label>
          <MpPopover
            :id="`sd-courier-${r.key}`"
            placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select
          >
            <MpPopoverTrigger>
              <div class="sd-courier-trigger" :class="{ 'sd-courier-trigger--error': forms[r.key]?.error }">
                <input
                  type="text" class="sd-courier-input" autocomplete="off"
                  :value="forms[r.key]?.active ? forms[r.key]?.search : (forms[r.key]?.courier ?? '')"
                  :placeholder="t('Select courier')"
                  @focus="openPicker(r.key)"
                  @input="forms[r.key] && (forms[r.key].active = true, forms[r.key].search = ($event.target as HTMLInputElement).value)"
                />
                <MpIcon name="chevron-down" size="sm" />
              </div>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '320px', maxHeight: '300px', overflowY: 'auto', padding: '0' })">
              <MpPopoverList>
                <MpPopoverListItem
                  v-for="c in couriersFiltered(r.key)" :key="c.id"
                  :is-active="c.name === forms[r.key]?.courier"
                  @click="selectCourier(r.key, c.name)"
                >{{ c.name }}</MpPopoverListItem>
                <p v-if="!couriersFiltered(r.key).length" class="sd-none">{{ t('No couriers found') }}</p>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
          <p v-if="forms[r.key]?.error" class="sd-error">{{ t('You must select a courier') }}</p>

          <!-- Tracking no. (optional — one per shipment) -->
          <label class="sd-label sd-label--mt">{{ t('Tracking no.') }}</label>
          <MpInput
            :id="`sd-track-${r.key}`"
            v-model="forms[r.key]!.trackingNo"
            :placeholder="t('Example: SD0009583')"
            is-full-width
          />
        </div>
      </MpModalBody>
      <MpModalFooter>
        <div class="sd-footer-btns">
          <MpButton class="btn-enterprise btn-enterprise--ghost" @click="emit('close')">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" @click="save">{{ t('Save & print') }}</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.sd-lead { color: var(--mp-text-subtle); margin-bottom: var(--mp-spacing-4); }
.sd-group + .sd-group { margin-top: var(--mp-spacing-5); padding-top: var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.sd-order { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-3); }
.sd-label { display: block; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-1); }
.sd-label--mt { margin-top: var(--mp-spacing-4); }
.sd-courier-trigger { display: flex; align-items: center; gap: var(--mp-spacing-1); width: 100%; padding: 0 var(--mp-spacing-2); border: 1px solid var(--mp-colors-border-form, #1d1f2429); border-radius: var(--mp-radii-md); background: var(--mp-background-default); color: var(--mp-text-subtle); }
.sd-courier-trigger--error { border-color: var(--mp-border-critical, #d92d20); }
.sd-courier-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; height: var(--mp-sizes-9\.5, 38px); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.sd-none { padding: var(--mp-spacing-3); color: var(--mp-text-subtle); }
.sd-error { color: var(--mp-text-critical, #d92d20); font-size: var(--mp-font-sizes-sm); margin-top: var(--mp-spacing-1); }
.sd-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
