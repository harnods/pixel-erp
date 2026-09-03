<script setup lang="ts">
import { MpInput, MpFormControl, MpFormLabel, MpFormHelpText, MpFormErrorMessage } from '@mekari/pixel3'
import DemoCard from '~/components/patterns/DemoCard.vue'
useHead({ title: 'Form control · Pixel 3 Enterprise' })
</script>
<template>
  <DemoCard title="Form control" tag="MpFormControl"
    override="Errors render INLINE via MpFormErrorMessage — never a toast."
    :rules="['rule/form-errors-inline']"
    snippet="<MpFormControl id=&quot;x&quot; is-required :is-invalid=&quot;err&quot;>
  <MpFormLabel>Name</MpFormLabel>
  <MpInput … />
  <MpFormErrorMessage>Required</MpFormErrorMessage>
</MpFormControl>">
    <MpFormControl id="px-fc" is-required :is-invalid="true">
      <MpFormLabel>Vendor name</MpFormLabel>
      <MpInput id="px-fc-in" is-full-width placeholder="e.g. PT Maju" />
      <MpFormHelpText>As printed on the invoice.</MpFormHelpText>
      <MpFormErrorMessage>Vendor name is required</MpFormErrorMessage>
    </MpFormControl>
  </DemoCard>
</template>
