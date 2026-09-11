<!--
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Mekari ERP — Settings › Dimensions (first-run / paywall)
  Source: Figma fileKey nZdSEnyXOmQVbSWYhcwyGT, node 4507:174985 ("Index / First Run Page")
  Token mode: Pixel 2.4
  Patterns used: layout-shell, paywall (hero → value props → step explainer → CTA → feedback)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  STATES INCLUDED:
    - Happy path only. This page is the "not activated yet" state itself —
      there is no further empty/loading/error state to show here. Once
      Dimensions is activated the Settings > Dimensions page should route to
      the actual classification/values management UI (out of scope for now).

  COPY DEFAULTS (input did not specify — iterate freely):
    - none; copy is taken verbatim from the Figma source.

  CONVENTION OVERRIDES applied (Figma path only):
    - Buttons are Pixel <MpButton is-rounded> (rule/btn-mpbutton-standard) rather
      than Figma's generic "Button (E)" component; the ERP secondary look comes
      from erp.css's global variant override, not .btn-enterprise.
    - Hero illustration and the 3 step thumbnails are flattened Figma exports
      (single PNGs) rather than hand-rebuilt nested layers — matches how the
      sibling TaxPaywallPage/MekariPayPaywallPage illustrations work.
    - Hero horizontal padding and illustration size are scaled down from the
      Figma source (which assumed a fixed 1200px-wide stage) to stay
      responsive at the widths this app's stage actually renders at.

  OPEN ITEMS for product/design follow-up:
    - Build the post-activation Dimensions management page's create/edit form
      (classification types, values, mandatory toggle) — out of scope; the
      "+ New dimension" button on the management page (DimensionsIndexPage.vue)
      currently shows a "coming soon" toast.
-->
<script setup lang="ts">
import { MpText, MpIcon, MpButton, MpTooltip, toast, css } from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'

const emit = defineEmits<{ activate: [] }>()

const { t } = useLocale()

const COPY = {
  heroTitle: t('Elevate your business performance tracking with Dimensions'),
  heroBody: t(
    'Classify transaction lines by SBU, branch, or any category for your business without adding new accounts. Data is automatically reflected in profit and loss reports, budgets, and the Multidimensional report.',
  ),
  primaryCta: t('Start using Dimensions'),
  learnMore: t('Learn more'),
  valueProps: [
    {
      icon: 'finance' as const,
      title: t('One transaction line with multiple dimensions'),
      body: t('A single transaction line can be tagged with multiple dimensions, enabling cross-dimensional analysis.'),
    },
    {
      icon: 'protection' as const,
      title: t('Accurate cost and profit analysis with Multidimensional'),
      body: t('Get an accurate picture of cost and profit with dimensions tagged at the transaction line level.'),
    },
    {
      icon: 'sales' as const,
      title: t('Track performance without hundreds of accounts'),
      body: t('Monitor your dimensions in real time without expanding your chart of accounts.'),
    },
  ],
  howItWorksTitle: t('How does this feature work?'),
  steps: [
    {
      label: t('Step 1'),
      thumb: '/illustrations/dimensions-step-1.png',
      title: t('Activate and configure Dimensions'),
      items: [
        { text: t('On the Dimensions page, add the types of dimensions you want to use, such as Branch, SBU, Project, or Channel.') },
        { text: t('Add the values you need for each dimension and set whether filling it in is mandatory for transactions.') },
      ],
    },
    {
      label: t('Step 2'),
      thumb: '/illustrations/dimensions-step-2.png',
      title: t('Use Dimensions in your transactions'),
      items: [
        { text: t('On each line of your transaction, click the Dimensions column.') },
        { text: t('Select the dimension that applies to the line item, for example, Branch: Jakarta.') },
        {
          text: t('The system automatically tags the dimension at the transaction line level and reflects it in reports, including:'),
          subBullets: [
            t('Multidimensional report (shows profit and loss by dimension)'),
            t('Budget variance report'),
            t('General ledger report, grouped by dimension.'),
          ],
        },
      ],
    },
    {
      label: t('Step 3'),
      thumb: '/illustrations/dimensions-step-3.png',
      title: t('Analyze your Multidimensional report'),
      items: [
        { text: t('Analyze the dimensions you tagged across transactions in the Multidimensional report, General Ledger, and P&L Budgeting report.') },
        {
          text: t('In these reports, you can:'),
          subBullets: [
            t('Compare dimension values side by side across the selected timeframe.'),
            t('Compare all dimensions within each period to track trends over time.'),
          ],
        },
      ],
    },
  ],
  ctaQuestion: t('Ready to track business performance with Dimensions?'),
  ctaButton: t('Activate Dimensions'),
  helpfulLabel: t('Was this helpful?'),
}

