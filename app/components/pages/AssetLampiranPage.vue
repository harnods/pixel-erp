<script setup lang="ts">
/**
 * Lampiran 9 (OD-05, OD-48): the fiscal depreciation and amortisation
 * attachment to the SPT Tahunan PPh Badan, as a screen.
 *
 * Both halves, per asset, with the ten statutory fields: group or code,
 * asset, month and year acquired, cost, fiscal value at the start of the
 * year, commercial method, fiscal method, the year's fiscal charge, fiscal
 * value at the end, and a note. Every figure is the tax book's.
 *
 * It refuses while any asset held in the year has no statutory group
 * (FG1-AC2, FG9-AC4): a filing that silently leaves an asset out is a wrong
 * filing, so the count and the cost left out are stated with a link to the
 * register filtered to exactly those assets. The Export control is not part
 * of this prototype.
 */
import { computed } from 'vue'
import { MpButton, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import { lampiranRows, lampiranStatus, type LampiranRow } from '~/data/assetTaxbook'
import { CURRENT_PERIOD } from '~/data/assetStore'
import { periodLabel } from '~/data/assetEngine'

const { t } = useLocale()
const router = useRouter()

const status = computed(() => lampiranStatus())
const halves = computed(() => [
  { key: 'Tangible', title: 'Part 1 · Tangible assets (penyusutan)', groupHead: 'Tax group', rows: lampiranRows('Tangible') },
  { key: 'Intangible', title: 'Part 2 · Intangible assets (amortisasi)', groupHead: 'Intangible code · group', rows: lampiranRows('Intangible') },
])

function sum(rows: LampiranRow[], k: 'cost' | 'charge' | 'openingFiscal' | 'closingFiscal') {
  return rows.reduce((s, r) => s + (r[k] ?? 0), 0)
}
function money(v: number | null) { return v === null ? '–' : formatIDRWhole(v) }

function openUnclassified() {
  router.push({ path: '/assets', query: { filter: 'unclassified' } })
}
</script>

<template>
  <div class="lp">
    <header class="lp__head" data-tour="lamp-export">
      <p class="lp__sub">
        {{ t(`FY2026 to ${periodLabel(CURRENT_PERIOD)} · PT Central Perk Indonesia`) }}
      </p>
      <MpButton variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Export') }}</MpButton>
    </header>

    <MpBanner v-if="!status.ready" id="lp-refuse" variant="danger" class="lp__note">
      <MpBannerIcon id="lp-b-icon" />
      <MpBannerTitle>
        {{ t('Classify all assets to produce Lampiran 9') }}
      </MpBannerTitle>
      <MpBannerDescription>
        {{ status.unclassified.length }}
        {{ t(status.unclassified.length === 1 ? 'asset held this year has no tax group' : 'assets held this year have no tax group') }}
        ({{ status.unclassified.map((a) => a.id).join(', ') }}) ·
        {{ formatIDRWhole(status.unreportedCost) }} {{ t('of cost missing from the filing') }}
        <span class="lp__link" @click="openUnclassified">
          {{ t(status.unclassified.length === 1 ? 'View unclassified asset' : 'View unclassified assets') }}
        </span>
      </MpBannerDescription>
    </MpBanner>
    <MpBanner v-else id="lp-ready" variant="success" class="lp__note">
      <MpBannerIcon id="lp-ok-icon" />
      <MpBannerTitle>{{ t('All assets held this year are classified') }}</MpBannerTitle>
      <MpBannerDescription>
        {{ t('Part 1') }}: {{ status.tangible }} · {{ t('Part 2') }}: {{ status.intangible }}
      </MpBannerDescription>
    </MpBanner>

    <div class="lp__counts" data-tour="lamp-both">
      <div class="lp__count"><span class="lp__countk">{{ t('Part 1 · tangible') }}</span><span class="lp__countv">{{ status.tangible }}</span></div>
      <div class="lp__count"><span class="lp__countk">{{ t('Part 2 · intangible') }}</span><span class="lp__countv">{{ status.intangible }}</span></div>
      <div class="lp__count" :class="{ 'lp__count--bad': !status.ready }">
        <span class="lp__countk">{{ t('Unclassified') }}</span><span class="lp__countv">{{ status.unclassified.length }}</span>
      </div>
    </div>

    <div v-for="h in halves" :key="h.key" class="lp__card" :class="{ 'lp__card--blocked': !status.ready }">
      <div class="lp__cardhead">
        <span class="lp__cardtitle">{{ t(h.title) }}</span>
        <span class="lp__hint">{{ h.rows.length }} {{ t(h.rows.length === 1 ? 'asset' : 'assets') }}</span>
      </div>
      <div class="lp__scroll">
        <table class="lp__table">
          <thead>
            <tr>
              <th class="lp__th lp__th--n">#</th>
              <th class="lp__th">{{ t(h.groupHead) }}</th>
              <th class="lp__th">{{ t('Asset') }}</th>
              <th class="lp__th">{{ t('Acquired') }}</th>
              <th class="lp__th lp__th--num">{{ t('Cost') }}</th>
              <th class="lp__th lp__th--num">{{ t('Tax book value, start of year') }}</th>
              <th class="lp__th">{{ t('Accounting method') }}</th>
              <th class="lp__th">{{ t('Tax method') }}</th>
              <th class="lp__th lp__th--num">{{ t('Tax charge this year') }}</th>
              <th class="lp__th lp__th--num">{{ t('Tax book value, end') }}</th>
              <th class="lp__th">{{ t('Note') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in h.rows" :key="r.id" class="lp__tr">
              <td class="lp__td lp__td--n">{{ i + 1 }}</td>
              <td class="lp__td">{{ r.group }}</td>
              <td class="lp__td">
                <span class="lp__link" @click="router.push(`/assets/${r.id}`)">{{ r.id }}</span> {{ r.name }}
              </td>
              <td class="lp__td lp__td--num">{{ r.acquired }}</td>
              <td class="lp__td lp__td--num">{{ formatIDRWhole(r.cost) }}</td>
              <td class="lp__td lp__td--num">{{ money(r.openingFiscal) }}</td>
              <td class="lp__td">{{ t(r.commercialMethod) }}</td>
              <td class="lp__td">{{ t(r.fiscalMethod) }}</td>
              <td class="lp__td lp__td--num">{{ formatIDRWhole(r.charge) }}</td>
              <td class="lp__td lp__td--num">{{ money(r.closingFiscal) }}</td>
              <td class="lp__td lp__td--note">{{ r.note ? t(r.note) : '' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="lp__tr lp__tr--total">
              <td class="lp__td" colspan="4">{{ t('Total') }}</td>
              <td class="lp__td lp__td--num">{{ formatIDRWhole(sum(h.rows, 'cost')) }}</td>
              <td class="lp__td lp__td--num">{{ formatIDRWhole(sum(h.rows, 'openingFiscal')) }}</td>
              <td class="lp__td" colspan="2" />
              <td class="lp__td lp__td--num">{{ formatIDRWhole(sum(h.rows, 'charge')) }}</td>
              <td class="lp__td lp__td--num">{{ formatIDRWhole(sum(h.rows, 'closingFiscal')) }}</td>
              <td class="lp__td" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lp__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.lp__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; }
.lp__note { margin-bottom: var(--mp-spacing-4); }
/* rule/table-name-link-span */
.lp__link { color: var(--mp-text-link); cursor: pointer; }
.lp__link:hover { text-decoration: underline; }
.lp__counts { display: flex; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.lp__count { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); min-width: 160px; }
.lp__count--bad .lp__countv { color: var(--mp-text-danger); }
.lp__countk { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.lp__countv { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.lp__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; margin-bottom: var(--mp-spacing-4); }
/* Refused: the figures stay readable but plainly are not a filing. */
.lp__card--blocked { opacity: 0.6; }
.lp__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.lp__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.lp__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.lp__scroll { overflow-x: auto; }
.lp__table { width: 100%; border-collapse: collapse; min-width: 1280px; }
.lp__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); vertical-align: bottom; }
.lp__th--num { text-align: right; }
.lp__th--n, .lp__td--n { width: 1%; color: var(--mp-text-secondary); }
.lp__td { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.lp__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lp__td--note { color: var(--mp-text-secondary); }
.lp__tr--total .lp__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); border-bottom: 0; }
</style>
