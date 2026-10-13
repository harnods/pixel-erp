<template>
  <!--
    "View as" for the payroll screens (prototype-only demo control): there is no real
    sign-in, so this picks the access type: Owner or LM (can post) or Accountant/Ultimate (saves
    drafts only). Its state lives in payrollStore.
    The trigger stays a native button element: it is a two-line label on the dark header bar,
    which no MpButton variant draws (the header's other triggers, IconButton, ErpQuickCreateMenu,
    ErpViewAsSwitcher, are native too). The menu itself is Pixel (MpPopoverList / MpPopoverListItem).
  -->
  <MpPopover
    id="payroll-view-as-switcher"
    placement="bottom-end"
    use-portal
    is-close-on-blur
    is-close-on-escape
    is-close-on-select
    :is-keep-alive="false"
  >
    <MpPopoverTrigger>
      <button type="button" class="va-trigger" data-tour="payroll-viewas" :aria-label="t('View as')">
        <span class="va-label" data-tour="payroll-view-as">
          <span class="va-caption">{{ t('View as') }}</span>
          <span class="va-role">{{ t(payroll.viewAs) }}</span>
        </span>
        <MpIcon name="chevrons-down" size="sm" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent class="erp-dropdown-menu va-menu">
      <p class="va-heading">{{ t('View payroll as') }}</p>
      <p class="va-hint">{{ t('Only the Owner or a user with LM can post. Others save drafts.') }}</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="p in PAYROLL_PEOPLE"
          :key="p.role"
          class="va-item"
          :is-active="p.role === payroll.viewAs"
          @click="setPayrollViewAs(p.role)"
        >
          <span class="va-item-label">
            <span class="va-item-name">{{ t(p.role) }}</span>
            <span class="va-item-sub">{{ t(p.title) }}</span>
          </span>
          <!-- Trailing selected check (not a leading icon; see rule/popover-no-icons). -->
          <MpIcon v-if="p.role === payroll.viewAs" name="check" size="md" color="icon.brand" />
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
import { payroll, setPayrollViewAs, resetPayroll } from '~/data/payrollStore'
import { PAYROLL_PEOPLE } from '~/data/payrollMaster'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()

function reset() {
  resetPayroll()
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
