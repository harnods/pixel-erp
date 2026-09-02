<script setup lang="ts">
/**
 * New contact / Edit contact — the Contacts module's create + edit form.
 *
 * Figma: Contacts › New Contact › Customer (Domestic + Foreign, incl. the
 * NPWP & NITKU validation states). One page serves create and edit; the route
 * segment decides (`/customers/new` vs `/customers/:id/edit`), and the first
 * path segment decides the breadcrumb (Customers / Vendors / Other contacts).
 *
 * Tax identity: NPWP is 16 digits and NITKU is a 6-digit branch suffix appended
 * to it — the two are captured separately here and joined on the detail page.
 * `Validate` runs a mock DJP lookup: Validate → Validating → Validated | error.
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpInput, MpTextarea, MpCheckbox, MpRadio, MpSelect, MpSpinner, MpTooltip, MpIcon,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  toast, css,
} from '@mekari/pixel3'
import {
  contacts, getContact, addContact, updateContact, newContactDraft,
  TITLE_OPTIONS, IDENTITY_TYPE_OPTIONS, CONTACT_GROUP_OPTIONS, BANK_OPTIONS,
  AR_ACCOUNT_OPTIONS, AP_ACCOUNT_OPTIONS, PAYMENT_TERMS_OPTIONS,
  type ContactType, type ContactBank,
} from '~/data/contacts'

// 'new' → create; any other id → edit.
const props = defineProps<{ orderId?: string }>()
const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')

const route = useRoute()
const router = useRouter()
const { t } = useLocale()

// ── Which list we belong to (breadcrumb + where Cancel/Save return to) ────────
const LISTS: Record<string, { label: string; type: ContactType }> = {
  'customers':      { label: 'Customers',      type: 'customer' },
  'vendors':        { label: 'Vendors',        type: 'vendor'   },
  'other-contacts': { label: 'Other contacts', type: 'other'    },
}
const listSlug = computed(() => {
  const seg = route.path.split('/').filter(Boolean)[0] ?? 'customers'
  return LISTS[seg] ? seg : 'customers'
})
const list = computed(() => LISTS[listSlug.value]!)

const DISPLAY_NAME_MAX = 60
const COMPANY_NAME_MAX = 60
const NPWP_LEN = 16
const NITKU_LEN = 6

// ── Form state ────────────────────────────────────────────────────────────────
const form = reactive(newContactDraft(list.value.type))
// The two email inputs of the design collapse to one field; a contact can still
// carry several addresses (seed data does), so keep them comma-separated here.
const emailText = ref('')
const creditLimitText = ref('')
const includeAddressDetails = ref(false)
const sameAsBilling = ref(false)
// Structured address parts revealed by "Include address details". Not drawn in
// the Figma (the checkbox is only shown unchecked) — standard ID address fields.
const addressDetails = reactive({ city: '', province: '', postalCode: '', country: 'Indonesia' })

const banks = ref<ContactBank[]>([{ id: 'b1', bankName: '', branch: '', accountNo: '', accountName: '' }])

onMounted(() => {
  if (!isEdit.value) return
  const c = getContact(props.orderId!)
  if (!c) return
  Object.assign(form, { ...c, banks: undefined })
  emailText.value = c.emails.join(', ')
  creditLimitText.value = c.creditLimit == null ? '' : formatThousands(String(c.creditLimit))
  banks.value = c.banks.length
    ? c.banks.map((b) => ({ ...b }))
    : [{ id: 'b1', bankName: '', branch: '', accountNo: '', accountName: '' }]
  sameAsBilling.value = !!c.shippingAddress && c.shippingAddress === c.billingAddress
})

// ── Contact type (at least one role) ─────────────────────────────────────────
const TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: 'customer', label: 'Customer' },
  { value: 'vendor',   label: 'Vendor'   },
  { value: 'other',    label: 'Others'   },
]
function toggleType(v: ContactType) {
  const i = form.types.indexOf(v)
  if (i === -1) form.types.push(v)
  else form.types.splice(i, 1)
  typeError.value = ''
}

// ── Contact group (multi-select; chips render under the select) ───────────────
function toggleGroup(g: string) {
  const i = form.groups.indexOf(g)
  if (i === -1) form.groups.push(g)
  else form.groups.splice(i, 1)
}

// ── Addresses ─────────────────────────────────────────────────────────────────
watch(sameAsBilling, (on) => { if (on) form.shippingAddress = form.billingAddress })
watch(() => form.billingAddress, (v) => { if (sameAsBilling.value) form.shippingAddress = v })

// ── Credit limit (thousands-separated while typing) ───────────────────────────
function formatThousands(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits ? Number(digits).toLocaleString('id-ID') : ''
}
function onCreditLimitInput(v: string) { creditLimitText.value = formatThousands(v) }

// ── Tax info: DJP validation of the NPWP + NITKU pair ─────────────────────────
// Two outcomes, both drawn in the Figma:
//   • valid   → a green check sits inside each field; the fields stay editable
//               and the Validate button stays put (no badge swap).
//   • invalid → both fields turn red with the reason underneath. The reason
//               differs by which half failed — an unknown NPWP vs. a real NPWP
//               paired with a branch that isn't registered to it.
// Which result comes back is a demo toggle (the FAB at the bottom-right), not a
// property of the numbers — so any well-formed pair can show any state.
const { djpOutcome, setDjpOutcome } = useContactTaxScenario()
const isValidating = ref(false)
const taxError = ref('')
const canValidate = computed(() =>
  form.npwp.length === NPWP_LEN && form.nitkuSuffix.length === NITKU_LEN && !isValidating.value)
const isTaxValid = computed(() => form.taxStatus === 'validated' && !isValidating.value)

function onTaxNumberInput() {
  // Editing either half invalidates a previous result.
  form.taxStatus = 'not-validated'
  taxError.value = ''
}
async function validateTax() {
  if (!canValidate.value) return
  isValidating.value = true
  taxError.value = ''
  await new Promise((r) => setTimeout(r, 1500))
  isValidating.value = false

  if (djpOutcome.value === 'valid') {
    form.taxStatus = 'validated'
    return
  }
  form.taxStatus = 'not-validated'
  taxError.value = djpOutcome.value === 'npwp-not-found'
    ? t('NPWP is not found on DJP database.')
    : t('NPWP & NITKU combination is not found on DJP database.')
}

// Switching domicile clears the other side's tax identity.
watch(() => form.domicile, (d) => {
  taxError.value = ''
  form.taxStatus = 'not-validated'
  if (d === 'foreign') { form.npwp = ''; form.nitkuSuffix = '' } else { form.tin = '' }
})

// ── Bank accounts ─────────────────────────────────────────────────────────────
function addBank() {
  banks.value.push({ id: `b${banks.value.length + 1}`, bankName: '', branch: '', accountNo: '', accountName: '' })
}
function removeBank(i: number) { banks.value.splice(i, 1) }

// ── Save ──────────────────────────────────────────────────────────────────────
const typeError = ref('')
const displayNameError = ref('')
const isSaving = ref(false)
// Save is blocked only while a validation call is in flight (Figma: disabled Save
// in the Validating state). Field errors otherwise surface on click.
const isSaveDisabled = computed(() => isValidating.value || isSaving.value)

function goBack() {
  router.push(isEdit.value ? `/${listSlug.value}/${props.orderId}` : `/${listSlug.value}`)
}

async function save() {
  typeError.value = form.types.length ? '' : t('You must select at least one contact type')
  if (!form.displayName.trim()) {
    displayNameError.value = t('You must fill in display name')
  } else {
    const dupe = contacts.some((c) =>
      c.displayName.trim().toLowerCase() === form.displayName.trim().toLowerCase()
      && (!isEdit.value || c.id !== props.orderId))
    displayNameError.value = dupe ? t('Display name already taken') : ''
  }
  if (typeError.value || displayNameError.value) return

  isSaving.value = true
  await new Promise((r) => setTimeout(r, 500))

  const payload = {
    ...form,
    displayName: form.displayName.trim(),
    fullName: form.fullName.trim(),
    companyName: form.companyName.trim(),
    emails: emailText.value.split(',').map((e) => e.trim()).filter(Boolean),
    creditLimit: creditLimitText.value ? Number(creditLimitText.value.replace(/\D/g, '')) : null,
    banks: banks.value.filter((b) => b.bankName || b.accountNo || b.accountName),
    billingAddress: includeAddressDetails.value
      ? [form.billingAddress, addressDetails.city, addressDetails.province, addressDetails.postalCode, addressDetails.country]
        .filter(Boolean).join(', ')
      : form.billingAddress,
    updatedBy: 'Rizal Candra',
    updatedAt: new Date().toISOString(),
  }

  if (isEdit.value) {
    updateContact(props.orderId!, payload)
    toast.notify({ variant: 'success', title: t('Contact updated'), maxWidth: 'max-content' })
    router.push(`/${listSlug.value}/${props.orderId}`)
  } else {
    const created = addContact(payload)
    toast.notify({ variant: 'success', title: t('Contact saved'), maxWidth: 'max-content' })
    router.push(`/${listSlug.value}/${created.id}`)
  }
  isSaving.value = false
}
</script>

<template>
  <div class="nc-page">

    <!-- ── Title bar (breadcrumb above H1, 72px) ── -->
    <header class="nc-titlebar">
      <div class="nc-titlebar-left">
        <button class="nc-breadcrumb" @click="goBack">{{ t(list.label) }}</button>
        <h1 class="nc-title">{{ isEdit ? t('Edit contact') : t('New contact') }}</h1>
      </div>
    </header>

    <!-- ── Stage ── -->
    <div class="nc-stage">
      <div class="nc-form">

        <!-- ── Contact type ── -->
        <section class="nc-section">
          <MpFormControl id="nc-types" :is-invalid="!!typeError">
            <div class="nc-types-label">
              <span class="nc-types-title">{{ t('Contact type') }}</span>
              <span class="nc-types-hint">({{ t('Select at least one') }})<span class="nc-required">*</span></span>
            </div>
            <div class="nc-types-row">
              <label v-for="opt in TYPE_OPTIONS" :key="opt.value" class="nc-choice">
                <MpCheckbox
                  :id="`nc-type-${opt.value}`"
                  :is-checked="form.types.includes(opt.value)"
                  @change="toggleType(opt.value)"
                />
                <span>{{ t(opt.label) }}</span>
              </label>
            </div>
            <MpFormErrorMessage>{{ typeError }}</MpFormErrorMessage>
          </MpFormControl>
        </section>

        <!-- ── Contact info ── -->
        <section class="nc-section">
          <h2 class="nc-section-title">{{ t('Contact info') }}</h2>
          <div class="nc-fields">

            <div class="nc-row">
              <MpFormControl id="nc-display-name" class="nc-col" is-required :is-invalid="!!displayNameError">
                <div class="nc-label-row">
                  <MpFormLabel>{{ t('Display name') }}</MpFormLabel>
                  <span class="nc-counter">{{ form.displayName.length }} / {{ DISPLAY_NAME_MAX }}</span>
                </div>
                <MpInput
                  id="nc-display-name-input" v-model="form.displayName" is-full-width
                  :maxlength="DISPLAY_NAME_MAX" @update:model-value="displayNameError = ''"
                />
                <MpFormErrorMessage>{{ displayNameError }}</MpFormErrorMessage>
              </MpFormControl>

              <!-- Title + name are ONE labelled field visually but TWO controls.
                   They must sit in separate MpFormControls: a control stamps its
                   own id on every input it wraps, so sharing one would give the
                   select and the input the same id (and break the input's
                   binding). The second label is a hidden spacer that keeps the
                   two controls on the same baseline. -->
              <div class="nc-col nc-inline">
                <MpFormControl id="nc-title" class="nc-select-sm">
                  <MpFormLabel>{{ t('Full name') }}</MpFormLabel>
                  <MpPopover id="nc-title-select" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                    <MpPopoverTrigger>
                      <MpSelect
                        id="nc-title-value" :model-value="form.title"
                        :class="css({ width: '100%' })" @mousedown.prevent
                      >
                        <option :value="form.title">{{ form.title }}</option>
                      </MpSelect>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '112px', width: 'max-content' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="o in TITLE_OPTIONS" :key="o"
                          :is-active="o === form.title" @click="form.title = o"
                        >{{ o }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </MpFormControl>
                <MpFormControl id="nc-full-name" class="nc-inline-grow">
                  <MpFormLabel class="nc-label-spacer" aria-hidden="true">{{ t('Full name') }}</MpFormLabel>
                  <MpInput id="nc-full-name-value" v-model="form.fullName" is-full-width />
                </MpFormControl>
              </div>
            </div>

            <div class="nc-row">
              <MpFormControl id="nc-email" class="nc-col">
                <MpFormLabel>{{ t('Email') }}</MpFormLabel>
                <MpInput id="nc-email-input" v-model="emailText" is-full-width placeholder="jaka@hungrybirds.com" />
              </MpFormControl>
              <MpFormControl id="nc-mobile" class="nc-col">
                <MpFormLabel>{{ t('Mobile') }}</MpFormLabel>
                <MpInput id="nc-mobile-input" v-model="form.mobile" is-full-width placeholder="+6281899999999" />
              </MpFormControl>
            </div>

            <!-- Same two-control split as Full name above. -->
            <div class="nc-inline">
              <MpFormControl id="nc-identity-type" class="nc-select-sm">
                <MpFormLabel>{{ t('Identity type') }}</MpFormLabel>
                <MpPopover id="nc-identity-select" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                  <MpPopoverTrigger>
                    <MpSelect
                      id="nc-identity-type-value" :model-value="form.identityType"
                      :class="css({ width: '100%' })" @mousedown.prevent
                    >
                      <option :value="form.identityType">{{ form.identityType }}</option>
                    </MpSelect>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '112px', width: 'max-content' })">
                    <MpPopoverList>
                      <MpPopoverListItem
                        v-for="o in IDENTITY_TYPE_OPTIONS" :key="o"
                        :is-active="o === form.identityType" @click="form.identityType = o"
                      >{{ o }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </MpFormControl>
              <MpFormControl id="nc-identity-number" class="nc-inline-grow">
                <MpFormLabel class="nc-label-spacer" aria-hidden="true">{{ t('Identity type') }}</MpFormLabel>
                <MpInput
                  id="nc-identity-number-value" v-model="form.identityNumber"
                  is-full-width placeholder="3171010101900001"
                />
              </MpFormControl>
            </div>

            <MpFormControl id="nc-groups" class="nc-col">
              <div class="nc-label-row nc-label-row--tight">
                <MpFormLabel>{{ t('Contact group') }}</MpFormLabel>
                <MpTooltip
                  id="nc-groups-tt" use-portal placement="top"
                  :label="t('Group contacts to filter reports and apply the same terms in bulk.')"
                >
                  <span class="nc-info" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
                      <path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                    </svg>
                  </span>
                </MpTooltip>
              </div>
              <MpPopover id="nc-groups-select" use-portal :is-keep-alive="false" placement="bottom-start">
                <MpPopoverTrigger>
                  <MpSelect
                    id="nc-groups-trigger" model-value=""
                    :placeholder="t('Select contact group')"
                    :class="css({ width: '100%' })" @mousedown.prevent
                  />
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '320px', width: 'max-content' })">
                  <MpPopoverList>
                    <MpPopoverListItem
                      v-for="g in CONTACT_GROUP_OPTIONS" :key="g"
                      :is-active="form.groups.includes(g)" @click="toggleGroup(g)"
                    >{{ g }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
              <div v-if="form.groups.length" class="nc-chips">
                <span v-for="g in form.groups" :key="g" class="nc-chip">
                  {{ g }}
                  <button class="nc-chip-remove" :aria-label="`${t('Remove')} ${g}`" @click="toggleGroup(g)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                    </svg>
                  </button>
                </span>
              </div>
            </MpFormControl>

          </div>
        </section>

        <!-- ── Company info ── -->
        <section class="nc-section">
          <h2 class="nc-section-title">{{ t('Company info') }}</h2>
          <div class="nc-fields">

            <MpFormControl id="nc-company-name">
              <div class="nc-label-row">
                <MpFormLabel>{{ t('Company name') }}</MpFormLabel>
                <span class="nc-counter">{{ form.companyName.length }} / {{ COMPANY_NAME_MAX }}</span>
              </div>
              <MpInput id="nc-company-name-input" v-model="form.companyName" is-full-width :maxlength="COMPANY_NAME_MAX" />
            </MpFormControl>

            <MpFormControl id="nc-billing-address">
              <MpFormLabel>{{ t('Billing address') }}</MpFormLabel>
              <MpTextarea id="nc-billing-address-input" v-model="form.billingAddress" is-full-width />
            </MpFormControl>

            <label class="nc-choice nc-choice--standalone">
              <MpCheckbox
                id="nc-address-details" :is-checked="includeAddressDetails"
                @change="includeAddressDetails = !includeAddressDetails"
              />
              <span>{{ t('Include address details') }}</span>
            </label>

            <div v-if="includeAddressDetails" class="nc-fields nc-indent">
              <div class="nc-row">
                <MpFormControl id="nc-city" class="nc-col">
                  <MpFormLabel>{{ t('City') }}</MpFormLabel>
                  <MpInput id="nc-city-input" v-model="addressDetails.city" is-full-width />
                </MpFormControl>
                <MpFormControl id="nc-province" class="nc-col">
                  <MpFormLabel>{{ t('Province') }}</MpFormLabel>
                  <MpInput id="nc-province-input" v-model="addressDetails.province" is-full-width />
                </MpFormControl>
              </div>
              <div class="nc-row">
                <MpFormControl id="nc-postal" class="nc-col">
                  <MpFormLabel>{{ t('Postal code') }}</MpFormLabel>
                  <MpInput id="nc-postal-input" v-model="addressDetails.postalCode" is-full-width />
                </MpFormControl>
                <MpFormControl id="nc-country" class="nc-col">
                  <MpFormLabel>{{ t('Country') }}</MpFormLabel>
                  <MpInput id="nc-country-input" v-model="addressDetails.country" is-full-width />
                </MpFormControl>
              </div>
            </div>

            <MpFormControl id="nc-shipping-address">
              <MpFormLabel>{{ t('Shipping address') }}</MpFormLabel>
              <MpTextarea
                id="nc-shipping-address-input" v-model="form.shippingAddress"
                is-full-width :is-disabled="sameAsBilling"
              />
            </MpFormControl>

            <label class="nc-choice nc-choice--standalone">
              <MpCheckbox id="nc-same-address" :is-checked="sameAsBilling" @change="sameAsBilling = !sameAsBilling" />
              <span>{{ t('Same as billing address') }}</span>
            </label>

            <div class="nc-row">
              <MpFormControl id="nc-phone" class="nc-col">
                <MpFormLabel>{{ t('Phone') }}</MpFormLabel>
                <MpInput id="nc-phone-input" v-model="form.phone" is-full-width />
              </MpFormControl>
              <MpFormControl id="nc-fax" class="nc-col">
                <MpFormLabel>{{ t('Fax') }}</MpFormLabel>
                <MpInput id="nc-fax-input" v-model="form.fax" is-full-width />
              </MpFormControl>
            </div>

          </div>
        </section>

        <!-- ── Tax info ── -->
        <section class="nc-section">
          <h2 class="nc-section-title">{{ t('Tax info') }}</h2>
          <p class="nc-section-desc">{{ t('NPWP will appear on invoices and tax documents.') }}</p>
          <div class="nc-fields">

            <MpFormControl id="nc-domicile">
              <MpFormLabel>{{ t('Domicile') }}</MpFormLabel>
              <div class="nc-types-row">
                <label class="nc-choice">
                  <MpRadio
                    id="nc-domicile-domestic" name="nc-domicile" value="domestic"
                    :is-checked="form.domicile === 'domestic'" @change="form.domicile = 'domestic'"
                  />
                  <span>{{ t('Domestic') }}</span>
                </label>
                <label class="nc-choice">
                  <MpRadio
                    id="nc-domicile-foreign" name="nc-domicile" value="foreign"
                    :is-checked="form.domicile === 'foreign'" @change="form.domicile = 'foreign'"
                  />
                  <span>{{ t('Foreign') }}</span>
                </label>
              </div>
            </MpFormControl>

            <!-- Domestic: NPWP (16) – NITKU (6) + Validate.
                 NPWP and NITKU are separate MpFormControls (each labels its own
                 input); the shared error hangs off the NPWP one. -->
            <div v-if="form.domicile === 'domestic'" class="nc-tax-block">
            <div class="nc-tax-row">
              <MpFormControl id="nc-npwp" class="nc-tax-field" :is-invalid="!!taxError">
                <div class="nc-label-row">
                  <MpFormLabel>{{ t('NPWP') }}</MpFormLabel>
                  <span class="nc-counter">{{ form.npwp.length }} / {{ NPWP_LEN }}</span>
                </div>
                <div class="nc-tax-input" :class="{ 'nc-tax-input--valid': isTaxValid }">
                  <MpInput
                    id="nc-npwp-input" v-model="form.npwp" is-full-width inputmode="numeric"
                    :maxlength="NPWP_LEN" :is-disabled="isValidating"
                    placeholder="0012345678011000" @update:model-value="onTaxNumberInput"
                  />
                  <span v-if="isTaxValid" class="nc-tax-check" :aria-label="t('Validated')" role="img">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <circle cx="10" cy="10" r="10" fill="currentColor" />
                      <path d="M6 10.5l2.5 2.5L14 7.5" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                </div>
              </MpFormControl>

              <span class="nc-tax-sep" aria-hidden="true">–</span>

              <MpFormControl id="nc-nitku" class="nc-tax-field" :is-invalid="!!taxError">
                <div class="nc-label-row">
                  <MpFormLabel>{{ t('NITKU') }}</MpFormLabel>
                  <span class="nc-counter">{{ form.nitkuSuffix.length }} / {{ NITKU_LEN }}</span>
                </div>
                <div class="nc-tax-input" :class="{ 'nc-tax-input--valid': isTaxValid }">
                  <MpInput
                    id="nc-nitku-input" v-model="form.nitkuSuffix" is-full-width inputmode="numeric"
                    :maxlength="NITKU_LEN" :is-disabled="isValidating"
                    placeholder="000022" @update:model-value="onTaxNumberInput"
                  />
                  <span v-if="isTaxValid" class="nc-tax-check" :aria-label="t('Validated')" role="img">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <circle cx="10" cy="10" r="10" fill="currentColor" />
                      <path d="M6 10.5l2.5 2.5L14 7.5" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                </div>
              </MpFormControl>

              <!-- The button stays put through every state — a valid result is
                   signalled by the green checks in the fields, not by swapping
                   the button for a badge. -->
              <div class="nc-tax-action">
                <button v-if="isValidating" class="nc-btn nc-btn--ghost" disabled>
                  <MpSpinner size="sm" />
                  {{ t('Validating') }}
                </button>
                <MpTooltip
                  v-else id="nc-validate-tt" use-portal placement="top"
                  :label="t('Entered info will be validated through the DJP database. Make sure the numbers are correct.')"
                >
                  <button class="nc-btn nc-btn--ghost" :disabled="!canValidate" @click="validateTax">
                    {{ t('Validate') }}
                  </button>
                </MpTooltip>
              </div>
            </div>

            <!-- The failure belongs to the NPWP+NITKU pair, not to either field,
                 so it sits under the whole row and reads on one line. -->
            <p v-if="taxError" class="nc-tax-message" role="alert">{{ taxError }}</p>
            </div>

            <!-- Foreign: single free-form TIN, no DJP validation -->
            <MpFormControl v-else id="nc-tin" class="nc-col-sm">
              <MpFormLabel>{{ t('Tax Identification Number (TIN)') }}</MpFormLabel>
              <MpInput id="nc-tin-input" v-model="form.tin" is-full-width placeholder="012345678011000" />
            </MpFormControl>

          </div>
        </section>

        <!-- ── Credit limit ── -->
        <section class="nc-section">
          <h2 class="nc-section-title">{{ t('Credit limit') }}</h2>
          <p class="nc-section-desc">
            {{ t('The maximum unpaid balance allowed for this customer. Set how over-limit transactions are handled in your approval rules.') }}
            <a class="nc-link" @click.prevent="router.push('/approval-workflows')">{{ t('Go to approval rules') }}</a>
          </p>
          <div class="nc-fields">
            <MpFormControl id="nc-credit-limit" class="nc-col">
              <MpFormLabel>{{ t('Amount') }}</MpFormLabel>
              <div class="nc-prefix-wrap">
                <span class="nc-prefix">Rp</span>
                <input
                  id="nc-credit-limit-input" v-model="creditLimitText" class="nc-prefix-input"
                  type="text" inputmode="numeric" @input="onCreditLimitInput(($event.target as HTMLInputElement).value)"
                />
              </div>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Bank info ── -->
        <section class="nc-section">
          <h2 class="nc-section-title">{{ t('Bank info') }}</h2>
          <div class="nc-fields">
            <div v-for="(bank, i) in banks" :key="bank.id" class="nc-fields nc-bank">
              <div v-if="banks.length > 1" class="nc-bank-head">
                <span class="nc-bank-title">{{ i === 0 ? t('Primary bank account') : `${t('Bank account')} ${i + 1}` }}</span>
                <button class="nc-bank-remove" @click="removeBank(i)">{{ t('Remove') }}</button>
              </div>
              <div class="nc-row">
                <MpFormControl :id="`nc-bank-name-${i}`" class="nc-col">
                  <MpFormLabel>{{ t('Bank name') }}</MpFormLabel>
                  <MpPopover :id="`nc-bank-select-${i}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                    <MpPopoverTrigger>
                      <MpSelect
                        :id="`nc-bank-name-select-${i}`" :model-value="bank.bankName"
                        :placeholder="t('Select bank')" :class="css({ width: '100%' })" @mousedown.prevent
                      >
                        <option v-if="bank.bankName" :value="bank.bankName">{{ bank.bankName }}</option>
                      </MpSelect>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '320px', width: 'max-content' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="b in BANK_OPTIONS" :key="b"
                          :is-active="b === bank.bankName" @click="bank.bankName = b"
                        >{{ b }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </MpFormControl>
                <MpFormControl :id="`nc-bank-branch-${i}`" class="nc-col">
                  <MpFormLabel>{{ t('Bank branch') }}</MpFormLabel>
                  <MpInput :id="`nc-bank-branch-input-${i}`" v-model="bank.branch" is-full-width />
                </MpFormControl>
              </div>
              <div class="nc-row">
                <MpFormControl :id="`nc-bank-account-no-${i}`" class="nc-col">
                  <MpFormLabel>{{ t('Account no.') }}</MpFormLabel>
                  <MpInput :id="`nc-bank-account-no-input-${i}`" v-model="bank.accountNo" is-full-width inputmode="numeric" />
                </MpFormControl>
                <MpFormControl :id="`nc-bank-account-name-${i}`" class="nc-col">
                  <MpFormLabel>{{ t('Account name') }}</MpFormLabel>
                  <MpInput :id="`nc-bank-account-name-input-${i}`" v-model="bank.accountName" is-full-width />
                </MpFormControl>
              </div>
            </div>

            <div>
              <button class="nc-btn nc-btn--ghost nc-btn--icon" @click="addBank">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ t('Add another bank') }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── Default settings ── -->
        <section class="nc-section">
          <h2 class="nc-section-title">{{ t('Default settings') }}</h2>
          <p class="nc-section-desc">{{ t('These settings cannot be changed once the contact has transactions.') }}</p>
          <div class="nc-fields">
            <div class="nc-row">
              <MpFormControl id="nc-ar-account" class="nc-col">
                <MpFormLabel>{{ t('Accounts receivable account') }}</MpFormLabel>
                <MpPopover id="nc-ar-select" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                  <MpPopoverTrigger>
                    <MpSelect id="nc-ar" :model-value="form.arAccount" :class="css({ width: '100%' })" @mousedown.prevent>
                      <option :value="form.arAccount">{{ form.arAccount }}</option>
                    </MpSelect>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '320px', width: 'max-content' })">
                    <MpPopoverList>
                      <MpPopoverListItem
                        v-for="o in AR_ACCOUNT_OPTIONS" :key="o"
                        :is-active="o === form.arAccount" @click="form.arAccount = o"
                      >{{ o }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </MpFormControl>

              <MpFormControl id="nc-ap-account" class="nc-col">
                <MpFormLabel>{{ t('Accounts payable account') }}</MpFormLabel>
                <MpPopover id="nc-ap-select" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                  <MpPopoverTrigger>
                    <MpSelect id="nc-ap" :model-value="form.apAccount" :class="css({ width: '100%' })" @mousedown.prevent>
                      <option :value="form.apAccount">{{ form.apAccount }}</option>
                    </MpSelect>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '320px', width: 'max-content' })">
                    <MpPopoverList>
                      <MpPopoverListItem
                        v-for="o in AP_ACCOUNT_OPTIONS" :key="o"
                        :is-active="o === form.apAccount" @click="form.apAccount = o"
                      >{{ o }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </MpFormControl>
            </div>

            <MpFormControl id="nc-payment-terms" class="nc-col">
              <MpFormLabel>{{ t('Default payment terms') }}</MpFormLabel>
              <MpPopover id="nc-terms-select" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                <MpPopoverTrigger>
                  <MpSelect id="nc-terms" :model-value="form.paymentTerms" :class="css({ width: '100%' })" @mousedown.prevent>
                    <option :value="form.paymentTerms">{{ form.paymentTerms }}</option>
                  </MpSelect>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '320px', width: 'max-content' })">
                  <MpPopoverList>
                    <MpPopoverListItem
                      v-for="o in PAYMENT_TERMS_OPTIONS" :key="o"
                      :is-active="o === form.paymentTerms" @click="form.paymentTerms = o"
                    >{{ o }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Memo ── -->
        <section class="nc-section">
          <h2 class="nc-section-title">{{ t('Memo') }}</h2>
          <div class="nc-fields">
            <MpFormControl id="nc-memo">
              <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
              <MpTextarea id="nc-memo-input" v-model="form.memo" is-full-width />
              <MpFormHelpText>{{ t('Only visible to you and your team') }}</MpFormHelpText>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Action group ── -->
        <div class="nc-actions">
          <button class="nc-btn nc-btn--cancel" @click="goBack">{{ t('Cancel') }}</button>
          <button class="nc-btn nc-btn--primary" :disabled="isSaveDisabled" @click="save">
            {{ isSaving ? t('Saving…') : (isEdit ? t('Save changes') : t('Save')) }}
          </button>
        </div>

      </div>
    </div>
  </div>

  <!-- ── Demo scenario FAB — picks what the mocked DJP lookup returns, so the
       valid / not-found / wrong-combination states can be shown with any
       well-formed NPWP + NITKU ──────────────────────────────────────────────── -->
  <MpPopover id="nc-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab btn-enterprise" :aria-label="t('Change scenario state')">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '280px', width: 'max-content' })">
      <p class="demo-fab-heading">{{ t('NPWP & NITKU validation result') }}</p>
      <MpPopoverList>
        <MpPopoverListItem :is-active="djpOutcome === 'valid'" @click="setDjpOutcome('valid')">
          {{ t('Valid') }}
        </MpPopoverListItem>
        <MpPopoverListItem :is-active="djpOutcome === 'npwp-not-found'" @click="setDjpOutcome('npwp-not-found')">
          {{ t('NPWP not found') }}
        </MpPopoverListItem>
        <MpPopoverListItem :is-active="djpOutcome === 'combination-not-found'" @click="setDjpOutcome('combination-not-found')">
          {{ t('NPWP & NITKU combination not found') }}
        </MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* ── Page shell ── */
