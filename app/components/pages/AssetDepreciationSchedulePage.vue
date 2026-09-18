<script setup lang="ts">
/**
 * Depreciation schedule — the period run, both books side by side.
 *
 * The run is a draft until it is posted; the journal it will produce is shown
 * before it exists rather than after. Fiscal depreciation appears beside the
 * commercial charge and posts nothing: Indonesian statutory reporting is a
 * computation on a commercial ledger, not a parallel ledger, so a fiscal
 * schedule that posted would overstate depreciation expense with nothing
 * appearing out of balance.
 */
import { computed, ref } from 'vue'
import { MpButton, MpSegmentedControl, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'
import {
  fixedAssets, assetChargeSeptember, assetChargeYtd, septemberTotals,
  ASSET_HEADLINE_FIGURES as H, fiscalAbsenceReason, type FixedAsset,
} from '~/data/fixedAssets'

const { t } = useLocale()

type Period = 'sep' | 'ytd'
const period = ref<Period>('sep')
const periodOptions = [
  { id: 'per-sep', value: 'sep', label: 'September' },
  { id: 'per-ytd', value: 'ytd', label: 'FY2026 to date' },
]
const charges = computed(() => (period.value === 'sep' ? assetChargeSeptember : assetChargeYtd))

interface Row {
  asset: FixedAsset
  commercial: number
  fiscal: number | null
}

const rows = computed<Row[]>(() =>
  fixedAssets
    .map((a) => {
      const c = charges.value[a.id]
      if (!c) return null
      return { asset: a, commercial: c.commercial, fiscal: c.fiscal }
    })
    .filter((r): r is Row => r !== null)
    .filter((r) => r.commercial !== 0 || r.fiscal !== 0),
)

const totals = computed(() => {
  if (period.value === 'sep') return septemberTotals
  return {
    commercial: H.depreciationCommercialYTD,
    fiscal: H.depreciationFiscalYTD,
  }
})

/** Assets whose fiscal charge could not be computed at all. */
const uncomputed = computed(() => rows.value.filter((r) => r.fiscal === null))

function post() {
  successToast(t('Depreciation posted for September 2026.'))
}
</script>

<template>
  <div class="ds">
    <header class="ds__head">
      <p class="ds__sub">
        {{ t('September 2026 · draft, not yet posted · the journal date follows company policy') }}
      </p>
      <div class="ds__actions">
        <MpSegmentedControl id="ds-period" name="ds-period" v-model="period" :data="periodOptions" />
        <MpButton is-rounded @click="post">{{ t('Post depreciation') }}</MpButton>
      </div>
    </header>

    <!-- Totals in a card, so they read as a summary of the run rather than
         as text floating above the table. -->
    <div class="ds__totals">
      <div class="ds__total">
        <div class="ds__totallabel">{{ t('Accounting charge') }}</div>
        <div class="ds__totalvalue">{{ formatIDR(totals.commercial) }}</div>
        <div class="ds__totalnote">{{ t('posts to the general ledger') }}</div>
      </div>
      <div class="ds__total">
        <div class="ds__totallabel">{{ t('Tax charge') }}</div>
        <div class="ds__totalvalue">{{ formatIDR(totals.fiscal ?? 0) }}</div>
        <!-- Stated on the screen, not only in a document: this number is
             computed and reported, and reaches no ledger. -->
        <div class="ds__totalnote ds__totalnote--muted">{{ t('computed and reported, posts nothing') }}</div>
      </div>
      <div class="ds__total">
        <div class="ds__totallabel">{{ t('Difference') }}</div>
        <div class="ds__totalvalue">{{ formatIDR(totals.commercial - (totals.fiscal ?? 0)) }}</div>
        <div class="ds__totalnote">{{ t('accumulates to the tax correction') }}</div>
      </div>
    </div>

    <MpBanner v-if="uncomputed.length" id="ds__note-banner" variant="warning" class="ds__note">
      <MpBannerIcon id="b-icon" />
      <MpBannerTitle>
        {{ uncomputed.length }}
        {{ t(uncomputed.length === 1 ? 'asset has no tax charge' : 'assets have no tax charge') }}
      </MpBannerTitle>
      <MpBannerDescription>
        {{ uncomputed.map((r) => `${r.asset.id} ${r.asset.name}`).join(', ') }}
        {{ t('carries an accounting charge with no tax counterpart, because it has no statutory group. The tax total above excludes it.') }}
      </MpBannerDescription>
    </MpBanner>

    <div class="ds__card">
      <table class="ds__table">
        <thead>
          <tr>
            <th class="ds__th">{{ t('Asset') }}</th>
            <th class="ds__th">{{ t('Basis') }}</th>
            <th class="ds__th ds__th--num">{{ t('Accounting') }}</th>
            <th class="ds__th ds__th--num">{{ t('Tax') }}</th>
            <th class="ds__th ds__th--num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.asset.id" class="ds__tr">
            <td class="ds__td">
              <span class="ds__name">{{ r.asset.name }}</span>
              <span class="ds__id">{{ r.asset.id }}</span>
            </td>
            <td class="ds__td ds__td--basis">
              <template v-if="r.asset.indefiniteLife">
                {{ t('Indefinite life') }}
              </template>
              <template v-else-if="r.asset.commercialLifeMonths">
                {{ Math.round(r.asset.commercialLifeMonths / 12) }} {{ t('yr accounting') }}
              </template>
              <template v-if="r.asset.taxGroup">
                · {{ r.asset.taxGroup }}
              </template>
            </td>
            <td class="ds__td ds__td--num">{{ formatIDR(r.commercial) }}</td>
            <!-- Never 0 where the figure does not exist. -->
            <td class="ds__td ds__td--num" :class="{ 'ds__td--absent': r.fiscal === null }">
              {{ r.fiscal === null ? t(fiscalAbsenceReason(r.asset)) : formatIDR(r.fiscal) }}
            </td>
            <td class="ds__td ds__td--num">
              {{ r.fiscal === null ? '—' : formatIDR(r.commercial - r.fiscal) }}
            </td>
          </tr>
          <tr class="ds__tr ds__tr--total">
            <td class="ds__td" colspan="2">{{ t('Total') }}</td>
            <td class="ds__td ds__td--num">{{ formatIDR(totals.commercial) }}</td>
            <td class="ds__td ds__td--num">{{ formatIDR(totals.fiscal ?? 0) }}</td>
            <td class="ds__td ds__td--num">{{ formatIDR(totals.commercial - (totals.fiscal ?? 0)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>

.ds__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.ds__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.ds__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }
.ds__actions { display: flex; align-items: center; gap: var(--mp-spacing-2); flex: none; }


.ds__totals {
  display: flex; gap: var(--mp-spacing-10); flex-wrap: wrap;
  padding: var(--mp-spacing-4) var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral);
}
.ds__totallabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ds__totalvalue { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.ds__totalnote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ds__totalnote--muted { }
.ds__note { margin-bottom: var(--mp-spacing-4); }

.ds__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.ds__table { width: 100%; border-collapse: collapse; }
.ds__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ds__th--num { text-align: right; }
.ds__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.ds__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ds__td--basis { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ds__td--absent { color: var(--mp-text-critical); font-weight: var(--mp-font-weights-semi-bold); }
.ds__tr--total .ds__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); border-top: 1px solid var(--mp-border-default); }
.ds__name { display: block; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ds__id { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
</style>
