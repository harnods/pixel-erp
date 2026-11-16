<script setup lang="ts">
/**
 * VerifyMilestoneModal — records the verification of an output milestone before
 * its revenue is recognized: date, who verified it, an optional supporting
 * document (BAST or progress report), and the amount that will be recognized.
 * When an Approval workflows rule matches (needsApproval) the confirm submits the
 * verification for approval instead of recognizing revenue straight away.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpText, MpFormControl, MpFormLabel, MpFormErrorMessage, MpFormHelpText,
  MpInput, MpDatePicker, MpBanner, MpBannerIcon, MpBannerDescription,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import { formatIdr, type MilestoneVerificationInput } from '~/data/projectAccounting'

const props = defineProps<{
  isOpen: boolean
  milestoneLabel: string
  amount: number
  defaultVerifier: string
  /** YYYY-MM-DD */
  today: string
  needsApproval: boolean
  approverNames: string[]
}>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'confirm', info: MilestoneVerificationInput): void }>()

const { t } = useLocale()

let _seq = 0
const uid = `${(_seq += 1)}-${Math.floor(performance.now())}`
const modalId = `verify-milestone-modal-${uid}`

// The house date picker works in DD/MM/YYYY; the contract carries YYYY-MM-DD.
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
function displayToIso(d: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

const date = ref('')
const verifiedBy = ref('')
const documentName = ref('')
const dateError = ref('')
const verifierError = ref('')

function reset() {
  date.value = isoToDisplay(props.today)
  verifiedBy.value = props.defaultVerifier ?? ''
  documentName.value = ''
  dateError.value = ''
  verifierError.value = ''
}
watch(() => props.isOpen, (open) => { if (open) reset() }, { immediate: true })

const approverText = computed(() => {
  const n = props.approverNames.filter(Boolean)
  if (n.length === 0) return t('an approver')
  if (n.length === 1) return n[0]!
  return `${n.slice(0, -1).join(', ')} ${t('and')} ${n[n.length - 1]}`
})

function close() { emit('update:isOpen', false) }
function confirm() {
  const iso = displayToIso(date.value)
  dateError.value = iso ? '' : t('You must select verification date')
  verifierError.value = verifiedBy.value.trim() ? '' : t('You must fill in verified by')
  if (dateError.value || verifierError.value) return
  emit('confirm', { date: iso, verifiedBy: verifiedBy.value.trim(), document: documentName.value.trim() || null })
  close()
}
</script>

<template>
  <MpModal :id="modalId" :is-open="isOpen" size="md" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="close">
    <MpModalContent>
      <MpModalHeader>
        {{ t('Verify milestone') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="vmm-body">
          <div class="vmm-summary">
            <ContentList horizontal :label="t('Milestone')" :value="milestoneLabel" />
            <ContentList horizontal :label="t('Revenue to recognize')">
              <span class="vmm-num">{{ formatIdr(amount) }}</span>
            </ContentList>
          </div>

          <MpFormControl :id="`vmm-date-${uid}`" is-required :is-invalid="!!dateError">
            <MpFormLabel>{{ t('Verification date') }}</MpFormLabel>
            <MpDatePicker :id="`vmm-date-input-${uid}`" :model-value="date" format="DD/MM/YYYY" value-type="format"
              use-portal :is-clearable="false" :is-invalid="!!dateError"
              @update:model-value="(v: string) => { date = v; dateError = '' }" />
            <MpFormErrorMessage>{{ dateError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl :id="`vmm-verifier-${uid}`" is-required :is-invalid="!!verifierError">
            <MpFormLabel>{{ t('Verified by') }}</MpFormLabel>
            <MpInput :id="`vmm-verifier-input-${uid}`" v-model="verifiedBy" is-full-width :is-invalid="!!verifierError"
              @update:model-value="verifierError = ''" />
            <MpFormErrorMessage>{{ verifierError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl :id="`vmm-document-${uid}`">
            <MpFormLabel>{{ t('Supporting document') }}</MpFormLabel>
            <MpInput :id="`vmm-document-input-${uid}`" v-model="documentName" is-full-width />
            <MpFormHelpText>{{ t('File name of the BAST or progress report. Optional.') }}</MpFormHelpText>
          </MpFormControl>

          <MpBanner v-if="needsApproval" :id="`vmm-approval-${uid}`" variant="info">
            <MpBannerIcon :id="`vmm-approval-icon-${uid}`" />
            <MpBannerDescription>
              {{ t('This goes to') }} {{ approverText }} {{ t('for approval before revenue is recognized.') }}
            </MpBannerDescription>
          </MpBanner>
          <MpText v-else color="text.secondary">{{ t('Revenue is recognized when you verify.') }}</MpText>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">
            {{ needsApproval ? t('Submit for approval') : t('Verify milestone') }}
          </MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.vmm-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.vmm-summary { border-top: 1px solid var(--mp-border-default); border-bottom: 1px solid var(--mp-border-default); }
.vmm-num { font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-semi-bold); }
</style>
