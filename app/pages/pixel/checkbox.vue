<script setup lang="ts">
import { ref } from 'vue'
import { MpCheckbox } from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Checkbox · Pixel 3 Enterprise' })
const a = ref(true); const b = ref(false); const c = ref(true)
</script>
<template>
  <div>
    <DemoHeader title="Checkbox" tag="MpCheckbox"
      lead="Toggle between checked, unchecked and indeterminate. Bind a group with v-model (array of values) or a single box with v-model:is-checked. The box↔label gap is exactly 12px and BUILT IN — add no extra padding. In tables the row checkbox rides inside the first cell, not a separate column."
      :rules="['rule/checkbox-gap-12', 'rule/table-checkbox-first-cell', 'rule/checkbox-multiline-top']" />
    <DemoSection title="States"
      desc="checked, unchecked, indeterminate, disabled."
      code="<MpCheckbox id=&quot;x&quot; v-model:is-checked=&quot;v&quot;>Label</MpCheckbox>
<MpCheckbox id=&quot;y&quot; :is-indeterminate=&quot;true&quot;>Some selected</MpCheckbox>
<MpCheckbox id=&quot;z&quot; is-disabled>Disabled</MpCheckbox>">
      <MpCheckbox id="px-cb1" v-model:is-checked="a">Checked</MpCheckbox>
      <MpCheckbox id="px-cb2" v-model:is-checked="b">Unchecked</MpCheckbox>
      <MpCheckbox id="px-cb3" :is-indeterminate="true">Indeterminate</MpCheckbox>
      <MpCheckbox id="px-cb4" v-model:is-checked="c" is-disabled>Disabled</MpCheckbox>
    </DemoSection>
    <DemoSection title="With description"
      desc="Use the #description slot for a supporting line under the label. Multi-line label keeps the box top-aligned."
      :rules="['rule/checkbox-multiline-top']"
      code="<MpCheckbox id=&quot;x&quot; v-model:is-checked=&quot;v&quot;>
  Marketing promotion
  <template #description>Send offers and product announcements.</template>
</MpCheckbox>">
      <MpCheckbox id="px-cb5" v-model:is-checked="a">
        Marketing promotion
        <template #description>Send promotional offers, product announcements, and more.</template>
      </MpCheckbox>
    </DemoSection>

    <DemoSection title="Gap is built in — 12px"
      desc="The 12px box↔label gap comes from MpCheckbox itself. Never add padding-right on the box AND padding-left/margin-left on the label — that's the classic double-gap (24px). Just render the component."
      :rules="['rule/checkbox-gap-12']"
      code="<!-- right: nothing extra, gap is built in -->
<MpCheckbox id=&quot;x&quot; v-model:is-checked=&quot;v&quot;>Label</MpCheckbox>

<!-- WRONG: manual padding on both sides → 24px -->
<MpCheckbox class=&quot;pr-3&quot;><span class=&quot;pl-3&quot;>Label</span></MpCheckbox>">
      <MpCheckbox id="px-cb-gap" v-model:is-checked="a">Exactly 12px to the label</MpCheckbox>
    </DemoSection>

    <DemoSection title="In a table — first cell, not a separate column"
      desc="A row-selection checkbox lives inside the first data cell (before its content), sharing that cell — never a checkbox-only column, which wastes a full column and misaligns the header. Use the checkbox's OWN label slot for the row name so the box↔name gap is the built-in 12px (one gap). Don't add a separate span + wrapper flex-gap — that doubles it to 24px."
      :rules="['rule/table-checkbox-first-cell', 'rule/checkbox-gap-12']"
      code="<td>                              <!-- first data cell -->
  <!-- name is the checkbox's own label → single built-in 12px gap -->
  <MpCheckbox id=&quot;r1&quot; v-model:is-checked=&quot;sel&quot;>{{ row.name }}</MpCheckbox>
</td>

<!-- WRONG: separate span + flex gap → 12 (built-in) + 12 (flex) = 24px -->
<div class=&quot;flex gap-3&quot;><MpCheckbox /> <span>{{ row.name }}</span></div>">
      <table class="cbtbl">
        <thead><tr><th>Name</th><th>Status</th></tr></thead>
        <tbody>
          <tr>
            <td><MpCheckbox id="px-cb-t1" v-model:is-checked="a">Acme Corporation</MpCheckbox></td>
            <td>Active</td>
          </tr>
          <tr>
            <td><MpCheckbox id="px-cb-t2" v-model:is-checked="b">Globex Inc</MpCheckbox></td>
            <td>Draft</td>
          </tr>
        </tbody>
      </table>
    </DemoSection>
  </div>
</template>

<style scoped>
.cbtbl { width: 100%; border-collapse: collapse; }
.cbtbl th {
  text-align: left;
  font-size: var(--mp-font-sizes-sm, 0.75rem);
  color: var(--mp-text-secondary, #3a4749);
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-4, 16px) var(--mp-spacing-2, 8px) 0;
  border-bottom: 1px solid var(--mp-border-subtle, #e3e7e9);
}
.cbtbl td {
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-4, 16px) var(--mp-spacing-2, 8px) 0;
  border-bottom: 1px solid var(--mp-border-subtle, #e3e7e9);
  font-size: var(--mp-font-sizes-md, 0.875rem);
}
</style>
