<script setup lang="ts">
/**
 * SubconMethodChip — the Basic / Resupply / Dropship badge.
 *
 * A subcon order's *method* is not an entity status (it never changes as the
 * order progresses), so per `rule/badge-single-mpbadge` this renders `MpBadge`
 * directly rather than going through `ErpStatusBadge`. The colour is fixed per
 * method so the three commercial models read the same everywhere they appear —
 * index row, dashboard row, order detail, and the work-order subcon block.
 */
import { MpBadge } from '@mekari/pixel3'
import { SUBCON_METHOD_LABEL, type SubconMethod } from '~/data/subcon'

withDefaults(defineProps<{
  method: SubconMethod
  /** Where the badge sits — `tableStatus` in rows, `additionalInformation` beside a title. */
  badgeFor?: 'tableStatus' | 'additionalInformation'
}>(), { badgeFor: 'tableStatus' })

const { t } = useLocale()

/** Basic = the vendor's own stock (neutral) · Resupply = our stock moves (info) ·
 *  Dropship = a third party is in the chain (needs watching). */
const TYPE: Record<SubconMethod, 'announcement' | 'information' | 'warning'> = {
  basic: 'announcement',
  resupply: 'information',
  dropship: 'warning',
}
</script>

<template>
  <MpBadge :for="badgeFor" :type="TYPE[method]">{{ t(SUBCON_METHOD_LABEL[method]) }}</MpBadge>
</template>
