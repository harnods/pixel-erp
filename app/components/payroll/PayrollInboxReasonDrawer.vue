<script setup lang="ts">
/**
 * A short decision with a reason: close a month gap, mark staff "Not expected".
 * rule/drawer-custom-shell (the Teleport shell CustodyDrawer uses). The parent
 * runs the store call and passes back its refusal, shown inline (rule/form-errors-inline).
 */
import { ref, watch } from 'vue'
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'

const props = withDefaults(defineProps<{
  isOpen: boolean
  title: string
  subtitle?: string
  confirmLabel: string
  reasonLabel?: string
  pickLabel?: string
  pickOptions?: { value: string; label: string }[]
  error?: string
}>(), { subtitle: '', reasonLabel: 'Reason', pickLabel: '', pickOptions: () => [], error: '' })
const emit = defineEmits<{ (e: 'close'): void; (e: 'submit', v: { reason: string; pick: string }): void }>()
const { t } = useLocale()

const reason = ref('')
const pick = ref('')
watch(() => props.isOpen, (o) => { if (o) { reason.value = ''; pick.value = props.pickOptions[0]?.value ?? '' } })
</script>

<template>
  <Teleport to="body">
    <Transition name="prd">
      <div v-if="isOpen" class="prd-overlay">
        <div class="prd-panel" role="dialog" :aria-label="title">
          <header class="prd-head">
            <div>
              <div class="prd-title">{{ title }}</div>
              <div v-if="subtitle" class="prd-sub">{{ subtitle }}</div>
            </div>
            <MpButton class="prd-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="sm" />
            </MpButton>
          </header>
          <div class="prd-body">
            <div v-if="pickOptions.length" class="prd-field">
              <label class="prd-label" for="prd-pick">{{ pickLabel }}</label>
              <ErpFilterSelect id="prd-pick" v-model="pick" :placeholder="pickLabel" :options="pickOptions" width="100%" :is-clearable="false" />
            </div>
            <div class="prd-field">
              <label class="prd-label" for="prd-reason">{{ t(reasonLabel) }}</label>
              <MpInput id="prd-reason" v-model="reason" :is-invalid="!!error" />
              <p v-if="error" class="prd-error">{{ t(error) }}</p>
            </div>
          </div>
          <footer class="prd-foot">
            <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
            <MpButton is-rounded @click="emit('submit', { reason, pick })">{{ confirmLabel }}</MpButton>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.prd-overlay { position: fixed; inset: 0; background: var(--mp-colors-background-overlay); z-index: 1300; }
.prd-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 480px; max-width: 96vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default); overflow: hidden;
}
.prd-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.prd-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prd-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.prd-close { flex: none; }
.prd-body { padding: var(--mp-spacing-6); overflow: auto; flex: 1; }
.prd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-5); }
.prd-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prd-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; }
.prd-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none; border-top: 1px solid var(--mp-border-default);
}
.prd-enter-active, .prd-leave-active { transition: opacity 0.16s ease; }
.prd-enter-from, .prd-leave-to { opacity: 0; }
</style>
