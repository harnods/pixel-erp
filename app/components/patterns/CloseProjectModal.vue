<script setup lang="ts">
/**
 * CloseProjectModal — confirm before a project is closed. States the final
 * revenue, cost and margin so the closer sees what is being locked in. Closing
 * is reversible from Project health (Reopen project), so the confirm is primary,
 * not danger. Chrome matches ConfirmModal: MpModal md, ghost Cancel + pill confirm,
 * explicit close only.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpText,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import { formatIdr, formatIdrSigned } from '~/data/projectAccounting'

const props = defineProps<{
  isOpen: boolean
  projectName: string
  summary: { revenue: number; cost: number; margin: number; marginPct: number | null }
}>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'confirm'): void }>()

const { t } = useLocale()

let _seq = 0
const modalId = `close-project-modal-${(_seq += 1)}-${Math.floor(performance.now())}`

const marginText = computed(() => {
  const amt = formatIdrSigned(props.summary.margin)
  const pct = props.summary.marginPct
  return pct == null || !Number.isFinite(pct) ? amt : `${amt} (${pct.toFixed(1)}%)`
})

function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm'); close() }
</script>

<template>
  <MpModal :id="modalId" :is-open="isOpen" size="md" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="close">
    <MpModalContent>
      <MpModalHeader>
        {{ t('Close project?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="cpm-body">
          <MpText>{{ t('These are the final figures for') }} {{ projectName }}.</MpText>
          <div class="cpm-figures">
            <ContentList horizontal :label="t('Revenue recognized')">
              <span class="cpm-num">{{ formatIdr(summary.revenue) }}</span>
            </ContentList>
            <ContentList horizontal :label="t('Cost')">
              <span class="cpm-num">{{ formatIdr(summary.cost) }}</span>
            </ContentList>
            <ContentList horizontal :label="t('Margin')">
              <span class="cpm-num cpm-num--strong" :class="{ 'cpm-num--neg': summary.margin < 0 }">{{ marginText }}</span>
            </ContentList>
          </div>
          <MpText color="text.secondary">{{ t('You can reopen it later from Project health.') }}</MpText>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="confirm">{{ t('Close project') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.cpm-body { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cpm-figures { border-top: 1px solid var(--mp-border-default); border-bottom: 1px solid var(--mp-border-default); }
.cpm-num { font-variant-numeric: tabular-nums; }
.cpm-num--strong { font-weight: var(--mp-font-weights-semi-bold); }
.cpm-num--neg { color: var(--mp-text-danger); }
</style>
