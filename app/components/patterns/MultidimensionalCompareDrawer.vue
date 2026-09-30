<script setup lang="ts">
/**
 * Multidimensional report — "Comparison" drawer (Figma 4836-67530 / node
 * 4836:67545). Opened by the Compare control; comparison only switches on when
 * this drawer is applied.
 *
 * Two required choices:
 *   • Comparison period — how many earlier periods to place beside the current one.
 *   • Group by — Dimension (periods nested under each dimension value) or Period
 *     (dimension values nested under each period).
 * Each radio carries the Figma's preview card; those are drawn as real markup
 * rather than embedded screenshots so they follow the app's tokens.
 *
 * Same overlay shell as the other report drawers (MpDrawer has no structural CSS
 * in this Pixel3 build). Edits a local draft, commits only on Apply.
 */
import { MpIcon, MpButton, MpRadio, MpFormControl, MpFormLabel, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpSelect, css } from '@mekari/pixel3'
import { COMPARE_PERIOD_OPTIONS, type MdCompareSettings, type MdComparePeriod, type MdCompareGroupBy } from '~/data/multidimensionalReport'

const props = defineProps<{
  isOpen: boolean
  modelValue: MdCompareSettings
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: MdCompareSettings): void
}>()

const { t } = useLocale()

const period = ref<MdComparePeriod | ''>(props.modelValue.period)
const groupBy = ref<MdCompareGroupBy | ''>(props.modelValue.groupBy)
const showErrors = ref(false)

watch(() => props.isOpen, (open) => {
  if (open) {
    period.value = props.modelValue.period
    groupBy.value = props.modelValue.groupBy
    showErrors.value = false
  }
})

const periodLabel = computed(() => COMPARE_PERIOD_OPTIONS.find((o) => o.value === period.value)?.label ?? '')

function close() { emit('update:isOpen', false) }
function apply() {
  if (!period.value || !groupBy.value) { showErrors.value = true; return }
  emit('apply', { period: period.value, groupBy: groupBy.value })
  close()
}
</script>

<template>
  <Transition name="cmp-drawer">
    <div v-if="isOpen" class="cmp-overlay">
      <div class="cmp-panel" role="dialog" :aria-label="t('Comparison')">
        <header class="cmp-head">
          <span class="cmp-title">{{ t('Comparison') }}</span>
          <MpButton class="cmp-close" variant="ghost" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="cmp-body">
          <MpFormControl id="cmp-period-fc" is-required :is-invalid="showErrors && !period">
            <MpFormLabel>{{ t('Comparison period') }}</MpFormLabel>
            <MpPopover id="cmp-period" is-close-on-select :is-keep-alive="false">
              <MpPopoverTrigger>
                <MpSelect
                  id="cmp-period-select"
                  :placeholder="t('Select comparison period')"
                  :model-value="period"
                  :class="css({ width: '100%' })"
                  @mousedown.prevent
                >
                  <option v-if="period" :value="period">{{ t(periodLabel) }}</option>
                </MpSelect>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '280px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem
                    v-for="opt in COMPARE_PERIOD_OPTIONS"
                    :key="opt.value"
                    :is-active="opt.value === period"
                    @click="period = opt.value"
                  >
                    {{ t(opt.label) }}
                  </MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
            <p v-if="showErrors && !period" class="cmp-error">{{ t('You must fill in comparison period') }}</p>
          </MpFormControl>

          <div class="cmp-groupby">
            <p class="cmp-label">{{ t('Group by') }}<span class="cmp-required">*</span></p>

            <div class="cmp-option">
              <label class="cmp-radio">
                <MpRadio id="cmp-group-dimension" name="cmp-groupby" value="dimension" :is-checked="groupBy === 'dimension'" @change="groupBy = 'dimension'" />
                <span>{{ t('Dimension') }}</span>
              </label>
              <p class="cmp-caption">{{ t('Compare dimension values side by side across the selected timeframe.') }}</p>
              <!-- Preview: periods nested under one dimension value. -->
              <div class="cmp-preview">
                <div class="cmp-preview-card">
                  <div class="cmp-preview-group">Bogor</div>
                  <div class="cmp-preview-head"><span>Jan 2025</span><span>Feb 2025</span></div>
                  <div class="cmp-preview-row"><span>Rp1.250.000.000,00</span><span>Rp900.000.000,00</span></div>
                  <div class="cmp-preview-row"><span>Rp545.000.000,00</span><span>Rp545.000.000,00</span></div>
                </div>
              </div>
            </div>

            <div class="cmp-option">
              <label class="cmp-radio">
                <MpRadio id="cmp-group-period" name="cmp-groupby" value="period" :is-checked="groupBy === 'period'" @change="groupBy = 'period'" />
                <span>{{ t('Period') }}</span>
              </label>
              <p class="cmp-caption">{{ t('Compare all dimensions within each period to track trends over time.') }}</p>
              <!-- Preview: dimension values nested under one period. -->
              <div class="cmp-preview">
                <div class="cmp-preview-card">
                  <div class="cmp-preview-group">Feb 2025</div>
                  <div class="cmp-preview-head"><span>Jakarta</span><span>Bogor</span></div>
                  <div class="cmp-preview-row"><span>Rp1.250.000.000,00</span><span>Rp900.000.000,00</span></div>
                  <div class="cmp-preview-row"><span>Rp545.000.000,00</span><span>Rp545.000.000,00</span></div>
                </div>
              </div>
            </div>

            <p v-if="showErrors && !groupBy" class="cmp-error">{{ t('You must fill in group by') }}</p>
          </div>
        </div>

        <footer class="cmp-foot">
          <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">{{ t('Apply') }}</MpButton>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cmp-drawer-enter-active, .cmp-drawer-leave-active { transition: background-color 250ms ease; }
