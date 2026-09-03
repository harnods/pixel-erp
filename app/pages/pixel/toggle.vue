<script setup lang="ts">
import { ref } from 'vue'
import { MpToggle } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Toggle · Pixel 3 Enterprise' })
const a = ref(true); const b = ref(false); const c = ref(true)
</script>
<template>
  <div>
    <DemoHeader title="Toggle" tag="MpToggle"
      lead="On/off switch for an immediate setting (no Save needed). Use a checkbox instead when the value is submitted with a form." />
    <DemoSection title="States"
      desc="on, off, disabled. Bind with v-model:is-checked."
      code="<MpToggle id=&quot;x&quot; v-model:is-checked=&quot;v&quot; />
<MpToggle id=&quot;y&quot; is-disabled />">
      <MpToggle id="px-tg1" v-model:is-checked="a" />
      <MpToggle id="px-tg2" v-model:is-checked="b" />
      <MpToggle id="px-tg3" v-model:is-checked="c" is-disabled />
    </DemoSection>
    <DemoSection title="With label & description"
      desc="Label + optional #description slot."
      code="<MpToggle id=&quot;x&quot; v-model:is-checked=&quot;v&quot;>
  Marketing promotion
  <template #description>Send offers and announcements.</template>
</MpToggle>">
      <MpToggle id="px-tg4" v-model:is-checked="a">
        Marketing promotion
        <template #description>Send promotional offers and product announcements.</template>
      </MpToggle>
    </DemoSection>
  </div>
</template>
