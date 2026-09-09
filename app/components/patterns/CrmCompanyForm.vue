<script setup lang="ts">
/**
 * CrmCompanyForm — the reusable New-company form body (fields + validation +
 * save), used by both the full page (NewCrmCompanyPage) and the quick-add drawer
 * (CrmCompanyFormDrawer, opened from the contact form). No page/drawer shell here.
 *
 * Layout follows the ERP form rules: a 6-column grid; text inputs span full (6)
 * or pair as half (3); every select is an ErpFilterSelect at half width (span 3),
 * stretched to fill its cell — rule/select-erpfilterselect, rule/form-field-stacking,
 * rule/form-select-half. The form fills its container (max 558px) so it sits with
 * even left/right padding in both the page stage and the drawer body.
 *
 * `showContactSelect` toggles the "Contact person" picker — off in the quick-add
 * drawer, where the contact being created is the association.
 *
 * The parent calls `submit()` (exposed): it validates, persists via addCrmCompany,
 * and returns the created company (or null when invalid — inline errors show).
 */
import { ref, computed } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpInput, MpTextarea, MpButton, MpIcon,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
import { BANK_OPTIONS, type ContactBank } from '~/data/contacts'
import { addCrmCompany, persistCrmCompanies, crmContactPeople, getContactPerson, CRM_OWNERS, type CrmCompany } from '~/data/crm'

const props = withDefaults(defineProps<{ showContactSelect?: boolean; initialName?: string }>(), { showContactSelect: true, initialName: '' })

const { t } = useLocale()

// The signed-in user (top bar) owns records created here.
const CURRENT_USER = 'Rizal Candra'
const COMPANY_NAME_MAX = 60
const COUNTRY_OPTIONS = ['Indonesia', 'Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Vietnam', 'Australia', 'United States']

// ── Company info ──
const name = ref(props.initialName)
const email = ref('')
const phone = ref('')
const website = ref('')
const address = ref('')
const city = ref('')
const province = ref('')
const country = ref('Indonesia')
const postalCode = ref('')
const owner = ref(CURRENT_USER)

// ── Bank info ──
const banks = ref<ContactBank[]>([{ id: 'b1', bankName: '', branch: '', accountNo: '', accountName: '' }])

// ── Contact person ──
const selectedContactIds = ref<string[]>([])
const contactPickerOpen = ref(false)
const contactOptions = computed(() =>
  crmContactPeople.map((c) => ({ id: c.id, name: c.name, subtitle: c.email || c.jobTitle })),
)
const selectedContacts = computed(() => selectedContactIds.value.map(getContactPerson).filter(Boolean))
function removeContact(id: string) { selectedContactIds.value = selectedContactIds.value.filter((x) => x !== id) }

// ── Note ──
const note = ref('')

// ── Options ──
const ownerOptions = CRM_OWNERS.map((o) => ({ value: o, label: o }))
const countryOptions = COUNTRY_OPTIONS.map((c) => ({ value: c, label: c }))
const bankOptions = BANK_OPTIONS.map((b) => ({ value: b, label: b }))

function addBank() {
  banks.value.push({ id: `b${banks.value.length + 1}`, bankName: '', branch: '', accountNo: '', accountName: '' })
}
function removeBank(i: number) { banks.value.splice(i, 1) }

// ── Save ──
const nameError = ref('')
const ownerError = ref('')

function submit(): CrmCompany | null {
  nameError.value = name.value.trim() ? '' : t('You must fill in company name')
  ownerError.value = owner.value ? '' : t('You must select owner')
  if (nameError.value || ownerError.value) return null

  const billing = [address.value.trim(), city.value.trim(), [province.value.trim(), postalCode.value.trim()].filter(Boolean).join(' '), country.value]
    .filter(Boolean).join(', ')

  const created = addCrmCompany({
    name: name.value.trim(),
    industry: '',
    email: email.value.trim(),
    phone: phone.value.trim(),
    website: website.value.trim(),
    address: address.value.trim(),
    city: city.value.trim(),
    province: province.value.trim(),
    postalCode: postalCode.value.trim(),
    owner: owner.value,
    contactIds: props.showContactSelect ? [...selectedContactIds.value] : [],
  }, new Date().toISOString().slice(0, 19))

  // Detail-page fields not in addCrmCompany's input — set + persist.
  created.country = country.value
  created.billingAddress = billing
  created.banks = banks.value.filter((b) => b.bankName || b.accountNo || b.accountName)
  created.note = note.value.trim()
  persistCrmCompanies()
  return created
}

defineExpose({ submit })
</script>

