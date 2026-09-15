<script setup lang="ts">
import { ref, computed } from 'vue'
import { MpTextarea } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Textarea · Pixel 3 Enterprise' })
const a = ref(''); const b = ref('Read only note')
const notes = ref('Delivered to the loading dock; signed by warehouse lead.')
const MAX = 120
const remaining = computed(() => `${notes.value.length}/${MAX}`)
</script>
<template>
  <div>
    <DemoHeader title="Textarea" tag="MpTextarea"
      lead="Multi-line text entry. Full width by default. Use for notes, descriptions, addresses. Same baku rules as inputs: no placeholder, md size only."
      :rules="['rule/input-no-placeholder', 'rule/form-size-md-only']" />

    <DemoSection title="Default"
      desc="Standard multi-line field — no placeholder; the label carries the meaning."
      :rules="['rule/input-no-placeholder']"
      code="<MpTextarea id=&quot;x&quot; v-model=&quot;v&quot; />">
      <MpTextarea id="px-ta" v-model="a" />
    </DemoSection>

    <DemoSection title="States"
      desc="is-invalid (pair with an inline error caption), is-disabled, is-read-only."
      :rules="['rule/field-invalid-caption']"
      code="<MpTextarea id=&quot;x&quot; is-invalid />   <!-- + MpFormErrorMessage below -->
<MpTextarea id=&quot;y&quot; is-disabled />
<MpTextarea id=&quot;z&quot; is-read-only />">
      <MpTextarea id="px-ta-inv" v-model="a" is-invalid />
      <MpTextarea id="px-ta-dis" v-model="a" is-disabled />
      <MpTextarea id="px-ta-ro" v-model="b" is-read-only />
    </DemoSection>

    <DemoSection title="Character counter"
      desc="Length-capped textarea: cap with native maxlength and show the n/max counter at the TOP-RIGHT, aligned to the field's right edge. Same composed pattern as the input counter."
      :rules="['rule/input-char-counter']"
      code="<div class=&quot;fld-counter-top&quot;>{{ v.length }}/120</div>   <!-- top-right, above the field -->
<MpTextarea id=&quot;x&quot; v-model=&quot;v&quot; :maxlength=&quot;120&quot; />">
      <div class="ct-field">
        <div class="ct-counter">{{ remaining }}</div>
        <MpTextarea id="px-ta-count" v-model="notes" :maxlength="MAX" />
      </div>
    </DemoSection>
  </div>
</template>

<style scoped>
.ct-field { width: 100%; max-width: 26rem; }
.ct-counter {
  margin-bottom: var(--mp-spacing-1, 4px);
  text-align: right;
  font-size: var(--mp-font-sizes-sm, 0.75rem);
  color: var(--mp-text-secondary, #3a4749);
}
</style>
