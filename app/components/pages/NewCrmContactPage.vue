<script setup lang="ts">
/**
 * New / Edit contact form (CRM › Customers › Contacts › New contact | :id/edit).
 * Routes `/crm/customers/contacts/new` and `/crm/customers/contacts/:id/edit`.
 *
 * A CRM contact (Customer) is a PERSON. Field catalog per the PRD Customer
 * predefined fields (§182): Customer Name (Display name), Full Name, multiple
 * Emails + Phones (≤5, first = primary — §194), Company (existing active only —
 * NO inline create in V1, §261), Primary Location (Country/Province/City/Address,
 * Country required if any set — §196), Source pick list + Source-Other (§199-200),
 * Owner (required, defaults to current user — §201), Description + Notes.
 *
 * Duplicate-name warning is non-blocking but requires an explicit **Save anyway**
 * (PRD §264/§293). Rules: footer ghost Cancel + primary Save always present
 * (rule/form-actions-always-present); validation errors inline (rule/form-errors-inline);
 * selects are ErpFilterSelect (rule/select-erpfilterselect); no example placeholders
 * (rule/input-no-placeholder).
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpButton, MpButtonGroup, MpInput, MpTextarea, MpAutocomplete, MpIcon, MpTooltip, toast,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { TITLE_OPTIONS } from '~/data/contacts'
import {
  addCrmContactPerson, updateCrmContactPerson, getContactPerson, getCompany, contactsSameName, companiesOfContact,
  addCrmNote, crmCompanies, CRM_OWNERS, CRM_SOURCE_OPTIONS,
} from '~/data/crm'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()
const { t } = useLocale()

const CONTACTS_PATH = '/crm/customers/contacts'
const CURRENT_USER = 'Rizal Candra'
const DISPLAY_NAME_MAX = 25
const DESCRIPTION_MAX = 250
const MAX_CONTACT_METHODS = 5
const COUNTRY_OPTIONS = ['Indonesia', 'Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Vietnam', 'Australia', 'United States']

// Edit mode — the route passes the record id as `orderId` (create passes 'new').
const editId = computed(() => (props.orderId && props.orderId !== 'new' ? props.orderId : ''))
const existing = computed(() => (editId.value ? getContactPerson(editId.value) : undefined))
const isEdit = computed(() => !!existing.value)

// ── Form state ────────────────────────────────────────────────────────────────
const seed = existing.value
const displayName = ref(seed?.name ?? '')
const title = ref(TITLE_OPTIONS[0] ?? 'Mr')
const fullName = ref(seed?.fullName ?? '')
// Multi emails / phones — first row is Primary (PRD §194). Always ≥1 row.
const emails = ref<string[]>(seed?.emails?.length ? [...seed.emails] : [seed?.email ?? ''])
const phones = ref<string[]>(seed?.phones?.length ? [...seed.phones] : [seed?.phone ?? ''])
if (!emails.value.length) emails.value = ['']
if (!phones.value.length) phones.value = ['']
const companyId = ref(seed ? (companiesOfContact(seed.id)[0]?.id ?? '') : '')
// Primary Location — Country defaults to Indonesia (PRD §195); others plain text.
const country = ref(seed?.country ?? 'Indonesia')
const province = ref(seed?.province ?? '')
const city = ref(seed?.city ?? '')
const address = ref(seed?.address ?? '')
const postalCode = ref(seed?.postalCode ?? '')
// Ownership & Source
const owner = ref(seed?.owner ?? CURRENT_USER)
const source = ref(seed?.source ?? '')
const sourceOther = ref(seed?.sourceOther ?? '')
// Description + Note
const description = ref(seed?.description ?? '')
const memo = ref('')

const titleOptions = [...TITLE_OPTIONS]
const ownerOptions = CRM_OWNERS.map((o) => ({ value: o, label: o }))
const countryOptions = COUNTRY_OPTIONS.map((c) => ({ value: c, label: c }))
const sourceOptions = CRM_SOURCE_OPTIONS.map((s) => ({ value: s, label: t(s) }))

// Company select — ACTIVE companies only, existing ones (no inline create in V1).
const companyData = computed(() => crmCompanies.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name })))

function addEmail() { if (emails.value.length < MAX_CONTACT_METHODS) emails.value.push('') }
function removeEmail(i: number) { emails.value.splice(i, 1); if (!emails.value.length) emails.value = [''] }
function addPhone() { if (phones.value.length < MAX_CONTACT_METHODS) phones.value.push('') }
function removePhone(i: number) { phones.value.splice(i, 1); if (!phones.value.length) phones.value = [''] }

// Picking a company auto-fills the contact's address from that company's billing
// address (still editable here; editing does NOT write back to the company).
// Only fires on user selection — the initial edit-mode value doesn't trigger it.
watch(companyId, (id) => {
  const co = id ? getCompany(id) : undefined
  if (!co) return
  // Fill each field only when the company actually has it — never clobber to empty
  // (an older company may only carry the composed billing address).
  address.value = co.address || co.billingAddress || address.value
  if (co.city) city.value = co.city
  if (co.province) province.value = co.province
  if (co.country) country.value = co.country
  if (co.postalCode) postalCode.value = co.postalCode
})

// ── Duplicate warning (non-blocking; requires explicit Save anyway — PRD §264) ──
const duplicateNames = computed(() => {
  const name = displayName.value.trim()
  return name ? contactsSameName(name, editId.value || undefined) : []
})
const hasDuplicate = computed(() => duplicateNames.value.length > 0)
const dupAcknowledged = ref(false)

// ── Save ──────────────────────────────────────────────────────────────────────
const displayNameError = ref('')
const phoneError = ref('')
const isSaving = ref(false)

function goBack() { router.push(CONTACTS_PATH) }

async function save() {
  const cleanEmails = emails.value.map((e) => e.trim()).filter(Boolean)
  const cleanPhones = phones.value.map((p) => p.trim()).filter(Boolean)

  displayNameError.value = displayName.value.trim() ? '' : t('You must fill in display name')
  // Duplicate normalized phones within the contact are blocked (PRD §194).
  const norm = (p: string) => p.replace(/[^\d+]/g, '')
  phoneError.value = new Set(cleanPhones.map(norm)).size !== cleanPhones.length ? t('Remove duplicate phone numbers.') : ''

  if (displayNameError.value || phoneError.value) return
  // Same-name warning must be explicitly acknowledged before the save commits.
  if (hasDuplicate.value && !dupAcknowledged.value) { dupAcknowledged.value = true; return }

  isSaving.value = true
  await new Promise((r) => setTimeout(r, 400))

  const patch = {
    name: displayName.value.trim(),
    fullName: fullName.value.trim(),
    jobTitle: '',
    email: cleanEmails[0] ?? '',
    phone: cleanPhones[0] ?? '',
    emails: cleanEmails,
    phones: cleanPhones,
    companyIds: companyId.value ? [companyId.value] : [],
    country: country.value,
    province: province.value.trim(),
    city: city.value.trim(),
    address: address.value.trim(),
    postalCode: postalCode.value.trim(),
    source: source.value,
    sourceOther: source.value === 'Other' ? sourceOther.value.trim() : '',
    description: description.value.trim(),
    owner: owner.value,
  }

  let targetId: string
  if (isEdit.value && existing.value) {
    updateCrmContactPerson(existing.value.id, patch)
    targetId = existing.value.id
    toast.notify({ variant: 'success', title: t('Contact updated'), maxWidth: 'max-content' })
  } else {
    const created = addCrmContactPerson(patch, new Date().toISOString())
    targetId = created.id
    toast.notify({ variant: 'success', title: t('Contact saved'), maxWidth: 'max-content' })
  }

  // The Note field is a real note on the Note tab (CrmNotesPanel store).
  if (memo.value.trim()) addCrmNote('contact', targetId, memo.value.trim(), owner.value, new Date().toISOString())

  isSaving.value = false
  router.push(`${CONTACTS_PATH}/${targetId}`)
}
</script>

<template>
  <div class="nc-page">

    <!-- ── Title bar (breadcrumb above H1, 72px) ── -->
    <header class="nc-titlebar">
      <div class="nc-titlebar-left">
        <a class="nc-breadcrumb" role="link" tabindex="0" @click="goBack" @keydown.enter="goBack">{{ t('Contacts') }}</a>
        <h1 class="nc-title">{{ isEdit ? t('Edit contact') : t('New contact') }}</h1>
      </div>
    </header>

    <!-- ── Stage ── -->
    <div class="nc-stage">
      <div class="nc-form">

        <!-- ── Contact details ── -->
        <section class="nc-section">
          <h3 class="nc-section-title">{{ t('Contact details') }}</h3>
          <div class="nc-fields">
            <div class="nc-row">
              <MpFormControl id="nc-display-name" class="nc-col" is-required :is-invalid="!!displayNameError">
                <div class="nc-label-row">
                  <MpFormLabel>{{ t('Display name') }}</MpFormLabel>
                  <span class="nc-counter">{{ displayName.length }} / {{ DISPLAY_NAME_MAX }}</span>
                </div>
                <MpInput
                  id="nc-display-name-input" v-model="displayName" is-full-width
                  :maxlength="DISPLAY_NAME_MAX" :placeholder="t(`a business or person's name`)"
                  @update:model-value="displayNameError = ''; dupAcknowledged = false"
                />
                <MpFormErrorMessage>{{ displayNameError }}</MpFormErrorMessage>
                <MpFormHelpText v-if="hasDuplicate" class="nc-dup-warning">
                  {{ (duplicateNames.length === 1
                    ? t('Another contact already uses this name.')
                    : `${duplicateNames.length} ${t('other contacts already use this name.')}`)
                    + (dupAcknowledged ? '' : ` ${t('Select Save again to keep it.')}`) }}
                </MpFormHelpText>
              </MpFormControl>

              <div class="nc-col nc-inline">
                <MpFormControl id="nc-title" class="nc-select-sm">
                  <MpFormLabel>{{ t('Full name') }}</MpFormLabel>
                  <ErpFilterSelect
                    id="nc-title-select" :model-value="title" :placeholder="t('Title')"
                    :options="titleOptions" :is-clearable="false" width="100%"
                    @update:model-value="(v: string) => { title = v }"
                  />
                </MpFormControl>
                <MpFormControl id="nc-full-name" class="nc-inline-grow">
                  <MpFormLabel class="nc-label-spacer" aria-hidden="true">{{ t('Full name') }}</MpFormLabel>
                  <MpInput id="nc-full-name-value" v-model="fullName" is-full-width />
                </MpFormControl>
              </div>
            </div>

            <!-- Emails — first is Primary; add more below -->
            <div class="nc-multi">
              <MpFormControl v-for="(_e, i) in emails" :id="`nc-email-${i}`" :key="`email-${i}`" class="nc-col">
                <div class="nc-label-badge">
                  <MpFormLabel>{{ t('Email') }}</MpFormLabel>
                  <span v-if="i === 0" class="nc-primary-badge">{{ t('Primary') }}</span>
                </div>
                <div class="nc-multi-row">
                  <MpInput :id="`nc-email-input-${i}`" v-model="emails[i]" type="email" is-full-width />
                  <MpTooltip v-if="emails.length > 1" :id="`nc-email-rm-${i}`" :label="t('Remove')" placement="top" use-portal>
                    <MpButton type="button" class="nc-multi-remove" left-icon="minus-circular" :aria-label="t('Remove')" @click="removeEmail(i)" />
                  </MpTooltip>
                </div>
              </MpFormControl>
              <div v-if="emails.length < MAX_CONTACT_METHODS">
                <MpButton variant="ghost" is-rounded left-icon="add" @click="addEmail">{{ t('Add another email') }}</MpButton>
              </div>
            </div>

            <!-- Phones — first is Primary; add more below -->
            <div class="nc-multi">
              <MpFormControl v-for="(_p, i) in phones" :id="`nc-phone-${i}`" :key="`phone-${i}`" class="nc-col" :is-invalid="!!phoneError && i === phones.length - 1">
                <div class="nc-label-badge">
                  <MpFormLabel>{{ t('Mobile') }}</MpFormLabel>
                  <span v-if="i === 0" class="nc-primary-badge">{{ t('Primary') }}</span>
                </div>
                <div class="nc-multi-row">
                  <MpInput :id="`nc-phone-input-${i}`" v-model="phones[i]" is-full-width @update:model-value="phoneError = ''" />
                  <MpTooltip v-if="phones.length > 1" :id="`nc-phone-rm-${i}`" :label="t('Remove')" placement="top" use-portal>
                    <MpButton type="button" class="nc-multi-remove" left-icon="minus-circular" :aria-label="t('Remove')" @click="removePhone(i)" />
                  </MpTooltip>
                </div>
                <MpFormErrorMessage v-if="i === phones.length - 1">{{ phoneError }}</MpFormErrorMessage>
              </MpFormControl>
              <div v-if="phones.length < MAX_CONTACT_METHODS">
                <MpButton variant="ghost" is-rounded left-icon="add" @click="addPhone">{{ t('Add another phone') }}</MpButton>
              </div>
            </div>

            <!-- Company — an existing active company (no inline create in V1). -->
            <MpFormControl id="nc-company" class="nc-col">
              <MpFormLabel>{{ t('Company') }}</MpFormLabel>
              <MpAutocomplete
                id="nc-company-inp"
                v-model="companyId"
                :data="companyData"
                label-prop="name" value-prop="id"
                is-searchable is-clearable use-portal is-full-width
                :placeholder="t('Select company')"
              />
            </MpFormControl>

            <!-- Description -->
            <MpFormControl id="nc-description">
              <div class="nc-label-row">
                <MpFormLabel>{{ t('Description') }}</MpFormLabel>
                <span class="nc-counter">{{ description.length }} / {{ DESCRIPTION_MAX }}</span>
              </div>
              <MpTextarea id="nc-description-input" v-model="description" :maxlength="DESCRIPTION_MAX" is-full-width />
            </MpFormControl>
          </div>
        </section>

        <hr class="nc-divider" />

        <!-- ── Address ── -->
        <section class="nc-section">
          <h3 class="nc-section-title">{{ t('Address') }}</h3>
          <div class="nc-fields">
            <MpFormControl id="nc-address">
              <MpFormLabel>{{ t('Billing address') }}</MpFormLabel>
              <MpInput id="nc-address-input" v-model="address" is-full-width />
            </MpFormControl>

            <div class="nc-row">
              <MpFormControl id="nc-city" class="nc-col">
                <MpFormLabel>{{ t('City') }}</MpFormLabel>
                <MpInput id="nc-city-input" v-model="city" is-full-width />
              </MpFormControl>
              <MpFormControl id="nc-province" class="nc-col">
                <MpFormLabel>{{ t('Province') }}</MpFormLabel>
                <MpInput id="nc-province-input" v-model="province" is-full-width />
              </MpFormControl>
            </div>

            <div class="nc-row">
              <MpFormControl id="nc-country" class="nc-col">
                <MpFormLabel>{{ t('Country') }}</MpFormLabel>
                <ErpFilterSelect
                  id="nc-country-select" :model-value="country" :placeholder="t('Select country')"
                  :options="countryOptions" :is-clearable="false" width="100%"
                  @update:model-value="(v: string) => { country = v }"
                />
              </MpFormControl>
              <MpFormControl id="nc-postal" class="nc-col">
                <MpFormLabel>{{ t('Postal code') }}</MpFormLabel>
                <MpInput id="nc-postal-input" v-model="postalCode" is-full-width />
              </MpFormControl>
            </div>
          </div>
        </section>

        <hr class="nc-divider" />

        <!-- ── Additional details (owner · source · note) ── -->
        <section class="nc-section">
          <h3 class="nc-section-title">{{ t('Account details') }}</h3>
          <div class="nc-fields">
            <MpFormControl id="nc-owner" class="nc-col">
              <MpFormLabel>{{ t('Account owner') }}</MpFormLabel>
              <ErpFilterSelect
                id="nc-owner-select" :model-value="owner" :placeholder="t('Select owner')"
                :options="ownerOptions" :is-clearable="false" width="100%"
                @update:model-value="(v: string) => { owner = v }"
              />
            </MpFormControl>
            <MpFormControl id="nc-source" class="nc-col">
              <MpFormLabel>{{ t('Source') }}</MpFormLabel>
              <ErpFilterSelect
                id="nc-source-select" :model-value="source" :placeholder="t('Select source')"
                :options="sourceOptions" width="100%"
                @update:model-value="(v: string) => { source = v }"
              />
            </MpFormControl>
            <MpFormControl v-if="source === 'Other'" id="nc-source-other" class="nc-col">
              <MpFormLabel>{{ t('Source detail') }}</MpFormLabel>
              <MpInput id="nc-source-other-input" v-model="sourceOther" :maxlength="30" is-full-width />
            </MpFormControl>
            <MpFormControl id="nc-memo">
              <MpFormLabel>{{ t('Note') }}</MpFormLabel>
              <MpTextarea id="nc-memo-input" v-model="memo" is-full-width />
            </MpFormControl>
          </div>
        </section>

        <!-- ── Action group ── -->
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="save">
            {{ isSaving ? t('Saving…') : (hasDuplicate && dupAcknowledged ? t('Save anyway') : t('Save')) }}
          </MpButton>
        </MpButtonGroup>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Page shell ── */
