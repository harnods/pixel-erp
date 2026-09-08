<script setup lang="ts">
/**
 * ColumnSettingsMenu — the "Column settings" toolbar control shared by every table.
 * Renders the icon button + a popover of checkboxes to show/hide columns. The
 * `visibility` map (key → boolean) is mutated in place; disabled items (e.g. the
 * first/identifier column) can't be toggled off.
 */
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpButton, MpCheckbox, css } from '@mekari/pixel3'

export interface ColumnSettingItem { key: string; label: string; disabled?: boolean }

// `tooltip` must always be a string — fed to Pixel's v-tooltip directive as
// { label, placement: 'bottom' } so the hint sits BELOW the gear icon, consistent
// with the sibling toolbar icons (Export, Ask Airene). The directive reads
// value.label / value.placement; a bare undefined would crash its mounted hook,
// so default it. The button stays MpPopoverTrigger's direct child (wrapping it in
// MpTooltip breaks the popover trigger).
const props = withDefaults(defineProps<{
  id: string
  items: ColumnSettingItem[]
  visibility: Record<string, boolean>
  tooltip?: string
}>(), { tooltip: 'Column settings' })

function toggle(item: ColumnSettingItem) {
  if (item.disabled) return
  props.visibility[item.key] = !props.visibility[item.key]
}
</script>

<template>
  <MpPopover :id="id" placement="bottom-end" use-portal :is-keep-alive="false">
    <MpPopoverTrigger>
      <!-- Identical to the sibling filter-bar tools (Airene / Export): a rounded
           ghost icon MpButton, so hover is the same oval pill (rule/filter-bar-icon-group).
           v-tooltip (not <MpTooltip>) keeps the button MpPopoverTrigger's direct child. -->
      <MpButton
        v-tooltip="{ label: tooltip, placement: 'bottom' }"
        variant="ghost"
        left-icon="table-view-column"
        is-rounded
        :aria-label="tooltip"
      />
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', maxHeight: '320px', overflowY: 'auto', padding: '0' })">
      <ul class="cs-list">
        <li
          v-for="item in items"
          :key="item.key"
          class="cs-item"
          :class="{ 'cs-item--disabled': item.disabled }"
          @click="toggle(item)"
        >
          <span @click.stop>
            <MpCheckbox
              :id="`${id}-${item.key}`"
              :is-checked="visibility[item.key]"
              :is-disabled="item.disabled"
              @change="() => toggle(item)"
            />
          </span>
          <span class="cs-label">{{ item.label }}</span>
        </li>
      </ul>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.cs-list { list-style: none; margin: 0; padding: var(--mp-spacing-1) 0; }
.cs-item {
  display: flex;
  align-items: center;
  /* No gap here — MpCheckbox already renders its own 12px control-to-label gap
     internally (checkbox__root). A wrapper gap would stack into a double gap. */
  gap: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  cursor: pointer;
  user-select: none;
}
.cs-item:hover { background: var(--mp-background-neutral-hovered); }
.cs-item--disabled { cursor: default; opacity: 0.5; }
.cs-item--disabled:hover { background: none; }
.cs-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
</style>
