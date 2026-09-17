<script setup lang="ts">
/**
 * Unreserve materials — PRD UC-03 / D-6. Allowed ONLY while the work order is
 * Not started; the caller hides the action once it has started.
 *
 * A tickbox per component releases that component's FULL reserved qty — there is
 * no partial-qty unreserve. Disposition is mandatory (return to warehouse, or
 * production defect charged to production cost / HPP); reason is optional. The
 * Supervisor → Production manager approval flow is designed but skipped in MVP,
 * which the info note states.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, MpCheckbox, MpRadio, MpTextarea,
  MpBanner, MpBannerIcon, MpBannerDescription,
} from '@mekari/pixel3'
import type { StockRequestLine, UnreserveDisposition } from '~/data/stockRequests'

const props = defineProps<{
  id: string
  isOpen: boolean
  workOrderNumber: string
  lines: StockRequestLine[]
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'unreserve', payload: { productIds: string[]; disposition: UnreserveDisposition; reason: string }): void
}>()

const { t } = useLocale()

// Only components that actually hold a reservation can be released.
const rows = computed(() => props.lines.filter(l => l.reserved > 0))

const selected = ref<Set<string>>(new Set())
const disposition = ref<UnreserveDisposition | ''>('')
const reason = ref('')
const error = ref('')

const allSelected = computed(() =>
  rows.value.length > 0 && rows.value.every(r => selected.value.has(r.productId)))

watch(disposition, () => { error.value = '' })
watch(() => props.isOpen, (open) => {
  if (!open) return
  selected.value = new Set()
  disposition.value = ''
  reason.value = ''
  error.value = ''
})

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  selected.value = next
  error.value = ''
}
function toggleAll() {
  selected.value = allSelected.value ? new Set() : new Set(rows.value.map(r => r.productId))
  error.value = ''
}

const releasedQty = computed(() =>
  rows.value.filter(r => selected.value.has(r.productId)).reduce((s, r) => s + r.reserved, 0))

// Footer actions stay enabled — a missing precondition explains inline.
function submit() {
  if (selected.value.size === 0) {
    error.value = t('Select at least one component to unreserve.')
    return
  }
  if (!disposition.value) {
    error.value = t('Choose where the released stock goes.')
    return
  }
  emit('unreserve', {
    productIds: [...selected.value],
    disposition: disposition.value,
    reason: reason.value.trim(),
  })
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
        {{ t('Unreserve materials') }} — {{ workOrderNumber }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <p class="um-lead">
          {{ t('The full reserved quantity of each selected component is released. Unreserving is only possible while the work order has not started.') }}
        </p>

        <div class="um-table-wrap">
          <table class="um-table">
            <thead>
              <tr>
                <th class="um-th um-th--check">
                  <MpCheckbox :id="`${id}-all`" :is-checked="allSelected" @change="toggleAll" />
                </th>
                <th class="um-th">{{ t('Product') }}</th>
                <th class="um-th um-th--num">{{ t('Reserved') }}</th>
                <th class="um-th um-th--num">{{ t('To release') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.productId" class="um-tr">
                <td class="um-td um-td--check">
                  <MpCheckbox
                    :id="`${id}-${r.productId}`"
                    :is-checked="selected.has(r.productId)"
                    @change="() => toggle(r.productId)"
                  />
                </td>
                <td class="um-td">
                  <span class="um-product">{{ r.product }}</span>
                  <span class="um-sku">{{ r.sku }}</span>
                </td>
                <td class="um-td um-td--num">{{ r.reserved }} {{ r.unit }}</td>
                <td class="um-td um-td--num">{{ selected.has(r.productId) ? `${r.reserved} ${r.unit}` : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Disposition — mandatory (D-6) -->
        <fieldset class="um-field">
          <legend class="um-label">{{ t('Disposition') }}</legend>
          <div class="um-radios">
            <MpRadio :id="`${id}-disp-return`" v-model="disposition" name="um-disposition" value="return-to-warehouse">
              {{ t('Return to warehouse') }}
              <template #description>{{ t('The released quantity goes back to available warehouse stock.') }}</template>
            </MpRadio>
            <MpRadio :id="`${id}-disp-defect`" v-model="disposition" name="um-disposition" value="production-defect">
              {{ t('Production defect') }}
              <template #description>{{ t('Charged to production cost (HPP). The stock does not return to the warehouse.') }}</template>
            </MpRadio>
          </div>
        </fieldset>

        <div class="um-field">
          <label class="um-label" :for="`${id}-reason`">{{ t('Reason') }} <span class="um-optional">({{ t('optional') }})</span></label>
          <MpTextarea :id="`${id}-reason`" v-model="reason" :placeholder="t('Why is this being unreserved?')" rows="2" is-full-width />
        </div>

        <MpBanner id="um-approval-note" variant="info" class="um-banner">
          <MpBannerIcon />
          <MpBannerDescription>
            {{ t('Approval (Supervisor → Production manager) is planned but not active yet — this takes effect immediately and is recorded in the activity log.') }}
          </MpBannerDescription>
        </MpBanner>

        <p v-if="error" class="um-error">{{ error }}</p>
      </MpModalBody>
      <MpModalFooter>
        <div class="um-footer">
          <span class="um-summary">
            {{ selected.size }} {{ selected.size === 1 ? t('component') : t('components') }} · {{ releasedQty }} {{ t('unit to release') }}
          </span>
          <div class="um-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="submit">{{ t('Unreserve') }}</button>
          </div>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.um-lead { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }

.um-table-wrap { overflow-x: auto; }
.um-table { width: 100%; border-collapse: collapse; }
.um-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary, #3a4749); text-align: left; white-space: nowrap;
}
.um-th--num { text-align: right; }
.um-th--check, .um-td--check { width: 40px; padding-right: 0; }
.um-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-subtle, #e5e7e7);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #080d0e);
  vertical-align: middle; white-space: nowrap;
}
.um-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.um-product { display: block; }
.um-sku { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }

.um-field { margin-top: var(--mp-spacing-5); border: 0; padding: 0; }
.um-label {
  display: block; margin-bottom: var(--mp-spacing-2); padding: 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default, #080d0e);
}
.um-optional { font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary, #3a4749); }
.um-radios { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }

.um-banner { margin-top: var(--mp-spacing-5); }

.um-error { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-critical, #a8352d); }

.um-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); width: 100%; }
.um-summary { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }
.um-footer-btns { display: flex; gap: var(--mp-spacing-3); }
</style>