// "Learn more" has no destination yet, and the feedback pair records nothing —
// both say so rather than looking clickable and doing nothing.
function learnMore() { infoToast(t('Dimensions guide — coming soon')) }

const feedback = ref<'up' | 'down' | ''>('')
function sendFeedback(v: 'up' | 'down') {
  feedback.value = v
  toast.notify({ variant: 'success', title: t('Thanks for your feedback'), rootProps: { class: 'toast-enterprise' } })
}

// Sits inside the stage's own 24px padding (left/right/top/bottom) — no
// bleed, matching Figma's Masthead card being fully inset within the Stage.
const root = css({ display: 'flex', flexDirection: 'column', gap: '5' })

// No padding on the card itself — the background image bleeds edge to edge.
// Only the text column (heroCol) is padded, so it insets from the card edges
// while the image stays flush.
const hero = css({
  position: 'relative', overflow: 'hidden',
  background: 'background.neutral.subtle',
  minHeight: '378px',
  display: 'flex', alignItems: 'center',
  borderRadius: 'xl',
})
// Image sits absolutely behind the text column (Figma: image z-1, text col z-2,
// overlapping by a negative right margin) rather than as a flex sibling beside it.
const heroCol = css({
  position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '6',
  maxWidth: '480px', paddingLeft: '10', paddingBlock: '8',
})
// The illustration is sized off the card's HEIGHT, not a fixed width: pinned to
// the right edge and scaled to fill all 378px, so the card never shows bands of
// bare background above and below it. Its width follows the asset's own ratio
// and is cropped by the card's overflow:hidden; the text column sits above it
// (heroCol z-1) over the illustration's empty left side.
const heroImg = css({
  position: 'absolute', top: '0', right: '0',
  height: '100%', width: '58%',
  // never wider than the space left of the text column (heroCol: 480px + its
  // 40px inset), so it can't run under the CTA row
  maxWidth: 'calc(100% - 520px)',
  // cover, not contain: the illustration is scaled off the card's height and
  // cropped horizontally, rather than shrunk until it no longer fills the card
  objectFit: 'cover', objectPosition: 'right center',
  zIndex: 0, pointerEvents: 'none',
  // below this the leftover strip is too narrow to crop into anything
  // recognisable, so the hero drops to text only
  '@media (max-width: 1280px)': { display: 'none' },
})

// MpText has no heading sizes in our Pixel build, so the three heading roles are
// spelled out here at their rule/type-scale sizes — H1 24, H2 20, H3 16, all
// semibold (rule/type-heading-semibold).
const headingH1 = css({ margin: 0, fontSize: '24px', fontWeight: '600', lineHeight: '32px', color: 'text.default', letterSpacing: '-0.2px' })
const headingH2 = css({ margin: 0, fontSize: '20px', fontWeight: '600', lineHeight: '28px', color: 'text.default' })

const content = css({ display: 'flex', flexDirection: 'column', gap: '10', width: '100%', maxWidth: '760px', marginInline: 'auto', paddingBlock: '5' })

const valuePropsRow = css({ display: 'flex', flexWrap: 'wrap', gap: '6' })
const valueCol = css({ display: 'flex', flexDirection: 'column', gap: '6', flex: '1 1 200px', minWidth: '200px' })
const valueTextCol = css({ display: 'flex', flexDirection: 'column', gap: '2' })
const valueTitle = css({ margin: 0, fontSize: '14px', fontWeight: '600', lineHeight: '24px', color: 'text.default' })

const stepsSection = css({ display: 'flex', flexDirection: 'column', gap: '5' })
const stepsList = css({ display: 'flex', flexDirection: 'column', gap: '5' })
const stepRow = css({ display: 'flex', gap: '6', alignItems: 'flex-start', flexWrap: 'wrap' })
const thumbImg = css({
  flexShrink: 0, width: '220px', height: '180px', objectFit: 'cover',
  borderRadius: 'xl', border: '1px solid', borderColor: 'border.default',
  background: 'background.surface',
})
const stepText = css({ display: 'flex', flexDirection: 'column', gap: '1', minWidth: '260px', flex: 1 })
const stepTitle = css({ margin: 0, fontSize: '16px', fontWeight: '600', lineHeight: '24px', color: 'text.default' })
const orderedList = css({ paddingLeft: '5', listStyleType: 'decimal', color: 'text.secondary' })
const bulletList = css({ paddingLeft: '5', listStyleType: 'disc', color: 'text.secondary' })

