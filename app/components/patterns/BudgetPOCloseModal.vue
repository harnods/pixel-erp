<script setup lang="ts">
/**
 * Close a purchase order line, or the whole PO (all lines or none). Asks for the
 * reason, shows what frees to the budget line, and refuses inline when the
 * acting person cannot close or a line cannot release.
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpRadio,
} from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import {
  poById, poOpen, poOpenTotal, lineById, lineTitle, closePOLineAs, closePOAs, PO_CLOSE_REASONS,
} from '~/data/budgetStore'

const props = defineProps<{ target: { mode: 'line' | 'po'; poId: string; lineIndex: number } | null }>()
const emit = defineEmits<{
  (e: 'update:target', v: null): void
  (e: 'closed', p: { freed: number; label: string }): void
}>()
const { t } = useLocale()

const reason = ref<string>('Short delivery')
const error = ref('')
watch(() => props.target, (v) => { if (v) { reason.value = v.mode === 'po' ? 'Cancelled' : 'Short delivery'; error.value = '' } }, { immediate: true })

const po = computed(() => (props.target ? poById(props.target.poId) : undefined))
const title = computed(() => {
  if (!props.target || !po.value) return ''
  return props.target.mode === 'po' ? `${t('Close')} ${po.value.number}?` : `${t('Close line')} ${props.target.lineIndex + 1} ${t('of')} ${po.value.number}?`
})
const lines = computed(() => {
  if (!props.target || !po.value) return []
  const p = po.value
  const idx = props.target.mode === 'po' ? p.lines.map((_l, i) => i).filter((i) => !p.lines[i]!.closed) : [props.target.lineIndex]
  return idx.map((i) => {
    const l = p.lines[i]!
    const bl = lineById(l.lineId)
    return { i, description: l.description, budgetLine: bl ? lineTitle(bl) : t('No budget line'), open: poOpen(p, i) }
  })
})
const freeing = computed(() => {
  if (!props.target || !po.value) return 0
  return props.target.mode === 'po' ? poOpenTotal(po.value) : poOpen(po.value, props.target.lineIndex)
})

function close() { emit('update:target', null) }
function confirm() {
  if (!props.target || !po.value) return
  const p = po.value
  const res = props.target.mode === 'po' ? closePOAs(p.id, reason.value) : closePOLineAs(p.id, props.target.lineIndex, reason.value)
  if (!res.ok) { error.value = res.reason ?? t('This purchase order could not be closed.'); return }
  emit('closed', { freed: res.freed, label: props.target.mode === 'po' ? p.number : `${p.number} ${t('line')} ${props.target.lineIndex + 1}` })
  close()
}
</script>

<template>
  <MpModal
    id="budget-po-close-modal"
    :is-open="!!target"
    size="md"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ title }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="bpc-body">
          <div class="bpc-lines">
            <div v-for="l in lines" :key="l.i" class="bpc-line">
              <div class="bpc-line__text">
                <span class="bpc-line__name">{{ l.i + 1 }}. {{ l.description }}</span>
                <span class="bpc-line__sub">{{ l.budgetLine }}</span>
              </div>
              <span class="bpc-line__amt">{{ formatIDRWhole(l.open) }}</span>
            </div>
          </div>

          <div class="bpc-field">
            <p class="bpc-label">{{ t('Reason') }}</p>
            <div class="bpc-radios">
              <label v-for="r in PO_CLOSE_REASONS" :key="r" class="bpc-radio">
                <MpRadio :id="`bpc-reason-${r.replace(/\s+/g, '-').toLowerCase()}`" name="bpc-reason" :value="r" :is-checked="reason === r" @change="reason = r" />
                <span>{{ t(r) }}</span>
              </label>
            </div>
          </div>

          <p class="bpc-total">{{ t('Frees to the budget line') }} <strong>{{ formatIDRWhole(freeing) }}</strong></p>
          <p v-if="target?.mode === 'po'" class="bpc-note">{{ t('Every open line closes, or none does.') }}</p>
          <p v-if="error" id="bpc-error" class="bpc-error">{{ error }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton id="bpc-confirm" variant="primary" is-rounded @click="confirm">{{ target?.mode === 'po' ? t('Close PO') : t('Close line') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.bpc-body { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.bpc-lines { display: flex; flex-direction: column; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.bpc-line { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.bpc-line + .bpc-line { border-top: 1px solid var(--mp-border-default); }
.bpc-line__text { display: flex; flex-direction: column; min-width: 0; }
.bpc-line__name { color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); }
.bpc-line__sub { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.bpc-line__amt { white-space: nowrap; font-size: var(--mp-font-sizes-md); }
.bpc-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bpc-label { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bpc-radios { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bpc-radio { display: flex; align-items: center; gap: var(--mp-spacing-3); cursor: pointer; font-size: var(--mp-font-sizes-md); }
.bpc-total { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bpc-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bpc-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
</style>