<template>
  <div class="cf-form">
    <!-- ── Company info ── -->
    <section class="cf-section">
      <h2 class="cf-section-title">{{ t('Company info') }}</h2>
      <div class="cf-grid">
        <MpFormControl id="cf-name" class="span-6" is-required :is-invalid="!!nameError">
          <div class="cf-label-row">
            <MpFormLabel>{{ t('Company name') }}</MpFormLabel>
            <span class="cf-counter">{{ name.length }} / {{ COMPANY_NAME_MAX }}</span>
          </div>
          <MpInput id="cf-name-input" v-model="name" is-full-width :maxlength="COMPANY_NAME_MAX" @update:model-value="nameError = ''" />
          <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="cf-email" class="span-3">
          <MpFormLabel>{{ t('Email') }}</MpFormLabel>
          <MpInput id="cf-email-input" v-model="email" type="email" is-full-width />
        </MpFormControl>
        <MpFormControl id="cf-phone" class="span-3">
          <MpFormLabel>{{ t('Phone') }}</MpFormLabel>
          <MpInput id="cf-phone-input" v-model="phone" is-full-width />
        </MpFormControl>

        <MpFormControl id="cf-website" class="span-6">
          <MpFormLabel>{{ t('Website') }}</MpFormLabel>
          <MpInput id="cf-website-input" v-model="website" is-full-width />
        </MpFormControl>

        <MpFormControl id="cf-address" class="span-6">
          <MpFormLabel>{{ t('Address') }}</MpFormLabel>
          <MpInput id="cf-address-input" v-model="address" is-full-width />
        </MpFormControl>

        <MpFormControl id="cf-city" class="span-3">
          <MpFormLabel>{{ t('City') }}</MpFormLabel>
          <MpInput id="cf-city-input" v-model="city" is-full-width />
        </MpFormControl>
        <MpFormControl id="cf-province" class="span-3">
          <MpFormLabel>{{ t('Province') }}</MpFormLabel>
          <MpInput id="cf-province-input" v-model="province" is-full-width />
        </MpFormControl>

        <MpFormControl id="cf-country" class="span-3">
          <MpFormLabel>{{ t('Country') }}</MpFormLabel>
          <ErpFilterSelect
            id="cf-country-select" :model-value="country" :placeholder="t('Select country')"
            :options="countryOptions" :is-clearable="false" width="100%"
            @update:model-value="(v: string) => { country = v }"
          />
        </MpFormControl>
        <MpFormControl id="cf-postal" class="span-3">
          <MpFormLabel>{{ t('Postal code') }}</MpFormLabel>
          <MpInput id="cf-postal-input" v-model="postalCode" is-full-width />
        </MpFormControl>

        <MpFormControl id="cf-owner" class="span-3" is-required :is-invalid="!!ownerError">
          <MpFormLabel>{{ t('Owner') }}</MpFormLabel>
          <ErpFilterSelect
            id="cf-owner-select" :model-value="owner" :placeholder="t('Select owner')"
            :options="ownerOptions" :is-clearable="false" width="100%"
            @update:model-value="(v: string) => { owner = v; ownerError = '' }"
          />
          <MpFormErrorMessage>{{ ownerError }}</MpFormErrorMessage>
        </MpFormControl>
      </div>
    </section>

    <!-- ── Bank info ── -->
    <section class="cf-section">
      <h2 class="cf-section-title">{{ t('Bank info') }}</h2>
      <div class="cf-banks">
        <div v-for="(bank, i) in banks" :key="bank.id" class="cf-bank">
          <div v-if="banks.length > 1" class="cf-bank-head">
            <span class="cf-bank-title">{{ i === 0 ? t('Primary bank account') : `${t('Bank account')} ${i + 1}` }}</span>
            <a class="cf-bank-remove" role="button" tabindex="0" @click="removeBank(i)" @keydown.enter="removeBank(i)">{{ t('Remove') }}</a>
          </div>
          <div class="cf-grid">
            <MpFormControl :id="`cf-bank-name-${i}`" class="span-3">
              <MpFormLabel>{{ t('Bank name') }}</MpFormLabel>
              <ErpFilterSelect :id="`cf-bank-name-select-${i}`" :model-value="bank.bankName" :placeholder="t('Select bank')" :options="bankOptions" width="100%" @update:model-value="(v: string) => { bank.bankName = v }" />
            </MpFormControl>
            <MpFormControl :id="`cf-bank-branch-${i}`" class="span-3">
              <MpFormLabel>{{ t('Bank branch') }}</MpFormLabel>
              <MpInput :id="`cf-bank-branch-input-${i}`" v-model="bank.branch" is-full-width />
            </MpFormControl>
            <MpFormControl :id="`cf-bank-account-no-${i}`" class="span-3">
              <MpFormLabel>{{ t('Account no.') }}</MpFormLabel>
              <MpInput :id="`cf-bank-account-no-input-${i}`" v-model="bank.accountNo" is-full-width inputmode="numeric" />
            </MpFormControl>
            <MpFormControl :id="`cf-bank-account-name-${i}`" class="span-3">
              <MpFormLabel>{{ t('Account name') }}</MpFormLabel>
              <MpInput :id="`cf-bank-account-name-input-${i}`" v-model="bank.accountName" is-full-width />
            </MpFormControl>
          </div>
        </div>
        <div>
          <MpButton variant="secondary" is-rounded left-icon="add" @click="addBank">{{ t('Add another bank') }}</MpButton>
        </div>
      </div>
    </section>

    <!-- ── Contact person (optional) ── -->
    <section v-if="showContactSelect" class="cf-section">
      <h2 class="cf-section-title">{{ t('Contact person') }}</h2>
      <div class="cf-contact">
        <ul v-if="selectedContacts.length" class="cf-selected-list">
          <li v-for="c in selectedContacts" :key="c!.id" class="cf-selected-row">
            <div class="cf-selected-body">
              <span class="cf-selected-name">{{ c!.name }}</span>
              <span v-if="c!.email" class="cf-selected-sub">{{ c!.email }}</span>
            </div>
            <button type="button" class="cf-selected-remove" :aria-label="`${t('Remove')} ${c!.name}`" @click="removeContact(c!.id)"><MpIcon name="minus-circular" size="md" /></button>
          </li>
        </ul>
        <div>
          <MpButton variant="secondary" is-rounded @click="contactPickerOpen = true">{{ t('Select contact') }}</MpButton>
        </div>
      </div>
    </section>

    <!-- ── Note ── -->
    <section class="cf-section">
      <h2 class="cf-section-title">{{ t('Note') }}</h2>
      <div class="cf-grid">
        <MpFormControl id="cf-note" class="span-6">
          <MpFormLabel>{{ t('Note') }}</MpFormLabel>
          <MpTextarea id="cf-note-input" v-model="note" is-full-width />
          <MpFormHelpText>{{ t('Only visible to you and your team') }}</MpFormHelpText>
        </MpFormControl>
      </div>
    </section>

    <!-- Contact person picker (two-pane drawer, same as team-member select) -->
    <SelectAccessDrawer
      v-if="showContactSelect"
      :open="contactPickerOpen"
      :title="t('Select contact')"
      :list-title="t('Contacts')"
      :options="contactOptions"
      :model-value="selectedContactIds"
      :empty-title="t('No contact selected')"
      :empty-caption="t('Pick contacts to associate with this company.')"
      @update:open="contactPickerOpen = $event"
      @save="selectedContactIds = $event"
    />
  </div>
