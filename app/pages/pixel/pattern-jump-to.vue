<script setup lang="ts">
import { ref } from 'vue'
import { MpBadge } from '@mekari/pixel3'
import DetailJumpTo, { type JumpItem } from '~/components/patterns/DetailJumpTo.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Jump to · Pixel 3 Enterprise' })

const items: JumpItem[] = [
  { id: 'SA-00042', primary: 'SA-00042', secondary: 'Central Warehouse · Damage' },
  { id: 'SA-00041', primary: 'SA-00041', secondary: 'Central Warehouse · Recount' },
  { id: 'SA-00040', primary: 'SA-00040', secondary: 'East Depot · Damage' },
  { id: 'SA-00039', primary: 'SA-00039', secondary: 'East Depot · Expiry' },
  { id: 'SA-00038', primary: 'SA-00038', secondary: 'Central Warehouse · Recount' },
]
const current = ref('SA-00042')
function onSelect(id: string) { current.value = id }   // a real page would router.push(basePath/id)
</script>

<template>
  <div>
    <DemoHeader title="Jump to" tag="pattern · detail page"
      lead="The record switcher next to a detail page's title — a small chevron that opens a searchable popover of sibling records so the user can hop straight to another one of the same type without going back to the list. Each row = a primary line (the record number/name) + an optional secondary caption. Extracted as the shared DetailJumpTo.vue; place it right after the title + status badge."
      :rules="['rule/detail-jump-to', 'rule/detail-jump-to-anatomy', 'rule/btn-dropdown-mppopover']" />

    <DemoSection title="In the title row"
      desc="Sits immediately after the H1 title and status badge: a 28px chevron button (aria-label 'Switch <record>'). Clicking opens the popover below-start. The picked id is emitted as select — the page routes to that record (router.push(basePath/id))."
      :rules="['rule/detail-jump-to']"
      code="<div class=&quot;detail-titlerow-left&quot;>
  <h1 class=&quot;detail-title&quot;>{{ current }}</h1>
  <ErpStatusBadge status=&quot;draft&quot; />
  <DetailJumpTo id=&quot;sa-jump&quot; :items=&quot;items&quot; aria-label=&quot;Switch transaction&quot; @select=&quot;jumpTo&quot; />
</div>">
      <div class="jt-titlerow">
        <h1 class="jt-title">{{ current }}</h1>
        <MpBadge for="additionalInformation" type="announcement" size="md">Draft</MpBadge>
        <DetailJumpTo id="jt-demo" :items="items" aria-label="Switch transaction" @select="onSelect" />
      </div>
    </DemoSection>

    <DemoSection title="Popover — search + list"
      desc="304px popover: a search field (with a clear × once typed) that filters by primary or secondary, then the list of records (primary + secondary caption). Clicking a row selects it and clears the search; no match shows an empty line. Icons are MpIcon (chevrons-down, close) — never raw svg."
      :rules="['rule/detail-jump-to-anatomy', 'rule/icon-pixel-library']"
      code="results = items.filter(i =>
  i.primary.toLowerCase().includes(q) || i.secondary?.toLowerCase().includes(q))
// row: <span primary> + <span secondary caption>; empty → 'No records found'">
      <p class="jt-note">Open the switcher above and type "east" to filter.</p>
    </DemoSection>
  </div>
</template>

<style scoped>
.jt-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.jt-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.jt-note { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
