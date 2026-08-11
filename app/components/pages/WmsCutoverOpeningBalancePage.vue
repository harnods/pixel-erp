<script setup lang="ts">
/**
 * Data migration → WMS cutover → Opening balance.
 *
 * PRD "WMS Conversion Balance Setup" (PD/51260326215), Story 6 / FR4–FR8.
 * Route: /data-migration/wms-cutover/opening-balance (detailMatch → owns its
 * own 72px title bar + stage).
 *
 * This screen REPLACES the prototype's "Pulling WMS inventory snapshot" step,
 * which implemented a model the PRD explicitly rejects:
 *   - FR5: the per-account total is computed by summing each product's
 *     Inventory Value — "not a value pulled from WMS".
 *   - A4:  WMS has no monetary valuation capability whatsoever.
 * So there is no fetch, no spinner, no "could not reach WMS" state, and no
 * batch/serial rollup (OS7 puts those columns out of scope for this flow).
 *
 * The numbers here are live: reroute a product on the previous step and the
 * account totals move. That is the point — the cutover figure is provably
 * derived from setup rather than typed in.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { MpBanner, MpBannerIcon, MpBannerDescription, MpIcon } from '@mekari/pixel3'
import {
  computeOpeningBalance, openingBalanceTotal, cutoverState, openingBalanceDate,
  EKUITAS_SALDO_AWAL, CUTOVER_TOTAL_PRODUCTS, cutoverSetUpCount, seedCostBasis,
} from '~/data/wmsCutover'

const { t } = useLocale()
const router = useRouter()

// ── Formatting (DESIGN.md → Number format / Date format) ────────────────────
const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', minimumFractionDigits: 2,
})
function fmtIDR(n: number): string {
  return idr.format(n).replace(/^(Rp)\s/, '$1')
}
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
const conversionDate = computed(() => dateFmt.format(new Date(cutoverState.conversionDate)))
/** Dated the day before the conversion date — existing saldo awal convention. */
const balanceDate = computed(() => dateFmt.format(openingBalanceDate(cutoverState.conversionDate)))

const unitCostFmt = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtUnitCost(n: number): string {
  return `Rp${unitCostFmt.format(n)}`
}

const lines = computed(() => computeOpeningBalance())
const total = computed(() => openingBalanceTotal())
const seeded = computed(() => seedCostBasis())

// Story 1's hard gate — this screen is only meaningful at 100% setup.
const setUpCount = computed(() => cutoverSetUpCount())
const isGateOpen = computed(() => setUpCount.value >= CUTOVER_TOTAL_PRODUCTS)

function goBack() {
  router.push('/data-migration/wms-cutover/products')
}
function goToJurnalOpeningBalance() {
  // Hands off to ERP's existing saldo awal screen, which owns Publish (Terbitkan).
  router.push('/data-migration')
}
</script>

