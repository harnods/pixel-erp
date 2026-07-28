<script setup lang="ts">
/**
 * DjpCodePopover — replaces the old plain-text tooltip on the Products index
 * DJP code column (Figma node 8554-241863). Triggered by the "View details"
 * link that DjpCodeCell shows once the label overflows its 2-line clamp;
 * shows the product name as a title plus the full, untruncated DJP code +
 * description text. Self-contained trigger + popover, same shape as
 * ApprovalCommentPopover/ApprovalLogPopover.
 */
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, css } from '@mekari/pixel3'

defineProps<{
  id: string
  title: string
  description: string
}>()

const open = ref(false)
</script>

<template>
  <MpPopover
    :id="id"
    is-manual
    :is-open="open"
    use-portal
    :is-keep-alive="false"
    placement="bottom-start"
    @open="open = true"
    @close="open = false"
  >
    <MpPopoverTrigger>
      <a href="#" class="djp-view-details" @click.stop.prevent="open = !open">View details</a>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ width: '360px', padding: '0', position: 'relative' })" @blur="open = false" @escape="open = false">
      <button type="button" class="djp-popover-close" aria-label="Close" @click.stop="open = false">
        <MpIcon name="close" size="sm" />
      </button>
      <div class="djp-popover-content">
        <p class="djp-popover-title">{{ title }}</p>
        <p class="djp-popover-desc">{{ description }}</p>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.djp-view-details {
  display: inline-block;
  margin-top: var(--mp-spacing-0\.5, 2px);
  color: var(--mp-text-link);
  font-size: var(--mp-font-sizes-sm);
  line-height: 1;
  cursor: pointer;
}
.djp-view-details:hover { text-decoration: underline; text-underline-offset: 2px; }

.djp-popover-close {
  position: absolute;
  top: var(--mp-spacing-2, 8px);
  right: var(--mp-spacing-2, 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--mp-icon-secondary, #6e7a7c);
  cursor: pointer;
}
.djp-popover-close:hover { color: var(--mp-icon-default, #1d1f24); }

/* Figma: p-xl (24px) padding, gap-xs (8px) between title and description ── */
.djp-popover-content {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2, 8px);
  padding: var(--mp-spacing-6, 24px);
}

.djp-popover-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  line-height: 32px;
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.djp-popover-desc {
  margin: 0;
  padding: var(--mp-spacing-2, 8px) 0;
  font-size: var(--mp-font-sizes-md);
  line-height: 20px;
  color: var(--mp-text-default);
  white-space: normal;
}
</style>
