<script setup lang="ts">
/**
 * New contact form (CRM › Customers › Contacts › New contact).
 * Route `/crm/customers/contacts/new` (create-only — CRM edits use the record page).
 *
 * A CRM contact is a PERSON: identity + how to reach them + which company they
 * belong to. Company-level detail (company info, tax, credit limit, bank,
 * default accounting settings) lives on the New company form, not here.
 *
 * A contact belongs to exactly ONE company (single-select); a company may hold
 * many contacts. The slim `CrmContactPerson` record keeps `companyIds` as an
 * array for storage, so a chosen company is saved as a single-element array.
 *
 * Rules: footer ghost Cancel + primary Save always present
 * (rule/form-actions-always-present); validation errors render inline below the
 * field, never as a toast (rule/form-errors-inline); 6-col form, 20px row gap
 * (rule/form-field-stacking); display name carries a char counter
 * (rule/input-char-counter); no example placeholders on text inputs
 * (rule/input-no-placeholder). Selects reuse the Contacts form's
 * MpSelect-in-popover pattern (native menu suppressed via @mousedown.prevent;
 * options come from the in-DOM MpPopover — no OS dropdown, per
 * rule/select-erpfilterselect intent).
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpButton, MpButtonGroup, MpInput, MpTextarea, MpSelect, MpAutocomplete,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  toast, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import CrmCompanyFormDrawer from '~/components/patterns/CrmCompanyFormDrawer.vue'
import { TITLE_OPTIONS } from '~/data/contacts'
import { addCrmContactPerson, crmCompanies, CRM_OWNERS, type CrmCompany } from '~/data/crm'

const router = useRouter()
const { t } = useLocale()

const CONTACTS_PATH = '/crm/customers/contacts'
// The signed-in user (shown in the top bar) owns contacts created here.
const CURRENT_USER = 'Rizal Candra'

const DISPLAY_NAME_MAX = 60

// ── Form state ────────────────────────────────────────────────────────────────
const displayName = ref('')
const title = ref(TITLE_OPTIONS[0] ?? 'Mr')
const fullName = ref('')
// The design's two email inputs collapse to one comma-separated field.
const emailText = ref('')
const mobile = ref('')
const companyId = ref('')
const owner = ref(CURRENT_USER)
const memo = ref('')
const ownerOptions = CRM_OWNERS.map((o) => ({ value: o, label: o }))

// ── Company (single-select from the CRM company list, with inline quick-add) ──
// MpAutocomplete data is {id,name}; the quick-add action opens the full New-company
// form in a drawer, and the created company is selected on return.
const companyData = ref(crmCompanies.map((c) => ({ id: c.id, name: c.name })))
const companyDrawerOpen = ref(false)
const pendingCompanyName = ref('')
function onCompanyAdd(_suggestions: unknown, currentSearch: string) {
  pendingCompanyName.value = currentSearch.trim()
  companyDrawerOpen.value = true
}
function onCompanyCreated(co: CrmCompany) {
  companyData.value.push({ id: co.id, name: co.name })
  companyId.value = co.id
  companyDrawerOpen.value = false
}

// ── Save ──────────────────────────────────────────────────────────────────────
const displayNameError = ref('')
const isSaving = ref(false)

function goBack() { router.push(CONTACTS_PATH) }

async function save() {
  displayNameError.value = displayName.value.trim() ? '' : t('You must fill in display name')
  if (displayNameError.value) return

  isSaving.value = true
  await new Promise((r) => setTimeout(r, 500))

  const emails = emailText.value.split(',').map((e) => e.trim()).filter(Boolean)
  const created = addCrmContactPerson({
    name: displayName.value.trim(),
    fullName: fullName.value.trim(),
    jobTitle: '',
    email: emails[0] ?? '',
    phone: mobile.value.trim(),
    companyIds: companyId.value ? [companyId.value] : [],
    owner: owner.value,
  }, new Date().toISOString())

  toast.notify({ variant: 'success', title: t('Contact saved'), maxWidth: 'max-content' })
  isSaving.value = false
  router.push(`${CONTACTS_PATH}/${created.id}`)
}
</script>

<template>
  <div class="nc-page">

    <!-- ── Title bar (breadcrumb above H1, 72px) ── -->
    <header class="nc-titlebar">
      <div class="nc-titlebar-left">
        <a class="nc-breadcrumb" role="link" tabindex="0" @click="goBack" @keydown.enter="goBack">{{ t('Contacts') }}</a>
        <h1 class="nc-title">{{ t('New contact') }}</h1>
      </div>
    </header>

    <!-- ── Stage ── -->
    <div class="nc-stage">
      <div class="nc-form">

        <!-- ── Contact info ── -->
        <section class="nc-section">
          <h2 class="nc-section-title">{{ t('Contact info') }}</h2>
          <div class="nc-fields">

            <div class="nc-row">
              <MpFormControl id="nc-display-name" class="nc-col" is-required :is-invalid="!!displayNameError">
                <div class="nc-label-row">
                  <MpFormLabel>{{ t('Display name') }}</MpFormLabel>
                  <span class="nc-counter">{{ displayName.length }} / {{ DISPLAY_NAME_MAX }}</span>
                </div>
                <MpInput
                  id="nc-display-name-input" v-model="displayName" is-full-width
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
                        id="nc-title-value" :model-value="title"
                        :class="css({ width: '100%' })" @mousedown.prevent
                      >
                        <option :value="title">{{ title }}</option>
                      </MpSelect>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '112px', width: 'max-content' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="o in TITLE_OPTIONS" :key="o"
                          :is-active="o === title" @click="title = o"
                        >{{ o }}</MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </MpFormControl>
                <MpFormControl id="nc-full-name" class="nc-inline-grow">
                  <MpFormLabel class="nc-label-spacer" aria-hidden="true">{{ t('Full name') }}</MpFormLabel>
                  <MpInput id="nc-full-name-value" v-model="fullName" is-full-width />
                </MpFormControl>
              </div>
            </div>

            <div class="nc-row">
              <MpFormControl id="nc-email" class="nc-col">
                <MpFormLabel>{{ t('Email') }}</MpFormLabel>
                <MpInput id="nc-email-input" v-model="emailText" is-full-width />
              </MpFormControl>
              <MpFormControl id="nc-mobile" class="nc-col">
                <MpFormLabel>{{ t('Mobile') }}</MpFormLabel>
                <MpInput id="nc-mobile-input" v-model="mobile" is-full-width />
              </MpFormControl>
            </div>

            <!-- Company — the single company this contact belongs to. A company
                 that doesn't exist yet can be created inline (quick-add). -->
            <MpFormControl id="nc-company" class="nc-col">
              <MpFormLabel>{{ t('Company') }}</MpFormLabel>
              <MpAutocomplete
                id="nc-company-inp"
                v-model="companyId"
                :data="companyData"
                label-prop="name" value-prop="id"
                is-searchable is-clearable use-portal is-full-width
                is-show-button-action
                :placeholder="t('Select company')"
                @button-action="onCompanyAdd"
              >
                <template #buttonAction="{ currentSearch }">
                  {{ currentSearch ? `${t('Add')} "${currentSearch}" ${t('as a new company')}` : t('Add new company') }}
                </template>
              </MpAutocomplete>
            </MpFormControl>

            <!-- Owner — defaults to the signed-in user. -->
            <MpFormControl id="nc-owner" class="nc-col">
              <MpFormLabel>{{ t('Owner') }}</MpFormLabel>
              <ErpFilterSelect
                id="nc-owner-select" :model-value="owner" :placeholder="t('Select owner')"
                :options="ownerOptions" :is-clearable="false" width="100%"
                @update:model-value="(v: string) => { owner = v }"
              />
            </MpFormControl>

          </div>
        </section>

        <!-- ── Note ── -->
        <section class="nc-section">
          <h2 class="nc-section-title">{{ t('Note') }}</h2>
          <div class="nc-fields">
            <MpFormControl id="nc-memo">
              <MpFormLabel>{{ t('Note') }}</MpFormLabel>
              <MpTextarea id="nc-memo-input" v-model="memo" is-full-width />
              <MpFormHelpText>{{ t('Only visible to you and your team') }}</MpFormHelpText>
            </MpFormControl>
          </div>
        </section>

        <!-- ── Action group ── -->
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="save">
            {{ isSaving ? t('Saving…') : t('Save') }}
          </MpButton>
        </MpButtonGroup>

        <!-- Quick-add company — opens the full New-company form in a drawer -->
        <CrmCompanyFormDrawer
          :is-open="companyDrawerOpen"
          :initial-name="pendingCompanyName"
          @update:is-open="companyDrawerOpen = $event"
          @created="onCompanyCreated"
        />

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
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}

/* 20px row gap — the standard vertical spacing between stacked form fields */
.nc-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.nc-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.nc-col { width: 320px; flex-shrink: 0; }
/* ErpFilterSelect renders an inline-flex root — stretch it to fill the field
   column so the Owner select matches the Company field's width. */
.nc-col :deep(.efs) { display: flex; width: 100%; }
/* a half-width field that is itself a select+input pair keeps the 320px column */
.nc-col.nc-inline { width: 320px; }

/* select + input on one line (Full name) */
.nc-inline { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); width: 100%; }
.nc-inline-grow { flex: 1; min-width: 0; }
/* MpPopover's root div stretches in a flex row — pin the trigger width here */
.nc-select-sm { flex: 0 0 112px; width: 112px; }
/* invisible duplicate label — reserves the label row so the paired select and
   input line up, without repeating the text for screen readers */
.nc-label-spacer { visibility: hidden; }

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