<template>
  <div class="ob-page">

    <!-- ── Title bar ── -->
    <div class="ob-titlebar">
      <div class="ob-titlebar-left">
        <button type="button" class="ob-breadcrumb" @click="goBack">{{ t('Set up WMS products') }}</button>
        <h1 class="ob-title">{{ t('Opening balance') }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="ob-stage">
      <div class="ob-wrapper">

        <!-- The 100% gate has not been met — say so instead of showing a half-total -->
        <template v-if="!isGateOpen">
          <MpBanner id="ob-gate" variant="warning">
            <MpBannerIcon id="ob-gate-icon" />
            <MpBannerDescription id="ob-gate-desc">
              {{ setUpCount }} {{ t('of') }} {{ CUTOVER_TOTAL_PRODUCTS }} {{ t('products set up') }}.
              {{ t('The opening balance is only computed once every product has an inventory account and an inventory value.') }}
            </MpBannerDescription>
          </MpBanner>
          <div class="ob-actions">
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="goBack">
              {{ t('Back to product setup') }}
            </button>
          </div>
        </template>

        <template v-else>
          <dl class="ob-meta">
            <div class="ob-meta-item">
              <dt class="ob-meta-label">{{ t('Conversion date') }}</dt>
              <dd class="ob-meta-value">{{ conversionDate }}</dd>
              <dd class="ob-meta-hint">{{ t('First day of recording in ERP') }}</dd>
            </div>
            <div class="ob-meta-item">
              <dt class="ob-meta-label">{{ t('Opening balance as per') }}</dt>
              <dd class="ob-meta-value">{{ balanceDate }}</dd>
              <dd class="ob-meta-hint">{{ t('Day before the conversion date') }}</dd>
            </div>
            <div class="ob-meta-item">
              <dt class="ob-meta-label">{{ t('Products included') }}</dt>
              <dd class="ob-meta-value">{{ CUTOVER_TOTAL_PRODUCTS }}</dd>
            </div>
          </dl>

          <p class="ob-note">
            {{ t('Each line is the sum of Inventory Value across every product routed to that account. WMS supplies quantity and movements; the monetary value comes from your product setup.') }}
          </p>

          <!-- Computed inventory lines — system-populated, not editable (FR7) -->
          <div class="ob-table-wrap">
            <table class="ob-table">
              <thead>
                <tr>
                  <th class="ob-th">{{ t('Inventory account') }}</th>
                  <th class="ob-th ob-th--num">{{ t('Debit') }}</th>
                  <th class="ob-th ob-th--num">{{ t('Credit') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in lines" :key="line.accountCode">
                  <td class="ob-td">
                    <div class="ob-acct">
                      <span class="ob-acct-main">
                        <span class="ob-acct-code">{{ line.accountCode }}</span>{{ line.accountName }}
                      </span>
                      <span class="ob-computed">
                        <MpIcon name="info" size="sm" color="icon.subtle" />
                        {{ t('Computed from product setup') }}
                      </span>
                    </div>
                  </td>
                  <td class="ob-td ob-td--num">{{ fmtIDR(line.debit) }}</td>
                  <td class="ob-td ob-td--num">{{ fmtIDR(0) }}</td>
                </tr>

                <!-- The balancing plug the existing saldo awal flow already uses (FR6) -->
                <tr class="ob-tr--plug">
                  <td class="ob-td">
                    <span class="ob-acct-code">{{ EKUITAS_SALDO_AWAL.code }}</span>{{ EKUITAS_SALDO_AWAL.name }}
                  </td>
                  <td class="ob-td ob-td--num">{{ fmtIDR(0) }}</td>
                  <td class="ob-td ob-td--num">{{ fmtIDR(total) }}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td class="ob-td ob-td--total">{{ t('Total') }}</td>
                  <td class="ob-td ob-td--num ob-td--total">{{ fmtIDR(total) }}</td>
                  <td class="ob-td ob-td--num ob-td--total">{{ fmtIDR(total) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <MpBanner id="ob-locked" variant="info" is-inline>
            <MpBannerIcon id="ob-locked-icon" />
            <MpBannerDescription id="ob-locked-desc">
              {{ t('These inventory lines carry into the opening balance as system-populated and locked. Every other account is still filled in manually there, exactly as today.') }}
            </MpBannerDescription>
          </MpBanner>

          <!-- OQ10 / Risk PR2 resolution — the cutover seeds ERP's existing
               averageCost so inventory value stops being a remembered number -->
          <section class="ob-costbasis">
            <h2 class="ob-costbasis-title">{{ t('Cost basis') }}</h2>
            <p class="ob-costbasis-desc">
              {{ t('Publishing also sets each product\'s average cost to its Inventory Value divided by on-hand quantity. From then on inventory value is derived as quantity × average cost, so WMS movements keep it current without anyone re-entering a total.') }}
            </p>
            <ul class="ob-costbasis-list">
              <li v-for="seed in seeded" :key="seed.sku" class="ob-costbasis-row">
                <span class="ob-costbasis-name">{{ seed.name }}</span>
                <span class="ob-costbasis-calc">
                  {{ fmtIDR(seed.inventoryValue) }} ÷ {{ seed.onHandQty }}
                  <MpIcon name="arrows-right" size="sm" color="icon.subtle" />
                  <strong>{{ fmtUnitCost(seed.averageCost) }}</strong>
                </span>
              </li>
            </ul>
            <p v-if="!seeded.length" class="ob-costbasis-desc">
              {{ t('No individually set-up products in this batch.') }}
            </p>
          </section>

          <MpBanner id="ob-blocked-import" variant="info" is-inline>
            <MpBannerIcon id="ob-blocked-import-icon" />
            <MpBannerDescription id="ob-blocked-import-desc">
              {{ t('The manual product-import path for opening inventory quantities is blocked while WMS is connected — inventory value comes from product setup instead.') }}
            </MpBannerDescription>
          </MpBanner>

          <div class="ob-actions">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="goBack">
              {{ t('Back') }}
            </button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="goToJurnalOpeningBalance">
              {{ t('Continue') }}
            </button>
          </div>
        </template>

      </div>
    </div>
  </div>
</template>

<style scoped>
.ob-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ── Title bar ── */
.ob-titlebar {
  flex-shrink: 0;
  height: 72px;
  background: var(--mp-background-neutral-subtle);
  display: flex;
  align-items: center;
  padding: 0 var(--mp-spacing-6);
}

.ob-titlebar-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
}

.ob-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  font-size: 12px;
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link);
  white-space: nowrap;
}
.ob-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }

.ob-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.ob-stage {
  flex: 1;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}

.ob-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  max-width: 920px;
}

