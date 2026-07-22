<script setup lang="ts">
import { MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import { actionItems } from '~/data/actionItems'
</script>

<template>
  <div class="ar-list">
    <div class="ar-header">
      <span class="ar-header-menu">Menu</span>
      <span class="ar-header-details">Details</span>
      <span class="ar-header-kebab" aria-hidden="true"></span>
    </div>

    <div v-for="item in actionItems" :key="item.id" class="ar-row">
      <div class="ar-row-icon">
        <MpIcon :name="item.icon" size="md" />
      </div>

      <span class="ar-row-title">{{ item.title }}</span>

      <div class="ar-row-stat">
        <span class="ar-row-desc">{{ item.description }}</span>
        <span v-if="item.amountText" class="ar-row-amount">{{ item.amountText }}</span>
      </div>

      <MpPopover :id="`ar-row-actions-${item.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="ar-row-kebab" aria-label="More actions" @click.stop>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>View details</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </div>
  </div>
</template>

<style scoped>
.ar-list {
  display: flex;
  flex-direction: column;
}

/* Same header treatment as ErpTablePage's .erp-th (surface bg, 28px, uppercase
   semibold) — columns mirror the row layout: icon spacer, Menu (icon+title),
   Details (right-aligned stat), kebab spacer. */
.ar-header {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
  height: var(--mp-sizes-7, 28px);
  padding: 0 var(--mp-spacing-4);
  background: var(--mp-background-surface, #f1f5f9);
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}

.ar-header-menu,
.ar-header-details {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  text-transform: uppercase;
}

.ar-header-menu { flex-shrink: 0; }
.ar-header-details { flex: 1; text-align: right; }
.ar-header-kebab { width: 28px; flex-shrink: 0; }

.ar-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.ar-row:hover { background: var(--mp-background-neutral-hovered); }

.ar-row-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-10, 40px);
  height: var(--mp-sizes-10, 40px);
  flex-shrink: 0;
  background: var(--mp-background-neutral-subtle);
  border-radius: var(--mp-radii-md);
  color: var(--mp-text-subtle);
}

.ar-row-title {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  flex-shrink: 0;
}

.ar-row-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--mp-spacing-0\.5);
  flex: 1;
  min-width: 0;
  text-align: right;
}

.ar-row-desc {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.ar-row-amount {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-danger, #a8352d);
}

.ar-row-kebab {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: var(--mp-spacing-1);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-subtle);
}
.ar-row-kebab:hover { background: var(--mp-background-neutral-hovered); }
</style>