.nc-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* ── Title bar (72px, breadcrumb above H1, no gap) ── */
.nc-titlebar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--mp-spacing-6);
}
.nc-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.nc-breadcrumb {
  background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
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
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden; overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}

/* Form column: 6 grid columns = two 320px fields + a 24px gap. */
.nc-form { width: 664px; max-width: 100%; display: flex; flex-direction: column; gap: var(--mp-spacing-8); }

.nc-section { display: flex; flex-direction: column; }
.nc-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
/* description sits between the heading and the first field */
.nc-section-desc {
  margin: -8px 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
}
.nc-link { color: var(--mp-text-link); cursor: pointer; }
.nc-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* 20px row gap — the standard vertical spacing between stacked form fields */
.nc-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.nc-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.nc-col { width: 320px; flex-shrink: 0; }
/* a half-width field that is itself a select+input pair keeps the 320px column */
.nc-col.nc-inline { width: 320px; }
.nc-col-sm { width: 240px; }
.nc-indent { padding-left: calc(var(--mp-sizes-5, 20px) + var(--mp-spacing-3)); }

/* select + input on one line (Full name, Identity type) */
.nc-inline { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); width: 100%; }
.nc-inline-grow { flex: 1; min-width: 0; }
/* MpPopover's root div stretches in a flex row — pin the trigger width here */
.nc-select-sm { flex: 0 0 112px; width: 112px; }
/* invisible duplicate label — reserves the label row so the paired select and
   input line up, without repeating the text for screen readers */
