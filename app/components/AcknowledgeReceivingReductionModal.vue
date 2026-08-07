<script setup lang="ts">
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalCloseButton, MpModalOverlay, MpButton,
} from '@mekari/pixel3'

/** One receiving task's slice of a SKU reduction — read-only (no override, unlike
 *  outbound's AllocateReductionModal). */
export interface ReceivingAllocTask { taskNo: string; currentQty: number; reduceBy: number; resultQty: number; willCancel: boolean }
export interface ReceivingReductionGroup { sku: string; productName: string; toRemove: number; tasks: ReceivingAllocTask[] }

const props = defineProps<{ open: boolean; groups: ReceivingReductionGroup[] }>()
const emit = defineEmits<{ close: []; confirm: [] }>()

function rowBadge(t: ReceivingAllocTask): string {
  if (t.reduceBy <= 0) return 'Untouched'
  if (t.willCancel) return 'Task will be canceled'
  return `${t.resultQty} will remain`
}
</script>

<template>
  <MpModal id="ack-recv-alloc-modal" :is-open="open" size="lg" :is-keep-alive="false" @close="emit('close')">
    <MpModalContent>
      <MpModalHeader>
        This reduction spans multiple receiving tasks
        <MpModalCloseButton />
      </MpModalHeader>

      <MpModalBody>
        <p class="ral-intro">
          You’re lowering the quantity of a SKU that’s split across several Open receiving tasks.
          The system proposes the arrangement below — there’s no override in this flow, only acknowledgement.
        </p>

        <ul class="ral-rules">
          <li>A task reduced to 0 is cancelled automatically.</li>
          <li>A task that still has qty left stays Open, but needs acknowledgement on that task before it can start.</li>
          <li>The arrangement below drains the smallest tasks first — it can’t be adjusted.</li>
        </ul>

        <div v-for="g in groups" :key="g.sku" class="ral-group">
          <div class="ral-group-head">
            <div class="ral-group-title">
              <span class="ral-prod">{{ g.productName }}</span>
              <span class="ral-sku">{{ g.sku }}</span>
            </div>
            <span class="ral-remove">Removing {{ g.toRemove }}</span>
          </div>

          <div class="ral-table-wrap">
            <table class="ral-table">
              <colgroup>
                <col />
                <col style="width: 120px" />
                <col style="width: 110px" />
                <col style="width: 180px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="ral-th">Receiving task</th>
                  <th class="ral-th ral-th--num">In task</th>
                  <th class="ral-th ral-th--num">Reduce by</th>
                  <th class="ral-th">Result</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in g.tasks" :key="t.taskNo" class="ral-tr">
                  <td class="ral-td"><span class="ral-taskno">{{ t.taskNo }}</span></td>
                  <td class="ral-td ral-td--num">{{ t.currentQty }}</td>
                  <td class="ral-td ral-td--num">{{ t.reduceBy }}</td>
                  <td class="ral-td">
                    <span class="ral-badge" :class="{ 'ral-badge--cancel': t.willCancel }">{{ rowBadge(t) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </MpModalBody>

      <MpModalFooter>
        <div class="ral-footer">
          <MpButton variant="ghost" is-rounded @click="emit('close')">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="emit('confirm')">Acknowledge & apply</MpButton>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.ral-intro {
  margin: 0 0 var(--mp-spacing-6) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-lg, 20px);
}
.ral-rules {
  margin: 0 0 var(--mp-spacing-6) 0; padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex; flex-direction: column; gap: var(--mp-spacing-1\.5);
  list-style: disc; padding-left: var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-lg, 20px);
}
.ral-group { margin-bottom: var(--mp-spacing-8); }
.ral-group:last-child { margin-bottom: 0; }
.ral-group-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-3);
}
.ral-group-title { display: flex; align-items: baseline; gap: var(--mp-spacing-2); min-width: 0; }
.ral-prod { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ral-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ral-remove { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-secondary); white-space: nowrap; }

.ral-table-wrap { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.ral-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }

.ral-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.ral-th--num { text-align: right; }

.ral-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.ral-tr:last-child .ral-td { border-bottom: none; }
.ral-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

.ral-taskno { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ral-badge { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ral-badge--cancel { color: var(--mp-text-danger, #e2483d); font-weight: var(--mp-font-weights-medium); }

.ral-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
