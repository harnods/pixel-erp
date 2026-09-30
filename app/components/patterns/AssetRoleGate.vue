<script setup lang="ts">
/**
 * AssetRoleGate (LR-6, FG-4.6): the asset module's report pages carry
 * accounting and tax figures, and General Affairs maintains the physical pane
 * without seeing them. For that role the page is replaced by a short
 * restricted state pointing at where the physical record is kept; every other
 * role (Owner, Accounting, Tax, Approver) gets the page itself.
 *
 * Applied from the page registry in [...slug].vue through `gateFinancialPage`,
 * so the gated pages do not each carry their own copy of the check.
 */
import type { Component } from 'vue'
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpBannerLink, MpButton } from '@mekari/pixel3'
import { canSeeFinancials, viewAs } from '~/data/assetStore'

defineProps<{ page: Component }>()

const { t } = useLocale()
const router = useRouter()
</script>

<template>
  <component :is="page" v-if="canSeeFinancials" />
  <MpBanner v-else id="asset-role-gate" variant="info" class="arg" data-testid="asset-role-gate">
    <MpBannerIcon id="asset-role-gate-icon" />
    <MpBannerTitle>{{ t('This page holds financial figures') }}</MpBannerTitle>
    <MpBannerDescription>
      {{ t(`Viewing as ${viewAs}. General Affairs sees the physical record only: tag, location, custodian and condition.`) }}
    </MpBannerDescription>
    <MpBannerLink id="asset-role-gate-link">
      <MpButton variant="textLink" size="sm" data-testid="asset-role-gate-link" @click="router.push('/custody-and-counts')">
        {{ t('Open Custody & counts') }}
      </MpButton>
    </MpBannerLink>
  </MpBanner>
</template>

<style scoped>
.arg { max-width: 720px; }
</style>
