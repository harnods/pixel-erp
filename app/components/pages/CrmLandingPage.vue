<!--
  CRM landing — where the product switcher sends anyone who can't open CRM yet
  (PRD US-013). The switcher always lists CRM; this page covers the cases it
  can't open directly:
    • no CRM add-on (or a seat add-on only)  → what CRM is + Contact Sales (AC-03)
    • add-on, but you have no CRM role       → "no CRM access, ask your admin" (AC-04)
    • Billing can't be reached, never confirmed → "try again later" (US-008 AC-03)

  STATES: the three above are the whole surface. The marketing content is a
  placeholder — the real landing page content and the Contact Sales flow are
  owned by the CRM team (PRD A4, out of scope).

  Full-bleed route (/get-crm) with its own title bar + stage, same shell as
  InviteUserPage. Copy goes through t().
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import SeatContactSalesModal from '~/components/patterns/SeatContactSalesModal.vue'
import { useCrmSubscriptionScenario } from '~/composables/useCrmSubscriptionScenario'
import { useLocale } from '~/composables/useLocale'

const router = useRouter()
const { t } = useLocale()
const { mode, currentUserHasCrmRole } = useCrmSubscriptionScenario()

type LandingState = 'no-addon' | 'no-role' | 'unknown' | 'has-access'
const state = computed<LandingState>(() => {
  if (mode.value === 'hidden') return 'no-addon'
  if (mode.value === 'unknown') return 'unknown'
  return currentUserHasCrmRole.value ? 'has-access' : 'no-role'
})

const contactOpen = ref(false)

const VALUE_PROPS = [
  { title: 'One place for every deal', body: 'Track deals, contacts and companies through your own pipeline stages.' },
  { title: 'Connected to ERP', body: 'Turn a won deal into a sales quote or order without retyping it.' },
  { title: 'Pay only for CRM seats', body: 'Sales staff who only use CRM take a CRM seat, not an ERP seat.' },
]
</script>

<template>
  <div class="crml-page" data-devchange="crm-user-seats-landing">
    <div class="crml-titlebar">
      <h1 class="crml-title">{{ t('Mekari CRM') }}</h1>
    </div>

    <div class="crml-stage">
      <!-- ── No CRM add-on → landing + Contact Sales (US-013 AC-03) ── -->
      <template v-if="state === 'no-addon'">
        <section class="crml-hero" data-test-id="crml-no-addon">
          <h2 class="crml-hero-title">{{ t('Manage your sales pipeline with Mekari CRM') }}</h2>
          <p class="crml-hero-body">
            {{ t('Mekari CRM is an add-on to your ERP subscription. It comes with 5 CRM seats, including one for the Owner, and you can add more.') }}
          </p>
          <div>
            <MpButton variant="primary" is-rounded data-test-id="crml-contact-sales" @click="contactOpen = true">{{ t('Contact Sales') }}</MpButton>
          </div>
        </section>
        <div class="crml-props">
          <div v-for="p in VALUE_PROPS" :key="p.title" class="crml-prop">
            <p class="crml-prop-title">{{ t(p.title) }}</p>
            <p class="crml-prop-body">{{ t(p.body) }}</p>
          </div>
        </div>
      </template>

      <!-- ── Company has CRM, you don't have the CRM role (US-013 AC-04) ── -->
      <div v-else-if="state === 'no-role'" class="crml-empty" data-test-id="crml-no-role">
        <img src="/illustrations/empty-folder.png" alt="" class="crml-empty-img" width="288" height="240">
        <p class="crml-empty-title">{{ t("You don't have CRM access") }}</p>
        <p class="crml-empty-desc">
          {{ t('Your company uses Mekari CRM, but your account has no CRM role. Ask your company Owner or an admin to give you the CRM role in Settings › Users & roles.') }}
        </p>
        <MpButton variant="secondary" is-rounded @click="router.push('/')">{{ t('Back to ERP') }}</MpButton>
      </div>

      <!-- ── Billing down, nothing confirmed (US-008 AC-03) ── -->
      <div v-else-if="state === 'unknown'" class="crml-empty" data-test-id="crml-unknown">
        <img src="/illustrations/empty-folder.png" alt="" class="crml-empty-img" width="288" height="240">
        <p class="crml-empty-title">{{ t("We can't check your CRM access right now") }}</p>
        <p class="crml-empty-desc">{{ t('Try again later. Your existing CRM access is not affected.') }}</p>
        <MpButton variant="secondary" is-rounded @click="router.push('/')">{{ t('Back to ERP') }}</MpButton>
      </div>

      <!-- ── You do have access (e.g. the scenario changed) → just open CRM ── -->
      <div v-else class="crml-empty" data-test-id="crml-has-access">
        <p class="crml-empty-title">{{ t('You have CRM access') }}</p>
        <MpButton variant="secondary" is-rounded @click="router.push('/crm')">{{ t('Open CRM') }}</MpButton>
      </div>
    </div>

    <SeatContactSalesModal v-model:is-open="contactOpen" id="crml-contact-sales" topic="crm-addon" />
  </div>
</template>

<style scoped>
.crml-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.crml-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  display: flex; align-items: center; padding: 0 var(--mp-spacing-6);
}
.crml-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.crml-stage {
  flex: 1; background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-y: auto; padding: var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8, 32px);
}

.crml-hero {
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-8, 32px) var(--mp-spacing-10, 40px);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  border-radius: var(--mp-radii-xl, 12px);
}
.crml-hero-title {
  margin: 0; max-width: 560px; font-size: 20px; line-height: 28px;
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.crml-hero-body { max-width: 560px; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.crml-props { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-6); max-width: 960px; }
.crml-prop { flex: 1 1 220px; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.crml-prop-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.crml-prop-body { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* rule/empty-state-structure — illustration + title + caption + secondary CTA */
.crml-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: var(--mp-spacing-10, 40px); }
.crml-empty-img { width: 288px; height: 240px; object-fit: contain; }
.crml-empty-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.crml-empty-desc {
  max-width: 480px; margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
