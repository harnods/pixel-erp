<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpFlex, MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpSelect, MpDatePicker,
  MpButton, toast,
} from '@mekari/pixel3'
import { xpmMyClaims, type XpmClaim } from '~/data/xpm'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()

const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')
const DESC_MAX = 600

// ── Form model ──
const category = ref('')
const txDate = ref('')
const amount = ref('')
const vendor = ref('')
const description = ref('')
const referenceNumber = ref('')
const priority = ref('')
const pic = ref('')

const categoryOptions = ['Transportation', 'Entertainment', 'Equipment', 'Office Supplies', 'Software']
const priorityOptions = ['P1 - High', 'P2 - Medium', 'P3 - Low']
const picOptions = ['Bayu Ferdian', 'Rizal Candra', 'Citra Purnama']

// ── Errors (only fire on submit; never inline while typing) ──
const categoryError = ref('')
const amountError = ref('')
const vendorError = ref('')

// Edit mode · prefill from the claim.
onMounted(() => {
  if (!isEdit.value) return
  const claim: XpmClaim | undefined = xpmMyClaims.find((c) => c.id === props.orderId)
  if (!claim) return
  category.value = claim.category
  txDate.value = ''
  amount.value = String(claim.amount)
  vendor.value = claim.subCategory
  referenceNumber.value = claim.id
})

function goBack() { router.push('/my-claims') }

function submit() {
  categoryError.value = category.value ? '' : 'You must select claim category.'
  amountError.value = String(amount.value).trim() ? '' : 'You must fill in amount.'
  vendorError.value = vendor.value.trim() ? '' : 'You must fill in vendor.'
  if (categoryError.value || amountError.value || vendorError.value) return

  toast.notify({
    variant: 'success',
    title: isEdit.value ? 'Reimbursement changes saved.' : 'Reimbursement request submitted.',
    maxWidth: 'max-content',
  })
  router.push('/my-claims')
}
</script>

<template>
  <div class="cf-page">

    <!-- ── Title bar ── -->
    <div class="cf-titlebar">
      <div class="cf-titlebar-left">
        <button class="cf-breadcrumb" @click="goBack">My claims</button>
        <h1 class="cf-title">{{ isEdit ? 'Edit reimbursement request' : 'Request reimbursement' }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="cf-stage">
      <div class="cf-form">
        <MpFlex direction="column" gap="5">

          <!-- Claim category -->
          <MpFormControl id="cf-category" is-required :is-invalid="!!categoryError">
            <MpFormLabel>Claim category</MpFormLabel>
            <MpSelect id="cf-category-inp" v-model="category" placeholder="Select claim category" is-full-width @update:model-value="categoryError = ''">
              <option v-for="opt in categoryOptions" :key="opt" :value="opt">{{ opt }}</option>
            </MpSelect>
            <MpFormErrorMessage>{{ categoryError }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Transaction date -->
          <MpFormControl id="cf-tx-date" is-required>
            <MpFormLabel>Transaction date</MpFormLabel>
            <MpDatePicker id="cf-tx-date-inp" v-model="txDate" format="DD/MM/YYYY" value-type="format" placeholder="Select date" :use-portal="false" />
          </MpFormControl>

          <!-- Amount -->
          <MpFormControl id="cf-amount" is-required :is-invalid="!!amountError">
            <MpFormLabel>Amount</MpFormLabel>
            <MpInputGroup id="cf-amount-group" is-full-width>
              <MpInputLeftAddon>Rp</MpInputLeftAddon>
              <MpInput id="cf-amount-inp" v-model="amount" placeholder="0" @update:model-value="amountError = ''" />
            </MpInputGroup>
            <MpFormErrorMessage>{{ amountError }}</MpFormErrorMessage>
            <MpFormHelpText>Available limit: Rp5.000.000</MpFormHelpText>
          </MpFormControl>

          <!-- Vendor -->
          <MpFormControl id="cf-vendor" is-required :is-invalid="!!vendorError">
            <MpFormLabel>Vendor</MpFormLabel>
            <MpInput id="cf-vendor-inp" v-model="vendor" placeholder="Enter vendor" @update:model-value="vendorError = ''" />
            <MpFormErrorMessage>{{ vendorError }}</MpFormErrorMessage>
          </MpFormControl>

          <!-- Receipt -->
          <MpFormControl id="cf-receipt" is-required>
            <MpFormLabel>Receipt</MpFormLabel>
            <div class="cf-receipt">
              <MpButton variant="secondary" is-rounded>Browse file</MpButton>
              <span class="cf-receipt-text">No file selected</span>
            </div>
            <MpFormHelpText>Files must be in JPG, JPEG, PNG, PDF with a max size of 5MB. Up to 5 files.</MpFormHelpText>
          </MpFormControl>

          <!-- Description -->
          <MpFormControl id="cf-description">
            <div class="cf-label-row">
              <MpFormLabel>Description</MpFormLabel>
              <span class="cf-counter">{{ description.length }} / {{ DESC_MAX }}</span>
            </div>
            <MpTextarea id="cf-description-inp" v-model="description" :maxlength="DESC_MAX" is-full-width placeholder="Enter description" />
          </MpFormControl>

          <!-- Additional details -->
          <h3 class="cf-section-title">Additional details</h3>

          <MpFormControl id="cf-reference">
            <MpFormLabel>Reference number</MpFormLabel>
            <MpInput id="cf-reference-inp" v-model="referenceNumber" placeholder="Enter reference number" />
          </MpFormControl>

          <MpFormControl id="cf-priority">
            <MpFormLabel>Priority</MpFormLabel>
            <MpSelect id="cf-priority-inp" v-model="priority" placeholder="Select priority" is-full-width>
              <option v-for="opt in priorityOptions" :key="opt" :value="opt">{{ opt }}</option>
            </MpSelect>
          </MpFormControl>

          <MpFormControl id="cf-pic">
            <MpFormLabel>PIC</MpFormLabel>
            <MpSelect id="cf-pic-inp" v-model="pic" placeholder="Select pic" is-full-width>
              <option v-for="opt in picOptions" :key="opt" :value="opt">{{ opt }}</option>
            </MpSelect>
          </MpFormControl>

          <!-- Action group -->
          <div class="cf-actions">
            <MpFlex gap="3">
              <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
              <MpButton variant="primary" is-rounded @click="submit">{{ isEdit ? 'Save changes' : 'Submit' }}</MpButton>
            </MpFlex>
          </div>

        </MpFlex>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cf-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

/* ── Title bar (72px, neutral-subtle, breadcrumb above H1 no gap) ── */
.cf-titlebar {
  flex-shrink: 0; height: 72px; background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between; padding: 0 var(--mp-spacing-6);
}
.cf-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.cf-breadcrumb {
  background: none; border: none; cursor: pointer; padding: 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm, 16px); font-family: inherit; white-space: nowrap;
}
.cf-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cf-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}

/* ── Stage ── */
.cf-stage {
  flex: 1; background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden; overflow-y: auto;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}
.cf-form { width: 558px; max-width: 100%; }

/* ── Label row with char counter ── */
.cf-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); width: 100%; }
.cf-counter { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); line-height: 16px; color: var(--mp-text-secondary); text-align: right; }

/* ── Section heading ── */
.cf-section-title {
  margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* ── Receipt ── */
.cf-receipt { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cf-receipt-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Actions ── */
.cf-actions { display: flex; justify-content: flex-end; padding-top: var(--mp-spacing-2); }
</style>
