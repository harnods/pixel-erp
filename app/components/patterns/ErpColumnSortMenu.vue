<script setup lang="ts">
/**
 * ErpColumnSortMenu — the ERP column-header sort affordance (hover icon → popover)
 * extracted verbatim from ErpTablePage so hand-built custom tables (e.g. the
 * Receiving index) get the exact same sort menu without adopting ErpTablePage.
 *
 * Behaviour (matches ErpTablePage):
 *   • Icon is hidden until the header is hovered (parent styles the reveal via
 *     `:deep(.erp-sort-btn)`) and stays visible while its column is the active sort.
 *   • Options depend on sortType: text = A–Z / Z–A, number = Low→High / High→Low,
 *     date = Oldest / Newest first. Plus "Hide column".
 *   • Clicking the already-active direction clears the sort (emits key '').
 */
import {
  MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'

const props = defineProps<{
  colKey: string
  sortType: 'text' | 'number' | 'date'
  sortKey: string
  sortDir: 'asc' | 'desc'
}>()

const emit = defineEmits<{
  sortChange: [key: string, dir: 'asc' | 'desc']
  hideColumn: [key: string]
}>()

// Picking the already-active direction clears the sort (back to default order);
// otherwise apply the chosen direction. Empty key = unsorted.
function onSortOpt(dir: 'asc' | 'desc') {
  if (props.sortKey === props.colKey && props.sortDir === dir) emit('sortChange', '', 'asc')
  else emit('sortChange', props.colKey, dir)
}
</script>

<template>
  <MpPopover
    :id="`erp-sort-${colKey}`"
    is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start"
  >
    <MpPopoverTrigger>
      <button
        class="erp-sort-btn"
        :class="{ 'erp-sort-btn--active': sortKey === colKey }"
        aria-label="Sort column" @click.stop
      >
        <MpIcon name="sort-default" size="16px" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '184px', width: 'max-content', whiteSpace: 'nowrap' })">
      <MpPopoverList>
        <template v-if="sortType === 'number'">
          <MpPopoverListItem @click="onSortOpt('asc')"><span class="erp-sort-opt"><MpIcon name="arrows-up" size="sm" />Low to high<MpTooltip v-if="sortKey === colKey && sortDir === 'asc'" :id="`erp-sort-reset-${colKey}-a`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
          <MpPopoverListItem @click="onSortOpt('desc')"><span class="erp-sort-opt"><MpIcon name="arrows-down" size="sm" />High to low<MpTooltip v-if="sortKey === colKey && sortDir === 'desc'" :id="`erp-sort-reset-${colKey}-d`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
        </template>
        <template v-else-if="sortType === 'date'">
          <MpPopoverListItem @click="onSortOpt('asc')"><span class="erp-sort-opt"><MpIcon name="arrows-up" size="sm" />Oldest first<MpTooltip v-if="sortKey === colKey && sortDir === 'asc'" :id="`erp-sort-reset-${colKey}-a`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
          <MpPopoverListItem @click="onSortOpt('desc')"><span class="erp-sort-opt"><MpIcon name="arrows-down" size="sm" />Newest first<MpTooltip v-if="sortKey === colKey && sortDir === 'desc'" :id="`erp-sort-reset-${colKey}-d`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
        </template>
        <template v-else>
          <MpPopoverListItem @click="onSortOpt('asc')"><span class="erp-sort-opt"><MpIcon name="arrows-up" size="sm" />A - Z<MpTooltip v-if="sortKey === colKey && sortDir === 'asc'" :id="`erp-sort-reset-${colKey}-a`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
          <MpPopoverListItem @click="onSortOpt('desc')"><span class="erp-sort-opt"><MpIcon name="arrows-down" size="sm" />Z - A<MpTooltip v-if="sortKey === colKey && sortDir === 'desc'" :id="`erp-sort-reset-${colKey}-d`" label="Click to reset sort" placement="top" use-portal class="erp-sort-check-tt"><MpIcon name="check" size="sm" class="erp-sort-check" /></MpTooltip></span></MpPopoverListItem>
        </template>
        <div class="erp-sort-divider" />
        <MpPopoverListItem @click="emit('hideColumn', colKey)"><span class="erp-sort-opt"><MpIcon name="hide" size="sm" />Hide column</span></MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* icon button revealed on header hover (parent :deep) ; stays visible while active */
.erp-sort-btn {
  display: inline-flex; align-items: center; justify-content: center;
  /* Must fit inside the 28px header row (28 - 2×4px padding - 1px border ≈ 19px). */
  width: 18px; height: 18px; flex-shrink: 0;
  border: none; background: none; cursor: pointer; border-radius: var(--mp-radii-sm);
  color: var(--mp-icon-default, var(--mp-text-secondary));
  visibility: hidden;
}
.erp-sort-btn--active { visibility: visible; color: var(--mp-text-selected, var(--mp-text-default)); }
.erp-sort-btn:hover { background: var(--mp-background-neutral-hovered); }
/* popover option row: icon + label */
.erp-sort-opt { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); text-transform: none; width: 100%; }
.erp-sort-check-tt { margin-left: auto; display: inline-flex; }
.erp-sort-check { color: var(--mp-text-selected); }
.erp-sort-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }
</style>
