<template>
  <!--
    "View as" for the sales delivery screens (prototype-only demo control). There is no
    real sign-in, so this picks who is acting: the sales admin who enters deliveries, or
    the finance manager who may release a Percentage lock (percentage-based delivery,
    R-16). Same header pattern as ProjectViewAsSwitcher.
  -->
  <MpPopover
    id="sales-delivery-view-as-switcher"
    placement="bottom-end"
    use-portal
    is-close-on-blur
    is-close-on-escape
    is-close-on-select
    :is-keep-alive="false"
  >
    <MpPopoverTrigger>
      <button type="button" class="va-trigger" data-tour="sales-delivery-view-as" :aria-label="t('View as')">
        <span class="va-label">
          <span class="va-caption">{{ t('View as') }}</span>
          <span class="va-role">{{ currentUser.name }}</span>
        </span>
        <MpIcon name="chevrons-down" size="sm" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent class="erp-dropdown-menu va-menu">
      <p class="va-heading">{{ t('View sales deliveries as') }}</p>
      <p class="va-hint">{{ t('The sales admin enters deliveries. The finance manager can release a locked input method.') }}</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="k in KEYS"
          :key="k"
          class="va-item"
          :is-active="k === viewAs"
          @click="setViewAs(k)"
        >
          <span class="va-item-label">
            <span class="va-item-name">{{ SALES_DELIVERY_VIEW_AS_USERS[k].name }}</span>
            <span class="va-item-sub">{{ t(SALES_DELIVERY_VIEW_AS_USERS[k].role) }}</span>
          </span>
          <MpIcon v-if="k === viewAs" name="check" size="md" color="icon.brand" />
        </MpPopoverListItem>
      </MpPopoverList>
      <div class="va-divider" />
      <MpPopoverList>
        <MpPopoverListItem class="va-item va-reset" @click="reset">{{ t('Reset sample data') }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<script setup lang="ts">
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpIcon } from '@mekari/pixel3'
import { SALES_DELIVERY_VIEW_AS_USERS, useSalesDeliveryViewAs, type SalesDeliveryViewAs } from '~/composables/useSalesDeliveryViewAs'
import { resetInputBasisReleases } from '~/data/salesDeliveries'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const { viewAs, setViewAs, currentUser } = useSalesDeliveryViewAs()
const KEYS = Object.keys(SALES_DELIVERY_VIEW_AS_USERS) as SalesDeliveryViewAs[]

// Releases are one way, so a demo needs a way back: this clears them, and every
// seeded Percentage lock returns.
function reset() {
  resetInputBasisReleases()
  successToast(t('Sample data reset'))
}
</script>

<style scoped>
.va-trigger {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  height: var(--mp-spacing-12, 48px);
  padding: 0 var(--mp-spacing-2);
  background: transparent;
  border: 0;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-colors-text-inverse, #fff);
}
.va-trigger:hover {
  background: var(--mp-colors-background-header-menu-hovered, rgba(255, 255, 255, 0.08));
}
.va-label { display: flex; flex-direction: column; align-items: flex-start; }
.va-caption {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-colors-text-inverse, #fff);
  opacity: 0.7;
  white-space: nowrap;
}
.va-role {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-inverse, #fff);
  white-space: nowrap;
}

.va-heading {
  margin: 0;
  padding: var(--mp-spacing-1) var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-secondary, #3a4749);
}
.va-hint {
  margin: 0;
  padding: 0 var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-colors-text-secondary, #3a4749);
  white-space: nowrap;
}
.va-item-label { display: flex; flex-direction: column; }
.va-item-name { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #080d0e); }
.va-item-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #3a4749); }
.va-divider {
  height: var(--mp-sizes-0\.25, 1px);
  margin: var(--mp-spacing-1) 0;
  background-color: var(--mp-colors-border-default, #e3e7e9);
}
</style>
