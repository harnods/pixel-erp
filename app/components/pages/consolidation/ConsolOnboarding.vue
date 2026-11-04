<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/onboarding/index.vue (+ components/onboarding-masthead.vue, onboarding-steps.vue, onboarding-cta.vue) -->
<script setup lang="ts">
/**
 * Consolidation onboarding — shown in place of the list while the company has
 * no consolidation yet (prod redirects an empty company to /onboarding).
 * Masthead + three "How does consolidation work?" steps + CTA + feedback.
 */
import { MpButton, MpIcon } from '@mekari/pixel3'
import { successToast } from '~/utils/toasts'

const emit = defineEmits<{ start: [] }>()
const { t } = useLocale()

const STEPS = [
  { label: 'STEP 1', title: 'Set up consolidation', items: [
    ['On the ', 'Consolidation list', ' page, click ', 'Run consolidation', '.'],
    ['Enter consolidation name, set period, reporting currency, and business units.'],
    ['Choose consolidation data source: ', 'Mekari ERP', ', ', 'Mekari Jurnal', ', or ', 'spreadsheet', '.'],
    ['Add business unit by entering its name, code, and base currency.'],
  ] },
  { label: 'STEP 2', title: 'Run consolidation', items: [
    ['Set closing and average rates for business units when needed.'],
    ['Map business unit accounts to consolidation accounts.'],
    ['Fill in intercompany eliminations. Check ', 'Make recurring rule', ' to save this logic into ', 'Elimination rules', ' so it can be reused automatically.'],
  ] },
  { label: 'STEP 3', title: 'Analyze consolidation report', items: [
    ['View consolidation reports (Profit & Loss, Balance Sheet, Cash Flow, and Trial Balance) on separate tabs.'],
    ['Filter reports by business unit and intercompany elimination (excluded, included, or only eliminations).'],
    ['Set table density (Default or Compact), column group (period or business unit), and toggle full-screen view.'],
    ['Export reports in PDF, XLS, or CSV format.'],
  ] },
]
const feedback = ref<'' | 'up' | 'down'>('')
function sendFeedback(v: 'up' | 'down') { feedback.value = v; successToast(t('Thank you for your feedback')) }
</script>

<template>
  <div class="ob">
    <section class="ob-masthead">
      <div class="ob-masthead-text">
        <h2 class="ob-title">{{ t('Fast and accurate financial consolidation') }}</h2>
        <p class="ob-desc">{{ t('Manage multi-entities, exchange rates, and intercompany elimination with integrated and efficient workflows.') }}</p>
        <div><MpButton variant="primary" is-rounded @click="emit('start')">{{ t('Start consolidation') }}</MpButton></div>
      </div>
      <img src="/illustrations/empty-folder.png" alt="" class="ob-illustration" width="288" height="240" />
    </section>

    <section class="ob-steps">
      <h3 class="ob-section-title">{{ t('How does consolidation work?') }}</h3>
      <div class="ob-step-grid">
        <article v-for="s in STEPS" :key="s.label" class="ob-step">
          <span class="ob-step-label">{{ t(s.label) }}</span>
          <h4 class="ob-step-title">{{ t(s.title) }}</h4>
          <ul class="ob-list">
            <li v-for="(it, i) in s.items" :key="i">
              <template v-for="(part, pi) in it" :key="pi">
                <strong v-if="pi % 2 === 1">{{ t(part) }}</strong>
                <template v-else>{{ t(part) }}</template>
              </template>
            </li>
          </ul>
        </article>
      </div>
    </section>

    <section class="ob-cta">
      <div>
        <h3 class="ob-section-title">{{ t('Ready to consolidate your financials?') }}</h3>
        <p class="ob-desc">{{ t('The Mekari ERP team is ready to help you activate Consolidation.') }}</p>
      </div>
      <MpButton variant="primary" is-rounded @click="emit('start')">{{ t('Start consolidation') }}</MpButton>
    </section>

    <div class="ob-feedback">
      <span>{{ t('Was this information helpful?') }}</span>
      <MpButton variant="ghost" is-rounded :aria-label="t('Helpful')" :class="{ 'ob-fb--on': feedback === 'up' }" @click="sendFeedback('up')"><MpIcon name="like" size="md" /></MpButton>
      <MpButton variant="ghost" is-rounded :aria-label="t('Not helpful')" :class="{ 'ob-fb--on': feedback === 'down' }" @click="sendFeedback('down')"><MpIcon name="dislike" size="md" /></MpButton>
    </div>
  </div>
</template>

<style scoped>
.ob { display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.ob-masthead { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-6); }
.ob-masthead-text { display: flex; flex-direction: column; gap: var(--mp-spacing-3); max-width: var(--mp-sizes-xl, 576px); }
.ob-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ob-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ob-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; flex-shrink: 0; }
.ob-section-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ob-steps { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.ob-step-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.ob-step { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg); }
.ob-step-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 1px; color: var(--mp-text-link); }
.ob-step-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ob-list { list-style: disc outside; padding-left: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ob-list li { display: list-item; }
.ob-cta { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-5); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg); background: var(--mp-background-neutral-subtle); }
.ob-feedback { display: flex; align-items: center; justify-content: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.ob-fb--on { color: var(--mp-text-link) !important; }
</style>
