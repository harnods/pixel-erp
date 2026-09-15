<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  MpInput, MpTextarea, MpCheckbox, MpRadio, MpToggle, MpAutocomplete,
  MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage, MpFlex, MpButton,
} from '@mekari/pixel3'
import PopoverSelect from '~/components/patterns/PopoverSelect.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Form control · Pixel 3 Enterprise' })

const NAME_MAX = 60
const DESC_MAX = 250
const name = ref('Arabica beans 1kg')
const category = ref('')
const unit = ref('')
const description = ref('')
const type = ref('goods')
const channels = ref<string[]>(['sales'])
const trackInventory = ref(true)
const taxable = ref(false)
const nameCount = computed(() => `${name.value.length}/${NAME_MAX}`)
const descCount = computed(() => `${description.value.length}/${DESC_MAX}`)
function onCategoryAdd(search?: string) { /* open create-category flow here */ void search }
</script>
<template>
  <div>
    <DemoHeader title="Form control" tag="MpFormControl"
      lead="Wraps a field with its label + error message. Errors render INLINE via MpFormErrorMessage — never a toast. No placeholders. Forms use a 6-column grid (max 558px): by default EVERY field stacks vertically full-width; selects are the exception — span 3 (half) on their own row. Fields are only placed side-by-side when explicitly asked. 20px between rows."
      :rules="['rule/form-errors-inline', 'rule/input-no-placeholder', 'rule/form-size-md-only']" />

    <DemoSection title="Field anatomy"
      desc="MpFormControl wraps the label + control (+ help text). No placeholder — the label carries the meaning. is-required shows the required mark."
      :rules="['rule/input-no-placeholder']"
      code="<MpFormControl id=&quot;x&quot; is-required>
  <MpFormLabel>Vendor name</MpFormLabel>
  <MpInput id=&quot;x-in&quot; v-model=&quot;v&quot; />
  <MpFormHelpText>As printed on the invoice.</MpFormHelpText>
</MpFormControl>">
      <div style="width:100%; max-width:24rem">
        <MpFormControl id="px-fc1" is-required>
          <MpFormLabel>Vendor name</MpFormLabel>
          <MpInput id="px-fc1-in" v-model="name" is-full-width />
          <MpFormHelpText>As printed on the invoice.</MpFormHelpText>
        </MpFormControl>
      </div>
    </DemoSection>

    <DemoSection title="Invalid (inline error)"
      desc="Set :is-invalid and provide MpFormErrorMessage — the error shows inline under the field (UXW copy)."
      :rules="['rule/form-errors-inline', 'rule/field-invalid-caption']"
      code="<MpFormControl id=&quot;x&quot; is-required :is-invalid=&quot;true&quot;>
  <MpFormLabel>Vendor name</MpFormLabel>
  <MpInput id=&quot;x-in&quot; />
  <MpFormErrorMessage>Vendor name is required</MpFormErrorMessage>
</MpFormControl>">
      <div style="width:100%; max-width:24rem">
        <MpFormControl id="px-fc2" is-required :is-invalid="true">
          <MpFormLabel>Vendor name</MpFormLabel>
          <MpInput id="px-fc2-in" v-model="name" is-full-width />
          <MpFormErrorMessage>Vendor name is required</MpFormErrorMessage>
        </MpFormControl>
      </div>
    </DemoSection>

    <DemoSection title="Form group — input · select · checkbox · radio · textarea · toggle"
      desc="The baku create-form group: 6-col grid, max 558px, everything stacked (20px rows). Name has a 60-char counter; description a 250-char counter (top-right). Selects span 3 (half) each on its OWN row — never paired side-by-side unless asked. Toggle sits right next to its label. Actions last, right-aligned: ghost Cancel + primary Save."
      :rules="['rule/form-field-stacking', 'rule/form-select-half', 'rule/select-quick-add', 'rule/input-char-counter', 'rule/form-toggle-inline', 'rule/form-actions-always-present', 'rule/btn-cancel-ghost']"
      code="<div class=&quot;form&quot;>                                <!-- 558px, stacked, 20px rows -->
  <MpFormControl id=&quot;name&quot; is-required>
    <div class=&quot;lbl-row&quot;><MpFormLabel>Product name</MpFormLabel><span class=&quot;counter&quot;>{{ name.length }}/60</span></div>
    <MpInput id=&quot;name-in&quot; v-model=&quot;name&quot; :maxlength=&quot;60&quot; is-full-width />
  </MpFormControl>

  <MpFormControl id=&quot;cat&quot; class=&quot;field-half&quot;>          <!-- select = span 3, own row -->
    <MpFormLabel>Category</MpFormLabel>
    <PopoverSelect id=&quot;cat-in&quot; v-model=&quot;category&quot; :options=&quot;…&quot; width=&quot;100%&quot; />
  </MpFormControl>
  <MpFormControl id=&quot;unit&quot; class=&quot;field-half&quot;> … Unit … </MpFormControl>

  <MpFormControl id=&quot;desc&quot;>
    <div class=&quot;lbl-row&quot;><MpFormLabel>Description</MpFormLabel><span class=&quot;counter&quot;>{{ description.length }}/250</span></div>
    <MpTextarea id=&quot;desc-in&quot; v-model=&quot;description&quot; :maxlength=&quot;250&quot; is-full-width />
  </MpFormControl>

  <MpFormControl id=&quot;type&quot;> … MpRadio group … </MpFormControl>
  <MpFormControl id=&quot;ch&quot;>   … MpCheckbox group … </MpFormControl>

  <div class=&quot;toggle-field&quot;><MpFormLabel>Track inventory</MpFormLabel><MpToggle … /></div>

  <div class=&quot;form-actions&quot;><MpButton variant=&quot;ghost&quot;>Cancel</MpButton><MpButton variant=&quot;primary&quot;>Save</MpButton></div>
