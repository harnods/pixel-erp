<script setup lang="ts">
import { MpInput, MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Form control · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Form control" tag="MpFormControl"
      lead="Wraps a field with its label, help text and error message. Errors render INLINE via MpFormErrorMessage — never a toast."
      :rules="['rule/form-errors-inline']" />
    <DemoSection title="Default (with help text)"
      desc="Label + input + help text. is-required shows the required indicator."
      code="<MpFormControl id=&quot;x&quot; is-required>
  <MpFormLabel>Vendor name</MpFormLabel>
  <MpInput id=&quot;x-in&quot; />
  <MpFormHelpText>As printed on the invoice.</MpFormHelpText>
</MpFormControl>">
      <div style="width:100%; max-width:24rem">
        <MpFormControl id="px-fc1" is-required>
          <MpFormLabel>Vendor name</MpFormLabel>
          <MpInput id="px-fc1-in" placeholder="e.g. PT Maju" />
          <MpFormHelpText>As printed on the invoice.</MpFormHelpText>
        </MpFormControl>
      </div>
    </DemoSection>
    <DemoSection title="Invalid (inline error)"
      desc="Set :is-invalid and provide MpFormErrorMessage — the error shows inline under the field."
      :rules="['rule/form-errors-inline']"
      code="<MpFormControl id=&quot;x&quot; is-required :is-invalid=&quot;true&quot;>
  <MpFormLabel>Vendor name</MpFormLabel>
  <MpInput id=&quot;x-in&quot; />
  <MpFormErrorMessage>Vendor name is required</MpFormErrorMessage>
</MpFormControl>">
      <div style="width:100%; max-width:24rem">
        <MpFormControl id="px-fc2" is-required :is-invalid="true">
          <MpFormLabel>Vendor name</MpFormLabel>
          <MpInput id="px-fc2-in" placeholder="e.g. PT Maju" />
          <MpFormErrorMessage>Vendor name is required</MpFormErrorMessage>
        </MpFormControl>
      </div>
    </DemoSection>
  </div>
</template>
