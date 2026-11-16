<script setup lang="ts">
/**
 * SeatUsageSummary — the ERP / CRM seat rows of the Invite / Edit user "Seat
 * usage" card (the one place seat counts are shown; the User list only shows
 * state banners). Kept as its own component so the rows stay unit-mountable.
 *
 *   ERP users   10 total · 8 used · 2 left             (ERP trial → "No limit on trial")
 *   CRM users    5 total · 4 used · 1 left             (over quota: "5 total · 7 used · 2 over", warning colour)
 *                5 included                            (+ "+ 2 Basic, + 1 Administrator add-on" when add-ons exist;
 *                                                       trial: "5 trial seats")
 *                Up to 1 can be CRM Administrator      (hidden when 0)
 *                (expired / Billing-down variants)
 * No "CRM Administrator: N of M used" line — the spec drops it.
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
/** Usage / capacity / "Up to N" lines (crmSubscription.formatCrmSeatBreakdown). */
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
          <template v-if="breakdown">
            <span
              :class="{ 'sus-over': breakdown.usage.isOver }"
              data-test-id="seat-usage-crm-usage"
            >{{ breakdown.usage.text }}</span>
            <span class="sus-sub" data-test-id="seat-usage-crm-capacity">{{ breakdown.capacity }}</span>
            <span v-if="breakdown.upTo" class="sus-sub" data-test-id="seat-usage-crm-upto">{{ breakdown.upTo }}</span>
          </template>
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
/* Over quota — the usage line reads in the warning colour. */
.sus-over { color: var(--mp-colors-text-warning, #a14a0b); }
</style>
