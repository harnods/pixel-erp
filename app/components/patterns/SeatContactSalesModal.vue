<script setup lang="ts">
/**
 * "Contact Sales" for user seats — ERP and/or CRM — and for the CRM add-on.
 * Self-serve seat purchase is out of scope (PRD A4), so every "limit reached"
 * message (ERP limit full, CRM seats full, CRM Administrator full), the Seat
 * usage dialog and the CRM landing page point here. Same shape as
 * DimensionsIndexPage's "Add quota" modal (rule/modal-use-mpmodal,
 * rule/modal-drawer-close-explicit-only, ghost Cancel + one primary).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup,
} from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
import { useLocale } from '~/composables/useLocale'

export type SeatContactTopic = 'seats' | 'erp-seats' | 'crm-seats' | 'crm-addon'

const props = withDefaults(defineProps<{
  id?: string
  isOpen: boolean
  /** What the customer wants to add — sets the body copy. Default: ERP or CRM seats. */
  topic?: SeatContactTopic
}>(), { id: 'seat-contact-sales-modal', topic: 'seats' })

const emit = defineEmits<{ 'update:isOpen': [value: boolean] }>()
const { t } = useLocale()

const BODY: Record<SeatContactTopic, string> = {
  'seats': 'To add ERP or CRM user seats, contact your account manager or email support-mekarierp@mekari.com.',
  'erp-seats': 'To add ERP user seats, contact your account manager or email support-mekarierp@mekari.com.',
  'crm-seats': 'To add CRM user seats or convert your CRM Free Trial, contact your account manager or email support-mekarierp@mekari.com.',
  'crm-addon': 'To add Mekari CRM to your ERP subscription, contact your account manager or email support-mekarierp@mekari.com.',
}

function close() { emit('update:isOpen', false) }
function contact() {
  infoToast(t('Our Sales team will get in touch with you soon'))
  close()
}
</script>

<template>
  <MpModal
    :id="id"
    :is-open="isOpen"
    size="md"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Contact Sales') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody><span data-test-id="seat-contact-sales-body">{{ t(BODY[props.topic]) }}</span></MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded data-test-id="seat-contact-sales-confirm" @click="contact">{{ t('Contact Sales') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>
