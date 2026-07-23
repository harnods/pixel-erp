<script setup lang="ts">
/**
 * ColumnSettingsMenu — the "Column settings" toolbar control shared by every table.
 * Renders the icon button + a popover of checkboxes to show/hide columns. The
 * `visibility` map (key → boolean) is mutated in place; disabled items (e.g. the
 * first/identifier column) can't be toggled off.
 */
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpCheckbox, css } from '@mekari/pixel3'

export interface ColumnSettingItem { key: string; label: string; disabled?: boolean }

// `tooltip` must always be a string: Pixel's v-tooltip directive reads `value.label`
// in its mounted hook and throws on `undefined` (crashes the whole page). Default it
// so every table's gear button is safe even when a page doesn't pass one.
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
      <button v-tooltip="tooltip" class="cs-trigger" aria-label="Column settings" type="button">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M6.97345 1.26335C7.1777 1.25434 7.38659 1.25 7.6 1.25H12.4C12.6134 1.25 12.8223 1.25434 13.0265 1.26335C13.0315 1.26352 13.0365 1.26374 13.0415 1.26401C14.8152 1.34425 16.2378 1.77715 17.2303 2.76967C18.3398 3.87914 18.75 5.52603 18.75 7.6V12.4C18.75 14.474 18.3398 16.1209 17.2303 17.2303C16.2378 18.2229 14.8152 18.6558 13.0415 18.736C13.0365 18.7363 13.0316 18.7365 13.0266 18.7367C12.8223 18.7457 12.6134 18.75 12.4 18.75H7.6C7.38658 18.75 7.17769 18.7457 6.97344 18.7367C6.96845 18.7365 6.96347 18.7363 6.95851 18.736C5.1848 18.6557 3.76219 18.2228 2.76967 17.2303C1.6602 16.1209 1.25 14.474 1.25 12.4V7.6C1.25 5.52603 1.6602 3.87914 2.76967 2.76967C3.76219 1.77715 5.18479 1.34425 6.9585 1.26401C6.96347 1.26374 6.96845 1.26352 6.97345 1.26335ZM6.25 2.82736C5.10607 2.97282 4.34147 3.31919 3.83033 3.83033C3.1398 4.52086 2.75 5.67397 2.75 7.6V12.4C2.75 14.326 3.1398 15.4791 3.83033 16.1697C4.34147 16.6808 5.10607 17.0272 6.25 17.1726V2.82736ZM7.75 17.25V2.75H12.25V17.25H7.75ZM13.75 17.1726C14.8939 17.0272 15.6585 16.6808 16.1697 16.1697C16.8602 15.4791 17.25 14.326 17.25 12.4V7.6C17.25 5.67397 16.8602 4.52086 16.1697 3.83033C15.6585 3.31919 14.8939 2.97282 13.75 2.82736V17.1726Z" fill="currentColor"/>
        </svg>
      </button>
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
.cs-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  border: none;
  background: none;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-secondary);
  padding: var(--mp-spacing-2);
}
.cs-trigger:hover { background: var(--mp-background-neutral-hovered); }
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
