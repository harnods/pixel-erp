<script setup lang="ts">
/**
 * Add a subcon charge agreed after the work order was created — a finishing step
 * the vendor added, a second freight leg.
 *
 * It behaves exactly like a cost line from the BOM from the invoice onward: its
 * own clearing account, capitalised into WIP at each delivery. It raises cost per
 * unit without changing any quantity, which is why the dialog shows the new
 * per-unit figure as the amount is typed — that is the number people actually
 * care about.
 *
 * Not MpModal (no working CSS in this Pixel build); same Teleport shell as the
 * other subcon dialogs.
 */
import {
  MpButton, MpButtonGroup, MpIcon, MpInput, MpFormControl, MpFormLabel, MpFormErrorMessage,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { SUBCON_COST_DRIVERS } from '~/data/subcon'
import type { SubconCostDriver } from '~/data/subconAccounting'

const props = defineProps<{
  isOpen: boolean
  /** Current total cost, to show what this line does to cost per unit. */
  currentTotal: number
  plannedQty: number
  vendorName: string
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'save', line: { name: string; costDriver: SubconCostDriver; amount: number }): void
}>()

const { t } = useLocale()

const name = ref('')
const driver = ref<SubconCostDriver>('Amount')
const amount = ref('')
const attempted = ref(false)

watch(() => props.isOpen, (open) => {
  if (open) { name.value = ''; driver.value = 'Amount'; amount.value = ''; attempted.value = false }
})

const amountValue = computed(() => {
  const n = Number(amount.value)
  return Number.isFinite(n) && n > 0 ? n : 0
})

const nameError = computed(() => attempted.value && !name.value.trim())
const amountError = computed(() => attempted.value && amountValue.value <= 0)

const newPerUnit = computed(() =>
  props.plannedQty > 0 ? (props.currentTotal + amountValue.value) / props.plannedQty : 0)
const currentPerUnit = computed(() =>
  props.plannedQty > 0 ? props.currentTotal / props.plannedQty : 0)

function close() { emit('update:isOpen', false) }

function save() {
  attempted.value = true
  if (!name.value.trim() || amountValue.value <= 0) return
  emit('save', { name: name.value.trim(), costDriver: driver.value, amount: amountValue.value })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sacl">
      <div v-if="isOpen" class="sacl-overlay">
        <div class="sacl-panel" role="dialog" :aria-label="t('Add subcon cost')">
          <header class="sacl-header">
            <h2 class="sacl-title">{{ t('Add subcon cost') }}</h2>
            <button class="sacl-close btn-enterprise" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="sacl-body">
            <p class="sacl-desc">
              {{ t('A charge agreed with') }} {{ vendorName }} {{ t('after this work order was created. It is invoiced and capitalised like every other subcon cost.') }}
            </p>

            <MpFormControl id="sacl-name" class="sacl-field" is-required :is-invalid="nameError">
              <MpFormLabel>{{ t('Cost component') }}</MpFormLabel>
              <MpInput id="sacl-name-inp" v-model="name" is-full-width :placeholder="t('Finishing & packing')" />
              <MpFormErrorMessage>{{ t('You must name the cost component') }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="sacl-driver" class="sacl-field">
              <MpFormLabel>{{ t('Cost driver') }}</MpFormLabel>
              <!-- A short fixed set, so a segmented pill rather than a dropdown. -->
              <div class="sacl-drivers" role="radiogroup" :aria-label="t('Cost driver')">
                <button
                  v-for="d in SUBCON_COST_DRIVERS" :key="d"
                  type="button" role="radio" :aria-checked="driver === d"
                  class="sacl-driver btn-enterprise"
                  :class="{ 'sacl-driver--on': driver === d }"
                  @click="driver = d"
                >{{ t(d) }}</button>
              </div>
            </MpFormControl>

            <MpFormControl id="sacl-amount" class="sacl-field" is-required :is-invalid="amountError">
              <MpFormLabel>{{ t('Amount') }}</MpFormLabel>
              <MpInput id="sacl-amount-inp" v-model="amount" type="number" min="0" is-full-width placeholder="0" />
              <MpFormErrorMessage>{{ t('You must enter an amount') }}</MpFormErrorMessage>
            </MpFormControl>

            <p v-if="amountValue > 0" class="sacl-impact">
              {{ t('Cost per unit') }}
              <strong>{{ formatIDR(Math.round(currentPerUnit)) }}</strong>
              →
              <strong>{{ formatIDR(Math.round(newPerUnit)) }}</strong>
            </p>
          </div>

          <footer class="sacl-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="save">{{ t('Add cost') }}</MpButton>
            </MpButtonGroup>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sacl-enter-active, .sacl-leave-active { transition: opacity 200ms ease; }
.sacl-enter-from, .sacl-leave-to { opacity: 0; }
.sacl-enter-active .sacl-panel, .sacl-leave-active .sacl-panel { transition: transform 200ms ease, opacity 200ms ease; }
.sacl-enter-from .sacl-panel, .sacl-leave-to .sacl-panel { transform: scale(0.97); opacity: 0; }

.sacl-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(20, 23, 28, 0.45));
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-spacing-20, 80px) var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.sacl-panel {
  width: min(480px, 100%);
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
  display: flex; flex-direction: column;
}
.sacl-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.sacl-title {
  margin: 0; font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.sacl-close {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.sacl-close:hover { background: var(--mp-background-neutral-hovered); }

.sacl-body { padding: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.sacl-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.sacl-drivers { display: flex; gap: var(--mp-spacing-2); }
.sacl-driver {
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-default, #fff);
  color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md);
  cursor: pointer;
}
.sacl-driver--on {
  border-color: var(--mp-border-selected, #029861);
  background: var(--mp-background-information, #eef0fc);
  font-weight: var(--mp-font-weights-semi-bold);
}

.sacl-impact { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.sacl-footer {
  display: flex; justify-content: flex-end;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
</style>
