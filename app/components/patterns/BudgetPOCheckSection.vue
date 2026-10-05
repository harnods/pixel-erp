<script setup lang="ts">
/**
 * Budget section on a purchase order raised from purchase requests. Each line
 * shows what its request still holds, the excess above it, and the check on the
 * excess (LR-3). The form blocks save while `check.result` is Block.
 */
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatIDRWhole } from '~/utils/currency'
import type { POPreviewRow, CheckResult } from '~/data/budgetStore'

const props = defineProps<{ rows: POPreviewRow[]; check: CheckResult; blocked: string | null }>()
const { t } = useLocale()
const fmt = formatIDRWhole

const totals = computed(() => ({
  amount: props.rows.reduce((s, r) => s + r.amount, 0),
  held: props.rows.reduce((s, r) => s + r.held, 0),
  excess: props.rows.reduce((s, r) => s + r.excess, 0),
}))
function resultLabel(r: POPreviewRow): { status: string; label: string; type: 'completed' | 'warning' | 'critical' | 'announcement' } {
  if (r.result === 'Block') return { status: 'blocked', label: t('Not enough budget'), type: 'critical' }
  if (r.result === 'Warn') return { status: 'warning', label: t('Over month budget'), type: 'warning' }
  if (r.message === 'Not budget controlled') return { status: 'off', label: t('Not budget controlled'), type: 'announcement' }
  return { status: 'pass', label: r.excess > 0 ? t('Fits available') : t('Within request'), type: 'completed' }
}
</script>

<template>
  <section class="bpo-section" data-tour="po-budget-section">
    <h3 class="bpo-heading">{{ t('Budget') }}</h3>

    <MpBanner v-if="blocked" id="po-budget-block-banner" variant="danger" align-items="center">
      <MpBannerIcon id="po-budget-block-banner-icon" />
      <MpBannerTitle>{{ t('This purchase order cannot be saved') }}</MpBannerTitle>
      <MpBannerDescription>{{ blocked }}</MpBannerDescription>
    </MpBanner>

    <table class="bpo-table">
      <thead>
        <tr>
          <th class="bpo-th">{{ t('Request') }}</th>
          <th class="bpo-th">{{ t('Budget line') }}</th>
          <th class="bpo-th bpo-th--num">{{ t('PO amount') }}</th>
          <th class="bpo-th bpo-th--num">{{ t('Held by request') }}</th>
          <th class="bpo-th bpo-th--num">{{ t('Excess') }}</th>
          <th class="bpo-th">{{ t('Check') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i">
          <td class="bpo-td">
            <span class="bpo-main">{{ r.prNumber || '-' }}</span>
            <span class="bpo-sub">{{ r.description }}</span>
          </td>
          <td class="bpo-td">{{ r.lineTitle }}</td>
          <td class="bpo-td bpo-td--num">{{ fmt(r.amount) }}</td>
          <td class="bpo-td bpo-td--num">{{ fmt(r.held) }}</td>
          <td class="bpo-td bpo-td--num" :class="{ 'bpo-danger': r.result === 'Block' }">{{ fmt(r.excess) }}</td>
          <td class="bpo-td">
            <ErpStatusBadge :status="resultLabel(r).status" :label="resultLabel(r).label" :type="resultLabel(r).type" />
            <span v-if="r.result === 'Block' || r.result === 'Warn'" class="bpo-sub" :class="{ 'bpo-danger': r.result === 'Block' }">{{ r.message }}</span>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td class="bpo-td bpo-td--total" colspan="2">{{ t('Total') }}</td>
          <td class="bpo-td bpo-td--num bpo-td--total">{{ fmt(totals.amount) }}</td>
          <td class="bpo-td bpo-td--num bpo-td--total">{{ fmt(totals.held) }}</td>
          <td class="bpo-td bpo-td--num bpo-td--total">{{ fmt(totals.excess) }}</td>
          <td class="bpo-td bpo-td--total" />
        </tr>
      </tfoot>
    </table>
  </section>
</template>

<style scoped>
.bpo-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bpo-heading { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bpo-table { width: 100%; border-collapse: collapse; }
.bpo-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase;
}
.bpo-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.bpo-td {
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
}
.bpo-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.bpo-td--total { font-weight: var(--mp-font-weights-semi-bold); border-bottom: none; }
.bpo-main { display: block; }
.bpo-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bpo-danger { color: var(--mp-text-danger); }
</style>