.cmp-drawer-enter-from, .cmp-drawer-leave-to { background-color: transparent; }
.cmp-drawer-enter-active .cmp-panel { transition: transform 350ms ease-out; }
.cmp-drawer-leave-active .cmp-panel { transition: transform 250ms ease-in; }
.cmp-drawer-enter-from .cmp-panel, .cmp-drawer-leave-to .cmp-panel { transform: translateX(calc(100% + 12px)); }

.cmp-overlay { position: fixed; inset: 0; z-index: 1300; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.cmp-panel {
  margin: var(--mp-spacing-3);
  width: min(400px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-xl, 12px);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}
.cmp-head {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  border-bottom: 1px solid var(--mp-border-default);
}
.cmp-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmp-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.cmp-close:hover { background: var(--mp-background-neutral-hovered); }

.cmp-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.cmp-label { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
.cmp-required { color: var(--mp-text-danger, #a8352d); }
.cmp-groupby { display: flex; flex-direction: column; }
.cmp-option { display: flex; flex-direction: column; }
/* MpRadio ships no structural CSS in this Pixel3 build (verified: __root lays out
   as a block and __control resolves to 0×0, same root cause as MpModal/MpDrawer
   here) — so the control's circle, the row layout and the 12px control-to-label
   gap are supplied below. The empty __label slot is hidden; the visible label is
   the sibling span, which keeps the caption alignment simple. */
.cmp-radio { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); cursor: pointer; user-select: none; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
.cmp-radio :deep(.mp-radio__root) { display: inline-flex; align-items: center; }
.cmp-radio :deep(.mp-radio__label) { display: none; }
.cmp-radio :deep(.mp-radio__control) {
  box-sizing: border-box; flex-shrink: 0; width: 16px; height: 16px;
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff);
}
.cmp-radio :deep(.mp-radio__root[aria-checked='true'] .mp-radio__control) {
  border: 5px solid var(--mp-background-brand-bold, #0a6e4e);
}
.cmp-caption { margin: 0; padding-left: var(--mp-spacing-8, 32px); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); }
.cmp-error { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

/* Preview card — a clipped mini table floating on the information panel, so the
   two grouping modes read at a glance (Figma uses screenshots here). */
.cmp-preview {
  margin: var(--mp-spacing-3) 0 var(--mp-spacing-5);
  margin-left: var(--mp-spacing-8, 32px);
  height: 159px; overflow: hidden;
  background: var(--mp-background-information, #eef0fc);
  border-radius: var(--mp-radii-md, 6px);
  display: flex; justify-content: center;
}
.cmp-preview-card {
  margin-top: 32px; width: 281px; flex-shrink: 0;
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md, 6px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}
.cmp-preview-group {
  padding: 6px var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f4f5f7);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: 10px; font-weight: var(--mp-font-weights-semi-bold, 600);
  letter-spacing: 0.3px; text-transform: uppercase; text-align: center;
  color: var(--mp-text-secondary);
}
.cmp-preview-head, .cmp-preview-row { display: flex; }
.cmp-preview-head > span, .cmp-preview-row > span { flex: 1; padding: 8px var(--mp-spacing-3); white-space: nowrap; }
.cmp-preview-head > span:first-child, .cmp-preview-row > span:first-child { text-align: left; }
.cmp-preview-head > span:last-child, .cmp-preview-row > span:last-child { text-align: right; }
.cmp-preview-head {
  border-bottom: 1px solid var(--mp-border-default);
  font-size: 10px; font-weight: var(--mp-font-weights-semi-bold, 600);
  letter-spacing: 0.3px; text-transform: uppercase; color: var(--mp-text-secondary);
}
.cmp-preview-row { border-bottom: 1px solid var(--mp-border-default); font-size: 11px; color: var(--mp-text-default); }

.cmp-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); }
</style>
