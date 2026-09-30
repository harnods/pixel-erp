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
import { infoToast, successToast } from '~/utils/toasts'
import ExportModal from '~/components/patterns/ExportModal.vue'
import {
  impactByClass, impactByTaxGroup, amortisationYtd, disposalImpactRows, impairmentImpactRows,
  statementFigures, DIFFERENCE_CONVENTION, type ImpactRow,
} from '~/data/fixedAssetScreens'
import { fixedAssets } from '~/data/assetStore'

const { t } = useLocale()

/** Group the depreciation lines by class or by the statutory group. */
type Grouping = 'class' | 'taxGroup'
const grouping = ref<Grouping>('class')
const groupingOptions = [
  { id: 'grp-class', value: 'class', label: 'By class' },
  { id: 'grp-tax', value: 'taxGroup', label: 'By tax group' },
]
const depreciationRows = computed<ImpactRow[]>(() =>
  grouping.value === 'class' ? impactByClass() : impactByTaxGroup(),
)

const depreciationTotal = computed(() => ({
  commercial: depreciationRows.value.reduce((s, r) => s + (r.commercial ?? 0), 0),
  fiscal: depreciationRows.value.reduce((s, r) => s + (r.fiscal ?? 0), 0),
  difference: depreciationRows.value.reduce((s, r) => s + r.difference, 0),
}))

const amortisationTotal = computed(() => ({
  commercial: amortisationYtd.value.reduce((s, r) => s + (r.commercial ?? 0), 0),
  fiscal: amortisationYtd.value.reduce((s, r) => s + (r.fiscal ?? 0), 0),
  difference: amortisationYtd.value.reduce((s, r) => s + r.difference, 0),
}))

/** Disposals and impairments in the year, each on both books. */
const disposals = computed(() => disposalImpactRows())
const impairments = computed(() => impairmentImpactRows())
/** Net temporary difference and deferred tax, computed from the books. */
const H = statementFigures

/** The asset with no statutory group, excluded from every fiscal figure here. */
const unclassified = computed(() => fixedAssets.value.filter((a) => a.taxGroup === null))
const unclassifiedCharge = computed(() => H.value.unclassifiedAccounting)

/** A signed figure, or the words that explain why there is not one. */
function cell(v: number | null, absence = 'Not recognised') {
  if (v === null) return { text: t(absence), absent: true }
  return { text: formatIDR(v), absent: false }
}
/** Signed, so the direction reads without a legend. */
function signed(v: number) {
  return v === 0 ? formatIDR(0) : `${v > 0 ? '+' : '−'}${formatIDR(Math.abs(v))}`
}

// rule/export-modal — export opens the shared modal, never a silent download.
const exportOpen = ref(false)
const exportColumns = [
  { key: 'label', label: t('Line') },
  { key: 'accounting', label: t('Accounting') },
  { key: 'tax', label: t('Tax') },
  { key: 'difference', label: t('Difference') },
  { key: 'taxGroup', label: t('Statutory group') },
  { key: 'assets', label: t('Assets') },
]
const router = useRouter()
function exportStatement() { infoToast(t('Not in this prototype')) }
function onExport() {
  exportOpen.value = false
  successToast(t('Export ready — check your downloads'))
}
</script>