</template>

<style scoped>
/* Fills the container up to 558px → even left/right padding in the page stage and
   the drawer body (rule/form-field-stacking: 6-col grid, max 558px). */
.cf-form { width: 100%; max-width: 558px; display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.cf-section { display: flex; flex-direction: column; }
.cf-section-title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }

/* 6-column grid — text inputs span 6 (full) or 3 (half pair); selects span 3. */
.cf-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-5, 20px); }
.cf-grid > * { min-width: 0; }
.span-6 { grid-column: span 6; }
.span-3 { grid-column: span 3; }
/* ErpFilterSelect renders an inline-flex root — stretch it to fill the grid cell
   so a select (Country / Owner / Bank name) is the same width as a paired input. */
.cf-grid :deep(.efs) { display: flex; width: 100%; }

.cf-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); width: 100%; }
.cf-counter { flex-shrink: 0; font-size: 12px; line-height: 16px; color: var(--mp-text-secondary); text-align: right; }

/* Bank accounts */
.cf-banks { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.cf-bank { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cf-bank-head { display: flex; align-items: center; justify-content: space-between; }
.cf-bank-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cf-bank-remove { cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.cf-bank-remove:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Selected contact list */
.cf-contact { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cf-selected-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.cf-selected-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); min-height: 44px; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cf-selected-body { display: flex; flex-direction: column; min-width: 0; }
.cf-selected-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cf-selected-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cf-selected-remove { display: inline-flex; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-icon-subtle, var(--mp-text-secondary)); }
.cf-selected-remove:hover { color: var(--mp-text-danger); }
</style>
