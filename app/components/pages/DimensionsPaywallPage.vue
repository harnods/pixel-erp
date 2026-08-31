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
    - Buttons: rebuilt as .btn-enterprise (primary/secondary/ghost) instead of
      Figma's generic "Button (E)" component, matching this codebase's button
      convention.
    - "Learn more" text link and the like/dislike feedback controls use plain
      buttons instead of a Pixel MpButton, for the same reason.
    - Hero illustration and the 3 step thumbnails are flattened Figma exports
      (single PNGs) rather than hand-rebuilt nested layers — matches how the
      sibling TaxPaywallPage/MekariPayPaywallPage illustrations work.
    - Hero horizontal padding and illustration size are scaled down from the
      Figma source (which assumed a fixed 1200px-wide stage) to stay
      responsive at the widths this app's stage actually renders at.

  OPEN ITEMS for product/design follow-up:
    - Wire "Start using Dimensions" / "Activate Dimensions" to the real
      activation flow once it exists.
    - Build the post-activation Dimensions management page (classification
      types, values, mandatory toggle) — out of scope for this page.
-->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { MpText, MpIcon, css } from '@mekari/pixel3'

const { t } = useLocale()

// Same page-scoped hack as TaxPaywallPage/MekariPayPaywallPage: zero the
// stage's top border while mounted so the hero can sit flush to the top.
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
      label: t('STEP 1'),
      thumb: '/illustrations/dimensions-step-1.png',
      title: t('Activate and configure Dimensions'),
      items: [
        { text: t('On the Dimensions page, add the types of dimensions you want to use, such as Branch, SBU, Project, or Channel.') },
        { text: t('Add the values you need for each dimension and set whether filling it in is mandatory for transactions.') },
      ],
    },
    {
      label: t('STEP 2'),
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
      label: t('STEP 3'),
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

// Bleed against the stage's 24px side padding so the hero spans edge to edge.
// The stage's top border is zeroed on mount (see above), so no negative top
// margin is needed — the hero sits flush to the top.
const root = css({ display: 'flex', flexDirection: 'column', gap: '5', marginInline: '-6' })

const hero = css({
  position: 'relative', overflow: 'hidden',
  background: 'background.surface',
  minHeight: '320px',
  paddingInline: '10', paddingBlock: '8', gap: '8',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderTopLeftRadius: 'xl', borderTopRightRadius: 'xl',
  flexWrap: 'wrap',
})
const heroCol = css({ display: 'flex', flexDirection: 'column', gap: '6', maxWidth: '480px', flexShrink: 0 })
const heroImg = css({
  width: '440px', height: 'auto', flexShrink: 0, display: 'block',
  '@media (max-width: 1024px)': { display: 'none' },
})

// Headings share the same style Tag as the app's page-title H1 (24/600/32),
// since MpText has no heading sizes in our Pixel build.
const headingLg = css({ margin: 0, fontSize: '24px', fontWeight: '600', lineHeight: '32px', color: 'text.default', letterSpacing: '-0.2px' })

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
const stepTitle = css({ margin: 0, fontSize: '20px', fontWeight: '600', lineHeight: '32px', color: 'text.default' })
const orderedList = css({ paddingLeft: '5', listStyleType: 'decimal' })
const bulletList = css({ paddingLeft: '5', listStyleType: 'disc' })

const ctaSection = css({
  display: 'flex', flexDirection: 'column', gap: '4',
  borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'border.default',
  paddingTop: '5',
})
const ctaQuestion = css({ margin: 0, fontSize: '16px', fontWeight: '600', lineHeight: '24px', color: 'text.default' })

const feedbackRow = css({ display: 'flex', alignItems: 'center', gap: '2' })
</script>

<template>
  <div ref="rootEl" :class="root">
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <div :class="hero">
      <div :class="heroCol">
        <div :class="css({ display: 'flex', flexDirection: 'column', gap: '2' })">
          <h1 :class="headingLg">{{ COPY.heroTitle }}</h1>
          <MpText size="body" color="text.secondary">{{ COPY.heroBody }}</MpText>
        </div>
        <div :class="css({ display: 'flex', alignItems: 'center', gap: '4' })">
          <button class="btn-enterprise btn-enterprise--primary">{{ COPY.primaryCta }}</button>
          <button class="btn-enterprise btn-enterprise--ghost">{{ COPY.learnMore }}</button>
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
        <h2 :class="headingLg">{{ COPY.howItWorksTitle }}</h2>

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
          <button class="btn-enterprise btn-enterprise--secondary">{{ COPY.ctaButton }}</button>
        </div>
      </div>

      <!-- ── Was this helpful? ──────────────────────────────────────────── -->
      <div :class="feedbackRow">
        <MpText size="body" color="text.secondary">{{ COPY.helpfulLabel }}</MpText>
        <div :class="css({ display: 'flex', alignItems: 'center' })">
          <button class="feedback-icon-btn" :aria-label="t('Yes, this was helpful')">
            <MpIcon name="like" size="sm" color="icon.secondary" />
          </button>
          <button class="feedback-icon-btn" :aria-label="t('No, this was not helpful')">
            <MpIcon name="dislike" size="sm" color="icon.secondary" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feedback-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-md);
  padding: 0;
  transition: background 0.1s ease;
}

.feedback-icon-btn:hover {
  background: var(--mp-background-neutral-hovered);
}
</style>
