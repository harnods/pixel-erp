<script setup lang="ts">
/**
 * New company form (CRM → Customers → Companies → New company). A company is the
 * customer record (crmCustomers). Follows the ERP form rules
 * (docs/patterns/Form.md): 558px / 6-column grid — text inputs span the full 6,
 * selects span 3 (half, 270px, paired two per row). Selects use the popover
 * ErpFilterSelect (never a native dropdown). Inline validation fires only on Save.
 */
import { MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpButton, toast } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  addCrmCustomer, CRM_OWNERS, CUSTOMER_SEGMENTS, LIFECYCLE_STAGES, type LifecycleStage,
} from '~/data/crm'

const router = useRouter()
function goBack() { router.push('/crm/customers') }

// ── Field state ──
const company = ref('')
const contact = ref('')
const email = ref('')
const phone = ref('')
const city = ref('')
const lifecycle = ref<LifecycleStage | ''>('')
const owner = ref('')
const segment = ref('')

const lifecycleOptions = [...LIFECYCLE_STAGES]
const ownerOptions = [...CRM_OWNERS]
const segmentOptions = [...CUSTOMER_SEGMENTS]

// ── Errors — only triggered from Save, never while typing ──
const companyError = ref('')
const emailError = ref('')
const lifecycleError = ref('')
const ownerError = ref('')
const isSaving = ref(false)

function validate(): boolean {
  companyError.value = ''
  emailError.value = ''
  lifecycleError.value = ''
  ownerError.value = ''
  if (!company.value.trim()) companyError.value = 'You must fill in company name'
  if (email.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) emailError.value = 'Enter a valid email address'
  if (!lifecycle.value) lifecycleError.value = 'You must select lifecycle stage'
  if (!owner.value) ownerError.value = 'You must select contact owner'
  return !(companyError.value || emailError.value || lifecycleError.value || ownerError.value)
}

async function save() {
  if (!validate()) return
  isSaving.value = true
  await new Promise((r) => setTimeout(r, 500))
  const created = addCrmCustomer({
    company: company.value,
    contact: contact.value,
    email: email.value,
    phone: phone.value,
    city: city.value,
    segment: segment.value,
    owner: owner.value,
    lifecycle: lifecycle.value as LifecycleStage,
  })
  isSaving.value = false
  toast.notify({ variant: 'success', title: `Company “${created.company}” saved`, maxWidth: 'max-content' })
  router.push(`/crm/customers/${created.id}`)
}
</script>

<template>
  <div class="ncf-page">
    <!-- Title bar -->
    <div class="ncf-titlebar">
      <div class="ncf-titlebar-left">
        <MpButton class="ncf-breadcrumb" @click="goBack">Companies</MpButton>
        <h1 class="ncf-title">New company</h1>
      </div>
    </div>

    <!-- Stage -->
    <div class="ncf-stage">
      <div class="ncf-form">
        <h2 class="ncf-section-title">Customer info</h2>

        <div class="ncf-fields">
          <!-- Company name (full) -->
          <MpFormControl id="ncf-company" is-required :is-invalid="!!companyError">
            <MpFormLabel>Company name</MpFormLabel>
            <MpInput id="ncf-company-input" v-model="company" placeholder="Example: Kopi Nusantara" is-full-width @update:model-value="companyError = ''" />
            <MpFormErrorMessage>{{ companyError }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Primary contact (full) -->
          <MpFormControl id="ncf-contact">
            <MpFormLabel>Primary contact</MpFormLabel>
            <MpInput id="ncf-contact-input" v-model="contact" placeholder="Example: Andi Wijaya" is-full-width />
          </MpFormControl>

          <!-- Email (full) -->
          <MpFormControl id="ncf-email" :is-invalid="!!emailError">
            <MpFormLabel>Email</MpFormLabel>
            <MpInput id="ncf-email-input" v-model="email" type="email" placeholder="name@company.com" is-full-width @update:model-value="emailError = ''" />
            <MpFormErrorMessage>{{ emailError }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Phone (full) -->
          <MpFormControl id="ncf-phone">
            <MpFormLabel>Phone</MpFormLabel>
            <MpInput id="ncf-phone-input" v-model="phone" placeholder="Example: 0812 3456 7890" is-full-width />
          </MpFormControl>

          <!-- City (full) -->
          <MpFormControl id="ncf-city">
            <MpFormLabel>City</MpFormLabel>
            <MpInput id="ncf-city-input" v-model="city" placeholder="Example: Jakarta" is-full-width />
          </MpFormControl>

          <!-- Lifecycle + Contact owner (two half-width selects, span 3 each) -->
          <div class="ncf-row">
            <MpFormControl id="ncf-lifecycle" class="ncf-half" is-required :is-invalid="!!lifecycleError">
              <MpFormLabel>Lifecycle stage</MpFormLabel>
              <ErpFilterSelect
                id="ncf-lifecycle-select" :model-value="lifecycle" placeholder="Select lifecycle stage"
                :options="lifecycleOptions" :is-clearable="false" width="270px"
                @update:model-value="(v: string) => { lifecycle = v as LifecycleStage; lifecycleError = '' }"
              />
              <MpFormErrorMessage>{{ lifecycleError }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="ncf-owner" class="ncf-half" is-required :is-invalid="!!ownerError">
              <MpFormLabel>Contact owner</MpFormLabel>
              <ErpFilterSelect
                id="ncf-owner-select" :model-value="owner" placeholder="Select contact owner"
                :options="ownerOptions" :is-clearable="false" width="270px"
                @update:model-value="(v: string) => { owner = v; ownerError = '' }"
              />
              <MpFormErrorMessage>{{ ownerError }}</MpFormErrorMessage>
            </MpFormControl>
          </div>

          <!-- Segment (lone half-width, own row) -->
          <div class="ncf-row">
            <MpFormControl id="ncf-segment" class="ncf-half">
              <MpFormLabel>Segment</MpFormLabel>
              <ErpFilterSelect
                id="ncf-segment-select" :model-value="segment" placeholder="Select segment"
                :options="segmentOptions" width="270px"
                @update:model-value="(v: string) => (segment = v)"
              />
            </MpFormControl>
          </div>
        </div>
      </div>
    </div>

    <!-- Sticky footer -->
    <div class="ncf-footer">
      <MpButton class="btn-enterprise btn-enterprise--ghost" type="button" @click="goBack">Cancel</MpButton>
      <MpButton class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ isSaving ? 'Saving…' : 'Save' }}</MpButton>
    </div>
  </div>
</template>

<style scoped>
.ncf-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.ncf-titlebar { flex-shrink: 0; height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.ncf-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.ncf-breadcrumb { background: none; border: none; cursor: pointer; padding: 0; font-size: 12px; font-weight: var(--mp-font-weights-regular); line-height: var(--mp-line-heights-md); color: var(--mp-text-link); font-family: inherit; white-space: nowrap; }
.ncf-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.ncf-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }

.ncf-stage { flex: 1; min-height: 0; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow-x: hidden; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8); }

/* 558px / 6-column form (Form.md): full-width fields fill it, half-width = 270px. */
.ncf-form { width: 558px; max-width: 100%; display: flex; flex-direction: column; }
.ncf-section-title { margin: 0 0 var(--mp-spacing-5) 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
/* 20px vertical row gap between stacked fields (Form.md). */
.ncf-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }
/* Two half-width (span 3) fields share a row with the 6-col gap. */
.ncf-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.ncf-half { width: 270px; flex-shrink: 0; }

.ncf-footer { flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default); }
</style>
