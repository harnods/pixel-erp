<script setup lang="ts">
import {
  MpButton, MpButtonGroup, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import DemoHeader from '~/components/patterns/DemoHeader.vue'
import DemoSection from '~/components/patterns/DemoSection.vue'
useHead({ title: 'Button group · Pixel 3 Enterprise' })
</script>
<template>
  <div>
    <DemoHeader title="Button group" tag="MpButtonGroup"
      lead="Groups related buttons with a fixed 8px gap. In this ERP it's used for (1) the action footer — Cancel + primary (2 or 3 buttons), always right-aligned; (2) page-title-bar actions when there's more than one; (3) a filter-bar icon-tool group — AI, column settings, export (ghost icon-only + tooltips); and (4) split buttons. Do NOT use it for a segmented switch (use MpSegmentedControl)."
      :rules="['rule/btn-group-gap-8', 'rule/btn-responsive-footer', 'rule/page-title-actions-group', 'rule/filter-bar-icon-group', 'rule/btn-icon-tooltip', 'rule/btn-cancel-ghost', 'rule/btn-one-primary']" />

    <DemoSection title="Action footer — 2 buttons"
      desc="The common footer: ghost Cancel + primary Save, in an MpButtonGroup.erp-action-footer. Always right-aligned on desktop; full-width + stacked (Save on top) on mobile ≤640px."
      :rules="['rule/btn-responsive-footer', 'rule/btn-cancel-ghost']"
      code="<MpButtonGroup class=&quot;erp-action-footer&quot;>
  <MpButton variant=&quot;ghost&quot; is-rounded>Cancel</MpButton>
  <MpButton variant=&quot;primary&quot; is-rounded>Save</MpButton>
</MpButtonGroup>">
      <div style="width:100%">
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded>Cancel</MpButton>
          <MpButton variant="primary" is-rounded>Save</MpButton>
        </MpButtonGroup>
      </div>
    </DemoSection>

    <DemoSection title="Action footer — 3 buttons"
      desc="For multi-step / wizard footers: ghost Back + ghost Cancel + primary Save. Same MpButtonGroup.erp-action-footer, right-aligned; primary stays last (goes on top when stacked on mobile)."
      :rules="['rule/btn-responsive-footer', 'rule/btn-cancel-ghost', 'rule/btn-one-primary']"
      code="<MpButtonGroup class=&quot;erp-action-footer&quot;>
  <MpButton variant=&quot;ghost&quot; is-rounded>Back</MpButton>
  <MpButton variant=&quot;ghost&quot; is-rounded>Cancel</MpButton>
  <MpButton variant=&quot;primary&quot; is-rounded>Save</MpButton>
</MpButtonGroup>">
      <div style="width:100%">
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded>Back</MpButton>
          <MpButton variant="ghost" is-rounded>Cancel</MpButton>
          <MpButton variant="primary" is-rounded>Save</MpButton>
        </MpButtonGroup>
      </div>
    </DemoSection>

    <DemoSection title="Page-title actions"
      desc="Actions in the page-title bar: title on the LEFT, actions on the RIGHT (space-between). A single action stands alone; two or more are wrapped in an MpButtonGroup, ordered SECONDARY then PRIMARY (e.g. Import then + New). One primary only. Export / column settings do NOT go here — they live in the filter-bar icon group."
      :rules="['rule/page-title-actions-group', 'rule/btn-group-gap-8', 'rule/btn-one-primary']"
      code="<!-- title bar: title left, actions right. The + is the 'add' icon, not text.
     Create label = 'New <entity>'. -->
<!-- one action -->
<MpButton variant=&quot;primary&quot; left-icon=&quot;add&quot; is-rounded>New contact</MpButton>

<!-- two or more: MpButtonGroup, secondary then primary -->
<MpButtonGroup>
  <MpButton variant=&quot;secondary&quot; is-rounded>Import</MpButton>
  <MpButton variant=&quot;primary&quot; left-icon=&quot;add&quot; is-rounded>New contact</MpButton>
</MpButtonGroup>">
      <div class="px-titlebar">
        <span class="px-titlebar__title">Contacts</span>
        <MpButton variant="primary" left-icon="add" is-rounded>New contact</MpButton>
      </div>
      <div class="px-titlebar">
        <span class="px-titlebar__title">Contacts</span>
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded>Import</MpButton>
          <MpButton variant="primary" left-icon="add" is-rounded>New contact</MpButton>
        </MpButtonGroup>
      </div>
    </DemoSection>

    <DemoSection title="Filter-bar icon group"
      desc="The filter bar's tool cluster: GHOST icon-only MpButtons (AI / column settings / export) grouped in one MpButtonGroup, each with an aria-label + MpTooltip. In the real bar these use the .filter-icon-btn class (transparent 36×36). Icons come from the Pixel icon library: airene-brand, table-view-column, download. Hover to see tooltips."
      :rules="['rule/filter-bar-icon-group', 'rule/btn-icon-tooltip', 'rule/icon-pixel-library']"
      code="<MpButtonGroup>
  <MpTooltip label=&quot;Ask Airene&quot;>
    <MpButton variant=&quot;ghost&quot; left-icon=&quot;airene-brand&quot; aria-label=&quot;Ask Airene&quot; is-rounded />
  </MpTooltip>
  <MpTooltip label=&quot;Column settings&quot;>
    <MpButton variant=&quot;ghost&quot; left-icon=&quot;table-view-column&quot; aria-label=&quot;Column settings&quot; is-rounded />
  </MpTooltip>
  <MpTooltip label=&quot;Export&quot;>
    <MpButton variant=&quot;ghost&quot; left-icon=&quot;download&quot; aria-label=&quot;Export&quot; is-rounded />
  </MpTooltip>
</MpButtonGroup>">
      <MpButtonGroup>
        <MpTooltip label="Ask Airene">
          <MpButton variant="ghost" left-icon="airene-brand" aria-label="Ask Airene" is-rounded />
        </MpTooltip>
        <MpTooltip label="Column settings">
          <MpButton variant="ghost" left-icon="table-view-column" aria-label="Column settings" is-rounded />
        </MpTooltip>
        <MpTooltip label="Export">
          <MpButton variant="ghost" left-icon="download" aria-label="Export" is-rounded />
        </MpTooltip>
      </MpButtonGroup>
    </DemoSection>

    <DemoSection title="Split"
      desc="is-split joins a main action with a dropdown trigger. The trigger MUST be an MpPopover — never a bare chevron button."
      :rules="['rule/btn-dropdown-mppopover']"
      code="<MpButtonGroup is-split>
  <MpButton variant=&quot;secondary&quot; is-rounded>Save</MpButton>
  <MpPopover>
    <MpPopoverTrigger>
      <MpButton aria-label=&quot;More&quot; right-icon=&quot;chevrons-down&quot; variant=&quot;secondary&quot; is-rounded />
    </MpPopoverTrigger>
    <MpPopoverContent class=&quot;erp-dropdown-menu&quot;><MpPopoverList>
      <MpPopoverListItem>Save and new</MpPopoverListItem>
      <MpPopoverListItem>Save as draft</MpPopoverListItem>
    </MpPopoverList></MpPopoverContent>
  </MpPopover>
</MpButtonGroup>">
      <MpButtonGroup is-split>
        <MpButton variant="secondary" is-rounded>Save</MpButton>
        <MpPopover id="px-bg-split">
          <MpPopoverTrigger>
            <MpButton aria-label="More" right-icon="chevrons-down" variant="secondary" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu"><MpPopoverList>
            <MpPopoverListItem>Save and new</MpPopoverListItem>
            <MpPopoverListItem>Save as draft</MpPopoverListItem>
          </MpPopoverList></MpPopoverContent>
        </MpPopover>
      </MpButtonGroup>
    </DemoSection>
  </div>
</template>

<style scoped>
.px-titlebar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--mp-border-subtle, #e5e7e7);
  border-radius: var(--mp-radii-md, 8px);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
}
.px-titlebar__title { font-weight: var(--mp-font-weights-semi-bold); }
</style>
