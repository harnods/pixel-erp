<script setup lang="ts">
import { MpTag } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Tag · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Tag" tag="MpTag"
      lead="A small label that can be selected or removed. In the ERP a tag is ALWAYS gray (no red / coloured tags) and ALWAYS the default md size (never sm). For a table cell showing many tags, use ErpTagList (2-line clamp + overflow)."
      :rules="['rule/tag-gray-only', 'rule/tag-size-default']" />

    <DemoSection title="Default — gray, md"
      desc="Gray is the only variant; md is the only size. Don't pass variant=&quot;red&quot; or size=&quot;sm&quot;."
      :rules="['rule/tag-gray-only', 'rule/tag-size-default']"
      code="<MpTag id=&quot;a&quot;>Wholesale</MpTag>
<MpTag id=&quot;b&quot;>Priority</MpTag>">
      <MpTag id="px-tag-a">Wholesale</MpTag>
      <MpTag id="px-tag-b">Priority</MpTag>
      <MpTag id="px-tag-c">Recurring</MpTag>
    </DemoSection>

    <DemoSection title="Closable"
      desc="is-closable adds a remove (×) — for editable tag inputs. Still gray, still md."
      :rules="['rule/tag-gray-only']"
      code="<MpTag id=&quot;a&quot; is-closable>Jakarta</MpTag>">
      <MpTag id="px-tag-d" is-closable>Jakarta</MpTag>
      <MpTag id="px-tag-e" is-closable>Net-30</MpTag>
    </DemoSection>
  </div>
</template>
