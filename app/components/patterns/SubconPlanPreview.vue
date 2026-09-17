<script setup lang="ts">
/**
 * SubconPlanPreview — the document chain a subcon configuration will raise, plus
 * what it is estimated to cost.
 *
 * Shown live while the user is still choosing scope / split / supply method, so
 * the consequence of each choice is visible at the moment of the decision rather
 * than discovered later in three other modules. Shared by the standalone subcon
 * order form and the Subcontracting block on a work order, so both read the same
 * plan from the same builder.
 */
import { MpIcon } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import {
  buildDocumentPlan, SUBCON_BOM_LINES, SUBCON_SERVICE_FEE, SUBCON_HANDLING_FEE, SUBCON_BATCH_QTY,
  type SubconScope, type SubconSplit, type SubconMethod,
} from '~/data/subcon'

const props = defineProps<{
  scope: SubconScope
  split: SubconSplit
  method: SubconMethod
  /** Order quantity, used to scale the estimate off the reference batch. */
  qty: number
  /**
   * Compact: one inline chain of chips, no estimate. Use inside a form that
   * already carries its own cost section — repeating the estimate there would
   * state the same number twice and cost a screenful of height.
   */
  compact?: boolean
}>()

const { t } = useLocale()

const plan = computed(() => buildDocumentPlan(props.scope, props.split, props.method))

const estimate = computed(() => {
  const factor = (props.qty / SUBCON_BATCH_QTY) * (props.split === 'partial' ? 0.5 : 1)
  // Basic = the vendor supplies its own components, so we carry no component cost.
  const components = props.method === 'basic'
    ? 0
    : SUBCON_BOM_LINES.reduce((sum, l) => sum + l.qty * l.unitPrice, 0) * factor
  const service = (SUBCON_SERVICE_FEE[props.scope].amount + SUBCON_HANDLING_FEE.amount) * factor
  return { components, service, total: components + service }
})
</script>

<template>
  <!-- Compact: the chain as one line of chips. -->
  <ol v-if="compact" class="scp__chain">
    <li v-for="(step, i) in plan" :key="step.kind" class="scp__chain-item">
      <span class="scp__chip">
        <span class="scp__chip-tag" :class="`scp__chip-tag--${step.tag.toLowerCase()}`">{{ t(step.tag) }}</span>
        {{ t(step.title) }}
      </span>
      <MpIcon v-if="i < plan.length - 1" name="chevrons-right" size="sm" class="scp__arrow" />
    </li>
  </ol>

  <!-- Full: numbered steps with what each document does, plus the estimate. -->
  <div v-else class="scp">
    <ol class="scp__list">
      <li v-for="(step, i) in plan" :key="step.kind" class="scp__step">
        <span class="scp__num">{{ i + 1 }}</span>
        <span class="scp__body">
          <span class="scp__title">
            {{ t(step.title) }}
            <span class="scp__tag" :class="`scp__tag--${step.tag.toLowerCase()}`">{{ t(step.tag) }}</span>
          </span>
          <span class="scp__detail">{{ t(step.detail) }}</span>
          <span class="scp__module">{{ t(step.module) }}</span>
        </span>
      </li>
    </ol>

    <dl class="scp__estimate">
      <div class="scp__row">
        <dt>{{ t('Estimated component cost') }}</dt>
        <dd>{{ method === 'basic' ? t('Supplied by the vendor') : formatIDR(estimate.components) }}</dd>
      </div>
      <div class="scp__row">
        <dt>{{ t('Estimated subcon service cost') }}</dt>
        <dd>{{ formatIDR(estimate.service) }}</dd>
      </div>
      <div class="scp__row scp__row--total">
        <dt>{{ t('Estimated total') }}</dt>
        <dd>{{ formatIDR(estimate.total) }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.scp { max-width: 860px; }

/* ── Compact: one inline chain ───────────────────────────────────────────── */
.scp__chain {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-1\.5);
  margin: 0; padding: 0; list-style: none; max-width: 860px;
}
.scp__chain-item { display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5); }
.scp__chip {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-default, #fff);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  white-space: nowrap;
}
.scp__chip-tag {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  border-radius: var(--mp-radii-sm);
  padding: 0 var(--mp-spacing-1\.5);
}
.scp__chip-tag--pr { background: var(--mp-background-information, #eef0fc); color: var(--mp-text-link); }
.scp__chip-tag--transfer { background: var(--mp-background-warning-subtle, #fffaea); color: var(--mp-text-warning, #b54708); }
.scp__chip-tag--receipt { background: var(--mp-background-success-subtle, #e8f4ef); color: var(--mp-text-success, #18794e); }
.scp__arrow { color: var(--mp-text-subtle, #75808f); }

.scp__list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin: 0; padding: 0; list-style: none; }
.scp__step {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-default, #fff);
}
.scp__num {
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
}
.scp__body { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.scp__title {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.scp__tag {
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  border-radius: var(--mp-radii-sm); padding: 0 var(--mp-spacing-1\.5);
}
.scp__tag--pr { background: var(--mp-background-information, #eef0fc); color: var(--mp-text-link); }
.scp__tag--transfer { background: var(--mp-background-warning-subtle, #fffaea); color: var(--mp-text-warning, #b54708); }
.scp__tag--receipt { background: var(--mp-background-success-subtle, #e8f4ef); color: var(--mp-text-success, #18794e); }
.scp__detail { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.scp__module { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle, #75808f); }

.scp__estimate { margin: var(--mp-spacing-6) 0 0; }
.scp__row {
  display: flex; justify-content: space-between; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.scp__row dt, .scp__row dd { margin: 0; }
.scp__row dd { font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.scp__row--total {
  border-top: 1px solid var(--mp-border-default);
  margin-top: var(--mp-spacing-2);
  padding-top: var(--mp-spacing-3);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.scp__row--total dd { font-weight: var(--mp-font-weights-semi-bold); }
</style>
