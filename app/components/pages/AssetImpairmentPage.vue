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
import { MpButton, MpIcon, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'
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
      <div>
        <h2 class="im__title">{{ t('Impairment tests') }}</h2>
        <p class="im__sub">
          {{ t('PSAK 48 · the obligation is to test, so a test that finds nothing is retained as the evidence it happened') }}
        </p>
      </div>
      <MpButton @click="infoToast(t('Recording a test is not part of this screen yet.'))">
        {{ t('Record a test') }}
      </MpButton>
    </header>

    <!-- The annual obligation, raised rather than remembered. -->
    <MpBanner v-if="annualOutstanding.length" type="warning" is-rounded class="im__note">
      <MpBannerIcon />
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
            {{ t('commercial only · fiscal does not recognise it until realised') }}
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
.im { padding: 4px 0 32px; max-width: 980px; }
.im__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.im__title { font-size: 18px; font-weight: 600; color: #1e2e2b; margin: 0; }
.im__sub { font-size: 13px; color: #758195; margin: 4px 0 0; max-width: 640px; }
.im__note { margin-bottom: 16px; }

.im__card { border: 1px solid #e2e7ed; border-radius: 10px; background: #fff; padding: 16px; margin-bottom: 12px; }
/* A test that found nothing is not a lesser record — it is the evidence. It is
   toned down, not hidden. */
.im__card--nil { background: #fcfdfd; }

.im__top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.im__id { font-size: 11px; color: #758195; font-variant-numeric: tabular-nums; }
.im__asset { font-size: 14px; font-weight: 600; color: #1e2e2b; margin-top: 2px; }
.im__badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; flex: none; }
.im__badge--hit { background: #fdf9c4; color: #7a5700; }
.im__badge--nil { background: #e8f4ef; color: #027a4f; }

.im__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 900px) { .im__grid { grid-template-columns: repeat(2, 1fr); } }
.im__k { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #758195; }
.im__v { font-size: 14px; color: #232933; margin-top: 3px; }
.im__v--num { font-variant-numeric: tabular-nums; font-weight: 600; }
.im__v--loss { color: #a8352d; }
.im__note2 { font-size: 11px; color: #758195; margin-top: 3px; line-height: 15px; }

.im__foot { font-size: 12px; color: #758195; margin-top: 14px; padding-top: 10px; border-top: 1px solid #f4f6f8; }
.im__foot strong { color: #3a4749; font-weight: 600; }
</style>
