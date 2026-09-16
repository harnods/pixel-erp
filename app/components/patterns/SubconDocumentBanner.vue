<script setup lang="ts">
/**
 * SubconDocumentBanner — the "this document belongs to a subcon order" reference
 * block from the subcon flow.
 *
 * A subcon purchase request, warehouse transfer or goods receipt looks like any
 * other document in its module; what makes it different is invisible without
 * this: which subcon order it serves, which BOM it came from, and — on a
 * dropship PR — that the consignee is the vendor's address, NOT a company
 * warehouse. That last one is the expensive mistake this banner exists to
 * prevent, so it is styled as a warning rather than plain information.
 */
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription } from '@mekari/pixel3'

defineProps<{
  /** Heading — what this document does for the chain. */
  title: string
  /** Key/value references: linked BOM, subcon order, the next document, … */
  rows: { label: string; value: string }[]
  /** Consignee warning text — pass only when goods ship somewhere that is not
   *  one of the company's own warehouses. */
  cidNote?: string
}>()
</script>

<template>
  <MpBanner :type="cidNote ? 'warning' : 'information'" class="sdb">
    <MpBannerIcon />
    <MpBannerTitle>{{ title }}</MpBannerTitle>
    <MpBannerDescription>
      <dl class="sdb__rows">
        <div v-for="r in rows" :key="r.label" class="sdb__row">
          <dt class="sdb__label">{{ r.label }}</dt>
          <dd class="sdb__value">{{ r.value }}</dd>
        </div>
      </dl>
      <p v-if="cidNote" class="sdb__cid">{{ cidNote }}</p>
    </MpBannerDescription>
  </MpBanner>
</template>

<style scoped>
.sdb__rows { margin: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.sdb__row { display: flex; gap: var(--mp-spacing-3); }
.sdb__label {
  flex: none; width: 160px;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.sdb__value { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.sdb__cid {
  margin: var(--mp-spacing-2) 0 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
</style>
