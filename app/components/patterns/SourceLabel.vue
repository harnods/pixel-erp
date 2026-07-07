<script setup lang="ts">
/**
 * SourceLabel — renders an outbound order's `source` string with the marketplace's
 * icon in front of it when the source is a Desty marketplace channel
 * ("{Marketplace}: {store name}", e.g. "Shopee: Central Perk"). Plain ERP sources
 * ("Sales Order", "Manual") and marketplaces without an icon render as text only.
 */
import { computed } from 'vue'
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
const icon = computed(() => MARKETPLACE_ICONS[marketplaceName.value])
</script>

<template>
  <span class="source-label">
    <img v-if="icon" :src="icon" class="source-label-icon" :alt="marketplaceName" />
    <span class="source-label-text">{{ source ?? '—' }}</span>
  </span>
</template>

<style scoped>
.source-label { display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5, 6px); min-width: 0; }
.source-label-icon { width: 20px; height: 20px; flex-shrink: 0; border-radius: var(--mp-radii-sm, 4px); }
.source-label-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