.nc-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* ── Title bar (72px, breadcrumb above H1, no gap) ── */
.nc-titlebar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}
.nc-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.nc-breadcrumb {
  align-self: flex-start; cursor: pointer;
  font-size: 12px; line-height: var(--mp-line-heights-md); color: var(--mp-text-link);
}
.nc-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.nc-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.nc-stage {
  flex: 1;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden; overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}

/* Form column: 6 grid columns = two 320px fields + a 24px gap. */
.nc-form { width: 664px; max-width: 100%; display: flex; flex-direction: column; gap: var(--mp-spacing-8); }

.nc-section { display: flex; flex-direction: column; }
.nc-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 24px);
  color: var(--mp-text-default);
}

/* 20px row gap — the standard vertical spacing between stacked form fields */
.nc-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.nc-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.nc-col { width: 320px; flex-shrink: 0; }
/* ErpFilterSelect renders an inline-flex root — stretch it to fill the field column */
.nc-col :deep(.efs) { display: flex; width: 100%; }
.nc-col.nc-inline { width: 320px; }

/* Multi-value (email / phone) stacks — each row an input + inline remove button */
.nc-multi { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.nc-multi-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.nc-multi-row > :first-child { flex: 1; min-width: 0; }
.nc-multi-remove { display: inline-flex; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-icon-subtle, var(--mp-text-secondary)); flex-shrink: 0; }
.nc-multi-remove:hover { color: var(--mp-text-danger); }