<template>
  <div class="fb">
    <header class="fb__head">
      <p class="fb__sub">
        {{ t('Asset profit and loss impact · FY2026 to 30 September 2026 · PT Central Perk Indonesia') }}
      </p>
      <div class="fb__headright">
        <span class="fb__link" @click="router.push('/tax-differences')">{{ t('Differences by asset') }}</span>
        <span class="fb__link" @click="router.push('/lampiran-9')">{{ t('Lampiran 9') }}</span>
        <span class="fb__link" @click="router.push('/asset-roll-forward')">{{ t('Roll-forward') }}</span>
        <MpButton variant="secondary" is-rounded @click="exportStatement">
          {{ t('Export') }}
        </MpButton>
      </div>
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
        {{ t('has no statutory group, so there is no tax figure to compare against. Its accounting charge of') }}
        {{ formatIDR(unclassifiedCharge) }}
        {{ t('is excluded from both columns so the two describe the same population.') }}
      </MpBannerDescription>
    </MpBanner>

    <!-- The sign convention, once for the page. -->
    <p class="fb__convention" data-testid="fb-convention">{{ t(DIFFERENCE_CONVENTION) }}</p>

    <div class="fb__card">
      <div class="fb__cardhead">
        <span class="fb__cardtitle">{{ t('Depreciation') }}</span>
        <MpSegmentedControl id="fb-grouping" name="fb-grouping" v-model="grouping" :data="groupingOptions" />
      </div>

      <table class="fb__table">
        <thead>
          <tr>
            <th class="fb__th">{{ grouping === 'class' ? t('Asset class') : t('Statutory group') }}</th>
            <th class="fb__th fb__th--num">{{ t('Accounting') }}</th>
            <th class="fb__th fb__th--num">{{ t('Tax') }}</th>
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
            <td class="fb__td fb__td--num" :class="{ 'fb__td--pos': r.difference > 0, 'fb__td--neg': r.difference < 0 }">
              {{ signed(r.difference) }}
            </td>
          </tr>
          <tr class="fb__tr fb__tr--total">
            <td class="fb__td">{{ t('Total depreciation') }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(depreciationTotal.commercial) }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(depreciationTotal.fiscal) }}</td>
            <td class="fb__td fb__td--num">{{ signed(depreciationTotal.difference) }}</td>
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
            <th class="fb__th fb__th--num">{{ t('Accounting') }}</th>
            <th class="fb__th fb__th--num">{{ t('Tax') }}</th>
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
            <td class="fb__td fb__td--num">{{ signed(r.difference) }}</td>
          </tr>
          <tr class="fb__tr fb__tr--total">
            <td class="fb__td">{{ t('Total amortisation') }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(amortisationTotal.commercial) }}</td>
            <td class="fb__td fb__td--num">{{ formatIDR(amortisationTotal.fiscal) }}</td>
            <td class="fb__td fb__td--num">{{ signed(amortisationTotal.difference) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Events. Each shows the same transaction landing differently on the two
         bases, which is the whole argument for holding both. -->
    <div class="fb__card" data-tour="cmp-disposal">
      <div class="fb__cardhead">
        <span class="fb__cardtitle">{{ t('Disposal and impairment') }}</span>
        <span class="fb__hint">{{ t('A disposal\'s gain or loss on each book: the tax figure is proceeds less the fiscal carrying amount') }}</span>
      </div>
      <table class="fb__table">
        <thead>
          <tr>
            <th class="fb__th">{{ t('Event') }}</th>
            <th class="fb__th fb__th--num">{{ t('Accounting') }}</th>
            <th class="fb__th fb__th--num">{{ t('Tax') }}</th>
            <th class="fb__th fb__th--num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in disposals" :key="r.basis ?? r.label" class="fb__tr">
            <td class="fb__td">
              {{ t(r.label) }}
              <span class="fb__basis">{{ r.basis }}</span>
            </td>
            <td class="fb__td fb__td--num" :class="(r.commercial ?? 0) >= 0 ? 'fb__td--pos' : 'fb__td--neg'">{{ cell(r.commercial).text }}</td>
            <td class="fb__td fb__td--num" :class="(r.fiscal ?? 0) >= 0 ? 'fb__td--pos' : 'fb__td--neg'">{{ cell(r.fiscal).text }}</td>
            <td class="fb__td fb__td--num">{{ signed(r.difference) }}</td>
          </tr>
          <tr v-if="!disposals.length" class="fb__tr">
            <td class="fb__td fb__td--absent" colspan="4">{{ t('No disposal this year. When one is recorded its fiscal gain or loss appears here.') }}</td>
          </tr>
          <tr v-for="r in impairments" :key="r.basis ?? r.label" class="fb__tr">
            <td class="fb__td">
              {{ t(r.label) }}
              <span class="fb__basis">{{ r.basis }}</span>
            </td>
            <td class="fb__td fb__td--num fb__td--neg">{{ cell(r.commercial).text }}</td>
            <!-- The cell that must never be 0. Fiscal does not recognise an
                 impairment until the loss is realised. -->
            <td class="fb__td fb__td--num fb__td--absent">{{ t('Not recognised') }}</td>
            <td class="fb__td fb__td--num">{{ signed(r.difference) }}</td>
          </tr>
          <tr class="fb__tr fb__tr--total">
            <td class="fb__td">{{ t('Total disposal and impairment') }}</td>
            <td class="fb__td" colspan="2" />
            <td class="fb__td fb__td--num">{{ signed(H.sections.disposalAndImpairment) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Right-of-use assets: shown with their difference, kept out of the
         total. The PRD does not put them in the asset statement's net
         temporary difference, and their tax deduction is the payment. -->
    <div class="fb__card" data-testid="fb-lease">
      <div class="fb__cardhead">
        <span class="fb__cardtitle">{{ t('Leases') }}</span>
        <span class="fb__hint">{{ t('Shown for completeness, not included in the net temporary difference') }}</span>
      </div>
      <table class="fb__table">
        <tbody>
          <tr class="fb__tr">
            <td class="fb__td">
              {{ t(H.leaseLine.label) }}
              <span class="fb__count">{{ H.leaseLine.assets }} {{ t(H.leaseLine.assets === 1 ? 'asset' : 'assets') }}</span>
              <span class="fb__basis">{{ t(H.leaseLine.basis ?? '') }}</span>
            </td>
            <td class="fb__td fb__td--num">{{ cell(H.leaseLine.commercial).text }}</td>
            <td class="fb__td fb__td--num">{{ cell(H.leaseLine.fiscal).text }}</td>
            <td class="fb__td fb__td--num">{{ signed(H.leaseLine.difference) }} <span class="fb__excluded">{{ t('excluded') }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="fb__foot" data-tour="cmp-deftax">
      <div class="fb__footrow">
        <span class="fb__footlabel">
          {{ t('Net temporary difference') }}
          <span class="fb__footnote">{{ t('depreciation, amortisation, disposal and impairment above; leases excluded') }}</span>
        </span>
        <span class="fb__footvalue" data-testid="fb-net">{{ signed(H.netTemporaryDifference) }}</span>
      </div>
      <div class="fb__footrow fb__footrow--strong">
        <span class="fb__footlabel">
          {{ t('Deferred tax effect') }}
          <span class="fb__footnote">{{ t(`at ${Math.round(H.taxRate * 100)}% of the net temporary difference · ${H.deferredTax >= 0 ? 'a deferred tax asset' : 'a deferred tax liability'} · a disclosure, not a journal entry`) }}</span>
        </span>
        <span class="fb__footvalue" data-testid="fb-deferred">{{ formatIDR(Math.abs(H.deferredTax)) }}</span>
      </div>
    </div>

    <ExportModal
      :open="exportOpen"
      :title="t('Export the profit and loss impact')"
      :entity-label="t('lines')"
      :columns="exportColumns"
      :total="impactByClass.length + amortisationYtd.length + 2"
      @close="exportOpen = false"
      @export="onExport"
    />
  </div>
</template>

<style scoped>
.fb__headright { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.fb__link { color: var(--mp-text-link); cursor: pointer; font-size: var(--mp-font-sizes-md); }
.fb__link:hover { text-decoration: underline; }

.fb__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.fb__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.fb__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }
.fb__note { margin-bottom: var(--mp-spacing-4); }

.fb__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); margin-bottom: var(--mp-spacing-4); overflow: hidden; }
.fb__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.fb__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.fb__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.fb__convention { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0 0 var(--mp-spacing-3); }
.fb__excluded { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }


.fb__table { width: 100%; border-collapse: collapse; }
.fb__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.fb__th--num { text-align: right; }
.fb__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.fb__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.fb__tr--total .fb__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); border-top: 1px solid var(--mp-border-default); }
.fb__count, .fb__basis { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }

/* A figure that is legitimately absent. Never a zero — a zero would say the
   basis recognised the event and valued it at nothing. */
.fb__td--absent { color: var(--mp-colors-text-warning); font-weight: var(--mp-font-weights-semi-bold); }
.fb__td--pos { color: var(--mp-colors-text-success); }
.fb__td--neg { color: var(--mp-text-danger); }

.fb__foot { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); padding: var(--mp-spacing-1) var(--mp-spacing-4); }
.fb__footrow { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) 0; }
.fb__footrow + .fb__footrow { border-top: 1px solid var(--mp-border-default); }
.fb__footlabel { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.fb__footnote { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.fb__footvalue { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.fb__footrow--strong .fb__footvalue { font-size: var(--mp-font-sizes-xl); }
</style>
