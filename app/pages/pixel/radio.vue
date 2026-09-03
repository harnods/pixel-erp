<script setup lang="ts">
import { ref } from 'vue'
import { MpRadio } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Radio · Pixel 3 Enterprise' })
const a = ref('one')
</script>
<template>
  <div>
    <DemoHeader title="Radio" tag="MpRadio"
      lead="A single choice from a mutually-exclusive set. Share one name + v-model across the group." />
    <DemoSection title="Group"
      desc="Same name binds the group; one can be disabled."
      code="<MpRadio id=&quot;a&quot; name=&quot;g&quot; value=&quot;one&quot; v-model=&quot;v&quot;>One</MpRadio>
<MpRadio id=&quot;b&quot; name=&quot;g&quot; value=&quot;two&quot; v-model=&quot;v&quot;>Two</MpRadio>
<MpRadio id=&quot;c&quot; name=&quot;g&quot; value=&quot;three&quot; v-model=&quot;v&quot; is-disabled>Three</MpRadio>">
      <MpRadio id="px-r1" name="px-rg" value="one" v-model="a">One</MpRadio>
      <MpRadio id="px-r2" name="px-rg" value="two" v-model="a">Two</MpRadio>
      <MpRadio id="px-r3" name="px-rg" value="three" v-model="a" is-disabled>Three (disabled)</MpRadio>
    </DemoSection>
    <DemoSection title="With description"
      desc="Use the #description slot for a supporting line."
      code="<MpRadio id=&quot;x&quot; name=&quot;g&quot; value=&quot;v&quot; v-model=&quot;m&quot;>
  Marketing
  <template #description>Send promotional offers.</template>
</MpRadio>">
      <MpRadio id="px-r4" name="px-rg2" value="m" v-model="a">
        Marketing
        <template #description>Send promotional offers and product announcements.</template>
      </MpRadio>
    </DemoSection>
  </div>
</template>
