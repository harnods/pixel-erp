<script setup lang="ts">
/**
 * Payroll claims (OD-26): claims paid through payroll, by posted run. Loans (OD-27), exit pay
 * (OD-28) and transfer cost split (OD-31) are Next and toast "Not in this prototype".
 */
import {
  MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import PayrollClaimsSummary from '~/components/payroll/PayrollClaimsSummary.vue'
import { infoToast } from '~/utils/toasts'

const { t } = useLocale()
const NEXT = ['Employee loans', 'Exit pay routing', 'Transfer cost split']
</script>

<template>
  <div class="pcl">
    <div class="pcl-bar">
      <MpPopover id="pcl-more" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('More') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem v-for="n in NEXT" :key="n" @click="infoToast(t('Not in this prototype'))">{{ t(n) }}</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">{{ t('Export') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </div>
    <PayrollClaimsSummary />
  </div>
</template>

<style scoped>
.pcl { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pcl-bar { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); }
</style>
