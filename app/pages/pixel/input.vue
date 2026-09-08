<script setup lang="ts">
import { ref, computed } from 'vue'
import { MpInput } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Input · Pixel 3 Enterprise' })
const a = ref(''); const b = ref('Read only'); const c = ref('')
const counted = ref('Acme Corporation')
const MAX = 40
const remaining = computed(() => `${counted.value.length}/${MAX}`)
</script>
<template>
  <div>
    <DemoHeader title="Input" tag="MpInput"
      lead="Single-line text field. Full width by default. Pair with MpFormControl for label + error. Two baku ERP rules: NO placeholder (label the field, leave it empty) and md size only (never sm)."
      :rules="['rule/input-no-placeholder', 'rule/form-size-md-only']" />

    <DemoSection title="Default"
      desc="Size md (the only ERP size) and NO placeholder — the label carries the meaning, the control starts empty. Never use placeholder text as a label or hint."
      :rules="['rule/input-no-placeholder', 'rule/form-size-md-only']"
      code="<MpInput id=&quot;x&quot; v-model=&quot;v&quot; />   <!-- md is the default; no placeholder -->">
      <MpInput id="px-in-md" v-model="a" />
    </DemoSection>

    <DemoSection title="States"
      desc="is-invalid (error — pair with an inline error caption), is-disabled, is-read-only, is-clearable. No placeholders here either."
      :rules="['rule/field-invalid-caption', 'rule/input-no-placeholder']"
      code="<MpInput id=&quot;x&quot; is-invalid />       <!-- + MpFormErrorMessage below -->
<MpInput id=&quot;y&quot; is-disabled />
<MpInput id=&quot;z&quot; is-read-only />
<MpInput id=&quot;w&quot; is-clearable />">
      <MpInput id="px-in-inv" v-model="a" is-invalid />
      <MpInput id="px-in-dis" v-model="a" is-disabled />
      <MpInput id="px-in-ro" v-model="b" is-read-only />
      <MpInput id="px-in-clr" v-model="c" is-clearable />
    </DemoSection>

    <DemoSection title="Character counter"
      desc="For a length-capped field: cap with native maxlength and show the n/max counter at the TOP-RIGHT, aligned to the field's right edge (on the label row). Pixel 3 has no built-in counter, so this is a small composed pattern — keep it identical everywhere."
      :rules="['rule/input-char-counter']"
      code="<div class=&quot;fld-counter-top&quot;>{{ v.length }}/40</div>   <!-- top-right, above the field -->
<MpInput id=&quot;x&quot; v-model=&quot;v&quot; :maxlength=&quot;40&quot; />">
      <div class="ct-field">
        <div class="ct-counter">{{ remaining }}</div>
        <MpInput id="px-in-count" v-model="counted" :maxlength="MAX" />
      </div>
    </DemoSection>
  </div>
</template>

<style scoped>
.ct-field { width: 100%; max-width: 22rem; }
.ct-counter {
  margin-bottom: var(--mp-spacing-1, 4px);
  text-align: right;
  font-size: var(--mp-font-sizes-sm, 0.75rem);
  color: var(--mp-text-secondary, #3a4749);
}
</style>
