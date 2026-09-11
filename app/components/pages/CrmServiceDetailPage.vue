<script setup lang="ts">
/**
 * CrmServiceDetailPage — record detail for a Service deal (/crm/services/:id).
 * ERP detail-page format: title bar → stage stepper → key/value ContentList of the
 * service fields. Read-only view for the custom "Service deals" module.
 */
import { computed } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import { formatMoney } from '~/utils/currency'
import { getServiceDeal, serviceStages } from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const rec = computed(() => getServiceDeal(props.orderId))
const stages = computed(() => serviceStages())
const currentIndex = computed(() => stages.value.findIndex((s) => s.name === rec.value?.stage))
function back() { router.push('/crm/services') }
</script>

<template>
  <div class="crm">
    <template v-if="rec">
      <!-- Title bar -->
      <header class="crm-titlebar">
        <div class="crm-titlebar__left">
          <a class="detail-breadcrumb" @click="back">{{ t('Service deals') }}</a>
          <h1 class="crm-title">{{ rec.name }}</h1>
        </div>
      </header>

      <div class="svc-detail-body">
        <!-- Stage stepper (segmented bar) -->
        <section class="svc-stepper">
          <div v-for="(s, i) in stages" :key="s.name" class="svc-step" :class="{ 'svc-step--done': i <= currentIndex, 'svc-step--current': i === currentIndex }">
            <span class="svc-step-label">{{ s.name }}</span>
            <span class="svc-step-bar" />
          </div>
        </section>

        <!-- Key/value fields -->
        <section class="svc-grid">
          <div class="svc-col">
            <ContentList :label="t('Customer')" :value="rec.company || '—'" />
            <ContentList :label="t('Contact person')" :value="rec.contact || '—'" />
          </div>
          <div class="svc-col">
            <ContentList :label="t('Service type')" :value="rec.serviceType || '—'" />
            <ContentList :label="t('Transaction date')" :value="rec.transactionDate || '—'" />
            <ContentList :label="t('Due date')" :value="rec.dueDate || '—'" />
          </div>
          <div class="svc-col">
            <ContentList :label="t('Owner')" :value="rec.owner || '—'" />
            <ContentList :label="t('Stage')" :value="rec.stage || '—'" />
          </div>
          <div class="svc-total">
            <span class="svc-total-label">{{ t('Value') }}</span>
            <span class="svc-total-amount">{{ formatMoney(rec.value, 'IDR') }}</span>
          </div>
        </section>

        <section v-if="rec.description" class="svc-desc">
          <ContentList :label="t('Description')" :value="rec.description" />
        </section>
      </div>
    </template>

    <!-- Not found -->
    <div v-else class="svc-empty">
      <MpIcon name="folder-close" size="xl" />
      <p class="svc-empty-title">{{ t('Service deal not found') }}</p>
      <MpButton variant="secondary" is-rounded @click="back">{{ t('Back to Service deals') }}</MpButton>
    </div>
  </div>
</template>

<style scoped>
.svc-detail-body { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-8); }
.detail-breadcrumb { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.detail-breadcrumb:hover { text-decoration: underline; }

.svc-stepper { display: flex; gap: var(--mp-spacing-2); }
.svc-step { flex: 1; display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.svc-step-label { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.svc-step--current .svc-step-label { color: var(--mp-colors-text-success, #16b364); font-weight: var(--mp-font-weights-semi-bold, 600); }
.svc-step-bar { height: 6px; border-radius: 3px; background: var(--mp-colors-background-neutral-subtle, #eef1f1); }
.svc-step--done .svc-step-bar { background: var(--mp-colors-background-success-bold, #16b364); }

.svc-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; column-gap: var(--mp-spacing-6); }
.svc-col { display: flex; flex-direction: column; min-width: 0; }
.svc-total { justify-self: end; text-align: right; }
.svc-total-label { display: block; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); }
.svc-total-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }
.svc-desc { border-top: 1px dashed var(--mp-colors-border-default, #e3e7e9); padding-top: var(--mp-spacing-5); }

.svc-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-12) var(--mp-spacing-6); text-align: center; color: var(--mp-colors-text-secondary, #6b7678); }
.svc-empty-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
</style>
