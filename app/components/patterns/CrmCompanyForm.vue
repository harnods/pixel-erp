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
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText, MpInput, MpButton, MpIcon, MpCheckbox, MpToggle,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import SelectAccessDrawer from '~/components/patterns/SelectAccessDrawer.vue'
import { BANK_OPTIONS, type ContactBank } from '~/data/contacts'
import { addCrmCompany, updateCrmCompany, getCompany, companyNameTaken, companiesSameDomain, contactsOfCompany, persistCrmCompanies, crmContactPeople, getContactPerson, type CrmCompany, type CrmContactPerson } from '~/data/crm'

const props = withDefaults(defineProps<{ showContactSelect?: boolean; initialName?: string; editId?: string }>(), { showContactSelect: true, initialName: '', editId: '' })

const { t } = useLocale()

const COMPANY_NAME_MAX = 60
const COUNTRY_OPTIONS = ['Indonesia', 'Singapore', 'Malaysia', 'Thailand', 'Philippines', 'Vietnam', 'Australia', 'United States']

// Edit mode — prefill from the existing company when an editId is passed.
const existing = props.editId ? getCompany(props.editId) : undefined
const isEdit = computed(() => !!existing)

// ── Company info ──
const name = ref(existing?.name ?? props.initialName)
const email = ref(existing?.email ?? '')
const phone = ref(existing?.phone ?? '')
const website = ref(existing?.website ?? '')
const address = ref(existing?.address ?? '')
const city = ref(existing?.city ?? '')
const province = ref(existing?.province ?? '')
const country = ref(existing?.country ?? 'Indonesia')
const postalCode = ref(existing?.postalCode ?? '')
// Shipping address — its own full block; defaults to "same as billing" (checkbox on).
const shipAddress = ref(existing?.shipAddress ?? '')
const shipCity = ref(existing?.shipCity ?? '')
const shipProvince = ref(existing?.shipProvince ?? '')
const shipCountry = ref(existing?.shipCountry ?? 'Indonesia')
const shipPostalCode = ref(existing?.shipPostalCode ?? '')
const sameAsBilling = ref(!existing || !existing.shippingAddress || existing.shippingAddress === existing.billingAddress)

// ── Bank info ──
const banks = ref<ContactBank[]>(
  existing?.banks?.length
    ? existing.banks.map((b, i) => ({ id: b.id || `b${i + 1}`, bankName: b.bankName, branch: b.branch, accountNo: b.accountNo, accountName: b.accountName }))
    : [{ id: 'b1', bankName: '', branch: '', accountNo: '', accountName: '' }],
)

// ── Contact members + Primary PIC (both required — PRD §230-231) ──
const selectedContactIds = ref<string[]>(existing ? contactsOfCompany(existing.id).map((c) => c.id) : [])
const primaryContactId = ref<string>(existing?.primaryContactId ?? '')
const contactPickerOpen = ref(false)
// Only ACTIVE contacts may be selected as members (archived are excluded — PRD §353).
const contactOptions = computed(() =>
  crmContactPeople.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, subtitle: c.email || c.jobTitle })),
)
const selectedContacts = computed(() => selectedContactIds.value.map(getContactPerson).filter(Boolean) as CrmContactPerson[])
function onMembersChanged(ids: string[]) {
  selectedContactIds.value = ids
  // Keep the PIC valid: default to the FIRST member when the current one is gone.
  if (!ids.includes(primaryContactId.value)) primaryContactId.value = ids[0] ?? ''
  memberError.value = ''; picError.value = ''
}
function removeContact(id: string) { onMembersChanged(selectedContactIds.value.filter((x) => x !== id)) }
// Primary PIC is set by a per-row toggle (single-select — turning one on moves it).
function setPrimary(id: string) { primaryContactId.value = id; picError.value = '' }

