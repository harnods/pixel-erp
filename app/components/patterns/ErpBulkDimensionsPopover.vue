<!--
  ErpBulkDimensionsPopover — the "Bulk" link on a line-items table's
  Dimensions column header (Sales/Purchases/Expenses create pages). Figma
  fileKey nZdSEnyXOmQVbSWYhcwyGT, node 6394:83476 ("Popover / Bulk"): one
  combobox per dimension that applies to this transaction type, a mandatory
  dimension marked required same as the per-line cell (ErpLineDimensionsCell).

  Self-contained: renders its OWN "Bulk" trigger link + popover, no
  slot-forwarded trigger — MpPopoverTrigger clones its direct slot child to
  inject the floating-ui anchor ref, and a <slot> in between resolves to a
  Fragment (not the link), so the anchor ref lands on nothing and positioning
  breaks (see feedback_erp_approval_comment_icon_pattern). MpPopover itself
  renders no wrapper element (just a Fragment), so the trigger `<a>` still
  lands exactly where this component sits in the header `<th>` — its
  `float: right` still pushes it to the cell's right edge same as before.

  Picking values here and hitting Save does not touch a "current" state — it
  emits an `apply` patch of only the dimensions the user actually picked, for
  the host page to merge onto every line item's `dimensions` record
  (dims left blank are a no-op, not a clear-all). Cancel/×/blur/escape
  discards the draft.
-->
<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpFormControl, MpFormLabel, MpFormErrorMessage, MpAutocomplete, css } from '@mekari/pixel3'
import { applicableDimensions as getApplicableDimensions, type Dimension, type DimensionTransactionType } from '~/data/dimensions'

const props = defineProps<{
  id: string
  transactionType: DimensionTransactionType
}>()
const emit = defineEmits<{ (e: 'apply', values: Record<string, string>): void }>()

const { t } = useLocale()

const dims = computed<Dimension[]>(() => getApplicableDimensions(props.transactionType))

const isOpen = ref(false)
const draft = reactive<Record<string, string>>({})
const invalid = reactive<Record<string, boolean>>({})

// Each MpAutocomplete field opens its OWN nested popover, portaled (use-portal)
// to a separate DOM subtree from ours — so clicking one of its options counts
// as an "outside click" for OUR popover's blur/click-outside detection
// (MpPopoverContent's @blur), which would otherwise close the whole thing the
// moment a value is picked. A field's @focus/@blur exactly track its own
// popover opening/closing, so suppress our close while any field is open, and
// only lift the suppression on the next frame (after the same click's outside
// -click check has already run) rather than immediately on blur.
const suppressClose = ref(false)
function onFieldFocus() { suppressClose.value = true }
function onFieldBlur() { requestAnimationFrame(() => { suppressClose.value = false }) }

function dimData(dim: Dimension) {
  return dim.values.map((v) => ({ name: v.name }))
}

function openPopover() {
  for (const k of Object.keys(draft)) delete draft[k]
  for (const k of Object.keys(invalid)) delete invalid[k]
  isOpen.value = true
}
function closePopover() {
  isOpen.value = false
}
function onOutsideClick() {
  if (suppressClose.value) return
  closePopover()
}

function save() {
  let hasError = false
  for (const dim of dims.value) {
    if (dim.mandatory && !draft[dim.id]) {
      invalid[dim.id] = true
      hasError = true
    }
  }
  if (hasError) return

  const patch: Record<string, string> = {}
  for (const dim of dims.value) {
    if (draft[dim.id]) patch[dim.id] = draft[dim.id]
  }
  emit('apply', patch)
  closePopover()
}
</script>

<template>
  <MpPopover :id="id" is-manual :is-open="isOpen" use-portal :is-keep-alive="false" placement="bottom-end" @open="isOpen = true" @close="closePopover">
    <MpPopoverTrigger>
      <a class="ebdp-trigger" @click.stop="isOpen ? closePopover() : openPopover()">{{ t('Bulk') }}</a>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ width: '330px', padding: '0' })" @blur="onOutsideClick" @escape="closePopover">
      <div class="ebdp-header">{{ t('Bulk select dimensions') }}</div>
      <div class="ebdp-body">
        <MpFormControl
          v-for="dim in dims" :key="dim.id" :id="`${id}-${dim.id}`" class="ebdp-field"
          :is-required="dim.mandatory" :is-invalid="invalid[dim.id]"
        >
          <MpFormLabel>{{ dim.name }}</MpFormLabel>
          <MpAutocomplete
            :id="`${id}-${dim.id}-inp`" v-model="draft[dim.id]" :data="dimData(dim)"
            label-prop="name" value-prop="name" use-portal is-clearable is-full-width
            :is-invalid="invalid[dim.id]"
            :placeholder="`${t('Select')} ${dim.name.toLowerCase()}`"
            @focus="onFieldFocus" @blur="onFieldBlur"
            @update:model-value="invalid[dim.id] = false"
          />
          <MpFormErrorMessage>{{ t('You must select') }} {{ dim.name.toLowerCase() }}</MpFormErrorMessage>
        </MpFormControl>
      </div>
      <div class="ebdp-footer">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="closePopover">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ t('Save') }}</button>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.ebdp-trigger { float: right; font-weight: var(--mp-font-weights-regular); text-transform: none; color: var(--mp-text-link); cursor: pointer; }

.ebdp-header {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.ebdp-body {
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
  max-height: 320px; overflow-y: auto;
}
.ebdp-field { text-align: left; }
.ebdp-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
</style>
