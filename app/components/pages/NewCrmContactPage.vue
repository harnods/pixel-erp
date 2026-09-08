<script setup lang="ts">
/**
 * New contact form (CRM → Customers → Contacts → New contact).
 * Route `/crm/customers/contacts/new`.
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
 * Pixel `MpInput`, no placeholder (rule/input-no-placeholder). A contact may belong
 * to 0..n companies — chosen via a checkbox list.
 */
import { ref, computed } from 'vue'
import { MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpCheckbox, MpButton } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { addCrmContactPerson, crmCompanies, CRM_OWNERS } from '~/data/crm'

const { t } = useLocale()
const router = useRouter()

const CONTACTS_PATH = '/crm/customers/contacts'

// ── Field state ──
const name = ref('')
const jobTitle = ref('')
const email = ref('')
const phone = ref('')
const owner = ref('')
const selectedCompanyIds = ref<string[]>([])

const ownerOptions = CRM_OWNERS.map((o) => ({ value: o, label: o }))
const companyOptions = computed(() => crmCompanies.map((c) => ({ value: c.id, label: c.name })))

function toggleCompany(id: string) {
  const i = selectedCompanyIds.value.indexOf(id)
  if (i === -1) selectedCompanyIds.value.push(id)
  else selectedCompanyIds.value.splice(i, 1)
}

// ── Errors — only triggered from Save, never while typing ──
const nameError = ref('')
const ownerError = ref('')

function validate(): boolean {
  nameError.value = ''
  ownerError.value = ''
  if (!name.value.trim()) nameError.value = t('You must fill in name')
  if (!owner.value) ownerError.value = t('You must select owner')
  return !(nameError.value || ownerError.value)
}

function save() {
  if (!validate()) return
  const nowIso = new Date().toISOString().slice(0, 19)
  const created = addCrmContactPerson({
    name: name.value.trim(),
    jobTitle: jobTitle.value.trim(),
    email: email.value.trim(),
    phone: phone.value.trim(),
    companyIds: [...selectedCompanyIds.value],
    owner: owner.value,
  }, nowIso)
  router.push(`${CONTACTS_PATH}/${created.id}`)
}

function cancel() { router.push(CONTACTS_PATH) }
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <NuxtLink :to="CONTACTS_PATH" class="detail-breadcrumb">{{ t('Contacts') }}</NuxtLink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('New contact') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">
      <div class="ncf-form">
        <h2 class="ncf-section-title">{{ t('Contact info') }}</h2>

        <div class="ncf-fields">
          <!-- Name (required) -->
          <MpFormControl id="ncf-name" is-required :is-invalid="!!nameError">
            <MpFormLabel>{{ t('Name') }}</MpFormLabel>
            <MpInput id="ncf-name-input" v-model="name" is-full-width @update:model-value="nameError = ''" />
            <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Job title -->
          <MpFormControl id="ncf-jobtitle">
            <MpFormLabel>{{ t('Job title') }}</MpFormLabel>
            <MpInput id="ncf-jobtitle-input" v-model="jobTitle" is-full-width />
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

          <!-- Companies (optional multi-association via checkbox list) -->
          <MpFormControl id="ncf-companies">
            <MpFormLabel>{{ t('Companies') }}</MpFormLabel>
            <div v-if="companyOptions.length" class="ncf-checklist">
              <div v-for="opt in companyOptions" :key="opt.value" class="ncf-check-row">
                <MpCheckbox
                  :id="`ncf-company-${opt.value}`"
                  :is-checked="selectedCompanyIds.includes(opt.value)"
                  @update:is-checked="() => toggleCompany(opt.value)"
                >{{ opt.label }}</MpCheckbox>
              </div>
            </div>
            <p v-else class="ncf-empty">{{ t('No companies yet') }}</p>
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

/* Checkbox list of associable companies — bordered box, flat surface */
.ncf-checklist {
  display: flex; flex-direction: column; gap: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 8px);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); max-height: 220px; overflow-y: auto;
}
.ncf-empty { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
