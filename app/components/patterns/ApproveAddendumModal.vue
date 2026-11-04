<script setup lang="ts">
/**
 * ApproveAddendumModal — the approver's gate on a contract addendum.
 *
 * Approving moves the contract value and may true up revenue already recognized,
 * so the dialog states the before/after, the reason and the plain-language effect
 * before the click. It cannot be undone here, only reversed by another addendum.
 * Chrome matches ConfirmModal: MpModal md, ghost Cancel + pill confirm, explicit
 * close only.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpText,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import { formatIdr } from '~/data/projectAccounting'

const props = defineProps<{
  isOpen: boolean
  oldValue: number
  newValue: number
  reason: string
  /** Plain-language description of what approving does to recognized revenue. */
  effect: string
  raisedBy: string
  /** The current user approving (from View as). Omitted → no approver line. */
  approverName?: string
  approverRole?: string
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm'): void
}>()

const { t } = useLocale()

let _seq = 0
const modalId = `approve-addendum-modal-${(_seq += 1)}-${Math.floor(performance.now())}`

const delta = computed(() => props.newValue - props.oldValue)
const deltaLabel = computed(() => `${delta.value >= 0 ? '+' : '−'}${formatIdr(Math.abs(delta.value))}`)
const approverLine = computed(() =>
  [props.approverName, props.approverRole].filter((s) => !!s && String(s).trim()).join(' · '))

function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm'); close() }
</script>

<template>
  <MpModal :id="modalId" :is-open="isOpen" size="md" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="close">
    <MpModalContent>
      <MpModalHeader>
        {{ t('Approve addendum?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="aam-body">
          <MpText>{{ t('The contract value will change. To reverse it, submit another addendum.') }}</MpText>

          <div class="aam-figures">
            <ContentList horizontal :label="t('Current contract value')">
              <span class="aam-num">{{ formatIdr(oldValue) }}</span>
            </ContentList>
            <ContentList horizontal :label="t('New contract value')">
              <span class="aam-num">{{ formatIdr(newValue) }}</span>
            </ContentList>
            <ContentList horizontal :label="t('Change')">
              <span class="aam-num aam-num--strong">{{ deltaLabel }}</span>
            </ContentList>
            <ContentList horizontal :label="t('Reason')" :value="reason || '—'" />
            <ContentList horizontal :label="t('Submitted by')" :value="raisedBy || '—'" />
            <ContentList v-if="approverLine" horizontal :label="t('Approving as')" :value="approverLine" />
          </div>

          <MpText v-if="effect">{{ effect }}</MpText>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">{{ t('Approve addendum') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.aam-body { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.aam-figures { border-top: 1px solid var(--mp-border-default); border-bottom: 1px solid var(--mp-border-default); }
.aam-num { font-variant-numeric: tabular-nums; }
.aam-num--strong { font-weight: var(--mp-font-weights-semi-bold); }
</style>
