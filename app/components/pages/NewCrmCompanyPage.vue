<script setup lang="ts">
/**
 * New company form (CRM → Customers → Companies → New company).
 * Route `/crm/customers/companies/new`.
 *
 * Full-bleed create shell mirrors the shared create-page pattern
 * (CreateBillOfMaterialsPage / NewCustomerPage): `.detail-page` > `.detail-bar`
 * (72px, neutral-subtle, breadcrumb-above-title gap:0) + scrollable `.detail-stage`
 * holding a 558px / 6-col form + sticky `.detail-footer`.
 *
 * Rules: footer ghost Cancel + primary Save are always present
 * (rule/form-actions-always-present); errors render inline below the field, never
 * as a toast (rule/form-errors-inline); create-form primary label = "Save"
 * (rule/form-edit-save-changes). Every dropdown is `ErpFilterSelect`
 * (rule/select-erpfilterselect) — never a native select / MpSelect. Text inputs are
 * Pixel `MpInput`, no placeholder (rule/input-no-placeholder). A company may
 * associate 0..n existing contacts — chosen via a checkbox list.
 */
import { ref, computed } from 'vue'
import { MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpCheckbox, MpButton } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { addCrmCompany, crmContactPeople, CRM_OWNERS, CUSTOMER_SEGMENTS } from '~/data/crm'

const { t } = useLocale()
const router = useRouter()

const COMPANIES_PATH = '/crm/customers/companies'

// ── Field state ──
const name = ref('')
const industry = ref('')
const email = ref('')
const phone = ref('')
const website = ref('')
const address = ref('')
const city = ref('')
const province = ref('')
const postalCode = ref('')
const owner = ref('')
const selectedContactIds = ref<string[]>([])

const industryOptions = CUSTOMER_SEGMENTS.map((s) => ({ value: s, label: s }))
const ownerOptions = CRM_OWNERS.map((o) => ({ value: o, label: o }))
const contactOptions = computed(() => crmContactPeople.map((c) => ({ value: c.id, label: c.name })))

function toggleContact(id: string) {
  const i = selectedContactIds.value.indexOf(id)
  if (i === -1) selectedContactIds.value.push(id)
  else selectedContactIds.value.splice(i, 1)
}

// ── Errors — only triggered from Save, never while typing ──
const nameError = ref('')
const industryError = ref('')
const ownerError = ref('')

function validate(): boolean {
  nameError.value = ''
  industryError.value = ''
  ownerError.value = ''
  if (!name.value.trim()) nameError.value = t('You must fill in company name')
  if (!industry.value) industryError.value = t('You must select industry')
  if (!owner.value) ownerError.value = t('You must select owner')
  return !(nameError.value || industryError.value || ownerError.value)
}

function save() {
  if (!validate()) return
  const nowIso = new Date().toISOString().slice(0, 19)
  const created = addCrmCompany({
    name: name.value.trim(),
    industry: industry.value,
    email: email.value.trim(),
    phone: phone.value.trim(),
    website: website.value.trim(),
    address: address.value.trim(),
    city: city.value.trim(),
    province: province.value.trim(),
    postalCode: postalCode.value.trim(),
    owner: owner.value,
    contactIds: [...selectedContactIds.value],
  }, nowIso)
  router.push(`${COMPANIES_PATH}/${created.id}`)
}

