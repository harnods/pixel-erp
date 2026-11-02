<script setup lang="ts">
/**
 * PrintShareMenu — the shared "Print & share" secondary dropdown used on every
 * transaction detail page: Print PDF · Print dot matrix · Share via WhatsApp ·
 * Share via email · Copy link. Use this instead of hand-rolling the MpPopover +
 * items per page (they were byte-for-byte identical across the detail pages).
 *
 *   <PrintShareMenu id="cma-print" />
 *
 * Each item emits a named event for pages that wire a real action; unwired items
 * stay as inert placeholders (the current prototype behaviour). `placement`
 * defaults to top-end to sit above a footer action bar.
 */
import {
  MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'

withDefaults(defineProps<{ id: string; placement?: string }>(), { placement: 'top-end' })
const emit = defineEmits<{
  'print-pdf': []; 'print-dot-matrix': []; whatsapp: []; email: []; 'copy-link': []
}>()
const { t } = useLocale()
</script>

<template>
  <MpPopover :id="id" is-close-on-select use-portal :is-keep-alive="false" :placement="placement">
    <MpPopoverTrigger>
      <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Print & share') }}</MpButton>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
      <MpPopoverList>
        <MpPopoverListItem @click="emit('print-pdf')">{{ t('Print PDF') }}</MpPopoverListItem>
        <MpPopoverListItem @click="emit('print-dot-matrix')">{{ t('Print dot matrix') }}</MpPopoverListItem>
      </MpPopoverList>
      <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
      <MpPopoverList>
        <MpPopoverListItem @click="emit('whatsapp')">{{ t('Share via WhatsApp') }}</MpPopoverListItem>
        <MpPopoverListItem @click="emit('email')">{{ t('Share via email') }}</MpPopoverListItem>
        <MpPopoverListItem @click="emit('copy-link')">{{ t('Copy link') }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>
