<script setup lang="ts">
/**
 * Budget section on the purchase invoice form. Billed against a budget PO, each
 * invoice line picks the PO line it bills and the check runs on any excess over
 * what the PO still holds; Final invoice frees the rest. With no PO, each line
 * names its budget account, department and project; Release 1 posts over-budget
 * bills with a warning and lists them on Commitments. One invoice books one
 * project. The parent owns the state through v-model.
 */
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpCheckbox } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatIDRWhole } from '~/utils/currency'
import { budget, canSeeBudgetAmounts, poById, previewBill, type BillInput } from '~/data/budgetStore'
import {
  billablePOOptions, poLineOptions, buildBudgetBillInput, ACCOUNT_OPTIONS, DEPARTMENT_OPTIONS, PROJECT_OPTIONS,
  type BudgetPILine, type BudgetPIState,
} from '~/data/budgetUiPurchaseOrders'

const props = defineProps<{
  modelValue: BudgetPIState
  items: { description: string; amount: number }[]
  vendor: string
  date: string
  /** Set by the parent when a save was refused (block, two projects, Final invoice not allowed). */
  error: string | null
}>()
const emit = defineEmits<{ (e: 'update:modelValue', v: BudgetPIState): void }>()
const { t } = useLocale()
const fmt = formatIDRWhole

const state = computed(() => props.modelValue)
function patch(p: Partial<BudgetPIState>) { emit('update:modelValue', { ...state.value, ...p }) }
function onPOChange(v: string) {
  const next = poById(v || null)
  patch({ poId: v ?? '', final: false, lines: state.value.lines.map((l, i) => ({ ...l, poLine: next ? String(Math.min(i, next.lines.length - 1)) : '' })) })
}
function patchLine(i: number, p: Partial<BudgetPILine>) {
  const lines = state.value.lines.map((l, j) => (j === i ? { ...l, ...p } : l))
  patch({ lines })
}

const po = computed(() => poById(state.value.poId || null))
const poOptions = computed(() => billablePOOptions())
const lineOptions = computed(() => (po.value ? poLineOptions(po.value.id) : []))

/** The postBill input this form would post, or null when nothing is charged to a budget. */
const input = computed<BillInput | null>(() => buildBudgetBillInput(state.value, props.items, props.vendor, props.date))
const preview = computed(() => (input.value ? previewBill(input.value) : null))
defineExpose({ input, preview })

function rowResult(i: number) {
  const r = preview.value?.rows[i]
  if (!r) return null
  const lc = preview.value!.check.lines.find((c) => c.lineId === r.lineId)
  return { row: r, check: lc ?? null }
}
</script>


