<script setup lang="ts">
/**
 * Roll-forward (TS-06): the carrying amount per class from the start of the
 * year to the current period, on either book.
 *
 * Every column is summed from its own source: additions from acquisitions,
 * improvements and cost corrections; disposals from the carrying amount at
 * each disposal; depreciation from the charges; impairment from the losses
 * less reversals. The closing is the book value, computed separately. The
 * last column is what is left unexplained, so a failure shows instead of
 * being absorbed.
 */
import { computed, ref } from 'vue'
import { MpSegmentedControl } from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import { rollForward } from '~/data/assetTaxbook'
import { CURRENT_PERIOD, FY_START } from '~/data/assetStore'
import { periodLabel, addPeriods, type Book } from '~/data/assetEngine'

const { t } = useLocale()
const router = useRouter()

const book = ref<Book>('accounting')
const bookOptions = [
  { id: 'rf-acc', value: 'accounting', label: 'Accounting book' },
  { id: 'rf-tax', value: 'tax', label: 'Tax book' },
]

const rf = computed(() => rollForward(book.value))
const hasTransfers = computed(() => rf.value.rows.some((r) => r.transfers !== 0))
const ties = computed(() => rf.value.total.unexplained === 0 && rf.value.rows.every((r) => r.unexplained === 0))

function neg(v: number) { return v === 0 ? formatIDRWhole(0) : `(${formatIDRWhole(v)})` }
function signed(v: number) { return v < 0 ? `(${formatIDRWhole(-v)})` : formatIDRWhole(v) }
</script>

<template>
  <div class="rf">
    <header class="rf__head">
      <p class="rf__sub">
        {{ t(`Book value by class · ${periodLabel(addPeriods(FY_START, -1))} to ${periodLabel(CURRENT_PERIOD)}`) }}
      </p>
      <MpSegmentedControl id="rf-book" name="rf-book" v-model="book" :data="bookOptions" />
    </header>

    <div class="rf__card">
      <div class="rf__cardhead">
        <span class="rf__cardtitle">{{ book === 'accounting' ? t('Accounting book') : t('Tax book') }}</span>
        <span class="rf__status" :class="ties ? 'rf__status--ok' : 'rf__status--bad'">
          {{ ties ? t('All classes reconcile') : t('A class does not reconcile. Check the Unexplained column.') }}
        </span>
      </div>
      <table class="rf__table">
        <thead>
          <tr>
            <th class="rf__th">{{ t('Class') }}</th>
            <th class="rf__th rf__th--num">{{ t('Assets') }}</th>
            <th class="rf__th rf__th--num">{{ t('Opening') }}</th>
            <th class="rf__th rf__th--num">{{ t('Additions') }}</th>
            <th v-if="hasTransfers" class="rf__th rf__th--num">{{ t('Transfers') }}</th>
            <th class="rf__th rf__th--num">{{ t('Disposals') }}</th>
            <th class="rf__th rf__th--num">{{ t('Depreciation') }}</th>
            <th class="rf__th rf__th--num">{{ t('Impairment') }}</th>
            <th class="rf__th rf__th--num">{{ t('Closing') }}</th>
            <th class="rf__th rf__th--num">{{ t('Unexplained') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rf.rows" :key="r.class" class="rf__tr">
            <td class="rf__td">{{ r.class }}</td>
            <td class="rf__td rf__td--num">{{ r.assets }}</td>
            <td class="rf__td rf__td--num">{{ formatIDRWhole(r.opening) }}</td>
            <td class="rf__td rf__td--num">{{ formatIDRWhole(r.additions) }}</td>
            <td v-if="hasTransfers" class="rf__td rf__td--num">{{ signed(r.transfers) }}</td>
            <td class="rf__td rf__td--num">{{ neg(r.disposals) }}</td>
            <td class="rf__td rf__td--num">{{ neg(r.depreciation) }}</td>
            <td class="rf__td rf__td--num">
              <template v-if="book === 'tax'">{{ t('Not recognised') }}</template>
              <template v-else>{{ r.impairment < 0 ? formatIDRWhole(-r.impairment) : neg(r.impairment) }}</template>
            </td>
            <td class="rf__td rf__td--num rf__td--strong">{{ formatIDRWhole(r.closing) }}</td>
            <td class="rf__td rf__td--num" :class="r.unexplained ? 'rf__td--bad' : 'rf__td--ok'">{{ formatIDRWhole(r.unexplained) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="rf__tr rf__tr--total">
            <td class="rf__td">{{ t('Total') }}</td>
            <td class="rf__td rf__td--num">{{ rf.total.assets }}</td>
            <td class="rf__td rf__td--num">{{ formatIDRWhole(rf.total.opening) }}</td>
            <td class="rf__td rf__td--num">{{ formatIDRWhole(rf.total.additions) }}</td>
            <td v-if="hasTransfers" class="rf__td rf__td--num">{{ signed(rf.total.transfers) }}</td>
            <td class="rf__td rf__td--num">{{ neg(rf.total.disposals) }}</td>
            <td class="rf__td rf__td--num">{{ neg(rf.total.depreciation) }}</td>
            <td class="rf__td rf__td--num">
              <template v-if="book === 'tax'">{{ t('Not recognised') }}</template>
              <template v-else>{{ rf.total.impairment < 0 ? formatIDRWhole(-rf.total.impairment) : neg(rf.total.impairment) }}</template>
            </td>
            <td class="rf__td rf__td--num">{{ formatIDRWhole(rf.total.closing) }}</td>
            <td class="rf__td rf__td--num" :class="rf.total.unexplained ? 'rf__td--bad' : 'rf__td--ok'">{{ formatIDRWhole(rf.total.unexplained) }}</td>
          </tr>
        </tfoot>
      </table>
      <p v-if="book === 'tax' && rf.excluded.length" class="rf__foot">
        {{ t(`Not in the tax book: ${rf.excluded.join(', ')}`) }}
        <span class="rf__link" @click="router.push({ path: '/assets', query: { filter: 'unclassified' } })">{{ t(rf.excluded.length === 1 ? 'Classify asset' : 'Classify assets') }}</span>
      </p>
      <p v-else-if="hasTransfers" class="rf__foot">{{ t('Transfers: book value moved between classes by an asset split') }}</p>
    </div>
  </div>
</template>

<style scoped>
.rf__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.rf__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; }
.rf__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.rf__cardhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.rf__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rf__status { font-size: var(--mp-font-sizes-sm); }
.rf__status--ok { color: var(--mp-colors-text-success); }
.rf__status--bad { color: var(--mp-text-danger); }
.rf__table { width: 100%; border-collapse: collapse; }
.rf__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.rf__th--num { text-align: right; }
.rf__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); }
.rf__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rf__td--strong { font-weight: var(--mp-font-weights-semi-bold); }
.rf__td--ok { color: var(--mp-text-secondary); }
.rf__td--bad { color: var(--mp-text-danger); font-weight: var(--mp-font-weights-semi-bold); }
.rf__tr--total .rf__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); border-bottom: 0; }
.rf__foot { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.rf__link { color: var(--mp-text-link); cursor: pointer; margin-left: var(--mp-spacing-2); }
</style>
