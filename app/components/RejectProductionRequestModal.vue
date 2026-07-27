<script setup lang="ts">
/**
 * RejectProductionRequestModal — "Reject production request?" confirmation. Only
 * ever launched from a production REQUEST (child) row — never the product (parent)
 * row, which has no single request to reject. Partial rejection is allowed: the
 * qty field defaults to the request's full remaining qty but can be lowered.
 *
 * Dumb/reusable: collects + validates rejected qty and reason, then emits
 * `confirm` — the page owns the actual data mutation (rejectProductionRequest)
 * and the success toast. Self-contained Teleport overlay (this Pixel build ships
 * no MpModal structural CSS — see the pixel-overlay memory).
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { MpButton } from '@mekari/pixel3'

export interface RejectContext {
  productName: string
  sku: string
  requestNo: string
  sourceNo: string
  /** remaining qty available to reject (requested − produced) */
  maxQty: number
  unit: string
}

const props = defineProps<{ open: boolean; context: RejectContext | null }>()
const emit = defineEmits<{ close: []; confirm: [{ rejectedQty: number; reason: string }] }>()

const rejectedQty = ref<number | null>(null)
const reason = ref('')
const qtyError = ref('')
const reasonError = ref('')

watch(() => props.open, (isOpen) => {
  if (!isOpen || !props.context) return
  rejectedQty.value = props.context.maxQty
  reason.value = ''
  qtyError.value = ''
  reasonError.value = ''
})

function validate(): boolean {
  const ctx = props.context
  if (!ctx) return false
  qtyError.value = ''
  reasonError.value = ''
  let ok = true

  const qty = rejectedQty.value
  if (qty === null || !Number.isFinite(qty) || qty < 1 || qty > ctx.maxQty) {
    qtyError.value = `Rejected qty must be between 1 and ${ctx.maxQty}`
    ok = false
  }
  if (!reason.value.trim()) {
    reasonError.value = 'You must fill in rejection reason'
    ok = false
  }
  return ok
}

function handleReject() {
  if (!validate()) return
  emit('confirm', { rejectedQty: rejectedQty.value!, reason: reason.value.trim() })
}
function close() { emit('close') }

function onEsc(e: KeyboardEvent) { if (e.key === 'Escape' && props.open) close() }
onMounted(() => window.addEventListener('keydown', onEsc))
onUnmounted(() => window.removeEventListener('keydown', onEsc))
</script>

<template>
  <Teleport to="body">
    <Transition name="rpm-fade">
      <div v-if="open && context" class="rpm-scrim" @click="close">
        <div class="rpm-modal" role="dialog" aria-label="Reject production request?" @click.stop>
          <header class="rpm-header">
            <h2 class="rpm-header-title">Reject production request?</h2>
            <button class="rpm-close" type="button" aria-label="Close" @click="close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </header>

          <div class="rpm-body">
            <h3 class="rpm-product">{{ context.productName }}</h3>
            <p class="rpm-sku">SKU: {{ context.sku }}</p>

            <div class="rpm-info-row">
              <div class="rpm-info-item">
                <span class="rpm-info-label">Production request no.</span>
                <span class="rpm-info-value">{{ context.requestNo }}</span>
              </div>
              <div class="rpm-info-item">
                <span class="rpm-info-label">Sales order no.</span>
                <span class="rpm-info-value">{{ context.sourceNo }}</span>
              </div>
            </div>

            <div class="rpm-field">
              <label class="rpm-label" for="rpm-qty">Rejected qty<span class="rpm-req">*</span></label>
              <div class="rpm-qty-box" :class="{ 'rpm-qty-box--error': qtyError }">
                <input
                  id="rpm-qty" v-model.number="rejectedQty" type="number" min="1" :max="context.maxQty"
                  class="rpm-qty-input" @input="qtyError = ''"
                />
                <span class="rpm-qty-suffix">/ {{ context.maxQty }} {{ context.unit }}</span>
              </div>
              <p v-if="qtyError" class="rpm-error">{{ qtyError }}</p>
            </div>

            <div class="rpm-field">
              <div class="rpm-label-row">
                <label class="rpm-label" for="rpm-reason">Rejection reason<span class="rpm-req">*</span></label>
                <span class="rpm-counter">{{ reason.length }} / 256</span>
              </div>
              <textarea
                id="rpm-reason" v-model="reason" maxlength="256" rows="3"
                class="rpm-textarea" :class="{ 'rpm-textarea--error': reasonError }"
                @input="reasonError = ''"
              />
              <p v-if="reasonError" class="rpm-error">{{ reasonError }}</p>
            </div>
          </div>

          <footer class="rpm-footer">
            <MpButton variant="ghost" is-rounded @click="close">Cancel</MpButton>
            <button class="btn-enterprise btn-enterprise--danger" type="button" @click="handleReject">Reject</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.rpm-scrim {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(20, 23, 28, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: var(--mp-spacing-6);
}
.rpm-modal {
  width: min(448px, 100%);
  display: flex; flex-direction: column;
  background: var(--mp-background-neutral, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  box-shadow: 0 20px 48px -12px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

.rpm-header {
  display: flex; align-items: center; justify-content: space-between;
  height: 56px; flex-shrink: 0;
  padding: 0 var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral-subtle);
}
.rpm-header-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
.rpm-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.rpm-close:hover { background: var(--mp-background-neutral-hovered); }

.rpm-body { padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.rpm-product { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.rpm-sku { margin: calc(var(--mp-spacing-5) * -1 + var(--mp-spacing-0\.5)) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.rpm-info-row { display: flex; gap: var(--mp-spacing-8); }
.rpm-info-item { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.rpm-info-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rpm-info-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.rpm-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1\.5); }
.rpm-label-row { display: flex; align-items: baseline; justify-content: space-between; }
.rpm-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rpm-req { color: var(--mp-colors-red-600, #dc2626); margin-left: 2px; }
.rpm-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.rpm-qty-box {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
}
.rpm-qty-box:focus-within { border-color: var(--mp-border-selected, #029861); }
.rpm-qty-box--error { border-color: var(--mp-colors-red-600, #dc2626); }
.rpm-qty-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.rpm-qty-suffix { flex-shrink: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }

.rpm-textarea {
  width: 100%; box-sizing: border-box; resize: vertical; min-height: 76px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); font-family: inherit; line-height: var(--mp-line-heights-md);
}
.rpm-textarea:focus { outline: none; border-color: var(--mp-border-selected, #029861); }
.rpm-textarea--error { border-color: var(--mp-colors-red-600, #dc2626); }

.rpm-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-red-600, #dc2626); }

.rpm-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  flex-shrink: 0; padding: var(--mp-spacing-4) var(--mp-spacing-6);
  border-top: 1px solid var(--mp-border-default);
}

.rpm-fade-enter-active, .rpm-fade-leave-active { transition: opacity 200ms ease; }
.rpm-fade-enter-from, .rpm-fade-leave-to { opacity: 0; }
</style>
