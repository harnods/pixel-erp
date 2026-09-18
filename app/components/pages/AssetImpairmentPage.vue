<script setup lang="ts">
/**
 * Impairment tests.
 *
 * Under PSAK 48 the obligation is to *test*, not to impair. An entity that
 * cannot show it tested has a finding regardless of what the test would have
 * concluded — which is why a test finding no impairment is kept, and why this
 * is a register of tests rather than a field on an asset.
 *
 * The product does not compute recoverable amount. Fair value less costs of
 * disposal is an appraisal; value in use is a discounted cash flow projection.
 * Both come from the entity's accountant. Drawing a calculator here would
 * promise something the product deliberately does not do.
 */
import { computed } from 'vue'
import { MpButton, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import { fixedAssets } from '~/data/fixedAssets'

const { t } = useLocale()

interface ImpairmentTest {
  id: string
  assetId: string
  assetName: string
  date: string
  indicator: string
  carrying: number
  recoverable: number
  basis: 'Fair value less costs of disposal' | 'Value in use'
  source: string
  author: string
  outcome: 'Impaired' | 'Not impaired'
  loss: number | null
}

/** The two tests in the sample year. One found nothing, and is kept. */
const tests: ImpairmentTest[] = [
  {
    id: 'IT-2026-01',
    assetId: 'FA-0068',
    assetName: 'Forklift Toyota 3T',
    date: '30/06/2026',
    indicator: 'Physical damage',
    carrying: 201_250_000,
    recoverable: 184_000_000,
    basis: 'Fair value less costs of disposal',
    source: 'Appraisal · PT Penilai Independen',
    author: 'Rizal Candra',
    outcome: 'Impaired',
    loss: 17_250_000,
  },
  {
    id: 'IT-2026-02',
    assetId: 'FA-0093',
    assetName: 'Registered brand — Sinar Kencana',
    date: '31/12/2026',
    indicator: 'Annual test · indefinite life',
    carrying: 900_000_000,
    recoverable: 1_050_000_000,
    basis: 'Value in use',
    source: 'Management projection',
    author: 'Sari Wulandari',
    outcome: 'Not impaired',
    loss: null,
  },
]

/**
 * Goodwill and indefinite-life intangibles must be tested every year whether or
 * not an indicator exists. An obligation with no prompt gets met when someone
 * remembers.
 */
const annualDue = computed(() =>
  fixedAssets.filter((a) => a.indefiniteLife),
)
const annualDone = computed(() =>
  annualDue.value.filter((a) => tests.some((x) => x.assetId === a.id && x.indicator.includes('Annual'))),
)
const annualOutstanding = computed(() =>
  annualDue.value.filter((a) => !annualDone.value.includes(a)),
)
</script>

<template>
  <div class="im">
    <header class="im__head">
      <p class="im__sub">
        {{ t('PSAK 48 · the obligation is to test, so a test that finds nothing is retained as the evidence it happened') }}
      </p>
      <MpButton is-rounded @click="infoToast(t('Recording a test is not part of this screen yet.'))">
        {{ t('Record a test') }}
      </MpButton>
    </header>

    <!-- The annual obligation, raised rather than remembered. -->
    <MpBanner v-if="annualOutstanding.length" id="im__note-banner" variant="warning" class="im__note">
      <MpBannerIcon id="b-icon" />
      <MpBannerTitle>
        {{ annualOutstanding.length }}
        {{ t(annualOutstanding.length === 1 ? 'asset is due its annual test' : 'assets are due their annual test') }}
      </MpBannerTitle>
      <MpBannerDescription>
        {{ annualOutstanding.map((a) => `${a.id} ${a.name}`).join(', ') }}.
        {{ t('Goodwill and indefinite-life intangibles are tested every year whether or not an indicator exists.') }}
        {{ annualDone.length }} {{ t('of') }} {{ annualDue.length }} {{ t('done.') }}
      </MpBannerDescription>
    </MpBanner>

    <div v-for="x in tests" :key="x.id" class="im__card" :class="{ 'im__card--nil': x.outcome === 'Not impaired' }">
      <div class="im__top">
        <div>
          <span class="im__id">{{ x.id }} · {{ x.date }}</span>
          <div class="im__asset">{{ x.assetId }} {{ x.assetName }}</div>
        </div>
        <span class="im__badge" :class="x.outcome === 'Impaired' ? 'im__badge--hit' : 'im__badge--nil'">
          {{ t(x.outcome) }}
        </span>
      </div>

      <div class="im__grid">
        <div class="im__field">
          <div class="im__k">{{ t('Indicator') }}</div>
          <div class="im__v">{{ x.indicator }}</div>
        </div>
        <div class="im__field">
          <div class="im__k">{{ t('Carrying amount') }}</div>
          <div class="im__v im__v--num">{{ formatIDR(x.carrying) }}</div>
          <div class="im__note2">{{ t('read from the schedule at the test date') }}</div>
        </div>
        <div class="im__field">
          <div class="im__k">{{ t('Recoverable amount') }}</div>
          <div class="im__v im__v--num">{{ formatIDR(x.recoverable) }}</div>
          <!-- The one figure the product does not produce. Saying where it came
               from is the point of holding the test as a record. -->
          <div class="im__note2">{{ x.basis }} · {{ x.source }}</div>
        </div>
        <div class="im__field">
          <div class="im__k">{{ t('Result') }}</div>
          <div class="im__v im__v--num" :class="{ 'im__v--loss': x.loss }">
            <template v-if="x.loss">{{ formatIDR(0 - x.loss) }}</template>
            <template v-else>{{ t('No impairment') }}</template>
          </div>
          <div v-if="x.loss" class="im__note2">
            {{ t('accounting only · tax does not recognise it until realised') }}
          </div>
        </div>
      </div>

      <div class="im__foot">
        {{ t('Recorded by') }} <strong>{{ x.author }}</strong> · {{ x.date }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.im { max-width: 980px; }
.im__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.im__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.im__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }
.im__note { margin-bottom: var(--mp-spacing-4); }

.im__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); padding: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
/* A test that found nothing is not a lesser record — it is the evidence. It is
   toned down, not hidden. */
.im__card--nil { background: var(--mp-background-neutral-subtle); }

.im__top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.im__id { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.im__asset { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-top: var(--mp-spacing-1); }
.im__badge { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); padding: var(--mp-spacing-1) var(--mp-spacing-2); border-radius: var(--mp-radii-full); flex: none; }
.im__badge--hit { background: var(--mp-background-warning-subtle); color: var(--mp-text-warning); }
.im__badge--nil { background: var(--mp-background-success-subtle); color: var(--mp-text-success); }

.im__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--mp-spacing-4); }
@media (max-width: 900px) { .im__grid { grid-template-columns: repeat(2, 1fr); } }
.im__k { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); }
.im__v { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); margin-top: var(--mp-spacing-1); }
.im__v--num { font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-semi-bold); }
.im__v--loss { color: var(--mp-text-critical); }
.im__note2 { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); line-height: var(--mp-line-heights-sm); }

.im__foot { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-4); padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); }
.im__foot strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
</style>
