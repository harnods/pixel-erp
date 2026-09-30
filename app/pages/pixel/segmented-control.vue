<script setup lang="ts">
import { ref } from 'vue'
import { MpSegmentedControl } from '@mekari/pixel3'
import ErpIconSegmented from '~/components/patterns/ErpIconSegmented.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Segmented control · Pixel 3 Enterprise' })
const a = ref('list')
const view = ref('table')
</script>
<template>
  <div>
    <DemoHeader title="Segmented control" tag="MpSegmentedControl"
      lead="Switch between a few mutually-exclusive views (e.g. List / Board). For 2-3 options all visible at once. Use THIS for segmented switches — never a MpButtonGroup of toggle buttons. In the ERP it is PILL-shaped, and its active segment reads the same as the sidebar level-2 active nav (#E2E8F0 background, #165082 text) — never brand green."
      :rules="['rule/segmented-control-pill']" />
    <DemoSection title="Default"
      desc="data is an array of { label, value }; bind the choice with v-model. The pill shape + slate active state come from the global ERP override in erp.css — nothing extra per usage."
      :rules="['rule/segmented-control-pill']"
      code="const data = [{ label: 'List', value: 'list' }, { label: 'Board', value: 'board' }]
<MpSegmentedControl id=&quot;x&quot; name=&quot;x&quot; v-model=&quot;v&quot; :data=&quot;data&quot; />
<!-- active segment = #E2E8F0 bg / #165082 text (sidebar level-2), via erp.css -->">
      <MpSegmentedControl id="px-seg" name="px-seg" v-model="a" :data="[{label:'List',value:'list'},{label:'Board',value:'board'}]" />
    </DemoSection>

    <DemoSection title="Icon only — active icon fills"
      desc="For compact view switches (table / board), use ErpIconSegmented: same pill + slate active state, and the ACTIVE segment's icon renders filled (variant=fill), matching the sidebar's active-nav behaviour. MpSegmentedControl can't fill a per-item icon, so this thin wrapper handles icon-only."
      :rules="['rule/segmented-control-pill', 'rule/segmented-icon-active-fill', 'rule/icon-pixel-library']"
      code="<ErpIconSegmented id=&quot;view&quot; v-model=&quot;view&quot; :options=&quot;[
  { value: 'table', icon: 'table-view-column', label: 'Table' },
  { value: 'board', icon: 'table-view-field',  label: 'Board' },
]&quot; />
<!-- active segment's icon = variant=fill -->">
      <ErpIconSegmented id="px-seg-icon" v-model="view"
        :options="[{value:'table',icon:'table-view-column',label:'Table'},{value:'board',icon:'table-view-field',label:'Board'}]" />
    </DemoSection>
  </div>
</template>
