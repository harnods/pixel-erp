<template>
  <!--
    "View as" for the payroll screens: there is no real sign-in, so this picks
    who is acting (Owner, Ultimate, Ultimate + LM, Accountant, Accountant + LM,
    View only). Same markup as BudgetViewAsSwitcher; its state lives in payrollStore.
  -->
  <MpPopover
    id="payroll-view-as-switcher"
    placement="bottom-end"
    use-portal
    is-close-on-blur
    is-close-on-escape
    v-slot="{ onClosePopover }"
  >
    <MpPopoverTrigger>
      <button type="button" class="va-trigger" data-tour="payroll-view-as" :aria-label="t('View as')">
        <span class="va-label">
          <span class="va-caption">{{ t('View as') }}</span>
          <span class="va-role">{{ t(payroll.viewAs) }}</span>
        </span>
        <MpIcon name="chevrons-down" size="sm" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent class="va-menu" is-unstyled>
      <p class="va-heading">{{ t('View payroll as') }}</p>
      <nav class="va-list">
        <button
          v-for="p in PAYROLL_PEOPLE"
          :key="p.role"
          type="button"
          class="va-item"
          @click="select(p.role, onClosePopover)"
        >
          <span class="va-item-label">
            <span class="va-item-name">{{ t(p.role) }}</span>
            <span class="va-item-sub">{{ p.person }} · {{ t(p.title) }}</span>
          </span>
          <MpIcon v-if="p.role === payroll.viewAs" name="check" size="md" color="icon.brand" />
        </button>
      </nav>
      <button type="button" class="va-item va-reset" @click="reset(onClosePopover)">
        <span class="va-item-name">{{ t('Reset sample data') }}</span>
      </button>
    </MpPopoverContent>
  </MpPopover>
</template>

<script setup lang="ts">
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon } from '@mekari/pixel3'
import { payroll, setPayrollViewAs, resetPayroll } from '~/data/payrollStore'
import { PAYROLL_PEOPLE, type PayrollRole } from '~/data/payrollMaster'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()

function select(role: PayrollRole, closePopover: () => void) {
  setPayrollViewAs(role)
  closePopover()
}
function reset(closePopover: () => void) {
  resetPayroll()
  closePopover()
  successToast(t('Payroll sample data restored'))
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
.va-reset { border-top: 1px solid var(--mp-colors-border-default); margin-top: var(--mp-spacing-1); padding-top: var(--mp-spacing-3); }
.va-reset .va-item-name { color: var(--mp-colors-text-link, #165082); }
.va-foot {
  margin: var(--mp-spacing-1) 0 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-4) 0;
  border-top: 1px solid var(--mp-colors-border-default);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-colors-text-secondary);
}
</style>
