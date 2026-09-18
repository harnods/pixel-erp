<script setup lang="ts">
/**
 * Fiscal book — the asset profit and loss impact statement.
 *
 * Every way an asset touched profit this year, on both bases, with the
 * difference between them and the deferred tax that difference creates. This is
 * the working paper a tax preparer builds by hand for the koreksi fiskal; the
 * point of the screen is that they no longer have to.
 *
 * Two columns, commercial beside fiscal. The layout was chosen over a
 * reconciliation walk because it reads the way the preparer already thinks.
 *
 * The rule that matters most here: where a basis does not recognise an event at
 * all, the cell reads "Not recognised" rather than 0. Impairment is the clearest
 * case — fiscal does not recognise it until the loss is realised, which is a
 * different statement from recognising nothing.
 */
import { computed, ref } from 'vue'
import { MpButton, MpSegmentedControl, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import {
  impactByClass, impactByTaxGroup, amortisationYtd, type ImpactRow,
} from '~/data/fixedAssetScreens'
import { ASSET_HEADLINE_FIGURES as H, fixedAssets } from '~/data/fixedAssets'

const { t } = useLocale()

/** Group the depreciation lines by class or by the statutory group. */
type Grouping = 'class' | 'taxGroup'
const grouping = ref<Grouping>('class')
const groupingOptions = [
  { id: 'grp-class', value: 'class', label: 'By class' },
  { id: 'grp-tax', value: 'taxGroup', label: 'By tax group' },
]
const depreciationRows = computed<ImpactRow[]>(() =>
  grouping.value === 'class' ? impactByClass : impactByTaxGroup,
)

const depreciationTotal = computed(() => ({
  commercial: depreciationRows.value.reduce((s, r) => s + (r.commercial ?? 0), 0),
  fiscal: depreciationRows.value.reduce((s, r) => s + (r.fiscal ?? 0), 0),
}))

const amortisationTotal = computed(() => ({
  commercial: amortisationYtd.reduce((s, r) => s + (r.commercial ?? 0), 0),
  fiscal: amortisationYtd.reduce((s, r) => s + (r.fiscal ?? 0), 0),
}))

/** The asset with no statutory group, excluded from every fiscal figure here. */
const unclassified = computed(() => fixedAssets.filter((a) => a.taxGroup === null))
const unclassifiedCharge = H.unclassifiedCommercialYTD

/** A signed figure, or the words that explain why there is not one. */
function cell(v: number | null, absence = 'Not recognised') {
  if (v === null) return { text: t(absence), absent: true }
  return { text: formatIDR(v), absent: false }
}
function diff(a: number | null, b: number | null) {
  if (a === null || b === null) return null
  return a - b
}

function exportStatement() {
  infoToast(t('Export is not part of this screen yet.'))
}
</script>

<template>
  <div class="fb">
    <header class="fb__head">
      <p class="fb__sub">
        {{ t('Asset profit and loss impact · FY2026 to 30 September 2026 · PT Sinar Kencana Utama') }}
      </p>
      <MpButton variant="secondary" left-icon="download" @click="exportStatement">
        {{ t('Export') }}
      </MpButton>
    </header>

    <!-- What this statement leaves out, said before the numbers rather than after. -->
    <MpBanner v-if="unclassified.length" id="fb__note-banner" variant="warning" class="fb__note">
      <MpBannerIcon id="b-icon" />
      <MpBannerTitle>
        {{ unclassified.length }}
        {{ t(unclassified.length === 1 ? 'asset is outside this statement' : 'assets are outside this statement') }}
      </MpBannerTitle>
      <MpBannerDescription>
        {{ unclassified.map((a) => `${a.id} ${a.name}`).join(', ') }}
        {{ t('has no statutory group, so it has no fiscal figure to compare against. Its commercial charge of') }}
        {{ formatIDR(unclassifiedCharge) }}
        {{ t('is excluded from both columns so the two describe the same population.') }}
      </MpBannerDescription>
    </MpBanner>

    <div class="fb__card">
      <div class="fb__cardhead">
        <span class="fb__cardtitle">{{ t('Depreciation') }}</span>
        <MpSegmentedControl id="fb-grouping" name="fb-grouping" v-model="grouping" :data="groupingOptions" />
      </div>

      <table class="fb__table">
        <thead>
          <tr>
            <th class="fb__th">{{ grouping === 'class' ? t('Asset class') : t('Statutory group') }}</th>
            <th class="fb__th fb__th--num">{{ t('Commercial') }}</th>
            <th class="fb__th fb__th--num">{{ t('Fiscal') }}</th>
            <th class="fb__th fb__th--num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in depreciationRows" :key="r.label" class="fb__tr">
            <td class="fb__td">
              {{ r.label }}
              <span v-if="r.assets" class="fb__count">
                {{ r.assets }} {{ t(r.assets === 1 ? 'asset' : 'assets') }}
              </span>
            </td>
            <td class="fb__td fb__td--num">{{ cell(r.commercial).text }}</td>
            <td class="fb__td fb__td--num">{{ cell(r.fiscal).text }}</td>
            <td class="fb__td fb__td--num" :class="{ 'fb__td--pos': (diff(r.commercial, r.fiscal) ?? 0) > 0, 'fb__td--neg': (diff(r.commercial, r.fiscal) ?? 0) < 0 }">
              {{ cell(diff(r.commercial, r.fiscal)).text }}
            </td>
          </tr>
          <tr class="fb__tr fb__tr--total">
            <td class="fb__td">{{ t('Total depreciation') }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(depreciationTotal.commercial) }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(depreciationTotal.fiscal) }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(depreciationTotal.commercial - depreciationTotal.fiscal) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Amortisation. Goodwill and the brand are the reason this is a separate
         block rather than more rows: their commercial side does not exist. -->
    <div class="fb__card">
      <div class="fb__cardhead">
        <span class="fb__cardtitle">{{ t('Amortisation') }}</span>
        <span class="fb__hint">{{ t('Intangible assets') }}</span>
      </div>
      <table class="fb__table">
        <thead>
          <tr>
            <th class="fb__th">{{ t('Asset') }}</th>
            <th class="fb__th fb__th--num">{{ t('Commercial') }}</th>
            <th class="fb__th fb__th--num">{{ t('Fiscal') }}</th>
            <th class="fb__th fb__th--num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in amortisationYtd" :key="r.label" class="fb__tr">
            <td class="fb__td">
              {{ r.label }}
              <span v-if="r.basis" class="fb__basis">{{ r.basis }}</span>
            </td>
            <td class="fb__td fb__td--num" :class="{ 'fb__td--absent': r.commercial === null }">
              {{ cell(r.commercial, 'Not amortised').text }}
            </td>
            <td class="fb__td fb__td--num">{{ cell(r.fiscal).text }}</td>
            <td class="fb__td fb__td--num">
              {{ r.commercial === null ? formatIDR(0 - (r.fiscal ?? 0)) : formatIDR((r.commercial ?? 0) - (r.fiscal ?? 0)) }}
            </td>
          </tr>
          <tr class="fb__tr fb__tr--total">
            <td class="fb__td">{{ t('Total amortisation') }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(amortisationTotal.commercial) }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(amortisationTotal.fiscal) }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(amortisationTotal.commercial - amortisationTotal.fiscal) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Events. Each shows the same transaction landing differently on the two
         bases, which is the whole argument for holding both. -->
    <div class="fb__card">
      <div class="fb__cardhead">
        <span class="fb__cardtitle">{{ t('Disposal and impairment') }}</span>
      </div>
      <table class="fb__table">
        <thead>
          <tr>
            <th class="fb__th">{{ t('Event') }}</th>
            <th class="fb__th fb__th--num">{{ t('Commercial') }}</th>
            <th class="fb__th fb__th--num">{{ t('Fiscal') }}</th>
            <th class="fb__th fb__th--num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr class="fb__tr">
            <td class="fb__td">
              {{ t('Gain or loss on disposal') }}
              <span class="fb__basis">FA-0071 Cummins 250kVA Generator · {{ t('sold 15/08/2026') }}</span>
            </td>
            <td class="fb__td fb__td--num fb__td--pos">{{ formatIDR(H.disposalCommercialGain) }}</td>
            <td class="fb__td fb__td--num fb__td--neg">{{ formatIDR(H.disposalFiscalLoss) }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(H.disposalCommercialGain - H.disposalFiscalLoss) }}</td>
          </tr>
          <tr class="fb__tr">
            <td class="fb__td">
              {{ t('Impairment') }}
              <span class="fb__basis">FA-0068 Forklift Toyota 3T · {{ t('written down 30/06/2026') }}</span>
            </td>
            <td class="fb__td fb__td--num fb__td--neg">{{ formatIDR(H.impairmentCommercialOnly) }}</td>
            <!-- The cell that must never be 0. Fiscal does not recognise an
                 impairment until the loss is realised. -->
            <td class="fb__td fb__td--num fb__td--absent">{{ t('Not recognised') }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(H.impairmentCommercialOnly) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="fb__foot">
      <div class="fb__footrow">
        <span class="fb__footlabel">{{ t('Net temporary difference') }}</span>
        <span class="fb__footvalue">{{ formatIDR(H.netTemporaryDifference) }}</span>
      </div>
      <div class="fb__footrow fb__footrow--strong">
        <span class="fb__footlabel">
          {{ t('Deferred tax effect') }}
          <span class="fb__footnote">{{ t('at 22% · a disclosure, not a journal entry') }}</span>
        </span>
        <span class="fb__footvalue">{{ formatIDR(H.deferredTaxAt22pct) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fb { padding: 4px 0 32px; }
.fb__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; min-height: 32px; }
.fb__title { font-size: 18px; font-weight: 600; color: #1e2e2b; margin: 0; }
.fb__sub { font-size: 13px; color: #758195; margin: 0; max-width: 720px; }
.fb__note { margin-bottom: 16px; }

.fb__card { border: 1px solid #e2e7ed; border-radius: 10px; background: #fff; margin-bottom: 16px; overflow: hidden; }
.fb__cardhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #eef1f4; }
.fb__cardtitle { font-size: 14px; font-weight: 600; color: #1e2e2b; }
.fb__hint { font-size: 12px; color: #758195; }


.fb__table { width: 100%; border-collapse: collapse; }
.fb__th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #758195; background: #f8fafb; padding: 8px 16px; border-bottom: 1px solid #eef1f4; }
.fb__th--num { text-align: right; }
.fb__td { font-size: 13px; color: #232933; padding: 10px 16px; border-bottom: 1px solid #f4f6f8; vertical-align: top; }
.fb__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.fb__tr--total .fb__td { font-weight: 600; background: #fafbfc; border-top: 1px solid #e2e7ed; }
.fb__count, .fb__basis { display: block; font-size: 11px; color: #758195; margin-top: 2px; }

/* A figure that is legitimately absent. Never a zero — a zero would say the
   basis recognised the event and valued it at nothing. */
.fb__td--absent { color: #7a5700; font-weight: 600; }
.fb__td--pos { color: #027a4f; }
.fb__td--neg { color: #a8352d; }

.fb__foot { border: 1px solid #e2e7ed; border-radius: 10px; background: #fff; padding: 4px 16px; }
.fb__footrow { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 12px 0; }
.fb__footrow + .fb__footrow { border-top: 1px solid #f4f6f8; }
.fb__footlabel { font-size: 13px; color: #3a4749; }
.fb__footnote { display: block; font-size: 11px; color: #758195; }
.fb__footvalue { font-size: 16px; font-weight: 600; color: #1e2e2b; font-variant-numeric: tabular-nums; }
.fb__footrow--strong .fb__footvalue { font-size: 18px; }
</style>
