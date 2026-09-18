<script setup lang="ts">
/**
 * CRM → ERP conversion — READ-ONLY review + confirm drawer.
 *
 * PRD "ERP Transaction Conversion Settings V1" §Read-only conversion review +
 * §Confirmation and processing. Replaces the old editable embedded-form drawer:
 * the record's mapped values are shown read-only (no runtime data entry), the ERP
 * Customer prerequisite is surfaced, and an explicit Confirm creates exactly one
 * ERP transaction. Closes ONLY via × / Cancel (rule/modal-drawer-close-explicit-only)
 * — the overlay ignores clicks and there is no Esc listener.
 */
import { computed } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'
import { formatMoney } from '~/utils/currency'
import { crmCustomers, dealTotals, type Deal, type DealLineItem } from '~/data/crm'
import { dealTargetLabel, dealConvEligibility } from '~/data/crmConversion'

const props = defineProps<{ open: boolean; deal: Deal | null }>()
const emit = defineEmits<{ close: []; confirm: [] }>()
const { t } = useLocale()

const targetLabel = computed(() => dealTargetLabel())
const title = computed(() => `${t('Review')} ${t(targetLabel.value)}`)
const money = (n: number) => formatMoney(n, props.deal?.currency ?? 'IDR')
const totals = computed(() => (props.deal ? dealTotals(props.deal) : null))
const customer = computed(() => (props.deal ? crmCustomers.find((c) => c.id === props.deal!.customerId) : undefined))
// Prototype ERP-customer prerequisite: a customer that exists in the CRM master is
// treated as already synced to ERP; otherwise it would be created (create-only).
const customerInErp = computed(() => !!customer.value)
const eligibility = computed(() => (props.deal ? dealConvEligibility(props.deal) : { ok: false }))
const today = new Date().toISOString().slice(0, 10)
function fmtDate(iso?: string) {
  return iso ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—'
}
function lineAmount(li: DealLineItem) {
  const gross = li.quantity * li.originalPrice
  const disc = li.discountType === 'percentage' ? gross * (li.discount ?? 0) / 100 : (li.discountType === 'fixed' ? (li.discount ?? 0) : 0)
  return Math.round(gross - disc)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="crv">
      <div v-if="open && deal" class="crv-overlay">
        <div class="crv-panel" role="dialog" aria-modal="true">
          <header class="crv-header">
            <div class="crv-header-left">
              <span class="crv-eyebrow">{{ deal.name }}</span>
              <h2 class="crv-title">{{ title }}</h2>
            </div>
            <MpButton class="crv-close" is-rounded :aria-label="t('Close')" @click="emit('close')"><MpIcon name="close" size="md" /></MpButton>
          </header>

          <div class="crv-body">
            <p class="crv-lead">{{ t('Review the values below. They are filled from this record’s mapping and cannot be edited here — edit the record itself if something is wrong.') }}</p>

            <!-- ERP Customer prerequisite -->
            <section class="crv-section">
              <h3 class="crv-section-title">{{ t('ERP Customer') }}</h3>
              <div class="crv-kv"><span>{{ t('Customer') }}</span><b>{{ customer?.name ?? deal.company }}</b></div>
              <div v-if="customerInErp" class="crv-notice crv-notice--ok">
                <MpIcon name="done" size="sm" />
                <span>{{ t('This customer is already in ERP and will be used as-is.') }}</span>
              </div>
              <div v-else class="crv-notice">
                <MpIcon name="info" size="sm" />
                <span>{{ t('This customer is not in ERP yet and will be created when you confirm.') }}</span>
              </div>
            </section>

            <!-- Transaction details (resolved from mapping) -->
            <section class="crv-section">
              <h3 class="crv-section-title">{{ t('Transaction details') }}</h3>
              <div class="crv-grid">
                <div class="crv-kv"><span>{{ t('Transaction date') }}</span><b>{{ fmtDate(today) }}</b></div>
                <div class="crv-kv"><span>{{ t('Due date') }}</span><b>{{ fmtDate(deal.expectedCloseDate) }}</b></div>
                <div class="crv-kv"><span>{{ t('Currency') }}</span><b>{{ deal.currency ?? 'IDR' }}</b></div>
                <div class="crv-kv"><span>{{ t('Reference number') }}</span><b>{{ deal.referenceNumber || '—' }}</b></div>
              </div>
            </section>

            <!-- Product lines -->
            <section class="crv-section">
              <h3 class="crv-section-title">{{ t('Product lines') }}</h3>
              <table class="crv-lines">
                <thead>
                  <tr><th>{{ t('Product') }}</th><th class="num">{{ t('Qty') }}</th><th class="num">{{ t('Unit price') }}</th><th class="num">{{ t('Amount') }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(li, i) in (deal.products ?? [])" :key="i">
                    <td>{{ li.productName }}</td>
                    <td class="num">{{ li.quantity }} {{ li.unit }}</td>
                    <td class="num">{{ money(li.originalPrice) }}</td>
                    <td class="num">{{ money(lineAmount(li)) }}</td>
                  </tr>
                  <tr v-if="!(deal.products ?? []).length"><td colspan="4" class="crv-empty">{{ t('No products on this deal.') }}</td></tr>
                </tbody>
              </table>
              <div v-if="totals" class="crv-total"><span>{{ t('Total') }}</span><b>{{ money(totals.total) }}</b></div>
            </section>

            <p v-if="!eligibility.ok" class="crv-block">{{ eligibility.reason }}</p>
          </div>

          <footer class="crv-footer">
            <MpButton class="btn-enterprise--ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="emit('confirm')">{{ t('Confirm and create') }} {{ t(targetLabel) }}</MpButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.crv-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; justify-content: flex-end; background: var(--mp-background-overlay, rgba(8,13,14,0.5)); }
.crv-panel { margin: 12px; height: calc(100% - 24px); width: min(560px, calc(100% - 24px)); background: var(--mp-background-stage, #fff); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; }
.crv-header { flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-subtle, #e6e8eb); }
.crv-header-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.crv-eyebrow { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.crv-title { margin: 0; font-size: var(--mp-font-sizes-xl, 18px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.crv-close { min-width: 0 !important; padding: var(--mp-spacing-1) !important; background: transparent !important; border: none !important; }
.crv-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.crv-lead { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.crv-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.crv-section-title { margin: 0; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.crv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }
.crv-kv { display: flex; flex-direction: column; gap: 2px; }
.crv-kv span { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.crv-kv b { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.crv-notice { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-info-subtle, #eaf2fb); font-size: var(--mp-font-sizes-sm, 12px); }
.crv-notice--ok { background: var(--mp-background-success-subtle, #e7f5ef); }
.crv-lines { width: 100%; border-collapse: collapse; font-size: var(--mp-font-sizes-sm, 14px); }
.crv-lines th, .crv-lines td { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-subtle, #e6e8eb); }
.crv-lines th { font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-secondary); }
.crv-lines .num, .crv-lines th.num { text-align: right; }
.crv-empty { color: var(--mp-text-secondary); text-align: center; }
.crv-total { display: flex; justify-content: space-between; padding-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md, 14px); }
.crv-total b { font-weight: var(--mp-font-weights-semi-bold); }
.crv-block { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #a8352d); }
.crv-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-5); border-top: 1px solid var(--mp-border-subtle, #e6e8eb); }

.crv-enter-active, .crv-leave-active { transition: opacity 0.2s ease; }
.crv-enter-active .crv-panel, .crv-leave-active .crv-panel { transition: transform 0.2s ease; }
.crv-enter-from, .crv-leave-to { opacity: 0; }
.crv-enter-from .crv-panel, .crv-leave-to .crv-panel { transform: translateX(calc(100% + 12px)); }
</style>