/* ── Meta ── */
.ob-meta {
  display: flex;
  gap: var(--mp-spacing-8);
  margin: 0;
}

.ob-meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.ob-meta-label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

.ob-meta-value {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  font-variant-numeric: tabular-nums;
}

.ob-meta-hint {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

.ob-note {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

/* ── Computed lines table (read-only) ── */
.ob-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}

.ob-table {
  width: 100%;
  border-collapse: collapse;
}

.ob-th {
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-4);
  text-align: left;
  vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}
.ob-th--num { text-align: right; width: 200px; }

.ob-td {
  height: 56px;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  vertical-align: middle;
}
.ob-td--num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* System-populated rows read as locked, not editable (FR7) */
.ob-table tbody .ob-td { background: var(--mp-background-neutral-subtle); }

.ob-acct {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ob-acct-code {
  color: var(--mp-text-secondary);
  margin-right: var(--mp-spacing-2);
  font-variant-numeric: tabular-nums;
}

.ob-computed {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

.ob-tr--plug .ob-td { border-top: 1px solid var(--mp-border-default); }

.ob-table tfoot .ob-td {
  border-bottom: none;
  border-top: 1px solid var(--mp-border-bold);
  background: var(--mp-background-neutral);
}
.ob-td--total { font-weight: var(--mp-font-weights-semi-bold); }

/* ── Cost basis ──
   A form/content section, so it uses a divider + sub-heading rather than a
   boxed card (mekari-taste principle 4: "Form sections use dividers and
   sub-headings — not boxed containers"). */
.ob-costbasis {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}

.ob-costbasis-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg);
  color: var(--mp-text-default);
}

.ob-costbasis-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}

.ob-costbasis-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.ob-costbasis-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
  font-size: var(--mp-font-sizes-md);
}
.ob-costbasis-row:last-child { border-bottom: none; }

.ob-costbasis-name { color: var(--mp-text-default); }

.ob-costbasis-calc {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  color: var(--mp-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ob-costbasis-calc strong {
  color: var(--mp-text-default);
  font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Actions ── */
.ob-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-2);
}
</style>
