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
import { computed, ref } from 'vue'
import {
  MpButton, MpIcon, MpInput, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { fixedAssets, carryingForTest, IMPAIRMENT_INDICATORS, CURRENT_PERIOD, FY_END } from '~/data/assetStore'
import { annualObligations, annualDone, annualOutstanding } from '~/data/assetIntangibles'
import { periodEndDate } from '~/data/assetEngine'
import { impairmentTests, recordImpairmentTest, type ImpairmentTest } from '~/data/fixedAssetSession'

const { t } = useLocale()
const router = useRouter()

const tests = impairmentTests

/**
 * OD-52, FG3-AC6. Goodwill and indefinite-life intangibles must be tested
 * every year whether or not an indicator exists. At year end the list is
 * raised; before it, 'Show year-end obligations' raises it on demand. Once
 * shown it stays, completed assets named beside the test that completed
 * them, so an all-done year still reads as done rather than as nothing due.
 */
const isYearEnd = CURRENT_PERIOD.endsWith('-12')
const obligationsShown = ref(isYearEnd || annualOutstanding.value.length > 0)

// ── Recording a test ────────────────────────────────────────────────────────
// The form asks for the recoverable amount and where it came from, and nothing
// else. The product does not compute recoverable amount — fair value is an
// appraisal, value in use is a discounted cash flow projection — so there is no
// calculator here and should not be one.
const formOpen = ref(false)
const formAsset = ref('')
const formIndicator = ref('')
const formRecoverable = ref('')
const formBasis = ref<ImpairmentTest['basis']>('Fair value less costs of disposal')
const formSource = ref('')
const formError = ref('')

const assetOptions = computed(() =>
  fixedAssets.value
    .filter((a) => a.status !== 'Disposed')
    .map((a) => ({ value: a.id, label: `${a.id} · ${a.name}` })),
)
const indicatorOptions = IMPAIRMENT_INDICATORS
const basisOptions: ImpairmentTest['basis'][] = [
  'Fair value less costs of disposal',
  'Value in use',
]

/** The carrying amount is read from the schedule, never typed. */
const carryingOf = computed(() => {
  if (!formAsset.value) return null
  return carryingForTest(formAsset.value)
})

function openForm(assetId = '') {
  formAsset.value = assetId
  formIndicator.value = assetId ? 'Annual test · indefinite life' : ''
  formRecoverable.value = ''
  formBasis.value = 'Fair value less costs of disposal'
  formSource.value = ''
  formError.value = ''
  formOpen.value = true
}

/**
 * Validated on submit rather than by disabling the button
 * (rule/btn-no-disabled-validation): a disabled control reports a blocker
 * without naming it.
 */
function submitTest() {
  const amount = Number(String(formRecoverable.value).replace(/[^\d]/g, ''))
  if (!formAsset.value) { formError.value = t('You must select an asset'); return }
  if (!formIndicator.value) { formError.value = t('You must select an indicator'); return }
  if (!amount) { formError.value = t('You must fill in recoverable amount'); return }
  if (!formSource.value.trim()) { formError.value = t('You must fill in source'); return }

  const r = recordImpairmentTest({
    assetId: formAsset.value,
    indicator: formIndicator.value,
    recoverable: amount,
    basis: formBasis.value,
    source: formSource.value.trim(),
  })
  // A refusal (a posted period, a disposed asset) is the form's error, not a toast.
  if (!r.ok) { formError.value = t(r.reason); return }
  formOpen.value = false
  successToast(r.event ? t('Impairment test saved. Impairment loss posted') : t('Impairment test saved. No impairment'))
}

function openAsset(id: string) { router.push(`/assets/${id}`) }
</script>

<template>
  <div class="im">
    <header class="im__head">
      <div class="im__headactions">
        <MpButton v-if="!obligationsShown" variant="secondary" is-rounded @click="obligationsShown = true">
          {{ t('Show annual tests') }}
        </MpButton>
        <MpButton is-rounded left-icon="add" @click="openForm()">
          {{ t('New test') }}
        </MpButton>
      </div>
    </header>

    <!-- The annual obligation, raised rather than remembered. -->
    <MpBanner v-if="obligationsShown && annualOutstanding.length" id="im__note-banner" variant="warning" class="im__note">
      <MpBannerIcon id="b-icon" />
      <MpBannerTitle>
        {{ annualOutstanding.length }}
        {{ t(annualOutstanding.length === 1 ? 'asset is due its annual test' : 'assets are due their annual test') }}
      </MpBannerTitle>
      <MpBannerDescription>
        {{ t('PSAK 48 requires goodwill and indefinite-life intangibles to be tested every year, with or without an indicator.') }}
      </MpBannerDescription>
    </MpBanner>

    <!-- OD-52: every asset under the obligation, done or not, by name. -->
    <div v-if="obligationsShown" class="im__annual" data-tour="imp-annual">
      <div class="im__annualhead">
        <div>
          <div class="im__annualtitle">{{ t(`Annual impairment tests · FY2026 · year end ${periodEndDate(FY_END)}`) }}</div>
          <div class="im__annualsub">
            {{ annualDone.length }} {{ t('of') }} {{ annualObligations.length }} {{ t('done') }}
            <template v-if="!annualOutstanding.length"> · {{ t('all required tests recorded') }}</template>
          </div>
        </div>
        <MpButton v-if="!isYearEnd" variant="ghost" is-rounded @click="obligationsShown = false">{{ t('Hide') }}</MpButton>
      </div>
      <div v-for="o in annualObligations" :key="o.asset.id" class="im__annualrow">
        <div class="im__annualasset">
          <span class="im__assetlink" @click="openAsset(o.asset.id)">{{ o.asset.id }} {{ o.asset.name }}</span>
          <span class="im__annualwhy">{{ t(o.why) }}</span>
        </div>
        <div v-if="o.test" class="im__annualstate">
          <span class="im__badge im__badge--nil">{{ t('Tested') }}</span>
          <span class="im__annualnote">{{ o.test.id }} · {{ o.test.date }} · {{ t(o.test.outcome) }}</span>
        </div>
        <div v-else class="im__annualstate">
          <span class="im__badge im__badge--hit">{{ t('Outstanding') }}</span>
          <MpButton variant="secondary" size="sm" is-rounded @click="openForm(o.asset.id)">{{ t('Test') }} {{ o.asset.id }}</MpButton>
        </div>
      </div>
      <p v-if="!annualObligations.length" class="im__annualnote im__annualempty">
        {{ t('No goodwill or indefinite-life intangibles. No annual test is due.') }}
      </p>
    </div>

    <!-- ── Record a test ── -->
    <div v-if="formOpen" class="im__form" data-tour="imp-form">
      <div class="im__formhead">
        <span class="im__formtitle">{{ t('New impairment test') }}</span>
        <MpButton variant="ghost" is-rounded :aria-label="t('Close')" @click="formOpen = false">
          <MpIcon name="close" size="sm" />
        </MpButton>
      </div>

      <div class="im__formgrid">
        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Asset') }}</label>
          <ErpFilterSelect id="im-asset" v-model="formAsset" :placeholder="t('Select asset')" :options="assetOptions" width="100%" />
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Indicator') }}</label>
          <ErpFilterSelect id="im-indicator" v-model="formIndicator" :placeholder="t('Select indicator')" :options="indicatorOptions" width="100%" />
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Carrying amount') }}</label>
          <div class="im__readonly">
            {{ carryingOf === null ? t('Select an asset first') : formatIDRWhole(carryingOf) }}
          </div>
          <div class="im__formnote">{{ t('From the depreciation schedule at today\'s date') }}</div>
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Recoverable amount') }}</label>
          <MpInput id="im-recoverable" v-model="formRecoverable" />
          <div class="im__formnote">{{ t('From an appraisal or a value-in-use projection') }}</div>
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Basis') }}</label>
          <ErpFilterSelect id="im-basis" v-model="formBasis" :placeholder="t('Select basis')" :options="basisOptions" width="100%" />
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Source') }}</label>
          <MpInput id="im-source" v-model="formSource" :placeholder="t('Example: Appraisal, PT Penilai Independen')" />
        </div>
      </div>

      <div v-if="formError" class="im__formerror">{{ formError }}</div>

      <div class="im__formactions">
        <MpButton variant="ghost" is-rounded @click="formOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded data-tour="dlg-primary" @click="submitTest">{{ t('Save test') }}</MpButton>
      </div>
    </div>

    <div v-for="x in tests" :key="x.id" class="im__card" :class="{ 'im__card--nil': x.outcome === 'Not impaired' }" :data-tour="`imp-card-${x.assetId}`">
      <div class="im__top">
        <div>
          <span class="im__id">{{ x.id }} · {{ x.date }}</span>
          <div class="im__asset">
            <span class="im__assetlink" @click="openAsset(x.assetId)">{{ x.assetId }} {{ x.assetName }}</span>
          </div>
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
          <div class="im__v im__v--num">{{ formatIDRWhole(x.carrying) }}</div>
          <div class="im__note2">{{ t('At the test date') }}</div>
        </div>
        <div class="im__field">
          <div class="im__k">{{ t('Recoverable amount') }}</div>
          <div class="im__v im__v--num">{{ formatIDRWhole(x.recoverable) }}</div>
          <div class="im__note2">{{ x.basis }} · {{ x.source }}</div>
        </div>
        <div class="im__field">
          <div class="im__k">{{ t('Result') }}</div>
          <div class="im__v im__v--num" :class="{ 'im__v--loss': x.loss }">
            <template v-if="x.loss">{{ formatIDRWhole(0 - x.loss) }}</template>
            <template v-else>{{ t('No impairment') }}</template>
          </div>
          <div v-if="x.loss" class="im__note2">
            {{ t('Accounting book only. Tax recognises the loss when it is realised') }}
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
.im__head { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.im__note { margin-bottom: var(--mp-spacing-4); }
.im__headactions { display: flex; gap: var(--mp-spacing-2); flex: none; }
.im__annual { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); margin-bottom: var(--mp-spacing-4); }
.im__annualhead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.im__annualtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.im__annualsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.im__annualrow { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.im__annualrow:last-of-type { border-bottom: 0; }
.im__annualasset { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.im__annualwhy { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.im__annualstate { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: none; }
.im__annualnote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.im__annualempty { margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); }

/* Record a test — inline rather than in a drawer, because it is short and the
   list behind it is the context for what you are entering. */
.im__form { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); margin-bottom: var(--mp-spacing-4); }
.im__formhead { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.im__formtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.im__formgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
@media (max-width: 900px) { .im__formgrid { grid-template-columns: repeat(2, 1fr); } }
.im__formfield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.im__formlabel { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.im__readonly {
  padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md);
  background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.im__formnote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm); }
/* rule/form-errors-inline — the error sits with the form, not in a toast. */
.im__formerror { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); padding: 0 var(--mp-spacing-4) var(--mp-spacing-2); }
.im__formactions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.im__assetlink { color: var(--mp-text-link); cursor: pointer; }
.im__assetlink:hover { text-decoration: underline; }

.im__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); padding: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-3); }
/* A test that found nothing is not a lesser record — it is the evidence. It is
   toned down, not hidden. */
.im__card--nil { background: var(--mp-background-neutral-subtle); }

.im__top { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.im__id { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.im__asset { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-top: var(--mp-spacing-1); }
.im__badge { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); padding: var(--mp-spacing-1) var(--mp-spacing-2); border-radius: var(--mp-radii-full); flex: none; }
.im__badge--hit { background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); }
.im__badge--nil { background: var(--mp-colors-background-success); color: var(--mp-colors-text-success); }

.im__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--mp-spacing-4); }
@media (max-width: 900px) { .im__grid { grid-template-columns: repeat(2, 1fr); } }
.im__k { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); }
.im__v { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); margin-top: var(--mp-spacing-1); }
.im__v--num { font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-semi-bold); }
.im__v--loss { color: var(--mp-text-danger); }
.im__note2 { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); line-height: var(--mp-line-heights-sm); }

.im__foot { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-4); padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); }
.im__foot strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
</style>