const ctaSection = css({
  display: 'flex', flexDirection: 'column', gap: '4',
  borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'border.default',
  paddingTop: '5',
})
const ctaQuestion = css({ margin: 0, fontSize: '16px', fontWeight: '600', lineHeight: '24px', color: 'text.default' })

const feedbackRow = css({ display: 'flex', alignItems: 'center', gap: '2' })
</script>

<template>
  <div :class="root">
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <div :class="hero">
      <div :class="heroCol">
        <div :class="css({ display: 'flex', flexDirection: 'column', gap: '2' })">
          <h1 :class="headingH1">{{ COPY.heroTitle }}</h1>
          <MpText size="body" color="text.secondary">{{ COPY.heroBody }}</MpText>
        </div>
        <div :class="css({ display: 'flex', alignItems: 'center', gap: '4' })">
          <MpButton variant="primary" is-rounded @click="emit('activate')">{{ COPY.primaryCta }}</MpButton>
          <MpButton variant="ghost" is-rounded @click="learnMore">{{ COPY.learnMore }}</MpButton>
        </div>
      </div>

      <img :class="heroImg" src="/illustrations/dimensions-hero.png" alt="" aria-hidden="true" />
    </div>

    <div :class="content">
      <!-- ── Value props ────────────────────────────────────────────────── -->
      <div :class="valuePropsRow">
        <div v-for="prop in COPY.valueProps" :key="prop.title" :class="valueCol">
          <MpIcon :name="prop.icon" size="md" color="icon.default" />
          <div :class="valueTextCol">
            <p :class="valueTitle">{{ prop.title }}</p>
            <MpText size="body" color="text.secondary">{{ prop.body }}</MpText>
          </div>
        </div>
      </div>

      <!-- ── How does this feature work? ───────────────────────────────── -->
      <div :class="stepsSection">
        <h2 :class="headingH2">{{ COPY.howItWorksTitle }}</h2>

        <div :class="stepsList">
          <div v-for="step in COPY.steps" :key="step.title" :class="css({ display: 'flex', flexDirection: 'column', gap: '3' })">
            <div :class="css({ display: 'flex', flexDirection: 'column' })">
              <MpText size="label-small" weight="semiBold" color="text.secondary">{{ step.label }}</MpText>
              <h3 :class="stepTitle">{{ step.title }}</h3>
            </div>

            <div :class="stepRow">
              <img :class="thumbImg" :src="step.thumb" alt="" aria-hidden="true" />

              <div :class="stepText">
                <ol :class="orderedList">
                  <li v-for="(item, i) in step.items" :key="i">
                    <MpText as="span" size="body" color="text.secondary">{{ item.text }}</MpText>
                    <ul v-if="item.subBullets" :class="bulletList">
                      <li v-for="(bullet, j) in item.subBullets" :key="j">
                        <MpText as="span" size="body" color="text.secondary">{{ bullet }}</MpText>
                      </li>
                    </ul>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Bottom CTA ─────────────────────────────────────────────────── -->
      <div :class="ctaSection">
        <p :class="ctaQuestion">{{ COPY.ctaQuestion }}</p>
        <div>
          <MpButton variant="secondary" is-rounded @click="emit('activate')">{{ COPY.ctaButton }}</MpButton>
        </div>
      </div>

      <!-- ── Was this helpful? ──────────────────────────────────────────── -->
      <div :class="feedbackRow">
        <MpText size="body" color="text.secondary">{{ COPY.helpfulLabel }}</MpText>
        <div :class="css({ display: 'flex', alignItems: 'center' })">
          <MpTooltip :label="t('Yes, this was helpful')" placement="top">
            <MpButton
              variant="ghost" left-icon="like" is-rounded
              :class="feedback === 'up' ? 'feedback-btn feedback-btn--on' : 'feedback-btn'"
              :aria-label="t('Yes, this was helpful')" :aria-pressed="feedback === 'up'"
              @click="sendFeedback('up')"
            />
          </MpTooltip>
          <MpTooltip :label="t('No, this was not helpful')" placement="top">
            <MpButton
              variant="ghost" left-icon="dislike" is-rounded
              :class="feedback === 'down' ? 'feedback-btn feedback-btn--on' : 'feedback-btn'"
              :aria-label="t('No, this was not helpful')" :aria-pressed="feedback === 'down'"
              @click="sendFeedback('down')"
            />
          </MpTooltip>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The chosen thumb stays filled in, so the answer is visibly recorded. */
.feedback-btn--on :deep(svg) { color: var(--mp-colors-icon-default, #1d1f24); }
</style>
