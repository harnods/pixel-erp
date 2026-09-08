<script setup lang="ts">
/**
 * CrmDealQuickCreateDrawer — the PRD "quick create" for a Deal. A short drawer with
 * only the essentials: Deal name, Customer (searchable by COMPANY, with inline
 * "+ New customer"), Stage (defaults to the settings default open stage), and Deal
 * owner (defaults to the current user, changeable). Save creates the deal.
 *
 * "Add more details" hands the entered fields to the full detail FORM — which is a
 * dedicated PAGE (/crm/deals/new), not a drawer/modal.
 *
 * Hand-rolled Teleport overlay shell (Pixel MpDrawer has no structural CSS — see
 * CLAUDE.md). It is a FORM, so an overlay click is ignored; close only via ×,
 * Cancel, or Save. Footer actions always present, never disabled (rule/
 * form-actions-always-present, rule/form-errors-inline).
 */
import { ref, computed, watch } from 'vue'
import {
  MpIcon, MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpAutocomplete,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  crmCustomers, addCrmCustomer, CRM_OWNERS, DEAL_STAGES, CRM_CURRENT_USER,
  defaultDealStage, createDeal,
  type Deal, type DealStage, type DealDraftSeed,
} from '~/data/crm'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ cancel: []; saved: [deal: Deal]; 'open-full': [seed: DealDraftSeed] }>()

const name = ref('')
const customerId = ref('')
const stage = ref<DealStage>('Open Lead')
const owner = ref<string>(CRM_CURRENT_USER)
const errors = ref<Record<string, string>>({})
const formError = ref('')

watch(() => props.open, (open) => {
  if (!open) return
  name.value = ''
  customerId.value = ''
  stage.value = defaultDealStage()
  owner.value = CRM_CURRENT_USER
  errors.value = {}
  formError.value = ''
}, { immediate: true })

// Customer options — labelled by COMPANY name (not the contact person).
const customerData = computed(() =>
  crmCustomers.map((c) => ({ id: c.id, name: c.company })).sort((a, b) => a.name.localeCompare(b.name)),
)

// Quick-add: create a CRM customer from the typed search text and select it
// (rule/select-quick-add — the MpAutocomplete #buttonAction path).
function onCustomerAdd(_suggestions: unknown, currentSearch: string) {
  const n = (currentSearch ?? '').trim()
  if (!n) return
  const c = addCrmCustomer({ company: n, contact: '', email: '', phone: '', city: '', segment: 'Retail', owner: owner.value, lifecycle: 'Lead' })
  customerId.value = c.id
  errors.value = { ...errors.value, customer: '' }
}

const selectedCompany = computed(() => crmCustomers.find((c) => c.id === customerId.value)?.company ?? '')

function seed(): DealDraftSeed {
  return { name: name.value.trim() || undefined, customerId: customerId.value || undefined, stage: stage.value, owner: owner.value }
}
function validate(): boolean {
  const e: Record<string, string> = {}
  const n = name.value.trim()
  if (!n) e.name = 'Deal name is required.'
  else if (n.length > 100) e.name = 'Deal name must be 100 characters or fewer.'
  if (!customerId.value) e.customer = 'Select a customer.'
  errors.value = e
  return Object.keys(e).length === 0
}
function save() {
  if (!validate()) { formError.value = 'Please fix the highlighted fields before saving.'; return }
  formError.value = ''
  const d = createDeal({
    name: name.value.trim(), customerId: customerId.value, company: selectedCompany.value,
    stage: stage.value, owner: owner.value, value: 0, currency: 'IDR', exchangeRate: 1, expectedCloseDate: '',
  }, CRM_CURRENT_USER)
  emit('saved', d)
}
function openFull() { emit('open-full', seed()) }
</script>

