<script setup lang="ts">
/**
 * New company form (CRM › Customers › Companies › New company).
 * Route `/crm/customers/companies/new`.
 *
 * Thin page shell around the reusable <CrmCompanyForm> (the same form the contact
 * form's quick-add opens in a drawer). Footer Save calls the form's exposed
 * submit(); on success it navigates to the created company's record.
 * Footer ghost Cancel + primary Save always present (rule/form-actions-always-present).
 */
import { ref, computed } from 'vue'
import { MpButton, MpButtonGroup } from '@mekari/pixel3'
import CrmCompanyForm from '~/components/patterns/CrmCompanyForm.vue'

const props = defineProps<{ orderId?: string }>()
const { t } = useLocale()
const router = useRouter()
const COMPANIES_PATH = '/crm/customers/companies'

// Edit mode — the route passes the record id as `orderId` (create passes 'new').
const editId = computed(() => (props.orderId && props.orderId !== 'new' ? props.orderId : ''))
const isEdit = computed(() => !!editId.value)

const formRef = ref<InstanceType<typeof CrmCompanyForm> | null>(null)
function save() {
  const saved = formRef.value?.submit()
  if (saved) router.push(`${COMPANIES_PATH}/${saved.id}`)
}
function cancel() { router.push(COMPANIES_PATH) }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <NuxtLink :to="COMPANIES_PATH" class="detail-breadcrumb">{{ t('Companies') }}</NuxtLink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ isEdit ? t('Edit company') : t('New company') }}</h1>
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <div class="ncp-body">
        <CrmCompanyForm ref="formRef" :edit-id="editId" />

        <!-- Actions flow below the form (not sticky) — same as New contact. -->
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
        </MpButtonGroup>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); text-decoration: none;
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
/* Form + actions column — actions flow below the form (not sticky). */
.ncp-body { width: 100%; max-width: 558px; display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
</style>
