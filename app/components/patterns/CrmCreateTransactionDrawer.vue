<script setup lang="ts">
/**
 * CrmCreateTransactionDrawer — full-screen drawer that hosts the ERP "New sales
 * order" / "New sales quote" form (embedded mode), auto-filled from a CRM Deal and
 * fully editable. Opened from the Deal detail flow:
 *   • Mark as won  → "Create sales order?" → this drawer (kind = sales-order)
 *   • Move to Proposal → "Create sales quote?" → this drawer (kind = sales-quote)
 * The embedded form keeps its own footer (Cancel · More · Save); this shell only adds
 * a title bar with the deal name + a close button. Save emits `created`, cancel/close
 * emits `close`.
 */
import { computed } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'
import NewSalesOrderPage from '~/components/pages/NewSalesOrderPage.vue'
import NewSalesQuotePage from '~/components/pages/NewSalesQuotePage.vue'
import { dealToSalesPrefill } from '~/data/salesFormPrefill'
import type { Deal } from '~/data/crm'

const props = defineProps<{ open: boolean; kind: 'sales-order' | 'sales-quote'; deal: Deal | null }>()
const emit = defineEmits<{ close: []; created: [] }>()
const { t } = useLocale()

const prefill = computed(() => (props.deal ? dealToSalesPrefill(props.deal) : null))
const title = computed(() => (props.kind === 'sales-order' ? t('Create sales order') : t('Create sales quote')))
</script>

<template>
  <Teleport to="body">
    <Transition name="cxd">
      <div v-if="open" class="cxd-overlay">
        <div class="cxd-panel" role="dialog" aria-modal="true">
          <header class="cxd-header">
            <div class="cxd-header-left">
              <span v-if="deal" class="cxd-eyebrow">{{ deal.name }}</span>
              <h2 class="cxd-title">{{ title }}</h2>
            </div>
            <MpButton class="cxd-close" :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>
          <div class="cxd-body">
            <NewSalesOrderPage
              v-if="kind === 'sales-order'"
              embedded
              :prefill="prefill"
              @cancel="emit('close')"
              @created="emit('created')"
            />
            <NewSalesQuotePage
              v-else
              embedded
              :prefill="prefill"
              @cancel="emit('close')"
              @created="emit('created')"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cxd-overlay {
  position: fixed; inset: 0; z-index: 1100;
  background: var(--mp-background-overlay, rgba(29, 31, 36, 0.4));
  display: flex; justify-content: flex-end;
}
.cxd-panel {
  width: 100%; height: 100%;
  background: var(--mp-background-stage, #fff);
  display: flex; flex-direction: column; overflow: hidden;
}
.cxd-header {
  flex-shrink: 0; height: var(--mp-sizes-16, 64px); box-sizing: border-box;
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4); padding: 0 var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.cxd-header-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.cxd-eyebrow { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.cxd-title {
  margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-xl, 28px);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cxd-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border-radius: var(--mp-radii-md); background: none !important; border: none !important; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.cxd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
/* the embedded form page fills the remaining height and owns its own scroll + footer */
.cxd-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.cxd-body > * { flex: 1; min-height: 0; }

/* slide-in from the right */
.cxd-enter-active, .cxd-leave-active { transition: opacity 0.2s ease; }
.cxd-enter-from, .cxd-leave-to { opacity: 0; }
.cxd-panel { transition: transform 0.25s ease; }
.cxd-enter-from .cxd-panel, .cxd-leave-to .cxd-panel { transform: translateX(100%); }
</style>
