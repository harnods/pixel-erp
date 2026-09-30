<script setup lang="ts">
import { ref } from 'vue'
import { MpDatePicker } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Date picker · Pixel 3 Enterprise' })
const a = ref('')
const range = ref<Date[] | null>(null)
</script>
<template>
  <div>
    <DemoHeader title="Date picker" tag="MpDatePicker · AdvancedDateRangePicker"
      lead="Two date controls, and only two: the DEFAULT single-date MpDatePicker (DD/MM/YYYY), and the ADVANCED range picker (preset list + 2-month calendar) for ranges & report periods. A calendar must always render fully — never let it clip against an overflow/scroll ancestor."
      :rules="['rule/date-picker-variants', 'rule/date-picker-no-clip', 'rule/format-date']" />

    <DemoSection title="Default — single date"
      desc="Always set format=&quot;DD/MM/YYYY&quot; and value-type=&quot;format&quot; for ERP consistency. The example reserves height below the field so the open calendar renders in full (rule/date-picker-no-clip)."
      :rules="['rule/date-picker-variants', 'rule/format-date']"
      code="<MpDatePicker id=&quot;x&quot; v-model=&quot;v&quot; format=&quot;DD/MM/YYYY&quot; value-type=&quot;format&quot; />">
      <div class="dp-room">
        <MpDatePicker id="px-dp" v-model="a" format="DD/MM/YYYY" value-type="format" />
      </div>
    </DemoSection>

    <DemoSection title="Advanced — range & presets"
      desc="For a date range or a report period use AdvancedDateRangePicker: a preset list (Today / Last 7 / Last 30 …) plus a 2-month calendar under Custom. Its popover is portaled, so it is never clipped. direction=&quot;future&quot; for due-date-style fields; periodMode for month/quarter/year reports."
      :rules="['rule/date-picker-variants', 'rule/date-picker-no-clip']"
      code="<AdvancedDateRangePicker id=&quot;x&quot; v-model=&quot;range&quot; placeholder=&quot;Select date range&quot; />
<!-- range is Date[] | null; null = unapplied -->">
      <div class="dp-room">
        <AdvancedDateRangePicker id="px-adp" v-model="range" placeholder="Select date range" />
      </div>
    </DemoSection>
  </div>
</template>

<style scoped>
/* Reserve vertical room so the in-flow default calendar renders fully inside the
   demo card instead of being clipped by the card's overflow (rule/date-picker-no-clip). */
.dp-room { min-height: 22rem; width: 18rem; max-width: 100%; }
</style>
