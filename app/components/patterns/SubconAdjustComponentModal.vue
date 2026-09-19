<script setup lang="ts">
/**
 * Revise one component's planned quantity on a subcon work order.
 *
 * The whole point of this dialog is the boundary at `alreadySentQty`, which
 * decides whether the change is free, needs a shipment, or is refused outright —
 * see `evaluateComponentAdjustment`. The outcome is shown BEFORE saving, as the
 * user types, so the consequence is never a surprise after the fact.
 *
 * Save stays enabled even when the quantity is refused: the message explains what
 * to do instead (rule/btn-no-disabled-validation, rule/form-errors-inline). Not
 * MpModal — it has no working CSS in this Pixel build; same Teleport shell as
 * CompleteWorkOrderModal.vue.
 */
import { MpButton, MpButtonGroup, MpIcon, MpInput, MpFormControl, MpFormLabel } from '@mekari/pixel3'
import { evaluateComponentAdjustment } from '~/data/subconAccounting'
import type { SubconMethod } from '~/data/subcon'

const props = defineProps<{
  isOpen: boolean
  method: SubconMethod
  componentName: string
  sku: string
  unit: string
  plannedQty: number
  alreadySentQty: number
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'save', qty: number): void
}>()

const { t } = useLocale()

const draft = ref(String(props.plannedQty))
const attempted = ref(false)

watch(() => props.isOpen, (open) => {
  if (open) { draft.value = String(props.plannedQty); attempted.value = false }
})

const newQty = computed(() => {
  const n = Number(draft.value)
  return Number.isFinite(n) ? n : props.plannedQty
})

const outcome = computed(() => evaluateComponentAdjustment({
  method: props.method,
  plannedQty: props.plannedQty,
  newPlannedQty: newQty.value,
  alreadySentQty: props.alreadySentQty,
  componentName: props.componentName,
  unit: props.unit,
}))

const changed = computed(() => newQty.value !== props.plannedQty)

/** What this change will do, said plainly, before it is made. */
const consequence = computed(() => {
  if (!changed.value) return ''
  switch (outcome.value.kind) {
    case 'requiresShipment':
      return `${t('Adds')} ${outcome.value.extraQty} ${props.unit} ${t('to the plan. All of the current quantity is already with the vendor, so this needs a new transfer or purchase to actually reach them — raise it from the Transactions tab.')}`
    case 'planOnly':
      return t('Changes only the quantity still to send. Nothing is posted — the material already with the vendor stays where it is.')
    case 'rejected':
      return outcome.value.message
    case 'notApplicable':
      return t('The vendor supplies the materials on a Basic order, so there is nothing to adjust.')
  }
})

function close() { emit('update:isOpen', false) }

function save() {
  attempted.value = true
  if (outcome.value.kind === 'rejected' || outcome.value.kind === 'notApplicable') return
  emit('save', newQty.value)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sac">
      <!-- Closes only via ×; the overlay ignores clicks and there is no Esc
           listener (rule/modal-drawer-close-explicit-only). -->
      <div v-if="isOpen" class="sac-overlay">
        <div class="sac-panel" role="dialog" :aria-label="t('Adjust component quantity')">
          <header class="sac-header">
            <h2 class="sac-title">{{ t('Adjust component quantity') }}</h2>
            <button class="sac-close btn-enterprise" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="sac-body">
            <p class="sac-product">
              {{ componentName }}
              <span class="sac-sku">{{ sku }}</span>
            </p>

            <dl class="sac-facts">
              <div class="sac-fact">
                <dt>{{ t('Planned') }}</dt>
                <dd>{{ plannedQty.toLocaleString('id-ID') }} {{ unit }}</dd>
              </div>
              <div class="sac-fact">
                <dt>{{ t('Already sent to vendor') }}</dt>
                <dd>{{ alreadySentQty.toLocaleString('id-ID') }} {{ unit }}</dd>
              </div>
            </dl>

            <MpFormControl id="sac-qty" class="sac-field" :is-invalid="attempted && outcome.kind === 'rejected'">
              <MpFormLabel>{{ t('New planned quantity') }}</MpFormLabel>
              <MpInput id="sac-qty-inp" v-model="draft" type="number" min="0" is-full-width />
            </MpFormControl>

            <p
              v-if="consequence"
              class="sac-consequence"
              :class="{ 'sac-consequence--blocked': outcome.kind === 'rejected' || outcome.kind === 'notApplicable' }"
            >{{ consequence }}</p>
          </div>

          <footer class="sac-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
            </MpButtonGroup>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sac-enter-active, .sac-leave-active { transition: opacity 200ms ease; }
.sac-enter-from, .sac-leave-to { opacity: 0; }
.sac-enter-active .sac-panel, .sac-leave-active .sac-panel { transition: transform 200ms ease, opacity 200ms ease; }
.sac-enter-from .sac-panel, .sac-leave-to .sac-panel { transform: scale(0.97); opacity: 0; }

.sac-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(20, 23, 28, 0.45));
  display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-spacing-20, 80px) var(--mp-spacing-4) var(--mp-spacing-4);
  overflow-y: auto;
}
.sac-panel {
  width: min(480px, 100%);
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-lg, 12px);
  display: flex; flex-direction: column;
}
.sac-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.sac-title {
  margin: 0; font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.sac-close {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.sac-close:hover { background: var(--mp-background-neutral-hovered); }

.sac-body { padding: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.sac-product {
  margin: 0; font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.sac-sku { display: block; font-weight: var(--mp-font-weights-regular); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.sac-facts { display: flex; gap: var(--mp-spacing-6); margin: 0; }
.sac-fact dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sac-fact dd { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

.sac-consequence {
  margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.sac-consequence--blocked { color: var(--mp-text-danger); }

.sac-footer {
  display: flex; justify-content: flex-end;
  padding: var(--mp-spacing-4) var(--mp-spacing-5);
  border-top: 1px solid var(--mp-border-default);
}
</style>
