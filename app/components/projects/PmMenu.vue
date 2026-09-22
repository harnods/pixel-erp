<script setup lang="ts">
/**
 * Options / Actions menu — a Pixel MpPopover (rule/btn-dropdown-mppopover), text-only
 * items (rule/popover-no-icons), 160px min width (rule/btn-dropdown-min-width).
 * An item that isn't allowed stays visible, disabled, with its reason written in the
 * item — the PRD requires refusals to be stated where the button is (Story 20).
 *   • kebab: the row […] trigger — aria-label only, no tooltip (rule/table-actions-no-tooltip).
 *   • default: a secondary "Actions" button with the dropdown chevron.
 */
import { MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'

export interface PmMenuItem {
  label: string
  action?: () => void
  disabledReason?: string
  danger?: boolean
}

withDefaults(defineProps<{ id: string; items: PmMenuItem[]; label?: string; kebab?: boolean }>(), { label: 'Actions', kebab: false })

function run(item: PmMenuItem) {
  if (item.disabledReason) return
  item.action?.()
}
</script>

<template>
  <MpPopover v-if="items.length" :id="id" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
    <MpPopoverTrigger>
      <MpButton v-if="kebab" variant="ghost" is-rounded :aria-label="label"><MpIcon name="menu-kebab" /></MpButton>
      <MpButton v-else variant="secondary" is-rounded right-icon="chevrons-down">{{ label }}</MpButton>
    </MpPopoverTrigger>
    <MpPopoverContent class="erp-dropdown-menu pm-menu-content">
      <MpPopoverList>
        <MpPopoverListItem
          v-for="(item, i) in items" :key="i" :is-disabled="!!item.disabledReason"
          :class="{ 'pm-menu-danger': item.danger && !item.disabledReason }" @click="run(item)"
        >
          <span class="pm-menu-item">
            <span>{{ item.label }}</span>
            <span v-if="item.disabledReason" class="pm-caption">{{ item.disabledReason }}</span>
          </span>
        </MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>
