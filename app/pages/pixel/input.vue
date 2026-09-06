<script setup lang="ts">
import { ref } from 'vue'
import { MpInput } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Input · Pixel 3 Enterprise' })
const a = ref(''); const b = ref('Read only'); const c = ref('')
</script>
<template>
  <div>
    <DemoHeader title="Input" tag="MpInput"
      lead="Single-line text field. Full width by default. Pair with MpFormControl for label + error." />
    <DemoSection title="Sizes"
      desc="The default size is medium (md); use sm for dense rows."
      code="<MpInput id=&quot;x&quot; size=&quot;md&quot; />
<MpInput id=&quot;y&quot; size=&quot;sm&quot; />">
      <MpInput id="px-in-md" v-model="a" size="md" placeholder="Medium" />
      <MpInput id="px-in-sm" v-model="a" size="sm" placeholder="Small" />
    </DemoSection>
    <DemoSection title="States"
      desc="is-invalid (error), is-disabled, is-read-only, is-clearable."
      :rules="['rule/form-errors-inline']"
      code="<MpInput id=&quot;x&quot; is-invalid />
<MpInput id=&quot;y&quot; is-disabled />
<MpInput id=&quot;z&quot; is-read-only />
<MpInput id=&quot;w&quot; is-clearable />">
      <MpInput id="px-in-inv" v-model="a" is-invalid placeholder="Invalid" />
      <MpInput id="px-in-dis" v-model="a" is-disabled placeholder="Disabled" />
      <MpInput id="px-in-ro" v-model="b" is-read-only />
      <MpInput id="px-in-clr" v-model="c" is-clearable placeholder="Clearable" />
    </DemoSection>
  </div>
</template>
