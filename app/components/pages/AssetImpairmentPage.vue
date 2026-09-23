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
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { fixedAssets } from '~/data/fixedAssets'
import { impairmentTests, recordImpairmentTest, type ImpairmentTest } from '~/data/fixedAssetSession'

const { t } = useLocale()
const router = useRouter()

const tests = impairmentTests

/**
 * Goodwill and indefinite-life intangibles must be tested every year whether or
 * not an indicator exists. An obligation with no prompt gets met when someone
 * remembers.
 */
const annualDue = computed(() => fixedAssets.filter((a) => a.indefiniteLife))
const annualDone = computed(() =>
  annualDue.value.filter((a) => tests.value.some((x) => x.assetId === a.id && x.indicator.includes('Annual'))),
)
const annualOutstanding = computed(() =>
  annualDue.value.filter((a) => !annualDone.value.includes(a)),
)

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
  fixedAssets
    .filter((a) => a.status !== 'Disposed')
    .map((a) => ({ value: a.id, label: `${a.id} · ${a.name}` })),
)
const indicatorOptions = [
  'Physical damage',
  'Market value has fallen',
  'Obsolescence',
  'Idle or held for disposal',
  'Annual test · indefinite life',
  'Worse performance than expected',
]
const basisOptions: ImpairmentTest['basis'][] = [
  'Fair value less costs of disposal',
  'Value in use',
]

/** The carrying amount is read from the schedule, never typed. */
const carryingOf = computed(() => {
  const a = fixedAssets.find((x) => x.id === formAsset.value)
  if (!a) return null
  return a.bookValueCommercial ?? a.cost
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
  if (!formAsset.value) { formError.value = t('Choose the asset being tested'); return }
  if (!formIndicator.value) { formError.value = t('Choose what prompted the test'); return }
  if (!amount) { formError.value = t('Enter the recoverable amount'); return }
  if (!formSource.value.trim()) { formError.value = t('Say where the recoverable amount came from'); return }

  recordImpairmentTest({
    assetId: formAsset.value,
    indicator: formIndicator.value,
    recoverable: amount,
    basis: formBasis.value,
    source: formSource.value.trim(),
  })
  formOpen.value = false
  const impaired = carryingOf.value !== null && amount < carryingOf.value
  successToast(impaired ? t('Test recorded — impairment recognised') : t('Test recorded — no impairment'))
}

function openAsset(id: string) { router.push(`/assets/${id}`) }
</script>

<template>
  <div class="im">
    <header class="im__head">
      <p class="im__sub">
        {{ t('PSAK 48 · the obligation is to test, so a test that finds nothing is retained as the evidence it happened') }}
      </p>
      <MpButton is-rounded @click="openForm()">
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

    <!-- Testing the outstanding asset is one click from the reminder. -->
    <div v-if="annualOutstanding.length" class="im__dueactions">
      <MpButton
        v-for="a in annualOutstanding" :key="a.id"
        variant="secondary" is-rounded
        @click="openForm(a.id)"
      >{{ t('Test') }} {{ a.id }}</MpButton>
    </div>

    <!-- ── Record a test ── -->
    <div v-if="formOpen" class="im__form">
      <div class="im__formhead">
        <span class="im__formtitle">{{ t('Record an impairment test') }}</span>
        <MpButton variant="ghost" is-rounded :aria-label="t('Close')" @click="formOpen = false">
          <MpIcon name="close" size="sm" />
        </MpButton>
      </div>

      <div class="im__formgrid">
        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Asset') }}</label>
          <ErpFilterSelect id="im-asset" v-model="formAsset" :placeholder="t('Choose an asset')" :options="assetOptions" width="100%" />
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('What prompted the test') }}</label>
          <ErpFilterSelect id="im-indicator" v-model="formIndicator" :placeholder="t('Choose an indicator')" :options="indicatorOptions" width="100%" />
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Carrying amount') }}</label>
          <!-- Read from the schedule, never typed: a test compares against what
               the asset is actually carried at. -->
          <div class="im__readonly">
            {{ carryingOf === null ? t('Choose an asset first') : formatIDR(carryingOf) }}
          </div>
          <div class="im__formnote">{{ t('Read from the schedule at today\'s date') }}</div>
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Recoverable amount') }}</label>
          <MpInput id="im-recoverable" v-model="formRecoverable" />
          <div class="im__formnote">
            {{ t('From your valuer or your own projection — the product does not compute this') }}
          </div>
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Basis') }}</label>
          <ErpFilterSelect id="im-basis" v-model="formBasis" :placeholder="t('Choose a basis')" :options="basisOptions" width="100%" />
        </div>

        <div class="im__formfield">
          <label class="im__formlabel">{{ t('Source') }}</label>
          <MpInput id="im-source" v-model="formSource" />
          <div class="im__formnote">{{ t('Who or what the figure came from') }}</div>
        </div>
      </div>

      <div v-if="formError" class="im__formerror">{{ formError }}</div>

      <div class="im__formactions">
        <MpButton variant="ghost" is-rounded @click="formOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded @click="submitTest">{{ t('Save') }}</MpButton>
      </div>
    </div>

    <div v-for="x in tests" :key="x.id" class="im__card" :class="{ 'im__card--nil': x.outcome === 'Not impaired' }">
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
.im__dueactions { display: flex; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); flex-wrap: wrap; }

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
.im__formerror { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical); padding: 0 var(--mp-spacing-4) var(--mp-spacing-2); }
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
