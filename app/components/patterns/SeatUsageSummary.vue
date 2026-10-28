<script setup lang="ts">
/**
 * SeatUsageSummary — the ERP / CRM seat rows of the Invite / Edit user "Seat
 * usage" card (the one place seat counts are shown; the User list only shows
 * state banners). Kept as its own component so the rows stay unit-mountable.
 *
 *   ERP users   10 total · 8 used · 2 left             (ERP trial → "No limit on trial")
 *   CRM users    5 total · 4 used · 1 left             (· N over quota)
 *                5 included · 1 Basic add-on · 1 Manager add-on   (trial: "5 trial seats")
 *                CRM Manager: 2 of 5 used                          (· N over)
 *                Up to 1 can be CRM Manager  — or "Remaining N seats are for CRM Basic only"
 *                (expired / Billing-down variants)
 *
 * Pure presentation of `seatUsageView()` (crmSubscription.ts); the caller decides
 * which counts to pass (current, or the Invite form's "after saving" preview).
 * The CRM row is absent when the company has no CRM add-on (view.crm === null).
 *  - layout 'rows'    label | value grid (wide containers)
 *  - layout 'stacked' label above value (narrow 320px side card)
 */
import { computed } from 'vue'
import { formatCrmSeatBreakdown, type SeatUsageView } from '~/data/crmSubscription'
import { useLocale } from '~/composables/useLocale'

const props = withDefaults(defineProps<{
  view: SeatUsageView
  billingDown?: boolean
  layout?: 'rows' | 'stacked'
}>(), { billingDown: false, layout: 'rows' })

const { t } = useLocale()
/** Capacity / CRM Manager / Basic-only lines — why "Up to N" is what it is. */
const breakdown = computed(() =>
  props.view.crm?.kind === 'usage' ? formatCrmSeatBreakdown(props.view.crm, t) : null)
</script>

<template>
  <div class="sus" :class="`sus--${layout}`" data-test-id="seat-usage-content">
    <div class="sus-row" data-test-id="seat-usage-erp">
      <span class="sus-label">{{ t('ERP users') }}</span>
      <span class="sus-value">
        <template v-if="view.erp === 'no-limit-trial'">{{ t('No limit on trial') }}</template>
        <template v-else>{{ view.erp.total }} {{ t('total') }} · {{ view.erp.used }} {{ t('used') }} · {{ view.erp.left }} {{ t('left') }}</template>
      </span>
    </div>

    <div v-if="view.crm" class="sus-row" data-test-id="seat-usage-crm">
      <span class="sus-label">{{ t('CRM users') }}</span>
      <span class="sus-value">
        <template v-if="view.crm.kind === 'usage'">
          <span>{{ view.crm.total }} {{ t('total') }} · {{ view.crm.used }} {{ t('used') }} · {{ view.crm.left }} {{ t('left') }}<template v-if="view.crm.over"> · {{ view.crm.over }} {{ t('over quota') }}</template></span>
          <span v-if="breakdown" class="sus-sub" data-test-id="seat-usage-crm-capacity">{{ breakdown.capacity }}</span>
          <span v-if="breakdown" class="sus-sub" data-test-id="seat-usage-crm-admin">{{ breakdown.admin }}</span>
          <span v-if="breakdown?.basicOnly" class="sus-sub" data-test-id="seat-usage-crm-basic-only">{{ breakdown.basicOnly }}</span>
          <span v-else-if="view.crm.left > 0" class="sus-sub">{{ t('Up to') }} {{ view.crm.adminLeft }} {{ t('can be CRM Manager') }}</span>
          <span v-if="billingDown" class="sus-sub">{{ t('Last confirmed by Billing.') }}</span>
        </template>
        <template v-else-if="view.crm.kind === 'expired'">
          <span>{{ t('CRM expired') }}</span>
          <span class="sus-sub">{{ t('Existing CRM access is read-only') }}</span>
        </template>
        <template v-else><span>{{ t("Can't be checked right now. Try again later.") }}</span></template>
      </span>
    </div>
  </div>
</template>

<style scoped>
.sus { display: flex; flex-direction: column; }
.sus-row { padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.sus-row:last-child { border-bottom: none; }
/* Dialog: compact label | value rows. */
.sus--rows .sus-row { display: grid; grid-template-columns: 120px 1fr; column-gap: var(--mp-spacing-6); }
/* Side card: label stacked over value. */
.sus--stacked .sus-row { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.sus--stacked .sus-row:first-child { padding-top: 0; }
.sus-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sus-value { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.sus-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