/* select + input on one line (Full name) */
.nc-inline { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); width: 100%; }
.nc-inline-grow { flex: 1; min-width: 0; }
.nc-select-sm { flex: 0 0 112px; width: 112px; }
.nc-label-spacer { visibility: hidden; }

/* Section divider between Contact details / Address / Additional details.
   Breaks out of the 664px form column to run to the stage's right edge — the
   stage clips overflow-x, so 100vw is safe and reaches the edge. */
.nc-divider { border: none; border-top: 1px solid var(--mp-border-default, #e3e7e9); margin: 0; width: 100vw; max-width: none; }

/* Label + Primary badge (email / phone) */
.nc-label-badge { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.nc-primary-badge { padding: 0 var(--mp-spacing-2); border-radius: var(--mp-radii-sm, 4px); background: var(--mp-background-info-subtle, #e8f1fb); color: var(--mp-text-link, #165082); font-size: 11px; font-weight: var(--mp-font-weights-semi-bold); line-height: 18px; }

/* Duplicate-name warning — amber help text (non-blocking). */
.nc-dup-warning :deep(*), .nc-dup-warning { color: var(--mp-text-warning, #9d5425) !important; }

/* ── Label row with a character counter ── */
.nc-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); width: 100%; }
.nc-counter {
  flex-shrink: 0; font-size: 12px; line-height: 16px;
  color: var(--mp-text-secondary); text-align: right;
}

/* ── Buttons ── (shape/colour come from .btn-enterprise in erp.css; only the
   disabled treatment, which erp.css doesn't define, is added here) */
.btn-enterprise:disabled { cursor: default; }
.btn-enterprise--primary:disabled {
  background: var(--mp-background-disabled, #e4e7e7);
  border-color: var(--mp-background-disabled, #e4e7e7);
  color: var(--mp-text-disabled);
}
</style>
