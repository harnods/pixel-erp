<script setup lang="ts">
/**
 * DetailActionsMenu — the shared "Actions" dropdown used on transaction detail
 * pages. Each page passes its own set of menu items grouped by dividers.
 *
 * Usage:
 *
 *   <DetailActionsMenu
 *     id="so-actions"
 *     :groups="[
 *       [
 *         { label: 'Preview', onClick: openPreview },
 *         { label: 'Create production request', onClick: handleCreate },
 *         { label: 'Mark as completed', onClick: () => markCompleteOpen = true, show: canMarkCompleted },
 *       ],
 *       [
 *         { label: 'Edit', onClick: edit },
 *         { label: 'Set as recurring' },
 *         { label: 'Duplicate', onClick: duplicate },
 *         { label: 'Void' },
 *         { label: 'Delete', onClick: () => deleteOpen = true, destructive: true },
 *       ],
 *     ]"
 *   />
 *
 * Groups are rendered as separate MpPopoverList blocks with a 1px divider between
 * them (rule/btn-dropdown-mppopover). Items with `show: false` are hidden; items
 * with `disabled: true` render as inert + optional tooltip. Items with
 * `destructive: true` render in the danger color.
 *
 * The trigger button is primary by default (rule/btn-one-primary — assumes this is
 * THE primary action on the footer). Pass `variant="secondary"` when the page has a
 * separate primary button (e.g. a split-button "Add payment").
 */
import {
  MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpTooltip, css,
} from '@mekari/pixel3'

export interface ActionItem {
  label: string
  onClick?: () => void
  /** Hide the item entirely when false (default true). */
  show?: boolean
  /** Render as disabled — pair with `tooltip` to explain why. */
  disabled?: boolean
  /** Shown on hover when the item is disabled. */
  tooltip?: string
  /** Render in danger color (for Delete, Void, Cancel, etc.). */
  destructive?: boolean
}

const props = withDefaults(defineProps<{
  id: string
  /** Array of item groups — each group is an array of ActionItem. A divider is
   *  rendered between consecutive groups that have at least one visible item. */
  groups: ActionItem[][]
  placement?: string
  variant?: 'primary' | 'secondary'
  /** Override the trigger button label (default "Actions"). */
  label?: string
}>(), {
  placement: 'top-end',
  variant: 'primary',
  label: 'Actions',
})

const { t } = useLocale()

function visibleItems(group: ActionItem[]): ActionItem[] {
  return group.filter((item) => item.show !== false)
}

function visibleGroups(): ActionItem[][] {
  return props.groups.map(visibleItems).filter((g) => g.length > 0)
}
</script>

<template>
  <MpPopover :id="id" is-close-on-select use-portal :is-keep-alive="false" :placement="placement">
    <MpPopoverTrigger>
      <MpButton :variant="variant" is-rounded right-icon="chevrons-down">{{ t(label) }}</MpButton>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
      <template v-for="(group, gi) in visibleGroups()" :key="gi">
        <!-- Divider between groups (not before the first) -->
        <div
          v-if="gi > 0"
          :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })"
        />
        <MpPopoverList>
          <template v-for="item in group" :key="item.label">
            <!-- Disabled + tooltip -->
            <MpTooltip
              v-if="item.disabled && item.tooltip"
              :id="`${id}-${item.label}-tt`"
              :label="t(item.tooltip)"
              placement="top"
              use-portal
            >
              <span :class="css({ display: 'block', width: '100%' })">
                <MpPopoverListItem is-disabled>{{ t(item.label) }}</MpPopoverListItem>
              </span>
            </MpTooltip>
            <!-- Disabled without tooltip -->
            <MpPopoverListItem v-else-if="item.disabled" is-disabled>{{ t(item.label) }}</MpPopoverListItem>
            <!-- Destructive item -->
            <MpPopoverListItem
              v-else-if="item.destructive"
              :class="css({ color: 'var(--mp-colors-text-danger, #c53030)' })"
              @click="item.onClick?.()"
            >{{ t(item.label) }}</MpPopoverListItem>
            <!-- Normal item -->
            <MpPopoverListItem v-else @click="item.onClick?.()">{{ t(item.label) }}</MpPopoverListItem>
          </template>
        </MpPopoverList>
      </template>
    </MpPopoverContent>
  </MpPopover>
</template>
