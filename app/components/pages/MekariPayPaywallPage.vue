<!--
  Mekari Pay — paywall / first-run page (shown from Integrations › Mekari Pay).
  Page FORMAT copied 1:1 from flex-web's InsuranceFirstRun (hero → two-step
  explainer → help footer), rebuilt with our Pixel 3 ERP primitives
  (css() + MpText + MpButton + MpIcon). Copy + illustrations are placeholders —
  meant to be re-worked in place later.
-->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { MpText, MpButton, MpIcon, css } from '@mekari/pixel3'

const { t } = useLocale()

// The stage renders a fixed 24px top border (a non-scrolling gap for normal
// pages) and clips its overflow to the padding box, so a negative margin can't
// reach past it. This hero must sit flush to the very top, so we zero that top
// border while this page is mounted and restore it on leave — page-scoped, no
// other page is touched.
const rootEl = ref<HTMLElement | null>(null)
let stageEl: HTMLElement | null = null
let prevBorderTopWidth = ''
onMounted(() => {
  stageEl = rootEl.value?.closest('.stage') as HTMLElement | null
  if (stageEl) {
    prevBorderTopWidth = stageEl.style.borderTopWidth
    stageEl.style.borderTopWidth = '0px'
  }
})
onBeforeUnmount(() => {
  if (stageEl) stageEl.style.borderTopWidth = prevBorderTopWidth
})

const COPY = {
  heroTitle: t('Collect and disburse payments, right from your ERP'),
  heroBody:
    t('Accept customer payments, pay vendors, and reconcile every transaction automatically—no more switching between apps or manual matching.'),
  cta: t('Activate Mekari Pay'),
  steps: [
    {
      label: t('Step 1'), thumb: '/illustrations/paywall-step-1.svg',
      title: t('Connect your Mekari Pay account'),
      body: t('Link Mekari Pay to start moving money in and out of your ERP.'),
      points: [
        [t('Verify your business:'), t('Complete a one-time KYC so we can enable payouts.')],
        [t('Link a settlement account:'), t('Choose the bank account funds settle into.')],
        [t('Set permissions:'), t('Decide who can initiate and approve payments.')],
      ],
    },
    {
      label: t('Step 2'), thumb: '/illustrations/paywall-step-2.svg',
      title: t('Start transacting'),
      body: t('Once connected, payments flow straight into your invoices and bills.'),
      points: [
        [t('Collect faster:'), t('Add a pay link to sales invoices and get paid online.')],
        [t('Pay vendors:'), t('Schedule and batch disbursements against purchase bills.')],
        [t('Auto-reconcile:'), t('Matched transactions post to the ledger automatically.')],
      ],
    },
  ],
  helpPrefix: t('Need help to set up? '),
  helpLink: t('Reach out to our customer success team'),
  helpSuffix: t(' for assistance.'),
}

// Bleed against the stage's 24px side padding so the hero spans edge to edge.
// The stage's top border is zeroed on mount (see above), so no negative top
// margin is needed — the hero sits flush to the top.
const root = css({ marginInline: '-6' })

const hero = css({
  position: 'relative', overflow: 'hidden',
  background: 'var(--mp-colors-info-weaker)',
  height: '420px',
  paddingInline: '12', gap: '8',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderTopLeftRadius: 'xl', borderTopRightRadius: 'xl',
})
const heroCol = css({ display: 'flex', flexDirection: 'column', gap: '6', maxWidth: '520px', flexShrink: 0 })
// Natural size, anchored to the bottom of the hero. Removed on tablet/mobile
// where it won't fit.
const heroImg = css({
  width: '673px', height: '420px', flexShrink: 0, alignSelf: 'flex-end', display: 'block',
  '@media (max-width: 1024px)': { display: 'none' },
})

const stepsWrap = css({
  display: 'flex', flexDirection: 'column', gap: '6', alignItems: 'center',
  paddingInline: '6', paddingBlock: '10',
})
const stepRow = css({ display: 'flex', gap: '6', width: '100%', maxWidth: '880px', alignItems: 'flex-start' })
const thumbImg = css({ flexShrink: 0, width: '202px', height: '180px', objectFit: 'contain' })
const stepText = css({ display: 'flex', flexDirection: 'column', gap: '3', minWidth: 0, flex: 1 })
const bulletList = css({ paddingLeft: '4', listStyleType: 'disc' })

// MpText has no heading sizes in our Pixel build (it falls back to 14px body),
// so headings are real <h1>/<h2> at the app's heading scale (page-title H1 = 24/600).
const heroTitle = css({ margin: 0, fontSize: '32px', fontWeight: '600', lineHeight: 'normal', color: 'text.default' })
const heroBody = css({ margin: 0, fontSize: '16px', fontWeight: '400', lineHeight: '24px', color: 'text.default' })
const stepTitle = css({ margin: 0, fontSize: '18px', fontWeight: '600', lineHeight: '28px', color: 'text.default' })

const footer = css({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2',
  borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'border.default',
  marginInline: '6', paddingTop: '5', paddingBottom: '20',
})
</script>

<template>
  <div ref="rootEl" :class="root">
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <div :class="hero">
      <div :class="heroCol">
        <div :class="css({ display: 'flex', flexDirection: 'column', gap: '2' })">
          <h1 :class="heroTitle">{{ COPY.heroTitle }}</h1>
          <p :class="heroBody">{{ COPY.heroBody }}</p>
        </div>
        <div>
          <MpButton class="btn-enterprise btn-enterprise--primary">{{ COPY.cta }}</MpButton>
        </div>
      </div>

      <img :class="heroImg" src="/illustrations/paywall-hero.png" alt="" aria-hidden="true" />
    </div>

    <!-- ── Two-step explainer ──────────────────────────────────────────── -->
    <div :class="stepsWrap">
      <div v-for="step in COPY.steps" :key="step.title" :class="stepRow">
        <!-- Thumbnail -->
        <img :class="thumbImg" :src="step.thumb" alt="" aria-hidden="true" />

        <!-- Text -->
        <div :class="stepText">
          <div :class="css({ display: 'flex', flexDirection: 'column' })">
            <MpText size="label-small" weight="semiBold" color="text.secondary">{{ step.label }}</MpText>
            <h2 :class="stepTitle">{{ step.title }}</h2>
          </div>
          <MpText size="body" color="text.default">{{ step.body }}</MpText>
          <ul :class="bulletList">
            <li v-for="(p, i) in step.points" :key="i">
              <MpText as="span" size="body" weight="semiBold" color="text.default">{{ p[0] }}</MpText>
              <MpText as="span" size="body" color="text.default"> {{ p[1] }}</MpText>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- ── Help footer ─────────────────────────────────────────────────── -->
    <div :class="footer">
      <MpIcon name="help" size="sm" color="icon.secondary" />
      <MpText size="body" color="text.default">{{ COPY.helpPrefix }}</MpText>
      <MpButton variant="textLink" size="sm">{{ COPY.helpLink }}</MpButton>
      <MpText size="body" color="text.default">{{ COPY.helpSuffix }}</MpText>
    </div>
  </div>
</template>
