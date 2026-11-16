<script setup lang="ts">
/**
 * Per-row markers on a VAT reconciliation row — the same three wherever a row
 * renders (To match line, Not reconciled status cell, Matched method cell):
 *
 *   from <old> → <new>        what the last Re-run changed (US-002 AC-01; client-side,
 *                             gone on reload)
 *   Changed since reconciled  the source moved after the last run (US-019) — a flag,
 *                             never a status; Re-run clears it
 *   remark icon               the row's Remarks (US-013) — reason + text in a tooltip
 *
 * Tags are gray MpTag (rule/tag-gray-only). Tooltip triggers are the first child
 * of MpTooltip's slot, with no comment before them (Pixel dev-build quirk).
 */
import { MpTag, MpTooltip, MpIcon } from '@mekari/pixel3'
import {
  MATCH_META, changedSinceReconciled, remarkOf, type MatchState, type ReconPair,
} from '~/data/vatReconciliation'

const props = defineProps<{
  pair: ReconPair
  /** The status this row had before the last Re-run, when it changed. */
  changedFrom?: MatchState
}>()

const { t } = useLocale()

const changed = computed(() => changedSinceReconciled(props.pair))
const remark = computed(() => remarkOf(props.pair))
const remarkLabel = computed(() =>
  remark.value ? `${t(remark.value.reason)}${remark.value.text ? `: ${remark.value.text}` : ''}` : '')
</script>

<template>
  <span v-if="changedFrom || changed || remark" class="vrk" data-devchange="vat-recon-prd-align-row-markers">
    <span v-if="changedFrom" class="vrk-change" data-test-id="vrk-change">
      {{ t('from') }} {{ t(MATCH_META[changedFrom].label) }} → {{ t(MATCH_META[pair.match].label) }}
    </span>
    <MpTooltip v-if="changed" :id="`vrk-changed-${pair.id}`" :label="changed.note" placement="top" use-portal>
      <span class="vrk-tag" data-test-id="vrk-changed"><MpTag>{{ t('Changed since reconciled') }}</MpTag></span>
    </MpTooltip>
    <MpTooltip v-if="remark" :id="`vrk-remark-${pair.id}`" :label="remarkLabel" placement="top" use-portal>
      <span class="vrk-remark" tabindex="0" role="img" :aria-label="`${t('Remarks')}: ${remarkLabel}`" data-test-id="vrk-remark">
        <MpIcon name="comment" size="sm" />
      </span>
    </MpTooltip>
  </span>
</template>

<style scoped>
.vrk { display: inline-flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.vrk-change { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.vrk-tag { display: inline-flex; white-space: nowrap; }
.vrk-remark { display: inline-flex; align-items: center; cursor: default; }
.vrk-remark:focus-visible { outline: 2px solid var(--mp-colors-neutral-400); outline-offset: 2px; border-radius: var(--mp-radii-sm); }
</style>
