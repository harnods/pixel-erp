<script setup lang="ts">
/**
 * SubmitAddendumModal — a PM submits a contract addendum from the project detail
 * page. Short, blocking decision on top of the page it changes, so a modal rather
 * than a drawer. Footer actions are always rendered; the errors show inline
 * (rule/form-errors-inline, CLAUDE.md › Form & modal actions).
 */
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpButton, MpButtonGroup, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpInputGroup, MpInputLeftAddon, MpTextarea, MpRadio,
} from '@mekari/pixel3'

const props = defineProps<{ isOpen: boolean }>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm', payload: { value: number; reason: string; distinct: boolean }): void
}>()

const { t } = useLocale()

let _seq = 0
const uid = `${(_seq += 1)}-${Math.floor(performance.now())}`
const modalId = `submit-addendum-modal-${uid}`

const value = ref('')
const reason = ref('')
/** No preselection: whether the change is separate work is a judgment the submitter must make. */
const distinct = ref<boolean | null>(null)
const errors = reactive({ value: '', reason: '', distinct: '' })

watch(() => props.isOpen, (open) => {
  if (!open) return
  value.value = ''; reason.value = ''; distinct.value = null
  errors.value = ''; errors.reason = ''; errors.distinct = ''
})

function close() { emit('update:isOpen', false) }

function confirm() {
  const val = Number(value.value)
  errors.value = !val || val <= 0 ? t('You must fill in the revised contract value') : ''
  errors.reason = reason.value.trim().length < 5 ? t('Enter a reason of at least 5 characters') : ''
  errors.distinct = distinct.value === null ? t('Choose whether this is new, separately priced work') : ''
  if (errors.value || errors.reason || errors.distinct) return
  emit('confirm', { value: val, reason: reason.value, distinct: distinct.value === true })
  close()
}
</script>

<template>
  <MpModal :id="modalId" :is-open="isOpen" size="lg" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="close">
    <MpModalContent>
      <MpModalHeader>
        {{ t('Submit addendum') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="sam-body">
          <div class="sam-fields">
            <MpFormControl :id="`sam-value-${uid}`" is-required :is-invalid="!!errors.value">
              <MpFormLabel>{{ t('Revised contract value') }}</MpFormLabel>
              <MpInputGroup :id="`sam-value-group-${uid}`" is-full-width>
                <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                <MpInput :id="`sam-value-input-${uid}`" v-model="value" type="number" is-full-width
                  @update:model-value="errors.value = ''" />
              </MpInputGroup>
              <MpFormErrorMessage>{{ errors.value }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl :id="`sam-reason-${uid}`" is-required :is-invalid="!!errors.reason" class="sam-field--wide">
              <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
              <MpTextarea :id="`sam-reason-input-${uid}`" v-model="reason" :rows="3" is-full-width
                :is-invalid="!!errors.reason" @update:model-value="errors.reason = ''" />
              <MpFormErrorMessage>{{ errors.reason }}</MpFormErrorMessage>
            </MpFormControl>
          </div>

          <MpFormControl :id="`sam-distinct-${uid}`" is-required :is-invalid="!!errors.distinct">
            <MpFormLabel>{{ t('Is this new, separately priced work?') }}</MpFormLabel>
            <div class="sam-choices" role="radiogroup">
              <label class="sam-choice" :class="{ 'sam-choice--picked': distinct === false }">
                <MpRadio :id="`sam-distinct-no-${uid}`" :name="`sam-distinct-${uid}`" value="extends"
                  :is-checked="distinct === false" @change="distinct = false; errors.distinct = ''">
                  {{ t('Extends existing work') }}
                  <template #description>{{ t('For example, a larger foundation. Revenue to date is adjusted in the current period.') }}</template>
                </MpRadio>
              </label>
              <label class="sam-choice" :class="{ 'sam-choice--picked': distinct === true }">
                <MpRadio :id="`sam-distinct-yes-${uid}`" :name="`sam-distinct-${uid}`" value="separate"
                  :is-checked="distinct === true" @change="distinct = true; errors.distinct = ''">
                  {{ t('Separate new work') }}
                  <template #description>{{ t('For example, a separate structure. Recognized from this period on, with its own milestone.') }}</template>
                </MpRadio>
              </label>
            </div>
            <MpFormErrorMessage>{{ errors.distinct }}</MpFormErrorMessage>
          </MpFormControl>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton is-rounded variant="ghost" @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton is-rounded variant="primary" @click="confirm">{{ t('Submit') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.sam-body { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
/* Two even columns with the same gap as the options below, so the money field
   lines up with the first option card; the reason runs the full width. */
.sam-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); align-items: start; }
.sam-field--wide { grid-column: 1 / -1; }
.sam-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
/* The whole card is the hit target, so the radio and its copy read as one choice. */
.sam-choice {
  display: block; text-align: left; cursor: pointer;
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-neutral, #ffffff); padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.sam-choice:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.sam-choice--picked { border-color: var(--mp-colors-border-selected); background: var(--mp-colors-background-success); }
/* The option name is a choice heading, not body copy, so it keeps semibold. */
.sam-choice :deep(.mp-radio__label > p:first-child) { font-weight: var(--mp-font-weights-semi-bold); }
</style>