</div>">
      <div class="form">
        <MpFormControl id="fg-name" is-required>
          <div class="lbl-row"><MpFormLabel>Product name</MpFormLabel><span class="counter">{{ nameCount }}</span></div>
          <MpInput id="fg-name-in" v-model="name" :maxlength="NAME_MAX" is-full-width />
        </MpFormControl>

        <!-- select with quick-add (create new) — see rule/select-quick-add -->
        <MpFormControl id="fg-cat" class="field-half">
          <MpFormLabel>Category</MpFormLabel>
          <MpAutocomplete
            id="fg-cat-in" v-model="category" :data="['Beans','Equipment','Packaging']"
            is-searchable is-clearable use-portal is-full-width
            is-show-button-action placeholder="Select category" @button-action="onCategoryAdd"
          >
            <template #buttonAction="{ currentSearch }">
              {{ currentSearch ? `Add "${currentSearch}" as a new category` : 'Add new category' }}
            </template>
          </MpAutocomplete>
        </MpFormControl>

        <MpFormControl id="fg-unit" class="field-half">
          <MpFormLabel>Unit</MpFormLabel>
          <PopoverSelect id="fg-unit-in" v-model="unit" :options="['kg','pcs','box']" width="100%" />
        </MpFormControl>

        <MpFormControl id="fg-desc">
          <div class="lbl-row"><MpFormLabel>Description</MpFormLabel><span class="counter">{{ descCount }}</span></div>
          <MpTextarea id="fg-desc-in" v-model="description" :maxlength="DESC_MAX" is-full-width />
        </MpFormControl>

        <MpFormControl id="fg-type">
          <MpFormLabel>Type</MpFormLabel>
          <MpFlex gap="4">
            <MpRadio id="fg-type-goods" value="goods" v-model="type">Goods</MpRadio>
            <MpRadio id="fg-type-service" value="service" v-model="type">Service</MpRadio>
          </MpFlex>
        </MpFormControl>

        <MpFormControl id="fg-ch">
          <MpFormLabel>Sales channels</MpFormLabel>
          <MpFlex gap="4">
            <MpCheckbox id="fg-ch-sales" value="sales" v-model="channels">Sales</MpCheckbox>
            <MpCheckbox id="fg-ch-purchase" value="purchase" v-model="channels">Purchase</MpCheckbox>
            <MpCheckbox id="fg-ch-product" value="product" v-model="channels">Product</MpCheckbox>
          </MpFlex>
        </MpFormControl>

        <MpToggle id="fg-track" v-model:is-checked="trackInventory" class="toggle-field">Track inventory</MpToggle>
        <MpToggle id="fg-tax" v-model:is-checked="taxable" class="toggle-field">Taxable</MpToggle>

        <div class="form-actions">
          <MpButton variant="ghost" is-rounded>Cancel</MpButton>
          <MpButton variant="primary" is-rounded>Save</MpButton>
        </div>
      </div>
    </DemoSection>
  </div>
</template>

<style scoped>
/* let form content be block/full-width in the gallery preview (not a shrunk flex item) */
:deep(.ds__preview) { display: block; }
/* 6-column form grid: max 558px, everything stacked, 20px between rows (Form.md) */
.form { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); width: 100%; max-width: 558px; }
/* selects are span 3 (half the grid), on their own row */
.field-half { max-width: 267px; }
/* label row with a right-aligned char counter (rule/input-char-counter) */
.lbl-row { display: flex; align-items: baseline; justify-content: space-between; }
.counter { font-size: var(--mp-font-sizes-sm, 0.75rem); color: var(--mp-colors-text-secondary, #3a4749); }
/* toggle field: MpToggle's own label (built-in 12px gap, same as checkbox); keep it
   from stretching across the form so label stays next to the switch */
.toggle-field { align-self: flex-start; }
/* action group: last, right-aligned, no divider */
.form-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2, 8px); }
</style>
