<script setup lang="ts">
/**
 * Budget report: drill drawer. Lists the documents behind one report cell
 * (Reserved, Committed, Actual, No budget line, Not counted) with amounts that
 * sum to the cell. A document number links to its record only where the viewer
 * has access; otherwise it shows the number and amount.
 */
import { computed } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import type { DrillDoc } from '~/data/budgetUiReport'

const props = defineProps<{
  isOpen: boolean
  title: string
  subtitle: string
  caption: string
  docs: DrillDoc[]
  /** The report cell the list explains. */
  cellAmount: number
}>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()

const { t } = useLocale()
const router = useRouter()

const total = computed(() => props.docs.reduce((s, d) => s + d.amount, 0))
function close() { emit('update:isOpen', false) }
function open(d: DrillDoc) {
  if (!d.link) return
  close()
  router.push(d.link)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="brd">
      <div v-if="isOpen" class="brd-overlay" @click.self="close">
        <div class="brd-panel" role="dialog" :aria-label="title" data-tour="report-drill">
          <header class="brd-header">
            <div class="brd-head-text">
              <span class="brd-title">{{ title }}</span>
              <span class="brd-subtitle">{{ subtitle }}</span>
            </div>
            <MpButton class="brd-close" :aria-label="t('Close')" is-rounded @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="brd-body">
            <p class="brd-caption">{{ caption }}</p>
            <ul v-if="docs.length" class="brd-list">
              <li v-for="d in docs" :key="d.docNo" class="brd-item">
                <div class="brd-item-main">
                  <span v-if="d.link" class="brd-doc brd-doc--link" role="link" tabindex="0" @click="open(d)" @keydown.enter="open(d)">{{ d.docNo }}</span>
                  <span v-else class="brd-doc">{{ d.docNo }}</span>
                  <span class="brd-kind">{{ t(d.kind) }}<template v-if="d.detail"> · {{ d.detail }}</template></span>
                </div>
                <span class="brd-amount" :class="{ 'brd-amount--neg': d.amount < 0 }">{{ formatIDRWhole(d.amount) }}</span>
              </li>
            </ul>
            <p v-else class="brd-empty">{{ t('No documents in this period') }}</p>
          </div>

          <footer class="brd-footer">
            <span class="brd-total-label">{{ t('Total') }}</span>
            <span class="brd-total" :class="{ 'brd-amount--neg': total !== cellAmount }">{{ formatIDRWhole(total) }}</span>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.brd-enter-active, .brd-leave-active { transition: background-color 250ms ease; }
.brd-enter-from, .brd-leave-to { background-color: transparent; }
.brd-enter-active .brd-panel { transition: transform 350ms ease-out; }
.brd-leave-active .brd-panel { transition: transform 250ms ease-in; }
.brd-enter-from .brd-panel, .brd-leave-to .brd-panel { transform: translateX(calc(100% + 12px)); }

.brd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.brd-panel {
  margin: var(--mp-spacing-3);
  width: min(480px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
}
.brd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.brd-head-text { display: flex; flex-direction: column; min-width: 0; }
.brd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.brd-subtitle { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.brd-close {
  display: inline-flex !important; align-items: center; justify-content: center; flex-shrink: 0;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.brd-close:hover { background: var(--mp-background-neutral-hovered) !important; }
.brd-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.brd-caption { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.brd-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px); }
.brd-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
}
.brd-item:last-child { border-bottom: none; }
.brd-item-main { display: flex; flex-direction: column; min-width: 0; }
.brd-doc { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.brd-doc--link { color: var(--mp-text-link); cursor: pointer; }
.brd-doc--link:hover { text-decoration: underline; text-underline-offset: 2px; }
.brd-kind { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.brd-amount { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; font-variant-numeric: tabular-nums; }
.brd-amount--neg { color: var(--mp-text-danger); }
.brd-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.brd-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.brd-total-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.brd-total { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
</style>