<template>
  <section class="bpi-section" data-tour="pi-budget-section">
    <h3 class="bpi-heading">{{ t('Budget') }}</h3>

    <div class="bpi-top">
      <div class="bpi-field">
        <span class="bpi-label">{{ t('Purchase order') }}</span>
        <ErpFilterSelect id="bpi-po" :model-value="state.poId" :placeholder="t('No purchase order')" :options="poOptions" width="320px" @update:model-value="onPOChange" />
      </div>
      <div v-if="po" class="bpi-field bpi-field--check">
        <MpCheckbox id="bpi-final" :is-checked="state.final" @change="patch({ final: !state.final })">{{ t('Final invoice') }}</MpCheckbox>
        <span class="bpi-caption">{{ t('Closes the PO lines it bills and frees what is left') }}</span>
      </div>
    </div>

    <MpBanner v-if="error || (preview && !preview.ok)" id="bpi-block-banner" variant="danger" align-items="center">
      <MpBannerIcon id="bpi-block-banner-icon" />
      <MpBannerTitle>{{ t('This purchase invoice cannot be posted') }}</MpBannerTitle>
      <MpBannerDescription>{{ error || preview?.message }}</MpBannerDescription>
    </MpBanner>
    <MpBanner v-else-if="preview?.overBudget" id="bpi-overrun-banner" variant="warning" align-items="center">
      <MpBannerIcon id="bpi-overrun-banner-icon" />
      <MpBannerDescription>{{ canSeeBudgetAmounts(budget.viewAs) ? `${t('Over budget by')} ${fmt(preview.overBudgetShort)}.` : t('Over budget.') }} {{ t('This bill will post and appear on the over-budget list.') }}</MpBannerDescription>
    </MpBanner>

    <table v-if="items.length" class="bpi-table">
      <thead>
        <tr>
          <th class="bpi-th">{{ t('Invoice line') }}</th>
          <template v-if="po">
            <th class="bpi-th">{{ t('PO line') }}</th>
          </template>
          <template v-else>
            <th class="bpi-th">{{ t('Budget account') }}</th>
            <th class="bpi-th">{{ t('Department') }}</th>
            <th class="bpi-th">{{ t('Project') }}</th>
          </template>
          <th class="bpi-th bpi-th--num">{{ t('Amount before tax') }}</th>
          <th v-if="po" class="bpi-th bpi-th--num">{{ t('Open on PO') }}</th>
          <th class="bpi-th">{{ t('Check') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(it, i) in items" :key="i">
          <td class="bpi-td">{{ it.description || '-' }}</td>
          <template v-if="po">
            <td class="bpi-td bpi-td--select">
              <ErpFilterSelect :id="`bpi-poline-${i}`" :model-value="state.lines[i]?.poLine ?? ''" :placeholder="t('PO line')" :options="lineOptions" width="240px" @update:model-value="(v: string) => patchLine(i, { poLine: v ?? '' })" />
            </td>
          </template>
          <template v-else>
            <td class="bpi-td bpi-td--select">
              <ErpFilterSelect :id="`bpi-account-${i}`" :model-value="state.lines[i]?.account ?? ''" :placeholder="t('Account')" :options="ACCOUNT_OPTIONS" width="220px" @update:model-value="(v: string) => patchLine(i, { account: v ?? '' })" />
            </td>
            <td class="bpi-td bpi-td--select">
              <ErpFilterSelect :id="`bpi-dept-${i}`" :model-value="state.lines[i]?.dept ?? ''" :placeholder="t('Department')" :options="DEPARTMENT_OPTIONS" width="176px" @update:model-value="(v: string) => patchLine(i, { dept: v ?? '' })" />
            </td>
            <td class="bpi-td bpi-td--select">
              <ErpFilterSelect :id="`bpi-project-${i}`" :model-value="state.lines[i]?.project ?? ''" :placeholder="t('Project')" :options="PROJECT_OPTIONS" width="160px" @update:model-value="(v: string) => patchLine(i, { project: v ?? '' })" />
            </td>
          </template>
          <td class="bpi-td bpi-td--num">{{ fmt(it.amount) }}</td>
          <td v-if="po" class="bpi-td bpi-td--num">{{ rowResult(i) ? fmt(rowResult(i)!.row.open) : '-' }}</td>
          <td class="bpi-td">
            <template v-if="rowResult(i)?.check">
              <ErpStatusBadge
                :status="rowResult(i)!.check!.result"
                :label="rowResult(i)!.check!.result === 'Block' ? (po ? t('Not enough budget') : t('Over budget')) : rowResult(i)!.check!.result === 'Warn' ? t('Over month budget') : rowResult(i)!.check!.controlled ? (rowResult(i)!.row.excess > 0 ? t('Fits available') : t('Within PO')) : t('Not budget controlled')"
                :type="rowResult(i)!.check!.result === 'Block' ? (po ? 'critical' : 'warning') : rowResult(i)!.check!.result === 'Warn' ? 'warning' : rowResult(i)!.check!.controlled ? 'completed' : 'announcement'"
              />
              <span class="bpi-sub">{{ rowResult(i)!.row.lineTitle }}</span>
            </template>
            <span v-else class="bpi-sub">{{ po ? t('Pick the PO line') : t('Not charged to a budget line') }}</span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="bpi-sub">{{ t('Add products to check them against the budget.') }}</p>
  </section>
</template>

<style scoped>
.bpi-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bpi-heading { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bpi-top { display: flex; align-items: flex-end; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.bpi-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.bpi-field--check { gap: var(--mp-spacing-0\.5); padding-bottom: var(--mp-spacing-1); }
.bpi-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bpi-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); padding-left: var(--mp-spacing-8); }
.bpi-table { width: 100%; border-collapse: collapse; }
.bpi-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase;
}
.bpi-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.bpi-td {
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
}
.bpi-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.bpi-sub { display: block; margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
