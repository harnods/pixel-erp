<script setup lang="ts">
import { MpText } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Select · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Select" tag="MpSelect" deprecated
      lead="DEPRECATED — do not use. MpSelect renders a native <select>, whose options are the OS dropdown (off-system, clips in scroll containers, can't be styled). Repo-wide rule: every dropdown uses MpAutocomplete (popover menu). See the Dropdown page."
      :rules="['rule/select-erpfilterselect']" />
    <DemoSection title="Use MpAutocomplete instead"
      desc="A dropdown is an MpAutocomplete: omit is-searchable for a plain select, add is-searchable to type-to-filter, is-clearable for the (×) reset, use-portal so the menu never clips."
      :rules="['rule/select-erpfilterselect']"
      code="<!-- ❌ don't -->
<MpSelect v-model=&quot;v&quot;><option>…</option></MpSelect>
<!-- ✅ do -->
<MpAutocomplete id=&quot;x&quot; v-model=&quot;v&quot; :data=&quot;opts&quot; placeholder=&quot;Status&quot; is-clearable use-portal />">
      <MpText>See <code>Dropdown</code> in the sidebar for the MpAutocomplete variants.</MpText>
    </DemoSection>
  </div>
</template>