.nc-label-spacer { visibility: hidden; }

/* ── Label row with a character counter ── */
.nc-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); width: 100%; }
.nc-label-row--tight { justify-content: flex-start; gap: var(--mp-spacing-1); }
.nc-counter {
  flex-shrink: 0; font-size: 12px; line-height: 16px;
  color: var(--mp-text-secondary); text-align: right;
}
.nc-info { display: inline-flex; color: var(--mp-icon-subtle, var(--mp-text-secondary)); cursor: default; }

/* ── Contact type ── */
.nc-types-label { display: flex; align-items: baseline; gap: var(--mp-spacing-1); margin-bottom: var(--mp-spacing-2); }
.nc-types-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.nc-types-hint { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.nc-required { color: var(--mp-text-critical, var(--mp-text-danger)); }
.nc-types-row { display: flex; align-items: center; gap: var(--mp-spacing-6); }

/* MpCheckbox/MpRadio ship their own 12px control→label gap — wrapper gap MUST be 0 */
.nc-choice {
  display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.nc-choice--standalone { align-self: flex-start; }

/* ── Contact group chips ── */
.nc-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }
.nc-chip {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-sm, 4px);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.nc-chip-remove {
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: none; padding: 0; cursor: pointer;
  color: var(--mp-icon-subtle, var(--mp-text-secondary));
}
.nc-chip-remove:hover { color: var(--mp-text-default); }

/* ── Tax info row: NPWP – NITKU + action ── */
.nc-tax-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.nc-tax-field { width: 240px; flex-shrink: 0; }
/* separator + action sit on the input line, below the label row */
.nc-tax-sep { padding-top: 30px; color: var(--mp-text-secondary); }
.nc-tax-action { display: flex; align-items: center; padding-top: 24px; }
/* the shared error reads across the whole row, not wrapped inside the 240px
   NPWP column — matches MpFormErrorMessage's size/colour */
.nc-tax-block { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.nc-tax-message {
  margin: 0;
  font-size: var(--mp-font-sizes-sm, 12px);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-critical, var(--mp-text-danger, #c5303b));
}

/* Valid result: a green check sits inside the field's right edge. The input keeps
   room for it so a full 16-digit NPWP never runs under the icon. */
.nc-tax-input { position: relative; }
.nc-tax-check {
  position: absolute; right: var(--mp-spacing-3); top: 50%; transform: translateY(-50%);
  display: inline-flex; pointer-events: none;
  color: var(--mp-icon-success, var(--mp-colors-emerald-700, #029861));
}
.nc-tax-input--valid :deep(input) { padding-right: 36px; }

/* ── Rp-prefixed amount ── */
.nc-prefix-wrap {
  display: flex; align-items: center; width: 100%;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-surface);
}
.nc-prefix-wrap:focus-within {
  border-color: var(--mp-border-focused, #0f6d4d);
  box-shadow: 0 0 0 2px var(--mp-shadow-focused, rgba(15, 109, 77, 0.2));
}
.nc-prefix { padding-left: var(--mp-spacing-3); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md); }
.nc-prefix-input {
  flex: 1; min-width: 0; height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-3) 0 var(--mp-spacing-2);
  border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-family: inherit;
}

/* ── Bank accounts ── */
.nc-bank { gap: var(--mp-spacing-5); }
.nc-bank-head { display: flex; align-items: center; justify-content: space-between; }
.nc-bank-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.nc-bank-remove {
  border: none; background: none; padding: 0; cursor: pointer; font-family: inherit;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link);
}
.nc-bank-remove:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Buttons ── */
.nc-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  font-family: inherit; cursor: pointer; white-space: nowrap;
  border: 1px solid transparent;
}
.nc-btn--ghost {
  background: var(--mp-background-surface);
  border-color: var(--mp-border-bold);
  color: var(--mp-text-default);
}
.nc-btn--ghost:hover:not(:disabled) { background: var(--mp-background-neutral-hovered); }
.nc-btn--ghost:disabled { color: var(--mp-text-disabled); border-color: var(--mp-border-default); cursor: default; }
.nc-btn--icon { font-weight: var(--mp-font-weights-regular); }
.nc-btn--cancel {
  background: transparent; border-color: transparent;
  font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary);
}
.nc-btn--cancel:hover { background: var(--mp-background-neutral-hovered); }
.nc-btn--primary {
  background: var(--mp-colors-emerald-700, #029861);
  border-color: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
}
.nc-btn--primary:hover:not(:disabled) {
  background: var(--mp-colors-emerald-800, #186f4a);
  border-color: var(--mp-colors-emerald-800, #186f4a);
}
.nc-btn--primary:disabled {
  background: var(--mp-background-disabled, #e4e7e7);
  border-color: var(--mp-background-disabled, #e4e7e7);
  color: var(--mp-text-disabled);
  cursor: default;
}

/* ── Action group (right-aligned, last) ── */
.nc-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) 0; }

/* ── Demo scenario FAB (same as ApprovalWorkflowsPage) ── */
.demo-fab {
  /* padding:0 overrides .btn-enterprise's base padding — width/height are fixed here, so
     unset padding would inflate the box beyond 48x48 under content-box sizing. */
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: var(--mp-text-inverse);
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2); /* pixel-police-allow-shadow: floating FAB, not a surface/card */
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
