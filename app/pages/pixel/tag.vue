<script setup lang="ts">
import { MpTag } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Tag · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Tag" tag="MpTag"
      lead="A small label that can be selected or removed. For a table cell showing many tags, use ErpTagList (2-line clamp + overflow)." />
    <DemoSection title="Variant"
      desc="gray (default) and red."
      code="<MpTag id=&quot;a&quot;>Gray</MpTag>
<MpTag id=&quot;b&quot; variant=&quot;red&quot;>Red</MpTag>">
      <MpTag id="px-tag-a">Gray</MpTag>
      <MpTag id="px-tag-b" variant="red">Red</MpTag>
    </DemoSection>
    <DemoSection title="Size & closable"
      desc="md (default) / sm; is-closable adds a remove (×)."
      code="<MpTag id=&quot;a&quot;>Medium</MpTag>
<MpTag id=&quot;b&quot; size=&quot;sm&quot;>Small</MpTag>
<MpTag id=&quot;c&quot; is-closable>Closable</MpTag>">
      <MpTag id="px-tag-c">Medium</MpTag>
      <MpTag id="px-tag-d" size="sm">Small</MpTag>
      <MpTag id="px-tag-e" is-closable>Closable</MpTag>
    </DemoSection>
  </div>
</template>
