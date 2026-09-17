<script setup lang="ts">
import { MpText, MpTextlink } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Text & link · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Text & link" tag="MpText / MpTextlink"
      lead="MpText renders body copy on the type scale; MpTextlink is an inline hyperlink. A clickable NAME inside a table cell is a styled span, not MpTextlink."
      :rules="['rule/table-name-link-span']" />
    <DemoSection title="Text"
      desc="Body text at 14px. De-emphasise with a smaller size + secondary colour — never italic."
      :rules="['rule/type-no-italic']"
      code="<MpText>Body text at 14px.</MpText>">
      <MpText>Body text at 14px.</MpText>
    </DemoSection>
    <DemoSection title="Link"
      desc="Inline hyperlink for navigation within prose."
      code="<MpTextlink href=&quot;#&quot;>A text link</MpTextlink>">
      <MpTextlink href="#">A text link</MpTextlink>
    </DemoSection>
  </div>
</template>
