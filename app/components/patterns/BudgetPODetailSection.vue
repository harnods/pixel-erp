<script setup lang="ts">
/**
 * Budget section on a purchase order's detail page: each line's budget line,
 * amount, invoiced and open commitment, with Close line / Close PO / Reopen.
 * Reopen re-runs the check and shows the gap inline when it blocks (FG7-AC3).
 */
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, toast } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import BudgetPOCloseModal from '~/components/patterns/BudgetPOCloseModal.vue'
import { formatIDRWhole } from '~/utils/currency'
import {
  budget, poById, poOpen, poOpenTotal, isIdlePO, poIdleDays, prById, canActOnCommitment, reopenPOLineAs, lineById, lineTitle,
} from '~/data/budgetStore'
import { shortDate } from '~/data/budgetUiPurchaseOrders'

const props = defineProps<{ poId: string }>()
const { t } = useLocale()
const fmt = formatIDRWhole

const po = computed(() => poById(props.poId))
const rows = computed(() => {
  const p = po.value
  if (!p) return []
  return p.lines.map((l, i) => {
    const bl = lineById(l.lineId)
    return { i, description: l.description, budgetLine: bl ? lineTitle(bl) : t('No budget line'), amount: l.amount, invoiced: l.invoiced, open: poOpen(p, i), closed: l.closed, closeReason: l.closeReason }
  })
})
const request = computed(() => prById(po.value?.prId ?? null))
const idle = computed(() => (po.value ? isIdlePO(po.value) : false))

const canClose = computed(() => { void budget.viewAs; return canActOnCommitment('close', po.value).ok })
const canReopen = computed(() => { void budget.viewAs; return canActOnCommitment('reopen', po.value).ok })
const reopenMsg = reactive<Record<number, string>>({})

const closeTarget = ref<{ mode: 'line' | 'po'; poId: string; lineIndex: number } | null>(null)
function closeLine(i: number) { delete reopenMsg[i]; closeTarget.value = { mode: 'line', poId: props.poId, lineIndex: i } }
function closeWhole() { closeTarget.value = { mode: 'po', poId: props.poId, lineIndex: 0 } }
function onClosed(p: { freed: number; label: string }) {
  toast.notify({ variant: 'success', title: `${p.label} ${t('closed')}. ${fmt(p.freed)} ${t('freed to the budget line')}`, rootProps: { class: 'toast-enterprise' } })
}
function reopen(i: number) {
  const res = reopenPOLineAs(props.poId, i)
  if (!res.ok) { reopenMsg[i] = res.gap > 0 ? `${t('Not enough budget to reopen. Short')} ${fmt(res.gap)}` : (res.reason ?? ''); return }
  delete reopenMsg[i]
  toast.notify({ variant: 'success', title: `${t('Line')} ${i + 1} ${t('reopened')}. ${fmt(res.amount)} ${t('committed again')}`, rootProps: { class: 'toast-enterprise' } })
}
</script>

<template>
  <section v-if="po" class="bpd-section" data-tour="po-budget-section">
    <div class="bpd-head">
      <h3 class="bpd-heading">{{ t('Budget') }}</h3>
      <div class="bpd-meta">
        <span>{{ t('Commitment open') }} <strong id="bpd-open-total">{{ fmt(poOpenTotal(po)) }}</strong></span>
        <span v-if="request">· {{ t('From request') }} {{ request.number }}</span>
        <span>· {{ t('Last activity') }} {{ shortDate(po.lastActivity) }}</span>
        <ErpStatusBadge v-if="idle" status="idle" :label="`${t('Idle')} ${poIdleDays(po)} ${t('days')}`" type="warning" />
      </div>
      <MpButton v-if="canClose && po.status === 'Open'" id="bpd-close-po" variant="secondary" is-rounded @click="closeWhole">{{ t('Close PO') }}</MpButton>
    </div>

    <table class="bpd-table">
      <thead>
        <tr>
          <th class="bpd-th">{{ t('Line') }}</th>
          <th class="bpd-th">{{ t('Budget line') }}</th>
          <th class="bpd-th bpd-th--num">{{ t('Amount') }}</th>
          <th class="bpd-th bpd-th--num">{{ t('Invoiced') }}</th>
          <th class="bpd-th bpd-th--num">{{ t('Open') }}</th>
          <th class="bpd-th">{{ t('Status') }}</th>
          <th class="bpd-th bpd-th--act" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.i">
          <td class="bpd-td">{{ r.i + 1 }}. {{ r.description }}</td>
          <td class="bpd-td">{{ r.budgetLine }}</td>
          <td class="bpd-td bpd-td--num">{{ fmt(r.amount) }}</td>
          <td class="bpd-td bpd-td--num">{{ fmt(r.invoiced) }}</td>
          <td class="bpd-td bpd-td--num">
            {{ fmt(r.open) }}
            <span v-if="reopenMsg[r.i]" class="bpd-error">{{ reopenMsg[r.i] }}</span>
          </td>
          <td class="bpd-td">
            <ErpStatusBadge :status="r.closed ? 'closed' : 'open'" :label="r.closed ? t('Closed') : t('Open')" :type="r.closed ? 'announcement' : 'information'" />
            <span v-if="r.closeReason" class="bpd-sub">{{ t(r.closeReason) }}</span>
          </td>
          <td class="bpd-td bpd-td--act">
            <MpPopover v-if="(!r.closed && canClose) || (r.closed && canReopen)" :id="`bpd-row-${r.i}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded data-tour="po-close-line" />
              </MpPopoverTrigger>
              <MpPopoverContent class="erp-dropdown-menu">
                <MpPopoverList>
                  <MpPopoverListItem v-if="!r.closed" @click="closeLine(r.i)">{{ t('Close line') }}</MpPopoverListItem>
                  <MpPopoverListItem v-else @click="reopen(r.i)">{{ t('Reopen') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </td>
        </tr>
      </tbody>
    </table>

    <BudgetPOCloseModal v-if="closeTarget" :target="closeTarget" @update:target="closeTarget = $event" @closed="onClosed" />
  </section>
</template>

<style scoped>
.bpd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); flex-shrink: 0; }
.bpd-head { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.bpd-heading { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bpd-meta { flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.bpd-meta strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.bpd-table { width: 100%; border-collapse: collapse; }
.bpd-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase;
}
.bpd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.bpd-th--act, .bpd-td--act { width: 44px; padding-left: 0; padding-right: 0; text-align: center; }
.bpd-td {
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
}
.bpd-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.bpd-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bpd-error { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); white-space: normal; }
</style>