<template>
  <Teleport to="body">
    <Transition name="cqd">
      <div v-if="open" class="cqd-overlay">
        <div class="cqd-panel" role="dialog" aria-label="Create deal">
          <header class="cqd-header">
            <span class="cqd-title">New deal</span>
            <MpButton class="cqd-close" aria-label="Close" @click="emit('cancel')"><MpIcon name="close" size="md" /></MpButton>
          </header>

          <div class="cqd-body">
            <MpFormControl id="cqd-name-fc" :is-invalid="!!errors.name">
              <MpFormLabel>Deal name</MpFormLabel>
              <input v-model="name" class="cqd-input" :class="{ 'cqd-input--invalid': !!errors.name }" type="text" maxlength="120" @input="errors.name = ''">
              <MpFormErrorMessage v-if="errors.name">{{ errors.name }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="cqd-customer-fc" :is-invalid="!!errors.customer">
              <MpFormLabel>Customer</MpFormLabel>
              <MpAutocomplete
                id="cqd-customer"
                v-model="customerId"
                :data="customerData"
                label-prop="name"
                value-prop="id"
                is-searchable
                is-clearable
                use-portal
                is-full-width
                is-show-button-action
                placeholder="Select customer"
                :is-invalid="!!errors.customer"
                @update:model-value="errors.customer = ''"
                @button-action="onCustomerAdd"
              >
                <template #buttonAction="{ currentSearch }">
                  {{ currentSearch ? `Add "${currentSearch}" as a new customer` : 'Add new customer' }}
                </template>
              </MpAutocomplete>
              <MpFormErrorMessage v-if="errors.customer">{{ errors.customer }}</MpFormErrorMessage>
            </MpFormControl>

            <div class="cqd-field">
              <span class="cqd-label">Stage</span>
              <ErpFilterSelect id="cqd-stage" :model-value="stage" placeholder="Stage" :options="[...DEAL_STAGES]" :is-clearable="false" width="100%" @update:model-value="(v: string) => (stage = v as DealStage)" />
            </div>
            <div class="cqd-field">
              <span class="cqd-label">Deal owner</span>
              <ErpFilterSelect id="cqd-owner" :model-value="owner" placeholder="Deal owner" :options="[...CRM_OWNERS]" :is-clearable="false" width="100%" @update:model-value="(v: string) => (owner = v)" />
            </div>

            <p v-if="formError" class="cqd-form-error">{{ formError }}</p>
          </div>

          <footer class="cqd-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('cancel')">Cancel</button>
            <!-- Split button: Save + a caret whose menu offers "Continue with more details". -->
            <div class="cqd-split">
              <button class="btn-enterprise btn-enterprise--primary cqd-split-main" type="button" @click="save">Save</button>
              <MpPopover id="cqd-save-more" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
                <MpPopoverTrigger>
                  <button class="btn-enterprise btn-enterprise--primary cqd-split-caret" type="button" aria-label="More save options"><MpIcon name="chevrons-down" size="sm" /></button>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content' })">
                  <MpPopoverList>
                    <MpPopoverListItem @click="openFull">Continue with more details</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cqd-enter-active, .cqd-leave-active { transition: background-color 250ms ease; }
.cqd-enter-from, .cqd-leave-to { background-color: transparent; }
.cqd-enter-active .cqd-panel { transition: transform 350ms ease-out; }
.cqd-leave-active .cqd-panel { transition: transform 250ms ease-in; }
.cqd-enter-from .cqd-panel, .cqd-leave-to .cqd-panel { transform: translateX(calc(100% + 12px)); }

.cqd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cqd-panel { margin: var(--mp-spacing-3); width: min(460px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.cqd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.cqd-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cqd-close { display: inline-flex !important; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.cqd-close:hover { background: var(--mp-background-neutral-hovered); }

.cqd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5); padding: var(--mp-spacing-5); }
.cqd-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.cqd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.cqd-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cqd-label-row { display: flex; align-items: center; justify-content: space-between; }

.cqd-input { width: 100%; box-sizing: border-box; height: var(--mp-sizes-10, 40px); padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.cqd-input:focus { border-color: var(--mp-border-bold, #8c9596); box-shadow: 0 0 0 3px var(--mp-background-neutral-hovered, rgba(140, 149, 150, 0.24)); }
.cqd-input--invalid { border-color: var(--mp-border-danger, #e2483d); }

.cqd-err { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c9372c); }
.cqd-err--block { display: block; margin-top: var(--mp-spacing-1); }

.cqd-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.cqd-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cqd-quickcreate { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); flex-wrap: wrap; }
.cqd-quickcreate .cqd-input { flex: 1; min-width: 0; }

.cqd-more { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); align-self: flex-start; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px dashed var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-md, 6px); background: transparent; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.cqd-more:hover { background: var(--mp-background-neutral-subtle); }

.cqd-form-error { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger, #c9372c); }

.cqd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); }

/* Split button: Save + attached caret, joined into one pill. */
.cqd-split { display: inline-flex; align-items: stretch; }
.cqd-split-main { border-top-right-radius: 0 !important; border-bottom-right-radius: 0 !important; }
.cqd-split-caret { display: inline-flex; align-items: center; justify-content: center; width: 34px; padding: 0 !important; border-top-left-radius: 0 !important; border-bottom-left-radius: 0 !important; border-left: 1px solid rgba(255, 255, 255, 0.28) !important; }
</style>
