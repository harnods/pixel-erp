<!--
  CRM (Qontak) — paywall / no-access page. Shown from the /crm router (see
  [...slug].vue) whenever useCrmAccess() reports access is not 'active'. It has TWO
  faces, picked from crmStatus:
    • 'none'    → educational first-run paywall (hero → value props → how it works →
                  CTA → feedback). Modelled on DimensionsPaywallPage.
    • 'expired' → "trial ended" paywall: reassure that data is kept + contact sales.
                  No re-education (they already used it) and no self-serve pricing —
                  primary is "Contact sales", secondary "Schedule a demo".

  FULL-BLEED: /crm routes render in the content area with no level-1 sidebar and no
  padded stage, so this owns its own scrollport + inset padding. Switching status is
  reactive — the scenario FAB (bottom-right, same control as the Deals page) flips
  between CRM access / Trial expired / No access. Illustrations reuse the shared
  paywall art (placeholders).
-->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { MpText, MpIcon, MpButton, MpTooltip, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, toast, css } from '@mekari/pixel3'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import { infoToast } from '~/utils/toasts'
import { useCrmAccess, type CrmStatus } from '~/composables/useCrmAccess'

const { t } = useLocale()
const { crmStatus, setCrmStatus, setCrmAccess } = useCrmAccess()

const isExpired = computed(() => crmStatus.value === 'expired')

function activate() { setCrmAccess(true) }
// Contact-sales paths have no destination in the prototype, so they say so rather
// than looking clickable and doing nothing.
function contactSales() { infoToast(t('Our team will reach out soon')) }
function scheduleDemo() { infoToast(t('Demo scheduling — coming soon')) }
function learnMore() { infoToast(t('CRM guide — coming soon')) }

// ── Copy ────────────────────────────────────────────────────────────────────
// Hero + bottom CTA differ by face; value props are shared (benefits / what you keep).
const hero = computed(() => isExpired.value
  ? {
      title: t('Your CRM trial has ended'),
      body: t('Your deals, contacts, and pipeline are safe. Upgrade to pick up right where you left off.'),
      primary: t('Contact sales'),
      secondary: t('Schedule a demo'),
    }
  : {
      title: t('Run your whole sales cycle inside your ERP'),
      body: t('Track every lead, deal, and customer in one pipeline—then turn a won deal into a sales order or invoice without re-keying a thing.'),
      primary: t('Activate CRM'),
      secondary: t('Learn more'),
    })

const bottomCta = computed(() => isExpired.value
  ? { question: t('Ready to keep your sales running in CRM?'), button: t('Contact sales') }
  : { question: t('Ready to run your sales cycle inside your ERP?'), button: t('Activate CRM') })

function onHeroPrimary() { isExpired.value ? contactSales() : activate() }
function onHeroSecondary() { isExpired.value ? scheduleDemo() : learnMore() }
function onBottomCta() { isExpired.value ? contactSales() : activate() }

const COPY = {
  // Trial-expired warning banner — flags the retention deadline, reassures on data.
  dataSafeTitle: t('Your data is saved for 30 more days'),
  dataSafeBody: t('Your deals, contacts, and pipeline stay saved for 30 days after your trial ends. Upgrade before then to keep everything.'),
  valuePropsTitle: t('What you get with CRM'),
  valueProps: [
    {
      icon: 'pipeline' as const, tone: 'green' as const,
      title: t('One pipeline for every deal'),
      body: t('Track leads, deals, and customers in a single pipeline that matches how your team sells.'),
    },
    {
      // Pixel has no "handshake" icon — "partner" is its two-hands/handshake glyph.
      icon: 'partner' as const, tone: 'tosca' as const,
      title: t('Won deals become ERP transactions'),
      body: t('Convert a won deal into a sales order, quote, or invoice in one click—no re-keying.'),
    },
    {
      icon: 'channel' as const, tone: 'blue' as const,
      title: t('Everything stays connected'),
      body: t('Customers, products, and orders stay linked across CRM and your ERP modules.'),
    },
  ],
  howItWorksTitle: t('How does this feature work?'),
  steps: [
    {
      label: t('Step 1'),
      thumb: '/illustrations/paywall-step-1.svg',
      title: t('Set up your pipeline'),
      items: [
        t('Import your deals, contacts, and companies from a spreadsheet.'),
        t('Shape the pipeline stages to match your real sales process.'),
        t('Invite your team and decide who can view, edit, and own deals.'),
      ],
    },
    {
      label: t('Step 2'),
      thumb: '/illustrations/paywall-step-2.svg',
      title: t('Sell and convert'),
      items: [
        t('Work deals through the pipeline and track what is ongoing, closing, and overdue.'),
        t('Turn a won deal into a sales order or quote in one click.'),
        t('Keep customers, products, and orders in sync across your ERP modules.'),
      ],
    },
  ],
  helpfulLabel: t('Was this helpful?'),
}

const feedback = ref<'up' | 'down' | ''>('')
function sendFeedback(v: 'up' | 'down') {
  feedback.value = v
  toast.notify({ variant: 'success', title: t('Thanks for your feedback'), rootProps: { class: 'toast-enterprise' } })
}