// ── Duplicate domain warning (non-blocking) — another company shares this website. ──
const duplicateDomains = computed(() => {
  if (!website.value.trim()) return []
  return companiesSameDomain(website.value, props.editId || undefined)
})
const hasDomainDuplicate = computed(() => duplicateDomains.value.length > 0)

// ── Options ──
const countryOptions = COUNTRY_OPTIONS.map((c) => ({ value: c, label: c }))
const bankOptions = BANK_OPTIONS.map((b) => ({ value: b, label: b }))

function addBank() {
  banks.value.push({ id: `b${banks.value.length + 1}`, bankName: '', branch: '', accountNo: '', accountName: '' })
}
function removeBank(i: number) { banks.value.splice(i, 1) }

// ── Save ──
const nameError = ref('')
const countryError = ref('')
const memberError = ref('')
const picError = ref('')

function submit(): CrmCompany | null {
  nameError.value = name.value.trim() ? '' : t('You must fill in company name')
  // A company name must be unique (block on duplicate — PRD §310).
  if (!nameError.value && companyNameTaken(name.value, props.editId || undefined)) {
    nameError.value = t('A company with this name already exists.')
  }
  // Country is required (PRD §225).
  countryError.value = country.value ? '' : t('You must select country')
  // At least one active member + one PIC among them (PRD §230-231, §309).
  if (props.showContactSelect) {
    memberError.value = selectedContactIds.value.length ? '' : t('Select at least one contact person.')
    picError.value = (!memberError.value && !primaryContactId.value) ? t('Select a primary contact.') : ''
  }
  if (nameError.value || countryError.value || memberError.value || picError.value) return null

  const compose = (a: string, ci: string, pr: string, po: string, co: string) =>
    [a.trim(), ci.trim(), [pr.trim(), po.trim()].filter(Boolean).join(' '), co].filter(Boolean).join(', ')
  const billing = compose(address.value, city.value, province.value, postalCode.value, country.value)
  // Shipping mirrors billing when "same as billing" is ticked; else its own block.
  const shipping = sameAsBilling.value ? billing : compose(shipAddress.value, shipCity.value, shipProvince.value, shipPostalCode.value, shipCountry.value)
  const shipFields = sameAsBilling.value
    ? { shipAddress: '', shipCity: '', shipProvince: '', shipPostalCode: '', shipCountry: '' }
    : { shipAddress: shipAddress.value.trim(), shipCity: shipCity.value.trim(), shipProvince: shipProvince.value.trim(), shipPostalCode: shipPostalCode.value.trim(), shipCountry: shipCountry.value }
  const cleanBanks = banks.value.filter((b) => b.bankName || b.accountNo || b.accountName)

  if (isEdit.value && existing) {
    updateCrmCompany(existing.id, {
      name: name.value.trim(),
      email: email.value.trim(),
      phone: phone.value.trim(),
      website: website.value.trim(),
      address: address.value.trim(),
      city: city.value.trim(),
      province: province.value.trim(),
      postalCode: postalCode.value.trim(),
      country: country.value,
      billingAddress: billing,
      shippingAddress: shipping,
      ...shipFields,
      banks: cleanBanks,
      contactIds: props.showContactSelect ? [...selectedContactIds.value] : contactsOfCompany(existing.id).map((c) => c.id),
      primaryContactId: props.showContactSelect ? primaryContactId.value : existing.primaryContactId,
    })
    return existing
  }

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
    contactIds: props.showContactSelect ? [...selectedContactIds.value] : [],
    primaryContactId: props.showContactSelect ? (primaryContactId.value || undefined) : undefined,
  }, new Date().toISOString().slice(0, 19))

  // Detail-page fields not in addCrmCompany's input — set + persist.
  created.country = country.value
  created.billingAddress = billing
  created.shippingAddress = shipping
  Object.assign(created, shipFields)
  created.banks = cleanBanks
  persistCrmCompanies()
  return created
}

defineExpose({ submit, isEdit })
</script>

