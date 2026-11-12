<script setup lang="ts">
/**
 * Purchase Price Rule note under a purchase line's Discount input (PO / PI /
 * PQ forms). Two short lines at most:
 *   rule applied   → "Rule: <name>" (truncated, full name + tier in `title`)
 *                    / the tier label
 *   edited by user → "Edited manually" / "Reset to rule" (the link only while a
 *                    rule still matches the line)
 * Quiet caption text, not a badge — it annotates a value, it isn't a status
 * (rule/badge-status-mapping). Copy goes through t(). Styled as the FormTable
 * two-band info band — put it right after a 40px control band in the cell.
 *
 * Contract (used by three forms — keep the props/emit stable):
 *   props  match: PurchaseRuleMatch | null, isEdited: boolean
 *   emit   reset
 */
import { computed } from 'vue'
import { MpTextlink } from '@mekari/pixel3'
import { PURCHASE_RULE_TIER_LABEL, type PurchaseRuleMatch } from '~/data/priceRules'

const props = defineProps<{ match: PurchaseRuleMatch | null; isEdited: boolean }>()
const emit = defineEmits<{ reset: [] }>()
const { t } = useLocale()

const tierLabel = computed(() => (props.match ? t(PURCHASE_RULE_TIER_LABEL[props.match.tier]) : ''))
const fullLabel = computed(() => (props.match ? `${props.match.rule.name} · ${tierLabel.value}` : ''))
</script>

<template>
  <div v-if="isEdited || match" class="prn" data-devchange="purchase-price-rule-line">
    <template v-if="isEdited">
      <span class="prn-text">{{ t('Edited manually') }}</span>
      <MpTextlink v-if="match" as="button" class="prn-link" @click="emit('reset')">{{ t('Reset to rule') }}</MpTextlink>
    </template>
    <template v-else-if="match">
      <span class="prn-text prn-trunc" :title="fullLabel">{{ t('Rule') }}: {{ match.rule.name }}</span>
      <span class="prn-text prn-trunc">{{ tierLabel }}</span>
    </template>
  </div>
</template>

<style scoped>
/* Info band of a two-band form-table cell (docs/patterns/FormTable.md "Two-band
   cells"): a 1px rule under the 40px control band, padded 8px 12px, captions at
   12px / 16px / --mp-text-secondary. Sits flush in a padding-0 input cell. */
.prn {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  min-width: 0; max-width: 100%;
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
  text-align: left;
}
.prn-text { font-size: var(--mp-font-sizes-xs); line-height: 16px; color: var(--mp-text-secondary); }
.prn-trunc { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prn-link { font-size: var(--mp-font-sizes-xs); line-height: 16px; }
</style>
