<!-- prod-parity: jurnal-accounting-frontend/src/modules/assets/components/DisposeAssetModal.vue -->
<script setup lang="ts">
import {
  MpButton, MpIcon, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea, MpDatePicker,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDR } from '~/utils/currency'
import {
  caAccumulatedAsOf, currentDepositAccountOptions, currentGainLossAccountOptions, CURRENT_ASSET_TODAY,
  type CurrentAsset, type CurrentAssetDisposal,
} from '~/data/currentAssets'

const props = defineProps<{ isOpen: boolean; asset: CurrentAsset }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'dispose', v: Omit<CurrentAssetDisposal, 'entryNo'>): void
}>()
const { t } = useLocale()

const disposalDate = ref(isoToDisplay(CURRENT_ASSET_TODAY))
const salePrice = ref('')
const depositAccount = ref('')
const gainLossAccount = ref('')
const memo = ref('')
const errors = reactive<Record<string, string>>({})

watch(() => props.isOpen, (open) => {
  if (!open) return
  disposalDate.value = isoToDisplay(CURRENT_ASSET_TODAY)
  salePrice.value = ''
  depositAccount.value = ''
  gainLossAccount.value = ''
  memo.value = ''
  Object.keys(errors).forEach((k) => delete errors[k])
})

function isoToDisplay(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function displayToIso(s: string) { const [d, m, y] = s.split('/'); return y && m && d ? `${y}-${m}-${d}` : '' }

const priceNum = computed(() => Math.max(0, Number(salePrice.value.replace(/[^\d]/g, '')) || 0))
const isoDate = computed(() => displayToIso(disposalDate.value))
const bookValueAtDate = computed(() => props.asset.acquisitionCost - (isoDate.value ? caAccumulatedAsOf(props.asset, isoDate.value) : 0))
const gainLoss = computed(() => priceNum.value - bookValueAtDate.value)
const lossOrGain = computed<'gain' | 'loss'>(() => (gainLoss.value >= 0 ? 'gain' : 'loss'))
const showDeposit = computed(() => priceNum.value > 0)
const gainLossOptions = computed(() => currentGainLossAccountOptions(lossOrGain.value))

watch(gainLossOptions, (opts) => { if (!opts.some((o) => o.value === gainLossAccount.value)) gainLossAccount.value = '' })
watch(showDeposit, (v) => { if (!v) depositAccount.value = '' })

function close() { emit('update:isOpen', false) }
function submit() {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!isoDate.value) errors.date = t('You must select disposal date')
  else if (isoDate.value < props.asset.acquisitionDate) errors.date = t('Disposal date must be on or after the acquisition date')
  if (showDeposit.value && !depositAccount.value) errors.deposit = t('You must select deposit to account')
  if (!gainLossAccount.value) errors.gainLoss = t('You must select gain / loss account')
  if (Object.keys(errors).length) return
  emit('dispose', {
    date: isoDate.value, salePrice: priceNum.value, depositAccount: depositAccount.value || null,
    gainLossAccount: gainLossAccount.value, memo: memo.value.trim(),
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cadm">
      <div v-if="isOpen" class="cadm-overlay">
        <div class="cadm-panel" role="dialog" aria-modal="true" :aria-label="t('Dispose asset')">
          <header class="cadm-header">
            <span class="cadm-title">{{ t('Dispose asset') }}</span>
            <MpButton class="cadm-close" is-rounded variant="ghost" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>
          <div class="cadm-body">
            <MpFormControl id="cadm-date" is-required :is-invalid="!!errors.date">
              <MpFormLabel>{{ t('Disposal date') }}</MpFormLabel>
              <MpDatePicker id="cadm-date-dp" v-model="disposalDate" format="DD/MM/YYYY" value-type="format" use-portal :is-clearable="false" @update:model-value="errors.date = ''" />
              <MpFormErrorMessage>{{ errors.date }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="cadm-price">
              <MpFormLabel>{{ t('Sale price') }}</MpFormLabel>
              <div class="cadm-amount">
                <span class="cadm-amount-prefix">Rp</span>
                <MpInput id="cadm-price-input" v-model="salePrice" inputmode="numeric" is-full-width />
              </div>
            </MpFormControl>

            <MpFormControl v-if="showDeposit" id="cadm-deposit" is-required :is-invalid="!!errors.deposit">
              <MpFormLabel>{{ t('Deposit to account') }}</MpFormLabel>
              <ErpFilterSelect
                id="cadm-deposit-select" :model-value="depositAccount" :placeholder="t('Select account')"
                :options="currentDepositAccountOptions" width="100%" empty-text="No matching account found"
                @update:model-value="(v: string) => { depositAccount = v; errors.deposit = '' }"
              />
              <MpFormErrorMessage>{{ errors.deposit }}</MpFormErrorMessage>
            </MpFormControl>

            <div class="cadm-summary">
              <div class="cadm-summary-row">
                <span class="cadm-summary-label">{{ t('Book value') }}</span>
                <span>{{ formatIDR(bookValueAtDate) }}</span>
              </div>
              <div class="cadm-summary-row">
                <span class="cadm-summary-label">{{ t('Gain / Loss') }} ({{ t(lossOrGain) }})</span>
                <span :class="lossOrGain === 'gain' ? 'cadm-gain' : 'cadm-loss'">{{ formatIDR(Math.abs(gainLoss)) }}</span>
              </div>
            </div>

            <MpFormControl id="cadm-gl" is-required :is-invalid="!!errors.gainLoss">
              <MpFormLabel>{{ t('Gain / Loss account') }}</MpFormLabel>
              <ErpFilterSelect
                id="cadm-gl-select" :model-value="gainLossAccount" :placeholder="t('Select account')"
                :options="gainLossOptions" width="100%" empty-text="No matching account found"
                @update:model-value="(v: string) => { gainLossAccount = v; errors.gainLoss = '' }"
              />
              <MpFormErrorMessage>{{ errors.gainLoss }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="cadm-memo">
              <MpFormLabel>{{ t('Disposal memo') }}</MpFormLabel>
              <MpTextarea id="cadm-memo-input" v-model="memo" is-full-width />
            </MpFormControl>
          </div>
          <footer class="cadm-footer">
            <button class="btn-enterprise btn-enterprise--ghost" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="submit">{{ t('Dispose') }}</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cadm-overlay {
  position: fixed; inset: 0; z-index: 1400; display: flex; align-items: center; justify-content: center;
  background: var(--mp-colors-background-overlay);
}
.cadm-panel {
  width: var(--mp-sizes-120, 480px); max-width: calc(100vw - var(--mp-spacing-8)); max-height: calc(100vh - var(--mp-spacing-16, 64px));
  display: flex; flex-direction: column; background: var(--mp-background-stage);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 8px);
}
.cadm-header {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); border-bottom: 1px solid var(--mp-border-default);
}
.cadm-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cadm-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.cadm-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); border-top: 1px solid var(--mp-border-default);
}
.cadm-amount { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cadm-amount-prefix { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cadm-summary {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1\.5); padding: var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
}
.cadm-summary-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-3); }
.cadm-summary-label { color: var(--mp-text-secondary); }
.cadm-gain { color: var(--mp-colors-text-success); }
.cadm-loss { color: var(--mp-text-danger); }
.cadm-enter-active, .cadm-leave-active { transition: opacity 0.15s ease; }
.cadm-enter-from, .cadm-leave-to { opacity: 0; }
</style>