<template>
  <div class="cf-form">
    <!-- ── Company details ── -->
    <section class="cf-section">
      <h3 class="cf-section-title">{{ t('Company details') }}</h3>
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
          <MpFormHelpText v-if="hasDomainDuplicate" class="cf-dup-warning">
            {{ duplicateDomains.length === 1
              ? `${t('Another company shares this domain:')} ${duplicateDomains[0]!.name}`
              : `${duplicateDomains.length} ${t('other companies share this domain.')}` }}
          </MpFormHelpText>
        </MpFormControl>
      </div>
    </section>

    <hr class="cf-divider" />

    <!-- ── Address ── -->
    <section class="cf-section">
      <h3 class="cf-section-title">{{ t('Address') }}</h3>
      <div class="cf-grid">
        <MpFormControl id="cf-address" class="span-6">
          <MpFormLabel>{{ t('Billing address') }}</MpFormLabel>
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

        <MpFormControl id="cf-country" class="span-3" is-required :is-invalid="!!countryError">
          <MpFormLabel>{{ t('Country') }}</MpFormLabel>
          <ErpFilterSelect
            id="cf-country-select" :model-value="country" :placeholder="t('Select country')"
            :options="countryOptions" :is-clearable="false" width="100%"
            @update:model-value="(v: string) => { country = v; countryError = '' }"
          />
          <MpFormErrorMessage>{{ countryError }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="cf-postal" class="span-3">
          <MpFormLabel>{{ t('Postal code') }}</MpFormLabel>
          <MpInput id="cf-postal-input" v-model="postalCode" is-full-width />
        </MpFormControl>

        <div class="span-6 cf-shipping-head">
          <p class="cf-subheading">{{ t('Shipping address') }}</p>
          <MpCheckbox id="cf-same-billing" :is-checked="sameAsBilling" @change="sameAsBilling = !sameAsBilling">
            {{ t('Same as billing address') }}
          </MpCheckbox>
        </div>

        <template v-if="!sameAsBilling">
          <MpFormControl id="cf-ship-address" class="span-6">
            <MpFormLabel>{{ t('Shipping address') }}</MpFormLabel>
            <MpInput id="cf-ship-address-input" v-model="shipAddress" is-full-width />
          </MpFormControl>

          <MpFormControl id="cf-ship-city" class="span-3">
            <MpFormLabel>{{ t('City') }}</MpFormLabel>
            <MpInput id="cf-ship-city-input" v-model="shipCity" is-full-width />
          </MpFormControl>
          <MpFormControl id="cf-ship-province" class="span-3">
            <MpFormLabel>{{ t('Province') }}</MpFormLabel>
            <MpInput id="cf-ship-province-input" v-model="shipProvince" is-full-width />
          </MpFormControl>

          <MpFormControl id="cf-ship-country" class="span-3">
            <MpFormLabel>{{ t('Country') }}</MpFormLabel>
            <ErpFilterSelect
              id="cf-ship-country-select" :model-value="shipCountry" :placeholder="t('Select country')"
              :options="countryOptions" :is-clearable="false" width="100%"
              @update:model-value="(v: string) => { shipCountry = v }"
            />
          </MpFormControl>
          <MpFormControl id="cf-ship-postal" class="span-3">
            <MpFormLabel>{{ t('Postal code') }}</MpFormLabel>
            <MpInput id="cf-ship-postal-input" v-model="shipPostalCode" is-full-width />
          </MpFormControl>
        </template>
      </div>
    </section>

    <hr class="cf-divider" />

    <!-- ── Bank info ── -->
    <section class="cf-section">
      <h3 class="cf-section-title">{{ t('Bank info') }}</h3>
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
          <MpButton variant="ghost" is-rounded left-icon="add" @click="addBank">{{ t('Add another bank') }}</MpButton>
        </div>
      </div>
    </section>

    <hr v-if="showContactSelect" class="cf-divider" />

    <!-- ── Contact person — ≥1 member required + one Primary PIC (PRD §230-231) ── -->
    <section v-if="showContactSelect" class="cf-section">
      <h3 class="cf-section-title">{{ t('Contact person') }}</h3>
      <div class="cf-contact">
        <ul v-if="selectedContacts.length" class="cf-selected-list">
          <li v-for="c in selectedContacts" :key="c.id" class="cf-selected-row">
            <div class="cf-selected-body">
              <span class="cf-selected-name">{{ c.name }}</span>
              <span v-if="c.email" class="cf-selected-sub">{{ c.email }}</span>
            </div>
            <!-- Primary PIC toggle — single-select: turning one on moves the PIC. -->
            <label class="cf-pic-toggle">
              <span class="cf-pic-toggle-label">{{ t('Primary contact') }}</span>
              <MpToggle :is-checked="primaryContactId === c.id" :aria-label="`${t('Primary contact')} — ${c.name}`" @change="setPrimary(c.id)" />
            </label>
            <button type="button" class="cf-selected-remove" :aria-label="`${t('Remove')} ${c.name}`" @click="removeContact(c.id)"><MpIcon name="minus-circular" size="md" /></button>
          </li>
        </ul>
        <p v-if="memberError" class="cf-inline-error">{{ memberError }}</p>
        <p v-else-if="picError" class="cf-inline-error">{{ picError }}</p>
        <div>
          <MpButton variant="ghost" is-rounded left-icon="add" @click="contactPickerOpen = true">{{ t('Add contact person') }}</MpButton>
        </div>
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
      @save="onMembersChanged($event)"
    />
  </div>
</template>

<style scoped>
/* Fills the container up to 558px → even left/right padding in the page stage and
   the drawer body (rule/form-field-stacking: 6-col grid, max 558px). */
.cf-form { width: 100%; max-width: 558px; display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.cf-section { display: flex; flex-direction: column; }
/* Full-bleed section divider — the page stage clips overflow-x, so 100vw runs to the right edge. */
.cf-divider { border: none; border-top: 1px solid var(--mp-border-default, #e3e7e9); margin: 0; width: 100vw; max-width: none; }
.cf-shipping-head { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.cf-subheading { margin: 0; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cf-section-title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }

/* 6-column grid — text inputs span 6 (full) or 3 (half pair); selects span 3. */
.cf-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-5, 20px); }
.cf-grid > * { min-width: 0; }
.span-6 { grid-column: span 6; }
.span-3 { grid-column: span 3; }
/* ErpFilterSelect renders an inline-flex root — stretch it to fill the grid cell
   so a select (Country / Owner / Bank name) is the same width as a paired input. */
.cf-grid :deep(.efs) { display: flex; width: 100%; }

/* Duplicate-domain warning — amber help text (non-blocking). */
.cf-dup-warning :deep(*), .cf-dup-warning { color: var(--mp-text-warning, #9d5425) !important; }

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
.cf-selected-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cf-selected-body { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.cf-selected-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cf-selected-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cf-selected-remove { display: inline-flex; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-icon-subtle, var(--mp-text-secondary)); }
.cf-selected-remove:hover { color: var(--mp-text-danger); }
.cf-pic-tag { margin-left: var(--mp-spacing-2); padding: 1px var(--mp-spacing-2); border-radius: var(--mp-radii-sm, 6px); background: var(--mp-background-info-subtle, #e8f1fb); color: var(--mp-text-link, #165082); font-size: 12px; font-weight: var(--mp-font-weights-semi-bold); }
.cf-pic-toggle { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; cursor: pointer; }
.cf-pic-toggle-label { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.cf-pic-field { margin-top: var(--mp-spacing-2); }
.cf-pic-field :deep(.efs) { display: flex; width: 100%; }
.cf-inline-error { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #b42318); }
</style>