function cancel() { router.push(COMPANIES_PATH) }
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <NuxtLink :to="COMPANIES_PATH" class="detail-breadcrumb">{{ t('Companies') }}</NuxtLink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('New company') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">
      <div class="ncf-form">
        <h2 class="ncf-section-title">{{ t('Company info') }}</h2>

        <div class="ncf-fields">
          <!-- Company name (required) -->
          <MpFormControl id="ncf-name" is-required :is-invalid="!!nameError">
            <MpFormLabel>{{ t('Company name') }}</MpFormLabel>
            <MpInput id="ncf-name-input" v-model="name" is-full-width @update:model-value="nameError = ''" />
            <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Industry (required, half-width select) -->
          <MpFormControl id="ncf-industry" class="ncf-half" is-required :is-invalid="!!industryError">
            <MpFormLabel>{{ t('Industry') }}</MpFormLabel>
            <ErpFilterSelect
              id="ncf-industry-select" :model-value="industry" :placeholder="t('Select industry')"
              :options="industryOptions" :is-clearable="false" width="270px"
              @update:model-value="(v: string) => { industry = v; industryError = '' }"
            />
            <MpFormErrorMessage>{{ industryError }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Email -->
          <MpFormControl id="ncf-email">
            <MpFormLabel>{{ t('Email') }}</MpFormLabel>
            <MpInput id="ncf-email-input" v-model="email" type="email" is-full-width />
          </MpFormControl>

          <!-- Phone -->
          <MpFormControl id="ncf-phone">
            <MpFormLabel>{{ t('Phone') }}</MpFormLabel>
            <MpInput id="ncf-phone-input" v-model="phone" is-full-width />
          </MpFormControl>

          <!-- Website -->
          <MpFormControl id="ncf-website">
            <MpFormLabel>{{ t('Website') }}</MpFormLabel>
            <MpInput id="ncf-website-input" v-model="website" is-full-width />
          </MpFormControl>

          <!-- Address -->
          <MpFormControl id="ncf-address">
            <MpFormLabel>{{ t('Address') }}</MpFormLabel>
            <MpInput id="ncf-address-input" v-model="address" is-full-width />
          </MpFormControl>

          <!-- City -->
          <MpFormControl id="ncf-city">
            <MpFormLabel>{{ t('City') }}</MpFormLabel>
            <MpInput id="ncf-city-input" v-model="city" is-full-width />
          </MpFormControl>

          <!-- Province -->
          <MpFormControl id="ncf-province">
            <MpFormLabel>{{ t('Province') }}</MpFormLabel>
            <MpInput id="ncf-province-input" v-model="province" is-full-width />
          </MpFormControl>

          <!-- Postal code -->
          <MpFormControl id="ncf-postal">
            <MpFormLabel>{{ t('Postal code') }}</MpFormLabel>
            <MpInput id="ncf-postal-input" v-model="postalCode" is-full-width />
          </MpFormControl>

          <!-- Owner (required, half-width select) -->
          <MpFormControl id="ncf-owner" class="ncf-half" is-required :is-invalid="!!ownerError">
            <MpFormLabel>{{ t('Owner') }}</MpFormLabel>
            <ErpFilterSelect
              id="ncf-owner-select" :model-value="owner" :placeholder="t('Select owner')"
              :options="ownerOptions" :is-clearable="false" width="270px"
              @update:model-value="(v: string) => { owner = v; ownerError = '' }"
            />
            <MpFormErrorMessage>{{ ownerError }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Contacts (optional multi-association via checkbox list) -->
          <MpFormControl id="ncf-contacts">
            <MpFormLabel>{{ t('Contacts') }}</MpFormLabel>
            <div v-if="contactOptions.length" class="ncf-checklist">
              <div v-for="opt in contactOptions" :key="opt.value" class="ncf-check-row">
                <MpCheckbox
                  :id="`ncf-contact-${opt.value}`"
                  :is-checked="selectedContactIds.includes(opt.value)"
                  @update:is-checked="() => toggleContact(opt.value)"
                >{{ opt.label }}</MpCheckbox>
              </div>
            </div>
            <p v-else class="ncf-empty">{{ t('No contacts yet') }}</p>
          </MpFormControl>
        </div>
      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell (shared create-page pattern) ─────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
  text-decoration: none;
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default);
}

/* ── Form (558px / 6-col grid — Form.md) ─────────────────────────────────── */
.ncf-form { width: 558px; max-width: 100%; display: flex; flex-direction: column; }
.ncf-section-title {
  margin: 0 0 var(--mp-spacing-5); font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
.ncf-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }
/* half-width (span 3, ~270px) select on its own row */
.ncf-half { width: 270px; }

/* Checkbox list of associable contacts — bordered box, flat surface */
.ncf-checklist {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 8px);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); max-height: 220px; overflow-y: auto;
}
.ncf-empty { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