// ── Layout ──────────────────────────────────────────────────────────────────
// Full-bleed shell: /crm routes render in the content area with no padded stage,
// so this owns its own scrollport and the 24px inset the stage would provide.
const page = css({
  height: '100%', minHeight: 0, overflowY: 'auto',
  background: 'background.stage', padding: '6',
})
const root = css({ display: 'flex', flexDirection: 'column', gap: '5' })

// Hero card. Content lives in a centered max-width band so on a wide stage the text
// and illustration stay next to each other instead of flung to opposite edges.
const heroCard = css({
  position: 'relative', overflow: 'hidden',
  background: 'background.neutral.subtle',
  minHeight: '397px',
  display: 'flex', justifyContent: 'center',
  paddingInline: '8',
  borderRadius: 'xl',
})
const heroInner = css({
  display: 'flex', alignItems: 'stretch', gap: '6',
  width: '100%', maxWidth: '1000px',
})
const heroCol = css({
  display: 'flex', flexDirection: 'column', gap: '6', justifyContent: 'center',
  flex: '1 1 auto', minWidth: 0, maxWidth: '520px', paddingBlock: '8',
})
// Full figure illustration (transparent PNG), shown whole (contain) and anchored to
// the bottom so the figure's feet sit on the card's base edge — never cropped. Drops
// out on a tablet width so the hero is clean text-only on phones.
const heroImg = css({
  flexShrink: 0, alignSelf: 'flex-end',
  height: '397px', width: 'auto', maxWidth: 'min(588px, 52%)',
  objectFit: 'contain', objectPosition: 'bottom center',
  '@media (max-width: 860px)': { display: 'none' },
})

// MpText has no heading sizes in our Pixel build, so the heading roles are spelled
// out here. The hero is a marketing masthead, so its title/body keep their larger
// sizes (32/16); section headings below use the type-scale (H2 20, H3 16), semibold.
const heroTitle = css({ margin: 0, fontSize: '32px', fontWeight: '600', lineHeight: 'normal', color: 'text.default' })
const heroBody = css({ margin: 0, fontSize: '16px', fontWeight: '400', lineHeight: '24px', color: 'text.secondary' })
const headingH2 = css({ margin: 0, fontSize: '20px', fontWeight: '600', lineHeight: '28px', color: 'text.default' })

const content = css({ display: 'flex', flexDirection: 'column', gap: '10', width: '100%', maxWidth: '760px', marginInline: 'auto', paddingBlock: '5' })

const valuePropsRow = css({ display: 'flex', flexWrap: 'wrap', gap: '6' })
const valueCol = css({ display: 'flex', flexDirection: 'column', gap: '6', flex: '1 1 200px', minWidth: '200px' })
const valueTextCol = css({ display: 'flex', flexDirection: 'column', gap: '2' })
const valueTitle = css({ margin: 0, fontSize: '14px', fontWeight: '600', lineHeight: '24px', color: 'text.default' })
const valuePropsBlock = css({ display: 'flex', flexDirection: 'column', gap: '5' })

const stepsSection = css({ display: 'flex', flexDirection: 'column', gap: '5' })
const stepsList = css({ display: 'flex', flexDirection: 'column', gap: '5' })
const stepRow = css({ display: 'flex', gap: '6', alignItems: 'flex-start', flexWrap: 'wrap' })
const thumbImg = css({
  flexShrink: 0, width: '220px', height: '180px', objectFit: 'contain',
  borderRadius: 'xl', border: '1px solid', borderColor: 'border.default',
  background: 'background.surface',
})
const stepText = css({ display: 'flex', flexDirection: 'column', gap: '1', minWidth: '260px', flex: 1 })
const stepTitle = css({ margin: 0, fontSize: '16px', fontWeight: '600', lineHeight: '24px', color: 'text.default' })
const orderedList = css({ paddingLeft: '5', listStyleType: 'decimal', color: 'text.secondary' })

const ctaSection = css({
  display: 'flex', flexDirection: 'column', gap: '4',
  borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'border.default',
  paddingTop: '5',
})
const ctaQuestion = css({ margin: 0, fontSize: '16px', fontWeight: '600', lineHeight: '24px', color: 'text.default' })

const feedbackRow = css({ display: 'flex', alignItems: 'center', gap: '2' })

const fabScenarios = [
  { label: t('CRM access'), value: 'active' },
  { label: t('Trial expired'), value: 'expired' },
  { label: t('No access (paywall)'), value: 'none' },
]
</script>

