<script setup lang="ts">
import { ref } from 'vue'
import { MpTextarea } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Textarea · Pixel 3 Enterprise' })
const a = ref(''); const b = ref('Read only note')
</script>
<template>
  <div>
    <DemoHeader title="Textarea" tag="MpTextarea"
      lead="Multi-line text entry. Full width by default. Use for notes, descriptions, addresses." />
    <DemoSection title="Default"
      desc="Standard multi-line field."
      code="<MpTextarea id=&quot;x&quot; v-model=&quot;v&quot; placeholder=&quot;Notes…&quot; />">
      <MpTextarea id="px-ta" v-model="a" placeholder="Notes…" />
    </DemoSection>
    <DemoSection title="States"
      desc="is-invalid, is-disabled, is-read-only."
      :rules="['rule/form-errors-inline']"
      code="<MpTextarea id=&quot;x&quot; is-invalid />
<MpTextarea id=&quot;y&quot; is-disabled />
<MpTextarea id=&quot;z&quot; is-read-only />">
      <MpTextarea id="px-ta-inv" v-model="a" is-invalid placeholder="Invalid" />
      <MpTextarea id="px-ta-dis" v-model="a" is-disabled placeholder="Disabled" />
      <MpTextarea id="px-ta-ro" v-model="b" is-read-only />
    </DemoSection>
  </div>
</template>
