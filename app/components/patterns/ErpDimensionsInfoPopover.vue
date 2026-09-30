<!--
  ErpDimensionsInfoPopover — the small info icon next to the "Dimensions"
  column header label on line-items tables (Sales/Purchases/Expenses create
  pages). Replaces a plain MpTooltip: the tooltip could only ever hold one
  short line, but this needs a full explanation + a way out to Settings >
  Dimensions, so it's a click-to-open popover instead (hover still shows the
  old short label via v-tooltip, same as ApprovalLogPopover's trigger).

  Self-contained: renders its own trigger + popover (own `open` state) rather
  than taking a slot — MpPopoverTrigger clones its direct slot child to wire
  the floating-ui anchor ref, and a forwarded <slot> resolves to a Fragment
  instead of the actual element, silently breaking that anchor (see
  feedback_erp_approval_comment_icon_pattern).

  "Dimensions settings" opens Settings > Dimensions (`/dimensions`) in a NEW
  tab — same window.open(..., '_blank', 'noopener') pattern already used for
  other "hop out to a different part of the app" links (e.g.
  CannotCreateTaxDocumentDrawer.vue), since this is opened mid-transaction-form
  and shouldn't navigate the current tab away from unsaved work.
-->
<script setup lang="ts">
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpButton, MpIcon, css } from '@mekari/pixel3'

defineProps<{ id: string }>()

const { t } = useLocale()

const open = ref(false)

function goToSettings() {
  open.value = false
  window.open('/dimensions', '_blank', 'noopener')
}
</script>

<template>
  <MpPopover :id="id" is-manual :is-open="open" use-portal :is-keep-alive="false" placement="bottom-start" @open="open = true" @close="open = false">
    <MpPopoverTrigger>
      <MpButton
        v-tooltip="{ label: t('Values may be restricted to specific users.'), placement: 'top' }"
        type="button" class="edip-trigger" :aria-label="t('Dimensions')"
        @click.stop="open = !open"
      >
        <MpIcon name="security" size="sm" />
      </MpButton>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ width: '360px', padding: '0', overflow: 'hidden' })" @blur="open = false" @escape="open = false">
      <div class="edip-body">
        <div class="edip-top">
          <h3 class="edip-title">{{ t('Dimensions') }}</h3>
          <MpButton class="edip-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="open = false">
            <MpIcon name="close" size="md" />
          </MpButton>
        </div>
        <p class="edip-desc">
          {{ t('This information will not appear on your printed invoices and is only visible to you and your team. To manage dimensions, go to Dimensions in Settings.') }}
        </p>
        <div class="edip-actions">
          <MpButton type="button" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after" @click="goToSettings">
            {{ t('Dimensions settings') }}
            <MpIcon name="newtab" size="sm" />
          </MpButton>
        </div>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.edip-trigger {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-default);
}

.edip-body { padding: var(--mp-spacing-6, 24px); }
.edip-top { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.edip-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-bold); color: var(--mp-text-default); }
.edip-close { flex-shrink: 0; color: var(--mp-icon-default); }

.edip-desc { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 1.5); color: var(--mp-text-secondary); }

.edip-actions { display: flex; justify-content: flex-end; margin-top: var(--mp-spacing-5, 20px); }
</style>