<template>
  <div :class="page" data-devchange="crm-paywall">
    <div :class="root">
      <!-- ── Hero ───────────────────────────────────────────────────────── -->
      <div :class="heroCard">
        <div :class="heroInner">
          <div :class="heroCol">
            <div :class="css({ display: 'flex', flexDirection: 'column', gap: '2' })">
              <h1 :class="heroTitle">{{ hero.title }}</h1>
              <p :class="heroBody">{{ hero.body }}</p>
            </div>
            <div :class="css({ display: 'flex', alignItems: 'center', gap: '4' })">
              <MpButton variant="primary" is-rounded @click="onHeroPrimary">{{ hero.primary }}</MpButton>
              <MpButton variant="ghost" is-rounded @click="onHeroSecondary">{{ hero.secondary }}</MpButton>
            </div>
          </div>

          <img :class="heroImg" src="/illustrations/crm-paywall-hero.png" alt="" aria-hidden="true" />
        </div>
      </div>

      <div :class="content">
        <!-- ── Trial-expired: data-retention warning banner ─────────────── -->
        <MpBanner v-if="isExpired" id="crm-trial-expired-banner" variant="warning">
          <MpBannerIcon id="crm-trial-expired-banner-icon" />
          <MpBannerTitle>{{ COPY.dataSafeTitle }}</MpBannerTitle>
          <MpBannerDescription>{{ COPY.dataSafeBody }}</MpBannerDescription>
        </MpBanner>

        <!-- ── Value props ──────────────────────────────────────────────── -->
        <div :class="valuePropsBlock">
          <h2 v-if="isExpired" :class="headingH2">{{ COPY.valuePropsTitle }}</h2>
          <div :class="valuePropsRow">
            <div v-for="prop in COPY.valueProps" :key="prop.title" :class="valueCol">
              <div class="vp-icon" :class="`vp-icon--${prop.tone}`">
                <MpIcon :name="prop.icon" size="28px" />
              </div>
              <div :class="valueTextCol">
                <p :class="valueTitle">{{ prop.title }}</p>
                <MpText size="body" color="text.secondary">{{ prop.body }}</MpText>
              </div>
            </div>
          </div>
        </div>

        <!-- ── How does this feature work? (first-run only) ─────────────── -->
        <div v-if="!isExpired" :class="stepsSection">
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
                      <MpText as="span" size="body" color="text.secondary">{{ item }}</MpText>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Bottom CTA ───────────────────────────────────────────────── -->
        <div :class="ctaSection">
          <p :class="ctaQuestion">{{ bottomCta.question }}</p>
          <div>
            <MpButton variant="secondary" is-rounded @click="onBottomCta">{{ bottomCta.button }}</MpButton>
          </div>
        </div>

        <!-- ── Was this helpful? (first-run only) ───────────────────────── -->
        <div v-if="!isExpired" :class="feedbackRow">
          <MpText size="body" color="text.secondary">{{ COPY.helpfulLabel }}</MpText>
          <div :class="css({ display: 'flex', alignItems: 'center' })">
            <MpTooltip :label="t('Yes, this was helpful')" placement="top">
              <MpButton
                variant="ghost" left-icon="like" is-rounded
                :class="feedback === 'up' ? 'feedback-choice feedback-choice--on' : 'feedback-choice'"
                :aria-label="t('Yes, this was helpful')" :aria-pressed="feedback === 'up'"
                @click="sendFeedback('up')"
              />
            </MpTooltip>
            <MpTooltip :label="t('No, this was not helpful')" placement="top">
              <MpButton
                variant="ghost" left-icon="dislike" is-rounded
                :class="feedback === 'down' ? 'feedback-choice feedback-choice--on' : 'feedback-choice'"
                :aria-label="t('No, this was not helpful')" :aria-pressed="feedback === 'down'"
                @click="sendFeedback('down')"
              />
            </MpTooltip>
          </div>
        </div>
      </div>
    </div>

    <!-- Prototype scenario FAB — flip between the three CRM states (same control as
         the Deals page), so each paywall face can be demoed from here. -->
    <ScenarioFab
      :model-value="crmStatus"
      :aria-label="t('Change CRM access')"
      :scenarios="fabScenarios"
      @update:model-value="(v: string) => setCrmStatus(v as CrmStatus)"
    />
  </div>
</template>

<style scoped>
/* Value-prop icon chips — a filled tinted square per tone (green / tosca / blue).
   The icon inherits the chip's `color` (Pixel icons stroke with currentColor), so
   one `color` drives the glyph. Tokens with hex fallbacks keep the tints working
   even where a semantic token isn't defined. */
.vp-icon {
  width: var(--mp-sizes-12, 48px); height: var(--mp-sizes-12, 48px); flex-shrink: 0;
  border-radius: var(--mp-radii-xl, 12px);
  display: inline-flex; align-items: center; justify-content: center;
}
.vp-icon :deep(svg) { color: inherit; }
.vp-icon--green { background: var(--mp-background-nav-stack-hovered, #d6f4e9); color: var(--mp-text-selected, #0f6d4d); }
.vp-icon--tosca { background: var(--mp-colors-teal-weaker, #cdeeee); color: var(--mp-colors-teal-bold, #0b7d87); }
.vp-icon--blue  { background: var(--mp-colors-info-weaker, #e3edfb); color: var(--mp-text-link, #1c5fb3); }

/* The chosen thumb stays filled in, so the answer is visibly recorded. */
.feedback-choice--on :deep(svg) { color: var(--mp-colors-icon-default, #1d1f24); }
</style>
