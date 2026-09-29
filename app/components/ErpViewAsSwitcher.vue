<template>
  <!--
    "View as": simulated roles for the fixed-asset prototype. There is no real
    sign-in, so this switches the audience the asset screens are drawn for:
    General Affairs sees the physical pane only (LR-6), and the Approver is a
    different person from whoever raised a request. Session only.
    Structure copied from ErpWarehouseSwitcher: a trigger on the dark header
    and a portalled list whose root box is global.
  -->
  <MpPopover
    id="view-as-switcher"
    placement="bottom-end"
    use-portal
    is-close-on-blur
    is-close-on-escape
    v-slot="{ onClosePopover }"
  >
    <MpPopoverTrigger>
      <button type="button" class="va-trigger" :aria-label="t('View as')">
        <span class="va-label">
          <span class="va-caption">{{ t('View as') }}</span>
          <span class="va-role">{{ t(viewAs) }}</span>
        </span>
        <MpIcon name="chevrons-down" size="sm" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent class="va-menu" is-unstyled>
      <p class="va-heading">{{ t('View the asset module as') }}</p>
      <nav class="va-list">
        <button
          v-for="r in VIEW_AS_ROLES"
          :key="r.role"
          type="button"
          class="va-item"
          @click="select(r.role, onClosePopover)"
        >
          <span class="va-item-label">
            <span class="va-item-name">{{ t(r.role) }}</span>
            <span class="va-item-sub">{{ r.person }} · {{ t(r.title) }}</span>
          </span>
          <MpIcon v-if="r.role === viewAs" name="check" size="md" color="icon.brand" />
        </button>
      </nav>
      <p class="va-foot">{{ t('Simulated for this prototype. Nothing is signed in.') }}</p>
    </MpPopoverContent>
  </MpPopover>
</template>

<script setup lang="ts">
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon } from '@mekari/pixel3'
import { viewAs, setViewAs, VIEW_AS_ROLES, type ViewAsRole } from '~/data/assetStore'

const { t } = useLocale()

function select(role: ViewAsRole, closePopover: () => void) {
  setViewAs(role)
  closePopover()
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

:global(.mp-popover.va-menu) {
  z-index: var(--mp-z-indices-popover, 1600);
  min-width: 264px;
  padding: 0 0 var(--mp-spacing-2);
  background: var(--mp-colors-background-stage, #fff);
  border: var(--mp-border-width-sm, 1px) solid var(--mp-colors-border-default, #e3e7e9);
  border-radius: var(--mp-radii-md, 6px);
  overflow: hidden;
}
.va-heading {
  margin: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-colors-text-secondary);
}
.va-list { display: flex; flex-direction: column; }
.va-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
}
.va-item:hover { background: var(--mp-colors-background-neutral-hovered); }
.va-item-label { display: flex; flex-direction: column; }
.va-item-name { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); }
.va-item-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.va-foot {
  margin: var(--mp-spacing-1) 0 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-4) 0;
  border-top: 1px solid var(--mp-colors-border-default);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-colors-text-secondary);
}
</style>
