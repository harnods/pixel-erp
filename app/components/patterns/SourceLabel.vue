<script setup lang="ts">
/**
 * SourceLabel — renders an outbound order's `source` string with an icon in
 * front of it: the marketplace's own icon for a Desty marketplace channel
 * ("{Marketplace}: {store name}", e.g. "Shopee: Central Perk"), or the ERP icon
 * for everything else ("Sales Order", "Manual").
 */
import { computed } from 'vue'
import { css } from '@mekari/pixel3'
import erpIcon from '~/assets/images/marketplace/erp.svg?url'
import lazadaIcon from '~/assets/images/marketplace/lazada.svg?url'
import tiktokIcon from '~/assets/images/marketplace/tiktok.svg?url'
import shopeeIcon from '~/assets/images/marketplace/shopee.svg?url'
import blibliIcon from '~/assets/images/marketplace/blibli.svg?url'

const MARKETPLACE_ICONS: Record<string, string> = {
  'Lazada': lazadaIcon,
  'TikTok Shop': tiktokIcon,
  'Shopee': shopeeIcon,
  'Blibli': blibliIcon,
}

const props = defineProps<{ source: string | null | undefined }>()

const marketplaceName = computed(() => (props.source ?? '').split(':')[0]?.trim() ?? '')
const icon = computed(() => MARKETPLACE_ICONS[marketplaceName.value] ?? erpIcon)
const iconAlt = computed(() => MARKETPLACE_ICONS[marketplaceName.value] ? marketplaceName.value : 'ERP')

const labelClass = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1.5',
  minWidth: '0',
  lineHeight: 'lg',
})

const iconClass = css({
  width: '20px',
  height: '20px',
  flexShrink: '0',
  rounded: 'sm',
})

const textClass = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  lineHeight: 'lg',
})
</script>

<template>
  <span :class="labelClass">
    <img :src="icon" :class="iconClass" :alt="iconAlt" />
    <span :class="textClass">{{ source ?? '—' }}</span>
  </span>
</template>
