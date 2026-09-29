<script setup lang="ts">
/**
 * Tax differences (OD-04, OD-40, OD-07).
 *
 * The commercial to fiscal difference, three ways: per asset with the reason
 * (the report a tax reviewer reads), per profit and loss line with both
 * columns (the koreksi fiskal), and by class or statutory group. Every figure
 * is computed from the ledgers the store replays, so recording a value
 * change or a disposal moves it here the moment it is recorded.
 *
 * The per-asset total is checked against the statement's net temporary
 * difference, so the two views cannot drift apart unnoticed.
 */
import { computed, ref } from 'vue'
import { MpSegmentedControl, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { differenceByAsset } from '~/data/fixedAssetScreens'
import { statementFigures } from '~/data/fixedAssetScreens'
import { impactBy } from '~/data/assetTaxbook'
import { fixedAssets, CURRENT_PERIOD } from '~/data/assetStore'
import { periodLabel } from '~/data/assetEngine'

const { t } = useLocale()
const router = useRouter()

type View = 'asset' | 'line' | 'class' | 'group'
const view = ref<View>('asset')
const viewOptions = [
  { id: 'td-asset', value: 'asset', label: 'By asset' },
  { id: 'td-line', value: 'line', label: 'By P&L line' },
  { id: 'td-class', value: 'class', label: 'By class' },
  { id: 'td-group', value: 'group', label: 'By statutory group' },
]

const byAsset = computed(() => differenceByAsset())
const assetTotal = computed(() => byAsset.value.reduce((s, r) => s + (r.difference ?? 0), 0))
const H = statementFigures
/** The per-asset view is the tangible half; it must equal the statement's figure. */
const ties = computed(() => assetTotal.value === H.value.netTemporaryDifference)

const impact = computed(() => impactBy(view.value === 'asset' ? 'line' : view.value))

const unclassified = computed(() => fixedAssets.value.filter((a) => a.taxGroup === null && a.status !== 'Disposed' && a.status !== 'Split'))

function signed(v: number) {
  return v === 0 ? formatIDR(0) : `${v > 0 ? '+' : '−'}${formatIDR(Math.abs(v))}`
}
</script>

<template>
  <div class="td">
    <header class="td__head">
      <p class="td__sub">
        {{ t(`Commercial to fiscal difference · FY2026 to ${periodLabel(CURRENT_PERIOD)} · computed from both books`) }}
      </p>
      <div class="td__links">
        <span class="td__link" @click="router.push('/tax-book')">{{ t('Profit and loss impact') }}</span>
        <span class="td__link" @click="router.push('/lampiran-9')">{{ t('Lampiran 9') }}</span>
      </div>
    </header>

    <MpBanner v-if="unclassified.length" id="td-unclassified" variant="warning" class="td__note">
      <MpBannerIcon id="td-b-icon" />
      <MpBannerTitle>{{ unclassified.length }} {{ t(unclassified.length === 1 ? 'asset has no tax book' : 'assets have no tax book') }}</MpBannerTitle>
      <MpBannerDescription>
        {{ unclassified.map((a) => `${a.id} ${a.name}`).join(', ') }}.
        {{ t('Nothing here includes it: there is no fiscal figure to compare against.') }}
        <span class="td__link" @click="router.push({ path: '/assets', query: { filter: 'unclassified' } })">{{ t('Classify it') }}</span>
      </MpBannerDescription>
    </MpBanner>

    <div class="td__bar">
      <MpSegmentedControl id="td-view" name="td-view" v-model="view" :data="viewOptions" />
    </div>

    <!-- ── Per asset, with the reason ── -->
    <div v-if="view === 'asset'" class="td__card">
      <div class="td__cardhead">
        <span class="td__cardtitle">{{ t('Per asset and event') }}</span>
        <span class="td__hint">{{ t('Tangible assets. Positive is a further deduction on the fiscal book; negative is added back.') }}</span>
      </div>
      <table class="td__table">
        <thead>
          <tr>
            <th class="td__th">{{ t('Asset') }}</th>
            <th class="td__th">{{ t('Why the books disagree') }}</th>
            <th class="td__th td__th--num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in byAsset" :key="`${r.id}-${r.tag}-${i}`" class="td__tr">
            <td class="td__td">
              <span v-if="r.id" class="td__assetlink" @click="router.push(`/assets/${r.id}`)">{{ r.id }}</span>
              <span class="td__name">{{ r.name }}</span>
              <span v-if="r.tag" class="td__tag">{{ t(r.tag) }}</span>
            </td>
            <td class="td__td td__td--reason">{{ t(r.reason) }}</td>
            <td class="td__td td__td--num">{{ signed(r.difference ?? 0) }}</td>
          </tr>
          <tr v-if="!byAsset.length" class="td__tr">
            <td class="td__td" colspan="3">{{ t('The books agree on every asset this year.') }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="td__tr td__tr--total">
            <td class="td__td" colspan="2">
              {{ t('Net temporary difference') }}
              <span class="td__check" :class="ties ? 'td__check--ok' : 'td__check--bad'">
                {{ ties ? t('Ties to the statement') : t(`Does not tie: the statement carries ${formatIDR(H.netTemporaryDifference)}`) }}
              </span>
            </td>
            <td class="td__td td__td--num">{{ signed(assetTotal) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- ── Two columns, per line or grouped ── -->
    <div v-else class="td__card">
      <div class="td__cardhead">
        <span class="td__cardtitle">
          {{ view === 'line' ? t('Profit and loss impact, per line') : view === 'class' ? t('By asset class') : t('By statutory group') }}
        </span>
        <span class="td__hint">{{ t('Charges to profit. A gain on disposal is negative. Tangible and intangible, classified assets only.') }}</span>
      </div>
      <table class="td__table">
        <thead>
          <tr>
            <th class="td__th">{{ view === 'line' ? t('Line') : view === 'class' ? t('Class') : t('Statutory group') }}</th>
            <th class="td__th td__th--num">{{ t('Assets') }}</th>
            <th class="td__th td__th--num">{{ t('Commercial') }}</th>
            <th class="td__th td__th--num">{{ t('Fiscal') }}</th>
            <th class="td__th td__th--num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in impact.rows" :key="r.key" class="td__tr">
            <td class="td__td">{{ t(r.key) }}</td>
            <td class="td__td td__td--num">{{ r.assets }}</td>
            <td class="td__td td__td--num">{{ formatIDR(r.accounting) }}</td>
            <td class="td__td td__td--num">
              <template v-if="r.key === 'Impairment loss'">{{ t('Not recognised') }}</template>
              <template v-else>{{ formatIDR(r.fiscal) }}</template>
            </td>
            <td class="td__td td__td--num">{{ signed(r.difference) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="td__tr td__tr--total">
            <td class="td__td">{{ t('Total') }}</td>
            <td class="td__td td__td--num">{{ impact.total.assets }}</td>
            <td class="td__td td__td--num">{{ formatIDR(impact.total.accounting) }}</td>
            <td class="td__td td__td--num">{{ formatIDR(impact.total.fiscal) }}</td>
            <td class="td__td td__td--num">{{ signed(impact.total.difference) }}</td>
          </tr>
        </tfoot>
      </table>
      <p v-if="impact.excluded" class="td__foot">
        {{ t(`Excluded: ${impact.excluded} ${impact.excluded === 1 ? 'asset' : 'assets'} with no tax book, carrying ${formatIDR(impact.excludedAccounting)} of accounting charge.`) }}
      </p>
    </div>

    <!-- ── Deferred tax (OD-07) ── -->
    <div class="td__summary">
      <div class="td__sumrow">
        <span>{{ t('Net temporary difference, tangible') }}</span>
        <span class="td__sumval">{{ formatIDR(H.netTemporaryDifference) }}</span>
      </div>
      <div class="td__sumrow td__sumrow--strong">
        <span>
          {{ t('Deferred tax effect') }}
          <span class="td__hint">{{ t(`at ${Math.round(H.taxRate * 100)}% · ${H.deferredTax >= 0 ? 'a deferred tax liability' : 'a deferred tax asset'} · a disclosure, not a journal`) }}</span>
        </span>
        <span class="td__sumval">{{ formatIDR(Math.abs(H.deferredTax)) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.td__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.td__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; }
.td__links { display: flex; gap: var(--mp-spacing-4); }
/* rule/table-name-link-span */
.td__link, .td__assetlink { color: var(--mp-text-link); cursor: pointer; }
.td__link:hover, .td__assetlink:hover { text-decoration: underline; }
.td__note { margin-bottom: var(--mp-spacing-4); }
.td__bar { margin-bottom: var(--mp-spacing-3); }
.td__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
.td__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.td__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.td__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-weight: var(--mp-font-weights-regular); }
.td__table { width: 100%; border-collapse: collapse; }
.td__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.td__th--num { text-align: right; }
.td__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.td__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.td__td--reason { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.td__name { margin-left: var(--mp-spacing-2); }
.td__tag { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm); padding: 0 var(--mp-spacing-1); }
.td__tr--total .td__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); border-bottom: 0; }
.td__check { margin-left: var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); }
.td__check--ok { color: var(--mp-colors-text-success); }
.td__check--bad { color: var(--mp-text-danger); }
.td__foot { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.td__summary { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); }
.td__sumrow { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.td__sumrow:last-child { border-bottom: 0; }
.td__sumrow--strong { font-weight: var(--mp-font-weights-semi-bold); }
.td__sumval { font-variant-numeric: tabular-nums; }
</style>
