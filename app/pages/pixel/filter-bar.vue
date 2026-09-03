<script setup lang="ts">
import { ref } from 'vue'
import {
  MpButton, MpButtonGroup, MpTooltip,
  MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon, MpIcon,
} from '@mekari/pixel3'
import PopoverSelect from '~/components/patterns/PopoverSelect.vue'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Filter bar · Pixel 3 Enterprise' })

const status = ref('')
const owner = ref('')
const search = ref('')
const opts = ['Draft', 'Sent', 'Paid']
const owners = ['Ana', 'Budi', 'Cici']
</script>

<template>
  <div>
    <DemoHeader title="Filter bar" tag="pattern · index page"
      lead="The fixed toolbar above every list/index table. Structure never varies: LEFT = inline dropdown filters + a secondary 'All filters' button; RIGHT = the icon tool group (AI · column settings · export) then Search (always rightmost). Split with space-between. Search & Export live here, never in the page title."
      :rules="['rule/filter-bar-anatomy', 'rule/filter-bar-search-export', 'rule/filter-bar-icon-group', 'rule/filter-bar-search-pill', 'rule/filter-bar-all-filters-drawer', 'rule/select-erpfilterselect']" />

    <DemoSection title="Full bar"
      desc="Left group and right group, split space-between. Mirror this on every index page."
      :rules="['rule/filter-bar-anatomy']"
      code="<div class=&quot;filter-bar&quot;>                       <!-- space-between -->
  <div class=&quot;filter-left&quot;>
    <!-- dropdown = PopoverSelect (popover menu, not native; clear × on hover) -->
    <PopoverSelect id=&quot;status&quot; v-model=&quot;status&quot; :options=&quot;opts&quot; placeholder=&quot;Status&quot; />
    <MpButton variant=&quot;secondary&quot; left-icon=&quot;filter&quot; is-rounded>All filters</MpButton>
  </div>
  <div class=&quot;filter-right&quot;>
    <MpButtonGroup>…AI · column settings · export (ghost + tooltips)…</MpButtonGroup>
    <MpInputGroup class=&quot;filter-search&quot;>…search pill + clear ×…</MpInputGroup>
  </div>
</div>">
      <div class="fb-bar">
        <div class="fb-left">
          <PopoverSelect id="fb-status-1" v-model="status" :options="opts" placeholder="Status" />
          <MpButton variant="secondary" left-icon="filter" is-rounded>All filters</MpButton>
        </div>
        <div class="fb-group">
          <MpButtonGroup>
            <MpTooltip label="Ask Airene"><MpButton variant="ghost" left-icon="airene-brand" aria-label="Ask Airene" is-rounded /></MpTooltip>
            <MpTooltip label="Column settings"><MpButton variant="ghost" left-icon="table-view-column" aria-label="Column settings" is-rounded /></MpTooltip>
            <MpTooltip label="Export"><MpButton variant="ghost" left-icon="download" aria-label="Export" is-rounded /></MpTooltip>
          </MpButtonGroup>
          <MpInputGroup id="fb-search-1" class="fb-search">
            <MpInputLeftAddon><MpIcon name="search" size="sm" /></MpInputLeftAddon>
            <MpInput v-model="search" placeholder="Search..." />
            <MpInputRightAddon v-if="search">
              <div class="fb-clear" role="button" tabindex="0" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></div>
            </MpInputRightAddon>
          </MpInputGroup>
        </div>
      </div>
    </DemoSection>

    <DemoSection title="Left — filters + All filters"
      desc="Inline filters are PopoverSelect (options in a popover, never native). The gap between each filter and the 'All filters' button is always 16px — including between two filters. 'All filters' is secondary and always opens the filters drawer."
      :rules="['rule/filter-bar-left-gap', 'rule/select-erpfilterselect', 'rule/filter-bar-all-filters-drawer']"
      code="<div class=&quot;filter-left&quot;>              <!-- gap: 16px -->
  <PopoverSelect id=&quot;status&quot; v-model=&quot;status&quot; :options=&quot;opts&quot;   placeholder=&quot;Status&quot; />
  <PopoverSelect id=&quot;owner&quot;  v-model=&quot;owner&quot;  :options=&quot;owners&quot; placeholder=&quot;Owner&quot; />
  <MpButton variant=&quot;secondary&quot; left-icon=&quot;filter&quot; is-rounded>All filters</MpButton>
</div>">
      <div class="fb-left">
        <PopoverSelect id="fb-status-2" v-model="status" :options="opts" placeholder="Status" width="12rem" />
        <PopoverSelect id="fb-owner-2" v-model="owner" :options="owners" placeholder="Owner" width="12rem" />
        <MpButton variant="secondary" left-icon="filter" is-rounded>All filters</MpButton>
      </div>
    </DemoSection>

    <DemoSection title="Right — tools + search"
      desc="Ghost icon group (AI · column settings · export, each with a tooltip) then the Search pill — always rightmost, leading icon, and a clear (×) shown only when it has a value. Type in the field to see the ×."
      :rules="['rule/filter-bar-icon-group', 'rule/filter-bar-search-pill', 'rule/btn-icon-tooltip', 'rule/icon-pixel-library']"
      code="<MpInputGroup class=&quot;filter-search&quot;>
  <MpInputLeftAddon><MpIcon name=&quot;search&quot; size=&quot;sm&quot; /></MpInputLeftAddon>
  <MpInput v-model=&quot;search&quot; placeholder=&quot;Search...&quot; />
  <MpInputRightAddon v-if=&quot;search&quot;>… close × → clears …</MpInputRightAddon>
</MpInputGroup>">
      <div class="fb-group">
        <MpButtonGroup>
          <MpTooltip label="Ask Airene"><MpButton variant="ghost" left-icon="airene-brand" aria-label="Ask Airene" is-rounded /></MpTooltip>
          <MpTooltip label="Column settings"><MpButton variant="ghost" left-icon="table-view-column" aria-label="Column settings" is-rounded /></MpTooltip>
          <MpTooltip label="Export"><MpButton variant="ghost" left-icon="download" aria-label="Export" is-rounded /></MpTooltip>
        </MpButtonGroup>
        <MpInputGroup id="fb-search-2" class="fb-search">
          <MpInputLeftAddon><MpIcon name="search" size="sm" /></MpInputLeftAddon>
          <MpInput v-model="search" placeholder="Search..." />
          <MpInputRightAddon v-if="search">
            <div class="fb-clear" role="button" tabindex="0" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></div>
          </MpInputRightAddon>
        </MpInputGroup>
      </div>
    </DemoSection>
  </div>
</template>

<style scoped>
.fb-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  flex-wrap: wrap;
}
.fb-group { display: flex; align-items: center; gap: var(--mp-spacing-2); }
/* Left group: filters ↔ filters and filters ↔ All filters are always 16px */
.fb-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.fb-search :deep(.mp-input__control),
.fb-search { border-radius: var(--mp-radii-full, 999px); }
.fb-clear { display: inline-flex; cursor: pointer; color: var(--mp-text-secondary); }
.fb-clear:hover { color: var(--mp-colors-text-default, #080d0e); }
</style>
